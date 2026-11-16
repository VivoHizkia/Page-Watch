import { describe, expect, it, vi } from "vitest";
import { USER_AGENT, createFetcher } from "@/fetch";

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

// Answers by URL path and records the order of the requests.
function site(answers: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const answer = answers[new URL(String(url)).pathname];
    return answer ? answer() : new Response("not found", { status: 404 });
  });
}

const requestedPaths = (send: ReturnType<typeof site>) =>
  send.mock.calls.map(([url]) => new URL(String(url)).pathname);

const fetcherFor = (send: ReturnType<typeof site>) => createFetcher({ send, delayMs: 0 });

describe("createFetcher", () => {
  it("checks robots.txt first, then fetches the page with a clear User-Agent", async () => {
    const send = site({
      "/robots.txt": () => new Response("User-agent: *\nDisallow: /private/"),
      "/releases": () => html("<p>content</p>"),
    });

    const text = await fetcherFor(send).fetchPage("https://example.test/releases");

    expect(text).toBe("<p>content</p>");
    expect(requestedPaths(send)).toEqual(["/robots.txt", "/releases"]);
    expect((send.mock.calls[1][1] as RequestInit).headers).toMatchObject({
      "User-Agent": USER_AGENT,
    });
  });

  it("returns null without fetching a page that robots.txt disallows", async () => {
    const send = site({
      "/robots.txt": () => new Response("User-agent: *\nDisallow: /private/"),
      "/private/x": () => html("do not read"),
    });

    expect(await fetcherFor(send).fetchPage("https://example.test/private/x")).toBeNull();
    expect(requestedPaths(send)).toEqual(["/robots.txt"]);
  });

  it("fetches robots.txt only once for several pages on the same site", async () => {
    const send = site({ "/a": () => html("a"), "/b": () => html("b") });
    const fetcher = fetcherFor(send);

    await fetcher.fetchPage("https://example.test/a");
    await fetcher.fetchPage("https://example.test/b");

    expect(requestedPaths(send)).toEqual(["/robots.txt", "/a", "/b"]);
  });

  it("retries when the server is in trouble, then succeeds", async () => {
    let calls = 0;
    const send = site({ "/releases": () => (++calls < 3 ? html("", 503) : html("at last")) });

    expect(await fetcherFor(send).fetchPage("https://example.test/releases")).toBe("at last");
  });

  it("gives up after three failures", async () => {
    const send = site({ "/releases": () => html("", 500) });

    await expect(fetcherFor(send).fetchPage("https://example.test/releases")).rejects.toThrow(
      "HTTP 500",
    );
    expect(requestedPaths(send).filter((path) => path === "/releases")).toHaveLength(3);
  });

  it("does not retry a page that simply does not exist", async () => {
    const send = site({});

    await expect(fetcherFor(send).fetchPage("https://example.test/gone")).rejects.toThrow(
      "HTTP 404",
    );
    expect(requestedPaths(send).filter((path) => path === "/gone")).toHaveLength(1);
  });

  it("refuses files that are not text", async () => {
    const send = site({
      "/file": () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
    });

    await expect(fetcherFor(send).fetchPage("https://example.test/file")).rejects.toThrow(
      "not a text page",
    );
  });
});

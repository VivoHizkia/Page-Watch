import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "@/config";
import type { Fetcher } from "@/fetch";
import { checkAll } from "@/monitor";
import { fileSnapshotStore, type SnapshotStore } from "@/snapshots";

const RELEASES: Page = { name: "Releases", url: "https://example.test/releases", ignore: [] };
const PRICES: Page = { name: "Prices", url: "https://example.test/prices", ignore: [] };

const page = (...lines: string[]) => `<main>${lines.map((l) => `<p>${l}</p>`).join("")}</main>`;

// A fake fetcher whose answer per URL can be swapped between two rounds.
function fakeSite(initial: Record<string, string | null | Error>) {
  const pages = { ...initial };
  const fetcher: Fetcher = {
    async fetchPage(url) {
      const answer = pages[url];
      if (answer instanceof Error) throw answer;
      return answer ?? null;
    },
  };
  return { fetcher, pages };
}

describe("checkAll", () => {
  let folder: string;
  let snapshots: SnapshotStore;

  beforeEach(async () => {
    folder = await mkdtemp(path.join(os.tmpdir(), "page-watch-test-"));
    snapshots = fileSnapshotStore(folder);
  });
  afterEach(() => rm(folder, { recursive: true, force: true }));

  it("saves the first snapshot without reporting a change", async () => {
    const { fetcher } = fakeSite({ [RELEASES.url]: page("Version 24.0", "LTS") });

    const [result] = await checkAll([RELEASES], { fetcher, snapshots, llm: null });

    expect(result).toMatchObject({ status: "new", lineCount: 2 });
    expect(await snapshots.read("Releases")).toEqual(["Version 24.0", "LTS"]);
  });

  it("reports unchanged when the content is the same", async () => {
    const { fetcher } = fakeSite({ [RELEASES.url]: page("Version 24.0") });
    await checkAll([RELEASES], { fetcher, snapshots, llm: null });

    const [result] = await checkAll([RELEASES], { fetcher, snapshots, llm: null });

    expect(result.status).toBe("unchanged");
  });

  it("reports the changed lines and updates the snapshot", async () => {
    const { fetcher, pages } = fakeSite({ [RELEASES.url]: page("Version 24.0", "LTS") });
    await checkAll([RELEASES], { fetcher, snapshots, llm: null });
    pages[RELEASES.url] = page("Version 24.1", "LTS");

    const [result] = await checkAll([RELEASES], { fetcher, snapshots, llm: null });

    expect(result).toMatchObject({
      status: "changed",
      diff: { added: ["Version 24.1"], removed: ["Version 24.0"] },
      summary: "1 line added, 1 line removed.",
    });
    expect(await snapshots.read("Releases")).toEqual(["Version 24.1", "LTS"]);
  });

  it("uses the LLM summary when there is one, and only for pages that changed", async () => {
    const { fetcher, pages } = fakeSite({
      [RELEASES.url]: page("Version 24.0"),
      [PRICES.url]: page("$10"),
    });
    const llm = vi.fn().mockResolvedValue("The version went from 24.0 to 24.1.");
    await checkAll([RELEASES, PRICES], { fetcher, snapshots, llm });
    pages[RELEASES.url] = page("Version 24.1");

    const results = await checkAll([RELEASES, PRICES], { fetcher, snapshots, llm });

    expect(results[0]).toMatchObject({
      status: "changed",
      summary: "The version went from 24.0 to 24.1.",
    });
    expect(results[1].status).toBe("unchanged");
    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm.mock.calls[0][0][1].content).toContain("Version 24.1");
  });

  it("still reports the change when the LLM fails", async () => {
    const { fetcher, pages } = fakeSite({ [RELEASES.url]: page("Version 24.0") });
    const llm = vi.fn().mockRejectedValue(new Error("quota exceeded"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await checkAll([RELEASES], { fetcher, snapshots, llm });
    pages[RELEASES.url] = page("Version 24.1");

    const [result] = await checkAll([RELEASES], { fetcher, snapshots, llm });

    expect(result).toMatchObject({ status: "changed", summary: "1 line added, 1 line removed." });
  });

  it("keeps the old snapshot when a page fails, and carries on with the others", async () => {
    const { fetcher, pages } = fakeSite({
      [RELEASES.url]: page("Version 24.0"),
      [PRICES.url]: page("$10"),
    });
    await checkAll([RELEASES, PRICES], { fetcher, snapshots, llm: null });
    pages[RELEASES.url] = new Error("HTTP 503");
    pages[PRICES.url] = page("$12");

    const results = await checkAll([RELEASES, PRICES], { fetcher, snapshots, llm: null });

    expect(results[0]).toMatchObject({ status: "failed", error: "HTTP 503" });
    expect(results[1].status).toBe("changed");
    expect(await snapshots.read("Releases")).toEqual(["Version 24.0"]);
  });

  it("does not overwrite a snapshot with a page that is suddenly empty", async () => {
    const { fetcher, pages } = fakeSite({ [RELEASES.url]: page("Version 24.0") });
    await checkAll([RELEASES], { fetcher, snapshots, llm: null });
    pages[RELEASES.url] = "<main><script>load()</script></main>";

    const [result] = await checkAll([RELEASES], { fetcher, snapshots, llm: null });

    expect(result).toMatchObject({ status: "failed", error: "page has no text" });
    expect(await snapshots.read("Releases")).toEqual(["Version 24.0"]);
  });

  it("reports a page that robots.txt disallows", async () => {
    const { fetcher } = fakeSite({ [RELEASES.url]: null });
    const [result] = await checkAll([RELEASES], { fetcher, snapshots, llm: null });
    expect(result.status).toBe("disallowed");
  });

  it("reports a failure when the selector no longer matches", async () => {
    const { fetcher } = fakeSite({ [RELEASES.url]: page("Version 24.0") });
    const [result] = await checkAll([{ ...RELEASES, selector: "#table" }], {
      fetcher,
      snapshots,
      llm: null,
    });
    expect(result).toMatchObject({ status: "failed" });
  });
});

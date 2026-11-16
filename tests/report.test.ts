import { describe, expect, it, vi } from "vitest";
import type { PageResult } from "@/monitor";
import { sendTelegram } from "@/notify";
import { escapeMarkdown, markdownReport, shortMessage } from "@/report";
import { plainSummary, summarize } from "@/summarize";

const changed: PageResult = {
  name: "Releases",
  url: "https://example.test/releases",
  status: "changed",
  diff: { added: ["Version 24.1"], removed: ["Version 24.0"] },
  summary: "The version went from 24.0 to 24.1.",
};
const unchanged: PageResult = {
  name: "Prices",
  url: "https://example.test/prices",
  status: "unchanged",
};
const failed: PageResult = {
  name: "Rates",
  url: "https://example.test/rates",
  status: "failed",
  error: "HTTP 503",
};

describe("markdownReport", () => {
  it("contains the counts, the summary and the changed lines", () => {
    const text = markdownReport([changed, unchanged, failed], "2026-11-16");

    expect(text).toContain("# Page watch report 2026-11-16");
    expect(text).toContain("3 pages checked: 1 changed, 1 unchanged, 0 new, 1 failed.");
    expect(text).toContain("The version went from 24.0 to 24.1.");
    expect(text).toContain("- + Version 24.1");
    expect(text).toContain("- - Version 24.0");
    expect(text).toContain("- Rates: HTTP 503");
  });

  it("truncates a long list of lines", () => {
    const many: PageResult = {
      ...changed,
      diff: { added: Array.from({ length: 40 }, (_, i) => `line ${i}`), removed: [] },
    };
    const text = markdownReport([many], "2026-11-16");

    expect(text).toContain("**Added** (40)");
    expect(text).toContain("... and 25 more lines");
    expect(text).not.toContain("line 20");
  });

  it("neutralises Markdown and HTML in text that came from a page", () => {
    expect(escapeMarkdown("<script>alert(1)</script> [click](http://evil) # title")).toBe(
      "\\<script\\>alert(1)\\</script\\> \\[click\\](http://evil) \\# title",
    );
    const hostile: PageResult = {
      ...changed,
      diff: { added: ["<img src=x onerror=alert(1)>"], removed: [] },
    };
    // Every "<" must be preceded by a backslash, so GitHub shows it as text.
    expect(markdownReport([hostile], "2026-11-16")).not.toMatch(/(?<!\\)<img/);
  });
});

describe("shortMessage", () => {
  it("stays silent when nothing changed or failed", () => {
    expect(shortMessage([unchanged], "2026-11-16")).toBeNull();
  });

  it("mentions the pages that changed and the ones that failed", () => {
    const message = shortMessage([changed, unchanged, failed], "2026-11-16");

    expect(message).toContain("The version went from 24.0 to 24.1.");
    expect(message).toContain("https://example.test/releases");
    expect(message).toContain("- Rates: HTTP 503");
    expect(message).not.toContain("Prices");
  });
});

describe("summarize", () => {
  const diff = { added: ["a", "b"], removed: [] };

  it("counts lines when there is no LLM", async () => {
    expect(await summarize("Releases", diff, null)).toBe("2 lines added.");
    expect(plainSummary({ added: ["a"], removed: ["b", "c"] })).toBe(
      "1 line added, 2 lines removed.",
    );
  });

  it("keeps the first paragraph of the LLM reply and tidies its whitespace", async () => {
    const llm = vi.fn().mockResolvedValue("Two new\n lines appeared.\n\nA long explanation.");
    expect(await summarize("Releases", diff, llm)).toBe("Two new lines appeared.");
  });

  it("sends at most 40 lines to the LLM", async () => {
    const llm = vi.fn().mockResolvedValue("ok");
    const added = Array.from({ length: 100 }, (_, i) => `line-${i}`);
    await summarize("Releases", { added, removed: [] }, llm);

    const content = llm.mock.calls[0][0][1].content as string;
    expect(content).toContain("line-39");
    expect(content).not.toContain("line-40");
    expect(content).toContain("(and 60 more lines)");
  });
});

describe("sendTelegram", () => {
  const options = { token: "123:SECRET", chatId: "42" };

  it("sends plain text to the chosen chat", async () => {
    const send = vi.fn().mockResolvedValue(new Response("{}"));

    expect(await sendTelegram("hello", { ...options, send })).toEqual({ sent: true });

    const [url, init] = send.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123:SECRET/sendMessage");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ chat_id: "42", text: "hello" });
    expect(body.parse_mode).toBeUndefined();
  });

  it("truncates a message that is over Telegram's limit", async () => {
    const send = vi.fn().mockResolvedValue(new Response("{}"));
    await sendTelegram("x".repeat(9000), { ...options, send });
    expect(JSON.parse(send.mock.calls[0][1].body).text.length).toBeLessThanOrEqual(4000);
  });

  it("reports a failure without leaking the token", async () => {
    const rejected = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    expect(await sendTelegram("hello", { ...options, send: rejected })).toEqual({
      sent: false,
      error: "Telegram answered 401",
    });

    const dropped = vi
      .fn()
      .mockRejectedValue(new TypeError("fetch failed: https://api.telegram.org/bot123:SECRET/x"));
    const result = await sendTelegram("hello", { ...options, send: dropped });
    expect(result.sent).toBe(false);
    expect(result.error).not.toContain("SECRET");
  });
});

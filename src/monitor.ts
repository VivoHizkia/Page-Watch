import type { Page } from "./config";
import { extractContent } from "./content";
import { diffLines, hasChanges, type Diff } from "./diff";
import type { Fetcher } from "./fetch";
import type { LlmCall } from "./llm";
import type { SnapshotStore } from "./snapshots";
import { summarize } from "./summarize";

// One round of checks: fetch each page, compare it with the last snapshot, save the new one.
// Everything that touches the outside world (network, files, LLM) is passed in, so the flow
// can be tested without a network.

export type PageResult = { name: string; url: string } & (
  | { status: "new"; lineCount: number }
  | { status: "unchanged" }
  | { status: "changed"; diff: Diff; summary: string }
  | { status: "disallowed" }
  | { status: "failed"; error: string }
);

export type Dependencies = {
  fetcher: Fetcher;
  snapshots: SnapshotStore;
  // null means no LLM: summaries are plain line counts.
  llm: LlmCall | null;
};

async function checkPage(page: Page, deps: Dependencies): Promise<PageResult> {
  const base = { name: page.name, url: page.url };

  try {
    const html = await deps.fetcher.fetchPage(page.url);
    if (html === null) return { ...base, status: "disallowed" };

    const { lines } = extractContent(html, page.selector, page.ignore);
    // A page that is suddenly empty nearly always means trouble (an error page, content that
    // is rendered by JavaScript), not content that was really removed. Keep the old snapshot.
    if (lines.length === 0) return { ...base, status: "failed", error: "page has no text" };

    const previous = await deps.snapshots.read(page.name);
    if (previous === null) {
      await deps.snapshots.write(page.name, lines);
      return { ...base, status: "new", lineCount: lines.length };
    }

    const diff = diffLines(previous, lines);
    if (!hasChanges(diff)) return { ...base, status: "unchanged" };

    const summary = await summarize(page.name, diff, deps.llm);
    await deps.snapshots.write(page.name, lines);
    return { ...base, status: "changed", diff, summary };
  } catch (err) {
    // One broken page must not stop the others.
    return { ...base, status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

// In sequence, not in parallel: the fetcher spaces the requests out.
export async function checkAll(pages: Page[], deps: Dependencies): Promise<PageResult[]> {
  const results: PageResult[] = [];
  for (const page of pages) results.push(await checkPage(page, deps));
  return results;
}

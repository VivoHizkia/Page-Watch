import type { PageResult } from "./monitor";

// Two reports from the same results: Markdown to keep in the repository, and a short text for
// the Telegram message.

const MAX_REPORT_LINES = 15;

type Changed = Extract<PageResult, { status: "changed" }>;

export const changedPages = (results: PageResult[]) =>
  results.filter((result): result is Changed => result.status === "changed");

export const failedPages = (results: PageResult[]) =>
  results.filter((result) => result.status === "failed" || result.status === "disallowed");

// Text from somebody else's page ends up in a Markdown file that GitHub renders, so characters
// with a meaning in Markdown or HTML are neutralised.
export const escapeMarkdown = (text: string) =>
  text.replace(/[\\`*_{}[\]<>#|~]/g, "\\$&").replace(/&/g, "&amp;");

function lineList(title: string, mark: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  const shown = lines.slice(0, MAX_REPORT_LINES).map((line) => `- ${mark} ${escapeMarkdown(line)}`);
  const rest = lines.length - MAX_REPORT_LINES;
  return [
    `**${title}** (${lines.length})`,
    "",
    ...shown,
    ...(rest > 0 ? [`- ... and ${rest} more lines`] : []),
    "",
  ];
}

function failureReason(result: PageResult): string {
  if (result.status === "disallowed") return "disallowed by robots.txt";
  return result.status === "failed" ? result.error : "";
}

export function markdownReport(results: PageResult[], date: string): string {
  const changed = changedPages(results);
  const failed = failedPages(results);
  const added = results.filter((result) => result.status === "new");
  const unchanged = results.filter((result) => result.status === "unchanged");

  const out: string[] = [
    `# Page watch report ${date}`,
    "",
    `${results.length} pages checked: ${changed.length} changed, ${unchanged.length} unchanged, ${added.length} new, ${failed.length} failed.`,
    "",
  ];

  for (const result of changed) {
    out.push(`## ${escapeMarkdown(result.name)}`, "", `<${result.url}>`, "");
    out.push(escapeMarkdown(result.summary), "");
    out.push(...lineList("Added", "+", result.diff.added));
    out.push(...lineList("Removed", "-", result.diff.removed));
  }

  if (added.length > 0) {
    out.push("## Newly watched", "");
    for (const result of added) {
      if (result.status !== "new") continue;
      out.push(
        `- ${escapeMarkdown(result.name)}: ${result.lineCount} lines saved as the first snapshot`,
      );
    }
    out.push("");
  }

  if (failed.length > 0) {
    out.push("## Failed checks", "");
    for (const result of failed) {
      out.push(`- ${escapeMarkdown(result.name)}: ${escapeMarkdown(failureReason(result))}`);
    }
    out.push("");
  }

  return `${out.join("\n").trimEnd()}\n`;
}

// The short message. null when there is nothing worth telling: a monitor that says "nothing
// changed" every day gets muted quickly.
export function shortMessage(results: PageResult[], date: string): string | null {
  const changed = changedPages(results);
  const failed = failedPages(results);
  if (changed.length === 0 && failed.length === 0) return null;

  const out: string[] = [`Page Watch, ${date}`, ""];
  for (const result of changed) out.push(result.name, result.summary, result.url, "");
  if (failed.length > 0) {
    out.push("Failed checks:");
    for (const result of failed) out.push(`- ${result.name}: ${failureReason(result)}`);
  }
  return out.join("\n").trim();
}

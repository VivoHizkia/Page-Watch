// Runs one round of checks.
//
//   npm run check
//
// Reads watch.config.json, updates snapshots/, writes reports/<date>.md when something
// changed, and sends a Telegram message when that is configured.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConfigError, readConfig } from "../src/config";
import { createFetcher } from "../src/fetch";
import { callLlm, hasLlmKey } from "../src/llm";
import { checkAll, type PageResult } from "../src/monitor";
import { sendTelegram, telegramFromEnv } from "../src/notify";
import { changedPages, markdownReport, shortMessage } from "../src/report";
import { fileSnapshotStore } from "../src/snapshots";

const ROOT = path.resolve(import.meta.dirname, "..");

const LABEL: Record<PageResult["status"], string> = {
  new: "now watched",
  unchanged: "unchanged",
  changed: "CHANGED",
  disallowed: "disallowed by robots.txt",
  failed: "FAILED",
};

async function main() {
  const config = await readConfig(path.join(ROOT, "watch.config.json"));
  if (!hasLlmKey()) console.log("LLM_API_KEY is not set: summaries are plain line counts.\n");

  const results = await checkAll(config.pages, {
    fetcher: createFetcher(),
    snapshots: fileSnapshotStore(path.join(ROOT, "snapshots")),
    llm: hasLlmKey() ? callLlm : null,
  });

  for (const result of results) {
    const detail =
      result.status === "changed"
        ? `: ${result.summary}`
        : result.status === "failed"
          ? `: ${result.error}`
          : "";
    console.log(`${result.name} -> ${LABEL[result.status]}${detail}`);
  }

  const date = new Date().toISOString().slice(0, 10);

  if (changedPages(results).length > 0) {
    const file = path.join(ROOT, "reports", `${date}.md`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, markdownReport(results, date));
    console.log(`\nReport written to reports/${date}.md`);
  }

  const message = shortMessage(results, date);
  const telegram = telegramFromEnv();
  if (message && telegram) {
    const outcome = await sendTelegram(message, telegram);
    console.log(outcome.sent ? "Telegram message sent." : `Telegram failed: ${outcome.error}`);
  }

  // One site being down is no reason to fail the whole round. If every page failed the
  // problem is most likely on our side, and that should show up red.
  if (results.every((result) => result.status === "failed")) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
});

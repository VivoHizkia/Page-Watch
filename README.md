# Page Watch

Checks a list of web pages once a day and tells you what changed: which lines were added, which were removed, and a one or two sentence summary.

There is no server and no database. GitHub Actions runs the check, and each page's snapshot is a plain text file in this repository, so the commit history of `snapshots/` is the change history of the pages.

## Example output

```
Node.js releases -> CHANGED: The maintenance end date for version 26 Lithium changed from ...
Supported PHP versions -> unchanged
Python downloads -> unchanged

Report written to reports/2026-11-16.md
```

The full report is in [docs/example-report.md](docs/example-report.md). That example was produced by editing two lines of a snapshot by hand before running the check, so that there was a change to report.

## How it works

```
watch.config.json
      |
      v
robots.txt is checked -> page is fetched (1.1 s between requests, clear User-Agent)
      |
      v
HTML -> text lines of the main content (menus, footer, scripts removed; "ignore" patterns applied)
      |
      v
compared with snapshots/<name>.txt
      |
      +-- same -------> done
      |
      +-- changed ----> summary (LLM, or a line count when no key is set)
                        -> snapshot updated
                        -> reports/<date>.md
                        -> Telegram message (when configured)
```

| File               | Job                                                                |
| ------------------ | ------------------------------------------------------------------ |
| `src/config.ts`    | Reads and validates `watch.config.json`                            |
| `src/robots.ts`    | Reads robots.txt and decides whether a URL may be fetched          |
| `src/fetch.ts`     | Fetches pages: delay, retries, size limit, one robots.txt per site |
| `src/content.ts`   | Turns HTML into text lines worth comparing                         |
| `src/diff.ts`      | Finds added and removed lines (longest common subsequence)         |
| `src/snapshots.ts` | Reads and writes snapshots                                         |
| `src/summarize.ts` | Summarises a change, with or without an LLM                        |
| `src/monitor.ts`   | The flow of one round of checks                                    |
| `src/report.ts`    | The Markdown report and the short message                          |
| `src/notify.ts`    | Sends to Telegram                                                  |
| `scripts/check.ts` | Entry point for `npm run check`                                    |

## Adding a page

Edit `watch.config.json`:

```json
{
  "pages": [
    {
      "name": "Node.js releases",
      "url": "https://nodejs.org/en/about/previous-releases"
    },
    {
      "name": "Python downloads",
      "url": "https://www.python.org/downloads/",
      "selector": ".download-list-widget",
      "ignore": ["^Last updated"]
    }
  ]
}
```

| Field      | Use                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | Shown in reports and used for the snapshot file name. Must be unique.                                                                  |
| `url`      | The page address. `http` and `https` only.                                                                                             |
| `selector` | Optional. CSS selector for the part to watch. Without it `<main>` or `<article>` is used, then `<body>`.                               |
| `ignore`   | Optional. A list of regular expressions. Matching lines are dropped before comparing, for example an update time or a visitor counter. |

The first round for a new page only saves a snapshot. Changes are reported from the second round on.

## Running it

Requires Node 20 or later.

```bash
npm install
npm run check
```

With no configuration at all the monitor still runs, and summaries are line counts ("2 lines added, 1 line removed"). For written summaries and Telegram messages, copy `.env.example` to `.env.local` and fill it in.

| Command             | Use                           |
| ------------------- | ----------------------------- |
| `npm run check`     | One round of checks           |
| `npm test`          | 53 tests, no network needed   |
| `npm run typecheck` | Type check                    |
| `npm run format`    | Format the code with Prettier |

## Running it on GitHub

`.github/workflows/watch.yml` runs every day at 00:23 UTC, or at any time through the **Run workflow** button on the Actions tab. When there are new snapshots or a new report, the workflow commits them.

Secrets to set under Settings > Secrets and variables > Actions, all optional:

| Secret               | Use                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `LLM_API_KEY`        | Written summaries. A free key is available from [Google AI Studio](https://aistudio.google.com/apikey). |
| `TELEGRAM_BOT_TOKEN` | The bot token from @BotFather                                                                           |
| `TELEGRAM_CHAT_ID`   | Where the message goes                                                                                  |

A Telegram message is sent only when a page changed or a check failed. A day without changes produces no message.

## Crawling manners

- Only the URLs written in the config are fetched. Links inside a page are never followed.
- robots.txt is read first, and a disallowed page is reported as "disallowed" instead of being fetched.
- The User-Agent names the crawler and says what it is for.
- About one second between requests, and at most three attempts per page.
- Once a day. Do not speed the schedule up for sites you do not own.

## Safeguards

- **A snapshot is never overwritten by a broken page.** If a page cannot be fetched, is suddenly empty, or its selector no longer matches, the result is "failed" and the old snapshot is kept. Without this, one server hiccup would be reported as "all content removed", followed the next day by "all content added".
- **One broken page does not stop the others.** A round only counts as failed when every page failed.
- **Page text is treated as data.** The prompt tells the model to ignore instructions inside the page, Markdown and HTML characters are escaped before they reach a report, and Telegram messages are sent as plain text.
- **The Telegram token never reaches the logs**, including when sending fails.

## Limitations

- **Pages that render their content with JavaScript cannot be read.** The monitor fetches the HTML as served and does not run a browser. Such pages are reported as "page has no text".
- **The LLM summary sees only the changed lines**, without column headings or the surrounding paragraphs, so it sometimes misreads what a number means. In the example report it calls the "Last updated" column a "maintenance end date". The list of lines under the summary is always verbatim.
- **Comparison is per line.** One changed word in a long paragraph is reported as the whole paragraph removed and added again.
- **Text only.** Images and files are not watched.
- **Scheduled commits are made by a bot account**, so they do not count as contributions on the repository owner's profile.

## License

[MIT](LICENSE)

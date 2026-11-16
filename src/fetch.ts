import { isAllowed, parseRobots, type RobotsRule } from "./robots";

// Polite page fetching: it identifies itself, obeys robots.txt, pauses between requests and
// refuses to download huge files.

export const CRAWLER_NAME = "PageWatch";
export const USER_AGENT = `${CRAWLER_NAME}/1.0 (page change monitor; obeys robots.txt)`;

const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_SIZE = 3 * 1024 * 1024;

export class FetchError extends Error {}

export type Fetcher = {
  // null means robots.txt disallows the page.
  fetchPage(url: string): Promise<string | null>;
};

export type FetcherOptions = {
  send?: typeof fetch;
  // Pause before every request after the first, and the base for retry back-off.
  delayMs?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createFetcher(options: FetcherOptions = {}): Fetcher {
  const send = options.send ?? fetch;
  const delayMs = options.delayMs ?? 1_100;
  // One robots.txt per site, fetched once for every page on that site.
  const robots = new Map<string, Promise<RobotsRule[]>>();
  let requested = false;

  async function request(url: string): Promise<Response> {
    if (requested) await sleep(delayMs);
    requested = true;
    return send(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain;q=0.9" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
  }

  async function rulesFor(url: string): Promise<RobotsRule[]> {
    const origin = new URL(url).origin;
    let pending = robots.get(origin);
    if (!pending) {
      pending = request(`${origin}/robots.txt`)
        // No robots.txt (404) means nothing is disallowed.
        .then(async (res) => (res.ok ? parseRobots(await res.text(), CRAWLER_NAME) : []))
        // If robots.txt cannot be reached the page most likely cannot either; let the page
        // request report the error.
        .catch(() => []);
      robots.set(origin, pending);
    }
    return pending;
  }

  async function fetchText(url: string): Promise<string> {
    let error = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await request(url);
        if (!res.ok) {
          error = `HTTP ${res.status}`;
          // A 4xx other than 429 will not change on a retry.
          if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
        } else {
          const type = res.headers.get("content-type") ?? "";
          if (type && !/text\/|html|xml/i.test(type)) {
            throw new FetchError(`not a text page (${type.split(";")[0]})`);
          }
          const text = await res.text();
          if (text.length > MAX_SIZE) throw new FetchError("page is larger than 3 MB");
          return text;
        }
      } catch (err) {
        if (err instanceof FetchError) throw err;
        error = err instanceof Error ? err.message : String(err);
      }
      // Wait longer after each failure.
      if (attempt < MAX_ATTEMPTS) await sleep(delayMs * attempt * 2);
    }
    throw new FetchError(error);
  }

  return {
    async fetchPage(url) {
      if (!isAllowed(await rulesFor(url), url)) return null;
      return fetchText(url);
    },
  };
}

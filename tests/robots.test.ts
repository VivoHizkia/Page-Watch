import { describe, expect, it } from "vitest";
import { isAllowed, parseRobots } from "@/robots";

const CRAWLER = "PageWatch";
const ALLOWED_URL = "https://example.test/articles/new-release";

describe("robots.txt", () => {
  it("allows ordinary pages and blocks disallowed paths", () => {
    const rules = parseRobots(
      ["User-agent: *", "User-agent: GPTBot", "Allow: /", "Disallow: /admin/"].join("\n"),
      CRAWLER,
    );
    expect(isAllowed(rules, ALLOWED_URL)).toBe(true);
    expect(isAllowed(rules, "https://example.test/admin/login")).toBe(false);
  });

  it("uses the crawler's own group instead of the wildcard group when there is one", () => {
    const rules = parseRobots(
      ["User-agent: *", "Disallow: /", "", `User-agent: ${CRAWLER}`, "Allow: /"].join("\n"),
      CRAWLER,
    );
    expect(isAllowed(rules, ALLOWED_URL)).toBe(true);
  });

  it("lets the longest pattern win, and Allow on a tie", () => {
    const rules = parseRobots(
      [
        "User-agent: *",
        "Disallow: /articles/",
        "Allow: /articles/new",
        "Disallow: /x",
        "Allow: /x",
      ].join("\n"),
      CRAWLER,
    );
    expect(isAllowed(rules, ALLOWED_URL)).toBe(true);
    expect(isAllowed(rules, "https://example.test/articles/other")).toBe(false);
    expect(isAllowed(rules, "https://example.test/x")).toBe(true);
  });

  it("understands the star and the trailing dollar sign in patterns", () => {
    const rules = parseRobots(["User-agent: *", "Disallow: /*.pdf$"].join("\n"), CRAWLER);
    expect(isAllowed(rules, "https://example.test/files/report.pdf")).toBe(false);
    expect(isAllowed(rules, "https://example.test/files/report.pdf?download=1")).toBe(true);
  });

  it("ignores comments and allows everything when robots.txt has no rules", () => {
    expect(isAllowed(parseRobots("# nothing here\n", CRAWLER), ALLOWED_URL)).toBe(true);
  });
});

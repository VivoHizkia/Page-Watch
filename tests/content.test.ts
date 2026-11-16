import { describe, expect, it } from "vitest";
import { ContentError, extractContent } from "@/content";

const PAGE = `<!doctype html>
<html>
  <head><title>  Latest   releases </title><style>p { color: red }</style></head>
  <body>
    <header><a href="/">Home</a></header>
    <nav><ul><li>Menu one</li></ul></nav>
    <main>
      <h1>Release list</h1>
      <p>Version <strong>24</strong> is the current
         <a href="/lts">LTS</a> release.</p>
      <ul><li>Item one</li><li>Item two</li></ul>
      <table>
        <tr><th>Version</th><th>Date</th></tr>
        <tr><td>24.1</td><td>3 Nov 2026</td></tr>
      </table>
      <p>Last updated 16 November 2026 at 10:00</p>
      <script>console.log("leave me out")</script>
    </main>
    <aside>Advert</aside>
    <footer>Copyright</footer>
  </body>
</html>`;

describe("extractContent", () => {
  it("returns the main content line by line, without menus, footer, scripts or styles", () => {
    const { title, lines } = extractContent(PAGE);

    expect(title).toBe("Latest releases");
    expect(lines).toEqual([
      "Release list",
      "Version 24 is the current LTS release.",
      "Item one",
      "Item two",
      "Version | Date",
      "24.1 | 3 Nov 2026",
      "Last updated 16 November 2026 at 10:00",
    ]);
  });

  it("limits itself to the selected part", () => {
    expect(extractContent(PAGE, "table").lines).toEqual(["Version | Date", "24.1 | 3 Nov 2026"]);
  });

  it("fails loudly when the selector is not found", () => {
    expect(() => extractContent(PAGE, "#missing")).toThrow(ContentError);
  });

  it("drops lines that match an ignore pattern", () => {
    const { lines } = extractContent(PAGE, undefined, ["^last updated"]);
    expect(lines.at(-1)).toBe("24.1 | 3 Nov 2026");
  });

  it("falls back to body when the page has no main or article", () => {
    expect(extractContent("<body><div>One</div><div>Two</div></body>").lines).toEqual([
      "One",
      "Two",
    ]);
  });

  it("returns no lines for a page without text", () => {
    expect(extractContent("<body><script>render()</script></body>").lines).toEqual([]);
  });
});

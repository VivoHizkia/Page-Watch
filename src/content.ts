import * as cheerio from "cheerio";

// Turns HTML into a list of text lines worth comparing. Menus, footers, scripts and ads are
// removed so that changes there are not reported as content changes.

const REMOVE = "script, style, noscript, template, svg, iframe, nav, header, footer, aside, form";

// Elements that start a new line. Text inside any other element (a, span, strong...) stays on
// the line it sits in.
const BLOCK = new Set([
  "address",
  "article",
  "blockquote",
  "br",
  "caption",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "tfoot",
  "thead",
  "tr",
  "ul",
]);

// Table cells are joined with " | " so one table row stays one line of text.
const CELL = new Set(["td", "th"]);

export type Content = { title: string; lines: string[] };

export class ContentError extends Error {}

export function extractContent(html: string, selector?: string, ignore: string[] = []): Content {
  const $ = cheerio.load(html);
  const title = $("title").first().text().replace(/\s+/g, " ").trim();
  $(REMOVE).remove();

  let root = selector ? $(selector) : $("main, [role=main], article").first();
  if (selector && root.length === 0) {
    // A selector that no longer matches usually means the page was redesigned. Failing loudly
    // beats reporting "all content removed".
    throw new ContentError(`selector "${selector}" was not found on the page`);
  }
  if (root.length === 0) root = $("body");

  const lines: string[] = [];
  let current = "";
  const endLine = () => {
    const clean = current.replace(/\s+/g, " ").trim();
    if (clean) lines.push(clean);
    current = "";
  };

  const walk = (node: cheerio.Cheerio<any>) => {
    node.contents().each((_, child) => {
      if (child.type === "text") {
        current += child.data;
        return;
      }
      if (child.type !== "tag") return;

      const name = child.name.toLowerCase();
      const block = BLOCK.has(name);
      if (block) endLine();
      if (CELL.has(name) && current.trim()) current += " | ";
      walk($(child));
      if (block) endLine();
    });
  };
  root.each((_, element) => walk($(element)));
  endLine();

  const patterns = ignore.map((pattern) => new RegExp(pattern, "i"));
  return {
    title,
    lines: lines.filter((line) => !patterns.some((regex) => regex.test(line))),
  };
}

import { describe, expect, it } from "vitest";
import { markdownToStorage } from "../src/confluence/markdown-to-storage.js";

describe("markdownToStorage", () => {
  it("converts headings", () => {
    expect(markdownToStorage("# Title\n## Subtitle")).toBe("<h1>Title</h1>\n<h2>Subtitle</h2>");
  });

  it("converts an unordered list", () => {
    expect(markdownToStorage("- one\n- two")).toBe("<ul>\n<li>one</li>\n<li>two</li>\n</ul>");
  });

  it("converts an ordered list", () => {
    expect(markdownToStorage("1. one\n2. two")).toBe("<ol>\n<li>one</li>\n<li>two</li>\n</ol>");
  });

  it("converts a fenced code block with language", () => {
    const result = markdownToStorage("```bash\ncomposer install\n```");
    expect(result).toContain('<ac:parameter ac:name="language">bash</ac:parameter>');
    expect(result).toContain("<![CDATA[composer install]]>");
  });

  it("converts a plain paragraph and escapes HTML-significant characters", () => {
    expect(markdownToStorage("A <b> & tag")).toBe("<p>A &lt;b&gt; &amp; tag</p>");
  });

  it("flushes a list before a following heading", () => {
    const result = markdownToStorage("- item\n# Heading");
    expect(result).toBe("<ul>\n<li>item</li>\n</ul>\n<h1>Heading</h1>");
  });
});

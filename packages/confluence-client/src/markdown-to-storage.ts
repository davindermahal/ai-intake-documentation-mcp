/**
 * Minimal markdown -> Confluence storage-format (XHTML-ish) converter. Covers exactly what guides
 * need: headings, unordered/ordered lists, fenced code blocks, and plain paragraphs — not general
 * CommonMark. Anything else (bold, links, inline code, tables) passes through as escaped paragraph
 * text.
 *
 * Consecutive non-blank paragraph lines are soft-wrapped into a single <p>, joined by a space —
 * matching CommonMark's treatment of a single newline inside a paragraph. A blank line (or a
 * heading/list/fence starting) ends the paragraph. Without this, a source file that hard-wraps
 * prose at ~80-100 columns produces one <p> per wrapped line, which Confluence renders with a
 * paragraph gap between every line instead of one flowing paragraph. Note: CommonMark's hard-break
 * signal (a line ending in two or more trailing spaces, meant to force a <br>) is not recognized —
 * trailing whitespace is trimmed like any other, so a hard-break line joins like a soft one.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function markdownToStorage(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushList = () => {
    if (!list) return;
    out.push(`<${list.type}>`);
    for (const item of list.items) out.push(`<li>${escapeHtml(item)}</li>`);
    out.push(`</${list.type}>`);
    list = null;
  };

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    out.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushParagraph();
      flushList();
      const language = fence[1] || "none";
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip closing fence, if present
      out.push(
        `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">${escapeHtml(
          language
        )}</ac:parameter><ac:plain-text-body><![CDATA[${code.join("\n")}]]></ac:plain-text-body></ac:structured-macro>`
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${escapeHtml(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    const ulItem = line.match(/^[-*]\s+(.*)$/);
    if (ulItem) {
      flushParagraph();
      if (list && list.type !== "ul") flushList();
      if (!list) list = { type: "ul", items: [] };
      list.items.push(ulItem[1]);
      i++;
      continue;
    }

    const olItem = line.match(/^\d+\.\s+(.*)$/);
    if (olItem) {
      flushParagraph();
      if (list && list.type !== "ol") flushList();
      if (!list) list = { type: "ol", items: [] };
      list.items.push(olItem[1]);
      i++;
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      i++;
      continue;
    }

    flushList();
    paragraph.push(line.trim());
    i++;
  }
  flushParagraph();
  flushList();
  return out.join("\n");
}

/**
 * Minimal markdown -> Confluence storage-format (XHTML-ish) converter. Covers exactly what guides
 * need: headings, unordered/ordered lists, fenced code blocks, and plain paragraphs — not general
 * CommonMark. Anything else (bold, links, inline code, tables) passes through as escaped paragraph
 * text.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function markdownToStorage(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    out.push(`<${list.type}>`);
    for (const item of list.items) out.push(`<li>${escapeHtml(item)}</li>`);
    out.push(`</${list.type}>`);
    list = null;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
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
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${escapeHtml(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    const ulItem = line.match(/^[-*]\s+(.*)$/);
    if (ulItem) {
      if (list && list.type !== "ul") flushList();
      if (!list) list = { type: "ul", items: [] };
      list.items.push(ulItem[1]);
      i++;
      continue;
    }

    const olItem = line.match(/^\d+\.\s+(.*)$/);
    if (olItem) {
      if (list && list.type !== "ol") flushList();
      if (!list) list = { type: "ol", items: [] };
      list.items.push(olItem[1]);
      i++;
      continue;
    }

    if (line.trim() === "") {
      flushList();
      i++;
      continue;
    }

    flushList();
    out.push(`<p>${escapeHtml(line)}</p>`);
    i++;
  }
  flushList();
  return out.join("\n");
}

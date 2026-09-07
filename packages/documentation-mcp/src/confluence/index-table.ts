/**
 * Parses/serializes the shared guide index page's table (Title | Description | Link | Tags,
 * flat, leaf-content-only links — see the curated-guide-retrieval plan's Key decision #1 in
 * ai-intake-mcp). Both repos independently implement a reader/writer for this exact shape; keep
 * this literal and simple rather than clever, so the two stay in agreement.
 */

export interface GuideIndexRow {
  title: string;
  description: string;
  link: string;
  tags: string[];
  /**
   * ISO date (YYYY-MM-DD) the row was last upserted by sync_guide. Always present (never
   * undefined) so every row has a consistent shape -- empty string means "not yet touched since
   * this column was introduced," not "unknown due to a parse error."
   */
  lastModified: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Confluence's storage format doesn't just escape XML metacharacters -- it also autoformats plain
 * Unicode typographic characters (an arrow typed as "->": found live, real Confluence Cloud
 * behavior, not a hypothetical) into named HTML entities on save. Decoding only &amp;/&lt;/&gt;
 * left those as literal "&rarr;" text on read-back. Numeric refs are decoded generically; the named
 * list covers what's actually been observed plus Confluence's other common autoformat targets.
 */
function unescapeHtml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&rarr;/g, "→")
    .replace(/&larr;/g, "←")
    .replace(/&harr;/g, "↔")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rsquo;/g, "’")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return unescapeHtml(s.replace(/<[^>]*>/g, "")).trim();
}

const ROW_RE = /<tr>([\s\S]*?)<\/tr>/g;
const CELL_RE = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;

/**
 * Skips the header row; tolerates a table with only a header (i.e. zero guides). Also tolerates a
 * legacy 4-column table (no Last Modified cell yet, from before this column existed) -- the 5th
 * cell is read positionally when present, defaulting to "" when it isn't, rather than requiring an
 * exact column count. Whichever shape is read, serializeIndexTable always writes back 5 columns,
 * so a single sync_guide/ensure_guide_index call against an old page upgrades it in place.
 */
export function parseIndexTable(storageBody: string): GuideIndexRow[] {
  const rows: GuideIndexRow[] = [];
  const rowMatches = [...storageBody.matchAll(ROW_RE)];
  for (const rowMatch of rowMatches.slice(1)) {
    const cells = [...rowMatch[1].matchAll(CELL_RE)].map((m) => m[1]);
    if (cells.length < 4) continue;
    const [titleCell, descriptionCell, linkCell, tagsCell, lastModifiedCell] = cells;
    const hrefMatch = linkCell.match(/href="([^"]*)"/);
    rows.push({
      title: stripTags(titleCell),
      description: stripTags(descriptionCell),
      link: hrefMatch ? unescapeHtml(hrefMatch[1]) : stripTags(linkCell),
      tags: stripTags(tagsCell)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      lastModified: lastModifiedCell !== undefined ? stripTags(lastModifiedCell) : "",
    });
  }
  return rows;
}

export function serializeIndexTable(rows: GuideIndexRow[]): string {
  const headerRow = "<tr><th>Title</th><th>Description</th><th>Link</th><th>Tags</th><th>Last Modified</th></tr>";
  const dataRows = rows.map((row) => {
    const link = `<a href="${escapeHtml(row.link)}">${escapeHtml(row.link)}</a>`;
    return `<tr><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.description)}</td><td>${link}</td><td>${escapeHtml(
      row.tags.join(", ")
    )}</td><td>${escapeHtml(row.lastModified)}</td></tr>`;
  });
  return `<table><tbody>${[headerRow, ...dataRows].join("")}</tbody></table>`;
}

/** Replaces the row on an exact title match, else appends (Key decision #4 — no separate guide id). */
export function upsertIndexRow(rows: GuideIndexRow[], newRow: GuideIndexRow): GuideIndexRow[] {
  const idx = rows.findIndex((r) => r.title === newRow.title);
  if (idx === -1) return [...rows, newRow];
  const copy = [...rows];
  copy[idx] = newRow;
  return copy;
}

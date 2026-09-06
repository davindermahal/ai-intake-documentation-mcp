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
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeHtml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return unescapeHtml(s.replace(/<[^>]*>/g, "")).trim();
}

const ROW_RE = /<tr>([\s\S]*?)<\/tr>/g;
const CELL_RE = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;

/** Skips the header row; tolerates a table with only a header (i.e. zero guides). */
export function parseIndexTable(storageBody: string): GuideIndexRow[] {
  const rows: GuideIndexRow[] = [];
  const rowMatches = [...storageBody.matchAll(ROW_RE)];
  for (const rowMatch of rowMatches.slice(1)) {
    const cells = [...rowMatch[1].matchAll(CELL_RE)].map((m) => m[1]);
    if (cells.length < 4) continue;
    const [titleCell, descriptionCell, linkCell, tagsCell] = cells;
    const hrefMatch = linkCell.match(/href="([^"]*)"/);
    rows.push({
      title: stripTags(titleCell),
      description: stripTags(descriptionCell),
      link: hrefMatch ? unescapeHtml(hrefMatch[1]) : stripTags(linkCell),
      tags: stripTags(tagsCell)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
  }
  return rows;
}

export function serializeIndexTable(rows: GuideIndexRow[]): string {
  const headerRow = "<tr><th>Title</th><th>Description</th><th>Link</th><th>Tags</th></tr>";
  const dataRows = rows.map((row) => {
    const link = `<a href="${escapeHtml(row.link)}">${escapeHtml(row.link)}</a>`;
    return `<tr><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.description)}</td><td>${link}</td><td>${escapeHtml(
      row.tags.join(", ")
    )}</td></tr>`;
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

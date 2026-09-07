import { describe, expect, it } from "vitest";
import { parseIndexTable, serializeIndexTable, upsertIndexRow, type GuideIndexRow } from "../src/confluence/index-table.js";

const rows: GuideIndexRow[] = [
  { title: "Symfony 4→5 Upgrade", description: "Steps for upgrading 4.4 apps to 5.x", link: "https://confluence.example.com/pages/1", tags: ["symfony", "upgrade"], lastModified: "2026-09-06" },
  { title: "Company Conventions", description: "Coding standards", link: "https://confluence.example.com/pages/2", tags: ["always"], lastModified: "" },
];

describe("index-table", () => {
  it("round-trips serialize -> parse", () => {
    const storage = serializeIndexTable(rows);
    expect(parseIndexTable(storage)).toEqual(rows);
  });

  it("serializes an empty table (just the header) for a brand-new index page", () => {
    const storage = serializeIndexTable([]);
    expect(parseIndexTable(storage)).toEqual([]);
    expect(storage).toContain("<th>Title</th>");
    expect(storage).toContain("<th>Last Modified</th>");
  });

  it("skips the header row when parsing", () => {
    const storage = serializeIndexTable(rows);
    const headerCount = (storage.match(/<th>/g) ?? []).length;
    expect(headerCount).toBe(5);
    expect(parseIndexTable(storage)).toHaveLength(2);
  });

  it("decodes named/numeric HTML entities Confluence introduces on save (found live, real Cloud instance)", () => {
    const storage =
      "<table><tbody><tr><th>Title</th><th>Description</th><th>Link</th><th>Tags</th><th>Last Modified</th></tr>" +
      '<tr><td>Symfony 4&rarr;5 Upgrade</td><td>An em&mdash;dash &amp; a numeric ref: &#8594;</td>' +
      '<td><a href="https://x/pages/1">https://x/pages/1</a></td><td>symfony</td><td>2026-09-06</td></tr></tbody></table>';
    expect(parseIndexTable(storage)).toEqual([
      {
        title: "Symfony 4→5 Upgrade",
        description: "An em—dash & a numeric ref: →",
        link: "https://x/pages/1",
        tags: ["symfony"],
        lastModified: "2026-09-06",
      },
    ]);
  });

  it("tolerates a legacy 4-column table with no Last Modified column at all", () => {
    const storage =
      "<table><tbody><tr><th>Title</th><th>Description</th><th>Link</th><th>Tags</th></tr>" +
      '<tr><td>Symfony 4&rarr;5 Upgrade</td><td>d</td>' +
      '<td><a href="https://x/pages/1">https://x/pages/1</a></td><td>symfony</td></tr></tbody></table>';
    expect(parseIndexTable(storage)).toEqual([
      { title: "Symfony 4→5 Upgrade", description: "d", link: "https://x/pages/1", tags: ["symfony"], lastModified: "" },
    ]);
  });

  it("upgrades a legacy 4-column table to 5 columns on the next serialize", () => {
    const legacyStorage =
      "<table><tbody><tr><th>Title</th><th>Description</th><th>Link</th><th>Tags</th></tr>" +
      '<tr><td>Existing Guide</td><td>d</td><td><a href="https://x/pages/1">https://x/pages/1</a></td><td></td></tr></tbody></table>';
    const parsed = parseIndexTable(legacyStorage);
    const reSerialized = serializeIndexTable(parsed);
    expect(reSerialized).toContain("<th>Last Modified</th>");
    expect(parseIndexTable(reSerialized)).toEqual([
      { title: "Existing Guide", description: "d", link: "https://x/pages/1", tags: [], lastModified: "" },
    ]);
  });

  describe("upsertIndexRow", () => {
    it("appends a new row when the title doesn't match", () => {
      const newRow: GuideIndexRow = { title: "Symfony 5→6 Upgrade", description: "d", link: "l", tags: [], lastModified: "2026-09-07" };
      expect(upsertIndexRow(rows, newRow)).toEqual([...rows, newRow]);
    });

    it("replaces the row on an exact title match", () => {
      const updated: GuideIndexRow = { title: "Symfony 4→5 Upgrade", description: "updated", link: "https://confluence.example.com/pages/1", tags: ["symfony"], lastModified: "2026-09-07" };
      const result = upsertIndexRow(rows, updated);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(updated);
    });
  });
});

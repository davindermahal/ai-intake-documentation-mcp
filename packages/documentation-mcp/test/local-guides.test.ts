import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listLocalGuideFiles } from "../src/confluence/local-guides.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "documentation-mcp-local-guides-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("listLocalGuideFiles", () => {
  it("parses the title from the leading # heading and the description from the paragraph after it", () => {
    writeFileSync(
      join(dir, "upgrade-node.md"),
      "# Upgrade Node.js 20.x to Node.js 22.x (LTS)\n\nProduces: a Node.js project migrated from 20.x\nto 22.x.\n\n## Next section\n"
    );
    expect(listLocalGuideFiles(dir)).toEqual([
      {
        filename: "upgrade-node.md",
        title: "Upgrade Node.js 20.x to Node.js 22.x (LTS)",
        description: "Produces: a Node.js project migrated from 20.x to 22.x.",
        content: "# Upgrade Node.js 20.x to Node.js 22.x (LTS)\n\nProduces: a Node.js project migrated from 20.x\nto 22.x.\n\n## Next section\n",
      },
    ]);
  });

  it("falls back to the filename (without extension) as the title when there's no # heading", () => {
    writeFileSync(join(dir, "no-heading.md"), "Just body text, no heading.\n");
    const [guide] = listLocalGuideFiles(dir);
    expect(guide.title).toBe("no-heading");
    expect(guide.description).toBe("");
  });

  it("only lists .md files, sorted", () => {
    writeFileSync(join(dir, "b.md"), "# B\n");
    writeFileSync(join(dir, "a.md"), "# A\n");
    writeFileSync(join(dir, "notes.txt"), "not a guide");
    expect(listLocalGuideFiles(dir).map((g) => g.filename)).toEqual(["a.md", "b.md"]);
  });
});

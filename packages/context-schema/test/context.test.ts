import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readContextChunk, writeContextChunk } from "../src/context.js";

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "context-schema-context-"));
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("writeContextChunk / readContextChunk", () => {
  it("writes plain markdown content and a separate metadata sidecar, and pairs them back up", () => {
    const frontmatter = {
      id: "billing.md",
      title: "Billing rules",
      area: ["billing"],
      risk: "medium" as const,
      updated_at: "2026-09-04T00:00:00.000Z",
      source_evidence_ids: ["abc"],
    };
    writeContextChunk(repo, "billing.md", "- rule one\n- rule two", frontmatter);

    const chunk = readContextChunk(repo, "billing.md");
    expect(chunk).not.toBeNull();
    expect(chunk!.content).toBe("- rule one\n- rule two");
    expect(chunk!.frontmatter).toEqual(frontmatter);
  });

  it("returns null when either the content or the sidecar is missing", () => {
    expect(readContextChunk(repo, "nonexistent.md")).toBeNull();
  });

  it("rejects a relPath that escapes context/ via traversal", () => {
    const frontmatter = {
      id: "x",
      title: "x",
      area: [],
      updated_at: "2026-09-04T00:00:00.000Z",
      source_evidence_ids: [],
    };
    expect(() => writeContextChunk(repo, "../../etc/passwd", "pwned", frontmatter)).toThrow(
      /escapes base directory/
    );
    expect(() => readContextChunk(repo, "../../etc/passwd")).toThrow(/escapes base directory/);
  });

  it("rejects an absolute relPath", () => {
    const frontmatter = {
      id: "x",
      title: "x",
      area: [],
      updated_at: "2026-09-04T00:00:00.000Z",
      source_evidence_ids: [],
    };
    expect(() => writeContextChunk(repo, "/etc/passwd", "pwned", frontmatter)).toThrow(/escapes base directory/);
  });
});

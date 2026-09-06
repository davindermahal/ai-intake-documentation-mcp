import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureAiDirTool } from "../src/tools/ensureAiDir.js";
import { cleanupRepo, mkTempRepo, textOf } from "./helpers.js";

let repo: string;

beforeEach(() => {
  repo = mkTempRepo();
});

afterEach(() => {
  cleanupRepo(repo);
});

describe("ensure_ai_dir — absent", () => {
  it("initializes a fresh repo", async () => {
    const result = await ensureAiDirTool.handler({ repo_root: repo });
    expect(textOf(result)).toEqual({ status: "initialized" });
  });

  it("is idempotent — calling again on a conformant repo is a no-op", async () => {
    await ensureAiDirTool.handler({ repo_root: repo });
    const again = await ensureAiDirTool.handler({ repo_root: repo });
    expect(textOf(again)).toEqual({ status: "conformant" });
  });
});

describe("ensure_ai_dir — outdated (missing directory backfill)", () => {
  beforeEach(async () => {
    await ensureAiDirTool.handler({ repo_root: repo });
  });

  it("migrates/backfills automatically, no confirmation needed", async () => {
    rmSync(join(repo, ".ai", "plans", "completed"), { recursive: true });

    const upgraded = textOf(await ensureAiDirTool.handler({ repo_root: repo })) as {
      status: string;
      directories_created: string[];
    };
    expect(upgraded.status).toBe("upgraded");
    expect(upgraded.directories_created).toContain(join(".ai", "plans", "completed"));

    const redone = textOf(await ensureAiDirTool.handler({ repo_root: repo }));
    expect(redone).toEqual({ status: "conformant" });
  });

  it("fails cleanly (not a crash) when no migration path exists for the schema_version", async () => {
    const manifestPath = join(repo, ".ai", "setup-mcp.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    manifest.schema_version = "0.0.9";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = await ensureAiDirTool.handler({ repo_root: repo });
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/no migration path/);
  });
});

describe("ensure_ai_dir — non-conformant", () => {
  it("reports the legacy files found (including nested) and never modifies anything", async () => {
    mkdirSync(join(repo, ".ai"));
    writeFileSync(join(repo, ".ai", "notes.md"), "legacy notes");
    mkdirSync(join(repo, ".ai", "misc"));
    writeFileSync(join(repo, ".ai", "misc", "readme.txt"), "nested legacy file");

    const result = textOf(await ensureAiDirTool.handler({ repo_root: repo })) as {
      status: string;
      files: Array<{ path: string; bytes: number }>;
    };
    expect(result.status).toBe("non-conformant");
    expect(result.files.map((f) => f.path).sort()).toEqual([join("misc", "readme.txt"), "notes.md"]);

    // calling again changes nothing — still non-conformant, original file untouched
    const again = textOf(await ensureAiDirTool.handler({ repo_root: repo }));
    expect(again).toEqual(result);
    expect(readFileSync(join(repo, ".ai", "notes.md"), "utf-8")).toBe("legacy notes");
  });
});

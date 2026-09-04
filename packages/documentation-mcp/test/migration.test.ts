import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectAiDirTool } from "../src/tools/detectAiDir.js";
import { proposeAiDirMigrationTool } from "../src/tools/proposeAiDirMigration.js";
import { applyAiDirMigrationTool } from "../src/tools/applyAiDirMigration.js";
import { listEvidenceTool } from "../src/tools/listEvidence.js";
import { cleanupRepo, mkTempRepo, textOf } from "./helpers.js";

let repo: string;

beforeEach(() => {
  repo = mkTempRepo();
  mkdirSync(join(repo, ".ai"));
  writeFileSync(join(repo, ".ai", "notes.md"), "# Old notes\nSome pre-existing project notes nobody classified.");
  mkdirSync(join(repo, ".ai", "misc"));
  writeFileSync(join(repo, ".ai", "misc", "readme.txt"), "another legacy file, nested");
});

afterEach(() => {
  cleanupRepo(repo);
});

describe("propose_ai_dir_migration", () => {
  it("lists every file under a non-conformant .ai/ with no classification", async () => {
    const result = textOf(await proposeAiDirMigrationTool.handler({ repo_root: repo })) as {
      status: string;
      files: Array<{ path: string; bytes: number }>;
    };
    expect(result.status).toBe("migration-available");
    expect(result.files.map((f) => f.path).sort()).toEqual([join("misc", "readme.txt"), "notes.md"]);
  });
});

describe("apply_ai_dir_migration", () => {
  it("refuses without confirm: true", async () => {
    const result = await applyAiDirMigrationTool.handler({ repo_root: repo, confirm: false, remove_originals: false });
    expect(result.isError).toBe(true);
  });

  it("ingests legacy content as evidence, scaffolds, and reports conformant afterward", async () => {
    const result = textOf(
      await applyAiDirMigrationTool.handler({ repo_root: repo, confirm: true, remove_originals: true })
    ) as { status: string; ingested: number; removed_originals: boolean };
    expect(result).toEqual({ status: "migrated", ingested: 2, removed_originals: true });

    const detected = textOf(await detectAiDirTool.handler({ repo_root: repo }));
    expect(detected).toEqual({ status: "conformant" });

    const evidence = textOf(await listEvidenceTool.handler({ repo_root: repo })) as Array<{
      source: string;
      type: string;
    }>;
    expect(evidence).toHaveLength(2);
    for (const e of evidence) {
      expect(e.source).toBe("legacy-doc");
      expect(e.type).toBe("raw-note");
    }
  });

  it("keeps the originals on disk unless remove_originals is set", async () => {
    await applyAiDirMigrationTool.handler({ repo_root: repo, confirm: true, remove_originals: false });
    expect(existsSync(join(repo, ".ai", "notes.md"))).toBe(true);
  });
});

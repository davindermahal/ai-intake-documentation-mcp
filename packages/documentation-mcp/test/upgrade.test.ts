import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectAiDirTool } from "../src/tools/detectAiDir.js";
import { initAiScaffoldTool } from "../src/tools/initAiScaffold.js";
import { proposeAiDirMigrationTool } from "../src/tools/proposeAiDirMigration.js";
import { upgradeAiDirTool } from "../src/tools/upgradeAiDir.js";
import { cleanupRepo, mkTempRepo, textOf } from "./helpers.js";

let repo: string;

beforeEach(async () => {
  repo = mkTempRepo();
  await initAiScaffoldTool.handler({ repo_root: repo });
});

afterEach(() => {
  cleanupRepo(repo);
});

describe("upgrade_ai_dir — missing directory backfill", () => {
  it("detects outdated when a scaffold directory is missing, and upgrade_ai_dir backfills it", async () => {
    rmSync(join(repo, ".ai", "plans", "completed"), { recursive: true });

    const detected = textOf(await detectAiDirTool.handler({ repo_root: repo })) as {
      status: string;
      missing_dirs: string[];
    };
    expect(detected.status).toBe("outdated");
    expect(detected.missing_dirs).toContain(join(".ai", "plans", "completed"));

    const initAttempt = await initAiScaffoldTool.handler({ repo_root: repo });
    expect(initAttempt.isError).toBe(true);

    const proposeAttempt = textOf(await proposeAiDirMigrationTool.handler({ repo_root: repo })) as { status: string };
    expect(proposeAttempt.status).toMatch(/upgrade_ai_dir/);

    const upgraded = textOf(await upgradeAiDirTool.handler({ repo_root: repo })) as {
      status: string;
      directories_created: string[];
    };
    expect(upgraded.status).toBe("upgraded");
    expect(upgraded.directories_created).toContain(join(".ai", "plans", "completed"));

    const redetected = textOf(await detectAiDirTool.handler({ repo_root: repo }));
    expect(redetected).toEqual({ status: "conformant" });
  });

  it("is a no-op on an already-conformant repo", async () => {
    const result = textOf(await upgradeAiDirTool.handler({ repo_root: repo }));
    expect(result).toEqual({ status: "already-current" });
  });
});

describe("upgrade_ai_dir — unmigratable schema_version", () => {
  it("fails cleanly (not a crash) when no migration path exists", async () => {
    const manifestPath = join(repo, ".ai", "setup-mcp.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    manifest.schema_version = "0.0.9";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const detected = textOf(await detectAiDirTool.handler({ repo_root: repo })) as { schema_version: string };
    expect(detected.schema_version).toBe("0.0.9");

    const result = await upgradeAiDirTool.handler({ repo_root: repo });
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/no migration path/);
  });
});

describe("upgrade_ai_dir — non-conformant repos are unaffected", () => {
  it("refuses and points at the migration flow instead", async () => {
    const foreignRepo = mkTempRepo();
    mkdirSync(join(foreignRepo, ".ai"));
    writeFileSync(join(foreignRepo, ".ai", "junk.md"), "junk");

    const detected = textOf(await detectAiDirTool.handler({ repo_root: foreignRepo }));
    expect(detected).toEqual({ status: "non-conformant", found: ["junk.md"] });

    const result = await upgradeAiDirTool.handler({ repo_root: foreignRepo });
    expect(result.isError).toBe(true);

    cleanupRepo(foreignRepo);
  });
});

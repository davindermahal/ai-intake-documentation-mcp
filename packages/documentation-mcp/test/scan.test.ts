import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanProject, scanProjectTool } from "../src/tools/scanProject.js";
import { checkDriftTool } from "../src/tools/checkDrift.js";
import { initAiScaffoldTool } from "../src/tools/initAiScaffold.js";
import { cleanupRepo, mkTempRepo, textOf } from "./helpers.js";

let repo: string;

beforeEach(() => {
  repo = mkTempRepo();
});

afterEach(() => {
  cleanupRepo(repo);
});

describe("scanProject", () => {
  it("finds manifest files up to 2 directories deep, but not inside node_modules", () => {
    mkdirSync(join(repo, "frontend"), { recursive: true });
    writeFileSync(join(repo, "frontend", "package.json"), "{}");
    mkdirSync(join(repo, "api"), { recursive: true });
    writeFileSync(join(repo, "api", "composer.json"), "{}");
    mkdirSync(join(repo, "services", "worker"), { recursive: true });
    writeFileSync(join(repo, "services", "worker", "requirements.txt"), "");
    mkdirSync(join(repo, "frontend", "node_modules", "some-dep"), { recursive: true });
    writeFileSync(join(repo, "frontend", "node_modules", "some-dep", "package.json"), "{}");

    const result = scanProject(repo);

    expect(result.manifest_files).toEqual(
      expect.arrayContaining(["frontend/package.json", "api/composer.json", join("services", "worker", "requirements.txt")])
    );
    expect(result.manifest_files.some((f) => f.includes("node_modules"))).toBe(false);
  });

  it("detects existing_agent_docs (AGENTS.md etc.) separately from existing_docs", () => {
    writeFileSync(join(repo, "AGENTS.md"), "# AGENTS.md\ninstructions");

    const result = scanProject(repo);
    expect(result.existing_agent_docs).toContain("AGENTS.md");
    expect(result.existing_docs).toEqual([]);
  });

  it("keeps CI config root-only even though manifest/infra search now goes deeper", () => {
    mkdirSync(join(repo, ".github", "workflows"), { recursive: true });
    writeFileSync(join(repo, ".github", "workflows", "ci.yml"), "");
    writeFileSync(join(repo, "docker-compose.yml"), "services: {}");

    const result = scanProject(repo);
    expect(result.ci_config).toContain(".github/workflows");
    expect(result.infra_signals).toContain("docker-compose.yml");
  });
});

describe("scan_project tool + check_drift", () => {
  it("requires .ai/ to be initialized", async () => {
    const result = await scanProjectTool.handler({ repo_root: repo });
    expect(result.isError).toBe(true);
  });

  it("updates last_scan_sha, and check_drift reflects staleness against new commits", async () => {
    await initAiScaffoldTool.handler({ repo_root: repo });
    await scanProjectTool.handler({ repo_root: repo });

    const fresh = textOf(await checkDriftTool.handler({ repo_root: repo })) as { stale: boolean };
    expect(fresh.stale).toBe(false);

    writeFileSync(join(repo, "new-file.txt"), "changed");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "add file"], { cwd: repo });

    const afterCommit = textOf(await checkDriftTool.handler({ repo_root: repo })) as { stale: boolean; changed_files: string[] };
    expect(afterCommit.stale).toBe(true);
    expect(afterCommit.changed_files).toContain("new-file.txt");
  });

  it("check_drift reports never-scanned when last_scan_sha is null", async () => {
    await initAiScaffoldTool.handler({ repo_root: repo });
    const result = textOf(await checkDriftTool.handler({ repo_root: repo })) as { stale: boolean; last_scan_sha: null };
    expect(result.last_scan_sha).toBeNull();
    expect(result.stale).toBe(true);
  });
});

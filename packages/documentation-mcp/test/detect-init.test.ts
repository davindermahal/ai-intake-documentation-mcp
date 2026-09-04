import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectAiDirTool } from "../src/tools/detectAiDir.js";
import { initAiScaffoldTool } from "../src/tools/initAiScaffold.js";
import { cleanupRepo, mkTempRepo, textOf } from "./helpers.js";

let repo: string;

beforeEach(() => {
  repo = mkTempRepo();
});

afterEach(() => {
  cleanupRepo(repo);
});

describe("detect_ai_dir / init_ai_scaffold", () => {
  it("reports absent on a fresh repo", async () => {
    const result = await detectAiDirTool.handler({ repo_root: repo });
    expect(textOf(result)).toEqual({ status: "absent" });
  });

  it("initializes, then reports conformant", async () => {
    const init = await initAiScaffoldTool.handler({ repo_root: repo });
    expect(textOf(init)).toEqual({ status: "initialized" });

    const detected = await detectAiDirTool.handler({ repo_root: repo });
    expect(textOf(detected)).toEqual({ status: "conformant" });
  });

  it("is idempotent — calling init again on a conformant repo is a no-op", async () => {
    await initAiScaffoldTool.handler({ repo_root: repo });
    const again = await initAiScaffoldTool.handler({ repo_root: repo });
    expect(textOf(again)).toEqual({ status: "already-initialized" });
  });

  it("reports non-conformant for a .ai/ with unrecognized content and refuses to overwrite it", async () => {
    mkdirSync(join(repo, ".ai"));
    writeFileSync(join(repo, ".ai", "notes.md"), "legacy notes");

    const detected = await detectAiDirTool.handler({ repo_root: repo });
    expect(textOf(detected)).toEqual({ status: "non-conformant", found: ["notes.md"] });

    const init = await initAiScaffoldTool.handler({ repo_root: repo });
    expect(init.isError).toBe(true);
  });
});

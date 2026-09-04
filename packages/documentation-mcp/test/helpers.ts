import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

/** Creates a fresh, git-init'd scratch repo with one commit (so currentGitSha resolves). */
export function mkTempRepo(prefix = "documentation-mcp-test-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-q", "-m", "init"], {
    cwd: dir,
  });
  return dir;
}

export function cleanupRepo(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** Extracts and JSON-parses the text of a tool handler's first content block. */
export function textOf(result: { content: Array<{ text: string }> }): unknown {
  return JSON.parse(result.content[0].text);
}

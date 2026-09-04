import { execFileSync } from "node:child_process";

export function currentGitSha(repoRoot: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null; // no commits yet, or not a git repo
  }
}

/**
 * null on any git error (e.g. `sha` doesn't exist in this repo's history). Uses execFileSync
 * (argv array, not a shell string) so `sha` — which ultimately comes from the manifest file on
 * disk — can never be interpreted as shell syntax.
 */
export function changedFilesSince(repoRoot: string, sha: string): string[] | null {
  try {
    const out = execFileSync("git", ["diff", "--name-only", sha, "HEAD"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    return out.split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

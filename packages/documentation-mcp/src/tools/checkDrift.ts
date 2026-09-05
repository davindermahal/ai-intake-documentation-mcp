import * as z from "zod";
import { readManifest } from "@dmahal/context-schema";
import { changedFilesSince, currentGitSha } from "../git.js";

export const checkDriftTool = {
  name: "check_drift",
  description:
    "Compares the manifest's last_scan_sha to the repo's current git HEAD. This is code-vs-scan " +
    "staleness only — separate from needs_resync on get_setup_status, which tracks evidence-driven " +
    "staleness. Requires .ai/ to already be initialized.",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
  }),
  handler: async ({ repo_root }: { repo_root?: string }) => {
    const repoRoot = repo_root ?? process.cwd();
    const manifest = readManifest(repoRoot);
    if (!manifest) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "not-initialized: run init_ai_scaffold first" }, null, 2) }],
        isError: true,
      };
    }

    const currentSha = currentGitSha(repoRoot);
    const lastScanSha = manifest.last_scan_sha;

    if (!lastScanSha) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ last_scan_sha: null, current_sha: currentSha, stale: true, changed_files: null, note: "never scanned — run scan_project" }, null, 2),
          },
        ],
      };
    }

    const stale = currentSha !== lastScanSha;
    const changedFiles = stale && currentSha ? changedFilesSince(repoRoot, lastScanSha) : [];

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ last_scan_sha: lastScanSha, current_sha: currentSha, stale, changed_files: changedFiles }, null, 2),
        },
      ],
    };
  },
};

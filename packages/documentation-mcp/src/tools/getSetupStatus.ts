import * as z from "zod";
import { readManifest } from "@davindermahal/context-schema";

export const getSetupStatusTool = {
  name: "get_setup_status",
  description:
    "Reads the .ai/setup-mcp.json manifest as-is: last scan/synthesis timestamps, pending evidence " +
    "counts, and needs_resync. Returns status 'not-initialized' if no manifest exists yet. This tool " +
    "reports state only — deciding what to do about needs_resync (e.g. run synthesis before planning) " +
    "is the calling agent's/harness's policy, not this tool's.",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
  }),
  handler: async ({ repo_root }: { repo_root?: string }) => {
    const repoRoot = repo_root ?? process.cwd();
    const manifest = readManifest(repoRoot);
    const result = manifest ?? { status: "not-initialized" as const };
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
};

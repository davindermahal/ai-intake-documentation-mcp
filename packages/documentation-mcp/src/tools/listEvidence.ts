import * as z from "zod";
import { listAllEvidence, listUnsynthesized } from "@ai-intake/context-schema";

export const listEvidenceTool = {
  name: "list_evidence",
  description:
    "Reads back evidence entries for the calling agent to review before writing docs/context — the " +
    "actual authoring (turning evidence into narrative or distilled rules) is the agent's job, not " +
    "this tool's. Defaults to unsynthesized entries only.",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
    unsynthesized_only: z.boolean().default(true),
    ticket_key: z.string().optional().describe("Filter to evidence recorded against a specific ticket."),
  }),
  handler: async ({
    repo_root,
    unsynthesized_only,
    ticket_key,
  }: {
    repo_root?: string;
    unsynthesized_only?: boolean;
    ticket_key?: string;
  }) => {
    const repoRoot = repo_root ?? process.cwd();
    let entries = unsynthesized_only ?? true ? listUnsynthesized(repoRoot) : listAllEvidence(repoRoot);
    if (ticket_key) entries = entries.filter((e) => e.ticket_key === ticket_key);
    return { content: [{ type: "text" as const, text: JSON.stringify(entries, null, 2) }] };
  },
};

import * as z from "zod";
import { readManifest, writePlan } from "@dmahal/context-schema";

export const writePlanTool = {
  name: "write_plan",
  description:
    "Creates a plan file for planning/approval work — required for all Jira ticket work and all " +
    "planning work in this project. Starts in status 'draft' unless overridden. Filename is " +
    "auto-generated from title/date (and ticket_key, if given), colliding names get a numeric " +
    "suffix. Requires .ai/ to already be initialized.",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
    title: z.string(),
    description: z.string(),
    content: z.string().describe("Full markdown content of the plan."),
    ticket_key: z.string().nullable().default(null),
    status: z.enum(["draft", "active", "completed"]).default("draft"),
    created_by: z.string().describe("Free-text source tag, e.g. 'documentation-mcp', 'ai-intake-harness', or a human's note."),
  }),
  handler: async ({
    repo_root,
    title,
    description,
    content,
    ticket_key,
    status,
    created_by,
  }: {
    repo_root?: string;
    title: string;
    description: string;
    content: string;
    ticket_key?: string | null;
    status?: "draft" | "active" | "completed";
    created_by: string;
  }) => {
    const repoRoot = repo_root ?? process.cwd();
    if (!readManifest(repoRoot)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "not-initialized: run init_ai_scaffold first" }, null, 2) }],
        isError: true,
      };
    }

    const now = new Date().toISOString();
    const result = writePlan(
      repoRoot,
      {
        title,
        description,
        date: now,
        ticket_key: ticket_key ?? null,
        status: status ?? "draft",
        created_by,
        approved_at: (status ?? "draft") === "active" ? now : null,
      },
      content
    );

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
};

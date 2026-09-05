import * as z from "zod";
import { listPlans } from "@dmahal/context-schema";

export const listPlansTool = {
  name: "list_plans",
  description: "Returns full plan metadata + content, optionally filtered by status and/or ticket_key.",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
    status: z.enum(["draft", "active", "completed"]).optional().describe("Omit to list across all three."),
    ticket_key: z.string().optional(),
  }),
  handler: async ({
    repo_root,
    status,
    ticket_key,
  }: {
    repo_root?: string;
    status?: "draft" | "active" | "completed";
    ticket_key?: string;
  }) => {
    const repoRoot = repo_root ?? process.cwd();
    let plans = listPlans(repoRoot, status);
    if (ticket_key) plans = plans.filter((p) => p.meta.ticket_key === ticket_key);
    return { content: [{ type: "text" as const, text: JSON.stringify(plans, null, 2) }] };
  },
};

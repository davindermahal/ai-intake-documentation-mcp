import * as z from "zod";
import { movePlan } from "@dmahal/context-schema";

export const transitionPlanTool = {
  name: "transition_plan",
  description:
    "Moves a plan between draft/active/completed by id (physically relocates the file, not just a " +
    "status flag). Sets approved_at automatically the first time a plan reaches 'active' — never " +
    "overwritten on later transitions. No restrictions on which transitions are allowed (sending a " +
    "plan back to draft, or reopening a completed one, are both fine).",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
    id: z.string().describe("The plan's id (filename stem, without .md)."),
    from: z.enum(["draft", "active", "completed"]),
    to: z.enum(["draft", "active", "completed"]),
  }),
  handler: async ({
    repo_root,
    id,
    from,
    to,
  }: {
    repo_root?: string;
    id: string;
    from: "draft" | "active" | "completed";
    to: "draft" | "active" | "completed";
  }) => {
    const repoRoot = repo_root ?? process.cwd();
    try {
      const plan = movePlan(repoRoot, id, from, to);
      return { content: [{ type: "text" as const, text: JSON.stringify(plan.meta, null, 2) }] };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2) }],
        isError: true,
      };
    }
  },
};

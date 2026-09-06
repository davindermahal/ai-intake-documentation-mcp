import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureAiDirTool } from "../src/tools/ensureAiDir.js";
import { writePlanTool } from "../src/tools/writePlan.js";
import { listPlansTool } from "../src/tools/listPlans.js";
import { transitionPlanTool } from "../src/tools/transitionPlan.js";
import { cleanupRepo, mkTempRepo, textOf } from "./helpers.js";

let repo: string;

beforeEach(async () => {
  repo = mkTempRepo();
  await ensureAiDirTool.handler({ repo_root: repo });
});

afterEach(() => {
  cleanupRepo(repo);
});

describe("write_plan / list_plans / transition_plan", () => {
  it("creates a draft plan, listable by status", async () => {
    await writePlanTool.handler({
      repo_root: repo,
      title: "Rework auth flow",
      description: "Untangle session vs token auth.",
      content: "# Rework auth flow\n\nDetails...",
      created_by: "documentation-mcp",
    });

    expect(textOf(await listPlansTool.handler({ repo_root: repo, status: "draft" }))).toHaveLength(1);
    expect(textOf(await listPlansTool.handler({ repo_root: repo, status: "active" }))).toHaveLength(0);
  });

  it("moves a plan through draft -> active -> completed, setting approved_at once", async () => {
    const written = textOf(
      await writePlanTool.handler({
        repo_root: repo,
        title: "Add billing webhook",
        description: "Handle Stripe webhook retries.",
        content: "# Add billing webhook",
        ticket_key: "DAV-42",
        created_by: "ai-intake-harness",
      })
    ) as { meta: { id: string } };
    const id = written.meta.id;

    const active = textOf(await transitionPlanTool.handler({ repo_root: repo, id, from: "draft", to: "active" })) as {
      status: string;
      approved_at: string | null;
    };
    expect(active.status).toBe("active");
    expect(active.approved_at).toBeTruthy();

    const completed = textOf(
      await transitionPlanTool.handler({ repo_root: repo, id, from: "active", to: "completed" })
    ) as { status: string };
    expect(completed.status).toBe("completed");

    expect(textOf(await listPlansTool.handler({ repo_root: repo, status: "completed" }))).toHaveLength(1);
    expect(textOf(await listPlansTool.handler({ repo_root: repo, status: "draft" }))).toHaveLength(0);
    expect(textOf(await listPlansTool.handler({ repo_root: repo, status: "active" }))).toHaveLength(0);
  });

  it("filters list_plans by ticket_key", async () => {
    await writePlanTool.handler({
      repo_root: repo,
      title: "No ticket plan",
      description: "d",
      content: "c",
      created_by: "test",
    });
    await writePlanTool.handler({
      repo_root: repo,
      title: "Ticketed plan",
      description: "d",
      content: "c",
      ticket_key: "DAV-1",
      created_by: "test",
    });

    const filtered = textOf(await listPlansTool.handler({ repo_root: repo, ticket_key: "DAV-1" })) as unknown[];
    expect(filtered).toHaveLength(1);
  });

  it("appends a numeric suffix on a same-day title collision", async () => {
    await writePlanTool.handler({ repo_root: repo, title: "Dup Title", description: "first", content: "a", created_by: "t" });
    const second = textOf(
      await writePlanTool.handler({ repo_root: repo, title: "Dup Title", description: "second", content: "b", created_by: "t" })
    ) as { meta: { id: string } };
    expect(second.meta.id).toMatch(/-2$/);
  });
});

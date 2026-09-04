import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listPlans, movePlan, slugify, writePlan } from "../src/plans.js";

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "context-schema-plans-"));
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("slugify", () => {
  it("lowercases, replaces non-alphanumerics with dashes, and trims", () => {
    expect(slugify("Rework Auth Flow!")).toBe("rework-auth-flow");
  });
});

const baseMeta = {
  title: "Rework auth flow",
  description: "Untangle session vs token auth.",
  date: "2026-09-04T00:00:00.000Z",
  ticket_key: null,
  status: "draft" as const,
  created_by: "test",
  approved_at: null,
};

describe("writePlan / listPlans", () => {
  it("writes a plan whose id embeds the date and a slug of the title", () => {
    const { meta } = writePlan(repo, baseMeta, "# content");
    expect(meta.id).toBe("2026-09-04-rework-auth-flow");

    const plans = listPlans(repo, "draft");
    expect(plans).toHaveLength(1);
    expect(plans[0].content).toBe("# content");
  });

  it("prefixes the id with ticket_key when given", () => {
    const { meta } = writePlan(repo, { ...baseMeta, ticket_key: "DAV-42" }, "# content");
    expect(meta.id).toBe("DAV-42-2026-09-04-rework-auth-flow");
  });

  it("appends a numeric suffix on a filename collision", () => {
    const first = writePlan(repo, baseMeta, "# first");
    const second = writePlan(repo, baseMeta, "# second");
    expect(first.meta.id).toBe("2026-09-04-rework-auth-flow");
    expect(second.meta.id).toBe("2026-09-04-rework-auth-flow-2");
  });

  it("listPlans with no status argument lists across all three", () => {
    writePlan(repo, baseMeta, "# draft one");
    writePlan(repo, { ...baseMeta, title: "Other", status: "active" }, "# active one");
    expect(listPlans(repo)).toHaveLength(2);
  });
});

describe("movePlan", () => {
  it("physically relocates the plan and sets approved_at only the first time it reaches active", () => {
    const { meta } = writePlan(repo, baseMeta, "# content");

    const activated = movePlan(repo, meta.id, "draft", "active");
    expect(activated.meta.status).toBe("active");
    expect(activated.meta.approved_at).toBeTruthy();
    expect(listPlans(repo, "draft")).toHaveLength(0);
    expect(listPlans(repo, "active")).toHaveLength(1);

    const firstApprovedAt = activated.meta.approved_at;
    const backToDraft = movePlan(repo, meta.id, "active", "draft");
    const reactivated = movePlan(repo, backToDraft.meta.id, "draft", "active");
    expect(reactivated.meta.approved_at).toBe(firstApprovedAt);
  });

  it("throws if the plan isn't found in the given from-status", () => {
    expect(() => movePlan(repo, "does-not-exist", "draft", "active")).toThrow();
  });
});

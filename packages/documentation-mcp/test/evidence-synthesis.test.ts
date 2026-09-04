import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initAiScaffoldTool } from "../src/tools/initAiScaffold.js";
import { recordEvidenceTool } from "../src/tools/recordEvidence.js";
import { listEvidenceTool } from "../src/tools/listEvidence.js";
import { writeDocTool } from "../src/tools/writeDoc.js";
import { writeContextChunkTool } from "../src/tools/writeContextChunk.js";
import { getSetupStatusTool } from "../src/tools/getSetupStatus.js";
import { cleanupRepo, mkTempRepo, textOf } from "./helpers.js";

let repo: string;

beforeEach(async () => {
  repo = mkTempRepo();
  await initAiScaffoldTool.handler({ repo_root: repo });
});

afterEach(() => {
  cleanupRepo(repo);
});

describe("record_evidence", () => {
  it("requires .ai/ to be initialized", async () => {
    const uninitRepo = mkTempRepo();
    const result = await recordEvidenceTool.handler({
      repo_root: uninitRepo,
      ticket_key: null,
      type: "new-rule",
      source: "human",
      content: "x",
    });
    expect(result.isError).toBe(true);
    cleanupRepo(uninitRepo);
  });

  it("a correction sets needs_resync and evidence_pending_corrections", async () => {
    await recordEvidenceTool.handler({
      repo_root: repo,
      ticket_key: null,
      type: "new-rule",
      source: "human",
      content: "Discounts apply before tax.",
    });
    await recordEvidenceTool.handler({
      repo_root: repo,
      ticket_key: "SYN-1",
      type: "correction",
      source: "agent-inferred",
      content: "Actually payment capture happens before shipping, not after.",
    });

    const status = textOf(await getSetupStatusTool.handler({ repo_root: repo })) as {
      evidence_pending_count: number;
      evidence_pending_corrections: number;
      needs_resync: boolean;
    };
    expect(status.evidence_pending_count).toBe(2);
    expect(status.evidence_pending_corrections).toBe(1);
    expect(status.needs_resync).toBe(true);
  });
});

describe("write_doc / write_context_chunk synthesis", () => {
  it("marks referenced evidence synthesized and recomputes counters back to zero", async () => {
    const e1 = textOf(
      await recordEvidenceTool.handler({
        repo_root: repo,
        ticket_key: null,
        type: "new-rule",
        source: "human",
        content: "Discounts apply before tax.",
      })
    ) as { id: string };
    const e2 = textOf(
      await recordEvidenceTool.handler({
        repo_root: repo,
        ticket_key: "SYN-1",
        type: "correction",
        source: "agent-inferred",
        content: "Payment capture happens before shipping.",
      })
    ) as { id: string };

    const beforeStatus = textOf(await getSetupStatusTool.handler({ repo_root: repo })) as { needs_resync: boolean };
    expect(beforeStatus.needs_resync).toBe(true);

    await writeDocTool.handler({
      repo_root: repo,
      path: "business-rules.md",
      content: "# Business rules\n\n- Discounts apply before tax.",
      source_evidence_ids: [e1.id],
    });
    await writeContextChunkTool.handler({
      repo_root: repo,
      path: "billing.md",
      content: "- Discounts apply before tax.\n- Payment capture happens before shipping.",
      title: "Billing rules",
      area: ["billing"],
      risk: "medium",
      source_evidence_ids: [e1.id, e2.id],
    });

    const afterStatus = textOf(await getSetupStatusTool.handler({ repo_root: repo })) as {
      evidence_pending_count: number;
      evidence_pending_corrections: number;
      needs_resync: boolean;
      doc_index: { docs: string[]; context: string[] };
    };
    expect(afterStatus.evidence_pending_count).toBe(0);
    expect(afterStatus.evidence_pending_corrections).toBe(0);
    expect(afterStatus.needs_resync).toBe(false);
    expect(afterStatus.doc_index.docs).toContain("business-rules.md");
    expect(afterStatus.doc_index.context).toContain("billing.md");

    const remaining = textOf(await listEvidenceTool.handler({ repo_root: repo })) as unknown[];
    expect(remaining).toHaveLength(0);
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendEvidence,
  createEvidence,
  evidenceFilename,
  listAllEvidence,
  listUnsynthesized,
  markSynthesized,
  pendingCounts,
} from "../src/evidence.js";

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "context-schema-evidence-"));
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("createEvidence", () => {
  it("fills in id/date/synthesized defaults", () => {
    const entry = createEvidence({ ticket_key: null, type: "new-rule", source: "human", content: "x" });
    expect(entry.id).toBeTruthy();
    expect(entry.date).toBeTruthy();
    expect(entry.synthesized).toBe(false);
    expect(entry.related_files).toEqual([]);
  });
});

describe("evidenceFilename", () => {
  it("uses the onboarding path when ticket_key is null", () => {
    const entry = createEvidence({ ticket_key: null, type: "raw-note", source: "human", content: "x" });
    expect(evidenceFilename(entry)).toContain(join("evidence", "onboarding"));
  });

  it("uses the tickets path, prefixed with the ticket key, when ticket_key is set", () => {
    const entry = createEvidence({ ticket_key: "DAV-1", type: "raw-note", source: "human", content: "x" });
    const filename = evidenceFilename(entry);
    expect(filename).toContain(join("evidence", "tickets"));
    expect(filename).toContain("DAV-1-");
  });
});

describe("appendEvidence / listAllEvidence / listUnsynthesized", () => {
  it("round-trips a written entry", () => {
    const entry = createEvidence({ ticket_key: null, type: "new-rule", source: "human", content: "hello" });
    appendEvidence(repo, entry);

    const all = listAllEvidence(repo);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(entry.id);
    expect(all[0].content).toBe("hello");
  });

  it("listUnsynthesized excludes entries already marked synthesized", () => {
    const a = createEvidence({ ticket_key: null, type: "new-rule", source: "human", content: "a" });
    const b = createEvidence({ ticket_key: null, type: "new-rule", source: "human", content: "b" });
    appendEvidence(repo, a);
    appendEvidence(repo, b);

    markSynthesized(repo, [a.id]);

    const unsynthesized = listUnsynthesized(repo);
    expect(unsynthesized.map((e) => e.id)).toEqual([b.id]);
  });

  it("markSynthesized silently ignores an id that doesn't resolve to a file", () => {
    expect(() => markSynthesized(repo, ["does-not-exist"])).not.toThrow();
  });
});

describe("pendingCounts", () => {
  it("counts unsynthesized entries and, separately, unsynthesized corrections", () => {
    const rule = createEvidence({ ticket_key: null, type: "new-rule", source: "human", content: "a" });
    const correction = createEvidence({ ticket_key: null, type: "correction", source: "agent-inferred", content: "b" });
    appendEvidence(repo, rule);
    appendEvidence(repo, correction);

    expect(pendingCounts(repo)).toEqual({ pending: 2, corrections: 1 });

    markSynthesized(repo, [correction.id]);
    expect(pendingCounts(repo)).toEqual({ pending: 1, corrections: 0 });
  });
});

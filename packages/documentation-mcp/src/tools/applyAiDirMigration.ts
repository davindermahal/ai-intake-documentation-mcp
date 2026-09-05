import { mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import {
  AI_DIR,
  SCAFFOLD_DIRS,
  appendEvidence,
  createEvidence,
  emptyManifest,
  pendingCounts,
  resolveAiDir,
  writeManifest,
} from "@dmahal/context-schema";
import { proposeAiDirMigration } from "./proposeAiDirMigration.js";

export const applyAiDirMigrationTool = {
  name: "apply_ai_dir_migration",
  description:
    "Ingests a non-conformant .ai/ directory's existing content as legacy evidence, then creates the " +
    "standard scaffold. Re-walks the directory itself rather than trusting a prior propose call, so " +
    "it never acts on stale state. Requires confirm:true. Originals are left on disk unless " +
    "remove_originals is set — copy-first, delete-only-on-request.",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
    confirm: z.boolean().describe("Must be true — an explicit acknowledgement this will ingest and scaffold."),
    remove_originals: z.boolean().default(false).describe("Delete the original legacy files after ingesting them."),
  }),
  handler: async ({
    repo_root,
    confirm,
    remove_originals,
  }: {
    repo_root?: string;
    confirm: boolean;
    remove_originals?: boolean;
  }) => {
    const repoRoot = repo_root ?? process.cwd();

    if (!confirm) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "confirm must be true to proceed" }, null, 2) }],
        isError: true,
      };
    }

    const proposal = proposeAiDirMigration(repoRoot);
    if (proposal.status !== "migration-available" || !proposal.files) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: proposal.status }, null, 2) }], isError: true };
    }

    const aiDir = resolveAiDir(repoRoot);
    for (const file of proposal.files) {
      const content = readFileSync(join(aiDir, file.path), "utf-8");
      const entry = createEvidence({
        ticket_key: null,
        type: "raw-note",
        source: "legacy-doc",
        content,
        related_files: [join(AI_DIR, file.path)],
      });
      appendEvidence(repoRoot, entry);
    }

    for (const dir of SCAFFOLD_DIRS) {
      mkdirSync(join(repoRoot, dir), { recursive: true });
    }
    const manifest = emptyManifest();
    const counts = pendingCounts(repoRoot);
    manifest.evidence_pending_count = counts.pending;
    manifest.evidence_pending_corrections = counts.corrections;
    manifest.needs_resync = counts.corrections > 0;
    writeManifest(repoRoot, manifest);

    if (remove_originals) {
      for (const file of proposal.files) {
        unlinkSync(join(aiDir, file.path));
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ status: "migrated", ingested: proposal.files.length, removed_originals: !!remove_originals }, null, 2),
        },
      ],
    };
  },
};

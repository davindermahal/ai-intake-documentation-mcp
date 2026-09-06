import * as z from "zod";
import {
  EvidenceSourceSchema,
  EvidenceTypeSchema,
  appendEvidence,
  createEvidence,
  readManifest,
  writeManifest,
} from "@davindermahal/context-schema";

export const recordEvidenceTool = {
  name: "record_evidence",
  description:
    "Appends a raw, immutable evidence entry — a new business rule learned, a correction to something " +
    "already documented, a clarification, or a raw note. Never rewritten; this is the audit trail " +
    "underneath whatever docs/context currently say. A 'correction' entry sets needs_resync so the " +
    "next planning pass knows to re-synthesize before trusting existing docs. Requires .ai/ to already " +
    "be initialized (run ensure_ai_dir first).",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
    ticket_key: z.string().nullable().default(null).describe("Ticket key if this came from ticket work, else null."),
    type: EvidenceTypeSchema,
    source: EvidenceSourceSchema,
    content: z.string().describe("The evidence itself, in plain language."),
    related_files: z.array(z.string()).optional(),
  }),
  handler: async (args: {
    repo_root?: string;
    ticket_key: string | null;
    type: z.infer<typeof EvidenceTypeSchema>;
    source: z.infer<typeof EvidenceSourceSchema>;
    content: string;
    related_files?: string[];
  }) => {
    const repoRoot = args.repo_root ?? process.cwd();
    const manifest = readManifest(repoRoot);
    if (!manifest) {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "not-initialized: run ensure_ai_dir first" }, null, 2) },
        ],
        isError: true,
      };
    }

    const entry = createEvidence({
      ticket_key: args.ticket_key,
      type: args.type,
      source: args.source,
      content: args.content,
      related_files: args.related_files,
    });
    const path = appendEvidence(repoRoot, entry);

    manifest.evidence_pending_count += 1;
    if (entry.type === "correction") {
      manifest.evidence_pending_corrections += 1;
      manifest.needs_resync = true;
    }
    writeManifest(repoRoot, manifest);

    return { content: [{ type: "text" as const, text: JSON.stringify({ id: entry.id, path }, null, 2) }] };
  },
};

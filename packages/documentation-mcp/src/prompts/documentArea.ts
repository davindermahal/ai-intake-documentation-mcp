import * as z from "zod";

function buildInstructions(area?: string, confluenceLinks?: string): string {
  const step1 = area
    ? `1. The user asked to document **${area}**. Confirm that's still the right scope before you \
start investigating (scope can drift between asking and now) — if they name something else, use \
that instead.`
    : `1. Ask the user directly what part of the system they want documented: a directory, package, \
feature, or flow (e.g. "src/billing" or "the checkout flow"). Wait for a real answer — don't assume \
a default scope.`;

  return `Investigate one specific part of the system and document it for both humans (\`.ai/docs/\`) \
and AI agents (\`.ai/context/\`). This is the lightweight, repeatable path — no drift check, no \
whole-repo scan, just this one area done well — meant for everyday, repeated use as a team \
documents its apps incrementally. Work through the steps below in order, and stop to ask the user \
directly whenever a decision needs a human — do not guess or fabricate business logic you can't \
verify by reading the code.

${step1}

2. If Confluence page(s) relevant to this area were named${confluenceLinks ? ` (${confluenceLinks})` : ""} \
or come up at any point in this conversation, call \`fetch_confluence_pages\` with their URL(s) — no \
need to go looking for links nobody shared. Treat whatever comes back as background context, not \
authoritative: reconcile it against what you actually find reading the code in step 4, the same way \
you would any other secondary source. For each page you use, call \`record_evidence\` with \
\`source: "existing-docs"\` and prefix \`content\` with the page's URL and \`lastModified\` date, so \
provenance and staleness travel with the fact into \`.ai/docs\`/\`.ai/context\`, not just into this \
conversation.

3. Call \`ensure_ai_dir\` on the repo root. It self-heals \`absent\` (creates the scaffold) and \
\`outdated\` (migrates/backfills) automatically — no confirmation needed, just check the result. If \
it reports \`non-conformant\`, show the user the \`files\` it found and ask whether to migrate \
(\`apply_ai_dir_migration\` with \`confirm: true\`) or leave it alone. Never migrate without an \
explicit yes.

4. Investigate the area directly by reading the actual source — trace the real logic, follow call \
paths, check tests if there are any. This is the core of the prompt: build a real understanding of \
what the code does, why it's shaped that way, and what would break if it changed, rather than \
skimming for a summary.

5. From what you actually found while reading — not from a fixed checklist — ask the user specific, \
dynamic follow-up questions that only a human can answer. Good candidates: business rules or \
thresholds the code doesn't explain (magic numbers, special-cased IDs/values, unusual \
conditionals); decisions that look arbitrary or historical ("why is X handled differently from Y \
here?"); assumptions about external systems (rate limits, retry semantics, data shapes owned by \
another service); error-handling paths whose intent isn't obvious; and anything that contradicts or \
isn't covered by existing docs/comments. Skip anything the code already answers unambiguously — the \
goal is to close gaps you genuinely can't resolve by reading, not to interview the user about things \
you can already see. Group questions naturally, and if an answer opens a new gap, ask a follow-up \
rather than treating the first round as final.

6. For every answer the user gives, and every fact you're confident about directly from reading the \
code, call \`record_evidence\` with the right \`type\` (\`new-rule\` / \`correction\` / \
\`clarification\` / \`raw-note\`) and \`source\` (\`human\` for the user's own words, \
\`agent-inferred\` for what you concluded yourself).

7. Call \`list_evidence\` to review everything unsynthesized for this area, then write both:
   - \`write_doc\` — narrative, human-facing markdown under \`.ai/docs/\`: what this area does, why \
it's shaped the way it is, and the business logic/rules you uncovered.
   - \`write_context_chunk\` — the same understanding distilled for AI-agent consumption under \
\`.ai/context/\`, with \`area\` tags so a harness can retrieve it selectively.
   Scope the path/title of both to this area specifically (not the whole repo), and pass \
\`source_evidence_ids\` on both so the evidence is marked synthesized.

8. Report back to the user: what got documented (with the paths), what's still open or unanswered, \
and that they can run this prompt again on this area to refine it further, or on a different area \
next time.`;
}

export const documentAreaPrompt = {
  name: "document_area",
  title: "Document Area",
  description:
    "Investigates and documents one specific part of the system (a directory, module, feature, or " +
    "flow) for both humans (.ai/docs) and AI agents (.ai/context): reads the actual code, asks " +
    "dynamic follow-up questions tailored to what it finds (business rules, non-obvious decisions, " +
    "edge cases) instead of a fixed checklist, records the answers as evidence, then writes both " +
    "doc types. Lighter-weight than start_documentation — no drift check or repo-wide scan — meant " +
    "for frequent, incremental use as a team documents its apps area by area.",
  argsSchema: z.object({
    area: z
      .string()
      .optional()
      .describe(
        "The directory, module, feature, or flow to document, e.g. 'src/billing' or 'the checkout " +
          "flow'. If omitted, the agent asks the user.",
      ),
    confluence_links: z
      .string()
      .optional()
      .describe(
        "Optional: Confluence page URL(s) relevant to this area, space- or comma-separated. Fetched " +
          "via fetch_confluence_pages alongside anything named later in the conversation.",
      ),
  }),
  handler: async ({ area, confluence_links }: { area?: string; confluence_links?: string }) => ({
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text: buildInstructions(area, confluence_links) },
      },
    ],
  }),
};

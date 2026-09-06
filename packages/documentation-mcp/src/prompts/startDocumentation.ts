import * as z from "zod";

const INSTRUCTIONS = `Onboard this repository into the documentation-mcp workflow, or resync it after \
the code has moved on — this one prompt handles both. Work through the steps below in order, and \
stop to ask the user directly whenever a decision needs a human — do not guess or fabricate an \
answer on their behalf.

1. Call \`ensure_ai_dir\` on the repo root. It handles \`absent\` (creates the scaffold) and \
\`outdated\` (migrates/backfills) automatically, no confirmation needed — just check the result. \
If it reports \`non-conformant\`, show the user the \`files\` it found and ask whether to migrate \
(\`apply_ai_dir_migration\` with \`confirm: true\`) or leave it alone. Never migrate without an \
explicit yes.

2. If \`ensure_ai_dir\` reported \`status: "initialized"\` (a brand-new \`.ai/\`), skip straight to \
step 3 — there is nothing to compare drift against yet. Otherwise (\`conformant\` or \`upgraded\`, \
meaning this repo has been scanned before) call \`check_drift\`:
   - Not stale: tell the user the docs are already current with the code. Still worth asking if \
they want to redocument something specific anyway (e.g. a part of the repo skipped last time) — if \
not, stop here.
   - Stale: summarize what changed (\`changed_files\`, or \`last_scan_sha: null\` meaning never \
scanned) and ask directly: "N files changed since the last scan — want me to rescan and update the \
docs now?" If the user says no, stop and remind them they can resume anytime by re-running this \
prompt or calling \`check_drift\` directly. Only proceed past this point on a yes.

3. Ask the user what they want documented: the whole repo, or specific directories/packages (for \
example "just /src", or "packages/foo and packages/bar") — on a resync this can be folded into the \
same question as step 2's confirmation instead of asked separately. Wait for a real answer — don't \
assume everything is in scope.

4. Call \`scan_project\`. It always scans the whole repo, but use the user's answer from step 3 to \
decide where to focus your reading and where to aim \`write_doc\`/\`write_context_chunk\` output. \
Read the \`open_questions\` array in the result, plus anything else you notice is missing or \
unclear (undocumented directories, no tests, unclear ownership, etc.), and ask the user each one — \
individually or grouped, whichever reads naturally in conversation. Do not skip a question by \
inventing a plausible-sounding answer.

5. For every answer the user gives, and every fact you infer directly from reading the code, call \
\`record_evidence\` with the right \`type\` (\`new-rule\` / \`correction\` / \`clarification\` / \
\`raw-note\`) and \`source\` (\`human\` for the user's own words, \`agent-inferred\` for what you \
concluded yourself).

6. Call \`list_evidence\` to review everything unsynthesized, then write the actual documentation: \
\`write_doc\` for human-facing narrative under \`.ai/docs/\`, \`write_context_chunk\` for the \
distilled, agent-facing facts under \`.ai/context/\`. Scope both to what the user asked for in step \
3.

7. Call \`get_setup_status\` and summarize for the user: what got documented, what's still open or \
unanswered, and that re-running this prompt after future code changes checks for drift and offers \
to resync automatically.`;

export const startDocumentationPrompt = {
  name: "start_documentation",
  title: "Start Documentation",
  description:
    "Onboards this repo end-to-end, or resyncs it after the code has moved on: ensures .ai/ is " +
    "set up, checks for drift on a repo that's already been scanned and confirms with the user " +
    "before rescanning, asks what to focus on plus the open questions only a human can answer, " +
    "then writes .ai/docs and .ai/context from the answers. Run this any time — first pass or " +
    "later resync — instead of calling check_drift/scan_project directly.",
  argsSchema: z.object({}),
  handler: async () => ({
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text: INSTRUCTIONS },
      },
    ],
  }),
};

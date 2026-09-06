import * as z from "zod";

const INSTRUCTIONS = `Onboard this repository into the documentation-mcp workflow. Work through the \
steps below in order, and stop to ask the user directly whenever a decision needs a human — do \
not guess or fabricate an answer on their behalf.

1. Call \`ensure_ai_dir\` on the repo root. It handles \`absent\` (creates the scaffold) and \
\`outdated\` (migrates/backfills) automatically, no confirmation needed — just check the result. \
If it reports \`non-conformant\`, show the user the \`files\` it found and ask whether to migrate \
(\`apply_ai_dir_migration\` with \`confirm: true\`) or leave it alone. Never migrate without an \
explicit yes.

2. Before scanning, ask the user what they want documented: the whole repo, or specific \
directories/packages (for example "just /src", or "packages/foo and packages/bar"). Wait for a \
real answer — don't assume everything is in scope.

3. Call \`scan_project\`. It always scans the whole repo, but use the user's answer from step 2 to \
decide where to focus your reading and where to aim \`write_doc\`/\`write_context_chunk\` output. \
Read the \`open_questions\` array in the result, plus anything else you notice is missing or \
unclear (undocumented directories, no tests, unclear ownership, etc.), and ask the user each one — \
individually or grouped, whichever reads naturally in conversation. Do not skip a question by \
inventing a plausible-sounding answer.

4. For every answer the user gives, and every fact you infer directly from reading the code, call \
\`record_evidence\` with the right \`type\` (\`new-rule\` / \`correction\` / \`clarification\` / \
\`raw-note\`) and \`source\` (\`human\` for the user's own words, \`agent-inferred\` for what you \
concluded yourself).

5. Call \`list_evidence\` to review everything unsynthesized, then write the actual documentation: \
\`write_doc\` for human-facing narrative under \`.ai/docs/\`, \`write_context_chunk\` for the \
distilled, agent-facing facts under \`.ai/context/\`. Scope both to what the user asked for in step \
2.

6. Call \`get_setup_status\` and summarize for the user: what got documented, what's still open or \
unanswered, and that re-running this flow (or \`check_drift\`) after future code changes keeps it \
current.`;

export const startDocumentationPrompt = {
  name: "start_documentation",
  title: "Start Documentation",
  description:
    "Onboards this repo end-to-end: ensures .ai/ is set up, scans the project, asks the user " +
    "what to focus on plus the open questions only they can answer, then writes .ai/docs and " +
    ".ai/context from the answers. Run this to kick off (or resume) documenting a project.",
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

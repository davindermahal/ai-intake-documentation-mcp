import * as z from "zod";

const INSTRUCTIONS = `Author a new guide (or update an existing one) and publish it to the shared \
Confluence guide index that ai-intake-mcp reads from during ticket planning. Work through the \
steps below in order, and stop to ask the user directly whenever a decision needs a human — do \
not guess or fabricate an answer on their behalf, and never publish without an explicit yes.

1. Ask the user what this guide is for: a reusable version-upgrade guide (e.g. "Symfony 4->5 \
Upgrade"), or a "build-<xyz>-task" guide tied to a specific repo (e.g. how to add a migration in \
one particular app). For a repo-scoped guide, use the title convention \
"Build: <repo-name> — <task>" so ai-intake-mcp's planning-side matching can find it later; get a \
working title either way.

2. Call \`ensure_guide_index\` first (no arguments needed unless the user wants a non-default index \
page title) — this guarantees there's a real Confluence page to publish into, creating it on first \
use if none exists yet.

3. Call \`list_guides\`. If something close to what the user described already exists, ask whether \
to update that page (pass its \`link\` back in as \`page_id\` in step 6) or write a new one. Don't \
assume — a similar title doesn't necessarily mean the same guide.

4. Gather the actual content. Interview the user, and/or — if this session already has relevant \
repo context, e.g. you just finished implementing the task this guide describes — read the code/ \
evidence directly. Guides are written for AI-agent consumption, not humans, so hold every step to \
this bar:
   - Atomic, testable steps — one action per step, not a paragraph of prose.
   - Exact commands, not descriptions (\`composer require symfony/security-bundle:^5.0\`, not \
"update the security bundle").
   - Explicit checkpoints where tests must run before proceeding.
   - A clear, checkable "done" criterion for every step.

5. Draft the full guide as markdown and show it to the user for confirmation before doing anything \
else. Revise based on their feedback. Do not proceed to step 6 without an explicit yes.

6. Call \`sync_guide\` with the confirmed title, a one-line description, the markdown content, \
relevant tags, and \`page_id\` if step 3 identified an existing page to update.

7. Report the resulting Confluence URL back to the user, and confirm whether the publish created a \
new page or updated an existing one.`;

export const writeGuidePrompt = {
  name: "write_guide",
  title: "Write Guide",
  description:
    "Authors a new Confluence guide (or updates an existing one) for ai-intake-mcp's planning-time " +
    "guide lookup: interviews the user (or draws on this session's own repo context) for atomic, " +
    "agent-consumable steps, confirms the draft with the user, then publishes it via " +
    "ensure_guide_index/list_guides/sync_guide.",
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

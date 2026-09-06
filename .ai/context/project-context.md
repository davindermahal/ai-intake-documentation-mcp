# Project context (agent-facing)

- This repo builds `@davindermahal/documentation-mcp`, an MCP server that onboards other codebases
  for AI-agent-assisted development (scan → interview → living `.ai/docs`+`.ai/context` built
  from an evidence archive).
- It is a separate MCP server from `ai-intake-mcp` (Jira ticket-execution harness), sharing only
  a schema package (`@davindermahal/context-schema`), never runtime code.
- Rule: never write `.ai/intake-mcp.json` — that file is owned by `ai-intake-mcp`.
- Rule: `scan_project` and `record_evidence` require `.ai/setup-mcp.json` to already exist;
  `init_ai_scaffold` must run first and refuses if `.ai/` has non-conformant pre-existing content.
- Rule: evidence entries (`.ai/evidence/**/*.json`) are append-only and never rewritten;
  `docs/`/`context/` are the polished layer, regenerated from evidence, not hand-patched to match.
- Rule: all Jira ticket work and all planning work must have a plan file under `.ai/plans/`
  (`draft`/`active`/`completed`), written via `write_plan`. This is a hard requirement, not a
  nice-to-have — `ai-intake-harness` will write plans here too once its integration lands.
- The `start_documentation` MCP prompt (`src/prompts/startDocumentation.ts`) packages the whole
  detect → scan → ask → record → write flow as one callable prompt, no arguments. It is a plain
  instructional wrapper (returns one user-role text message) — it does not call any tool itself,
  so calling the tools directly in the documented order is equivalent.
- Current build phase: Phase 1 + Phase 2 done (detect/init/status/scan/record-evidence, legacy
  migration, evidence synthesis, drift detection), the plans lifecycle
  (`write_plan`/`list_plans`/`transition_plan`), and the `start_documentation` prompt.
- Distribution target: npm packages launched via `npx`, so config is identical across Claude Code
  and Gemini CLI. Both `@davindermahal/context-schema` and `@davindermahal/documentation-mcp` are
  published to npm at `0.1.1`.

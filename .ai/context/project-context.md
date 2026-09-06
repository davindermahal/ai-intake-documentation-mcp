# Project context (agent-facing)

- This repo builds `@davindermahal/documentation-mcp`, an MCP server that onboards other codebases
  for AI-agent-assisted development (scan → interview → living `.ai/docs`+`.ai/context` built
  from an evidence archive).
- It is a separate MCP server from `ai-intake-mcp` (Jira ticket-execution harness), sharing only
  a schema package (`@davindermahal/context-schema`), never runtime code.
- Rule: never write `.ai/intake-mcp.json` — that file is owned by `ai-intake-mcp`.
- Rule: `scan_project` and `record_evidence` require `.ai/setup-mcp.json` to already exist;
  `ensure_ai_dir` must run first. It self-heals `absent`/`outdated` automatically; on
  `non-conformant` it only reports the legacy files found — ask the user before calling
  `apply_ai_dir_migration` with `confirm: true`.
- Rule: evidence entries (`.ai/evidence/**/*.json`) are append-only and never rewritten;
  `docs/`/`context/` are the polished layer, regenerated from evidence, not hand-patched to match.
- Rule: all Jira ticket work and all planning work must have a plan file under `.ai/plans/`
  (`draft`/`active`/`completed`), written via `write_plan`. This is a hard requirement, not a
  nice-to-have — `ai-intake-harness` will write plans here too once its integration lands.
- Rule: legacy-`.ai/` migration (`apply_ai_dir_migration`) must stay non-destructive — copy-first,
  originals kept unless `remove_originals` is explicitly set.
- Users: developers/teams onboarding their own codebase via any MCP client; the author
  dogfooding this repo itself; `ai-intake-mcp` as a planned future integration consumer (reading
  `.ai/context/` during planning, calling `record_evidence` during implementation — not built yet).
- No compliance/perf/security constraints beyond the architectural invariants above — this is a
  local, stdio-transport dev tool with no end-user data.
- Deployment: no infra — published to npm, run via `npx -y @davindermahal/documentation-mcp` as a
  local stdio subprocess of the MCP client. CI (`.github/workflows/ci.yml`) only builds+tests on
  push/PR to `main`; it does not deploy anything.
- The `start_documentation` MCP prompt (`src/prompts/startDocumentation.ts`) packages the whole
  ensure → scan → ask → record → write flow as one callable prompt, no arguments. It is a plain
  instructional wrapper (returns one user-role text message) — it does not call any tool itself,
  so calling the tools directly in the documented order is equivalent.
- Tool count was deliberately reduced: `detect_ai_dir`/`init_ai_scaffold`/`upgrade_ai_dir`/
  `propose_ai_dir_migration` are gone, folded into one `ensure_ai_dir` tool. Only
  `apply_ai_dir_migration` stayed separate, since migrating foreign content is destructive and
  needs an explicit human `confirm: true` a single tool call can't pause mid-execution to obtain.
- Current build phase: Phase 1 + Phase 2 done (ensure/status/scan/record-evidence, legacy
  migration, evidence synthesis, drift detection), the plans lifecycle
  (`write_plan`/`list_plans`/`transition_plan`), and the `start_documentation` prompt.
- Distribution target: npm packages launched via `npx`, so config is identical across Claude Code
  and Gemini CLI. Both `@davindermahal/context-schema` and `@davindermahal/documentation-mcp` are
  published to npm at `0.1.1`.

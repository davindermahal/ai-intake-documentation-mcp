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
  ensure → check-drift → scan → ask → record → write flow as one callable prompt, no arguments. On
  a repo already scanned before (`ensure_ai_dir` status `conformant`/`upgraded`, not a fresh
  `initialized`), it opens with `check_drift` and, if stale, must summarize `changed_files` and get
  an explicit yes from the user before calling `scan_project` — never rescan silently. It is a
  plain instructional wrapper (returns one user-role text message) — it does not call any tool
  itself, so calling the tools directly in the documented order is equivalent. This resync-aware
  behavior was added specifically so a user doesn't have to call `check_drift`/`scan_project` as
  raw tools and be left to figure out the next step themselves — that gap was direct user feedback.
- The `document_area` MCP prompt (`src/prompts/documentArea.ts`) is the lighter counterpart for
  documenting one directory/module/feature/flow at a time: it takes an optional `area` argument,
  skips `check_drift`/`scan_project` entirely, and its instructions are built by a function of
  `area` rather than a static string (step 1 confirms the given scope vs. asking for one). Its
  step 4 explicitly tells the agent to derive follow-up questions from what it actually read in
  that area — not `scan_project`'s fixed `open_questions` (which are generic
  purpose/users/constraints questions that don't fit a narrow investigation). Added on direct user
  feedback that teams documenting an already-onboarded repo incrementally, area by area, shouldn't
  pay the onboarding/drift-check ceremony on every single call.
- Tool count was deliberately reduced: `detect_ai_dir`/`init_ai_scaffold`/`upgrade_ai_dir`/
  `propose_ai_dir_migration` are gone, folded into one `ensure_ai_dir` tool. Only
  `apply_ai_dir_migration` stayed separate, since migrating foreign content is destructive and
  needs an explicit human `confirm: true` a single tool call can't pause mid-execution to obtain.
  `check_drift` and `scan_project` stayed separate tools too (different cost/side-effects — a
  cheap read vs. a cache-mutating scan), with the resync UX unified at the prompt layer instead.
- Current build phase: Phase 1 + Phase 2 done (ensure/status/scan/record-evidence, legacy
  migration, evidence synthesis, drift detection), the plans lifecycle
  (`write_plan`/`list_plans`/`transition_plan`), and the resync-aware `start_documentation` prompt.
- Distribution target: npm packages launched via `npx`, so config is identical across Claude Code
  and Gemini CLI. Both `@davindermahal/context-schema` and `@davindermahal/documentation-mcp` are
  published to npm at `0.1.1`.

# ai-intake-documentation-mcp

An MCP server that onboards a codebase for AI-agent-assisted development: it scans the project,
asks the questions only a human can answer (purpose, target users, constraints), and maintains
living documentation under `.ai/` — one set for humans, one distilled for AI coding agents — built
from an append-only evidence archive so nothing is lost and every fact is traceable.

Works with Claude Code, Gemini CLI, or any other MCP-capable client, and alongside (but
independently of) [`ai-intake-mcp`](#relationship-to-ai-intake-mcp), a separate Jira
ticket-execution harness.

## Status

**Phase 1 + Phase 2 done**, plus a plans lifecycle: scan a repo, detect/initialize `.ai/`, record
evidence, ingest pre-existing/legacy `.ai/` content, fold evidence into polished docs, detect
drift, and track plans through draft/active/completed. See
[`.ai/docs/project-context.md`](.ai/docs/project-context.md) for the full picture and
[`.ai/evidence/onboarding/`](.ai/evidence/onboarding/) for the design record this was built from.

**All Jira ticket work and all planning work must have a plan file under `.ai/plans/`** — see the
[Tools](#tools) table below.

## Why documentation lives in two places

- **`.ai/docs/`** — narrative, for a human building a mental model: rationale, history, "why we
  chose X over Y."
- **`.ai/context/`** — distilled, for an AI agent: terse factual statements and business rules,
  chunked so a harness can load only what's relevant to a given task instead of everything.

Both are regenerated from **`.ai/evidence/`**, an append-only archive of raw human answers, agent
discoveries, and corrections — the evidence is the actual source of truth; the docs are a view
onto it. See [`.ai/docs/architecture.md`](.ai/docs/architecture.md) for the full schema.

## Repo structure

```
packages/
  context-schema/       @davindermahal/context-schema — shared .ai/ types, validators, fs helpers
  documentation-mcp/     @davindermahal/documentation-mcp — the MCP server
.ai/                      this project's own onboarding output (dogfooded)
  plans/                    draft/ active/ completed/ — required for all ticket + planning work
```

A monorepo purely for development convenience (one commit can touch the schema and its consumer
together) — each package still publishes to npm independently.

## Getting started

```bash
npm install
npm run build          # builds both packages
```

Build `context-schema` before `documentation-mcp` if building manually with `tsc` instead of the
root script — the server imports the schema package's compiled output.

### Add it to an MCP client

**Claude Code** (`.mcp.json` at a repo root, or `claude mcp add`):
```json
{
  "mcpServers": {
    "documentation-mcp": {
      "command": "node",
      "args": ["path/to/ai-intake-documentation-mcp/packages/documentation-mcp/dist/index.js"]
    }
  }
}
```

**Gemini CLI** (`~/.gemini/settings.json` or `.gemini/settings.json`) uses the same
`mcpServers`/`command`/`args` shape.

This repo's own [`.mcp.json`](.mcp.json) already points at the local build, so it's usable
directly from a Claude Code session opened here. Once published to npm, `command`/`args` becomes
`npx -y @davindermahal/documentation-mcp` instead of a local path — identical config in both clients.

### Kicking off documentation

Rather than calling tools one at a time, run the `start_documentation` prompt — in Claude Code
that's the slash command `/mcp__documentation-mcp__start_documentation` (no arguments needed). It
walks the agent through the whole flow in one go: detect/initialize `.ai/`, and — on a repo that's
already been scanned before — check for drift first and confirm with you before rescanning rather
than dumping a raw diff and leaving you to figure out the next step. From there it asks what to
focus the scan on, runs `scan_project`, asks you its `open_questions` (and anything else it
notices missing) instead of guessing, records your answers as evidence, and writes the resulting
`.ai/docs` / `.ai/context`. Re-run it any time — first pass or later resync — instead of calling
`check_drift`/`scan_project` directly.

To document one specific part of the system instead of the whole repo, run `document_area`
(`/mcp__documentation-mcp__document_area`, optionally with an `area` argument like `src/billing`).
It skips the drift check and whole-repo scan, has the agent actually read the code in that area,
asks dynamic follow-up questions derived from what it finds there — business rules, non-obvious
decisions, edge cases — rather than a fixed checklist, then writes `.ai/docs` / `.ai/context`
scoped to just that area. This is the prompt to reach for repeatedly as a team documents its apps
incrementally, one area at a time.

## Tools

| Tool | Does |
|---|---|
| `ensure_ai_dir` | Gets `.ai/` into a good state in one call: `absent` → creates the scaffold + manifest, `outdated` (ours, but stale) → migrates/backfills automatically, `conformant` → no-op. `non-conformant` (foreign content already there) is never touched automatically — returns the files found so you can ask before calling `apply_ai_dir_migration`. Always call this first. |
| `get_setup_status` | Reads back the manifest: last scan/synthesis time, pending evidence counts, `needs_resync`. |
| `scan_project` | Read-only repo scan: manifest files and infra signals up to 2 directories deep (catches a frontend/api-style split, not just root), root-only CI config, existing human docs (README/CONTRIBUTING) and existing AI-agent docs (`AGENTS.md`/`CLAUDE.md`/`.cursorrules`/`.github/copilot-instructions.md`) separately, plus open questions only a human can answer. Requires `.ai/` to be initialized first. |
| `record_evidence` | Appends an immutable evidence entry (`new-rule` / `correction` / `clarification` / `raw-note`; source `human` / `agent-inferred` / `legacy-doc` / `existing-docs`). A `correction` sets `needs_resync`. Requires `.ai/` to be initialized first. |
| `apply_ai_dir_migration` | Ingests a non-conformant `.ai/`'s content as legacy evidence (`source: "legacy-doc"`), then scaffolds normally. Requires `confirm: true`; originals are kept unless `remove_originals` is set. |
| `list_evidence` | Reads back evidence entries (unsynthesized by default) for the calling agent to review before writing docs/context. |
| `write_doc` | Commits agent-authored markdown to `.ai/docs/<path>`. Marks any referenced evidence synthesized and recomputes the manifest's pending counters. |
| `write_context_chunk` | Same, to `.ai/context/<path>`, plus a `.meta.json` sidecar (title/area/risk) so a harness can retrieve chunks selectively by area. |
| `check_drift` | Compares the manifest's `last_scan_sha` to current git HEAD; returns changed files if stale. Separate concern from `needs_resync` (evidence staleness). |
| `write_plan` | Creates a plan file — **required for all Jira ticket work and all planning work**. Starts `draft` by default; filename is `<date>-<slug>.md` (or `<ticket_key>-<date>-<slug>.md`), auto-deduplicated on collision. |
| `list_plans` | Returns full plan metadata + content, optionally filtered by `status` and/or `ticket_key`. |
| `transition_plan` | Moves a plan between `draft`/`active`/`completed` — physically relocates the file, not just a status flag. Sets `approved_at` the first (and only the first) time a plan reaches `active`. |

Typical call order: `ensure_ai_dir` → (if it reports `non-conformant`, ask the user, then
`apply_ai_dir_migration`) → `scan_project` → `record_evidence` (as needed) → `list_evidence` →
`write_doc` / `write_context_chunk` → `get_setup_status` / `check_drift`. Independently, for any
ticket or planning work: `write_plan` → `transition_plan` (draft → active on approval → completed
when done).

## Relationship to `ai-intake-mcp`

`ai-intake-mcp` is a separate, already-existing repo — a Jira ticket-execution harness
(`tracker_get_issue`, `implement_ticket`, `approve_plan`, `worktree_create`, etc.) that auto-writes
`.ai/intake-mcp.json` on first tracker use. This project never touches that file. The two stay
separate servers (different lifecycle, different blast radius) but share the `.ai/` schema via
`@davindermahal/context-schema`, so their file layout can't drift even though they're released
independently. The planned integration — the harness reading `.ai/context/` during planning and
calling `record_evidence` during implementation — is tracked as future work, not yet built here.

## Development

- `npm run build` — builds both packages (`tsc`).
- `npm run clean` — removes `dist/` in both packages.
- `npm test` — runs the [Vitest](https://vitest.dev) suite (`packages/*/test/**/*.test.ts`),
  covering everything the manual smoke-test scripts used to: every `ensure_ai_dir` state (absent,
  outdated with missing-directory backfill, an unmigratable `schema_version` failing cleanly,
  non-conformant repos left untouched), `scan_project`'s depth search and `existing_agent_docs`
  detection, evidence recording + synthesis, the legacy-`.ai/` migration flow, and the plans
  lifecycle (including the collision-suffix case).
- CI (`.github/workflows/ci.yml`) runs `npm run build` + `npm test` on push/PR to `main`.

### Releasing to npm

Publishing is **not** automatic on merge to `main` — it only happens when a release tag is pushed,
and bumping the version is a deliberate manual step (this repo's `.ai/plans/` convention is to only
cut a release once the relevant plan is `Status: complete, verdict GO`).

To release a package (e.g. `documentation-mcp`):

1. Bump `"version"` in `packages/<package-dir>/package.json` and commit it.
2. Tag that commit `<package-dir>@<semver>` (must match the version you just set) and push the tag:
   ```bash
   git tag -a documentation-mcp@0.5.0 -m "documentation-mcp 0.5.0"
   git push origin documentation-mcp@0.5.0
   ```

Pushing a tag matching `*@*` triggers `.github/workflows/release.yml`, which:

1. Parses `<package-dir>@<semver>` from the tag and confirms `packages/<package-dir>/package.json`
   exists.
2. Verifies the tag's version matches that package's `package.json` version at that commit.
3. Confirms the target package isn't `private` and the repo root still is (root `package.json` is
   `"private": true` so the monorepo itself can never be published).
4. Builds `confluence-client` → `context-schema` → `documentation-mcp` in that explicit dependency
   order (not `--workspaces`' alphabetical order — `documentation-mcp` needs `confluence-client`'s
   compiled types).
5. Runs `npm test`.
6. Publishes with `npm publish --workspace packages/<package-dir>`, authenticating via OIDC trusted
   publishing (`id-token: write` permission — no `NPM_TOKEN` secret). This requires a one-time
   Trusted Publisher entry on the package's npmjs.com settings page naming this exact repo + this
   exact workflow filename.

## License

[MIT](LICENSE)

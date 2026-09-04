# ai-intake-documentation-mcp

An MCP server that onboards a codebase for AI-agent-assisted development: it scans the project,
asks the questions only a human can answer (purpose, target users, constraints), and maintains
living documentation under `.ai/` — one set for humans, one distilled for AI coding agents — built
from an append-only evidence archive so nothing is lost and every fact is traceable.

Works with Claude Code, Gemini CLI, or any other MCP-capable client, and alongside (but
independently of) [`ai-intake-mcp`](#relationship-to-ai-intake-mcp), a separate Jira
ticket-execution harness.

## Status

**Phase 1** (this repo, done): scan a repo, detect/initialize `.ai/`, record evidence.
**Phase 2** (not built yet): fold evidence into polished docs, ingest pre-existing/legacy `.ai/`
content, drift detection. See [`.ai/docs/project-context.md`](.ai/docs/project-context.md) for
the full picture and [`.ai/evidence/onboarding/`](.ai/evidence/onboarding/) for the design record
this was built from.

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
  context-schema/       @ai-intake/context-schema — shared .ai/ types, validators, fs helpers
  documentation-mcp/     @ai-intake/documentation-mcp — the MCP server
.ai/                      this project's own onboarding output (dogfooded)
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
`npx -y @ai-intake/documentation-mcp` instead of a local path — identical config in both clients.

## Tools

| Tool | Does |
|---|---|
| `detect_ai_dir` | Reports `absent` / `conformant` / `non-conformant` for a repo's `.ai/` — read-only, always safe to call. |
| `init_ai_scaffold` | Creates `.ai/{docs,context,evidence,cache}` + a manifest. Refuses if `.ai/` already has non-conformant content. Idempotent once conformant. |
| `get_setup_status` | Reads back the manifest: last scan/synthesis time, pending evidence counts, `needs_resync`. |
| `scan_project` | Read-only repo scan (manifest files, CI config, infra signals, existing docs) plus a list of open questions only a human can answer. Requires `.ai/` to be initialized first. |
| `record_evidence` | Appends an immutable evidence entry (`new-rule` / `correction` / `clarification` / `raw-note`). A `correction` sets `needs_resync`. Requires `.ai/` to be initialized first. |

Typical call order: `detect_ai_dir` → `init_ai_scaffold` → `scan_project` → `record_evidence` (as
needed) → `get_setup_status`.

## Relationship to `ai-intake-mcp`

`ai-intake-mcp` is a separate, already-existing repo — a Jira ticket-execution harness
(`tracker_get_issue`, `implement_ticket`, `approve_plan`, `worktree_create`, etc.) that auto-writes
`.ai/intake-mcp.json` on first tracker use. This project never touches that file. The two stay
separate servers (different lifecycle, different blast radius) but share the `.ai/` schema via
`@ai-intake/context-schema`, so their file layout can't drift even though they're released
independently. The planned integration — the harness reading `.ai/context/` during planning and
calling `record_evidence` during implementation — is tracked as future work, not yet built here.

## Development

- `npm run build` — builds both packages (`tsc`).
- `npm run clean` — removes `dist/` in both packages.
- No test suite yet; verification so far has been a manual smoke-test script exercising all five
  tools against a scratch repo (absent → init → conformant → scan → record evidence → status).

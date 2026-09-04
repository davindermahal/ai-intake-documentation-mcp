# Architecture

## Layout

```
ai-intake-documentation-mcp/       npm workspaces monorepo
  packages/
    context-schema/                 @ai-intake/context-schema
    documentation-mcp/               @ai-intake/documentation-mcp
  .ai/                               this repo's own onboarding output (dogfooded)
```

Monorepo is a dev-convenience choice, not a distribution one: a change touching the schema and
its one consumer here is one commit instead of two coordinated releases. Each package still
publishes to npm independently — a user installing `@ai-intake/documentation-mcp` never touches
the monorepo or the schema package's source directly.

## `@ai-intake/context-schema`

Pure data layer: path constants, TypeScript types, zod validators, and thin fs read/write helpers
for the `.ai/` directory (`paths.ts`, `manifest.ts`, `evidence.ts`, `context.ts`). Deliberately
excludes Jira/git/LLM logic and MCP tool definitions — both servers depend on it, so it stays
boring and side-effect-free by design rather than by discipline.

## `@ai-intake/documentation-mcp`

The MCP server itself (stdio transport, `@modelcontextprotocol/server` v2). Each tool is a plain
`{ name, description, inputSchema, handler }` object under `src/tools/`, registered in
`src/index.ts`. Tool call order encodes the actual dependency graph:

`detect_ai_dir` → `init_ai_scaffold` (refuses on non-conformant) → `scan_project` /
`record_evidence` (both require an initialized manifest) → `get_setup_status` (reads it back).

## `.ai/` directory schema

```
.ai/
  setup-mcp.json        # manifest: schema_version, last_scan_sha, last_synthesis_at,
                          #  evidence_pending_count, evidence_pending_corrections,
                          #  needs_resync, doc_index
  intake-mcp.json        # NOT ours — owned by ai-intake-mcp, we only ever read it
  cache/
    last-scan.json        # overwritten each scan_project run — a cache, not an archive
  evidence/
    onboarding/*.json       # human/legacy evidence not tied to a ticket
    tickets/*.json           # evidence recorded during ai-intake-mcp ticket work
  docs/                     # human-readable — narrative, rationale, diagrams
  context/                  # agent-facing — distilled, chunked by area (Phase 2)
```

Evidence entries are append-only JSON (not markdown+frontmatter — simpler to validate reliably,
and evidence is an audit trail, not something meant to be read as prose). `docs/` and `context/`
stay markdown since both humans and LLMs read that well; the split between them is about content
strategy (narrative vs. distilled/chunked-for-retrieval), not file format.

## Why `scan_project` and `record_evidence` require `init_ai_scaffold` first

Both write into `.ai/` (a cache file, or a new evidence entry + manifest update). Letting them run
before `.ai/` exists would mean the first thing to touch a fresh repo silently creates a
non-conformant `.ai/` directory that `detect_ai_dir` would then flag as a conflict — so the
manifest's existence is the gate, not an inconvenience.

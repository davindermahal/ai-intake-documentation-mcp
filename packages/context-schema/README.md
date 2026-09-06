# @davindermahal/context-schema

Shared types, validators, and file I/O helpers for the `.ai/` project-context directory layout
used by [`@davindermahal/documentation-mcp`](https://www.npmjs.com/package/@davindermahal/documentation-mcp)
and, once its integration lands, `ai-intake-mcp`.

Deliberately excludes Jira/git/LLM logic and MCP tool definitions — this package is the boring,
side-effect-free data layer both servers depend on, so the `.ai/` file layout can't drift between
them even though they're released independently.

## What's in here

- `paths.ts` — path constants for the `.ai/` scaffold (`docs/`, `context/`, `evidence/`, `plans/`,
  the manifest file, etc.)
- `manifest.ts` — the `.ai/setup-mcp.json` manifest's types and read/write helpers
- `migrations.ts` — `schema_version` migration steps for upgrading an older manifest in place
- `evidence.ts` — types and helpers for the append-only `.ai/evidence/` archive
- `context.ts` — types and helpers for `.ai/context/` chunks and their `.meta.json` sidecars
- `plans.ts` — types and helpers for the `.ai/plans/{draft,active,completed}` lifecycle

## Usage

This package isn't meant to be installed directly by end users — it's a dependency of
`@davindermahal/documentation-mcp`. If you're building a second MCP server that needs to read or
write the same `.ai/` schema, install it directly:

```bash
npm install @davindermahal/context-schema
```

## License

MIT — see the [full repo](https://github.com/davindermahal/ai-intake-documentation-mcp) for
license text and source.

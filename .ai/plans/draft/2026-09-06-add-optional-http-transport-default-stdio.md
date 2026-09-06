# Add optional HTTP transport (default stdio)

## Motivation

Same motivation as the companion plan in `ai-intake-mcp` (see that repo's
`.ai/plans/draft/2026-09-06-migrate-to-modelcontextprotocol-server-v2-and-add-http-transport.md`
for the full writeup) — users without `gemini-sandbox-toolkit` currently have to spawn a fresh
local stdio process per client, which means paying this package's setup cost (Node version, any
native deps it picks up) on every single session start. This package is **already on the v2 SDK**
(`@modelcontextprotocol/server@^2.0.0`), so unlike `ai-intake-mcp` there's no migration step here
— this plan is HTTP transport only, kept as its own plan since it's a different repo with its own
release cycle, not because the work itself is unrelated.

Default behavior must not change: stdio stays the default transport. HTTP is opt-in.

## Proposed design

Add `@modelcontextprotocol/node` as a new dependency (the plain-`node:http` adapter — no framework
needed) and add a transport-selection block to `main()` in
`packages/documentation-mcp/src/index.ts`, using the **same env var contract** as `ai-intake-mcp`
for consistency across both servers:

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import {
  NodeStreamableHTTPServerTransport,
  localhostHostValidation,
  localhostOriginValidation,
} from "@modelcontextprotocol/node";
import { createServer } from "node:http";

async function main(): Promise<void> {
  if (process.env.MCP_TRANSPORT === "http") {
    const port = Number(process.env.MCP_HTTP_PORT ?? 3940); // one above ai-intake-mcp's 3939
    const validateHost = localhostHostValidation();
    const validateOrigin = localhostOriginValidation();
    createServer(async (req, res) => {
      if (!validateHost(req, res) || !validateOrigin(req, res)) return;
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    }).listen(port, "127.0.0.1");
    console.error(`documentation-mcp listening on http://127.0.0.1:${port}/mcp`);
  } else {
    await server.connect(new StdioServerTransport());
  }
}
```

`localhostHostValidation()` / `localhostOriginValidation()` are `@modelcontextprotocol/node`'s own
defaults for this exact scenario — loopback-only, reject cross-origin — matching "one user
runs their own instance," not a network-exposed shared service.

**Note found while researching this:** the installed `@modelcontextprotocol/server@2.0.0` package
also exports a `createMcpHandler` helper (a web-standard `Request → Response` factory, for use with
`WebStandardStreamableHTTPServerTransport` on runtimes like Cloudflare Workers/Deno/Bun rather than
plain Node). Not used here — this server runs as a plain local Node process, so
`NodeStreamableHTTPServerTransport` from `@modelcontextprotocol/node` (which speaks Node's native
`IncomingMessage`/`ServerResponse`) is the right fit, per the SDK's own decision rule: "if your
handler receives a Node `IncomingMessage`/`ServerResponse`, use `@modelcontextprotocol/node`; if
it receives a web-standard `Request`, use `@modelcontextprotocol/server` directly." Worth knowing
this exists if this package is ever deployed to a non-Node runtime.

## Key decisions (already made, not open)

- **Default transport stays stdio.** HTTP is opt-in via `MCP_TRANSPORT=http`.
- **Same env var names as `ai-intake-mcp`** (`MCP_TRANSPORT`, `MCP_HTTP_PORT`), different default
  port, so a user running both locally doesn't collide by default.
- **No shared/hosted server for now** — same reasoning as the companion plan; each user runs
  their own local instance.

## Open questions (resolved)

1. **Port default (`3940`)** — **kept as-is.** `3939`/`3940` don't collide with common dev-server
   defaults (3000, 5173, 8080, etc.) and this is a single-user local instance, not a shared service,
   so the collision risk is low enough not to warrant requiring `MCP_HTTP_PORT` explicitly.
2. **Test coverage for the HTTP path** — **added.** `packages/documentation-mcp/test/http-transport.test.ts`
   spins up the real `NodeStreamableHTTPServerTransport` HTTP listener on an ephemeral port and
   covers: a real `initialize` round-trip returning `serverInfo`, and 403 rejection for spoofed
   `Host`/`Origin` headers. This required exporting `createMcpServer()` and
   `createHttpRequestListener()` from `index.ts` (previously everything lived inline in `main()`)
   and guarding the `main().catch(...)` CLI bootstrap behind an `import.meta.url` check, so the
   module can be imported by tests without starting a real transport as a side effect.
3. **Any state this server holds that a persistent HTTP instance changes the story on** — **confirmed
   fine.** Every tool (`write_doc`, `write_plan`, `list_plans`, `get_setup_status`, etc.) already
   takes an optional `repo_root` parameter and falls back to `process.cwd()` only as a default —
   none of them hard-depend on `process.cwd()`. No tool needs to be restricted to stdio-only.

## Verification

1. `npm run build && npm test` (workspace-wide, `packages/*`) — must still pass unchanged.
2. stdio smoke test (regression): the existing `gemini-sandbox-toolkit` `debug.sh` handshake check
   against this package's baked-in image install is the reference — reuse that exact check locally.
3. HTTP smoke test (new): `MCP_TRANSPORT=http node packages/documentation-mcp/dist/index.js &`,
   then a real HTTP `initialize` POST to `http://127.0.0.1:3940/mcp`, confirming the same
   `serverInfo` response stdio returns.
4. If any tool is found to depend on `process.cwd()` per Open question 3, confirm it either already
   receives an explicit path parameter for the affected call, or document that tool as stdio-only
   until it's fixed — don't ship the HTTP transport with a silently-broken tool under it.
5. Confirm `gemini mcp add documentation-mcp http://127.0.0.1:3940/mcp --transport http` on a real
   `gemini` (not sandboxed) actually lists and calls a tool end to end.

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

## Known limitation: `gemini-sandbox` (Docker) is not supported

Confirmed by testing directly against the `gemini-sandbox-toolkit` image (not just reasoned about):

1. `gemini-sandbox` runs `gemini` inside a Docker container with `--add-host
   host.docker.internal:host-gateway` (found in the installed CLI's bundled sandbox code) — it does
   **not** use `--network host`. So `127.0.0.1` inside the container is the container itself, not
   the host.
2. Our server binds strictly to `127.0.0.1` on the host. From inside the sandbox container, `curl`
   to both `http://127.0.0.1:3940` and `http://host.docker.internal:3940` got connection-refused
   (`curl` exit 7) — confirmed with a real `gemini-sandbox -s -p "..."` run too (it reported "MCP
   issues detected" and never connected to the server).
3. Isolating the two causes with a throwaway listener: binding to `0.0.0.0` instead of `127.0.0.1`
   *does* make the host reachable from inside the container via `host.docker.internal`.
4. But even then, `localhostHostValidation()` still rejects it — `403 {"error":{"message":"Invalid
   Host: host.docker.internal"}}` — since it only allows `localhost`/`127.0.0.1`/`[::1]`.

So HTTP transport, as implemented, only works for **direct, unsandboxed** `gemini` pointed at a
locally-run instance. Making it reachable from `gemini-sandbox` would require binding wider than
loopback and widening the Host/Origin allowlist to include `host.docker.internal` — a real, and
explicitly declined, loosening of the "loopback-only, single local instance" security posture this
plan chose (see Key decisions above). `gemini-sandbox` users should keep using the existing
stdio-based baked-in image registration (`gemini-sandbox-toolkit`'s `install.sh`), which is
unaffected by this — the stdio smoke test in Verification below reconfirms it still works.

If sandbox support is wanted later, the design change (opt-in wider bind + allowlist) can be a
separate plan — not folded in here silently.

## Verification

1. **`npm run build && npm test`** — pass. 11 test files, 46 tests (43 pre-existing + 3 new in
   `packages/documentation-mcp/test/http-transport.test.ts`).
2. **stdio smoke test (regression)** — pass. `gemini-sandbox-toolkit`'s `./debug.sh` handshake
   check against the baked-in image install returned `[OK]` for `ai-intake-mcp`,
   `ai-intake-documentation-mcp`, and `chrome-devtools-mcp`, all unaffected by this change.
3. **HTTP smoke test** — pass. `MCP_TRANSPORT=http node packages/documentation-mcp/dist/index.js`,
   then a real HTTP `initialize` POST to `http://127.0.0.1:3940/mcp`, returned the same `serverInfo`
   stdio returns. Also confirmed spoofed `Host`/`Origin` headers get `403`.
4. **`process.cwd()` audit** — pass. Every tool already takes an optional `repo_root` parameter and
   falls back to `process.cwd()` only as a default; none is stdio-only.
5. **Real `gemini` end-to-end (unsandboxed)** — pass. `gemini mcp add documentation-mcp-http-test
   http://127.0.0.1:3940/mcp --transport http` connected, and a non-interactive `gemini -p "..."`
   call to `get_setup_status` with an explicit `repo_root` round-tripped correctly
   (`{"status":"not-initialized"}` for a fresh scratch repo).
6. **`gemini-sandbox` (Docker) end-to-end** — **fails, as documented above.** Not a regression (it
   never worked, and was never claimed to) — recorded here as a tested and confirmed limitation,
   not an open question.

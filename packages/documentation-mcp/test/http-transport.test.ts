import { createServer, request as httpRequest, type Server } from "node:http";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHttpRequestListener, createMcpServer } from "../src/index.js";

// Read the real version rather than hardcoding a copy of it -- a hardcoded literal here is
// exactly what let src/index.ts's own serverInfo.version silently drift to "0.1.0" through two
// real releases (0.1.1, 0.2.0) before anyone noticed: this test kept "passing" the whole time
// because it was asserting the same stale value the source had, not the real one.
const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require("../package.json") as { version: string };

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer(createHttpRequestListener(createMcpServer()));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected an AddressInfo");
  port = address.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

function postInitialize(headers: Record<string, string> = {}): Promise<{ statusCode: number; body: string }> {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "http-transport-test", version: "0.0.0" },
    },
  });

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: "/mcp",
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "content-length": Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

describe("HTTP transport", () => {
  it("responds to an initialize request with the server's info", async () => {
    const { statusCode, body } = await postInitialize();
    expect(statusCode).toBe(200);

    const dataLine = body.split("\n").find((line) => line.startsWith("data: "));
    const parsed = JSON.parse(dataLine!.slice("data: ".length));
    expect(parsed.result.serverInfo).toEqual({ name: "documentation-mcp", version: PKG_VERSION });
  });

  it("rejects a request with a non-localhost Host header", async () => {
    const { statusCode } = await postInitialize({ host: "evil.example.com" });
    expect(statusCode).toBe(403);
  });

  it("rejects a request with a non-localhost Origin header", async () => {
    const { statusCode } = await postInitialize({ origin: "https://evil.example.com" });
    expect(statusCode).toBe(403);
  });
});

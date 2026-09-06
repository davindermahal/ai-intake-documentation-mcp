#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import {
  NodeStreamableHTTPServerTransport,
  localhostHostValidation,
  localhostOriginValidation,
} from "@modelcontextprotocol/node";
import { ensureAiDirTool } from "./tools/ensureAiDir.js";
import { getSetupStatusTool } from "./tools/getSetupStatus.js";
import { scanProjectTool } from "./tools/scanProject.js";
import { recordEvidenceTool } from "./tools/recordEvidence.js";
import { applyAiDirMigrationTool } from "./tools/applyAiDirMigration.js";
import { listEvidenceTool } from "./tools/listEvidence.js";
import { writeDocTool } from "./tools/writeDoc.js";
import { writeContextChunkTool } from "./tools/writeContextChunk.js";
import { checkDriftTool } from "./tools/checkDrift.js";
import { writePlanTool } from "./tools/writePlan.js";
import { listPlansTool } from "./tools/listPlans.js";
import { transitionPlanTool } from "./tools/transitionPlan.js";
import { startDocumentationPrompt } from "./prompts/startDocumentation.js";

const TOOLS = [
  ensureAiDirTool,
  getSetupStatusTool,
  scanProjectTool,
  recordEvidenceTool,
  applyAiDirMigrationTool,
  listEvidenceTool,
  writeDocTool,
  writeContextChunkTool,
  checkDriftTool,
  writePlanTool,
  listPlansTool,
  transitionPlanTool,
];

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "documentation-mcp", version: "0.1.0" });

  for (const tool of TOOLS) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, tool.handler as never);
  }

  server.registerPrompt(
    startDocumentationPrompt.name,
    {
      title: startDocumentationPrompt.title,
      description: startDocumentationPrompt.description,
      argsSchema: startDocumentationPrompt.argsSchema,
    },
    startDocumentationPrompt.handler as never,
  );

  return server;
}

/** Loopback-only Streamable HTTP request listener: rejects DNS-rebinding-style Host/Origin headers. */
export function createHttpRequestListener(
  server: McpServer,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  return async (req, res) => {
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  };
}

async function main(): Promise<void> {
  const server = createMcpServer();

  if (process.env.MCP_TRANSPORT === "http") {
    const port = Number(process.env.MCP_HTTP_PORT ?? 3940);
    createServer(createHttpRequestListener(server)).listen(port, "127.0.0.1");
    console.error(`documentation-mcp listening on http://127.0.0.1:${port}/mcp`);
  } else {
    await server.connect(new StdioServerTransport());
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

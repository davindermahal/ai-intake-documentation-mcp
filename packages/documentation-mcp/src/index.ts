#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { detectAiDirTool } from "./tools/detectAiDir.js";
import { initAiScaffoldTool } from "./tools/initAiScaffold.js";
import { getSetupStatusTool } from "./tools/getSetupStatus.js";
import { scanProjectTool } from "./tools/scanProject.js";
import { recordEvidenceTool } from "./tools/recordEvidence.js";
import { proposeAiDirMigrationTool } from "./tools/proposeAiDirMigration.js";
import { applyAiDirMigrationTool } from "./tools/applyAiDirMigration.js";
import { listEvidenceTool } from "./tools/listEvidence.js";
import { writeDocTool } from "./tools/writeDoc.js";
import { writeContextChunkTool } from "./tools/writeContextChunk.js";
import { checkDriftTool } from "./tools/checkDrift.js";

const TOOLS = [
  detectAiDirTool,
  initAiScaffoldTool,
  getSetupStatusTool,
  scanProjectTool,
  recordEvidenceTool,
  proposeAiDirMigrationTool,
  applyAiDirMigrationTool,
  listEvidenceTool,
  writeDocTool,
  writeContextChunkTool,
  checkDriftTool,
];

async function main() {
  const server = new McpServer({ name: "documentation-mcp", version: "0.1.0" });

  for (const tool of TOOLS) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, tool.handler as never);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

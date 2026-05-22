#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createToolDefinitions } from "./tools.js";

const GITGRANT_API_URL = process.env.GITGRANT_API_URL || "https://api.gitgrant.app";
const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || "0x0000000000000000000000000000000000000000";
const CHAIN_ID = Number(process.env.CHAIN_ID || 84532);

const server = new McpServer({
  name: "gitgrant",
  version: "0.1.0",
  description:
    "GitGrant — onchain bounties for open source. Create, claim, submit, and release bounties directly from AI agents.",
});

const tools = createToolDefinitions({
  apiUrl: GITGRANT_API_URL,
  rpcUrl: RPC_URL,
  escrowAddress: ESCROW_ADDRESS as `0x${string}`,
  chainId: CHAIN_ID,
});

for (const tool of tools) {
  server.registerTool(tool.name, tool.config, tool.handler as any);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`GitGrant MCP server started (api=${GITGRANT_API_URL}, chain=${CHAIN_ID})`);
}

main().catch((err) => {
  console.error("Fatal: failed to start GitGrant MCP server", err);
  process.exit(1);
});

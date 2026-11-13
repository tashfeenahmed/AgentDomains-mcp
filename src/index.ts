#!/usr/bin/env node
// AgentDomains MCP server (stdio transport).
//
// Exposes the AgentDomains API — free domains for the sites and APIs AI agents
// build — as MCP tools. Run it with `npx -y agentdomains-mcp`.
//
// Credentials come from AGENTDOMAINS_API_KEY, falling back to the CLI's
// ~/.agentdomains/config.json. Nothing in this process ever logs the key.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { loadConfig } from "./api.js";
import { ANNOTATIONS, TOOLS, TOOL_BY_NAME } from "./tools.js";
import { VERSION } from "./version.js";

const server = new Server(
  { name: "agentdomains", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    title: ANNOTATIONS[t.name]?.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: ANNOTATIONS[t.name],
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOL_BY_NAME.get(req.params.name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `unknown tool: ${req.params.name}` }],
    };
  }

  // Config is read per call so a key written to disk mid-session (right after
  // the signup tool) is picked up without restarting the server.
  const cfg = loadConfig();
  try {
    const result = await tool.call(cfg, (req.params.arguments ?? {}) as Record<string, any>);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: (err as Error).message }],
    };
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  // stdout is the JSON-RPC channel — anything human-readable must go to stderr.
  process.stderr.write("agentdomains MCP server ready on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`fatal: ${(err as Error).message}\n`);
  process.exit(1);
});

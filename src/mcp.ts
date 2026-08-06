#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { XClient } from "./client.js";
import { tools } from "./tools.js";

/**
 * MCP server exposing the X tools over stdio. Any MCP-capable agent
 * (Claude Desktop, Cursor, iris, ...) can spawn this and discover the
 * tools automatically — no glue code on the agent side.
 *
 * Credentials come from env: AUTH_TOKEN and CT0.
 */
async function main() {
  // Construct lazily so `--help`-style spawns don't hard-fail, but validate early
  // with a clear message if creds are missing.
  let client: XClient;
  try {
    client = new XClient();
  } catch (err) {
    console.error(
      `[x-agent-mcp] ${(err as Error).message}\n` +
        `Set AUTH_TOKEN and CT0 in the MCP server's env block.`,
    );
    process.exit(1);
    return;
  }

  const server = new McpServer({
    name: "x-agent",
    version: "0.1.0",
  });

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args: any) => {
        try {
          const result = await tool.execute(client, args);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Error in ${tool.name}: ${(err as Error).message}`,
              },
            ],
          };
        }
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[x-agent-mcp] ready — X tools available over stdio.");
}

main().catch((err) => {
  console.error("[x-agent-mcp] fatal:", err);
  process.exit(1);
});

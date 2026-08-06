#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { XClient } from "./client.js";
import { tools } from "./tools.js";
import { loadAccounts, type Accounts } from "./accounts.js";

/**
 * MCP server exposing the X tools over stdio. Any MCP-capable agent
 * (Claude Desktop, Cursor, iris, ...) can spawn this and discover the
 * tools automatically — no glue code on the agent side.
 *
 * Credentials come from env:
 * - Single account: AUTH_TOKEN + CT0.
 * - Multiple accounts: X_ACCOUNTS (JSON object, see accounts.ts). Every tool
 *   then accepts an optional `account` param to pick which account to use.
 */
function pkgVersion(): string {
  try {
    return JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ).version as string;
  } catch {
    return "0.0.0";
  }
}

async function main() {
  let accounts: Accounts;
  try {
    accounts = loadAccounts();
  } catch (err) {
    console.error(`[x-agent-mcp] ${(err as Error).message}`);
    process.exit(1);
    return;
  }
  const names = Object.keys(accounts);
  if (names.length === 0) {
    console.error(
      "[x-agent-mcp] No credentials found.\n" +
        "Set AUTH_TOKEN and CT0 (single account), or X_ACCOUNTS (multiple accounts) in the MCP server's env block.",
    );
    process.exit(1);
    return;
  }

  const clients: Record<string, XClient> = {};
  for (const [name, creds] of Object.entries(accounts)) {
    clients[name] = new XClient({ authToken: creds.authToken, ct0: creds.ct0 });
  }
  // No `account` param -> the "default" account; if none is named, the only
  // configured account.
  const defaultName = accounts.default ? "default" : names.length === 1 ? names[0] : undefined;

  const accountSchema = z
    .string()
    .optional()
    .describe(
      `Account to use (from X_ACCOUNTS). Available: ${names.join(", ")}. ` +
        (defaultName ? `Defaults to "${defaultName}".` : "Required when multiple accounts are configured."),
    );

  const server = new McpServer({
    name: "x-agent",
    version: pkgVersion(),
  });

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: { ...tool.inputSchema, account: accountSchema },
      },
      async (args: any) => {
        try {
          const { account, ...rest } = args ?? {};
          const name = account ?? defaultName;
          const client = name ? clients[name] : undefined;
          if (!client) {
            throw new Error(
              `Unknown account "${account ?? ""}". Available accounts: ${names.join(", ")}.`,
            );
          }
          const result = await tool.execute(client, rest);
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
  console.error(
    `[x-agent-mcp] ready — ${names.length} account(s) (${names.join(", ")}), X tools available over stdio.`,
  );
}

main().catch((err) => {
  console.error("[x-agent-mcp] fatal:", err);
  process.exit(1);
});

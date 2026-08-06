import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// End-to-end over the MCP stdio protocol with two fake accounts.
// get_tweet_public needs no real X credentials (FxTwitter fallback),
// so this exercises account routing without touching X.
const X_ACCOUNTS = JSON.stringify({
  default: { authToken: "fake-default", ct0: "fake-default" },
  work: { authToken: "fake-work", ct0: "fake-work" },
});

let client: Client;
let transport: StdioClientTransport;

beforeAll(async () => {
  transport = new StdioClientTransport({
    command: "bun",
    args: ["run", "src/mcp.ts"],
    env: { ...(process.env as Record<string, string>), X_ACCOUNTS },
  });
  client = new Client({ name: "mcp-accounts-test", version: "0.0.0" });
  await client.connect(transport);
});

afterAll(async () => {
  await client.close();
  await transport.close();
});

describe("MCP server with multiple accounts", () => {
  test("every tool carries an optional account param", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(20);
    for (const t of tools) {
      const props = (t.inputSchema as any)?.properties ?? {};
      expect(props.account, `tool ${t.name} lacks account param`).toBeDefined();
    }
  });

  test("tool call without account uses the default account", async () => {
    const res = await client.callTool({
      name: "get_tweet_public",
      arguments: { tweet_id: "20" },
    });
    const text = String((res.content as any)?.[0]?.text ?? "");
    expect(text).toContain('"id"');
  });

  test("tool call with a named account routes to it", async () => {
    const res = await client.callTool({
      name: "get_tweet_public",
      arguments: { tweet_id: "20", account: "work" },
    });
    const text = String((res.content as any)?.[0]?.text ?? "");
    expect(text).toContain('"id"');
  });

  test("unknown account fails with the list of available accounts", async () => {
    const res = await client.callTool({
      name: "get_tweet_public",
      arguments: { tweet_id: "20", account: "nope" },
    });
    expect(res.isError).toBe(true);
    const text = String((res.content as any)?.[0]?.text ?? "");
    expect(text).toMatch(/Unknown account "nope"/);
    expect(text).toContain("default, work");
  });
});

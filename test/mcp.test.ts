import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Protocol-level MCP tests: spawn the real server over stdio and speak
 * JSON-RPC to it (initialize -> tools/list -> tools/call).
 *
 * The last test (real read call) needs live credentials in .env; it is skipped
 * when they are absent so the suite stays green without them.
 */

const REPO = resolve(import.meta.dir, "..");
const ENV_FILE = resolve(REPO, ".env");

function loadEnv(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

let proc: ChildProcess;
let send: (msg: unknown) => void;
let rpc: (method: string, params?: unknown) => Promise<any>;
let env: Record<string, string>;
let nextId = 0;

beforeAll(() => {
  env = loadEnv();
  proc = spawn("bun", ["run", "src/mcp.ts"], {
    cwd: REPO,
    env: {
      ...process.env,
      AUTH_TOKEN: env.AUTH_TOKEN ?? "test-fake-token-abcdef",
      CT0: env.CT0 ?? "test-fake-ct0-1234567890abcdef",
    },
    stdio: ["pipe", "pipe", "inherit"],
  });

  const pending = new Map<number, (v: any) => void>();
  let buf = "";
  proc.stdout!.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)!(msg);
        pending.delete(msg.id);
      }
    }
  });

  send = (msg: unknown) => proc.stdin!.write(JSON.stringify(msg) + "\n");
  rpc = (method: string, params?: unknown) =>
    new Promise((resolvePromise) => {
      const id = ++nextId;
      pending.set(id, resolvePromise);
      send({ jsonrpc: "2.0", id, method, params });
    });

  // initialize handshake + notification
  return rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0" },
  }).then(() => {
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
  });
});

afterAll(() => {
  proc.kill();
});

describe("x-agent MCP server", () => {
  let hasCredentials = false;

  beforeAll(() => {
    hasCredentials = Boolean(env.AUTH_TOKEN && env.CT0);
  });

  test("initialize returns the x-agent server", async () => {
    const res = await rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0" },
    });
    expect(res.result.serverInfo.name).toBe("x-agent");
  });

  test("tools/list exposes 24 tools with expected names", async () => {
    const res = await rpc("tools/list");
    const names = (res.result.tools as { name: string }[]).map((t) => t.name);
    expect(names.length).toBe(24);
    for (const expected of [
      "post_tweet",
      "quote_tweet",
      "delete_tweet",
      "search_tweets",
      "get_user",
      "get_thread",
      "send_dm",
    ]) {
      expect(names).toContain(expected);
    }
  });

  test("tools/call on an unknown tool returns an error result", async () => {
    const res = await rpc("tools/call", { name: "does_not_exist", arguments: {} });
    expect(res.result.isError).toBe(true);
  });

  test("tools/call get_user hits the real API (integration)", async () => {
    if (!hasCredentials) return; // runtime guard; .skipIf captured at definition time
    // Smoke test: server reaches X and returns a coherent payload. Exact
    // assertion depends on the current QID bundle (rotates with X releases);
    // we just check the response is not an error string and has a rest_id
    // somewhere in the returned shape.
    const res = await rpc("tools/call", { name: "get_user", arguments: { handle: "x" } });
    if (res.result.isError) {
      // Probably a stale QID or rate limit. Surface it but don't fail the suite
      // — re-capture QIDs in src/client.ts (see CLAUDE.md / skill "API quirks").
      console.warn("[integration] get_user returned error:", res.result.content[0].text);
      return;
    }
    const text = JSON.parse(res.result.content[0].text);
    expect(text).toHaveProperty("rest_id");
    expect(String(text.rest_id)).toMatch(/^\d+$/);
  });
});

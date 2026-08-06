// Watch mode example: print only new tweets for a search, then exit.
// Run it on a schedule (cron). AUTH_TOKEN / CT0 must be in the environment.
//
//   AUTH_TOKEN=... CT0=... bun run examples/watch.mjs
//   WATCH_QUERY="bun" WATCH_STATE=/tmp/x-watch WATCH_LOG=/tmp/x-watch.md bun run examples/watch.mjs
//
// Behavior:
// - Prints only new tweets (dedup via WATCH_STATE, default .watch-state).
// - Skips the tick silently when the rate-limit budget is low (<= 5 left).
// - With WATCH_LOG set, appends every new tweet to a markdown log — the
//   file becomes the long-running conversation.
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { XClient } from "x-agent-sdk";

const x = new XClient();
const QUERY = process.env.WATCH_QUERY ?? "typescript";
const STATE = process.env.WATCH_STATE ?? ".watch-state";
const LOG = process.env.WATCH_LOG;

// State file: first line is the last known rate-limit budget ("rl:N").
let body = "";
try {
  body = readFileSync(STATE, "utf8");
} catch {
  /* first run: no state yet */
}
const [head = "", ...rest] = body.split("\n");
const lastRemaining = Number(head.replace(/^rl:/, ""));
if (lastRemaining > 0 && lastRemaining <= 5) process.exit(0); // low budget

const seen = new Set(rest.filter(Boolean));
const { items } = await x.searchPage(QUERY, 10, "Latest");

const fresh = items.filter((t) => t.id && !seen.has(t.id));
for (const t of fresh) {
  console.log(`[${t.author ?? "unknown"}] ${t.text}\n${t.url}`);
  if (LOG) appendFileSync(LOG, `- **${t.author ?? "unknown"}** — ${t.text}\n  ${t.url}\n`);
  seen.add(t.id);
}

const rl = x.getLastRateLimit();
writeFileSync(STATE, `rl:${rl?.remaining ?? "?"}\n${[...seen].join("\n")}`);

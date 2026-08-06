---
name: x-agent
description: 'Drive X from an AI agent: post, search, read, DM via MCP.'
license: MIT
metadata:
  hermes:
    tags: [x, twitter, mcp, agent, social]
    category: social-media
    related_skills: [xurl]
---

# x-agent

Unofficial X (Twitter) client for AI agents. A typed TypeScript library plus an
MCP server that exposes X actions as agent tools — post, reply, like, retweet,
search, read timelines, DMs, notifications. No OAuth, no paid API: it uses your
own session cookies (`auth_token`, `ct0`) against the same GraphQL API the web
app uses.

## When to use

- An agent needs to post, reply, or search on X with a real account
- Reading timelines, mentions, DMs, or follower lists
- Automating X workflows (scheduling, monitoring, responding)

## Commands

```bash
bun install          # install deps
bun run build        # compile src/ -> dist/ (tsc)
bun run src/mcp.ts   # run the MCP server from source (dev)
node dist/mcp.js     # run the compiled MCP server (production)
```

## Setup

```bash
git clone https://github.com/alarok/x-agent.git
cd x-agent
bun install
bun run build          # compiles src/ -> dist/
```

Credentials come from env (never hardcode, never log them):

```bash
export AUTH_TOKEN="<auth_token cookie from x.com>"
export CT0="<ct0 cookie from x.com>"
```

Get both from a logged-in x.com session: DevTools → Application → Cookies.

## Credentials

x-agent needs two cookies from a logged-in x.com session:

- `auth_token` — your session token. Marked HttpOnly, so `document.cookie`
  cannot read it; only DevTools or an extension can show it.
- `ct0` — the CSRF token, sent as both a cookie and the `x-csrf-token`
  header. Standard CSRF cookie, not HttpOnly.

How to get them, in order of preference:

1. **Browser dev tools (always works):** logged in at x.com →
   - Chrome / Edge / Brave: F12 → **Application** → **Cookies** → `https://x.com`
   - Firefox: F12 → **Storage** → **Cookies** → `https://x.com`
   - Safari: Develop → **Show Web Inspector** → **Storage** → **Cookies**
     (enable the Develop menu first: Settings → Advanced → *Show features for
     web developers*)
   Copy `auth_token` and `ct0`.
2. **Cookie-Editor extension:** Chrome Web Store → click the icon on x.com →
   copy `auth_token` and `ct0`.
3. **Never share them.** Treat both as passwords. Do not log, paste in
   screenshots, or commit them.

Storage: repo-local `.env` (gitignored, never committed):

```bash
AUTH_TOKEN=...
CT0=...
```

For an MCP client, the values go in that client's `env` block — only declared
vars are forwarded to the subprocess.

## Use as a library

```ts
import { XClient } from "x-agent-client";

const x = new XClient(); // reads AUTH_TOKEN / CT0 from env
const id = await x.postTweet("hello from an agent");
await x.reply(id, "and a threaded reply");
const { root, replies } = await x.getThread(id);
for (const t of await x.search("typescript", 10, "Latest")) {
  console.log(t.url, "-", t.text);
}
```

## Safety rules (important)

- **Write actions are public and irreversible-ish.** Prefer read methods when
  testing; if you must post, keep it a throwaway test tweet and offer to delete
  it (`deleteTweet`).
- **Never mass-post, mass-follow, or spam** — that gets the account flagged
  or suspended.
- **The account can be rate-limited, shadow-banned, or suspended.** Use at
  your own risk; personal and educational use only.
- **Do not share cookies** — they are as sensitive as passwords.

## Troubleshooting

- **`344 "daily limit"` with HTTP 200** is almost always the transaction-id, not
  a quota. The client rebuilds the generator and backs off automatically; tweet
  length is irrelevant.
- **`400` on a previously working call** means a queryId went stale — re-capture
  the current ones from X's web bundle and update `QID` in `src/client.ts`.
- **`TweetDetail` errors with "...must be defined"** — the call needs the full
  variable set + `fieldToggles`; `getTweet` already sends the validated set.
- **Manual smoke test:** `AUTH_TOKEN=... CT0=... node dist/mcp.js` speaks MCP
  over stdio — connect any MCP client to list and call the tools.

## API quirks (verified)

- **No `getMe` tool.** Own profile = `restGet("1.1/account/verify_credentials.json")`
  → `screen_name`, `id_str`, `name`, `description`; counts under `legacy`.
  `myUserId()` returns just the id.
- **`getUserTweets(userId)` can fail with `GRAPHQL_VALIDATION_FAILED: "must be
  defined"`** when the `UserTweets` queryId/variables are stale (queryIds rotate
  with X web bundles). Workaround: `x.search("from:<username>", N, "Latest")`.
  Real fix: re-capture QIDs from X's web bundle into `QID` in `src/client.ts`.
- **`homeTimeline()` can return `[]`** on active accounts (stale queryId) — do
  not conclude the account is empty; use `search("from:")`.
- **`search()` results have `created_at` (string), not `createdAt`** — use
  `new Date(t.created_at)`.
- **Direct curl with the cookies → HTTP 401 `Invalid or expired token`** even
  when the client works: these endpoints require a browser `User-Agent` (the
  client sends Chrome's).

## Hermes setup (optional)

Hermes picks this skill up automatically when installed under
`~/.hermes/skills/social-media/x-agent/SKILL.md`. To register the MCP server,
add to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  x:
    command: "node"
    args: ["/absolute/path/to/x-agent/dist/mcp.js"]
    env:
      AUTH_TOKEN: "..."
      CT0: "..."
```

Restart Hermes. The X tools appear in every session as `mcp_x_*`.

> Setup pitfall: register the server with `hermes mcp add` (pipe `y` into
> the interactive prompt): `echo "y" | hermes mcp add x --command node
> --env AUTH_TOKEN=... CT0=... --args /path/to/dist/mcp.js`.
> `hermes config set` stores `args` as a plain string and breaks the server
> (`Cannot find module '['` / `Invalid tag name "["`).

Prefer the `mcp_x_*` tools when they are loaded in the session — that is
the normal path. Only fall back to the library (`XClient`) if the tools are
truly absent; diagnose first with the client's `mcp list` / `mcp test`
commands and the startup logs. Do NOT write throwaway probe scripts into
the repo as a first resort; the MCP tools cover read and write.

Other MCP-capable agents (Claude Desktop, Cursor, Windsurf) use the same
server with the equivalent config block.

## Verification

- `bun run build` exits 0 and produces `dist/`
- `AUTH_TOKEN=... CT0=... node dist/mcp.js` starts and prints
  `[x-agent-mcp] ready`
- A read call (e.g. `get_user` on a handle) returns a profile without errors

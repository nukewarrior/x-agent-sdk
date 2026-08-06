<div align="center">

<img src="https://raw.githubusercontent.com/alarok/x-agent-sdk/main/assets/x-agent-x-header.png" alt="x-agent banner" width="100%" />

# x-agent-sdk

**Unofficial X (Twitter) client — for your own code and for AI agents alike.**

Use it as a typed TypeScript library, or drop in its MCP server so agents connect directly.
All through the same private GraphQL API the web app uses.

Cookie auth · no OAuth · no paid API · automatic `x-client-transaction-id` · built-in MCP server

</div>

> [!WARNING]
> **Use at your own risk.** This is an unofficial tool that talks to X's private
> API with your session cookies, which may breach X's Terms of Service. It can get
> your account **rate-limited, shadow-banned, suspended, or permanently
> terminated**. The author takes **no responsibility** for any bans, damages, or
> losses. You alone are responsible for how you use it and for complying with X's
> ToS and applicable law. Educational and personal use only.

---

## Agent setup guide

This package ships a [`SKILL.md`](./SKILL.md) with operating instructions for AI agents:
MCP setup, credential handling, tool choice, and known X API quirks. Use the prompt below to
configure the MCP server on this machine.

```text
Set up x-agent on this machine.

The package is on npm:
  https://www.npmjs.com/package/x-agent-sdk
The source and agent guide live at:
  https://github.com/alarok/x-agent-sdk

Workflow:
1. Read the full agent guide first:
   https://github.com/alarok/x-agent-sdk/blob/main/SKILL.md
2. Start the MCP server without installing anything:
   npx -y x-agent-mcp
   Or install once and run it:
   npm install -g x-agent-sdk && x-agent-mcp
3. Register the MCP server with the MCP client already installed on this
   machine. If the client is Claude Code, use:
   claude mcp add x-agent --env AUTH_TOKEN=... --env CT0=... -- npx -y x-agent-mcp
   For Hermes or other clients, follow the config blocks in the README.
   If the client is unclear, inspect the local configuration and ask me
   before making assumptions.
4. x-agent requires these private environment variables:
   - AUTH_TOKEN: the auth_token cookie from a logged-in x.com session
   - CT0: the ct0 cookie from that same session
   Ask me for them if they are not already configured. Never print, log,
   commit, expose, or include either value in command output.
5. Verify setup with a read-only action, such as get_user for username "x".
   Do not post, reply, like, repost, follow, bookmark, delete, or send a DM
   without first showing me the intended action and receiving explicit approval.

If any step fails, inspect the actual error and propose the smallest safe fix.
At the end, summarize the MCP configuration, the command used to run it, and
the available read-only tools.
```

---

## What is this?

X killed its free public API in 2023. But the web client at `x.com` still talks to
a private GraphQL API using nothing but your session cookies. `x-agent` drives that
API directly — post, reply, like, retweet, search, read timelines — with two ways in:

- **As a library** — a typed TypeScript client you call from your own code, to build
  a bot, a scheduler, a scraper, or any automation you want.
- **As an MCP server** — drop it into any Model Context Protocol agent (Claude
  Desktop, Cursor, iris, ...) and it discovers the tools automatically.

Same engine underneath; pick whichever fits.

### Why a plain HTTP client fails

Hitting X's private API with a plain HTTP client returns a misleading
`error 344 "You have reached your daily limit"` **even on a fresh account with 2
tweets**. That is *not* a quota — it's anti-bot. The browser signs every request
with a per-request `x-client-transaction-id` header. `x-agent` generates that
header for you, in-process, on every call — with zero third-party crypto.

---

## Install

```bash
bun add x-agent-sdk          # or:  npm install x-agent-sdk
```

Installing from source instead (git clone): run `bun install && bun run build` first.

Runs on **Node 18+** and **Bun**. Dependencies are all generic infrastructure:
`@modelcontextprotocol/sdk` (the MCP server), `node-html-parser` (reads X's home
page), `zod` (tool schemas). No transaction-id package — that algorithm lives in
this repo.

## Credentials

Two cookies from a logged-in `x.com` session:

| Cookie | What it is |
|--------|------------|
| `auth_token` | Your session token |
| `ct0` | CSRF token (sent as both cookie and header) |

Copy them from your browser's dev tools while logged in at `x.com`:

| Browser | Where |
|---------|-------|
| Chrome / Edge / Brave | F12 → **Application** → **Cookies** → `https://x.com` |
| Firefox | F12 → **Storage** → **Cookies** → `https://x.com` |
| Safari | Develop → **Show Web Inspector** → **Storage** → **Cookies** (enable the Develop menu first: Settings → Advanced → *Show features for web developers*) |

Provide via env (`AUTH_TOKEN`, `CT0`) or pass to the constructor.

---

## Quick start (library)

```ts
import { XClient } from "x-agent-sdk";

const x = new XClient();               // reads AUTH_TOKEN / CT0 from env
// const x = new XClient({ authToken: "...", ct0: "..." });

// Post
const id = await x.postTweet("hello from an agent");
console.log(`https://x.com/i/web/status/${id}`);

// Reply
await x.reply(id, "and a threaded reply");

// Read a tweet's engagement + replies (clean shape)
const { root, replies } = await x.getThread(id);
console.log(`${root.likes} likes, ${root.replies} replies, ${root.views} views`);
for (const r of replies) console.log(`  @${r.author}: ${r.text} (${r.likes} likes)`);

// Search
for (const t of await x.search("typescript", 10, "Latest")) {
  console.log(t.url, "-", t.text);
}

// Resolve a handle, then read their tweets
const user = await x.getUser("x");
const tweets = await x.getUserTweets(user.rest_id, 20);

// Engage
await x.like(id);
await x.retweet(id);
await x.bookmark(id);
```

### API

| Method | Returns | Notes |
|--------|---------|-------|
| `postTweet(text, replyTo?, opts?)` | tweet id | `opts.quoteTweetUrl` makes it a quote tweet |
| `reply(tweetId, text)` | tweet id | Shorthand for `postTweet(text, tweetId)` |
| `quote(urlOrId, text)` | tweet id | Quote-tweet; resolves the handle if given a bare id |
| `deleteTweet(id)` | `boolean` | |
| `like(id)` / `unlike(id)` | `boolean` | |
| `retweet(id)` / `unretweet(id)` | `boolean` | |
| `bookmark(id)` / `unbookmark(id)` | `boolean` | |
| `follow(userId)` / `unfollow(userId)` | `boolean` | Numeric id — uses X's REST v1.1 endpoint |
| `search(query, count?, product?)` | `Tweet[]` | `product`: `Top` \| `Latest` \| `People` \| `Media` |
| `getUser(username)` | user object | Has `rest_id` (the numeric id) |
| `getUserTweets(userId, count?)` | `Tweet[]` | Needs numeric id — resolve via `getUser` |
| `getLikes(userId, count?)` | `Tweet[]` | Tweets a user liked |
| `getFollowers(userId, count?)` | `XUser[]` | A user's followers |
| `getFollowing(userId, count?)` | `XUser[]` | Who a user follows |
| `homeTimeline(count?)` | `Tweet[]` | "For You" |
| `sendDM(recipientId, text)` | raw | DM a user (your own id auto-resolved) |
| `getDMInbox()` | raw | Conversations + recent messages |
| `getNotifications(count?)` | raw | Likes, follows, replies |
| `getMentions(count?)` | raw | Tweets mentioning you |
| `myUserId()` | `string` | Your account's numeric id, cached |
| `getTweet(id)` | raw response | Full `TweetDetail` payload |
| `getTweetPublic(id)` | parsed tweet \| `null` | **No cookies needed** — reads via the public FxTwitter API. `null` if deleted/private/non-existent |
| `getThread(id)` | `{ root, replies }` | Parsed likes/replies/views — use this over `getTweet` for engagement |

`new XClient({ retries })` sets the retry budget for `344`/`429` (default 3).

---

## Use it as an MCP server (recommended for agents)

Connect the MCP server and the agent auto-discovers all 24 tools — names,
descriptions, JSON schemas. No glue code.

### Config

**Any MCP client (Claude Desktop, Cursor, Windsurf, ...)** — add to the MCP config:

```jsonc
{
  "mcpServers": {
    "x": {
      "command": "npx",
      "args": ["-y", "x-agent-mcp"],
      "env": {
        "AUTH_TOKEN": "your_auth_token_cookie",
        "CT0": "your_ct0_cookie"
      }
    }
  }
}
```

**Claude Code** — one command, no JSON file:

```bash
claude mcp add x-agent \
  --env AUTH_TOKEN=your_auth_token_cookie \
  --env CT0=your_ct0_cookie \
  -- npx -y x-agent-mcp
```

**Hermes Agent** — add to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  x:
    command: "npx"
    args: ["-y", "x-agent-mcp"]
    env:
      AUTH_TOKEN: "..."
      CT0: "..."
```

Restart the agent. It now has these tools:

| Tool | Does |
|------|------|
| `post_tweet` | Publish a tweet (or reply via `reply_to`). Returns the URL. |
| `quote_tweet` | Quote another tweet with your commentary |
| `delete_tweet` | Delete a tweet by id |
| `like_tweet` / `unlike_tweet` | Like / unlike |
| `retweet` / `unretweet` | Retweet / undo |
| `bookmark` / `unbookmark` | Save / remove a bookmark |
| `follow_user` / `unfollow_user` | Follow / unfollow by user id |
| `search_tweets` | Search (`Top`/`Latest`/`People`/`Media`) |
| `get_user` | Resolve `@handle` → profile + counts |
| `get_user_tweets` | Recent tweets by user id |
| `get_likes` | Tweets a user liked |
| `get_followers` / `get_following` | List followers / following |
| `get_tweet` | Raw tweet + thread |
| `get_tweet_public` | Read a tweet **without cookies** (public FxTwitter API). `null` if deleted/private |
| `get_thread` | Clean `{ root: {likes, replies, ...}, replies: [...] }` |
| `home_timeline` | The For You timeline |
| `send_dm` | Send a direct message by user id |
| `get_dm_inbox` | Conversations + recent messages |
| `get_notifications` | Recent notifications |
| `get_mentions` | Tweets mentioning you |

Now you can tell the agent: *"search X for the latest posts about Bun and reply to
the top one with a question"* — it calls `search_tweets` then `post_tweet` by itself.

### Try the MCP server by hand

```bash
AUTH_TOKEN=... CT0=... npx -y x-agent-mcp
# speaks MCP over stdio; connect any MCP client to list/call tools
```

---

## Use the tool defs with the Vercel AI SDK (or any framework)

The tool definitions are exported runtime-agnostic (Zod schema + `execute`), so you
can use them in any agent runtime, not just MCP:

```ts
import { XClient } from "x-agent-sdk";
import { tools } from "x-agent-sdk/tools";
import { tool } from "ai";
import { z } from "zod";

const x = new XClient();

const aiTools = Object.fromEntries(
  tools.map((t) => [
    t.name,
    tool({
      description: t.description,
      parameters: z.object(t.inputSchema),
      execute: (args) => t.execute(x, args),
    }),
  ]),
);

// generateText({ model, tools: aiTools, prompt: "post a tweet about ..." })
```

---

## Reliability notes

- **`344` / `429` handling.** On `344` (anti-bot) the client rebuilds the
  transaction generator and backs off exponentially; on HTTP `429` it honors
  `x-rate-limit-reset`. The `344` *daily-limit* message is almost always the header,
  not a real quota — tweet length is irrelevant.
- **queryIds** in `QID` can go stale; if a call starts returning `400`, re-capture
  the current ones from X's web bundle.
- **`TweetDetail` needs full variables + `fieldToggles`** or X returns
  `"...must be defined"`. `getTweet` already sends the validated set.
- **TLS fingerprint.** `fetch` doesn't mimic Chrome's JA3. The transaction-id clears
  the common blocks, but for very high sustained volume a real browser (Playwright)
  remains the safest transport.

---

## Project layout

```
src/
  transaction.ts   x-client-transaction-id generator (zero third-party crypto)
  client.ts        XClient — typed methods, 344/429 backoff
  tools.ts         24 runtime-agnostic tool defs (Zod schemas)
  mcp.ts           MCP stdio server (bin: x-agent-mcp)
  index.ts         public exports
dist/              compiled output (what actually runs)
```

## License & disclaimer

MIT — see [`LICENSE`](./LICENSE), which includes a **use-at-your-own-risk notice**.

Unofficial, not affiliated with X Corp. This software uses X's private API with
your session cookies and may violate X's Terms of Service. It can result in your
account being rate-limited, suspended, or permanently banned. **The author accepts
no responsibility for any bans, damages, or losses** — you use it entirely at your
own risk and are solely responsible for complying with X's ToS and applicable law.
For educational and personal use only.

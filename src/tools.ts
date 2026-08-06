import { z } from "zod";
import { XClient } from "./client.js";

/**
 * Runtime-agnostic tool definitions. Each carries a Zod schema (the shape,
 * so it plugs straight into the MCP SDK and the Vercel AI SDK) plus an
 * `execute` that takes an XClient. mcp.ts adapts these to an MCP server;
 * you can also feed them to any agent framework.
 */
export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  inputSchema: S;
  execute: (client: XClient, args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}

function def<S extends z.ZodRawShape>(d: ToolDef<S>): ToolDef<S> {
  return d;
}

export const tools = [
  def({
    name: "post_tweet",
    description:
      "Publish a new tweet from the authenticated account. Returns the URL of the created tweet. Use `reply_to` to reply to an existing tweet id.",
    inputSchema: {
      text: z.string().min(1).max(4000).describe("The tweet body. Up to 280 chars for a normal tweet; longer becomes a note-tweet."),
      reply_to: z.string().optional().describe("Optional tweet id to reply to."),
    },
    async execute(client, { text, reply_to }) {
      const id = await client.postTweet(text, reply_to);
      return { id, url: `https://x.com/i/web/status/${id}` };
    },
  }),
  def({
    name: "quote_tweet",
    description:
      "Quote-tweet: publish `text` quoting another tweet. Pass the quoted tweet's url or bare id. Returns the new tweet URL.",
    inputSchema: {
      quoted: z.string().describe("URL or id of the tweet to quote."),
      text: z.string().min(1).max(4000).describe("Your commentary."),
    },
    async execute(client, { quoted, text }) {
      const id = await client.quote(quoted, text);
      return { id, url: `https://x.com/i/web/status/${id}` };
    },
  }),
  def({
    name: "delete_tweet",
    description: "Delete a tweet owned by the authenticated account, by tweet id.",
    inputSchema: { tweet_id: z.string().describe("The tweet id to delete.") },
    async execute(client, { tweet_id }) {
      return { deleted: await client.deleteTweet(tweet_id) };
    },
  }),
  def({
    name: "like_tweet",
    description: "Like a tweet by id.",
    inputSchema: { tweet_id: z.string() },
    async execute(client, { tweet_id }) {
      return { liked: await client.like(tweet_id) };
    },
  }),
  def({
    name: "unlike_tweet",
    description: "Remove a like from a tweet by id.",
    inputSchema: { tweet_id: z.string() },
    async execute(client, { tweet_id }) {
      return { unliked: await client.unlike(tweet_id) };
    },
  }),
  def({
    name: "retweet",
    description: "Retweet a tweet by id.",
    inputSchema: { tweet_id: z.string() },
    async execute(client, { tweet_id }) {
      return { retweeted: await client.retweet(tweet_id) };
    },
  }),
  def({
    name: "unretweet",
    description: "Undo a retweet by tweet id.",
    inputSchema: { tweet_id: z.string() },
    async execute(client, { tweet_id }) {
      return { unretweeted: await client.unretweet(tweet_id) };
    },
  }),
  def({
    name: "bookmark",
    description: "Save a tweet to bookmarks by id.",
    inputSchema: { tweet_id: z.string() },
    async execute(client, { tweet_id }) {
      return { bookmarked: await client.bookmark(tweet_id) };
    },
  }),
  def({
    name: "unbookmark",
    description: "Remove a tweet from bookmarks by id.",
    inputSchema: { tweet_id: z.string() },
    async execute(client, { tweet_id }) {
      return { unbookmarked: await client.unbookmark(tweet_id) };
    },
  }),
  def({
    name: "follow_user",
    description: "Follow a user by numeric id (resolve a @handle with get_user first).",
    inputSchema: { user_id: z.string().describe("Numeric user id (rest_id).") },
    async execute(client, { user_id }) {
      return { followed: await client.follow(user_id) };
    },
  }),
  def({
    name: "unfollow_user",
    description: "Unfollow a user by numeric id.",
    inputSchema: { user_id: z.string().describe("Numeric user id (rest_id).") },
    async execute(client, { user_id }) {
      return { unfollowed: await client.unfollow(user_id) };
    },
  }),
  def({
    name: "search_tweets",
    description:
      "Search X for tweets. `product` picks the tab: Top (default), Latest (chronological), People, or Media. Returns id, text, author, likes, url plus `next_cursor` — pass it as `cursor` to fetch the next page.",
    inputSchema: {
      query: z.string().describe("Search query. Supports X operators: from:user, since:YYYY-MM-DD, filter:media, lang:xx."),
      count: z.number().int().min(1).max(100).default(20),
      product: z.enum(["Top", "Latest", "People", "Media"]).default("Top"),
      cursor: z.string().optional().describe("Opaque pagination cursor from a previous call's next_cursor."),
    },
    async execute(client, { query, count, product, cursor }) {
      const page = await client.searchPage(query, count, product, cursor);
      return { results: page.items, next_cursor: page.next_cursor };
    },
  }),
  def({
    name: "get_user",
    description: "Look up a user profile by @username. Returns the raw user object (rest_id, legacy profile fields, counts).",
    inputSchema: { username: z.string().describe("Handle without the @.") },
    async execute(client, { username }) {
      const u = await client.getUser(username);
      return {
        id: u?.rest_id,
        name: u?.core?.name ?? u?.legacy?.name,
        username: u?.core?.screen_name ?? u?.legacy?.screen_name,
        followers: u?.legacy?.followers_count,
        following: u?.legacy?.friends_count,
        tweets: u?.legacy?.statuses_count,
        description: u?.legacy?.description,
      };
    },
  }),
  def({
    name: "get_user_tweets",
    description:
      "Get recent tweets from a user. Give either a numeric user id, or use get_user first to resolve a @username to an id. Returns tweets plus `next_cursor` for pagination.",
    inputSchema: {
      user_id: z.string().describe("Numeric user id (rest_id)."),
      count: z.number().int().min(1).max(100).default(20),
      cursor: z.string().optional().describe("Opaque pagination cursor from a previous call's next_cursor."),
    },
    async execute(client, { user_id, count, cursor }) {
      const page = await client.getUserTweetsPage(user_id, count, cursor);
      return { tweets: page.items, next_cursor: page.next_cursor };
    },
  }),
  def({
    name: "get_likes",
    description:
      "Get the tweets a user has liked, by their numeric user id. Returns tweets plus `next_cursor` for pagination.",
    inputSchema: {
      user_id: z.string().describe("Numeric user id (rest_id)."),
      count: z.number().int().min(1).max(100).default(20),
      cursor: z.string().optional().describe("Opaque pagination cursor from a previous call's next_cursor."),
    },
    async execute(client, { user_id, count, cursor }) {
      const page = await client.getLikesPage(user_id, count, cursor);
      return { tweets: page.items, next_cursor: page.next_cursor };
    },
  }),
  def({
    name: "get_followers",
    description:
      "List a user's followers (numeric user id). Returns id, username, name, counts plus `next_cursor` for pagination.",
    inputSchema: {
      user_id: z.string().describe("Numeric user id (rest_id)."),
      count: z.number().int().min(1).max(100).default(20),
      cursor: z.string().optional().describe("Opaque pagination cursor from a previous call's next_cursor."),
    },
    async execute(client, { user_id, count, cursor }) {
      const page = await client.getFollowersPage(user_id, count, cursor);
      return { users: page.items, next_cursor: page.next_cursor };
    },
  }),
  def({
    name: "get_following",
    description:
      "List the accounts a user follows (numeric user id). Returns users plus `next_cursor` for pagination.",
    inputSchema: {
      user_id: z.string().describe("Numeric user id (rest_id)."),
      count: z.number().int().min(1).max(100).default(20),
      cursor: z.string().optional().describe("Opaque pagination cursor from a previous call's next_cursor."),
    },
    async execute(client, { user_id, count, cursor }) {
      const page = await client.getFollowingPage(user_id, count, cursor);
      return { users: page.items, next_cursor: page.next_cursor };
    },
  }),
  def({
    name: "get_tweet",
    description: "Fetch a single tweet with its reply thread by tweet id (raw TweetDetail response).",
    inputSchema: { tweet_id: z.string() },
    async execute(client, { tweet_id }) {
      return client.getTweet(tweet_id);
    },
  }),
  def({
    name: "get_tweet_public",
    description:
      "Read a tweet WITHOUT cookies via the public FxTwitter API. No auth needed, no rate-limit risk on the account. Returns id, text, author, likes, retweets, replies, views, media. Returns null if the tweet is deleted, private, or non-existent.",
    inputSchema: { tweet_id: z.string() },
    async execute(client, { tweet_id }) {
      return client.getTweetPublic(tweet_id);
    },
  }),
  def({
    name: "get_thread",
    description:
      "Get a tweet's engagement and replies in a clean shape: { root: {likes, replies, retweets, views, text}, replies: [{author, text, likes}] }. Use this to check likes on a tweet or read the replies people left.",
    inputSchema: { tweet_id: z.string() },
    async execute(client, { tweet_id }) {
      return client.getThread(tweet_id);
    },
  }),
  def({
    name: "home_timeline",
    description:
      "Get the authenticated account's For You home timeline. Returns tweets plus `next_cursor` for pagination.",
    inputSchema: {
      count: z.number().int().min(1).max(100).default(20),
      cursor: z.string().optional().describe("Opaque pagination cursor from a previous call's next_cursor."),
    },
    async execute(client, { count, cursor }) {
      const page = await client.homeTimelinePage(count, cursor);
      return { tweets: page.items, next_cursor: page.next_cursor };
    },
  }),
  def({
    name: "send_dm",
    description:
      "Send a direct message to a user by their numeric id (resolve a @handle with get_user first). Your own id is auto-resolved.",
    inputSchema: {
      recipient_id: z.string().describe("Recipient numeric user id (rest_id)."),
      text: z.string().min(1).describe("Message body."),
    },
    async execute(client, { recipient_id, text }) {
      const res = await client.sendDM(recipient_id, text);
      const id = res?.entries?.[0]?.message?.id;
      return { sent: !!id, message_id: id };
    },
  }),
  def({
    name: "get_dm_inbox",
    description:
      "Fetch the direct-message inbox: conversations and their most recent messages.",
    inputSchema: {},
    async execute(client) {
      const d = await client.getDMInbox();
      const st = d?.inbox_initial_state ?? {};
      const convos = Object.values(st.conversations ?? {}).length;
      const messages = (st.entries ?? [])
        .map((e: any) => e.message?.message_data)
        .filter(Boolean)
        .map((m: any) => ({ from: m.sender_id, text: m.text, time: m.time }));
      return { conversations: convos, recent_messages: messages.slice(0, 20) };
    },
  }),
  def({
    name: "get_notifications",
    description: "Get recent notifications (likes, follows, mentions, replies) for the account.",
    inputSchema: { count: z.number().int().min(1).max(100).default(20) },
    async execute(client, { count }) {
      const d = await client.getNotifications(count);
      const msgs = Object.values(d?.globalObjects?.notifications ?? {}).map((n: any) => ({
        message: n?.message?.text,
        timestamp: n?.timestampMs,
      }));
      return { notifications: msgs.slice(0, count) };
    },
  }),
  def({
    name: "get_mentions",
    description: "Get tweets that mention the authenticated account.",
    inputSchema: { count: z.number().int().min(1).max(100).default(20) },
    async execute(client, { count }) {
      const d = await client.getMentions(count);
      const tweets = Object.values(d?.globalObjects?.tweets ?? {}).map((t: any) => ({
        id: t?.id_str,
        text: t?.full_text,
        likes: t?.favorite_count,
      }));
      return { mentions: tweets.slice(0, count) };
    },
  }),
] as const;

export type AnyToolDef = (typeof tools)[number];

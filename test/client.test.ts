import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { XClient, type RateLimitInfo } from "../src/client.js";
import { installFetchMock } from "./fixtures.js";

let apiHandler: (url: string) => { status: number; body: unknown };
let calls: { url: string; init: RequestInit }[];

const noopSleep = async () => {};

beforeEach(() => {
  apiHandler = () => ({
    status: 200,
    body: { data: { create_tweet: { tweet_results: { result: { rest_id: "999" } } } } },
  });
  calls = installFetchMock((url) => apiHandler(url)).calls;
});

afterEach(() => {
  globalThis.fetch = undefined as any;
});

const opts = { authToken: "test-auth-token-123", ct0: "test-ct0-456", sleep: noopSleep };

describe("XClient request signing", () => {
  test("sends cookies, csrf header and a transaction-id", async () => {
    const x = new XClient(opts);
    await x.postTweet("hello tests");

    const apiCall = calls.find((c) => c.url.includes("/i/api/graphql"));
    expect(apiCall).toBeDefined();
    const headers = (apiCall!.init.headers ?? {}) as Record<string, string>;
    const joined = JSON.stringify(headers);

    expect(joined).toContain("test-auth-token-123"); // auth cookie
    expect(joined).toContain("test-ct0-456"); // ct0 cookie + csrf header
    expect(joined).toContain("x-client-transaction-id");
    expect(String(headers.authorization)).toContain("Bearer");
  });

  test("retries on 344 (anti-bot) up to the retry budget", async () => {
    let tries = 0;
    apiHandler = () => {
      tries++;
      return {
        status: 200,
        body: { errors: [{ code: 344, message: "You have reached your daily limit" }] },
      };
    };
    const x = new XClient({ ...opts, retries: 3 });
    await expect(x.postTweet("hello")).rejects.toThrow();
    expect(tries).toBe(3); // 3 attempts total
  });

  test("retries: 1 means a single attempt", async () => {
    let tries = 0;
    apiHandler = () => {
      tries++;
      return { status: 200, body: { errors: [{ code: 344, message: "limit" }] } };
    };
    const x = new XClient({ ...opts, retries: 1 });
    await expect(x.postTweet("hello")).rejects.toThrow();
    expect(tries).toBe(1);
  });
});

describe("XClient parsing", () => {
  test("getUser returns rest_id", async () => {
    apiHandler = () => ({
      status: 200,
      body: {
        data: {
          user: { result: { rest_id: "783214", legacy: { screen_name: "x", name: "X" } } },
        },
      },
    });
    const x = new XClient(opts);
    const u = await x.getUser("x");
    expect(u.rest_id).toBe("783214");
  });
});

describe("XClient rate limit + injectable fetch", () => {
  test("getLastRateLimit reads x-rate-limit-remaining headers", async () => {
    const x = new XClient(opts);
    await x.postTweet("hello tests");
    expect(x.getLastRateLimit()).toEqual({ remaining: 999, reset: 0, limit: 0 });
  });

  test("onRateLimit callback receives the headers", async () => {
    let got: RateLimitInfo | undefined;
    const x = new XClient({ ...opts, onRateLimit: (i) => (got = i) });
    await x.postTweet("hello tests");
    expect(got).toEqual({ remaining: 999, reset: 0, limit: 0 });
  });

  test("injected fetch is used for requests", async () => {
    const used: string[] = [];
    const real = globalThis.fetch;
    const x = new XClient({
      ...opts,
      fetch: ((url: any, init: any) => {
        used.push(String(url));
        return (real as any)(url, init);
      }) as typeof fetch,
    });
    await x.postTweet("hello tests");
    expect(used.length).toBeGreaterThan(0);
    expect(used[0]).toContain("/i/api/graphql");
  });
});

describe("XClient pagination", () => {
  const timelineBody = (instructions: unknown[]) => ({
    data: {
      user: { result: { timeline_v2: { timeline: { instructions } } } },
    },
  });

  test("getUserTweetsPage returns items and next_cursor", async () => {
    apiHandler = () => ({
      status: 200,
      body: timelineBody([
        {
          entries: [
            {
              entryId: "tweet-1",
              content: {
                itemContent: {
                  tweet_results: {
                    result: { legacy: { id_str: "1", full_text: "hi", created_at: "" } },
                  },
                },
              },
            },
          ],
        },
        { entries: [{ entryId: "cursor-bottom-abc", content: { value: "|F|cursor|123|" } }] },
      ]),
    });
    const x = new XClient(opts);
    const page = await x.getUserTweetsPage("42", 20);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe("1");
    expect(page.next_cursor).toBe("|F|cursor|123|");
  });

  test("plain methods still return arrays", async () => {
    apiHandler = () => ({ status: 200, body: timelineBody([]) });
    const x = new XClient(opts);
    const tweets = await x.getUserTweets("42", 20);
    expect(Array.isArray(tweets)).toBe(true);
  });

  test("cursor is sent as a GraphQL variable", async () => {
    apiHandler = () => ({ status: 200, body: timelineBody([]) });
    const x = new XClient(opts);
    await x.getUserTweetsPage("42", 20, "|F|next|");
    const apiCall = calls.find((c) => c.url.includes("UserTweets"));
    expect(apiCall).toBeDefined();
    const variables = JSON.parse(
      new URL(apiCall!.url).searchParams.get("variables") ?? "{}",
    );
    expect(variables.cursor).toBe("|F|next|");
  });

  test("next_cursor is null when the timeline has no cursor entry", async () => {
    apiHandler = () => ({ status: 200, body: timelineBody([]) });
    const x = new XClient(opts);
    const page = await x.getUserTweetsPage("42", 20);
    expect(page.next_cursor).toBeNull();
  });

  test("searchPage digs its own timeline path", async () => {
    apiHandler = () => ({
      status: 200,
      body: {
        data: {
          search_by_raw_query: {
            search_timeline: {
              timeline: {
                instructions: [
                  { entries: [{ entryId: "cursor-bottom-search", content: { value: "|S|123|" } }] },
                ],
              },
            },
          },
        },
      },
    });
    const x = new XClient(opts);
    const page = await x.searchPage("bun", 20, "Latest", "|S|123|");
    expect(page.items).toEqual([]);
    expect(page.next_cursor).toBe("|S|123|");
  });
});

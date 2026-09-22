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

  test("getThread prefers Note Tweet text and parses module replies", async () => {
    apiHandler = () => ({
      status: 200,
      body: {
        data: {
          threaded_conversation_with_injections_v2: {
            instructions: [
              {
                entries: [
                  {
                    entryId: "tweet-100",
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            __typename: "TweetWithVisibilityResults",
                            tweet: {
                              rest_id: "100",
                              legacy: {
                                id_str: "100",
                                full_text: "truncated root...",
                                created_at: "now",
                                favorite_count: 4,
                                retweet_count: 2,
                                reply_count: 1,
                              },
                              note_tweet: {
                                note_tweet_results: {
                                  result: { text: "complete root body beyond the classic limit" },
                                },
                              },
                              core: {
                                user_results: {
                                  result: { core: { screen_name: "root_user" } },
                                },
                              },
                              views: { count: "123" },
                              article: {
                                article_results: {
                                  result: {
                                    rest_id: "article-1",
                                    title: "Article title",
                                    preview_text: "Article preview",
                                    plain_text: "Article full text",
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  {
                    entryId: "conversationthread-1",
                    content: {
                      items: [
                        {
                          item: {
                            itemContent: {
                              tweet_results: {
                                result: {
                                  rest_id: "101",
                                  legacy: {
                                    id_str: "101",
                                    full_text: "truncated reply...",
                                    created_at: "later",
                                    favorite_count: 1,
                                    retweet_count: 0,
                                    reply_count: 0,
                                  },
                                  note_tweet: {
                                    note_tweet_results: {
                                      result: { text: "complete longform reply" },
                                    },
                                  },
                                  core: {
                                    user_results: {
                                      result: { core: { screen_name: "reply_user" } },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    });

    const x = new XClient(opts);
    const thread = await x.getThread("100");

    expect(thread.root.text).toBe("complete root body beyond the classic limit");
    expect(thread.root.article?.plain_text).toBe("Article full text");
    expect(thread.root.views).toBe("123");
    expect(thread.replies).toHaveLength(1);
    expect(thread.replies[0].text).toBe("complete longform reply");
    expect(thread.replies[0].author).toBe("reply_user");

    const detailCall = calls.find((c) => c.url.includes("TweetDetail"));
    expect(detailCall).toBeDefined();
    const toggles = JSON.parse(
      new URL(detailCall!.url).searchParams.get("fieldToggles") ?? "{}",
    );
    expect(toggles.withArticlePlainText).toBe(true);
  });

  test("timeline parsing unwraps visibility results and uses retweeted Note Tweet text", async () => {
    apiHandler = () => ({
      status: 200,
      body: {
        data: {
          user: {
            result: {
              timeline_v2: {
                timeline: {
                  instructions: [
                    {
                      entries: [
                        {
                          entryId: "tweet-200",
                          content: {
                            itemContent: {
                              tweet_results: {
                                result: {
                                  __typename: "TweetWithVisibilityResults",
                                  tweet: {
                                    rest_id: "200",
                                    legacy: {
                                      id_str: "200",
                                      full_text: "RT @source: truncated...",
                                      created_at: "now",
                                      favorite_count: 0,
                                      retweet_count: 0,
                                      reply_count: 0,
                                      retweeted_status_result: {
                                        result: {
                                          rest_id: "199",
                                          legacy: {
                                            id_str: "199",
                                            full_text: "original truncated...",
                                          },
                                          note_tweet: {
                                            note_tweet_results: {
                                              result: {
                                                text: "complete original longform body",
                                              },
                                            },
                                          },
                                        },
                                      },
                                    },
                                    core: {
                                      user_results: {
                                        result: { core: { screen_name: "retweeter" } },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });

    const x = new XClient(opts);
    const tweets = await x.getUserTweets("42", 20);

    expect(tweets).toHaveLength(1);
    expect(tweets[0].id).toBe("200");
    expect(tweets[0].author).toBe("retweeter");
    expect(tweets[0].text).toBe("complete original longform body");
  });

  test("search parsing uses complete Note Tweet text", async () => {
    apiHandler = () => ({
      status: 200,
      body: {
        data: {
          search_by_raw_query: {
            search_timeline: {
              timeline: {
                instructions: [
                  {
                    entries: [
                      {
                        entryId: "tweet-300",
                        content: {
                          itemContent: {
                            tweet_results: {
                              result: {
                                rest_id: "300",
                                legacy: {
                                  id_str: "300",
                                  full_text: "truncated search...",
                                  created_at: "now",
                                  favorite_count: 3,
                                  retweet_count: 1,
                                },
                                note_tweet: {
                                  note_tweet_results: {
                                    result: { text: "complete search longform body" },
                                  },
                                },
                                core: {
                                  user_results: {
                                    result: { core: { screen_name: "search_user" } },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    });

    const x = new XClient(opts);
    const tweets = await x.search("longform", 20, "Latest");

    expect(tweets).toHaveLength(1);
    expect(tweets[0].text).toBe("complete search longform body");
    expect(tweets[0].url).toBe("https://x.com/search_user/status/300");
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

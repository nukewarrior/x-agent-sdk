import { describe, expect, test, afterEach } from "bun:test";

// FxTwitter fallback: reads tweets without cookies.
// These tests mock the fetch global (same pattern as client.test.ts) so
// the suite does not depend on real network access or test ordering.

const TWEET_20 = {
  code: 200,
  tweet: {
    id: "20",
    text: "just setting up my twttr",
    author: { screen_name: "jack", name: "jack" },
    created_at: "Tue Mar 21 20:50:14 +0000 2006",
    likes: 180000,
    retweets: 68000,
    replies: 32000,
    views: 45000000,
    url: "https://twitter.com/jack/status/20",
  },
};

afterEach(() => {
  globalThis.fetch = undefined as any;
});

function installFxMock(handler: (url: string) => { status: number; body: unknown }) {
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    const h = handler(url);
    return new Response(JSON.stringify(h.body), {
      status: h.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("FxTwitter fallback (getTweetPublic)", () => {
  test("returns a parsed tweet for a public tweet id", async () => {
    installFxMock((url) => {
      if (url.includes("/status/20")) return { status: 200, body: TWEET_20 };
      return { status: 404, body: {} };
    });
    const { XClient } = await import("../src/client.js");
    const x = new XClient({ authToken: "test", ct0: "test" });
    const t = await x.getTweetPublic("20");
    expect(t).not.toBeNull();
    expect(t.id).toBe("20");
    expect(t.text).toBe("just setting up my twttr");
    expect(t.author).toBe("jack");
    expect(t.likes).toBe(180000);
  });

  test("returns null for a non-existent tweet id", async () => {
    installFxMock(() => ({ status: 404, body: { code: 404 } }));
    const { XClient } = await import("../src/client.js");
    const x = new XClient({ authToken: "test", ct0: "test" });
    const t = await x.getTweetPublic("9999999999999999999");
    expect(t).toBeNull();
  });

  test("returns null when FxTwitter reports an error body", async () => {
    installFxMock(() => ({ status: 200, body: { code: 400, message: "invalid tweet id" } }));
    const { XClient } = await import("../src/client.js");
    const x = new XClient({ authToken: "test", ct0: "test" });
    const t = await x.getTweetPublic("bad-id");
    expect(t).toBeNull();
  });
});

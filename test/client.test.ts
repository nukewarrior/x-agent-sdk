import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { XClient } from "../src/client.js";
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

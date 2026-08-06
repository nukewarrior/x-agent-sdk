import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { getTransaction, resetTransaction } from "../src/transaction.js";
import { installFetchMock } from "./fixtures.js";

let restore: { calls: { url: string; init: RequestInit }[] } | undefined;

beforeEach(() => {
  restore = installFetchMock(() => ({ status: 200, body: { data: {} } }));
  resetTransaction();
});

afterEach(() => {
  globalThis.fetch = undefined as any;
  resetTransaction();
  restore = undefined;
});

describe("x-client-transaction-id generator", () => {
  test("produces a valid base64 id of plausible length", async () => {
    const tx = await getTransaction();
    const id = tx.generateTransactionId("POST", "/i/api/graphql/abc/xyz");
    expect(id).toBeString();
    expect(id.length).toBeGreaterThanOrEqual(40);
    expect(id).toMatch(/^[A-Za-z0-9+/]+={0,2}$/); // base64 alphabet
  });

  test("each call yields a valid id of plausible length", async () => {
    // The id includes a random byte and a second-precision timestamp, so two
    // consecutive calls are not byte-identical. Verify the SHAPE is stable.
    const tx = await getTransaction();
    const a = tx.generateTransactionId("GET", "/i/api/graphql/abc/xyz");
    const b = tx.generateTransactionId("GET", "/i/api/graphql/abc/xyz");
    for (const id of [a, b]) {
      expect(id).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(id.length).toBeGreaterThanOrEqual(40);
    }
  });

  test("rotates after resetTransaction (different id per request)", async () => {
    const a = (await getTransaction()).generateTransactionId("POST", "/i/api/graphql/abc/xyz");
    resetTransaction();
    const b = (await getTransaction()).generateTransactionId("POST", "/i/api/graphql/abc/xyz");
    expect(a).not.toBe(b);
  });

  test("fetches the home HTML without an API bearer", async () => {
    const { calls } = installFetchMock(() => ({ status: 200, body: { data: {} } }));
    resetTransaction();
    await getTransaction();
    const homeCall = calls.find((c) => c.url.startsWith("https://x.com/") && !c.url.includes("/i/api/"));
    expect(homeCall).toBeDefined();
    const headers = homeCall!.init.headers as Record<string, string> | undefined;
    expect(headers?.authorization).toBeUndefined(); // browser fetch: no bearer
  });
});

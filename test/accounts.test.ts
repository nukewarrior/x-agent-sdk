import { describe, expect, test } from "bun:test";
import { loadAccounts } from "../src/accounts.js";

const env = (e: Record<string, string>): NodeJS.ProcessEnv => e as NodeJS.ProcessEnv;

describe("loadAccounts", () => {
  test("legacy: AUTH_TOKEN + CT0 become the default account", () => {
    expect(loadAccounts(env({ AUTH_TOKEN: "t", CT0: "c" }))).toEqual({
      default: { authToken: "t", ct0: "c" },
    });
  });

  test("parses X_ACCOUNTS JSON with several accounts", () => {
    const a = loadAccounts(
      env({
        X_ACCOUNTS: JSON.stringify({
          work: { authToken: "t1", ct0: "c1" },
          personal: { authToken: "t2", ct0: "c2" },
        }),
      }),
    );
    expect(Object.keys(a)).toEqual(["work", "personal"]);
    expect(a.work).toEqual({ authToken: "t1", ct0: "c1" });
  });

  test("X_ACCOUNTS wins over legacy vars", () => {
    const a = loadAccounts(
      env({
        AUTH_TOKEN: "legacy",
        CT0: "legacy",
        X_ACCOUNTS: JSON.stringify({ main: { authToken: "t", ct0: "c" } }),
      }),
    );
    expect(Object.keys(a)).toEqual(["main"]);
  });

  test("throws on invalid JSON", () => {
    expect(() => loadAccounts(env({ X_ACCOUNTS: "not json" }))).toThrow(/valid JSON/);
  });

  test("throws on account without ct0", () => {
    expect(() =>
      loadAccounts(env({ X_ACCOUNTS: JSON.stringify({ work: { authToken: "t" } }) })),
    ).toThrow(/work/);
  });

  test("throws naming the missing legacy var", () => {
    expect(() => loadAccounts(env({ AUTH_TOKEN: "t" }))).toThrow(/CT0/);
    expect(() => loadAccounts(env({ CT0: "c" }))).toThrow(/AUTH_TOKEN/);
  });

  test("returns {} when nothing is set", () => {
    expect(loadAccounts(env({}))).toEqual({});
  });
});

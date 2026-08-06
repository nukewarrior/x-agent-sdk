/**
 * Account loading for the MCP server.
 *
 * Two credential modes:
 * - Single account (legacy): AUTH_TOKEN + CT0 env vars.
 * - Multiple accounts: X_ACCOUNTS env var, a JSON object mapping an account
 *   name to its cookies, e.g.
 *   {"default":{"authToken":"...","ct0":"..."},"work":{"authToken":"...","ct0":"..."}}
 */
export interface AccountCreds {
  authToken: string;
  ct0: string;
}

export type Accounts = Record<string, AccountCreds>;

export function loadAccounts(env: NodeJS.ProcessEnv = process.env): Accounts {
  const raw = env.X_ACCOUNTS;
  if (!raw) {
    if (env.AUTH_TOKEN && env.CT0) {
      return { default: { authToken: env.AUTH_TOKEN, ct0: env.CT0 } };
    }
    if (env.AUTH_TOKEN || env.CT0) {
      const missing = env.AUTH_TOKEN ? "CT0" : "AUTH_TOKEN";
      throw new Error(`Missing ${missing} — both AUTH_TOKEN and CT0 are required.`);
    }
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`X_ACCOUNTS is not valid JSON: ${raw.slice(0, 40)}...`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      'X_ACCOUNTS must be a JSON object: {"<name>":{"authToken":"...","ct0":"..."}}',
    );
  }

  const accounts: Accounts = {};
  for (const [name, creds] of Object.entries(parsed as Record<string, unknown>)) {
    const c = creds as Partial<AccountCreds> | undefined;
    if (!c || typeof c.authToken !== "string" || typeof c.ct0 !== "string") {
      throw new Error(`X_ACCOUNTS account "${name}" must have string authToken and ct0.`);
    }
    accounts[name] = { authToken: c.authToken, ct0: c.ct0 };
  }
  return accounts;
}

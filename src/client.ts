import { getTransaction, resetTransaction } from "./transaction.js";

const BASE = "https://x.com/i/api/graphql";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** Public web-app bearer token. Static across the X web client. */
const DEFAULT_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

/** queryId map (July 2026 bundle). Re-capture from main.<hash>.js if these 400. */
export const QID = {
  CreateTweet: "R5EPiGHgSqbTYFyozd-gFw",
  DeleteTweet: "nxpZCY2K-I6QoFHAHeojFQ",
  FavoriteTweet: "lI07N6Otwv1PhnEgXILM7A",
  UnfavoriteTweet: "ZYKSe-w7KEslx3JhSIk5LA",
  CreateRetweet: "mbRO74GrOvSfRcJnlMapnQ",
  DeleteRetweet: "ZyZigVsNiFO6v1dEks1eWg",
  TweetDetail: "jd3V43oDY9cY7obs1YMfbQ",
  UserTweets: "hr4gzZONlq23okjU8fIe_A",
  UserTweetsAndReplies: "FIFgycIi-CNJcV0R-135Uw",
  Likes: "tl9f_I0xyREhFd5KMzuO7w",
  HomeTimeline: "gKia-nBM9kwuDEfSDeWMfQ",
  HomeLatestTimeline: "g9NSjyYXOBsmMiP9TmYGaA",
  SearchTimeline: "Bcw3RzK-PatNAmbnw54hFw",
  UserByScreenName: "2qvSHpkWTMS9i0zJAwDNiA",
  UserByRestId: "DaeC_2LfMgwCujE03HSZtw",
  Followers: "4yeuNabfz3qFlfncCAy8Yw",
  Following: "eNoXdfXv5rU75RBzlmfuPA",
  CreateBookmark: "aoDbu3RHznuiSkQ9aNM67Q",
  DeleteBookmark: "Wlmlj2-xzyS1GN3a6cj-mQ",
} as const;

type Action = keyof typeof QID;

const FEATURES_CREATE: Record<string, boolean> = {
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  articles_preview_enabled: true,
  rweb_cashtags_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
};

const FEATURES_READ: Record<string, boolean> = {
  rweb_video_screen_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

export interface RateLimitInfo {
  /** Requests left in the current window (x-rate-limit-remaining). */
  remaining: number;
  /** Unix seconds when the window resets (x-rate-limit-reset), 0 if absent. */
  reset: number;
  /** Window size (x-rate-limit-limit), 0 if absent. */
  limit: number;
}

export interface XClientOptions {
  /** Cookie `auth_token`. Falls back to env AUTH_TOKEN. */
  authToken?: string;
  /** Cookie `ct0` (also the CSRF token). Falls back to env CT0. */
  ct0?: string;
  /** Override the web-app bearer if it ever rotates. */
  bearer?: string;
  /** Retry budget for 344/429 responses. Default 3. */
  retries?: number;
  /** Override the sleeper for tests (or rate-limit adapters). */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Override the HTTP client. Plug a TLS-impersonating transport here
   * (e.g. a curl-impersonate wrapper) to mimic Chrome's TLS fingerprint.
   * Defaults to the global fetch.
   */
  fetch?: typeof fetch;
  /** Called after each response that carries x-rate-limit-* headers. */
  onRateLimit?: (info: RateLimitInfo) => void;
}

export interface TweetArticle {
  id?: string;
  title?: string;
  preview_text?: string;
  plain_text?: string;
}

export interface Tweet {
  id: string | undefined;
  text: string | undefined;
  author?: string;
  created_at: string | undefined;
  likes: number | undefined;
  retweets: number | undefined;
  replies?: number | undefined;
  url?: string;
  article?: TweetArticle;
}

export interface XUser {
  id: string | undefined;
  username: string | undefined;
  name: string | undefined;
  followers: number | undefined;
  following: number | undefined;
  description: string | undefined;
}

/** One page of a paginated timeline. `next_cursor` is null on the last page. */
export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export class XError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "XError";
    this.code = code;
  }
}

async (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let clientSleep = async (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class XClient {
  private authToken: string;
  private ct0: string;
  private bearer: string;
  private retries: number;
  private sleep: (ms: number) => Promise<void>;
  private fetchImpl: typeof fetch;
  private onRateLimit?: (info: RateLimitInfo) => void;
  private lastRateLimit: RateLimitInfo | null = null;

  constructor(opts: XClientOptions = {}) {
    const authToken = opts.authToken ?? process.env.AUTH_TOKEN;
    const ct0 = opts.ct0 ?? process.env.CT0;
    if (!authToken || !ct0) {
      throw new XError(
        "Missing credentials: pass { authToken, ct0 } or set AUTH_TOKEN / CT0 env vars.",
      );
    }
    this.authToken = authToken;
    this.ct0 = ct0;
    this.bearer = opts.bearer ?? DEFAULT_BEARER;
    this.retries = opts.retries ?? 3;
    this.sleep = opts.sleep ?? (async (ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    this.onRateLimit = opts.onRateLimit;
  }

  /** Last rate-limit info seen on a response, or null before the first API call. */
  getLastRateLimit(): RateLimitInfo | null {
    return this.lastRateLimit;
  }

  private async fetchWithTracking(
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const res = await this.fetchImpl(url as any, init as any);
    const remaining = res.headers.get("x-rate-limit-remaining");
    if (remaining !== null) {
      const info: RateLimitInfo = {
        remaining: Number(remaining),
        reset: Number(res.headers.get("x-rate-limit-reset")) || 0,
        limit: Number(res.headers.get("x-rate-limit-limit")) || 0,
      };
      this.lastRateLimit = info;
      this.onRateLimit?.(info);
    }
    return res;
  }

  private baseHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.bearer}`,
      "x-csrf-token": this.ct0,
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language": "en",
      "user-agent": UA,
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "sec-ch-ua":
        '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      origin: "https://x.com",
      referer: "https://x.com/home",
      cookie: `auth_token=${this.authToken}; ct0=${this.ct0}`,
    };
  }

  private async request(
    method: "GET" | "POST",
    action: Action,
    variables: Record<string, unknown>,
    features?: Record<string, boolean>,
    fieldToggles?: Record<string, unknown>,
  ): Promise<any> {
    const qid = QID[action];
    const path = `/i/api/graphql/${qid}/${action}`;
    const url = `${BASE}/${qid}/${action}`;

    const cookie = `auth_token=${this.authToken}; ct0=${this.ct0}`;
    for (let attempt = 0; attempt < this.retries; attempt++) {
      const tx = await getTransaction({ cookie });
      const tid = await tx.generateTransactionId(method, path);
      const headers: Record<string, string> = {
        ...this.baseHeaders(),
        "x-client-transaction-id": tid,
      };

      let res: Response;
      if (method === "POST") {
        headers["content-type"] = "application/json";
        headers["referer"] = "https://x.com/compose/post";
        const body: Record<string, unknown> = { variables, queryId: qid };
        if (features) body.features = features;
        res = await this.fetchWithTracking(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
      } else {
        const params = new URLSearchParams({
          variables: JSON.stringify(variables),
        });
        if (features) params.set("features", JSON.stringify(features));
        if (fieldToggles) params.set("fieldToggles", JSON.stringify(fieldToggles));
        res = await this.fetchWithTracking(`${url}?${params.toString()}`, { method: "GET", headers });
      }

      // Hard HTTP rate limit -> honor x-rate-limit-reset.
      if (res.status === 429) {
        const reset = Number(res.headers.get("x-rate-limit-reset")) || 0;
        const wait = Math.max(5, reset - Math.floor(Date.now() / 1000)) + 1;
        await this.sleep(wait * 1000);
        continue;
      }

      let data: any;
      try {
        data = await res.json();
      } catch {
        if (!res.ok) throw new XError(`HTTP ${res.status}`, res.status);
        throw new XError("Non-JSON response");
      }

      const errs: any[] = data?.errors ?? [];
      const codes = new Set(errs.map((e) => e.code));

      // 344 with a healthy rate-limit bucket == anti-bot / stale transaction-id.
      // Rebuild the generator and back off before retrying.
      if (codes.has(344) || codes.has(429)) {
        resetTransaction();
        const wait = 30 * 2 ** attempt + Math.floor(Math.random() * 10);
        await this.sleep(wait * 1000);
        continue;
      }
      if (errs.length) {
        const first = errs[0];
        throw new XError(first.message ?? JSON.stringify(errs), first.code);
      }
      return data;
    }
    throw new XError(`${action}: retries exhausted`);
  }

  /** POST to a legacy REST v1.1 endpoint (form-encoded). Used for follow/unfollow,
   *  which never moved to GraphQL. `path` e.g. "friendships/create.json". */
  private async restPost(path: string, params: Record<string, string>): Promise<any> {
    const apiPath = `/i/api/1.1/${path}`;
    const url = `https://x.com${apiPath}`;
    const cookie = `auth_token=${this.authToken}; ct0=${this.ct0}`;
    for (let attempt = 0; attempt < this.retries; attempt++) {
      const tx = await getTransaction({ cookie });
      const tid = await tx.generateTransactionId("POST", apiPath);
      const res = await this.fetchWithTracking(url, {
        method: "POST",
        headers: {
          ...this.baseHeaders(),
          "x-client-transaction-id": tid,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(params).toString(),
      });
      if (res.status === 429) {
        const reset = Number(res.headers.get("x-rate-limit-reset")) || 0;
        await this.sleep((Math.max(5, reset - Math.floor(Date.now() / 1000)) + 1) * 1000);
        continue;
      }
      const data = await res.json().catch(() => ({}));
      const errs: any[] = data?.errors ?? [];
      if (errs.some((e) => e.code === 344 || e.code === 429)) {
        resetTransaction();
        await this.sleep((30 * 2 ** attempt + Math.floor(Math.random() * 10)) * 1000);
        continue;
      }
      if (errs.length) throw new XError(errs[0].message ?? JSON.stringify(errs), errs[0].code);
      return data;
    }
    throw new XError(`${path}: retries exhausted`);
  }

  /** GET a legacy REST endpoint (v1.1 / v2). `path` e.g. "1.1/dm/inbox_initial_state.json". */
  private async restGet(path: string, params: Record<string, string> = {}): Promise<any> {
    const apiPath = `/i/api/${path}`;
    const qs = new URLSearchParams(params).toString();
    const url = `https://x.com${apiPath}${qs ? `?${qs}` : ""}`;
    const cookie = `auth_token=${this.authToken}; ct0=${this.ct0}`;
    for (let attempt = 0; attempt < this.retries; attempt++) {
      const tx = await getTransaction({ cookie });
      const tid = await tx.generateTransactionId("GET", apiPath);
      const res = await this.fetchWithTracking(url, {
        method: "GET",
        headers: { ...this.baseHeaders(), "x-client-transaction-id": tid },
      });
      if (res.status === 429) {
        const reset = Number(res.headers.get("x-rate-limit-reset")) || 0;
        await this.sleep((Math.max(5, reset - Math.floor(Date.now() / 1000)) + 1) * 1000);
        continue;
      }
      const data = await res.json().catch(() => ({}));
      const errs: any[] = data?.errors ?? [];
      if (errs.some((e) => e.code === 344 || e.code === 429)) {
        resetTransaction();
        await this.sleep((30 * 2 ** attempt + Math.floor(Math.random() * 10)) * 1000);
        continue;
      }
      if (errs.length) throw new XError(errs[0].message ?? JSON.stringify(errs), errs[0].code);
      return data;
    }
    throw new XError(`${path}: retries exhausted`);
  }

  /** POST JSON to a legacy REST endpoint (used by DM send). */
  private async restPostJson(path: string, body: Record<string, unknown>): Promise<any> {
    const apiPath = `/i/api/${path}`;
    const url = `https://x.com${apiPath}`;
    const cookie = `auth_token=${this.authToken}; ct0=${this.ct0}`;
    for (let attempt = 0; attempt < this.retries; attempt++) {
      const tx = await getTransaction({ cookie });
      const tid = await tx.generateTransactionId("POST", apiPath);
      const res = await this.fetchWithTracking(url, {
        method: "POST",
        headers: {
          ...this.baseHeaders(),
          "x-client-transaction-id": tid,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.status === 429) {
        const reset = Number(res.headers.get("x-rate-limit-reset")) || 0;
        await this.sleep((Math.max(5, reset - Math.floor(Date.now() / 1000)) + 1) * 1000);
        continue;
      }
      const data = await res.json().catch(() => ({}));
      const errs: any[] = data?.errors ?? [];
      if (errs.some((e) => e.code === 344 || e.code === 429)) {
        resetTransaction();
        await this.sleep((30 * 2 ** attempt + Math.floor(Math.random() * 10)) * 1000);
        continue;
      }
      if (errs.length) throw new XError(errs[0].message ?? JSON.stringify(errs), errs[0].code);
      return data;
    }
    throw new XError(`${path}: retries exhausted`);
  }

  // ---- Write actions ----

  /**
   * Publish a tweet. Options: `replyTo` makes it a reply; `quoteTweetUrl` makes it
   * a quote tweet (pass the full https://x.com/user/status/ID url of the quoted tweet).
   * Returns the new tweet id.
   */
  async postTweet(
    text: string,
    replyTo?: string,
    opts: { quoteTweetUrl?: string } = {},
  ): Promise<string> {
    const variables: Record<string, unknown> = {
      tweet_text: text,
      media: { media_entities: [], possibly_sensitive: false },
      semantic_annotation_ids: [],
      disallowed_reply_options: null,
      semantic_annotation_options: { source: "Profile" },
    };
    if (replyTo) {
      variables.reply = {
        in_reply_to_tweet_id: String(replyTo),
        exclude_reply_user_ids: [],
      };
    }
    if (opts.quoteTweetUrl) variables.attachment_url = opts.quoteTweetUrl;
    const data = await this.request("POST", "CreateTweet", variables, FEATURES_CREATE);
    return data.data.create_tweet.tweet_results.result.rest_id;
  }

  reply(tweetId: string, text: string): Promise<string> {
    return this.postTweet(text, tweetId);
  }

  /**
   * Quote-tweet: post `text` quoting the tweet at `tweetUrl` (or a bare id).
   * X requires the canonical `https://x.com/<handle>/status/<id>` form for
   * `attachment_url`, so when given a bare id we resolve the author's handle first.
   */
  async quote(tweetUrlOrId: string, text: string): Promise<string> {
    let url: string;
    if (/^https?:\/\//.test(tweetUrlOrId)) {
      url = tweetUrlOrId;
    } else {
      const detail = await this.getTweet(tweetUrlOrId);
      const handle = findAuthorHandle(detail, tweetUrlOrId);
      if (!handle) throw new XError("could not resolve tweet author for quote url");
      url = `https://x.com/${handle}/status/${tweetUrlOrId}`;
    }
    return this.postTweet(text, undefined, { quoteTweetUrl: url });
  }

  // ---- Direct messages ----

  /**
   * Send a direct message. `recipientId` is the recipient's numeric user id; the
   * conversation id is derived from both ids (X's convention).
   * Use `conversationId` directly to reply into an existing/group conversation.
   */
  async sendDM(recipientId: string, text: string, conversationId?: string): Promise<any> {
    const myId = await this.myUserId();
    const convo = conversationId ?? [myId, String(recipientId)].sort().join("-");
    return this.restPostJson("1.1/dm/new2.json", {
      conversation_id: convo,
      recipient_ids: false,
      text,
      cards_platform: "Web-12",
      include_cards: 1,
      include_quote_count: true,
      dm_users: false,
    });
  }

  /** Fetch the DM inbox (conversations + recent messages, raw v1.1 shape). */
  async getDMInbox(): Promise<any> {
    return this.restGet("1.1/dm/inbox_initial_state.json", {
      include_profile_interstitial_type: "1",
      include_ext_alt_text: "true",
      dm_users: "false",
      include_groups: "true",
      include_inbox_timelines: "true",
    });
  }

  // ---- Notifications ----

  /** All notifications (raw v2 shape: globalObjects + timeline). */
  async getNotifications(count = 20): Promise<any> {
    return this.restGet("2/notifications/all.json", {
      count: String(count),
      include_profile_interstitial_type: "1",
    });
  }

  /** Mentions timeline (raw v2 shape). */
  async getMentions(count = 20): Promise<any> {
    return this.restGet("2/notifications/mentions.json", { count: String(count) });
  }

  /** Your own numeric user id (rest_id), auto-resolved once and cached. */
  private _uid?: string;
  async myUserId(): Promise<string> {
    if (this._uid) return this._uid;
    if (process.env.X_USER_ID) return (this._uid = process.env.X_USER_ID);
    const d = await this.restGet("1.1/account/verify_credentials.json");
    if (!d?.id_str) throw new XError("could not resolve own user id");
    return (this._uid = d.id_str);
  }

  async deleteTweet(tweetId: string): Promise<boolean> {
    const d = await this.request("POST", "DeleteTweet", { tweet_id: String(tweetId) });
    return "delete_tweet" in (d.data ?? {});
  }

  async like(tweetId: string): Promise<boolean> {
    const d = await this.request("POST", "FavoriteTweet", { tweet_id: String(tweetId) });
    return "favorite_tweet" in (d.data ?? {});
  }

  async unlike(tweetId: string): Promise<boolean> {
    const d = await this.request("POST", "UnfavoriteTweet", { tweet_id: String(tweetId) });
    return "unfavorite_tweet" in (d.data ?? {});
  }

  async retweet(tweetId: string): Promise<boolean> {
    const d = await this.request("POST", "CreateRetweet", { tweet_id: String(tweetId) });
    return "create_retweet" in (d.data ?? {});
  }

  async unretweet(tweetId: string): Promise<boolean> {
    const d = await this.request("POST", "DeleteRetweet", { source_tweet_id: String(tweetId) });
    return "unretweet" in (d.data ?? {});
  }

  async bookmark(tweetId: string): Promise<boolean> {
    const d = await this.request("POST", "CreateBookmark", { tweet_id: String(tweetId) });
    return "tweet_bookmark_put" in (d.data ?? {});
  }

  async unbookmark(tweetId: string): Promise<boolean> {
    const d = await this.request("POST", "DeleteBookmark", { tweet_id: String(tweetId) });
    return "tweet_bookmark_delete" in (d.data ?? {});
  }

  // ---- Read actions ----

  async getUser(username: string): Promise<any> {
    const d = await this.request(
      "GET",
      "UserByScreenName",
      { screen_name: username, withSafetyModeUserFields: true },
      {
        hidden_profile_subscriptions_enabled: true,
        rweb_tipjar_consumption_enabled: false,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        subscriptions_verification_info_is_identity_verified_enabled: true,
        subscriptions_verification_info_verified_since_enabled: true,
        highlights_tweets_tab_ui_enabled: true,
        responsive_web_twitter_article_notes_tab_enabled: true,
        subscriptions_feature_can_gift_premium: false,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true,
      },
    );
    return d.data.user.result;
  }

  /** Recent tweets by a user. Use `getUserTweetsPage` for pagination. */
  async getUserTweets(userId: string, count = 20): Promise<Tweet[]> {
    return (await this.getUserTweetsPage(userId, count)).items;
  }

  /** One page of a user's tweets; pass `cursor` (from `next_cursor`) for the next page. */
  async getUserTweetsPage(
    userId: string,
    count = 20,
    cursor?: string,
  ): Promise<Page<Tweet>> {
    const d = await this.request(
      "GET",
      "UserTweets",
      { userId: String(userId), count, includePromotedContent: false, ...(cursor ? { cursor } : {}) },
      FEATURES_READ,
    );
    return {
      items: extractTimelineTweets(d),
      next_cursor: bottomCursor(d?.data?.user?.result?.timeline_v2?.timeline?.instructions),
    };
  }

  /** Tweets a user liked. Use `getLikesPage` for pagination. */
  async getLikes(userId: string, count = 20): Promise<Tweet[]> {
    return (await this.getLikesPage(userId, count)).items;
  }

  /** One page of liked tweets; pass `cursor` for the next page. */
  async getLikesPage(
    userId: string,
    count = 20,
    cursor?: string,
  ): Promise<Page<Tweet>> {
    const d = await this.request(
      "GET",
      "Likes",
      { userId: String(userId), count, includePromotedContent: false, ...(cursor ? { cursor } : {}) },
      FEATURES_READ,
    );
    return {
      items: extractTimelineTweets(d),
      next_cursor: bottomCursor(d?.data?.user?.result?.timeline_v2?.timeline?.instructions),
    };
  }

  /** Follow a user by numeric id. */
  async follow(userId: string): Promise<boolean> {
    const d = await this.restPost("friendships/create.json", {
      user_id: String(userId),
      include_profile_interstitial_type: "1",
      skip_status: "1",
    });
    return !!d?.id_str;
  }

  /** Unfollow a user by numeric id. */
  async unfollow(userId: string): Promise<boolean> {
    const d = await this.restPost("friendships/destroy.json", {
      user_id: String(userId),
      skip_status: "1",
    });
    return !!d?.id_str;
  }

  /** A user's followers. Use `getFollowersPage` for pagination. */
  async getFollowers(userId: string, count = 20): Promise<XUser[]> {
    return (await this.getFollowersPage(userId, count)).items;
  }

  /** One page of followers; pass `cursor` for the next page. */
  async getFollowersPage(
    userId: string,
    count = 20,
    cursor?: string,
  ): Promise<Page<XUser>> {
    const d = await this.request(
      "GET",
      "Followers",
      { userId: String(userId), count, includePromotedContent: false, ...(cursor ? { cursor } : {}) },
      FEATURES_READ,
    );
    return {
      items: extractTimelineUsers(d),
      next_cursor: bottomCursor(d?.data?.user?.result?.timeline?.timeline?.instructions),
    };
  }

  /** Who a user follows. Use `getFollowingPage` for pagination. */
  async getFollowing(userId: string, count = 20): Promise<XUser[]> {
    return (await this.getFollowingPage(userId, count)).items;
  }

  /** One page of following; pass `cursor` for the next page. */
  async getFollowingPage(
    userId: string,
    count = 20,
    cursor?: string,
  ): Promise<Page<XUser>> {
    const d = await this.request(
      "GET",
      "Following",
      { userId: String(userId), count, includePromotedContent: false, ...(cursor ? { cursor } : {}) },
      FEATURES_READ,
    );
    return {
      items: extractTimelineUsers(d),
      next_cursor: bottomCursor(d?.data?.user?.result?.timeline?.timeline?.instructions),
    };
  }

  /** Search tweets. Use `searchPage` for pagination. */
  async search(query: string, count = 20, product: "Top" | "Latest" | "People" | "Media" = "Top"): Promise<Tweet[]> {
    return (await this.searchPage(query, count, product)).items;
  }

  /** One page of search results; pass `cursor` for the next page. */
  async searchPage(
    query: string,
    count = 20,
    product: "Top" | "Latest" | "People" | "Media" = "Top",
    cursor?: string,
  ): Promise<Page<Tweet>> {
    const d = await this.request(
      "GET",
      "SearchTimeline",
      { rawQuery: query, count, querySource: "typed_query", product, ...(cursor ? { cursor } : {}) },
      FEATURES_READ,
    );
    return {
      items: extractSearchTweets(d),
      next_cursor: bottomCursor(
        d?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions,
      ),
    };
  }

  /** The For You timeline. Use `homeTimelinePage` for pagination. */
  async homeTimeline(count = 20): Promise<Tweet[]> {
    return (await this.homeTimelinePage(count)).items;
  }

  /** One page of the home timeline; pass `cursor` for the next page. */
  async homeTimelinePage(count = 20, cursor?: string): Promise<Page<Tweet>> {
    const d = await this.request(
      "GET",
      "HomeTimeline",
      { count, includePromotedContent: true, latestControlAvailable: true, ...(cursor ? { cursor } : {}) },
      FEATURES_READ,
    );
    return {
      items: extractTimelineTweets(d),
      next_cursor: bottomCursor(d?.data?.user?.result?.timeline_v2?.timeline?.instructions),
    };
  }

  async getTweet(tweetId: string): Promise<any> {
    return this.request(
      "GET",
      "TweetDetail",
      {
        focalTweetId: String(tweetId),
        with_rux_injections: false,
        rankingMode: "Relevance",
        includePromotedContent: true,
        withCommunity: true,
        withQuickPromoteEligibilityTweetFields: true,
        withBirdwatchNotes: true,
        withVoice: true,
      },
      FEATURES_READ,
      {
        withArticleRichContentState: true,
        withArticlePlainText: true,
        withGrokAnalyze: false,
        withDisallowedReplyControls: false,
      },
    );
  }

  /**
   * Read a tweet without cookies via the public FxTwitter API
   * (api.fxtwitter.com). No auth, no rate-limit risk on the X account.
   * Returns the parsed tweet or null if FxTwitter cannot resolve it
   * (deleted, private, or non-existent tweet).
   */
  async getTweetPublic(tweetId: string): Promise<any> {
    const res = await this.fetchWithTracking(`https://api.fxtwitter.com/status/${tweetId}`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data?.code !== 200 || !data?.tweet) return null;
    const t = data.tweet;
    return {
      id: t.id,
      text: t.text,
      author: t.author?.screen_name,
      author_name: t.author?.name,
      created_at: t.created_at,
      likes: t.likes,
      retweets: t.retweets,
      replies: t.replies,
      views: t.views,
      url: t.url,
      media: t.media?.all?.map((m: any) => m.url) ?? [],
    };
  }

  /** Convenience: return a focal tweet plus replies included in TweetDetail. */
  async getThread(tweetId: string): Promise<{
    root: Partial<ParsedTweet>;
    replies: ParsedTweet[];
  }> {
    const data = await this.getTweet(tweetId);
    const instr = data?.data?.threaded_conversation_with_injections_v2?.instructions ?? [];
    let root: Partial<ParsedTweet> = {};
    const replies: ParsedTweet[] = [];
    const seenReplies = new Set<string>();

    const collect = (raw: any, reply: boolean) => {
      const tweet = parseTweetResult(raw);
      if (!tweet?.id) return;
      if (String(tweet.id) === String(tweetId)) {
        root = tweet;
        return;
      }
      if (reply && !seenReplies.has(tweet.id)) {
        seenReplies.add(tweet.id);
        replies.push(tweet);
      }
    };

    for (const ins of instr) {
      for (const entry of ins.entries ?? []) {
        const direct = entry?.content?.itemContent?.tweet_results?.result;
        if (direct) collect(direct, false);

        for (const raw of tweetModuleResults(entry)) {
          collect(raw, true);
        }
      }

      for (const item of ins.moduleItems ?? []) {
        for (const raw of tweetModuleResults({ content: { items: [item] } })) {
          collect(raw, true);
        }
      }
    }

    return { root, replies };
  }
}

/** Last bottom cursor in a timeline's instructions, or null when exhausted. */
function bottomCursor(instructions: any[] | undefined): string | null {
  if (!instructions) return null;
  for (let i = instructions.length - 1; i >= 0; i--) {
    for (const entry of instructions[i]?.entries ?? []) {
      const id: string = entry.entryId ?? "";
      if (id.startsWith("cursor-bottom")) {
        const v = entry.content?.value;
        if (typeof v === "string" && v) return v;
      }
    }
  }
  return null;
}

type ParsedTweet = Tweet & { views?: string };

function unwrapTweetResult(result: any): any {
  if (result?.__typename === "TweetWithVisibilityResults" && result?.tweet) {
    return unwrapTweetResult(result.tweet);
  }
  return result;
}

function tweetModuleResults(entry: any): any[] {
  const out: any[] = [];
  for (const item of entry?.content?.items ?? []) {
    const result = item?.item?.itemContent?.tweet_results?.result;
    if (result) out.push(result);
  }
  return out;
}

function tweetResultsFromEntry(entry: any): any[] {
  const out: any[] = [];
  const direct = entry?.content?.itemContent?.tweet_results?.result;
  if (direct) out.push(direct);
  out.push(...tweetModuleResults(entry));
  return out;
}

function parseTweetResult(rawResult: any): ParsedTweet | null {
  const result = unwrapTweetResult(rawResult);
  if (!result) return null;

  const legacy = result?.legacy ?? {};
  const retweeted = unwrapTweetResult(legacy?.retweeted_status_result?.result);
  const content = retweeted ?? result;
  const contentLegacy = content?.legacy ?? {};
  const noteResult = content?.note_tweet?.note_tweet_results?.result;
  const text =
    typeof noteResult?.text === "string"
      ? noteResult.text
      : contentLegacy?.full_text;

  const userResult = result?.core?.user_results?.result;
  const user = userResult?.core ?? userResult?.legacy ?? {};
  const id = legacy?.id_str ?? result?.rest_id;

  const articleResult =
    content?.article?.article_results?.result ??
    content?.article;
  const article =
    articleResult &&
    (typeof articleResult?.title === "string" ||
      typeof articleResult?.preview_text === "string" ||
      typeof articleResult?.plain_text === "string")
      ? {
          id: articleResult?.rest_id ?? articleResult?.id,
          title: articleResult?.title,
          preview_text: articleResult?.preview_text,
          plain_text: articleResult?.plain_text,
        }
      : undefined;

  if (!id && text === undefined) return null;

  return {
    id,
    text,
    author: user?.screen_name,
    created_at: legacy?.created_at,
    likes: legacy?.favorite_count,
    retweets: legacy?.retweet_count,
    replies: legacy?.reply_count,
    url: id && user?.screen_name
      ? `https://x.com/${user.screen_name}/status/${id}`
      : undefined,
    article,
    views: result?.views?.count,
  };
}

function extractTimelineTweets(data: any): Tweet[] {
  const out: Tweet[] = [];
  const seen = new Set<string>();
  const push = (raw: any) => {
    const tweet = parseTweetResult(raw);
    if (!tweet?.id || seen.has(tweet.id)) return;
    seen.add(tweet.id);
    out.push(tweet);
  };

  try {
    const instr = data.data.user.result.timeline_v2.timeline.instructions;
    for (const i of instr) {
      for (const entry of i.entries ?? []) {
        for (const raw of tweetResultsFromEntry(entry)) push(raw);
      }
      for (const item of i.moduleItems ?? []) {
        for (const raw of tweetModuleResults({ content: { items: [item] } })) push(raw);
      }
    }
  } catch {
    /* structure changed */
  }
  return out;
}

/** Dig the author screen_name out of a TweetDetail response, for building quote urls. */
function findAuthorHandle(detail: any, tweetId?: string): string | undefined {
  try {
    const instr = detail.data.threaded_conversation_with_injections_v2.instructions;
    for (const ins of instr) {
      for (const entry of ins.entries ?? []) {
        for (const raw of tweetResultsFromEntry(entry)) {
          const tweet = parseTweetResult(raw);
          if (tweet?.author && (!tweetId || String(tweet.id) === String(tweetId))) {
            return tweet.author;
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function extractTimelineUsers(data: any): XUser[] {
  const out: XUser[] = [];
  try {
    const instr = data.data.user.result.timeline.timeline.instructions;
    for (const i of instr) {
      for (const entry of i.entries ?? []) {
        const res = entry?.content?.itemContent?.user_results?.result;
        if (res) {
          const lg = res.legacy ?? {};
          const core = res.core ?? {};
          out.push({
            id: res.rest_id,
            username: core.screen_name ?? lg.screen_name,
            name: core.name ?? lg.name,
            followers: lg.followers_count,
            following: lg.friends_count,
            description: lg.description,
          });
        }
      }
    }
  } catch {
    /* structure changed */
  }
  return out;
}

function extractSearchTweets(data: any): Tweet[] {
  const out: Tweet[] = [];
  const seen = new Set<string>();
  const push = (raw: any) => {
    const tweet = parseTweetResult(raw);
    if (!tweet?.id || seen.has(tweet.id)) return;
    seen.add(tweet.id);
    out.push(tweet);
  };

  try {
    const instr = data.data.search_by_raw_query.search_timeline.timeline.instructions;
    for (const i of instr) {
      for (const entry of i.entries ?? []) {
        for (const raw of tweetResultsFromEntry(entry)) push(raw);
      }
      for (const item of i.moduleItems ?? []) {
        for (const raw of tweetModuleResults({ content: { items: [item] } })) push(raw);
      }
    }
  } catch {
    /* structure changed */
  }
  return out;
}

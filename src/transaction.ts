// =============================================================================
// x-client-transaction-id generator.
//
// X's web client signs every API request with an `x-client-transaction-id`
// header. This module generates that header in-process.
//
// Verified live: the ids this produces are accepted by X for real
// tweet/like/search calls.
//
// How the id is built, per request:
//   1. key       = base64 content of <meta name="twitter-site-verification">
//   2. animation = derived from one of the 4 <svg id="loading-x-anim-*"> paths,
//                  selected/animated using bytes of `key` and a cubic-bezier
//                  easing evaluated at a key-derived time.
//   3. hash      = sha256(`${method}!${path}!${timeNow}${KEYWORD}${animation}`)
//   4. id        = base64( [rnd, ...(key ⊕ rnd), (time ⊕ rnd), (hash[:16] ⊕ rnd), (3 ⊕ rnd)] )
// =============================================================================

import { parse, type HTMLElement } from "node-html-parser";
import { createHash } from "node:crypto";

const KEYWORD = "obfiowerehiring";
const ADDITIONAL_RANDOM_NUMBER = 3;
// Epoch offset X uses for the embedded timestamp (2023-05-01T07:00:00Z-ish).
const EPOCH_OFFSET_MS = 1682924400 * 1000;

const ON_DEMAND_FILE_REGEX = /["']ondemand\.s["']:\s*["']([0-9a-f]+)["']/;
// The obfuscated chunk indexes into `key` bytes via calls like `(o[2], 16)`.
// The first match is the row-index byte; the rest multiply into the frame time.
const INDICES_REGEX = /\(\w\[(\d{1,2})\],\s*16\)/g;

// ---- small numeric helpers (ported 1:1 from the bundle) ----------------------

/** JS Math.round semantics (round half up, sign-preserving) — differs from most
 *  languages on negative .5, so we replicate it exactly. */
function mathRound(num: number): number {
  const x = Math.floor(num);
  const r = num - x >= 0.5 ? Math.ceil(num) : x;
  return Object.is(r, -0) ? 0 : Math.sign(num) < 0 && r === 0 ? -0 : r;
}

function isOdd(n: number): number {
  return n % 2 ? -1.0 : 0.0;
}

/** Port of the bundle's bespoke float->hex (integer part + fractional nibbles). */
function floatToHex(x: number): string {
  const result: string[] = [];
  let quotient = Math.trunc(x);
  let fraction = x - quotient;
  while (quotient > 0) {
    quotient = Math.trunc(x / 16);
    const remainder = Math.trunc(x - quotient * 16);
    result.unshift(remainder > 9 ? String.fromCharCode(remainder + 55) : String(remainder));
    x = quotient;
  }
  if (fraction === 0) return result.join("");
  result.push(".");
  while (fraction > 0) {
    fraction *= 16;
    const integer = Math.trunc(fraction);
    fraction -= integer;
    result.push(integer > 9 ? String.fromCharCode(integer + 55) : String(integer));
  }
  return result.join("");
}

function interpolate(from: number[], to: number[], f: number): number[] {
  return from.map((v, i) => v * (1 - f) + to[i] * f);
}

function rotationMatrix(deg: number): number[] {
  const rad = (deg * Math.PI) / 180;
  return [Math.cos(rad), -Math.sin(rad), Math.sin(rad), Math.cos(rad)];
}

/** Cubic-bezier solver (X easing). Mirrors the bundle's binary-search evaluator. */
class Cubic {
  constructor(private c: number[]) {}
  getValue(t: number): number {
    const c = this.c;
    let startGradient = 0;
    let endGradient = 0;
    let start = 0;
    let mid = 0;
    let end = 1;
    if (t <= 0) {
      if (c[0] > 0) startGradient = c[1] / c[0];
      else if (c[1] === 0 && c[2] > 0) startGradient = c[3] / c[2];
      return startGradient * t;
    }
    if (t >= 1) {
      if (c[2] < 1) endGradient = (c[3] - 1) / (c[2] - 1);
      else if (c[2] === 1 && c[0] < 1) endGradient = (c[1] - 1) / (c[0] - 1);
      return 1 + endGradient * (t - 1);
    }
    while (start < end) {
      mid = (start + end) / 2;
      const xEst = Cubic.calc(c[0], c[2], mid);
      if (Math.abs(t - xEst) < 0.00001) return Cubic.calc(c[1], c[3], mid);
      if (xEst < t) start = mid;
      else end = mid;
    }
    return Cubic.calc(c[1], c[3], mid);
  }
  private static calc(a: number, b: number, m: number): number {
    return 3 * a * (1 - m) * (1 - m) * m + 3 * b * (1 - m) * m * m + m * m * m;
  }
}

// ---- the generator -----------------------------------------------------------

export class ClientTransaction {
  private keyBytes!: number[];
  private animationKey!: string;

  private constructor(
    private rowIndex: number,
    private keyByteIndices: number[],
    keyBytes: number[],
    animationKey: string,
  ) {
    this.keyBytes = keyBytes;
    this.animationKey = animationKey;
  }

  /** Build a generator from the home-page HTML and the ondemand.s.js text. */
  static create(homeHtml: string, ondemandJs: string): ClientTransaction {
    const [rowIndex, keyByteIndices] = ClientTransaction.parseIndices(ondemandJs);
    const root = parse(homeHtml);

    const meta = root.querySelector("meta[name='twitter-site-verification']");
    const key = meta?.getAttribute("content");
    if (!key) {
      throw new Error(
        "no twitter-site-verification meta (fetch the home HTML as a browser, without the API bearer)",
      );
    }
    const keyBytes = [...Buffer.from(key, "base64")];

    const frames = root.querySelectorAll("[id^='loading-x-anim']");
    const animationKey = ClientTransaction.animationKeyFrom(
      keyBytes,
      frames,
      rowIndex,
      keyByteIndices,
    );
    return new ClientTransaction(rowIndex, keyByteIndices, keyBytes, animationKey);
  }

  /** Generate a fresh id for a given HTTP method + API path (e.g. /i/api/graphql/.../CreateTweet). */
  generateTransactionId(method: string, path: string, timeNow?: number): string {
    const t = timeNow ?? Math.floor((Date.now() - EPOCH_OFFSET_MS) / 1000);
    const timeBytes = [0, 1, 2, 3].map((i) => (t >> (i * 8)) & 0xff);
    const hash = createHash("sha256")
      .update(`${method}!${path}!${t}${KEYWORD}${this.animationKey}`)
      .digest();
    const hashBytes = [...hash];
    const rnd = Math.floor(Math.random() * 256);
    const arr = [
      ...this.keyBytes,
      ...timeBytes,
      ...hashBytes.slice(0, 16),
      ADDITIONAL_RANDOM_NUMBER,
    ];
    const out = Buffer.from([rnd, ...arr.map((b) => b ^ rnd)]);
    return out.toString("base64").replace(/=+$/, "");
  }

  // ---- internals ----

  private static parseIndices(ondemandJs: string): [number, number[]] {
    const idx: number[] = [];
    for (const m of ondemandJs.matchAll(INDICES_REGEX)) idx.push(Number(m[1]));
    if (idx.length < 2) {
      throw new Error("Couldn't get KEY_BYTE indices (ondemand.s.js shape changed)");
    }
    return [idx[0], idx.slice(1)];
  }

  private static animationKeyFrom(
    keyBytes: number[],
    frames: HTMLElement[],
    rowIndex: number,
    keyByteIndices: number[],
  ): string {
    const TOTAL = 4096;
    const row = keyBytes[rowIndex] % 16;
    const frameTime =
      mathRound(keyByteIndices.reduce((acc, i) => acc * (keyBytes[i] % 16), 1) / 10) * 10;

    // frame element -> <g>(children[0]) -> second <path>(children[1]) -> d attr
    const frame = frames[keyBytes[5] % 4];
    const g = frame.querySelector("g") ?? frame.childNodes.filter(isElement)[0];
    const paths = (g as HTMLElement).querySelectorAll("path");
    const d = paths[1]?.getAttribute("d");
    if (!d) throw new Error("animation path not found (SVG shape changed)");

    // d = "M 10,30 C 50,248 225,248 ..." -> drop "M 10,30 C" (9 chars), split on C
    const arr2d = d
      .slice(9)
      .split("C")
      .map((seg) =>
        seg
          .replace(/[^\d]+/g, " ")
          .trim()
          .split(/\s+/)
          .map(Number),
      );
    const frameRow = arr2d[row];
    return ClientTransaction.animate(frameRow, frameTime / TOTAL);
  }

  private static solve(v: number, min: number, max: number, rounding: boolean): number {
    const r = (v * (max - min)) / 255 + min;
    return rounding ? Math.floor(r) : Math.round(r * 100) / 100;
  }

  private static animate(frames: number[], targetTime: number): string {
    const fromColor = [...frames.slice(0, 3), 1].map(Number);
    const toColor = [...frames.slice(3, 6), 1].map(Number);
    const fromRotation = [0.0];
    const toRotation = [ClientTransaction.solve(frames[6], 60.0, 360.0, true)];
    const curves = frames
      .slice(7)
      .map((it, c) => ClientTransaction.solve(it, isOdd(c), 1.0, false));

    const val = new Cubic(curves).getValue(targetTime);
    const color = interpolate(fromColor, toColor, val).map((v) => Math.max(0, Math.min(255, v)));
    const rotation = interpolate(fromRotation, toRotation, val);
    const matrix = rotationMatrix(rotation[0]);

    const strArr: string[] = color.slice(0, -1).map((v) => Math.round(v).toString(16));
    for (const v of matrix) {
      let r = Math.round(v * 100) / 100;
      if (r < 0) r = -r;
      const hv = floatToHex(r);
      strArr.push(hv.startsWith(".") ? `0${hv}`.toLowerCase() : hv || "0");
    }
    strArr.push("0", "0");
    return strArr.join("").replace(/[.-]/g, "");
  }
}

function isElement(n: unknown): n is HTMLElement {
  return !!n && typeof (n as HTMLElement).querySelector === "function";
}

// ---- fetch + cache -----------------------------------------------------------

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** Fetch the home HTML *as a browser* (no API bearer, or X returns 401 with no meta). */
async function fetchHomeAndOndemand(cookie?: string): Promise<{ home: string; ondemand: string }> {
  const headers: Record<string, string> = {
    "user-agent": UA,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
  };
  if (cookie) headers.cookie = cookie;

  const home = await (await fetch("https://x.com/", { headers })).text();

  const idxMatch = home.match(/,(\d+):["']ondemand\.s["']/);
  if (!idxMatch) throw new Error("could not locate ondemand.s index in home HTML");
  const hashMatch = home.match(new RegExp(`,${idxMatch[1]}:"([0-9a-f]+)"`));
  if (!hashMatch) throw new Error("could not locate ondemand.s hash in home HTML");
  const url = `https://abs.twimg.com/responsive-web/client-web/ondemand.s.${hashMatch[1]}a.js`;
  const ondemand = await (await fetch(url, { headers: { "user-agent": UA } })).text();

  return { home, ondemand };
}

let cached: ClientTransaction | null = null;
let builtAt = 0;

export interface TransactionOptions {
  /** Reuse the generator for this long before rebuilding. Default 15 min. */
  ttlMs?: number;
  /** Cookie string to send when fetching the home page (helps avoid interstitials). */
  cookie?: string;
}

export async function getTransaction(opts: TransactionOptions = {}): Promise<ClientTransaction> {
  const ttl = opts.ttlMs ?? 15 * 60 * 1000;
  if (cached && Date.now() - builtAt < ttl) return cached;
  const { home, ondemand } = await fetchHomeAndOndemand(opts.cookie);
  cached = ClientTransaction.create(home, ondemand);
  builtAt = Date.now();
  return cached;
}

export function resetTransaction(): void {
  cached = null;
  builtAt = 0;
}

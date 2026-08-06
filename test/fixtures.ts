/**
 * Minimal but complete fixtures for the transaction-id generator.
 *
 * ClientTransaction.create(homeHtml, ondemandJs) requires:
 * - home: meta[name=twitter-site-verification] (base64, decodes to >= 6 bytes),
 *   4x [id^="loading-x-anim"] frames, each with a <g> whose 2nd <path> has a
 *   long "d" attribute (>= 16 "C" segments, >= 8 numbers per segment), plus the
 *   webpack module map: `,123456:"ondemand.s"` and `,123456:"<hex hash>"`.
 * - ondemand: the chunk JS text with >= 2 matches of the INDICES_REGEX
 *   `(\w[(\d{1,2})],\s*16)` — e.g. `(o[2], 16)` and `(o[4], 16)`.
 */

const SEG = "1,2 3,4 5,6 7,8";
const D = "M 10,30 C " + Array(20).fill(SEG).join(" C ");

function frame(id: string): string {
  return `<svg id="${id}"><g><path d="M0,0"/><path d="${D}"/></g></svg>`;
}

export const HOME_HTML = `<html><head>
<meta name="twitter-site-verification" content="dGVzdC1rZXktMTIzNDU2Nzg5MGFiY2RlZg==">
</head><body>
${frame("loading-x-anim-0")}
${frame("loading-x-anim-1")}
${frame("loading-x-anim-2")}
${frame("loading-x-anim-3")}
<script>window.__INITIAL_STATE__={"s":{},"i":[1,2,3,4,5,6,7,8],123456:"ondemand.s",123456:"abcdef1234567890"}</script>
</body></html>`;

export const CHUNK_JS = `
(function(){ var o = [0,1,2,3,4,5];
  function a(x){ return (o[2], 16) + (o[4], 16); }
})();
`;

/** Generic fetch mock: x.com/ -> HOME_HTML, twimg chunk -> CHUNK_JS, anything
 *  containing /i/api/ -> a JSON payload served by `apiHandler`. */
export function installFetchMock(apiHandler: (url: string) => { status: number; body: unknown }): {
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    const i = (init ?? {}) as RequestInit;
    calls.push({ url, init: i });
    if (url.includes("/i/api/")) {
      const h = apiHandler(url);
      return new Response(JSON.stringify(h.body), {
        status: h.status,
        headers: { "content-type": "application/json", "x-rate-limit-remaining": "999" },
      });
    }
    if (url.includes("abs.twimg.com")) {
      return new Response(CHUNK_JS, { status: 200 });
    }
    if (url.startsWith("https://x.com/")) {
      return new Response(HOME_HTML, { status: 200 });
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
  return { calls };
}

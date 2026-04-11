// Cloudflare Worker — Starling API proxy
// Deploy: npx wrangler deploy
// This proxies requests from your GitHub Pages app to the Starling API,
// adding the CORS headers that Starling's API doesn't include itself.

const STARLING_BASE = "https://api.starlingbank.com/api/v2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const starlingUrl = STARLING_BASE + url.pathname + url.search;

    const auth = request.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let upstream;
    try {
      upstream = await fetch(starlingUrl, {
        method: "GET",
        headers: { Authorization: auth, Accept: "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: `Upstream fetch failed: ${e.message}` }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  },
};

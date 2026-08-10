// api/vidfast2-vc.js
// Vercel serverless function — transparent proxy to vidfast.vc with browser headers.
// Upstream: https://vidfast.vc
//
// The Zephyr provider routes ALL raw vidfast.vc calls through this endpoint
// (replacing the old CF Worker /vc-proxy route, which the updated worker no
// longer exposes). The Vite dev server proxies /api/vidfast2-vc with the same
// headers, so this path works identically locally and in production.

const UPSTREAM = "https://vidfast.vc";

export default async function handler(req, res) {
  // Accept both query-param (?path=movie/603) and path-style (/movie/603).
  let rawPath = req.query?.path || "";
  if (!rawPath) {
    // Strip the function route prefix to get the upstream path.
    rawPath = (req.url || "").replace(/^.*?\/api\/vidfast2-vc\/?/, "");
  }
  const path = rawPath.replace(/^\/+|\/+$/g, "");
  if (!path) { res.status(400).send("Missing path"); return; }

  // Rebuild upstream URL — forward ALL query params except "path"
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query || {})) {
    if (k === "path") continue;
    for (const item of Array.isArray(v) ? v : [v]) params.append(k, item);
  }
  const qs = params.toString();
  const targetUrl = `${UPSTREAM}/${path}${qs ? "?" + qs : ""}`;

  // Inject full browser-emulation headers to bypass Cloudflare
  const headers = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-CH-UA": '"Chromium";v="137", "Google Chrome";v="137"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
    Referer: "https://vidfast.vc/",
    "X-Requested-With": "XMLHttpRequest",
  };
  const reqCt = req.headers && req.headers["content-type"];
  if (reqCt) {
    headers["Content-Type"] = Array.isArray(reqCt) ? reqCt[0] : reqCt;
  }
  // vidfast.vc's API requires the X-CSRF-Token returned by /route-config.
  // Forward whatever the client sends (the Zephyr provider attaches it).
  const csrf = req.headers && req.headers["x-csrf-token"];
  if (csrf) {
    headers["X-CSRF-Token"] = Array.isArray(csrf) ? csrf[0] : csrf;
  }

  try {
    let body = undefined;
    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const upstream = await fetch(targetUrl, {
      method: req.method || "GET",
      headers,
      body,
    });

    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.method === "HEAD") { res.send(""); return; }
    res.send(await upstream.text());
  } catch (e) {
    res.status(502).send(e.message || "Upstream unavailable");
  }
}

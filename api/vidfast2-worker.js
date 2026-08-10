// api/vidfast2-worker.js
// Vercel serverless function — transparent proxy to the VidFast2 Cloudflare Worker.
// Upstream: https://vidfast.samxerz-zeticuz.workers.dev (has /vc-proxy endpoint)
//
// Vercel rewrites /api/vidfast2-worker/{endpoint}?{params} to
// /api/vidfast2-worker?wp={endpoint}&{params}. This function extracts
// the worker endpoint from `wp` and forwards all other query params.

const UPSTREAM = "https://vidfast.samxerz-zeticuz.workers.dev";

export default async function handler(req, res) {
  // Get the worker endpoint from the rewrite-added `wp` param, or from the
  // raw URL pathname for direct requests (no rewrite, dev mode).
  let rawPath = "";

  // From rewrite: /api/vidfast2-worker?wp=route-config
  const wp = req.query?.wp;
  if (wp) {
    rawPath = Array.isArray(wp) ? wp[0] : wp;
  }

  // From path-style URL (dev mode, no rewrite):
  // /api/vidfast2-worker/route-config
  if (!rawPath) {
    const fullUrl = req.url || "";
    const qIndex = fullUrl.indexOf("?");
    const pathname = qIndex >= 0 ? fullUrl.slice(0, qIndex) : fullUrl;
    rawPath = pathname
      .replace(/^.*?\/api\/vidfast2-worker\/?/, "")
      .replace(/^\/+|\/+$/g, "");
  }

  // Legacy ?path= style
  if (!rawPath && req.query?.path) {
    rawPath = Array.isArray(req.query.path) ? req.query.path[0] : req.query.path;
  }

  if (!rawPath) { res.status(400).send("Missing path"); return; }

  // Forward ALL query params EXCEPT the rewrite-added `wp` to the worker
  const upstreamUrl = new URL(`${UPSTREAM}/${rawPath}`);
  for (const [k, v] of Object.entries(req.query || {})) {
    if (k === "wp") continue; // skip rewrite param
    for (const item of Array.isArray(v) ? v : [v]) {
      upstreamUrl.searchParams.append(k, item);
    }
  }

  // Forward headers (strip host to avoid routing issues)
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (k === "host") continue;
    headers[k] = Array.isArray(v) ? v[0] : v;
  }
  if (!headers["accept"]) headers["Accept"] = "application/json";

  try {
    let body = undefined;
    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const upstream = await fetch(upstreamUrl.toString(), {
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

// api/vidfast2-worker.js
// Vercel serverless function — transparent proxy to the VidFast2 Cloudflare Worker.
// Upstream: https://vidfast.samxerz-zeticuz.workers.dev (has /vc-proxy endpoint)

const UPSTREAM = "https://vidfast.samxerz-zeticuz.workers.dev";

export default async function handler(req, res) {
  // Extract the worker endpoint from the URL pathname.
  // /api/vidfast2-worker/route-config  →  route-config
  // /api/vidfast2-worker/vc-proxy      →  vc-proxy
  const fullUrl = req.url || "";
  const qIndex = fullUrl.indexOf("?");
  const pathname = qIndex >= 0 ? fullUrl.slice(0, qIndex) : fullUrl;
  const rawQuery = qIndex >= 0 ? fullUrl.slice(qIndex + 1) : "";

  let rawPath = pathname
    .replace(/^.*?\/api\/vidfast2-worker\/?/, "")
    .replace(/^\/+|\/+$/g, "");

  // Fallback: legacy ?path= style from old Vercel rewrite (no longer used)
  if (!rawPath && req.query?.path) {
    rawPath = Array.isArray(req.query.path) ? req.query.path[0] : req.query.path;
  }

  if (!rawPath) { res.status(400).send("Missing path"); return; }

  // Parse query params manually from the URL. Vercel's req.query may not
  // be populated for path-style URLs, and we need to forward params as-is.
  const upstreamUrl = new URL(`${UPSTREAM}/${rawPath}`);
  if (rawQuery) {
    // Parse incoming query string and forward all params to the worker
    const qp = new URLSearchParams(rawQuery);
    for (const [k, v] of qp) {
      upstreamUrl.searchParams.append(k, v);
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

// api/vidfast2-worker.js
// Vercel serverless function — transparent proxy to the VidFast2 Cloudflare Worker.
// Upstream: https://vidfast.samxerz-zeticuz.workers.dev (has /vc-proxy endpoint)

const UPSTREAM = "https://vidfast.samxerz-zeticuz.workers.dev";

export default async function handler(req, res) {
  // Extract the worker endpoint from the URL pathname (ignore query params).
  // /api/vidfast2-worker/route-config  →  route-config
  // /api/vidfast2-worker/vc-proxy      →  vc-proxy
  // /api/vidfast2-worker?path=generate →  generate (legacy query-param style)
  let rawPath = (req.url || "")
    .replace(/^.*?\/api\/vidfast2-worker\/?/, "")
    .split("?")[0]  // strip query string, we rebuild from req.query
    .replace(/^\/+|\/+$/g, "");

  // Fallback: legacy ?path= style
  if (!rawPath && req.query?.path) {
    rawPath = Array.isArray(req.query.path) ? req.query.path[0] : req.query.path;
  }

  if (!rawPath) { res.status(400).send("Missing path"); return; }

  // Rebuild upstream URL — forward ALL query params from the incoming request
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query || {})) {
    // For legacy ?path= style, don't duplicate the path param
    if (k === "path" && !rawPath.includes("?")) continue;
    for (const item of Array.isArray(v) ? v : [v]) params.append(k, item);
  }
  const qs = params.toString();
  const targetUrl = `${UPSTREAM}/${rawPath}${qs ? "?" + qs : ""}`;

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

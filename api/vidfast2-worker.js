// api/vidfast2-worker.js
// Vercel serverless function — transparent proxy to the VidFast2 Cloudflare Worker.
// Upstream: https://vidfast.samxerz-zeticuz.workers.dev

const UPSTREAM = "https://vidfast.samxerz-zeticuz.workers.dev";

export default async function handler(req, res) {
  // Accept both query-param (?path=route-config) and path-style (/route-config).
  let rawPath = req.query?.path || "";
  if (!rawPath) {
    rawPath = (req.url || "").replace(/^.*?\/api\/vidfast2-worker\/?/, "");
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

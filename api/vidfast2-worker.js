// api/vidfast2-worker.js
// Vercel serverless function — proxies VidFast2 Cloudflare Worker requests.
// Routes: /api/vidfast2-worker/route-config, /generate, /decrypt
// Upstream: https://vidfast.samxerz-zeticuz.workers.dev

const UPSTREAM = "https://vidfast.samxerz-zeticuz.workers.dev";

function getPath(query) {
  const value = query ? query.path : undefined;
  if (!value) return "";
  const parts = Array.isArray(value) ? value : [value];
  return parts
    .map((part) => String(part).replace(/^\/+|\\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

export default async function handler(req, res) {
  const method = (req.method ?? "GET").toUpperCase();
  const query = req.query || {};
  const path = getPath(query);

  if (!path) {
    res.status(404).send("Not found");
    return;
  }

  const targetUrl = `${UPSTREAM}/${path}`;

  const headers = { Accept: "application/json" };
  const ct = Array.isArray(req.headers["content-type"]) 
    ? req.headers["content-type"][0] 
    : req.headers["content-type"];
  if (ct) headers["Content-Type"] = ct;

  try {
    let body = undefined;
    if (method !== "GET" && method !== "HEAD") {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const upstream = await fetch(targetUrl, { method, headers, body });
    res.status(upstream.status);
    
    const resCt = upstream.headers.get("content-type");
    if (resCt) res.setHeader("Content-Type", resCt);
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (method === "HEAD") { res.send(""); return; }

    const text = await upstream.text();
    res.send(text);
  } catch (e) {
    res.status(502).send(e.message || "VidFast2 Worker upstream unavailable");
  }
}

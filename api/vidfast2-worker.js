// api/vidfast2-worker.js
// Vercel serverless function — proxies VidFast2 Cloudflare Worker requests.
// Routes: /api/vidfast2-worker/route-config, /generate, /decrypt
// Upstream: https://vidfast.samxerz-zeticuz.workers.dev

const UPSTREAM = "https://vidfast.samxerz-zeticuz.workers.dev";

function getPath(query) {
  const value = query.path;
  const parts = Array.isArray(value) ? value : value ? [value] : [];
  return parts
    .map((part) => part.replace(/^\/+|\\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

export default async function handler(req, res) {
  const method = (req.method ?? "GET").toUpperCase();
  const path = getPath(req.query);

  if (!path) {
    res.status(404).send("Not found");
    return;
  }

  // Build upstream URL
  const targetUrl = `${UPSTREAM}/${path}`;

  // Forward headers and body
  const headers = { Accept: "application/json" };
  if (req.headers["content-type"]) {
    headers["Content-Type"] = Array.isArray(req.headers["content-type"])
      ? req.headers["content-type"][0]
      : req.headers["content-type"];
  }

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? JSON.stringify(req.body) : undefined,
    });

    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);

    if (method === "HEAD") {
      res.send("");
      return;
    }

    const text = await upstream.text();
    res.send(text);
  } catch {
    res.status(502).send("VidFast2 Worker upstream unavailable");
  }
}

// api/vidfast2-vc.js
// Vercel serverless function — proxies VidFast site requests with browser headers.
// Routes: /api/vidfast2-vc/movie/{id}, /tv/{id}/{s}/{e}, /{sp}/{sp}/{payload}, etc.
// Upstream: https://vidfast.vc
// Injects Referer, User-Agent, and X-Requested-With headers that vidfast.vc requires.

const UPSTREAM = "https://vidfast.vc";

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

  const targetUrl = `${UPSTREAM}/${path}`;

  const headers = {
    Accept: "*/*",
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
    Referer: "https://vidfast.vc/",
    "X-Requested-With": "XMLHttpRequest",
  };

  if (req.headers["content-type"]) {
    headers["Content-Type"] = Array.isArray(req.headers["content-type"])
      ? req.headers["content-type"][0]
      : req.headers["content-type"];
  }

  try {
    const fetchOpts = { method, headers };
    if (method !== "GET" && method !== "HEAD" && req.body) {
      fetchOpts.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const upstream = await fetch(targetUrl, fetchOpts);

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
    res.status(502).send("VidFast2 VC upstream unavailable");
  }
}

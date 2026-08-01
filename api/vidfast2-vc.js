// api/vidfast2-vc.js
// Vercel serverless function — proxies VidFast site requests with browser headers.
// Upstream: https://vidfast.vc

const UPSTREAM = "https://vidfast.vc";

function getPath(query) {
  const value = query ? query.path : undefined;
  if (!value) return "";
  const parts = Array.isArray(value) ? value : [value];
  return parts.map(p => String(p).replace(/^\/+|\\/+$/g, "")).filter(Boolean).join("/");
}

export default async function handler(req, res) {
  const method = (req.method ?? "GET").toUpperCase();
  const path = getPath(req.query || {});

  if (!path) { res.status(404).send("Not found"); return; }

  const targetUrl = `${UPSTREAM}/${path}`;
  const headers = {
    Accept: "*/*",
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
    Referer: "https://vidfast.vc/",
    "X-Requested-With": "XMLHttpRequest",
  };

  const ct = Array.isArray(req.headers["content-type"]) 
    ? req.headers["content-type"][0] : req.headers["content-type"];
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
    res.send(await upstream.text());
  } catch (e) {
    res.status(502).send(e.message || "VidFast2 VC upstream unavailable");
  }
}

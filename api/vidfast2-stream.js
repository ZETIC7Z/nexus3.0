// api/vidfast2-stream.js
// Vercel serverless function — transparent proxy for VidFast2 M3U8/TS playback.
// Forwards to the configured M3U8 proxy with VidFast referer/origin headers.

const M3U8_PROXY = process.env.VITE_M3U8_PROXY_URL || "https://pstream.dovetechnology.org";

export default async function handler(req, res) {
  const path = (req.query?.path || "").replace(/^\/+|\/+$/g, "");
  if (!path) { res.status(400).send("Missing path"); return; }

  // Rebuild upstream URL — forward ALL query params except "path"
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query || {})) {
    if (k === "path") continue;
    for (const item of Array.isArray(v) ? v : [v]) params.append(k, item);
  }
  const qs = params.toString();
  const targetUrl = `${M3U8_PROXY}/${path}${qs ? "?" + qs : ""}`;

  const headers = {
    Accept: "*/*",
    Referer: "https://vidfast.vc/",
    Origin: "https://vidfast.vc",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };

  try {
    const method = (req.method || "GET").toUpperCase();
    const upstream = await fetch(targetUrl, { method, headers });
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (method === "HEAD") { res.send(""); return; }
    res.send(await upstream.text());
  } catch (e) {
    res.status(502).send(e.message || "Upstream unavailable");
  }
}

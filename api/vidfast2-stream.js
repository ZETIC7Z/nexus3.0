// api/vidfast2-stream.js
// Vercel serverless function — transparent proxy for VidFast2 HLS/TS playback.
// Proxies stream segments directly with the required Referer/Origin headers.
// Does NOT go through a separate M3U8 proxy — Vercel function timeout (10s)
// is fine for HLS playlists and individual .ts segments.

export default async function handler(req, res) {
  const path = (req.query?.path || "").replace(/^\/+|\/+$/g, "");
  if (!path) { res.status(400).send("Missing path"); return; }

  // The actual stream URL is in the "url" query param
  const streamUrl = req.query?.url;
  if (!streamUrl) { res.status(400).send("Missing 'url' query parameter"); return; }

  const headers = {
    Accept: "*/*",
    Referer: "https://vidfast.vc/",
    Origin: "https://vidfast.vc",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  };

  try {
    const method = (req.method || "GET").toUpperCase();
    const upstream = await fetch(streamUrl, { method, headers });
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

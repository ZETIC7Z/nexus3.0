// api/vidfast2-stream.js
// Vercel serverless function — proxies VidFast2 playback stream content.
// Routes: /api/vidfast2-stream/m3u8-proxy?url=..., /ts-proxy?url=...
// Forwards to the configured M3U8 proxy with VidFast referer/origin headers.

const M3U8_PROXY = process.env.VITE_M3U8_PROXY_URL || "https://pstream.dovetechnology.org";

function getPath(query) {
  const value = query.path;
  const parts = Array.isArray(value) ? value : value ? [value] : [];
  return parts.map((p) => p.replace(/^\/+|\\/+$/g, "")).filter(Boolean).join("/");
}

export default async function handler(req, res) {
  const method = (req.method ?? "GET").toUpperCase();
  const path = getPath(req.query);

  if (!path) {
    res.status(404).send("Not found");
    return;
  }

  // Rebuild query string from all query params except "path"
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === "path") continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      params.append(key, item);
    }
  }

  const targetUrl = `${M3U8_PROXY}/${path}?${params.toString()}`;

  const headers = {
    Accept: "*/*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Referer: "https://vidfast.vc/",
    Origin: "https://vidfast.vc",
  };

  try {
    const upstream = await fetch(targetUrl, { method, headers });

    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (method === "HEAD") {
      res.send("");
      return;
    }

    const text = await upstream.text();
    res.send(text);
  } catch {
    res.status(502).send("VidFast2 stream upstream unavailable");
  }
}

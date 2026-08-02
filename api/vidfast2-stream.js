// api/vidfast2-stream.js
// Vercel serverless function — transparent proxy for VidFast2 HLS/TS playback.
// - Rewrites RELATIVE URLs inside HLS playlists so hls.js resolves them
//   against the upstream CDN (moon.ironwallnet.net), not the proxy URL.
//   Without this, variant/segment lines like "sd/14/index-s1080p-v1-a1.m3u8"
//   are resolved against /api/vidfast2-stream/... and fail with 400.
// - Passes binary segments (.ts / .m4s / subtitles) through untouched.
// - Keeps the required Referer/Origin/User-Agent headers on every hop.

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

const ALLOWED_PATHS = new Set(["m3u8-proxy", "ts-proxy"]);

// Only relay CDN traffic from the known VidFast2 media hosts. This prevents
// the endpoint being used as an open proxy/SSRF vector while keeping playback
// working. Configurable via VIDFAST2_MEDIA_HOSTS (comma-separated).
function allowedMediaHosts() {
  return new Set(
    (process.env.VIDFAST2_MEDIA_HOSTS ??
      "moon.ironwallnet.net,ironwallnet.net")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isAllowedMediaUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;
    const hosts = allowedMediaHosts();
    const host = parsed.hostname.toLowerCase();
    return (
      hosts.has(host) ||
      hosts.has(host.replace(/^[^.]+\./, "")) // allow subdomains of listed roots
    );
  } catch {
    return false;
  }
}

function makeProxyUrl(url, kind, queryHeaders) {
  const params = new URLSearchParams({ url });
  if (queryHeaders) params.set("headers", queryHeaders);
  return `/api/vidfast2-stream/${kind}?${params.toString()}`;
}

function rewriteUriAttribute(line, baseUrl, queryHeaders) {
  return line.replace(/URI="([^"]*)"/g, (match, uri) => {
    try {
      const resolved = new URL(uri, baseUrl).toString();
      return `URI="${makeProxyUrl(resolved, "m3u8-proxy", queryHeaders)}"`;
    } catch {
      return match;
    }
  });
}

// Rewrite every bare URL line + URI="..." attribute in an HLS playlist so it
// points back through this proxy (same-origin, headers preserved).
function rewritePlaylist(text, baseUrl, queryHeaders) {
  const lines = text.split("\n");
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }
    if (trimmed.startsWith("#")) {
      if (trimmed.includes('URI="')) {
        out.push(rewriteUriAttribute(line, baseUrl, queryHeaders));
      } else {
        out.push(line);
      }
      continue;
    }
    let resolved;
    try {
      resolved = new URL(trimmed, baseUrl).toString();
    } catch {
      out.push(line);
      continue;
    }
    out.push(makeProxyUrl(resolved, "m3u8-proxy", queryHeaders));
  }
  return out.join("\n");
}

export default async function handler(req, res) {
  const path = (req.query?.path || "").replace(/^\/+|\/+$/g, "");
  if (!ALLOWED_PATHS.has(path)) {
    res.status(404).send("Not found");
    return;
  }

  const streamUrl = req.query?.url;
  if (!streamUrl || !isAllowedMediaUrl(streamUrl)) {
    res.status(403).send("Media host is not allowed");
    return;
  }

  const queryHeaders = req.query?.headers || null;

  const headers = {
    Accept: "*/*",
    Referer: "https://vidfast.vc/",
    Origin: "https://vidfast.vc",
    "User-Agent": BROWSER_UA,
  };
  if (queryHeaders) {
    try {
      Object.assign(headers, JSON.parse(queryHeaders));
    } catch {
      /* ignore malformed headers param */
    }
  }

  try {
    const method = (req.method || "GET").toUpperCase();
    const upstream = await fetch(streamUrl, { method, headers });
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type") || "";
    if (ct) res.setHeader("Content-Type", ct);
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (method === "HEAD") {
      res.send("");
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const body = buf.toString("utf8");

    // HLS playlists get relative URLs rewritten; everything else (segments,
    // subtitles, MP4) passes through byte-for-byte.
    const isPlaylist =
      ct.includes("mpegurl") || /^#EXTM3U/.test(body.trim());
    if (isPlaylist) {
      res.send(rewritePlaylist(body, streamUrl, queryHeaders));
    } else {
      res.send(buf);
    }
  } catch (e) {
    res.status(502).send(e.message || "Upstream unavailable");
  }
}

// api/stream-proxy.js
// Vercel serverless function — neutral same-origin media proxy used by ALL
// NEXUS providers (TMDB-Embed backends return raw CDN URLs that require
// per-stream Referer/User-Agent headers and often have no CORS headers).
// - Rewrites RELATIVE URLs inside HLS playlists so hls.js resolves them
//   against the proxy, keeping every hop same-origin and header-correct.
// - Passes binary segments (.ts / .m4s / mp4 ranges) through byte-for-byte
//   with correct Content-Length (required by Safari/iOS media stack).
// - Injects per-stream headers (Referer / User-Agent / Origin) from the
//   provider API on every hop.

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

const ALLOWED_PATHS = new Set(["m3u8-proxy", "ts-proxy", "sub-proxy", "dl"]);

// SSRF guard: VidFast2's CDN rotates hosts per stream (moon.ironwallnet.net,
// housestrong.site, ...), so a fixed allowlist would break playback. Instead
// reject anything that could target internal infrastructure: non-https,
// userinfo credentials, localhost, private/loopback/link-local/metadata IPs.
function isSuspiciousHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  // Decimal / hex IP literals (e.g. 2130706433 → 127.0.0.1).
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return true;
  let ip = h.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  // IPv4-mapped IPv6 (::ffff:127.0.0.1) → unwrap and check as IPv4.
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);

  const octets = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (octets) {
    const a = Number(octets[1]);
    const b = Number(octets[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6 literals only (hostnames never contain ":").
  if (ip.includes(":")) {
    if (
      ip === "::" ||
      ip.startsWith("::1") ||
      ip.startsWith("fe80:") ||
      ip.startsWith("fc") ||
      ip.startsWith("fd") ||
      ip.startsWith("ff") ||
      ip.startsWith("2001:db8:")
    ) {
      return true;
    }
  }
  return false;
}

function isAllowedMediaUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    return !isSuspiciousHost(parsed.hostname);
  } catch {
    return false;
  }
}

function makeProxyUrl(url, kind, queryHeaders) {
  const params = new URLSearchParams({ sp: kind, url });
  if (queryHeaders) params.set("headers", queryHeaders);
  return `/api/stream-proxy?${params.toString()}`;
}

function rewriteUriAttribute(line, baseUrl, queryHeaders) {
  return line.replace(/URI="([^"]*)"/g, (match, uri) => {
    // data: URIs (EXT-X-MAP init segments) must not be proxied.
    if (uri.startsWith("data:")) return match;
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
  // Accept: path-style (/m3u8-proxy?url=...), Vercel rewrite (?sp=), app style (?kind=), legacy (?path=).
  let rawPath = "";
  if (req.query?.kind) rawPath = Array.isArray(req.query.kind) ? req.query.kind[0] : req.query.kind;
  // Vercel rewrite uses ?sp= to avoid query param conflicts
  if (!rawPath && req.query?.sp) rawPath = Array.isArray(req.query.sp) ? req.query.sp[0] : req.query.sp;
  // Legacy ?path= style
  if (!rawPath && req.query?.path) rawPath = Array.isArray(req.query.path) ? req.query.path[0] : req.query.path;
  // Path-style: /api/stream-proxy/m3u8-proxy?url=...
  if (!rawPath) {
    rawPath = (req.url || "").replace(/^.*?\/api\/stream-proxy\/?/, "").replace(/\?.*$/, "");
  }
  const path = rawPath.replace(/^\/+|\/+$/g, "");
  if (!ALLOWED_PATHS.has(path)) {
    res.status(404).send("Not found");
    return;
  }

  // Vercel rewrites may drop original query params, so fall back to parsing req.url.
  const rawQuery = ((req.url || "").split("?")[1] || "");
  const rawParams = new URLSearchParams(rawQuery);
  const streamUrl = req.query?.url || rawParams.get("url") || "";
  if (!streamUrl || !isAllowedMediaUrl(streamUrl)) {
    res.status(403).send("Media host is not allowed");
    return;
  }

  const queryHeaders = req.query?.headers || rawParams.get("headers") || null;

  // Default: neutral headers. Override with queryHeaders if provided.
  const headers = {
    Accept: "*/*",
    "User-Agent": BROWSER_UA,
  };
  // Forward the player's Range header so MP4/byte-range seeking works.
  const clientRange = req.headers?.range;
  if (clientRange) headers.Range = clientRange;
  if (queryHeaders) {
    try {
      Object.assign(headers, JSON.parse(queryHeaders));
    } catch {
      /* ignore malformed headers param */
    }
  }
  // Fallback Referer: use the CDN URL's own origin (works for most providers).
  if (!headers.Referer && !headers.Referrer) {
    try {
      headers.Referer = new URL(streamUrl).origin + "/";
    } catch {
      headers.Referer = "";
    }
  }

  try {
    const method = (req.method || "GET").toUpperCase();

    // Follow redirects manually so every hop is re-validated against the
    // SSRF guard (CDNs redirect signed URLs to storage).
    let upstream = null;
    let currentUrl = streamUrl;
    for (let hop = 0; hop < 5; hop += 1) {
      upstream = await fetch(currentUrl, { method, headers, redirect: "manual" });
      if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
      const location = upstream.headers.get("location");
      const next = location ? new URL(location, currentUrl).toString() : null;
      await upstream.arrayBuffer().catch(() => {}); // drain
      if (!next || !isAllowedMediaUrl(next)) {
        res.status(403).send("Forbidden");
        return;
      }
      currentUrl = next;
    }

    res.status(upstream.status);
    const ct = upstream.headers.get("content-type") || "";
    if (ct) res.setHeader("Content-Type", ct);
    res.setHeader("Access-Control-Allow-Origin", "*");
    // Byte-range pass-through (206 responses must keep these for seeking).
    const cr = upstream.headers.get("content-range");
    if (cr) res.setHeader("Content-Range", cr);
    const ar = upstream.headers.get("accept-ranges");
    if (ar) res.setHeader("Accept-Ranges", ar);
    if (method === "HEAD") {
      const cl = upstream.headers.get("content-length");
      if (cl) res.setHeader("Content-Length", cl);
      res.send("");
      return;
    }

    // Downloads: force attachment so browsers save the file.
    if (path === "dl") {
      const dlBuf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Length", String(dlBuf.length));
      res.setHeader("Content-Disposition", 'attachment; filename="nexus-download"');
      res.send(dlBuf);
      return;
    }

    // Subtitles pass through raw (no playlist rewriting).
    if (path === "sub-proxy") {
      const subBuf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Length", String(subBuf.length));
      res.send(subBuf);
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());

    // HLS playlists get relative URLs rewritten; everything else (segments,
    // MP4 ranges) passes through byte-for-byte with explicit Content-Length.
    const isPlaylist =
      ct.includes("mpegurl") || /^#EXTM3U/.test(buf.toString("utf8", 0, 64).trim());
    if (isPlaylist) {
      res.send(rewritePlaylist(buf.toString("utf8"), currentUrl, queryHeaders));
    } else {
      res.setHeader("Content-Length", String(buf.length));
      res.send(buf);
    }
  } catch (e) {
    res.status(502).send(e.message || "Upstream unavailable");
  }
}

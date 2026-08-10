// api/notorrent.js
// Vercel serverless function — NoTorrent source (direct addon integration).
// ---------------------------------------------------------------------------
// The TMDB-Embed API's notorrent backend (addon-osvh.onrender.com) is
// suspended, so it always returns 0 streams. Instead we query the public
// NoTorrent Stremio addon directly:
//
//   GET https://addon.notorrent2.workers.dev/stream/movie/{imdbId}.json
//   GET https://addon.notorrent2.workers.dev/stream/series/{imdbId}/{s}/{e}.json
//
// The addon returns streams whose `url` is a /redirect?p=... endpoint that
// 302s to the real CDN m3u8 (signed, expiring token). Browsers can't follow
// that redirect (the 302 carries no CORS headers), so we resolve it here
// server-side and hand back the final playable URLs. The final CDN serves
// CORS `*`, so the player consumes them directly.
//
// Endpoint: /api/notorrent?type=movie|series&id=tt...&season=1&episode=1
// Response: { success, provider: "notorrent", count, streams: [...] }
//
// The same handler is reused by the Vite dev server middleware
// (plugins/notorrent-api.ts) so local dev behaves identically.

const ADDON = "https://addon.notorrent2.workers.dev";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

const MAX_STREAMS = 6; // enough English server choices without slow/locked duplicates
const REDIRECT_TIMEOUT = 6000;
const REDIRECT_HOPS = 4;

// SSRF guard — same rules as api/vidfast2-stream.js. The addon redirects to
// a rotating CDN host, so a fixed allowlist would break playback; reject only
// anything that could target internal infrastructure.
function isSuspiciousHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return true;
  let ip = h.replace(/^\[|\]$/g, "");
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);

  const octets = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (octets) {
    const a = Number(octets[1]);
    const b = Number(octets[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
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

function isAllowedUrl(value) {
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

// Follow a redirect chain manually so every hop is re-validated.
async function resolveRedirect(url) {
  let current = url;
  for (let hop = 0; hop < REDIRECT_HOPS; hop += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REDIRECT_TIMEOUT);
    let res;
    try {
      res = await fetch(current, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "User-Agent": BROWSER_UA, Accept: "*/*" },
      });
    } catch {
      clearTimeout(timer);
      return null;
    }
    clearTimeout(timer);
    if (![301, 302, 303, 307, 308].includes(res.status)) {
      if (res.status < 200 || res.status >= 400) return null;
      return current;
    }
    const location = res.headers.get("location");
    const next = location ? new URL(location, current).toString() : null;
    await res.arrayBuffer().catch(() => {});
    if (!next || !isAllowedUrl(next)) return null;
    current = next;
  }
  return null;
}

function isEnglishStream(stream) {
  const text = `${stream?.name ?? ""} ${stream?.title ?? ""}`.toLowerCase();
  // NoTorrent mixes original English with Latino/Castellano/Turkish and
  // paid MultiLang entries. Keep only an explicitly original/English track.
  if (/(latino|castellano|spanish|español|portuguese|português|türkçe|turkish|hindi|french|german|italian|arabic|russian|korean|japanese|multi\s*lang|multistream|dubbed)/i.test(text)) {
    return false;
  }
  return /original\s*audio|english\s*(audio|dub)|audio\s*english/i.test(text);
}

function isPlayableFinalUrl(value) {
  if (!isAllowedUrl(value)) return false;
  const lower = value.toLowerCase();
  // The addon can redirect trial/locked entries to a generic premium video.
  if (lower.includes("premium.mp4") || lower.includes("paypal") || lower.includes("hostingersite.com")) return false;
  return true;
}

function qualityFromName(name) {
  const text = `${name ?? ""}`.toLowerCase();
  if (/(4k|2160|uhd)/.test(text)) return "4k";
  if (/1080/.test(text)) return "1080";
  if (/720/.test(text)) return "720";
  if (/480/.test(text)) return "480";
  if (/360/.test(text)) return "360";
  return "unknown";
}

// Clean an addon stream name like "🌐 1080p - MPV Player" → "1080p · MPV".
function cleanName(name) {
  const raw = `${name ?? ""}`
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const base = raw
    .replace(/^[-·|:–\s]+/, "")
    .replace(/\s*[-·|:]\s*/g, " · ")
    .replace(/\s*\([^)]*\)\s*/g, "")
    .replace(/\[FREE\]/gi, "")
    .replace(/[·\s]+$/g, "")
    .trim();
  if (!base) return raw || "NoTorrent";
  return base;
}

function parseQuery(url) {
  const q = (url || "").split("?")[1] || "";
  const params = new URLSearchParams(q);
  const out = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

export async function handleNotorrentRequest(req, res) {
  const query = parseQuery(req.url);
  const type = query.type === "series" ? "series" : "movie";
  const id = (query.id || "").trim();
  const season = (query.season || "").trim();
  const episode = (query.episode || "").trim();

  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify(body));
  };

  if (!id) {
    send(400, { success: false, error: "Missing id" });
    return;
  }

  let addonUrl;
  if (type === "series" && season && episode) {
    // NoTorrent's Stremio route uses the compact IMDb:season:episode form.
    addonUrl = `${ADDON}/stream/series/${id}:${season}:${episode}.json`;
  } else if (type === "movie") {
    addonUrl = `${ADDON}/stream/movie/${id}.json`;
  } else {
    send(400, { success: false, error: "Missing season/episode for series" });
    return;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let jsonRes;
    try {
      jsonRes = await fetch(addonUrl, {
        signal: ctrl.signal,
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!jsonRes.ok) {
      send(502, { success: false, error: `Addon HTTP ${jsonRes.status}` });
      return;
    }
    const data = await jsonRes.json();
    const raw = Array.isArray(data?.streams) ? data.streams : [];

    // Keep only real, explicitly English streams. Resolve several in parallel
    // so the UI can expose Server1 Eng / Server2 Eng / Server3 Eng and the
    // player can fail over quickly when one signed CDN URL is dead.
    const candidates = raw
      .filter((s) => s && s.url && !s.externalUrl && isEnglishStream(s))
      .slice(0, MAX_STREAMS);

    const resolved = await Promise.all(
      candidates.map(async (s) => ({
        raw: s,
        finalUrl: await resolveRedirect(s.url),
      })),
    );

    const streams = [];
    const seenUrls = new Set();
    for (const r of resolved) {
      if (!r.finalUrl || !isPlayableFinalUrl(r.finalUrl) || seenUrls.has(r.finalUrl)) continue;
      seenUrls.add(r.finalUrl);
      const index = streams.length + 1;
      const name = `Server${index} Eng`;
      streams.push({
        name,
        server: name,
        title: r.raw.title || "Original Audio",
        url: r.finalUrl,
        quality: qualityFromName(`${r.raw.name} ${r.raw.title}`),
        type: /\.m3u8(?:\?|$)/i.test(r.finalUrl) || /\/hls\//i.test(r.finalUrl) ? "hls" : "mp4",
      });
    }

    send(200, {
      success: streams.length > 0,
      provider: "notorrent",
      imdbId: id,
      count: streams.length,
      streams,
    });
  } catch (e) {
    send(502, { success: false, error: e.message || "Upstream unavailable" });
  }
}

export default async function handler(req, res) {
  await handleNotorrentRequest(req, res);
}

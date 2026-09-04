// api/downloads.js
// Vercel serverless function — aggregates ALL providers (including MKV
// download-only ones) for the current movie/episode. Used by the Downloads
// menu: "Download Movie" lists every quality/format with a download button;
// "Download Subtitle" groups all provider subtitle tracks by language.
//
// GET /api/downloads?type=movie&id=550
// GET /api/downloads?type=series&id=94605&season=1&episode=1
// → { success, type, id, title?, downloads: [...], subtitles: [...] }

const API_BASE = (
  process.env.VITE_TMDB_EMBED_URL ||
  "https://stycanine1-tmdb-embed-api.hf.space"
).replace(/\/$/, "");

// Providers whose streams can be offered as direct downloads.
// vidlink/vixsrc omitted: endpoints currently return 403 upstream.
const ALL_PROVIDERS = [
  "videasy", "vaplayer", "netmirror", "castletv",
  "onetouchtv", "showbox", "zxcstreams", "streamflix", "4khdhub",
  "dahmermovies", "anikoto", "anikai",
];

// Slow / dead backends — capped so downloads don't hang on them.
const PROVIDER_TIMEOUT_MS = {
  "4khdhub": 20000,
  "zxcstreams": 12000,
  hdghartv: 8000,
};

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

function extensionOf(url) {
  try {
    const clean = decodeURIComponent(new URL(url).pathname).toLowerCase();
    const m = clean.match(/\.([a-z0-9]{2,4})$/);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

// MKV files can sit in the pathname (.../file.mkv) or inside a query
// param (.../bulk?u=https://host/movie/file.mkv). Check both.
function isMkvUrl(url) {
  let decoded = url || "";
  try { decoded = decodeURIComponent(decoded); } catch { /* keep raw */ }
  return /[.]mkv(?:$|[?#&])/i.test(decoded);
}

function isHls(url) {
  const clean = url.toLowerCase().split("?")[0];
  return clean.includes(".m3u8") || clean.includes("m3u8-proxy") || clean.endsWith("/playlist");
}

function fmtBytes(n) {
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB"];
  let u = 0;
  while (n >= 1024 && u < units.length - 1) { n /= 1024; u += 1; }
  return `${n.toFixed(n >= 100 || u === 0 ? 0 : 1)} ${units[u]}`;
}

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
    if (a >= 224) return true;
    return false;
  }
  if (ip.includes(":")) {
    return ip === "::" || ip.startsWith("::1") || ip.startsWith("fe80:") ||
      ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("ff");
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

// Check a MKV URL with a tiny ranged GET using the provider headers.
// Returns "alive" (2xx/206), "dead" (404/410, DNS failure), or "unknown".
//
// Some file hosts (e.g. p.111477.xyz behind Cloudflare) answer 403 to
// datacenter IPs while the SAME url works fine for regular users. A 403
// from the server therefore does NOT mean the link is dead for the user,
// so access-denied responses count as "unknown" and the link is kept.
async function probeMkvAlive(url, headers) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        Range: "bytes=0-",
        Accept: "*/*",
        ...(headers && typeof headers === "object" ? headers : {}),
      },
    });
    // Release the response body immediately - we only needed the status.
    try { await res.body?.cancel(); } catch { /* already closed */ }
    if (res.status >= 200 && res.status < 300) return "alive";
    if (res.status === 404 || res.status === 410) return "dead";
    return "unknown";
  } catch (err) {
    const code = err?.cause?.code || err?.code || "";
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dead";
    return "unknown";
  } finally {
    clearTimeout(t);
  }
}

// Liveness results are remembered across requests: re-opening the menu
// (or another viewer hitting the same title) reuses the verdict instead of
// re-probing every link. Alive links re-check sooner than dead ones.
const PROBE_ALIVE_TTL_MS = 10 * 60_000;
const PROBE_DEAD_TTL_MS = 30 * 60_000;
const probeCache = new Map(); // url -> { at, status }

async function probeMkvAliveCached(url, headers) {
  const hit = probeCache.get(url);
  if (hit) {
    const ttl = hit.status === "alive" ? PROBE_ALIVE_TTL_MS : PROBE_DEAD_TTL_MS;
    if (Date.now() - hit.at < ttl) return hit.status;
  }
  const status = await probeMkvAlive(url, headers);
  probeCache.set(url, { at: Date.now(), status });
  if (probeCache.size > 500) {
    const now = Date.now();
    for (const [key, value] of probeCache) {
      const ttl = value.status === "alive" ? PROBE_ALIVE_TTL_MS : PROBE_DEAD_TTL_MS;
      if (now - value.at >= ttl) probeCache.delete(key);
    }
  }
  return status;
}

// Build a same-origin download URL through our stream proxy with
// Content-Disposition: attachment so browsers SAVE the file instead of
// trying to render it.
function makeDownloadUrl(streamUrl, headers) {
  const params = new URLSearchParams({ kind: "dl", url: streamUrl });
  if (headers && Object.keys(headers).length > 0) {
    params.set("headers", JSON.stringify(headers));
  }
  return `/api/stream-proxy?${params.toString()}`;
}

function cleanTitle(raw) {
  if (!raw) return "";
  return String(raw).replace(/\s+/g, " ").replace(/\n+/g, " ").trim();
}

function parseQuality(quality, title) {
  const text = `${quality ?? ""} ${title ?? ""}`.toLowerCase();
  if (text.includes("2160") || text.includes("4k") || text.includes("uhd")) return "2160p";
  if (text.includes("1080")) return "1080p";
  if (text.includes("720")) return "720p";
  if (text.includes("480")) return "480p";
  if (text.includes("360")) return "360p";
  return quality || "unknown";
}

function sizeOf(item) {
  const m = `${item.title ?? ""}`.match(/([\d.]+)\s*(GB|MB|KB)/i);
  if (m) return `${m[1]} ${m[2].toUpperCase()}`;
  if (item.size) {
    const m2 = String(item.size).match(/([\d.]+)\s*(GB|MB|KB)/i);
    if (m2) return `${m2[1]} ${m2[2].toUpperCase()}`;
  }
  return "";
}

async function fetchWithTimeout(url, ms, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await entries(url, headers, ctrl);
  } finally {
    clearTimeout(t);
  }
}

function entries(url, headers, ctrl) {
  return fetch(url, {
    signal: ctrl.signal,
    headers: { Accept: "application/json", ...headers },
    cache: "no-store",
  });
}

// Short-lived response cache. The player preload fires this the moment a
// title starts loading; re-opening the menu (or switching sources) then
// hits the warm cache instead of re-scraping every provider.
const CACHE_TTL_MS = 60_000;
const EMPTY_RESULT_TTL_MS = 5_000;
const responseCache = new Map();

async function mainHandler(req, res) {
  try {
    const q = req.query || {};
    const type = q.type === "series" ? "series" : "movie";
    const id = String(q.id || "").trim();
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ success: false, error: "bad id" });
      return;
    }
    const season = Number(q.season);
    const episode = Number(q.episode);

    // Serve the warm copy when possible (see note above).
    const cacheKey = `${type}:${id}:${type === "series" ? `${season || 1}:${episode || 1}` : "-"}`;
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(200).json(cached.payload);
      return;
    }

    const tasks = ALL_PROVIDERS.map(async (slug) => {
      try {
        let url = `${API_BASE}/api/streams/${slug}/movie/${id}`;
        if (type === "series") {
          url = `${API_BASE}/api/streams/${slug}/series/${id}?season=${season || 1}&episode=${episode || 1}`;
        }
        const timeout = PROVIDER_TIMEOUT_MS[slug] ?? 15000;
        const res = await fetchWithTimeout(url, timeout);
        if (!res.ok) return [];
        const json = await res.json();
        if (!json?.success) return [];
        return (json.streams || []).map((s) => ({ ...s, provider: s.provider || slug }));
      } catch {
        return [];
      }
    });

    const results = await Promise.all(tasks);
    const items = results.flat();

    // Liveness check every MKV candidate in parallel so only working URLs
    // reach the menu. Items without a MKV file skip the probe entirely.
    const mkvCandidates = items.filter((item) => {
      const u = item.url || "";
      return u && !isHls(u) && isMkvUrl(u) && isAllowedMediaUrl(u);
    });
    const mkvAlive = new Map(
      await Promise.all(
        mkvCandidates.map(async (item) => [
          item.url,
          await probeMkvAliveCached(item.url, item.headers),
        ]),
      ),
    );

    // Drop only links that are CERTAINLY dead. "unknown" (server blocked by
    // the host, IP-rate limited, etc.) stays listed - the user's network may
    // still reach it fine.
    const mkvCertainlyDead = (url) => mkvAlive.get(url) === "dead";

    const downloads = [];
    const subtitles = [];

    for (const item of items) {
      const url = item.url || "";
      if (!url || !isAllowedMediaUrl(url)) continue;
      const headers = item.headers && typeof item.headers === "object" ? item.headers : {};
      const ext = extensionOf(url);
      const hls = isHls(url);

      // Subtitle tracks from any provider.
      for (const sub of item.subtitles || []) {
        if (!sub?.url || !isAllowedMediaUrl(sub.url)) continue;
        subtitles.push({
          provider: item.provider,
          lang: sub.lang || sub.label || "und",
          label: sub.label || sub.lang || "Unknown",
          url: makeDownloadUrl(sub.url, headers),
          format: (sub.url.split("?")[0] || "").toLowerCase().endsWith(".vtt") ? "vtt" : "srt",
        });
      }

      if (hls) continue; // playlists aren't files — skip for downloads

      // MKV only - the download menu lists original MKV files exclusively.
      // Covers path-style (.../f.mkv) and query-style (...?u=...f.mkv) urls.
      if (!isMkvUrl(url)) continue;

      // Drop only certainly-dead links (404/410/DNS). Blocked-from-server
      // links still work for users and stay listed.
      if (mkvCertainlyDead(url)) continue;

      // Keep the provider's ORIGINAL url untouched (no proxy wrapper).
      downloads.push({
        provider: item.provider,
        name: cleanTitle(item.name || item.title || item.provider),
        title: cleanTitle(item.title || item.name || ""),
        quality: parseQuality(item.quality, item.title),
        format: "mkv",
        size: sizeOf(item),
        url,
        headers,
      });
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    const payload = {
      success: true,
      type,
      id,
      count: downloads.length,
      downloads,
      subtitles,
    };
        // Never let a transient upstream miss (HF cold start, network
        // blip) poison the cache: empty results are only remembered for
        // a few seconds, so the next preload retries quickly.
        const isEmptyResult = downloads.length === 0 && subtitles.length === 0;
        const ttl = isEmptyResult ? EMPTY_RESULT_TTL_MS : CACHE_TTL_MS;
        responseCache.set(cacheKey, { at: Date.now() - (CACHE_TTL_MS - ttl), payload });
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "internal" });
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(204).end();
    return;
  }
  await mainHandler(req, res);
}

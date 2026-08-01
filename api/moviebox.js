async function streamResponseBody(body, res) {
  if (!body) {
    res.end();
    return;
  }

  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(value);
    }
  } finally {
    reader.releaseLock();
  }
  res.end();
}

const ALLOWED_METHODS = new Set(["GET", "HEAD"]);
const ALLOWED_PATHS = [/^search$/, /^detail\/[a-zA-Z0-9._~-]+$/, /^api\/stream\/[a-zA-Z0-9._~-]+$/, /^api\/proxy$/];

function allowedMediaHosts() {
  return new Set(
    (process.env.MOVIEBOX_MEDIA_HOSTS ?? "bcdnxw.hakunaymatata.com")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

function validateMediaUrl(value, hosts) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !hosts.has(parsed.hostname.toLowerCase())) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function getPath(query) {
  const value = query.path;
  const parts = Array.isArray(value) ? value : value ? [value] : [];
  return parts
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function getSingleHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function copyResponseHeaders(upstream, res) {
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
}

export default async function handler(req, res) {
  const method = (req.method ?? "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).send("Method not allowed");
    return;
  }

  const path = getPath(req.query);
  if (!path || path.includes("..") || !ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    res.status(404).send("Not found");
    return;
  }

  const upstreamBase = process.env.MOVIEBOX_API_URL?.replace(/\/$/, "");
  if (!upstreamBase) {
    res.status(503).send("MovieBox service is not configured");
    return;
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === "path" || (path === "api/proxy" && key === "url")) continue;
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(key, item);
    }
  }

  let mediaUrl = null;
  // Reconstruct full URL including query params that may have been split
  // by Vercel's query parser (e.g. ?url=...mp4?sign=X&t=Y → url=...mp4?sign=X, t=Y).
  if (path === "api/proxy") {
    const hosts = allowedMediaHosts();
    const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
    // Append any extra query params (split off by Vercel) back to the URL.
    const extra = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (k === "path" || k === "url") continue;
      for (const item of Array.isArray(v) ? v : [v]) {
        extra.append(k, item);
      }
    }
    const fullUrl = rawUrl && extra.toString() ? `${rawUrl}&${extra}` : rawUrl;
    mediaUrl = validateMediaUrl(fullUrl, hosts);
    if (!mediaUrl) {
      res.status(403).send("Media host is not allowed");
      return;
    }
    query.set("url", mediaUrl);
  }

  const headers = {};
  // Only use JSON accept for API requests, not for media proxy fetches.
  if (path !== "api/proxy") {
    headers.Accept = getSingleHeader(req, "accept") ?? "application/json";
  }
  const range = getSingleHeader(req, "range");
  if (range) headers.Range = range;
  // Secret is required by the upstream MovieBox VPS for authorization.
  const secret = process.env.MOVIEBOX_API_SECRET;
  if (secret) headers["X-NEXUS-SECRET"] = secret;

  try {
    // ALL paths (including api/proxy) go through the upstream MovieBox VPS.
    // The VPS api.py has a /api/proxy endpoint that adds required CDN headers
    // (Referer, Origin, User-Agent) and handles Range streaming properly.
    const targetUrl = `${upstreamBase}/${path}${query.toString() ? `?${query}` : ""}`;
    const upstream = await fetch(targetUrl, {
      method,
      headers,
    });
    res.status(upstream.status);
    copyResponseHeaders(upstream, res);
    if (method === "HEAD") {
      res.send("");
      return;
    }
    await streamResponseBody(upstream.body, res);
  } catch {
    res.status(502).send("MovieBox upstream unavailable");
  }
}

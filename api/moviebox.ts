type VercelRequest = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string | number): VercelResponse;
  send(body: unknown): void;
  write(chunk: Uint8Array): boolean;
  end(): void;
};

async function streamResponseBody(body: ReadableStream<Uint8Array> | null, res: VercelResponse): Promise<void> {
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

function allowedMediaHosts(): Set<string> {
  return new Set(
    (process.env.MOVIEBOX_MEDIA_HOSTS ?? "bcdnxw.hakunaymatata.com")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

function validateMediaUrl(value: string | undefined, hosts: Set<string>): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !hosts.has(parsed.hostname.toLowerCase())) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function getPath(query: VercelRequest["query"]): string {
  const value = query.path;
  const parts = Array.isArray(value) ? value : value ? [value] : [];
  return parts
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function getSingleHeader(req: VercelRequest, name: string): string | undefined {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function copyResponseHeaders(upstream: Response, res: VercelResponse): void {
  for (const name of ["content-type", "content-range", "accept-ranges", "cache-control", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  if (path === "api/proxy") {
    const hosts = allowedMediaHosts();
    const mediaUrl = validateMediaUrl(
      Array.isArray(req.query.url) ? req.query.url[0] : req.query.url,
      hosts,
    );
    if (!mediaUrl) {
      res.status(403).send("Media host is not allowed");
      return;
    }
    query.set("url", mediaUrl);
  }

  const headers: Record<string, string> = { Accept: getSingleHeader(req, "accept") ?? "application/json" };
  const range = getSingleHeader(req, "range");
  if (range) headers.Range = range;
  const secret = process.env.MOVIEBOX_API_SECRET;
  if (secret) headers["X-NEXUS-SECRET"] = secret;

  try {
    const upstream = await fetch(`${upstreamBase}/${path}${query.toString() ? `?${query}` : ""}`, {
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

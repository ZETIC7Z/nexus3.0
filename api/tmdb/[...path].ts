type VercelRequest = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string): VercelResponse;
  send(body: string): void;
};

function isV4Token(value: string): boolean {
  return value.split(".").length === 3;
}

function getPath(query: VercelRequest["query"]): string {
  const value = query.path;
  const parts = Array.isArray(value) ? value : value ? [value] : [];
  return parts
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).send("Method not allowed");
    return;
  }

  const token = process.env.TMDB_READ_API_KEY;
  if (!token) {
    res.status(503).send("TMDB service is not configured");
    return;
  }

  const upstreamBase = (process.env.TMDB_API_BASE_URL || "https://api.themoviedb.org/3").replace(/\/$/, "");
  const path = getPath(req.query);
  const allowedPath = /^(?:search\/(?:multi|movie|tv|collection)|discover\/(?:movie|tv)|genre\/(?:movie|tv)\/list|(?:movie|tv|person|collection)\/\d+(?:\/[^/]+)*|find\/tt\d+)$/;
  if (!path || path.includes("..") || !allowedPath.test(path)) {
    res.status(400).send("Invalid TMDB path");
    return;
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === "path" || key === "api_key") continue;
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(key, item);
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (isV4Token(token)) headers.Authorization = `Bearer ${token}`;
  else query.set("api_key", token);

  try {
    const upstream = await fetch(`${upstreamBase}/${path}${query.toString() ? `?${query}` : ""}`, {
      method: req.method,
      headers,
    });

    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
    res.send(req.method === "HEAD" ? "" : await upstream.text());
  } catch {
    res.status(502).send("TMDB upstream unavailable");
  }
}

// api/vidfast2-vc.js
// Vercel serverless function — transparent proxy to vidfast.vc with browser headers.
// Upstream: https://vidfast.vc

const UPSTREAM = "https://vidfast.vc";

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
  const targetUrl = `${UPSTREAM}/${path}${qs ? "?" + qs : ""}`;

  // Inject required browser-emulation headers
  const headers = {
    Accept: "*/*",
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
    Referer: "https://vidfast.vc/",
    "X-Requested-With": "XMLHttpRequest",
  };
  const reqCt = req.headers && req.headers["content-type"];
  if (reqCt) {
    headers["Content-Type"] = Array.isArray(reqCt) ? reqCt[0] : reqCt;
  }

  try {
    let body = undefined;
    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const upstream = await fetch(targetUrl, {
      method: req.method || "GET",
      headers,
      body,
    });

    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.method === "HEAD") { res.send(""); return; }
    res.send(await upstream.text());
  } catch (e) {
    res.status(502).send(e.message || "Upstream unavailable");
  }
}

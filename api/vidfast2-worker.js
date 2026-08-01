// api/vidfast2-worker.js — minimal test
const UPSTREAM = "https://vidfast.samxerz-zeticuz.workers.dev";

export default async function handler(req, res) {
  try {
    const path = (req.query?.path || "").replace(/^\/+|\/+$/g, "");
    if (!path) {
      res.status(200).json({ ok: true, message: "VidFast2 worker proxy is alive" });
      return;
    }
    
    const targetUrl = `${UPSTREAM}/${path}`;
    const upstream = await fetch(targetUrl, {
      method: req.method || "GET",
      headers: { Accept: "application/json" }
    });
    
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(await upstream.text());
  } catch (e) {
    res.status(500).json({ error: e.message || "Unknown error" });
  }
}

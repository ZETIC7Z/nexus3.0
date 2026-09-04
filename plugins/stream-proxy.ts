// plugins/stream-proxy.ts
// Vite dev-server middleware — serves /api/stream-proxy locally with the
// exact same behavior as the Vercel function (api/stream-proxy.js).
// Production uses the serverless function; this keeps local dev complete.
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "http";

import handler from "../api/stream-proxy.js";
import { shimVercelRes } from "./vercel-shim";

export function streamProxyPlugin(): Plugin {
  return {
    name: "stream-proxy",
    configureServer(server) {
      server.middlewares.use("/api/stream-proxy", (req: IncomingMessage, res: ServerResponse) => {
        // The serverless handler reads req.query; synthesize it from the URL.
        const url = new URL(req.url || "/", "http://localhost");
        (req as any).query = Object.fromEntries(url.searchParams.entries());
        handler(req as any, shimVercelRes(res)).catch((err) => {
          res.statusCode = 502;
          res.setHeader("Content-Type", "text/plain");
          res.end(err?.message || "stream-proxy error");
        });
      });
    },
  };
}

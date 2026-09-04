// plugins/downloads-api.ts
// Vite dev-server middleware — serves /api/downloads locally with the exact
// same behavior as the Vercel function (api/downloads.js).
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "http";

import handler from "../api/downloads.js";
import { shimVercelRes } from "./vercel-shim";

export function downloadsApiPlugin(): Plugin {
  return {
    name: "downloads-api",
    configureServer(server) {
      server.middlewares.use("/api/downloads", (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || "/", "http://localhost");
        (req as any).query = Object.fromEntries(url.searchParams.entries());
        handler(req as any, shimVercelRes(res)).catch((err) => {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: false, error: err?.message || "downloads error" }));
        });
      });
    },
  };
}

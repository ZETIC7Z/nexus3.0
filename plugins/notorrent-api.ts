// plugins/notorrent-api.ts
// Vite dev-server middleware — serves /api/notorrent locally with the exact
// same logic as the Vercel function (api/notorrent.js). Production uses the
// real serverless function; this keeps local dev fully self-contained.
import type { Plugin } from "vite";

import { handleNotorrentRequest } from "../api/notorrent.js";

export function notorrentApiPlugin(): Plugin {
  return {
    name: "notorrent-api",
    configureServer(server) {
      server.middlewares.use("/api/notorrent", (req, res) => {
        handleNotorrentRequest(req, res).catch((err) => {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              success: false,
              error: err?.message || "notorrent proxy error",
            }),
          );
        });
      });
    },
  };
}

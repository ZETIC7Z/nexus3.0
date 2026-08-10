import fs from "fs";
import path from "path";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import loadVersion from "vite-plugin-package-version";
import { VitePWA } from "vite-plugin-pwa";
import checker from "vite-plugin-checker";
import { handlebars } from "./plugins/handlebars";
import { notorrentApiPlugin } from "./plugins/notorrent-api";
import { PluginOption, loadEnv, splitVendorChunkPlugin } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

import tailwind from "tailwindcss";
import rtl from "postcss-rtlcss";

// Build id for the "new version available" update-notice: the deploying
// GitHub Actions run's commit sha, so it changes on every real deploy.
// package.json's version field doesn't get bumped per-deploy, so it can't be
// used for this. Falls back to a timestamp for local/preview builds.
const BUILD_ID = process.env.GITHUB_SHA || String(Date.now());

// Emits dist/version.json with the same id the client is built against, so
// a running tab can poll it and detect when a newer build has been deployed.
function emitVersionJSON(): PluginOption {
  return {
    name: "emit-version-json",
    apply: "build",
    writeBundle(options) {
      const dir = options.dir || "dist";
      fs.writeFileSync(
        path.join(dir, "version.json"),
        JSON.stringify({ version: BUILD_ID }),
      );
    },
  };
}

const captioningPackages = [
  "dompurify",
  "htmlparser2",
  "subsrt-ts",
  "parse5",
  "entities",
  "fuse",
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const serverEnv = loadEnv(mode, process.cwd(), "");
  return {
    base: env.VITE_BASE_URL || "/",
    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    plugins: [
      emitVersionJSON(),
      handlebars({
        vars: {
          opensearchEnabled: env.VITE_OPENSEARCH_ENABLED === "true",
          routeDomain:
            env.VITE_APP_DOMAIN +
            (env.VITE_NORMAL_ROUTER !== "true" ? "/#" : ""),
          domain: env.VITE_APP_DOMAIN,
          env,
        },
      }),
      react({
        babel: {
          presets: [
            "@babel/preset-typescript",
            [
              "@babel/preset-env",
              {
                modules: false,
                useBuiltIns: "entry",
                corejs: {
                  version: "3.34",
                },
              },
            ],
          ],
        },
      }),
      VitePWA({
        disable: env.VITE_PWA_ENABLED !== "true",
        registerType: "autoUpdate",
        workbox: {
          maximumFileSizeToCacheInBytes: 4000000, // 4mb
          globIgnores: ["!assets/**/*"],
        },
        includeAssets: [
          "favicon.ico",
          "apple-touch-icon.png",
          "safari-pinned-tab.svg",
        ],
        manifest: {
          name: "NEXUS",
          short_name: "NEXUS",
          description:
            "Watch your favorite shows and movies for free with no ads ever! (っ'ヮ'c)",
          theme_color: "#000000",
          background_color: "#000000",
          display: "standalone",
          start_url: "/",
          icons: [
            {
              src: "android-chrome-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "android-chrome-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "android-chrome-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "android-chrome-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
      loadVersion(),
      notorrentApiPlugin(),
      checker({
        overlay: {
          position: "tr",
        },
        typescript: true, // check typescript build errors in dev server
        enableBuild: false,
        eslint: {
          // check lint errors in dev server
          lintCommand: "eslint --ext .tsx,.ts --max-warnings 999 src",
          dev: {
            logLevel: ["error"],
          },
        },
      }),
      splitVendorChunkPlugin(),
      visualizer() as PluginOption,
    ],

    build: {
      chunkSizeWarningLimit: 2000,
      sourcemap: mode !== "production",
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (
              id.includes("@sozialhelden+ietf-language-tags") ||
              id.includes("country-language")
            ) {
              return "language-db";
            }
            if (id.includes("hls.js")) {
              return "hls";
            }
            if (id.includes("node-forge") || id.includes("crypto-js")) {
              return "auth";
            }
            if (id.includes("locales") && !id.includes("en.json")) {
              return "locales";
            }
            if (id.includes("react-dom")) {
              return "react-dom";
            }
            if (id.includes("Icon.tsx")) {
              return "Icons";
            }
            const isCaptioningPackage = captioningPackages.some((packageName) =>
              id.includes(packageName),
            );
            if (isCaptioningPackage) {
              return "caption-parsing";
            }
          },
        },
      },
    },
    css: {
      postcss: {
        plugins: [tailwind(), rtl()],
      },
    },

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@themes": path.resolve(__dirname, "./themes"),
        "@sozialhelden/ietf-language-tags": path.resolve(
          __dirname,
          "./node_modules/@sozialhelden/ietf-language-tags/dist/cjs",
        ),
      },
    },

    server: {
      proxy: {
        // ── VidFast 2 — Cloudflare Worker (encryption toolkit) ──────────
        "/api/vidfast2-worker": {
          target: "https://vidfast.yogeshkumarjamre1.workers.dev",
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api\/vidfast2-worker/, ""),
        },
        // ── VidFast 2 — vidfast.vc direct API calls ─────────────────────
        "/api/vidfast2-vc": {
          target: "https://vidfast.vc",
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api\/vidfast2-vc/, ""),
          // The browser can't set User-Agent or Referer via fetch() — the
          // proxy must inject them server-side. These are static constants
          // from the worker's config.js.
          headers: {
            "Referer": "https://vidfast.vc/",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
            "X-Requested-With": "XMLHttpRequest",
          },
        },
        // VidFast2 playback only: route the CDN playlist/segments through
        // the known-working M3U8 proxy while retaining the requested query.
        "/api/vidfast2-stream": {
          target: "https://pstream.dovetechnology.org",
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api\/vidfast2-stream/, ""),
        },

        // ── TMDB — metadata (server-side key, same-origin browser request) ─
        "/api/tmdb": {
          target: "https://api.themoviedb.org",
          changeOrigin: true,
          secure: true,
          rewrite: (requestPath) => {
            const rewritten = requestPath.replace(/^\/api\/tmdb/, "/3");
            const token = serverEnv.TMDB_READ_API_KEY || serverEnv.VITE_TMDB_READ_API_KEY;
            // TMDB v4 tokens use Authorization; legacy v3 keys must be added
            // server-side to the proxied request and never come from the client.
            if (!token || token.split(".").length === 3) return rewritten;
            const separator = rewritten.includes("?") ? "&" : "?";
            return `${rewritten}${separator}api_key=${encodeURIComponent(token)}`;
          },
          headers: (() => {
            const token = serverEnv.TMDB_READ_API_KEY || serverEnv.VITE_TMDB_READ_API_KEY;
            return token?.split(".").length === 3
              ? { Authorization: `Bearer ${token}` }
              : {};
          })(),
        },
      },
    },


    test: {
      environment: "jsdom",
      exclude: ["tests/**", "node_modules/**"],
      passWithNoTests: true,
    },
    preview: {
      host: true,
      port: 80,
      allowedHosts: ["pstream.net", "pstream-test.vercel.app"],
    },
  };
});

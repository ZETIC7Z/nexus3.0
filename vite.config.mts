import fs from "fs";
import path from "path";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import loadVersion from "vite-plugin-package-version";
import { VitePWA } from "vite-plugin-pwa";
import checker from "vite-plugin-checker";
import { handlebars } from "./plugins/handlebars";
import { streamProxyPlugin } from "./plugins/stream-proxy";
import { downloadsApiPlugin } from "./plugins/downloads-api";
import { PluginOption, loadEnv } from "vite";
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
        // Monetag's domain-verification service worker ships as public/sw.js
        // and MUST be served at /sw.js — the PWA worker lives at /app-sw.js
        // so the build never overwrites it.
        filename: "app-sw.js",
        workbox: {
          maximumFileSizeToCacheInBytes: 4000000, // 4mb
          // Heavy on-demand chunks (voice AI, translation DB, locale packs)
          // are excluded from the install-time precache so a first visit
          // doesn't download them in the background and compete with the
          // app shell. They are still fetched + runtime-cached on use.
          globIgnores: [
            "assets/transformers*.js",
            "assets/vadWorker*.js",
            "assets/language-db-*.js",
            "assets/locales-*.js",
          ],
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
      streamProxyPlugin(),
      downloadsApiPlugin(),
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
            // Exact match: a bare includes("Icon.tsx") also catches
            // FlagIcon.tsx, which pulls the heavy language database into
            // the boot path. Normalize windows/unix separators first.
            if (id.split("\\").join("/").endsWith("/components/Icon.tsx")) {
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
      // ngrok support: tunnel requests arrive with an *.ngrok-free.app Host
      // header; without an allowlist Vite's dev host-check rejects them with
      // "Invalid Host Header" and Monetag verification can never see the site.
      allowedHosts: [".ngrok-free.app", ".ngrok.io", ".ngrok.dev"],
      proxy: {

        // ── Ad scripts — first-party delivery (anti-adblock) ──────────
        // Adsterra scripts are fetched same-origin (/ads-serve/...) and
        // proxied server-side. Adblockers block known ad-network domains,
        // but almost never first-party paths on the site's own origin.
        "/ads-serve": {
          target: "https://pimplehardnesscarnivorous.com",
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/ads-serve/, ""),
        },

        // ── Monetag — first-party delivery (anti-adblock) ──────────
        "/monetag-serve/88": {
          target: "https://quge5.com",
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/monetag-serve/, ""),
        },
        "/monetag-serve": {
          target: "https://3nbf4.com",
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/monetag-serve/, ""),
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

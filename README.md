# NEXUS 3.0 (MovieBox & Zunime Edition)

Welcome to **NEXUS 3.0**! 

This repository is optimized for **Vercel Deployment** with exclusive MovieBox (movies & shows) and Zunime (anime) scrapers built-in. All proxies and API integrations are configured out of the box via `vercel.json` rewrites.

## Features
- **MovieBox Scraper:** Blazing fast media scraper for all Movies and TV Shows.
- **Zunime Scraper:** The best source for Anime series.
- **Seamless Proxying:** Bypass CORS with `vercel.json` proxy rewrites.
- **No Extensions Required:** Works natively in all modern browsers without installing extensions.
- **One-Click Deploy:** Ready to deploy directly to Vercel.

## Quick Start
1. Clone this repository
2. Run `npm install`
3. Run `npm run dev` to start locally
4. Deploy to Vercel and it works out of the box!

## Automated Project Changelog

### [July 25, 2026 - 00:30] — VidSrc and Zunime API Fixes
- **VidSrc Stability:** Updated the VidSrc server on the VPS to automatically recreate the Playwright browser if it crashes or disconnects.
- **VidSrc Connectivity:** Updated `vercel.json` to proxy `/nexus-vidsrc` to port `4001` on the VPS to match where the node process runs, fixing the "Failed to scrape" error in production.
- **Zunime Connectivity:** Added the missing `/nexus-zunime`, `/nexus-zunime-worker`, and `/nexus-anilist` proxies to `vercel.json`, restoring Zunime provider and AniList functionality on the Vercel production deployment.

### [July 24, 2026 - 23:58] — Fix scraping errors and production proxies: TMDB Proxy + Vercel SPA Routing
- **Fixed "Failed to load metadata" crash**: The TMDB dev-server proxy (`/nexus-tmdb/3/`) was running in production. Vercel serves `index.html` (200 OK) for unknown routes, so the fetch succeeded with HTML instead of JSON — silently bypassing the fallback and crashing the app with `TypeError: Cannot read properties of undefined (reading 'length')`. Fixed by wrapping the proxy block with `import.meta.env.DEV` in `src/backend/metadata/tmdb.ts`.
- **Fixed 404 on movie/TV pages**: Added `vercel.json` with SPA rewrite rule `"source": "/(.*)" → "destination": "/"` so all client-side routes work correctly.
- **Flattened repository structure**: Moved all web app files from `nexus/` subdirectory to root to exactly match `xp-technologies-dev/p-stream` architecture, eliminating Vercel build detection issues.
- **Fixed Vercel package manager detection**: Bumped `packageManager` to `pnpm@9.15.4` to eliminate `ERR_INVALID_THIS` fetch bug on Node.js 24.
- **Files changed**: `src/backend/metadata/tmdb.ts`, `vercel.json`, `package.json`

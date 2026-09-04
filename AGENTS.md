# AGENTS.md — Instructions for AI Coding Agents

You are working on **NEXUS**, a streaming web app (React + TS + Vite, deployed
on Vercel). **Read `agentbrain.md` first** — it is the full, current brain:
architecture map, provider catalog rules, hard-won gotchas, pre-deploy
checklist, and debug playbooks. This file is the short version.

## Project in one line
React 18 + TypeScript + Vite streaming app; providers scraped via a
HuggingFace aggregate API (+ the client-built Yamie movie provider); metadata
from TMDB through `api/tmdb.js`; downloads + HLS proxied same-origin through
`api/stream-proxy.js`.

## Non-negotiable rules
1. **The provider catalog is the single source of truth**
   (`NEXUS_PROVIDER_CATALOG` in `src/providers/embeds/shared.ts`). Never show
   a provider that isn't probe-verified. Hide dead providers with
   `playable: false, rank: 0` — never delete working code.
2. **Movie-only providers** (like Yamie) use `moviesOnly: true` and must never
   appear for TV shows.
3. **Console cleanliness is a feature.** Only fatal HLS errors log; dead
   origins are remembered and skipped; subtitle failures are capped. Don't
   reintroduce noisy logging.
4. **Downloads preload.** `/api/downloads` is warmed when playback starts
   (`src/utils/downloadPreload.ts`). Download menus read the cache — never
   fetch on menu-open again.
5. **MKV-only downloads, original URLs.** `api/downloads.js` lists MKV files
   only (path-style and query-style), untouched provider URLs, certainly-dead
   links (404/410/DNS) dropped. A 403 from a datacenter IP ≠ dead.
6. **Secrets only in env.** `TMDB_READ_API_KEY` is server-side (used by
   `api/tmdb.js` and the dev proxy). Never hardcode tokens or proxy hosts.
7. **pnpm only** (`preinstall` enforces it).

## Key files
- `src/providers/embeds/shared.ts` — provider catalog + scrape + probe engine.
- `src/providers/nexus-providers-index.ts` — registry handed to the player.
- `src/components/player/display/base.ts` — hls.js config (device-aware).
- `src/components/player/utils/proxy.ts` — proxy selection + origin memory.
- `src/utils/common/originHealth.ts` — persisted dead-origin memory.
- `src/utils/downloadPreload.ts` — downloads preload on Play Now.
- `api/downloads.js` / `api/stream-proxy.js` / `api/tmdb.js` — serverless.
- `public/notifications.xml` — user-facing update notifications.

## Before any push/deploy
Run the checklist in `agentbrain.md` §8 (install, tsc, lint, build, api syntax
checks) and live-test a movie + a TV episode on the dev server. Deploy env
vars are listed in `agentbrain.md` §9 and `example.env`.

## When something breaks
Follow `agentbrain.md` §10 (debug order) and §5 (gotchas) — most issues there
have already been solved once.

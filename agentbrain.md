# agentbrain.md — The Agent Brain for NEXUS 3.0

Everything a future agent needs to work on this repo without breaking it.
Read this top-to-bottom before your first edit. Companion docs:
`README.md` (user-facing + provider recipes), `AGENTS.md` (short rules).

---

## 1. What this project is

React 18 + TypeScript + Vite streaming app (P-Stream fork, fully rebranded NEXUS).
- **Metadata:** TMDB via same-origin proxy `api/tmdb.js` (server-side key `TMDB_READ_API_KEY`, never shipped to the client).
- **Streams:** providers scraped through a HuggingFace aggregate API (`VITE_TMDB_EMBED_URL`, default `https://stycanine1-tmdb-embed-api.hf.space`) plus one client-built direct provider (Yamie).
- **Deploy target:** Vercel (`vercel.json` rewrites + `api/*.js` serverless functions). Package manager is **pnpm only** (`preinstall` enforces it).
- **Dev:** `pnpm run dev` (port 5173). Dev shims in `plugins/` emulate the Vercel functions locally.

## 2. Architecture map (the load-bearing files)

```
src/providers/embeds/shared.ts     ← THE provider brain (catalog + scrape + probe)
src/providers/nexus-providers-index.ts ← Registry handed to the player
src/providers/allowed-providers.ts ← Show/movie allow-lists (movie-only filter)
src/providers/shared/makeProviderContext.ts ← Provider factory (mediaTypes support)
src/components/player/display/base.ts  ← hls.js config (device-aware buffers)
src/components/player/utils/proxy.ts   ← M3U8 proxy picking + dead-origin memory
src/components/player/hooks/useCaptions.ts ← Caption auto-select + failure memory
src/stores/player/slices/source.ts ← Source selection + subtitle fallback chain
src/utils/downloadPreload.ts       ← Warms /api/downloads when playback starts
src/utils/common/originHealth.ts   ← localStorage memory of dead proxy origins
api/downloads.js                   ← MKV/subtitle aggregation + liveness cache
api/stream-proxy.js                ← Same-origin HLS/MP4/subtitle/download proxy
api/tmdb.js                        ← TMDB metadata proxy (auth server-side)
public/notifications.xml           ← In-app user notifications (RSS)
```

## 3. The provider catalog (memorize this)

`NEXUS_PROVIDER_CATALOG` in `src/providers/embeds/shared.ts` is the single
source of truth. One line per provider:

```ts
{ id: "videasy", name: "Videasy", playable: true, rank: 1010 },
{ id: "anikoto", name: "AniKoto", playable: true, anime: true, rank: 1020 },
{ id: "yamie",   name: "Yamie ❤️", playable: true, moviesOnly: true, rank: 920 },
{ id: "vidlink", name: "VidLink", playable: false, rank: 0 }, // parked
```

- `rank` = try order (higher first, ~800–1100).
- `playable: false, rank: 0` = **hide without deleting code** (current: VidLink,
  VixSrc — upstream 403s; StreamFlix, 4KHDHub, DahmerMovies — download-only MKV
  sources used by `api/downloads.js`).
- `anime: true` = anime content filtering.
- `moviesOnly: true` = sets `mediaTypes: ["movie"]`, removed from TV allow-lists.
- There is **no per-provider file anymore** — `makeEmbedProvider` (same file)
  generates everything: fetch, latency probing with content validation, quality
  ranking, subtitle passthrough, dub audio tracks.

## 4. How to add a provider (fast path)

Full recipes with code live in `README.md` → "How to Add a New Provider".
Short version:
1. `curl "https://stycanine1-tmdb-embed-api.hf.space/api/streams/{id}/movie/603"` — verify upstream BEFORE coding.
2. Aggregate-API provider → add one catalog line. Done.
3. Direct-endpoint provider (like Yamie) → URL builder + `moviesOnly`/mediaTypes + scrape-path branch returning the built item (movies) or `[]` (TV). The probe pipeline validates it; if dead, it never shows.
4. Has downloadable files? Add its slug to `ALL_PROVIDERS` in `api/downloads.js`.
5. Test in **Developer → Video Tester** (dropdown) + play a movie AND an episode.

## 5. Hard-won gotchas (do not relearn these the hard way)

1. **`p.111477.xyz` (DahmerMovies) returns 403 to datacenter IPs** (Cloudflare).
   The links WORK for real users. Never treat server-side 403 as "dead" in
   `api/downloads.js` — only 404/410/DNS count as certainly dead. Same logic
   anywhere a server probes a user-facing file host.
2. **Shell heredocs mangle `\r\n` and `\b` escapes** on this Windows checkout.
   Edit files with Node scripts using line-based `split(/\r?\n/)` + `splice`,
   or write a `.cjs` script file first. Never trust multi-line `sed`-style
   string replaces across CRLF boundaries — they silently no-op.
3. **Regex literals written through shells can eat backslashes.** Use `[.]`
   instead of `\.` when the script passes through a shell layer.
4. **HF Space cold starts** take 30–60s. That is why caches exist
   (`AGGREGATE_CACHE_TTL` 90s client, 60s server response cache). Don't "fix"
   slowness by removing caches.
5. **OpenSubtitles download URLs have no CORS headers** — they can never be
   auto-selected in-browser. vdrk/wyzie captions load fine cross-origin.
   `useCaptions.ts` + `source.ts` both filter `dl.opensubtitles.org`.
6. **VidLink/VixSrc upstream 403** (as of Sep 2026). Parked with
   `playable: false`. To re-enable: flip the flag, run the tester, check
   `curl -I` on their endpoints first.
7. **The user's browser extensions** inject ad scripts that log console errors
   ("Missing required elements", `nicheauthorityengine.site` fetches). Those
   are NOT app bugs — don't chase them.
8. **Mobile Safari:** native HLS for playback; hls.js config in `base.ts` uses
   `IS_MOBILE` buffers (30s/60s + `capLevelToPlayerSize`). Keep that balance —
   deep desktop buffers (120s/240s) OOM phones.
9. **pnpm only.** `npm install` is blocked by `preinstall`. Lockfile is
   `pnpm-lock.yaml`.
10. **Dev checker overlay** (vite-plugin-checker) surfaces ESLint/TS errors in
    the browser. If you see one, fix the code — never disable the plugin.

## 6. Console-cleanliness contract

During normal playback the console must be essentially empty:
- hls.js: only `data.fatal` errors are logged (`base.ts`).
- Probes: `probeUrl` records outcome into `originHealth` and future candidates
  on a dead origin are skipped WITHOUT a request. One CORS error per dead host
  per memory window, max.
- Metrics 404s (`backend.zstream.mov/metrics`), IMDb enrichment fetch errors,
  and subtitle retry storms are silenced on purpose. Don't reintroduce them.
- Subtitle auto-select: max 3 attempts/session, dead hosts filtered up front.

## 7. Downloads system

- `src/utils/downloadPreload.ts` fires `/api/downloads` the moment meta is set
  (Play Now) and keeps it warm across provider switches. Both Download views
  read the shared cache — menus must open instantly. Don't move fetching back
  into the menu components.
- `api/downloads.js`: MKV-only (path-style AND query-style like
  `.../bulk?u=...mkv`), original URLs untouched (no proxy wrapper), subtitles
  grouped by language. Liveness cache 10 min alive / 30 min dead.
- Verify with: `curl "http://localhost:5173/api/downloads?type=movie&id=603"`.

## 8. Pre-deploy verification checklist

Run ALL of these before any push/deploy:
```bash
pnpm install                     # deps resolve
npx tsc --noEmit -p tsconfig.json  # zero type errors
pnpm run lint                    # no NEW eslint errors (pre-existing baseline is allowed)
pnpm run build                   # production build succeeds
node --check api/downloads.js && node --check api/stream-proxy.js && node --check api/tmdb.js
```
Then live-test on the dev server: play a MOVIE (Yamie visible if alive),
play a TV EPISODE (Yamie absent, VidLink/VixSrc absent), open Download Movie +
Download Subtitle (instant, MKV originals), watch console during playback.
Only then push + deploy.

## 9. Deploy (Vercel)

- Repo: `https://github.com/ZETIC7Z/nexus3.0`, branch `main`.
- Build: `pnpm run build`, output `dist`, functions in `api/`.
- Env vars (Production + Preview + Development): see `example.env`.
  Required: `TMDB_READ_API_KEY`, `VITE_TMDB_EMBED_URL`, `VITE_APP_DOMAIN`,
  `VITE_NORMAL_ROUTER`, `VITE_PWA_ENABLED`, `VITE_ALLOW_AUTOPLAY`.
  `VITE_MOVIEBOX_API_URL` / `VITE_VIDSRC_API_URL` are REMOVED — never re-add.
- `vercel.json` rewrites `/api/stream-proxy`, `/api/tmdb`, SPA fallback.
- After deploy: play a movie + episode on the production URL, check console,
  check `/api/downloads` responds, verify preconnects are in the HTML.

## 10. When playback breaks (debug order)

1. Which providers? Play -> dev tools -> network: is `hf.space` responding?
   (cold start is not broken; wait 60s)
2. `getLiveNexusProviders()` filtering right? Check `provider-health.ts`
   snapshot + the catalog flags.
3. One provider dead -> park it (`playable: false`), investigate upstream later.
4. CORS errors on stream -> is the M3U8 proxy configured + alive? Check
   `originHealth` in localStorage (`nexus-origin-health-v1`) - stale memory can
   be cleared there.
5. Downloads empty -> query the API directly (section 7), then check upstream slugs.
6. Subtitles missing -> check `useCaptions` filters + vdrk availability.

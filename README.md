# NEXUS 3.0

<p align="center">
  <img src="/public/pwa-logo.svg" alt="NEXUS Banner" width="200" />
</p>

<p align="center">
  <b>NEXUS</b> — Free Movies, TV Shows & Anime Streaming<br>
  <i>No ads. No sign-up. Just pure entertainment.</i>
</p>

---

## 🚀 What's New — Sep 4, 2026 (v3.2)

### ⚡ Performance Overhaul (the big one)
First load used to pull **5.7 MB of JavaScript** — now it's **~2.3 MB (−60%)**:
- **Lazy locales** — only `en.json` (72K) ships at boot; your language's translation loads on demand (~1.2 MB saved)
- **Language database split** — the 1.1 MB country/language DB now loads only in settings UI
- **hls.js off the boot path** — the 510 KB player engine loads with the player, not the homepage
- **Lazy caption pipeline** — subtitle parsing/downloading loads only when captions are used
- **PWA precache trim** — the service worker no longer precaches voice-AI chunks (transformers/VAD) and locale packs; they cache on first use instead
- Fixed a chunking bug where `FlagIcon` silently dragged the language DB into the entry chunk

### 👋 Personalized Greetings
- Time-aware greeting that follows **your** timezone (morning/afternoon/night buckets)
- Random rotating headlines — "Movie night? Let's find something great.", "What's your plan tonight?", and more
- **Signed in?** It greets you by name: "Welcome back, Sam! What are we watching tonight?" (name from your account, decrypted locally)
- Refreshed search-bar placeholders

### 🏳️ Top 10 in Your Country — Flag Edition
The globe icon on the Top 10 row is replaced with the **detected country's real flag** (same flag set as the subtitle picker).

### 🔔 Smart Popup System
- The **Maintenance** and **App Update** popups now share **one top-center slot** — no stacking
- Popup 1 shows → fades out after 15 s → popup 2 shows → auto-closes after 15 s
- Smooth slide/fade in **and** out animations; clean single-popup layout on mobile
- **Notifications auto-delete after 30 days** (both the in-app store and the RSS feed filter)

### 🍿 Everything from earlier today
- Yamie movie-only provider (probe-gated), preloaded MKV/subtitle downloads, mobile-aware buffering, dead-proxy memory, liveness-checked MKV links, cleaner console

---

### 🍿 Earlier today (v3.1)

### Yamie Provider (movies)
New movie-only source backed by a direct HLS endpoint (`media.vidrift.in/movie_{tmdbId}/vod.m3u8`). It is built client-side from the TMDB id — no backend round-trip — and is probed before being offered, so it only appears when it is actually online. TV shows never see it.

### Downloads That Load Before You Click
The moment a title starts playing (or even while the source spinner is still running), the app preloads `/api/downloads` in the background. Opening **Download Movie** or **Download Subtitle** is then instant:
- **MKV only** — MP4 clutter removed; original provider URLs untouched (e.g. `https://p.111477.xyz/bulk?u=...mkv`)
- **Alive only** — every MKV is liveness-probed server-side; certainly-dead links (404/410/DNS) never reach the menu. Hosts that block datacenter IPs (403) stay listed because they work for real users
- **Subtitles preloaded too** — grouped by language, ready immediately

### Mobile & Device Smoothness
- Device-aware HLS buffering: phones/tablets use a short memory-friendly buffer, desktops keep the deep seek-anywhere buffer
- `capLevelToPlayerSize` + a lower starting bandwidth estimate on mobile — no more 4K autoplay on cell data
- Preconnects to TMDB + the stream API warm the first paint

### Reliability
- Dead proxy/CDN origins are remembered per device (localStorage) and skipped automatically — no repeated CORS errors, faster stream start
- Auto-subtitles skip CORS-dead hosts and fall back to a working track
- Server-side MKV liveness cache (10/30 min TTL) makes repeat download-menu opens instant
- VidLink + VixSrc temporarily hidden (upstream 403) — code kept, one flag re-enables

---

## 🚀 v3.0 — What's New

### Flattened Provider Architecture
Every provider is now shown individually in the source list — no more nested "Embeds" playlist. Each provider auto-probes its servers for latency and content validity, picking the fastest stable stream. Dead servers are silently skipped.

### Country Top 10
Automatically detects your country via `api.country.is` → `ipapi.co` → navigator locale and shows the **Top 10 most popular movies & TV shows in your country** on the Discover page. Conflix-style numbered SVG overlays behind each poster.

### Kids Profile
A dedicated Kids mode with content filtering. Activate a Kids profile and all browsing is restricted to kid-safe content only. Includes route guards (`KidsRouteGuard`, `MediaKidsGuard`) that block access to adult-rated media.

### Profile Selection
Choose from multiple avatars (including Conflix-style avatars) via the Profile Select screen. Profiles persist in local storage.

### Smart Audio Tracks
- **Movie/TV**: "🌐 Original" audio by default
- **Anime**: "🇯🇵 Japanese" (original) + dub languages with country flags (🇬🇧 English, 🇪🇸 Spanish, 🇮🇳 Hindi, etc.)
- **Subtitles**: Auto-enabled English by default — just hit play and captions appear

### Auto-Update Notifications
Polls GitHub releases every 6 hours. When a new version drops, you get an in-app notification with the release link.

---

## Active Providers

### Sources (tried in rank order — highest first)

| Source | Rank | Type | Notes |
|--------|------|------|-------|
| **AniKoto** | 1020 | Anime | Dub support (multi-language audio) |
| **AniKai** | 1015 | Anime | Sub streams |
| **Videasy** | 1010 | Movies, TV | |
| **VaPlayer** | 1000 | Movies, TV | |
| **NetMirror** | 990 | Movies, TV | |
| **CastleTV** | 970 | Movies, TV | |
| **OneTouchTV** | 950 | Movies, TV | |
| **ShowBox** | 940 | Movies, TV | |
| **ZXCStreams** | 930 | Movies, TV | |
| **Yamie ❤️** | 920 | **Movies only** | Direct `media.vidrift.in` HLS, built from TMDB id |

**Hidden (code intact, one flag re-enables):** VidLink + VixSrc (upstream 403), StreamFlix, 4KHDHub, DahmerMovies (download-only — MKV sources in the Download menu).

### How Providers Work

1. Each source calls the TMDB-Embed API: `https://stycanine1-tmdb-embed-api.hf.space/api/streams/{provider}/movie/{tmdbId}`
2. Returns multiple server mirrors with quality metadata
3. Every server URL is **latency-probed** in parallel — content-aware validation catches "Wrong IP" HTML errors, 403/429 blocks, and S3 XML denials
4. Working servers ranked by **quality** (4K > 1080 > 720...) then **latency** (fastest wins)
5. User sees **numbered servers** (Server 1, Server 2, ...) and can pick manually
6. If all servers fail → runner automatically tries the **next provider** in the list
7. Error shown only when **every provider** is exhausted
8. Anime providers split sub/dub — dubs appear as Audio track options with flags

### Removed Providers

| Provider | Reason |
|----------|--------|
| **VidLink** | CDN (`bcdnxw.hakunaymatata.com`) geo-blocked (429 on every stream) |
| **VixSrc** | CDN (`vixsrc.to`) geo-blocked (403 on every stream) |
| **Nyxos / MovieBox** | Required self-hosted VPS — removed for frontend-only deployment |
| **Strix / Xylos / Vexis / Morvyn** | Consolidated into the unified TMDB-Embed API |

---

## Features

| Feature | Description |
|---------|-------------|
| **8 Flat Sources** | Zephyr + 7 individual providers, no nested playlists |
| **Server Selection** | Numbered servers per provider — click to see mirrors, not auto-try |
| **Server Failover** | Dead server → next server → next provider → error only at end |
| **Latency Probing** | Real HTTP probe with content validation per stream URL |
| **Multi-Audio Dubs** | Anime: Japanese original + 🇬🇧 🇪🇸 🇫🇷 🇩🇪 🇮🇳 dubs with flags |
| **Auto Subtitles** | English subtitles enabled by default (subtitle store: `enabled: true`, `lastSelectedLanguage: "en"`) |
| **Subtitle Passthrough** | API subtitles forwarded directly to player captions |
| **4K Quality** | Quality detection + ranking: 4K > 1080p > 720p > 480p > 360p |
| **Country Top 10** | `api.country.is` → `ipapi.co` → navigator locale detection chain |
| **Kids Profile** | KidsPage + KidsRouteGuard + MediaKidsGuard for safe browsing |
| **Profile Selection** | AvatarPicker, ConflixAvatar, multiple profile support |
| **Update Notifications** | GitHub release polling every 6 hours |
| **No Ads** | Clean, ad-free streaming |
| **No Sign-Up** | Start watching instantly |
| **PWA Support** | Install as native app on any device |
| **Watch Party** | Sync playback with friends in real-time |
| **Responsive** | Desktop, tablet, and mobile |

---

## Quick Start

```bash
git clone https://github.com/ZETIC7Z/nexus3.0.git
cd nexus3.0
pnpm install
cp example.env .env
# → Fill in TMDB_READ_API_KEY in .env
pnpm run dev
# → http://localhost:5173
```

## Vercel Deployment

1. Push to GitHub
2. Import repo in Vercel
3. Set environment variables from `example.env` in Vercel dashboard
4. Deploy — `vercel.json` handles proxy routing automatically

### Required Vercel Env Vars

| Variable | Value |
|----------|-------|
| `TMDB_READ_API_KEY` | Your TMDB v4 read token (server-side, used by `api/tmdb.js`) |
| `VITE_TMDB_EMBED_URL` | `https://stycanine1-tmdb-embed-api.hf.space` |
| `VITE_APP_DOMAIN` | Your Vercel domain |
| `VITE_NORMAL_ROUTER` | `true` |
| `VITE_PWA_ENABLED` | `true` |
| `VITE_ALLOW_AUTOPLAY` | `true` |
| `VITE_CORS_PROXY_URL` | (optional) Your CORS proxy |
| `VITE_M3U8_PROXY_URL` | (optional) Your M3U8 proxy |

---

## How to Add a New Provider

There are two shapes of provider. Pick the one that matches your upstream.

---

### Recipe A — TMDB-Embed provider (aggregate API)

Use this when the HF aggregate API already serves the provider.

1. **Verify upstream first** (always before writing code):
   ```bash
   curl "https://stycanine1-tmdb-embed-api.hf.space/api/streams/PROVIDER/movie/603"
   ```
   Expect `success: true` + a `streams` array. No data → stop here.

2. **Add one line to the catalog** in `src/providers/embeds/shared.ts`:
   ```ts
   export const NEXUS_PROVIDER_CATALOG: NexusProviderDef[] = [
     ...
     { id: "newprovider", name: "NewProvider", playable: true, rank: 905 },
     ...
   ];
   ```
   - `rank` decides try-order (higher = tried first; range 800–1100).
   - Anime providers add `anime: true`.
   - To hide without deleting code: `playable: false, rank: 0` (exactly how VidLink/VixSrc are parked).

3. **That's it.** `makeEmbedProvider` (same file) auto-generates the provider: API fetching, latency probing with content validation, quality ranking, subtitle passthrough, dub audio tracks for anime. The file-per-provider folders (`embeds/<name>/<name>-provider.ts`) were removed — everything is catalog-driven now.

---

### Recipe B — Direct endpoint provider (the Yamie way)

Use this for a provider that serves streams from its own predictable URL pattern (no aggregate API).

Yamie (movies only): `https://media.vidrift.in/movie_{tmdbId}/vod.m3u8`

1. **Define the URL builder** in `src/providers/embeds/shared.ts`:
   ```ts
   const YAMIE_PROVIDER_ID = "yamie";
   const YAMIE_STREAM_BASE = "https://media.vidrift.in";

   export function buildYamieStreamUrl(tmdbId: string): string {
     return `${YAMIE_STREAM_BASE}/movie_${encodeURIComponent(tmdbId)}/vod.m3u8`;
   }
   ```

2. **Register it movie-only** in `NEXUS_PROVIDER_CATALOG`:
   ```ts
   { id: "yamie", name: "Yamie ❤️", playable: true, moviesOnly: true, rank: 920 },
   ```
   `moviesOnly: true` sets `mediaTypes: ["movie"]` on the provider, which removes it from TV show allow-lists automatically.

3. **Handle it in the scrape path** (`makeEmbedProvider`'s scrape, same file): when `providerId === "yamie"` and the media is a **movie**, return a single item built from `buildYamieStreamUrl(media.tmdbId)` and skip the aggregate API. For TV, return `[]` as a third safety net. The standard probe pipeline then validates the m3u8 — if the file is missing, Yamie is silently absent that session.

4. **Add it to the download API** if it has files worth downloading: `api/downloads.js` → `ALL_PROVIDERS` (and a timeout in `PROVIDER_TIMEOUT_MS` if it's slow).

5. **Test** with the dev video tester (Developer → Video Tester, provider dropdown) and by playing a movie + an episode.

**Rules that keep providers healthy:**
- Never ship a provider that fails `playable` probing — probe-first is why the app stays clean.
- Hide, don't delete: `playable: false, rank: 0` parks a provider with zero code churn.
- Keep per-provider timeouts modest in `api/downloads.js` so one slow backend can't stall the whole downloads payload.

### Troubleshooting

```bash
# Test a provider's API directly
curl "https://stycanine1-tmdb-embed-api.hf.space/api/streams/vidcore/movie/603"

# Test a stream URL (check for 403/429/HTML error pages)
curl -I "https://..."
```

If all streams dead → set `playable: false` in the catalog.
If only some servers dead → the content-aware probe filters them automatically.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS |
| **Player** | hls.js (HLS), native `<video>` (MP4) |
| **State** | Zustand (persisted stores) |
| **Provider Framework** | `@nexus/providers` package |
| **Stream API** | TMDB-Embed HuggingFace Space (`stycanine1-tmdb-embed-api.hf.space`) |
| **Stream Proxy** | `/m3u8-proxy` + `/ts-proxy` on HF Space |
| **Encryption** | Cloudflare Worker (`vidfast.samxerz-zeticuz.workers.dev`) |
| **Metadata** | TMDB API v4 |
| **Subtitles** | OpenSubtitles, VDRK, Natsuki, FebBox, Wyzie |
| **Country Detection** | `api.country.is` → `ipapi.co` → navigator locale |
| **Notifications** | GitHub Releases API (6h polling) |

---

## Project Structure

```
src/
├── providers/
│   ├── nexus-providers-index.ts   ← Registry: all sources (catalog-driven)
│   ├── allowed-providers.ts       ← Show/movie allow-lists (movie-only filtered)
│   ├── provider-health.ts         ← Health probes
│   ├── shared/
│   │   ├── makeProviderContext.ts ← Provider factory (mediaTypes, empty-stream guard)
│   │   └── types.ts
│   └── embeds/
│       └── shared.ts              ← NEXUS_PROVIDER_CATALOG + makeEmbedProvider:
│                                    API fetch, latency probe, quality ranking,
│                                    Yamie direct endpoint, dub/flag audio tracks
├── components/player/
│   ├── display/base.ts            ← hls.js config (device-aware buffering)
│   ├── utils/proxy.ts             ← M3U8 proxy selection + dead-origin memory
│   ├── atoms/settings/Downloads.tsx ← Download Movie / Subtitle views
│   └── hooks/useCaptions.ts       ← Caption auto-select w/ failure memory
├── utils/
│   ├── downloadPreload.ts         ← Warms /api/downloads on Play Now
│   ├── common/originHealth.ts     ← localStorage dead-origin memory
│   └── notifications.ts           ← Update checker + toast notifications
└── stores/player/slices/source.ts ← Source selection + subtitle fallback chain

api/
├── tmdb.js                        ← TMDB metadata proxy (server-side key)
├── downloads.js                   ← MKV/subtitle aggregation + liveness cache
└── stream-proxy.js                ← Same-origin HLS/MP4/sub download proxy

plugins/                           ← Vite dev-server shims for the api/ functions
```

---

## Changelog

### Sep 4, 2026 (v3.2 — evening)
- **Performance overhaul** — first-load JS 5.7 MB → 2.3 MB (lazy locales, language-db split, hls.js off boot path, lazy caption pipeline, PWA precache trim)
- **Personalized greetings** — timezone-aware + nickname for signed-in users (useUserDisplayName)
- **Top 10 flag** — globe icon replaced with detected country flag
- **Popup queue** — maintenance + update popups share one slot, 15 s auto-close, in/out animations
- **Notification 30-day auto-delete** — store prune + RSS feed filter
- **In-app changelog v3.2** + automatic notification posting made a mandatory routine

### Sep 5, 2026 (v3.2 — final polish)
- **Tip Jar** — the maintenance bar opens a real donation modal with Wise, PayPal, GoTyme (PH), GCash, Stripe (Buy Me a Coffee) and Binance; the menu icon glows like the Discover button
- **Device security** — detects the real device brand/model, OS and browser per login; Account → Devices lists each session with time/date; ✕ removes a device (with confirm) and logs it out
- **Nicknames** — sign-up field is now “Nickname”; greetings & profile show your nickname, never the device name
- **Popup duration** — maintenance & update popups stay 15s before auto-fading (was 3.5s)
- **Announcement bar** — cleaner text, original compact size preserved

### Sep 4, 2026
- **Yamie provider** — movie-only direct HLS source (`media.vidrift.in`), probe-gated
- **Preloaded downloads** — MKV/subtitle lists load with playback, menu opens instantly
- **MKV-only downloads** — original provider URLs, liveness-checked, dead links dropped
- **Server-side liveness cache** (10/30 min TTL) + 60s response cache on `/api/downloads`
- **Mobile smoothness** — device-aware HLS buffers, `capLevelToPlayerSize`, lower mobile ABR start, preconnects
- **Dead-origin memory** — failed proxy hosts remembered per device and skipped
- **Cleaner console** — metrics 404s, IMDb enrichment errors, subtitle retry storms silenced
- **Env cleanup** — removed unused `VITE_MOVIEBOX_API_URL` / `VITE_VIDSRC_API_URL` + dead Vercel rewrite
- **Docs** — provider recipes (aggregate + direct-endpoint), agent guide added



### v3.0 (Aug 2026)
- **Flattened providers** — 8 individual sources, no Embeds wrapper
- **Server selection** — numbered servers per provider with manual pick
- **Server failover** — auto-try next server, next provider, error only at end
- **Latency probing** — content-aware HTTP probe per stream URL
- **Audio tracks** — 🌐 Original for movies, 🇯🇵 Japanese + flags for anime dubs
- **Auto subtitles** — English enabled by default
- **Country Top 10** — `api.country.is` → `ipapi.co` → navigator locale detection
- **Kids Profile** — KidsPage, KidsRouteGuard, MediaKidsGuard
- **Profile Selection** — AvatarPicker, ConflixAvatar, multi-profile support
- **Dead providers removed** — VidLink (429), VixSrc (403), Nyxos/MovieBox, Strix, Xylos, Vexis, Morvyn
- **Subtitle passthrough** — API captions forwarded through server embeds
- **4K quality detection** — quality normalization from stream metadata
- **GitHub backup** — `backup-providers` branch with pre-v3.0 state

---

## Developer

**ZETICUZ** — [zeticuz.online](https://zeticuz.online)

---

<p align="center">
  <sub>© 2025-2026 ZETICUZ · All Rights Reserved</sub>
</p>

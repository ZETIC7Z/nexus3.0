# NEXUS 3.0

<p align="center">
  <img src="/public/pwa-logo.svg" alt="NEXUS Banner" width="200" />
</p>

<p align="center">
  <b>NEXUS</b> — Free Movies, TV Shows & Anime Streaming<br>
  <i>No ads. No sign-up. Just pure entertainment.</i>
</p>

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

| Source | Rank | Backend | Type |
|--------|------|---------|------|
| **Zephyr** | 1330 | CF Worker + vidfast.vc encryption | Movies, TV |
| **NoTorrent** | 970 | Stremio addon aggregator (up to 11 mirrors) | Movies, TV |
| **VidCore** | 960 | Supreme/Prime servers via moon CDN | Movies, TV |
| **Videasy** | 950 | — | Movies, TV |
| **VidUp** | 940 | Moon CDN | Movies, TV |
| **VidFast** | 930 | — | Movies, TV |
| **AniKoto** | 900 | Dub support (multi-language audio tracks) | Anime |
| **AniKai** | 890 | Sub streams | Anime |

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
# → Fill in VITE_TMDB_READ_API_KEY in .env
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
| `VITE_TMDB_READ_API_KEY` | Your TMDB v4 read token |
| `VITE_TMDB_EMBED_URL` | `https://stycanine1-tmdb-embed-api.hf.space` |
| `VITE_APP_DOMAIN` | Your Vercel domain |
| `VITE_NORMAL_ROUTER` | `true` |
| `VITE_PWA_ENABLED` | `true` |
| `VITE_ALLOW_AUTOPLAY` | `true` |
| `VITE_CORS_PROXY_URL` | (optional) Your CORS proxy |
| `VITE_M3U8_PROXY_URL` | (optional) Your M3U8 proxy |

---

## How to Add a New Provider

### Adding a TMDB-Embed Provider

1. **Verify** the provider exists:
   ```bash
   curl "https://stycanine1-tmdb-embed-api.hf.space/api/streams/{PROVIDER}/movie/603"
   ```

2. **Create** the provider file in `src/providers/embeds/{provider}/{provider}-provider.ts`:
   ```ts
   import { makeEmbedProvider } from "../shared";

   export const newProvider = makeEmbedProvider({
     id: "nexus-embed-newprovider",
     name: "NewProvider",
     rank: 920,
     backend: "newprovider",
     anime: false,
   });
   ```

3. **Register** in `src/providers/nexus-providers-index.ts`:
   - Add `makeStandaloneSource(...)` for a flattened source (or use `makeEmbedProvider` for sub-embeds)
   - Add to `nexusCustomProviders` array

4. The provider automatically gets:
   - API fetching (`buildEmbedUrl` generates the endpoint)
   - Latency probing with content-aware validation
   - Quality ranking (4K → 1080 → 720 → 480 → 360)
   - Best-server selection
   - Subtitle passthrough
   - Audio tracks with flags (anime: Japanese + dubs)

### Troubleshooting

```bash
# Test a provider's API directly
curl "https://stycanine1-tmdb-embed-api.hf.space/api/streams/vidcore/movie/603"

# Test a stream URL (check for 403/429/HTML error pages)
curl -I "https://..."
```

If all streams dead → set `disabled: true` or remove from array.
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
│   ├── nexus-providers-index.ts   ← Registry: all 8 sources
│   ├── allowed-providers.ts       ← Anime filtering (AniKoto/AniKai hidden for movies)
│   ├── provider-health.ts         ← Health probes
│   ├── shared/
│   │   ├── makeProviderContext.ts ← Provider factory (stream: undefined on empty)
│   │   └── types.ts
│   ├── zephyr/
│   │   └── provider.ts            ← Zephyr (CF Worker encryption)
│   └── embeds/
│       ├── shared.ts              ← API fetch, latency probe, quality, dubs, flags
│       ├── notorrent/
│       ├── vidcore/
│       ├── videasy/
│       ├── vidup/
│       ├── vidfast/
│       ├── anikoto/               ← Anime with dub support
│       └── anikai/                ← Anime sub-only
├── pages/
│   ├── Kids.tsx                   ← Kids mode page
│   ├── ProfileSelect.tsx          ← Profile picker
│   ├── Apps.tsx                   ← Apps page
│   └── discover/
│       └── components/
│           └── CountryPicksCarousel.tsx  ← Top 10 in your country
├── stores/
│   ├── profiles/                  ← Multi-profile state
│   ├── ads/                       ← Ad state
│   └── subtitles/                 ← Enabled: true, language: en by default
├── components/
│   ├── AvatarPicker.tsx           ← Avatar selection
│   └── ConflixAvatar.tsx          ← Conflix-style avatar component
└── utils/
    ├── player/
    │   └── audioTracks.ts         ← Audio track store + switchAudioTrack
    ├── locale/
    │   ├── detectRegion.tsx        ← Proxy region (ipapi.co)
    │   ├── userRegion.ts          ← User country (navigator/timezone)
    │   └── countryNames.ts        ← Country code → name map
    └── notifications.ts           ← Update checker + toast notifications
```

---

## Changelog

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

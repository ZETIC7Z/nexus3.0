# NEXUS 3.0

<p align="center">
  <img src="/public/pwa-logo.svg" alt="NEXUS Banner" width="200" />
</p>

<p align="center">
  <b>NEXUS</b> — Free Movies, TV Shows & Anime Streaming<br>
  <i>No ads. No sign-up. Just pure entertainment.</i>
</p>

---

## Active Providers

### Sources (tried in order by the auto-scrape runner)

| Source | Priority | Backend | Type |
|--------|----------|---------|------|
| **Zephyr 🔥** | 1330 | CF Worker + vidfast.vc encryption | Movies, TV |
| **Embeds ⚡** | 1320 | TMDB-Embed HF Space (7 providers inside) | Movies, TV, Anime |

### Embeds ⚡ Providers (auto best-server selection per provider)

| Provider | Rank | Type | Notes |
|----------|------|------|-------|
| **NoTorrent** | 970 | Movies, TV | Stremio addon aggregator, up to 11 mirrors |
| **VidCore** | 960 | Movies, TV | Supreme/Prime servers via moon CDN |
| **Videasy** | 950 | Movies, TV | — |
| **VidUp** | 940 | Movies, TV | Moon CDN works for series |
| **VidFast** | 930 | Movies, TV | — |
| **AniKoto** | 900 | Anime | Dub support (multi-language audio tracks) |
| **AniKai** | 890 | Anime | Sub streams |

### How Embeds ⚡ Works

1. The "Embeds ⚡" source builds API URLs for each provider based on the current media (movie/TV/anime)
2. The movie-web runner tries each embed in **rank order** (highest first)
3. Each embed calls its TMDB-Embed API endpoint, then **probes every returned server URL** for real latency + content validity
4. Dead servers (geo-blocked CDNs, "Wrong IP" HTML pages, 403/429) are filtered out
5. Working servers are ranked by **quality tier** then **latency** — fastest stable stream wins
6. Anime providers separate sub/dub streams — dubs become selectable Audio tracks
7. All stream URLs come **pre-proxied** through the HF space (`/m3u8-proxy` and `/ts-proxy`) — the player plays them directly, no additional wrapping needed

### Removed Providers

| Provider | Reason |
|----------|--------|
| **VidLink** | CDN (`bcdnxw.hakunaymatata.com`) consistently geo-blocked through HF proxy (429 on every stream) |
| **VixSrc** | CDN (`vixsrc.to`) consistently geo-blocked through HF proxy (403 on every stream) |
| **Nyxos (MovieBox)** | Self-hosted VPS — removed to keep frontend-only deployment |

## Features

- **8 Total Sources** — Zephyr + 7 Embeds providers with automatic failover
- **Smart Server Selection** — Real latency probing + content validation per stream
- **Multi-Audio Dubs** — Anime supports original + dub language switching
- **4K Quality Detection** — Quality normalization from stream metadata
- **Subtitle Passthrough** — API subtitles forwarded to player captions
- **No Ads** — Clean, ad-free streaming experience
- **No Sign-Up Required** — Start watching instantly
- **PWA Support** — Install as a native app on any device
- **Watch Party** — Sync playback with friends in real-time
- **Responsive Design** — Works on desktop, tablet, and mobile

## Quick Start

```bash
# Clone the repository
git clone https://github.com/ZETIC7Z/nexus3.0.git
cd nexus3.0

# Install dependencies
pnpm install

# Copy and fill in environment variables
cp example.env .env
# → Fill in TMDB_READ_API_KEY in .env

# Start development server
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
| `TMDB_READ_API_KEY` | Your TMDB v4 read token |
| `VITE_TMDB_EMBED_URL` | `https://stycanine1-tmdb-embed-api.hf.space` |
| `VITE_APP_DOMAIN` | Your Vercel domain |
| `VITE_NORMAL_ROUTER` | `true` |
| `VITE_PWA_ENABLED` | `true` |
| `VITE_ALLOW_AUTOPLAY` | `true` |

## How to Add a New Provider

### Adding a TMDB-Embed provider

1. Verify the provider exists on the TMDB-Embed API:
   ```bash
   curl "https://stycanine1-tmdb-embed-api.hf.space/api/streams/{PROVIDER}/movie/603"
   ```

2. Create a new folder: `src/providers/embeds/{provider}/`

3. Create `{provider}-provider.ts`:
   ```ts
   import { makeEmbedProvider } from "../shared";

   export const newProvider = makeEmbedProvider({
     id: "nexus-embed-newprovider",
     name: "NewProvider 🆕",
     rank: 920,       // lower = tried later (Zephyr=1330, NoTorrent=970)
     backend: "newprovider",
     anime: false,    // true for anime-only providers
   });
   ```

4. Register in `src/providers/embeds/index.ts`:
   - Import the provider
   - Add to `nexusEmbedProviders` array (ordered by rank, highest first)
   - Add to the exports

5. The provider will automatically get:
   - API fetching (`buildEmbedUrl` generates the endpoint)
   - Latency probing (content-aware — catches "Wrong IP" HTML errors)
   - Quality ranking
   - Best-server selection
   - Subtitle passthrough

### Troubleshooting a Dead Provider

If a provider stops working:
1. Test the API directly: `curl "https://stycanine1-tmdb-embed-api.hf.space/api/streams/{provider}/movie/603"`
2. Check the stream URLs: probe each URL — look for 403, 429, or "Wrong IP" HTML responses
3. If all streams are dead → set `disabled: true` or remove from array
4. If only some servers are dead → the content-aware probe handles this automatically

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS |
| **Player** | hls.js (HLS), native `<video>` (MP4) |
| **State** | Zustand |
| **Providers** | Custom scrapers + `@nexus/providers` package |
| **Backend API** | Vercel Serverless Functions (`api/`) |
| **Stream Proxy** | HuggingFace Space (`/m3u8-proxy`, `/ts-proxy`) |
| **Encryption** | Cloudflare Worker (Zephyr's `vidfast.samxerz-zeticuz.workers.dev`) |
| **Metadata** | TMDB API v4 |
| **Subtitles** | OpenSubtitles, VDRK, Natsuki, FebBox, Wyzie |

## Project Structure

```
src/providers/
├── nexus-providers-index.ts   ← Registry: Zephyr + Embeds ⚡
├── allowed-providers.ts       ← All sources allowed for all media
├── provider-health.ts         ← Health probes (WF worker + HF root)
├── shared/                    ← makeProviderContext, types
├── zephyr/
│   └── provider.ts            ← Zephyr 🔥 (CF Worker encryption)
└── embeds/
    ├── index.ts               ← "Embeds ⚡" source (anime-aware fan-out)
    ├── shared.ts              ← API fetch, latency probe, quality ranking
    ├── notorrent/  vidcore/   videasy/  vidup/  vidfast/
    └── anikoto/    anikai/    ← Anime with dub support
```

## Developer

**ZETICUZ** — [zeticuz.online](https://zeticuz.online)

---

<p align="center">
  <sub>© 2025-2026 ZETICUZ · All Rights Reserved</sub>
</p>

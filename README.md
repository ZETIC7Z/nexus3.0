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

| Provider | Status | Type |
|----------|--------|------|
| **Nyxos ⚡** (MovieBox) | ✅ | Movies, TV, Anime — MP4 + Multi-Audio Dubs |
| **Zephyr 🔥** (VidFast 2) | ✅ | Movies, TV — Cloudflare Worker Encryption |
| **Astrix 👾** (NoTorrent) | ✅ | Movies, TV — Stremio Addon, 8-11 streams |
| **Xylos 😈** (VidUp) | ✅ | Movies, TV — vidup.to |
| **Setzu 💀** (VidFast) | ✅ | Movies, TV — vidfast.vc |
| **Vexis 💣** (AniKai) | ✅ | Anime — anikai.watch |
| **Morvyn 👺** (AniKoto) | ✅ | Anime — anikototv.to, Dub Support |

## Features

- **7 Active Providers** — Multi-source streaming with automatic failover
- **Multi-Audio Dubs** — Switch languages on supported content via the player Audio menu
- **No Ads** — Clean, ad-free streaming experience
- **No Sign-Up Required** — Start watching instantly
- **PWA Support** — Install as a native app on any device
- **Subtitle Support** — External subtitles from OpenSubtitles, VDRK, and built-in tracks
- **Watch Party** — Sync playback with friends in real-time
- **Responsive Design** — Works on desktop, tablet, and mobile

## Quick Start

```bash
# Clone the repository
git clone https://github.com/ZETIC7Z/nexus3.0.git

# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Build for production
pnpm run build
```

## Vercel Deployment

This project is configured for one-click Vercel deployment:

1. Fork or clone this repository
2. Connect to Vercel
3. Set required environment variables (see `example.env`)
4. Deploy — `vercel.json` rewrites handle proxy routing automatically

## Environment Variables

See `example.env` for the full list. Key variables:

| Variable | Purpose |
|----------|---------|
| `MOVIEBOX_API_URL` | MovieBox VPS backend URL |
| `VITE_TMDB_EMBED_URL` | TMDB Embed API (HF Space) |
| `TMDB_READ_API_KEY` | TMDB API v4 token |
| `VITE_CORS_PROXY_URL` | CORS proxy for external requests |
| `VITE_M3U8_PROXY_URL` | M3U8/HLS stream proxy |

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Backend:** Vercel Serverless Functions + Cloudflare Workers
- **APIs:** TMDB, MovieBox, HuggingFace Spaces

## Developer

**ZETICUZ** — [zeticuz.online](https://zeticuz.online)

---

<p align="center">
  <sub>© 2025-2026 ZETICUZ · All Rights Reserved</sub>
</p>

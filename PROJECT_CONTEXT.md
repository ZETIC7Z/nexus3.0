# NEXUS — Project Context (read this first)

> This file is written for AI coding agents (Antigravity, Claude CLI, Cursor,
> Copilot, etc.). It is the single source of truth for what this project is,
> how it's built, how streaming works, and how to fix it. Read it fully before
> making changes.

---

## 1. What NEXUS is

NEXUS is a self-hostable movie / TV / anime streaming web app. It is a **rebrand
of P-Stream** (`xp-technologies-dev/p-stream`, itself a fork of `movie-web`).
Everything visible — name, logo, favicon, meta/OG tags, player logo, footer — is
NEXUS. There must be **zero** "P-Stream", "Z-Stream", "pstream", "zstream"
strings anywhere in `src/`, `index.html`, or `manifest.json`.

- Framework: React 18 + TypeScript + Vite
- Styling: Tailwind CSS
- State: Zustand
- Player: custom (movie-web player) + HLS.js
- Metadata: TMDB (The Movie Database)
- PWA: vite-plugin-pwa

Brand logo lives at `public/pwa-logo.svg` and is used for favicon, header, player
overlay, and PWA icon.

---

## 2. How streaming works (the important part)

NEXUS does not host video. It **scrapes third-party sources** through a set of
"providers." Each provider knows how to turn a TMDB movie/show into a playable
stream URL.

There are three kinds of providers in this project:

### A. enc-dec.app providers (VidLink, Videasy, VidFast, Hexa, yFlix)
These target public streaming sites whose APIs return **encrypted** payloads.
`https://enc-dec.app` is a hosted encryption/decryption toolkit that turns those
encrypted strings into usable JSON (see `BACKENDS.md`). Each provider:
1. builds the site's API request (encrypting IDs via enc-dec when needed),
2. fetches the (encrypted) response,
3. decrypts it via enc-dec,
4. returns a stream URL.

### B. NEXUS TMDB-Embed backend (HuggingFace)
`VITE_TMDB_EMBED_API_URL` → a HuggingFace Space running the TMDB-Embed-API.
Given a TMDB id (+ imdb id for speed), it scrapes multiple hosts server-side and
returns verified stream URLs. This is the **highest-priority** provider
(`TMdb-provider.ts`, rank 900).

### C. MovieBox VPS backend (self-hosted)
`VITE_MOVIEBOX_API_URL` → a FastAPI service (`walterwhite-69/Moviebox-API`)
deployed on the user's VPS. MovieBox uses its **own slug system, not TMDB ids**,
and importantly provides **multi-language dubbed audio** (English, Tagalog,
Hindi, etc.). See section 4.

All providers implement the same interface and return the same stream shape, so
the player treats them identically. Only **healthy** providers are shown — see
section 5.

---

## 3. Provider interface (contract)

Every provider is created with `makeProviderContext({ id, name, rank, disabled,
scrape })`. `scrape(ctx)` receives a `ScrapeContext` whose `ctx.media` has:

- `media.type`: `"movie" | "show"`
- `media.title`: string
- `media.releaseYear`: number
- `media.tmdbId`: string
- `media.imdbId`: string | null
- for shows: `media.season.number`, `media.episode.number`

`scrape` returns:

```ts
{
  embeds: [],
  stream: {
    id: string,
    type: "mp4" | "hls",
    playlist: string,               // the stream URL
    flags: [flags.CORS_ALLOWED],    // proxy/cors compatibility
    captions: Caption[],            // subtitles
    qualities?: Record<string, { type: "mp4"; url: string }>,
    audioTracks?: AudioTrack[],     // NEXUS EXTENSION (dub languages) — MovieBox
  }
}
```

`audioTracks` is a NEXUS-specific extension used only for multi-dub sources.

---

## 4. MovieBox specifics (multi-audio dubs, MP4 only)

MovieBox API endpoints (all on `VITE_MOVIEBOX_API_URL`):

| Endpoint | Purpose |
|---|---|
| `GET /search?q={title}` | search → `movies[]` with `slug` (detailPath) |
| `GET /detail/{slug}` | metadata incl. `metadata.dubs[]` + `streams.mp4[]` |
| `GET /api/stream/{subjectId}?detail_path={slug}&se={s}&ep={e}` | `sources[]` = `{resolution, format, url, ...}` |

Because MovieBox is slug-based, `moviebox-provider.ts`:
1. searches by `media.title`,
2. picks the best match by normalized title + year (min confidence gate so we
   never play the wrong title),
3. resolves `subjectId` and `dubs[]` from `/detail/{slug}`,
4. fetches `/api/stream/...`,
5. **keeps MP4 only** — DASH/HLS are dropped because the player has no DASH
   support (hard user requirement),
6. builds `audioTracks[]`: "Original" (default) + one entry per dub language.

**Audio switching**: each dub is a separate muxed MP4. `audioTracks.ts` swaps
`video.src` on selection and restores `currentTime` + play state, so choosing
"Tagalog" resumes instantly in Tagalog. UI is `AudioTrackSelector.tsx` in the
player settings menu.

The dub audio URLs are discovered via three fallback strategies (explicit
`raw.audioTrackList`, per-source `lang` tags, or per-language `?lang=` re-query).
**If your live VPS returns audio in a different field, adjust `scrapeMovieBox`
strategies A/B/C accordingly — this is the one spot most likely to need a tweak
after testing against the real backend.**

---

## 5. "Only working sources" requirement

`provider-health.ts` probes each provider's backend in parallel (cheap GET, no
full scrape) and caches health for 5 minutes. `getLiveNexusProviders()` returns
only providers whose backend responded. The source-select list and the loading
spinner must render **only** this healthy set, so dead providers never appear.

Wire it where the app builds its provider/source list (search for the scrape
hook, e.g. `useProviderScrape` / `useEmbedScraping` / the source selector). See
`PLAYER_INTEGRATION.md` for the exact integration points.

---

## 6. CORS

- The MovieBox VPS already sends `Access-Control-Allow-Origin: *`.
- Stream CDNs may still restrict cross-origin requests. MP4 usually plays direct
  via `<video src>` (no CORS needed for simple playback). HLS via hls.js **does**
  need CORS → route through `VITE_M3U8_PROXY_URL`.
- Providers set `flags.CORS_ALLOWED`; the player's fetcher applies the proxy per
  the user's proxy setup. If a stream fails with a CORS error, the fix is almost
  always "configure a working proxy in `.env`", not a code change.

---

## 7. Environment variables

See `.env` (copy to project root). Required: `VITE_TMDB_READ_API_KEY`,
`VITE_MOVIEBOX_API_URL`. Strongly recommended: `VITE_CORS_PROXY_URL`,
`VITE_M3U8_PROXY_URL`. Full list + notes are in `.env`.

---

## 8. Where things live

```
project root/
├── index.html                     ← NEXUS branded (title, favicon, OG)
├── manifest.json                  ← NEXUS PWA
├── .env                           ← secrets/config (fill in)
├── public/pwa-logo.svg            ← NEXUS logo (favicon/header/player)
├── src/
│   ├── providers/
│   │   ├── TMdb-provider.ts        ← HuggingFace backend (rank 900)
│   │   ├── vidlink-provider.ts     ← enc-dec.app
│   │   ├── videasy-provider.ts     ← enc-dec.app
│   │   ├── vidfast-provider.ts     ← enc-dec.app
│   │   ├── hexa-provider.ts        ← enc-dec.app
│   │   ├── yflix-provider.ts       ← enc-dec.app
│   │   ├── moviebox-provider.ts    ← MovieBox VPS (MP4 + dubs)
│   │   ├── provider-health.ts      ← probe: only-working sources
│   │   └── nexus-providers-index.ts← registry + getLiveNexusProviders()
│   ├── utils/player/audioTracks.ts ← dub audio store + switcher
│   ├── utils/notifications.ts      ← auto-update + status notifications
│   ├── hooks/useNotifications.ts   ← notification hook
│   └── components/player/atoms/settings/AudioTrackSelector.tsx
└── docs (this folder)
```

---

## 9. Golden rules for agents

1. Never reintroduce P-Stream/Z-Stream branding.
2. Never show a dead provider in the UI — always go through
   `getLiveNexusProviders()`.
3. MovieBox = MP4 only. Never surface DASH.
4. Keep every provider's return shape identical (section 3).
5. Original audio is always the default track; dubs are opt-in.
6. Secrets live in `.env` only. Never hardcode keys/URLs in `src/`.
7. If playback fails: check (a) `.env` proxy config, (b) provider health,
   (c) the MovieBox audio-field strategy — in that order.

# AGENTS.md — Instructions for AI Coding Agents

You are working on **NEXUS**, a self-hosted streaming web app (a rebrand of
P-Stream / movie-web). Read `docs/PROJECT_CONTEXT.md` and `docs/BACKENDS.md`
before editing. This file is the short version of the rules.

## Project in one line
React + TS + Vite streaming app; scrapes third-party sources via "providers";
metadata from TMDB; fully rebranded as NEXUS.

## Non-negotiable rules
1. **No P-Stream/Z-Stream branding** anywhere in `src/`, `index.html`,
   `manifest.json`. Run `grep -rin "p-stream\|z-stream\|pstream\|zstream" src/`
   and fix any hits. Brand logo = `public/pwa-logo.svg`.
2. **Only working sources are shown.** Build source lists and the loading
   spinner from `getLiveNexusProviders()` (in
   `src/providers/nexus-providers-index.ts`). Dead providers must never appear.
3. **MovieBox is MP4-only.** Drop DASH/HLS from MovieBox. Other providers may use
   HLS.
4. **Uniform provider contract.** Every provider returns
   `{ embeds: [], stream: { id, type, playlist, flags, captions, qualities?, audioTracks? } }`.
5. **Original audio is default**; dub languages are opt-in via the player Audio
   menu (`AudioTrackSelector.tsx` + `audioTracks.ts`).
6. **Secrets only in `.env`.** Never hardcode TMDB tokens, VPS URLs, or proxies
   in source. Env vars are `VITE_`-prefixed.

## Key files
- `src/providers/moviebox-provider.ts` — MovieBox VPS (search→detail→stream,
  MP4 only, multi-audio dubs).
- `src/providers/provider-health.ts` — probe; "only working sources".
- `src/providers/nexus-providers-index.ts` — registry + `getLiveNexusProviders`.
- `src/utils/player/audioTracks.ts` — dub audio store + `switchAudioTrack`.
- `src/components/player/atoms/settings/AudioTrackSelector.tsx` — Audio menu.
- `src/utils/notifications.ts` — auto-update + status notifications.

## Backends
- **enc-dec.app** — decryption toolkit for VidLink/Videasy/VidFast/Hexa/yFlix.
- **TMDB-Embed (HuggingFace)** — `VITE_TMDB_EMBED_API_URL`, provider rank 900.
- **MovieBox (VPS)** — `VITE_MOVIEBOX_API_URL`, FastAPI, slug-based, dubs.

## When streams don't play (debug order)
1. `.env` correct? (TMDB v4 token, MovieBox URL reachable, proxies set)
2. Provider health — is the backend up? (`getHealthSnapshot()`)
3. MovieBox dubs missing → inspect `/api/stream` `raw` JSON, adjust the audio
   strategy (A/B/C) in `moviebox-provider.ts` (see `BACKENDS.md` §3.4).
4. CORS error → configure `VITE_M3U8_PROXY_URL` / `VITE_CORS_PROXY_URL`.

## Integration work (inside the cloned repo)
`docs/PLAYER_INTEGRATION.md` tells you what to search for and how to wire:
provider registration, the health filter on the source list, feeding
`audioTracks` into the store, and adding the Audio menu.

## Commands
```bash
pnpm install
pnpm run dev       # http://localhost:5173
pnpm run build     # dist/
pnpm run preview   # http://localhost:4173
pnpm run lint
```

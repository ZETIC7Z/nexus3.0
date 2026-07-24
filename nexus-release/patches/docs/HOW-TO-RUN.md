# NEXUS — How to Run

Complete, copy-paste instructions to get NEXUS running locally and play a movie.

---

## Prerequisites

- **Node.js 18+** — https://nodejs.org (LTS)
- **pnpm** — `npm install -g pnpm` (preferred; npm works too)
- **Git** — https://git-scm.com
- A **TMDB v4 read token** — https://www.themoviedb.org/settings/api
- Your **MovieBox VPS URL** (where you deployed `walterwhite-69/Moviebox-API`)

---

## Option A — Automatic (Windows)

1. Extract this zip.
2. Run **`setup-nexus.bat`** (double-click) or **`setup-nexus.ps1`**
   (right-click → Run with PowerShell).
3. It clones P-Stream into `C:\Users\reah.m.e.camingawan\Music`, applies all
   NEXUS patches (branding, providers, notifications, audio, `.env`), installs
   dependencies, and starts the dev server.
4. **Before it can stream**, open `.env` in the project root and fill in:
   - `VITE_TMDB_READ_API_KEY`
   - `VITE_MOVIEBOX_API_URL`
   - (recommended) `VITE_CORS_PROXY_URL`, `VITE_M3U8_PROXY_URL`
   Then restart: `pnpm run dev`.
5. Open **http://localhost:5173**.

---

## Option B — Manual (any OS)

```bash
# 1. Clone P-Stream as the base
git clone --depth=1 -b production https://github.com/xp-technologies-dev/p-stream.git nexus
cd nexus

# 2. Copy NEXUS patch files (adjust the path to where you extracted the zip)
P=/path/to/NEXUS-setup/patches

cp "$P/index.html"    ./index.html
cp "$P/manifest.json" ./manifest.json
cp "$P/.env"          ./.env
cp "$P/pwa-logo.svg"  ./public/pwa-logo.svg
cp "$P/pwa-logo.svg"  ./public/favicon.ico

mkdir -p src/providers src/utils/player src/hooks src/components/player/atoms/settings
cp "$P/providers/"*.ts                     src/providers/
cp "$P/notifications.ts"                   src/utils/notifications.ts
cp "$P/useNotifications.ts"                src/hooks/useNotifications.ts
cp "$P/player/audioTracks.ts"              src/utils/player/audioTracks.ts
cp "$P/player/AudioTrackSelector.tsx"      src/components/player/atoms/settings/AudioTrackSelector.tsx

# 3. Remove leftover P-Stream icons
rm -f public/android-chrome-*.png public/apple-touch-icon.png \
      public/favicon-16x16.png public/favicon-32x32.png \
      public/embed-preview.png public/mstile-*.png public/browserconfig.xml

# 4. Global rebrand (P-Stream/Z-Stream → NEXUS)
node "$P/rebrand.mjs"

# 5. Fill in .env  (TMDB token + MovieBox VPS URL are required)
#    then install and run:
pnpm install
pnpm run dev
```

Then do the integration steps in `PLAYER_INTEGRATION.md` (register providers,
wire the health probe, add the audio menu). Those touch existing P-Stream files
so they can't be blind-copied — the guide tells you exactly what to search for.

Open **http://localhost:5173**.

---

## First playback test

1. Search for a popular movie (e.g. "Avengers Endgame").
2. Open it → hit play → the source picker should show **only working** providers.
3. Highest-priority NEXUS TMdb source is tried first; if it fails, the next live
   provider is used automatically.
4. For a MovieBox title with dubs, open player settings → **Audio** → pick a
   language (e.g. Tagalog). It should resume instantly in that language.

If nothing plays:
- Check `.env` — is `VITE_TMDB_READ_API_KEY` a valid **v4** token?
- Is `VITE_MOVIEBOX_API_URL` reachable? Open it in a browser — it returns the
  endpoint list.
- CORS error in console? Configure `VITE_M3U8_PROXY_URL` / `VITE_CORS_PROXY_URL`.
- See `TROUBLESHOOTING.md`.

---

## Production build

```bash
pnpm run build      # outputs to dist/
pnpm run preview    # serve the production build on http://localhost:4173
```

---

## Verify zero P-Stream references

```bash
grep -rin "p-stream\|z-stream\|pstream\|zstream" src/ index.html manifest.json
# should return nothing
```

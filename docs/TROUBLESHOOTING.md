# NEXUS — Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Site loads but no video plays | TMDB token missing/invalid | `.env` → `VITE_TMDB_READ_API_KEY` must be the **v4** read token (long `eyJ...`), not the v3 key. Restart dev server. |
| A provider never shows in the source list | Health probe marked it dead | Expected behaviour — dead sources are hidden. Check `getHealthSnapshot()` in console; verify the backend URL is reachable. |
| MovieBox never appears | VPS unreachable / wrong URL | Open `VITE_MOVIEBOX_API_URL` in a browser — it should return the endpoint JSON. Check trailing slash is removed. |
| MovieBox plays, but no dub/audio options | Audio field mismatch in API response | Inspect `GET /api/stream/{id}?detail_path={slug}` JSON, find where per-language URLs live, update strategy A/B/C in `moviebox-provider.ts`. See `BACKENDS.md` §3.4. |
| Picked Tagalog but audio didn't change | `getVideoEl` returns wrong element | In the Audio menu wiring, pass the player's real `videoRef.current`, not a generic `querySelector`. See `PLAYER_INTEGRATION.md` §4. |
| Console: CORS / blocked by CORS policy | Stream CDN blocks cross-origin | Set `VITE_M3U8_PROXY_URL` and `VITE_CORS_PROXY_URL` to a working proxy (deploy `xp-technologies-dev/simple-proxy`). |
| Only DASH available error | Title has no MP4 on MovieBox | Expected; another provider covers it. MovieBox is MP4-only by design. |
| First TMdb source is very slow | HuggingFace Space cold start | Normal on first hit; retry logic handles it. Keep the space warm or lower its rank. |
| `pnpm install` fails | Node too old / registry issue | Use Node 18+. Try `pnpm install --no-frozen-lockfile`. |
| Still see "P-Stream" somewhere | rebrand missed a file | `grep -rin "p-stream\|z-stream\|pstream\|zstream" src/ index.html manifest.json` then fix. |
| PWA installs with wrong name/icon | stale service worker | Uninstall PWA, clear site data, rebuild. Confirm `manifest.json` + `public/pwa-logo.svg`. |
| Build fails with TS errors on new files | import path mismatch | The patch files assume `@/` = `src/`. Adjust import paths if your alias differs (check `tsconfig.json` / `vite.config`). |

## Fast diagnostics

```js
// In the browser console (dev):
// 1. Which backends are alive?
import("/src/providers/provider-health.ts").then(m => console.log(m.getHealthSnapshot()));

// 2. Is MovieBox reachable? (replace with your URL)
fetch(import.meta.env.VITE_MOVIEBOX_API_URL + "/").then(r => r.json()).then(console.log);

// 3. Raw MovieBox stream for a slug (inspect audio fields):
fetch(`${import.meta.env.VITE_MOVIEBOX_API_URL}/api/stream/<subjectId>?detail_path=<slug>`)
  .then(r => r.json()).then(console.log);
```

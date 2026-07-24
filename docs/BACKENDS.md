# NEXUS — Backends Deep Dive

How the two self-hosted/external backends work, how NEXUS talks to them, and how
to deploy / debug each. Read alongside `PROJECT_CONTEXT.md`.

---

## 1. enc-dec.app (shared decryption toolkit)

`https://enc-dec.app` is a hosted API that encrypts/decrypts the payloads used by
several streaming sites. NEXUS's VidLink/Videasy/VidFast/Hexa/yFlix providers use
it so they don't have to reimplement each site's rotating crypto.

Relevant endpoints (confirmed live):

| Provider | enc-dec endpoints used |
|---|---|
| VidLink | `GET /api/enc-vidlink?text=<tmdbId>` |
| Videasy | `POST /api/dec-videasy` |
| VidFast | `GET /api/enc-vidfast?text=<data>` |
| Hexa | `GET /api/enc-hexa` (challenge token) + `POST /api/dec-hexa` |
| yFlix | `GET /db/flix/find?tmdb_id=` + `enc-movies-flix` + `POST /dec-movies-flix` |

Notes:
- Rate limit ≈ 40 req/s.
- These are third-party sites; when one site changes its crypto, enc-dec updates
  server-side and the provider keeps working with no code change.
- If a provider suddenly fails, check enc-dec's status page and the site's
  "Last Update" date on `https://enc-dec.app`.

---

## 2. NEXUS TMDB-Embed backend (HuggingFace Space)

- Env: `VITE_TMDB_EMBED_API_URL` (default `https://zetic7z-tmdb-embed-api.hf.space`)
- Provider: `src/providers/TMdb-provider.ts` (rank 900, tried first)

Request shape used by NEXUS:

```
GET {VITE_TMDB_EMBED_API_URL}/api/sources
    ?tmdb=<tmdbId>&type=<movie|show>&imdb=<imdbId>&season=<n>&episode=<n>&nexus=1
```

Expected response:

```json
{
  "success": true,
  "sources": [
    { "url": "https://.../master.m3u8", "quality": "1080p", "type": "hls", "provider": "..." }
  ],
  "subtitles": [ { "lang": "en", "url": "https://.../en.vtt", "label": "English" } ]
}
```

Behaviour:
- Sends `imdbId` so the backend can skip slow TMDB→IMDB resolution (faster).
- Prefers HLS, falls back to MP4 with a qualities map.
- If the space is asleep (HuggingFace cold start) the first request may take a
  few seconds; the provider retries with backoff.

Deploy your own: fork the TMDB-Embed-API space, set `VITE_TMDB_EMBED_API_URL` to
your space URL. Nothing else changes.

---

## 3. MovieBox VPS backend (self-hosted FastAPI)

- Repo: `https://github.com/walterwhite-69/Moviebox-API`
- Env: `VITE_MOVIEBOX_API_URL` (your VPS base URL, no trailing slash)
- Provider: `src/providers/moviebox-provider.ts` (rank 780)
- Adds: **multi-language dubbed audio** (English, Tagalog, Hindi, …), MP4 output

### 3.1 Deploying MovieBox on your VPS

```bash
git clone https://github.com/walterwhite-69/Moviebox-API.git
cd Moviebox-API
pip install fastapi uvicorn httpx beautifulsoup4
# dev:
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
# production (behind nginx / caddy, with a domain + TLS):
uvicorn api:app --host 0.0.0.0 --port 8000 --workers 4
```

Point `VITE_MOVIEBOX_API_URL` at the public URL (e.g.
`https://moviebox.your-domain.com`). CORS is already `*` in `api.py`.

Verify it's live: `python verify.py` (in the repo) or just open
`https://moviebox.your-domain.com/` — it returns the endpoint list.

### 3.2 The endpoints NEXUS uses

```
GET /search?q={title}
  → { "movies": [ { "name", "slug", "poster_url", "url", "badge" } ] }

GET /detail/{slug}
  → { "metadata": { "id" (subjectId), "title", "dubs": ["English","Tagalog",...] },
      "streams": { "mp4": [...], "hls": [...] } }

GET /api/stream/{subjectId}?detail_path={slug}&se={season}&ep={episode}
  → { "sources": [ { "resolution":"1080p", "format":"mp4", "url":"...", "id":.. } ],
      "raw": { ... }  # may contain audioTrackList for dubs
    }
```

### 3.3 How NEXUS turns a TMDB title into a MovieBox stream

```
TMDB media (title, year, type, season/ep)
      │
      ▼
GET /search?q=<title>              → candidate list
      │  pick best by normalized title + year (confidence gate)
      ▼
GET /detail/<slug>                 → subjectId + dubs[]
      │
      ▼
GET /api/stream/<subjectId>?...    → sources[]
      │  keep format == "mp4" only
      ▼
qualities{res→url}  +  audioTracks[Original + each dub]
      │
      ▼
player: plays Original by default; audio menu swaps MP4 per language
```

### 3.4 Multi-audio / dub resolution (IMPORTANT for debugging)

`scrapeMovieBox` builds `audioTracks` using three fallback strategies, in order:

- **A.** `response.raw.audioTrackList[]` — explicit `{ lang/name, url }` list.
- **B.** per-source language tags — `sources[i].lang | language | dubType`.
- **C.** re-query per dub: for each name in `metadata.dubs[]`, call
  `/api/stream/...?lang=<name>` and take its MP4.

The stock `api.py` only extracts video `sources` and `metadata.dubs`. Depending
on your MovieBox build/version, the actual per-language audio URLs may live in a
differently-named field. **If dub switching doesn't work against your live VPS:**

1. Open `GET /api/stream/<id>?detail_path=<slug>` in a browser and inspect the
   JSON, especially the `raw` object.
2. Find where the per-language URLs are (e.g. `raw.audios`, `raw.dubList`, a
   `lang` field on each source, or separate subjectIds per dub).
3. Update strategy A/B/C in `moviebox-provider.ts` to read that field.

This is the single most likely place to need a small adjustment, because the
audio schema isn't fully fixed across MovieBox versions.

### 3.5 Why MP4 only

The NEXUS/movie-web player renders HLS (via hls.js) and progressive MP4, but the
user's build does **not** support DASH. MovieBox sometimes returns DASH; those
are filtered out in the provider. Never surface DASH to the player.

---

## 4. Proxies & CORS (both backends)

- MovieBox VPS: CORS `*` already set — API calls work from the browser.
- Stream CDNs (where the actual video bytes live) may block cross-origin:
  - MP4: usually plays direct via `<video src>` (no CORS needed).
  - HLS: hls.js needs CORS → set `VITE_M3U8_PROXY_URL`.
- Deploy `xp-technologies-dev/simple-proxy` (Cloudflare Worker / Netlify) for a
  free CORS + M3U8 proxy, then put its URL in `.env`.

---

## 5. Quick backend health checklist

| Symptom | Likely cause | Fix |
|---|---|---|
| MovieBox never appears in sources | VPS unreachable / wrong URL | check `VITE_MOVIEBOX_API_URL`, open `/` in browser |
| MovieBox plays but no dub options | audio field mismatch | inspect `/api/stream` `raw`, update strategy A/B/C |
| Only DASH returned error | title has no MP4 on MovieBox | expected; other providers cover it |
| HLS providers CORS error | no proxy configured | set `VITE_M3U8_PROXY_URL` / `VITE_CORS_PROXY_URL` |
| TMdb provider slow first load | HuggingFace cold start | normal; retry logic handles it |
| enc-dec provider dead | site changed crypto | wait for enc-dec update / lower that provider's rank |

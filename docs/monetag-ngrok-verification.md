# Monetag verification — local testing with ngrok

Monetag unlocks your 3 zone codes (Onclick, In-Page Push, Vignette Banner)
after it can crawl your site and find the verification marker. This guide
gets you there from the local dev server.

## How Monetag verification actually works (important)

Monetag verifies **the domain you registered** (`www.nexusph.xyz`). Its
crawler visits that domain looking for either:

- the file `https://www.nexusph.xyz/sw.js` (already in your repo at
  `public/sw.js` — it deploys with the site), **or**
- the `<meta name="monetag" content="YOUR_TOKEN">` tag in the page HTML
  (now supported — see below).

**Honest truth:** verification of `www.nexusph.xyz` can only succeed once
that domain actually serves the site (i.e. after you deploy). An ngrok
tunnel gives you a *different* domain (`xxxx.ngrok-free.app`), which
Monetag's crawler will not associate with `nexusph.xyz`. So:

- **Use ngrok now** to prove the marker is servable and to smoke-test the
  whole ad stack over a public HTTPS URL from your own machine.
- **Verification will actually pass** after your next deploy, because both
  markers (`sw.js` + meta tag) ship automatically with the build.

## What is already wired for you

1. `public/sw.js` — Monetag's verification/service-worker file, served at
   `/sw.js` by both the dev server and production.
2. `<meta name="monetag" ...>` — rendered by `index.html` **only when**
   `VITE_MONETAG_VERIFICATION_TOKEN` is non-empty (keeps it dormant until
   you paste the token).
3. `vite.config.mts` — `server.allowedHosts` now accepts
   `*.ngrok-free.app` / `*.ngrok.io` / `*.ngrok.dev`, so the tunnel no
   longer trips Vite's host check.
4. Zone scripts stay dormant until you paste their URLs into
   `.env.local` — nothing injects from empty vars.

## Step-by-step

### 1. Get your verification token

Monetag dashboard → **Websites** → `www.nexusph.xyz` → **Verification** →
choose the **"meta tag"** option (under "Other options") → copy the
`content` value of the tag it shows you (the long string inside
`content="..."`).

Paste it into `.env.local`:

```bash
VITE_MONETAG_VERIFICATION_TOKEN=paste-token-here
```

### 2. Install ngrok (one time)

Download the Windows zip, no installer needed:

```powershell
# PowerShell
Invoke-WebRequest -OutFile "$env:USERPROFILE\ngrok.zip" https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip
Expand-Archive "$env:USERPROFILE\ngrok.zip" "$env:USERPROFILE\ngrok" -Force
& "$env:USERPROFILE\ngrok\ngrok.exe" config add-authtoken <YOUR_NGROK_TOKEN>
```

The ngrok authtoken comes from https://dashboard.ngrok.com/get-started/your-authtoken
(free account).

### 3. Start the dev server (must be running first)

```bash
pnpm run dev
```

(leave it running — it binds `127.0.0.1:5173`)

### 4. Open the tunnel (second terminal)

```powershell
& "$env:USERPROFILE\ngrok\ngrok.exe" http 5173 --host-header=localhost:5173
```

ngrok prints a forwarding line like:

```
Forwarding  https://1234-56-78-90.ngrok-free.app -> http://localhost:5173
```

### 5. Sanity-check the markers over the tunnel

Open in a normal browser:

```
https://<your-subdomain>.ngrok-free.app/sw.js            → JavaScript file
https://<your-subdomain>.ngrok-free.app/                 → view source, find <meta name="monetag" ...>
```

If both are there, the site is serving exactly what Monetag's crawler
looks for. (Monetag's crawler *may* even follow the tunnel if it re-reads
the domain's DNS — it won't, but the check costs nothing.)

### 6. Click Verify in Monetag

Press **Verify** on the website page. Two outcomes:

- **Verified** — done (this typically only works post-deploy).
- **Not verified** — expected pre-deploy. Deploy the site (when you're
  ready — nothing is pushed for you) and press Verify again; both markers
  go live with the build.

### 7. After verification: get the 3 zone URLs

Monetag dashboard → create zones **Onclick**, **In-Page Push**, and
**Vignette Banner** (skip Push Notifications) → each zone → **Get code** →
copy only the `<script src="..."></script>` **URL** (the part inside
`src="..."`) and paste into `.env.local`:

```bash
VITE_MONETAG_ONCLICK_URL=https://<monetag-domain>/.../tag.min.js?zone=XXXXX
VITE_MONETAG_INPAGE_URL=https://<monetag-domain>/.../tag.min.js?zone=XXXXX
VITE_MONETAG_VIGNETTE_URL=https://<monetag-domain>/.../tag.min.js?zone=XXXXX
```

Restart the dev server — the zones go live on the homepage only, staggered
with the Adsterra popunder, never on the player page.

## Mirroring to production later

When you deploy, set the same env vars in the deploy pipeline
(`.github/workflows/deploy.yml` already has placeholders wired to
`${{ secrets.VITE_MONETAG_VERIFICATION_TOKEN }}` — create that secret in
the GitHub repo settings and it ships automatically).

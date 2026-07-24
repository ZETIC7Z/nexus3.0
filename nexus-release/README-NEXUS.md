# NEXUS — Quick Start Guide

## Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Git

## Setup in 3 Steps

### 1. Clone p-stream as your base
```bash
git clone -b production https://github.com/xp-technologies-dev/p-stream.git nexus
cd nexus
```

### 2. Apply NEXUS patches
```bash
# Copy all patch files from the patches/ folder into your project
cp path/to/patches/index.html .
cp path/to/patches/manifest.json .
cp path/to/patches/pwa-logo.svg public/
cp path/to/patches/notifications.ts src/utils/
cp path/to/patches/useNotifications.ts src/hooks/
cp path/to/patches/providers/*.ts src/providers/

# Run the global rebrand script
node path/to/patches/rebrand.mjs

# Remove P-Stream icon assets
rm -f public/android-chrome-*.png public/apple-touch-icon.png \
  public/favicon-*.png public/embed-preview.png
```

### 3. Install & Run
```bash
pnpm install
pnpm run dev
# → http://localhost:5173
```

## Provider Registration

In `src/providers/index.ts`, add:
```typescript
import { nexusCustomProviders } from "./nexus-providers-index";

// Merge with existing @p-stream/providers providers
export const allProviders = [...nexusCustomProviders, ...existingProviders];
```

## Notification Init

In `src/App.tsx`:
```typescript
import { useNotificationInit } from "@/hooks/useNotifications";

function App() {
  useNotificationInit(); // Start checking for updates
  // ...
}
```

## File Structure After Patching
```
nexus/
├── index.html          ← NEXUS branded (REPLACED)
├── manifest.json       ← NEXUS PWA manifest (REPLACED)
├── public/
│   ├── pwa-logo.svg   ← NEXUS logo (NEW)
│   └── ...
├── src/
│   ├── providers/
│   │   ├── TMdb-provider.ts      ← NEXUS HuggingFace (NEW)
│   │   ├── vidlink-provider.ts   ← enc-dec.app (NEW)
│   │   ├── videasy-provider.ts   ← enc-dec.app (NEW)
│   │   ├── vidfast-provider.ts   ← enc-dec.app (NEW)
│   │   ├── hexa-provider.ts      ← enc-dec.app (NEW)
│   │   ├── yflix-provider.ts     ← enc-dec.app (NEW)
│   │   └── nexus-providers-index.ts
│   ├── utils/
│   │   └── notifications.ts     ← NEXUS notification system (NEW)
│   └── hooks/
│       └── useNotifications.ts  ← React hook (NEW)
└── patches/            ← Keep as reference
```

## Environment Variables (.env)
```env
VITE_TMDB_READ_API_KEY=your_key_here
VITE_CORS_PROXY_URL=https://your-proxy.com
VITE_BACKEND_URL=https://movies.dovetechnology.org
VITE_APP_DOMAIN=https://nexus.zeticuz.online
VITE_PWA_ENABLED=true
VITE_ALLOW_AUTOPLAY=true
```

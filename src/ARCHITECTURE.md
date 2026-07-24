# `src/` Architecture Map

A guide to where things live and where new code should go. The top-level
layout is conventional (data layer → state → UI); the notes below cover the
non-obvious corners.

```
src/
├── index.tsx          # Entry point: mounts App, runs store migrations
├── setup/             # App bootstrap: App.tsx (routes), config, i18n, PWA, GA
├── backend/           # Data layer — talks to external services, no React
│   ├── accounts/      #   Backend account API (auth, sync, sessions, crypto)
│   ├── extension/     #   Browser-extension messaging bridge
│   ├── helpers/       #   Fetch wrappers, provider API glue, subtitle download
│   ├── metadata/      #   TMDB / IMDB / Trakt / JustWatch / Letterboxd lookups
│   ├── player/        #   Player status reporting
│   └── providers/     #   @nexus/providers wiring (fetchers, provider list)
│                      #   + localProviderShim.ts (temp stubs for private-pkg APIs)
├── stores/            # Zustand stores, one folder per domain
│   └── __old/         #   Legacy store migrations — DO NOT TOUCH (see marker file)
├── hooks/             # Shared React hooks (auth/ subfolder for auth flow)
├── components/        # Reusable UI, grouped by kind
│   ├── auth/          #   Simkl/Trakt OAuth callback handlers (mounted in App)
│   ├── buttons/ form/ layout/ media/ overlays/ text/ text-inputs/
│   ├── player/        #   The video player (has its own README.md)
│   └── utils/         #   Headless helper components (Flare, ContextMenu, …)
├── pages/             # Route-level screens
│   ├── layouts/       #   Page shells (SubPageLayout, MinimalPageLayout, …)
│   ├── parts/         #   Page sections, grouped by the page that owns them
│   │                  #   (home/, settings/, player/, auth/, admin/, …)
│   └── <feature>/     #   discover/, onboarding/, migration/, bookmarks/, …
├── utils/             # Non-React helpers, grouped by theme. Keep React-free.
│   ├── common/        #   Generic helpers: async, cache, events, typeguard, scroll
│   ├── format/        #   Pure formatting: formatSeconds, timestamp, color, 12h clock
│   ├── media/         #   MediaItem types, sorting, bookmark/progress modifications,
│   │                  #   autoplay rules
│   ├── browser/       #   Environment detection: features, extension status,
│   │                  #   keyboard shortcuts, error debug info
│   ├── locale/        #   Language + region detection and mapping
│   ├── hosting/       #   Self-hosting config surface: proxy URLs, CDN link
│   │                  #   rewriting, Turnstile captcha, onboarding status.
│   │                  #   Start here when adapting a self-hosted deploy.
│   ├── services/      #   Third-party service clients: Trakt, Simkl, TIDB,
│   │                  #   IMDB/RottenTomatoes scrapers
│   ├── externalSubtitles/  # Third-party subtitle source integrations
│   └── translation/   #   Subtitle translation (Google Translate)
├── assets/            # CSS, locales/ (i18n JSON), languages list
└── @types/            # Ambient type declarations
```

## Conventions

- **Imports** use the `@/` alias (maps to `src/`); avoid deep relative paths.
- **backend/ and utils/ stay React-free**; React state lives in stores/ and
  hooks/.
- **Components used by exactly one page** belong in `pages/parts/<page>/`,
  not `components/`.
- **Ads code** (`pages/parts/home/AdsPart.tsx`, `HomeAd.tsx`) and
  commented-out parts (e.g. `ProgressCleanupPart` in AdminPage) are
  deliberate on/off toggles — do not remove them as "dead code".

## Fork note

This repo is a fork of `xp-technologies-dev/nexus` and merges from
unexus regularly. Avoid moving/renaming files that unexus actively
changes — every rename becomes a merge conflict. Prefer additive changes.

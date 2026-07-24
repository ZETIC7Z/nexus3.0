# NEXUS — Player & Source Integration Guide

Exact steps to wire the NEXUS extensions (audio dubs + only-working-sources)
into the P-Stream player and scrape flow. This is the part an agent should do
inside the cloned repo, because the exact filenames can shift between P-Stream
versions — the anchors below tell you what to search for.

---

## 1. Register the providers

Find where P-Stream builds its provider list (search the repo for
`makeProviders`, `getProviders`, `buildProviders`, or `providers` in
`src/backend/providers/`).

Add the NEXUS custom providers to that list:

```ts
import { nexusCustomProviders } from "@/providers/nexus-providers-index";

// wherever the base provider list is assembled:
const providerList = [
  ...nexusCustomProviders,   // NEXUS: TMdb, VidLink, Videasy, VidFast, Hexa, yFlix, MovieBox
  ...existingProviders,      // whatever P-Stream already had
];
```

If P-Stream consumes providers from the `@p-stream/providers` package instead of
a local array, create a thin local wrapper module that merges both and import
that where the package was imported.

---

## 2. Only show WORKING sources (spinner + source list)

Find the scrape / source-select flow. Search for one of:
`useProviderScrape`, `useEmbedScraping`, `ScrapingItems`, `SourceSelectingParts`,
`ProviderList`, or the component that renders the list of sources and the
spinner.

Before rendering the provider/source list, filter to healthy providers:

```ts
import { getLiveNexusProviders } from "@/providers/nexus-providers-index";

// in the hook/component that prepares the list:
const [live, setLive] = useState<{ id: string; name: string }[]>([]);

useEffect(() => {
  let active = true;
  getLiveNexusProviders().then((p) => { if (active) setLive(p); });
  return () => { active = false; };
}, []);

// render ONLY providers whose id is in `live`
const visibleProviders = allProviders.filter((p) =>
  live.some((l) => l.id === p.id),
);
```

The spinner/progress UI should iterate `visibleProviders`, not the full list, so
dead providers never show a spinner or a "failed" row.

Optional: add a "Retry sources" button that calls `invalidateHealth()` then
re-runs `getLiveNexusProviders()`.

---

## 3. Feed audio tracks into the store when a stream loads

When a MovieBox stream is selected/loaded, push its `audioTracks` into the store.
Find where the chosen stream is handed to the player (search `setSource`,
`playMedia`, `useProviderScrape` success handler, or the player `Source` atom).

```ts
import { useAudioTrackStore } from "@/utils/player/audioTracks";

// after a stream is resolved:
if (stream.audioTracks?.length) {
  useAudioTrackStore.getState().setTracks(stream.audioTracks);
} else {
  useAudioTrackStore.getState().reset();
}
```

`setTracks` auto-selects the `default: true` track (Original).

---

## 4. Add the audio menu to player settings

Open the player settings menu component (search
`SettingsMenu`, `settings/index.tsx`, or the file listing "Quality" / "Captions"
menu entries — often under `src/components/player/atoms/settings/`).

Add an "Audio" entry that renders `AudioTrackSelector`:

```tsx
import AudioTrackSelector from "@/components/player/atoms/settings/AudioTrackSelector";

// inside the settings menu JSX, near Quality/Captions:
<AudioTrackSelector
  getVideoEl={() => document.querySelector<HTMLVideoElement>("video.vds-video, video")}
  onSelected={() => closeSettings()}  // use the menu's own close handler
/>
```

`AudioTrackSelector` hides itself automatically when there's only the Original
track (i.e. non-MovieBox sources), so it won't clutter the menu.

> The `getVideoEl` selector must return the SAME `<video>` element the player
> controls. If P-Stream wraps the element (e.g. a `videoRef`), pass that ref's
> `.current` instead of a `querySelector`. This guarantees the currentTime/
> resume logic in `switchAudioTrack` targets the right element.

---

## 5. Verify audio switching

1. Play a MovieBox title that has dubs (e.g. an anime with Tagalog/Hindi).
2. Open player settings → Audio → you should see "Original" + each dub.
3. Select "Tagalog" → the player should keep its position and resume in Tagalog
   within a second or two.

If the menu is empty: the provider didn't produce `audioTracks`. Debug per
`BACKENDS.md` §3.4 (inspect `/api/stream` `raw`, fix strategy A/B/C).

---

## 6. Branding touch-points (if any P-Stream text remains)

Search and replace anything the rebrand script missed:

```bash
grep -rin "p-stream\|z-stream\|pstream\|zstream" src/ index.html manifest.json
```

Header logo, player logo overlay, and footer: point their image `src` to
`/pwa-logo.svg` and text to "NEXUS". Common files: `AppLogo`, `Navigation`,
`Footer`, and the player top-bar/logo atom.

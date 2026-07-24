// yflix-provider.ts
// NEXUS — yFlix Provider (yflix.to / 1movies.bz / solarmovie.fi)
// Uses enc-dec.app for encryption/decryption
// Flow: CONTENT_ID→enc→Episode List→EPISODE_ID→enc→Servers List→SERVER_ID→enc→Embed→dec→JSON

import { flags } from "@/utils/proxiedFetch";
import { makeProviderContext } from "@/providers/makeProviderContext";
import { ScrapeContext } from "@/providers/types";

const ENC_DEC_BASE = "https://enc-dec.app/api";
const YFLIX_BASE = "https://yflix.to";
const FLIX_DB_BASE = "https://enc-dec.app/db/flix";
const TIMEOUT = 15000;

async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

interface FlixDbResult {
  data?: { flix_id: string };
}

interface EncResult {
  result: string;
}

interface EpisodeListResult {
  html: string;
}

interface ServerListResult {
  html: string;
}

interface EmbedResult {
  encrypted?: string;
}

interface DecFlixResult {
  success: boolean;
  sources?: Array<{ file: string; label?: string; type?: string }>;
  tracks?: Array<{ file: string; kind: string; label?: string }>;
}

function extractIds(html: string, attr: string): string[] {
  const regex = new RegExp(`${attr}="([^"]+)"`, "g");
  const ids: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    ids.push(match[1]!);
  }
  return ids;
}

export async function scrapeYflix(ctx: ScrapeContext) {
  const { media } = ctx;
  const isShow = media.type === "show";

  // Step 1: Lookup flix_id from database using tmdb_id
  const dbType = isShow ? "tv" : "movie";
  const dbResult = await getJson<FlixDbResult>(
    `${FLIX_DB_BASE}/find?tmdb_id=${media.tmdbId}&type=${dbType}`,
  );
  const flixId = dbResult.data?.flix_id;
  if (!flixId) throw new Error("yFlix: content not found in database");

  // Step 2: Encrypt content ID
  const encContent = await getJson<EncResult>(
    `${ENC_DEC_BASE}/enc-movies-flix?text=${flixId}`,
  );
  if (!encContent.result) throw new Error("yFlix: content encryption failed");

  // Step 3: Fetch episode list (for TV) or server list directly (for movies)
  let serverId: string;

  if (isShow) {
    const epListRes = await getJson<EpisodeListResult>(
      `${YFLIX_BASE}/ajax/episodes/list?id=${flixId}&_=${encContent.result}`,
      { "X-Requested-With": "XMLHttpRequest" },
    );
    // Extract episode ID for the specific episode
    const epIds = extractIds(epListRes.html ?? "", "data-id");
    const epId = epIds[media.episode.number - 1] ?? epIds[0];
    if (!epId) throw new Error("yFlix: episode not found");

    // Encrypt episode ID
    const encEp = await getJson<EncResult>(`${ENC_DEC_BASE}/enc-movies-flix?text=${epId}`);
    if (!encEp.result) throw new Error("yFlix: episode encryption failed");

    // Get server list for the episode
    const serverListRes = await getJson<ServerListResult>(
      `${YFLIX_BASE}/ajax/links/list?eid=${epId}&_=${encEp.result}`,
      { "X-Requested-With": "XMLHttpRequest" },
    );
    const sIds = extractIds(serverListRes.html ?? "", "data-id");
    if (!sIds.length) throw new Error("yFlix: no servers found");
    serverId = sIds[0]!;
  } else {
    // Movie: direct server list
    const serverListRes = await getJson<ServerListResult>(
      `${YFLIX_BASE}/ajax/links/list?eid=${flixId}&_=${encContent.result}`,
      { "X-Requested-With": "XMLHttpRequest" },
    );
    const sIds = extractIds(serverListRes.html ?? "", "data-id");
    if (!sIds.length) throw new Error("yFlix: no servers found");
    serverId = sIds[0]!;
  }

  // Step 4: Encrypt server ID → get embed
  const encServer = await getJson<EncResult>(`${ENC_DEC_BASE}/enc-movies-flix?text=${serverId}`);
  if (!encServer.result) throw new Error("yFlix: server encryption failed");

  const embedData = await getJson<EmbedResult>(
    `${YFLIX_BASE}/ajax/links/view?id=${serverId}&_=${encServer.result}`,
    { "X-Requested-With": "XMLHttpRequest" },
  );
  if (!embedData.encrypted) throw new Error("yFlix: no embed data");

  // Step 5: Decrypt the result
  const decResult = await postJson<DecFlixResult>(`${ENC_DEC_BASE}/dec-movies-flix`, {
    data: embedData.encrypted,
  });

  if (!decResult.success || !decResult.sources?.length) {
    throw new Error("yFlix: decryption failed or no sources");
  }

  const hlsSrc = decResult.sources.find((s) => s.file.includes(".m3u8")) ?? decResult.sources[0]!;
  const captions = (decResult.tracks ?? [])
    .filter((t) => t.kind === "subtitles" || t.kind === "captions")
    .map((t, i) => ({
      id: `yflix-cap-${i}`,
      url: t.file,
      type: t.file.endsWith(".srt") ? ("srt" as const) : ("vtt" as const),
      hasCorsRestrictions: false,
      language: t.label?.toLowerCase().slice(0, 2) ?? "en",
    }));

  return {
    embeds: [],
    stream: {
      type: hlsSrc.file.includes(".m3u8") ? ("hls" as const) : ("mp4" as const),
      playlist: hlsSrc.file,
      flags: [flags.CORS_ALLOWED],
      captions,
    },
  };
}

export const yflixProvider = makeProviderContext({
  id: "nexus-yflix",
  name: "1Movies",
  rank: 810,
  disabled: false,
  async scrape(ctx) {
    return scrapeYflix(ctx);
  },
});

import { useCallback, useEffect, useState } from "react";

import {
  EMBED_API_BASE,
  fetchAndRankEmbed,
  isHlsItem,
  type RankedStream,
} from "@/providers/embeds";
import { prepareStream } from "@/backend/extension/streams";
import { Button } from "@/components/buttons/Button";
import { Toggle } from "@/components/buttons/Toggle";
import { Dropdown } from "@/components/form/Dropdown";
import { Icon, Icons } from "@/components/Icon";
import { usePlayer } from "@/components/player/hooks/usePlayer";
import { convertProviderCaption } from "@/components/player/utils/captions";
import { Title } from "@/components/text/Title";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { TextInputControl } from "@/components/text-inputs/TextInputControl";
import { Divider } from "@/components/utils/Divider";
import { PlaybackErrorPart } from "@/pages/parts/player/PlaybackErrorPart";
import { PlayerPart } from "@/pages/parts/player/PlayerPart";
import { PlayerMeta, playerStatus } from "@/stores/player/slices/source";
import { SourceSliceSource, StreamType } from "@/stores/player/utils/qualities";
import { type ExtensionStatus, getExtensionState } from "@/utils/browser/extension";

const testMeta: PlayerMeta = {
  releaseYear: 2010,
  title: "Sintel",
  tmdbId: "45745",
  type: "movie",
  poster: "https://image.tmdb.org/t/p/w342//4BMG9hk9NvSBeQvC82sVmVRK140.jpg",
};

const testStreams: Record<StreamType, string> = {
  hls: "https://alpha-charlott.github.io/video-openh264/Sintel_master.m3u8",
  mp4: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
};

const streamTypes: Record<StreamType, string> = {
  hls: "HLS",
  mp4: "MP4",
};

// TMDB-Embed provider list for the dev tester (mirrors src/providers/embeds)
const DEV_EMBED_PROVIDERS = [
  { id: "vidlink", name: "VidLink 🎬" },
  { id: "notorrent", name: "NoTorrent 🧲" },
  { id: "videasy", name: "Videasy 🎥" },
  { id: "vixsrc", name: "VixSrc 🔗" },
  { id: "vidcore", name: "VidCore 💎" },
  { id: "vidup", name: "VidUp ⬆️" },
  { id: "vidfast", name: "VidFast ⚡" },
  { id: "anikoto", name: "AniKoto 👺" },
  { id: "anikai", name: "AniKai 🥷" },
];

export default function VideoTesterView() {
  const { status, playMedia, setMeta, reset } = usePlayer();
  const [selected, setSelected] = useState("mp4");
  const [inputSource, setInputSource] = useState("");
  const [extensionState, setExtensionState] =
    useState<ExtensionStatus>("unknown");
  const [headersEnabled, setHeadersEnabled] = useState(false);
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>(
    [{ key: "", value: "" }],
  );

  // ── Embed tester state ────────────────────────────────────────────────
  const [embedProvider, setEmbedProvider] = useState("vidlink");
  const [embedTmdbId, setEmbedTmdbId] = useState("900");
  const [embedIsSeries, setEmbedIsSeries] = useState(false);
  const [embedSeason, setEmbedSeason] = useState("1");
  const [embedEpisode, setEmbedEpisode] = useState("1");
  const [embedRawUrl, setEmbedRawUrl] = useState("");
  const [embedResults, setEmbedResults] = useState<
    Array<{ name: string; quality: string; latency: number | null; url: string; hls: boolean }>
  >([]);
  const [embedLoading, setEmbedLoading] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);

  // Check extension state on mount
  useEffect(() => {
    getExtensionState().then(setExtensionState);
  }, []);

  // Header management functions
  const addHeader = useCallback(() => {
    setHeaders((prev) => [...prev, { key: "", value: "" }]);
  }, []);

  const updateHeader = useCallback(
    (index: number, field: "key" | "value", value: string) => {
      setHeaders((prev) =>
        prev.map((header, i) =>
          i === index ? { ...header, [field]: value } : header,
        ),
      );
    },
    [],
  );

  const removeHeader = useCallback((index: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toggleHeaders = useCallback(() => {
    const newEnabled = !headersEnabled;
    setHeadersEnabled(newEnabled);
    if (!newEnabled) {
      setHeaders([{ key: "", value: "" }]);
    }
  }, [headersEnabled]);

  // Build the TMDB-Embed API endpoint for the current tester inputs.
  const buildEmbedEndpoint = useCallback((): string => {
    const type = embedIsSeries ? "series" : "movie";
    let url = `${EMBED_API_BASE}/api/streams/${embedProvider}/${type}/${encodeURIComponent(embedTmdbId)}`;
    if (embedIsSeries) {
      url += `?season=${encodeURIComponent(embedSeason)}&episode=${encodeURIComponent(embedEpisode)}`;
    }
    return url;
  }, [embedProvider, embedTmdbId, embedIsSeries, embedSeason, embedEpisode]);

  // Fetch + rank every server for the current endpoint.
  const fetchEmbedList = useCallback(
    async (endpoint?: string) => {
      const target = endpoint || embedRawUrl || buildEmbedEndpoint();
      if (!target) return;
      setEmbedLoading(true);
      setEmbedError(null);
      try {
        const ranked: RankedStream[] = await fetchAndRankEmbed(target);
        setEmbedResults(
          ranked.map((r) => ({
            name:
              r.item.name || r.item.server || r.item.title || r.item.provider || "Stream",
            quality: r.quality,
            latency: r.latency,
            url: r.item.url,
            hls: isHlsItem(r.item),
          })),
        );
      } catch (err) {
        setEmbedError(err instanceof Error ? err.message : "Fetch failed");
        setEmbedResults([]);
      } finally {
        setEmbedLoading(false);
      }
    },
    [embedRawUrl, buildEmbedEndpoint],
  );



  const start = useCallback(
    async (url: string, type: StreamType) => {
      // Build headers object from enabled headers
      const headersObj: Record<string, string> = {};
      if (headersEnabled) {
        headers.forEach(({ key, value }) => {
          if (key.trim() && value.trim()) {
            headersObj[key.trim()] = value.trim();
          }
        });
      }

      let source: SourceSliceSource;
      if (type === "hls") {
        source = {
          type: "hls",
          url,
          ...(Object.keys(headersObj).length > 0 && { headers: headersObj }),
        };
      } else if (type === "mp4") {
        source = {
          type: "file",
          qualities: {
            unknown: {
              type: "mp4",
              url,
            },
          },
          ...(Object.keys(headersObj).length > 0 && { headers: headersObj }),
        };
      } else throw new Error("Invalid type");

      // Prepare stream headers if extension is active and headers are present
      if (extensionState === "success" && Object.keys(headersObj).length > 0) {
        // Create a mock Stream object for prepareStream
        const mockStream: any = {
          type: type === "hls" ? "hls" : "file",
          ...(type === "hls"
            ? { playlist: url }
            : {
                qualities: {
                  unknown: {
                    type: "mp4",
                    url,
                  },
                },
              }),
          headers: headersObj,
        };
        try {
          await prepareStream(mockStream);
        } catch (error) {
          console.warn("Failed to prepare stream headers:", error);
        }
      }

      setMeta(testMeta);
      playMedia(source, [], null);
    },
    [playMedia, setMeta, headersEnabled, headers, extensionState],
  );

  // Play the best (first ranked) stream directly in the player.
  const playBestEmbed = useCallback(async () => {
    const target = embedRawUrl || buildEmbedEndpoint();
    if (!target) return;
    setEmbedLoading(true);
    setEmbedError(null);
    try {
      const ranked = await fetchAndRankEmbed(target);
      const best = ranked.find((r) => r.latency !== null) ?? ranked[0];
      if (!best) {
        setEmbedError("No playable stream found");
        return;
      }
      await start(best.item.url, isHlsItem(best.item) ? "hls" : "mp4");
    } catch (err) {
      setEmbedError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setEmbedLoading(false);
    }
  }, [embedRawUrl, buildEmbedEndpoint, start]);

  const startFromCli = useCallback(async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();

      // Parse JavaScript object notation by evaluating it safely
      let cliData;
      try {
        // Try to parse as JSON first (in case it's already valid JSON)
        cliData = JSON.parse(clipboardText);
      } catch {
        // If JSON parsing fails, try to evaluate as JavaScript object
        try {
          // Use Function constructor to safely evaluate the JavaScript object
          // eslint-disable-next-line no-new-func
          cliData = new Function(`return (${clipboardText})`)();
        } catch {
          throw new Error(
            "Invalid JavaScript object format. Please ensure the CLI output is properly formatted.",
          );
        }
      }

      if (
        !cliData.stream ||
        !Array.isArray(cliData.stream) ||
        cliData.stream.length === 0
      ) {
        throw new Error("Invalid CLI output: no stream data found");
      }

      const streamData = cliData.stream[0]; // Take the first stream

      let source: SourceSliceSource;
      if (streamData.type === "hls") {
        source = {
          type: "hls",
          url: streamData.playlist,
          ...(streamData.headers && { headers: streamData.headers }),
        };
      } else if (streamData.type === "file") {
        // Handle file type streams
        const qualities = streamData.qualities || {};
        const qualityKeys = Object.keys(qualities);
        if (qualityKeys.length === 0) {
          throw new Error("Invalid file stream: no qualities found");
        }
        source = {
          type: "file",
          qualities,
          ...(streamData.headers && { headers: streamData.headers }),
        };
      } else {
        throw new Error(`Unsupported stream type: ${streamData.type}`);
      }

      // Convert captions
      const captions = streamData.captions
        ? convertProviderCaption(streamData.captions)
        : [];

      // Prepare stream headers if extension is active and headers are present
      if (
        extensionState === "success" &&
        streamData.headers &&
        Object.keys(streamData.headers).length > 0
      ) {
        try {
          await prepareStream(streamData);
        } catch (error) {
          console.warn("Failed to prepare stream headers:", error);
        }
      }

      setMeta(testMeta);
      playMedia(source, captions, streamData.id);
    } catch (error) {
      console.error("Failed to parse CLI data:", error);

      let errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Check for common JSON/JavaScript formatting issues
      if (
        errorMessage.includes("Expected property name") ||
        errorMessage.includes("Unexpected token")
      ) {
        errorMessage +=
          "\n\nThe CLI output should be in JavaScript object format. Make sure you're copying the complete output from your CLI tool.";
      }

      // eslint-disable-next-line no-alert
      alert(`Failed to parse CLI data: ${errorMessage}`);
    }
  }, [playMedia, setMeta, extensionState]);

  // player meta and streams carry over, so reset on mount
  useEffect(() => {
    if (status !== playerStatus.IDLE) {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PlayerPart backUrl="/dev">
      {status === playerStatus.IDLE ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full max-w-4xl rounded-xl bg-video-scraping-card p-10 m-4">
            <div className="flex gap-16 flex-col lg:flex-row">
              <div className="flex-1">
                <Title>Custom stream</Title>
                <div className="grid grid-cols-[1fr,auto] gap-2 items-center">
                  <TextInputControl
                    className="bg-video-context-flagBg rounded-md p-2 text-white w-full"
                    value={inputSource}
                    onChange={setInputSource}
                    placeholder="https://..."
                  />
                  <Dropdown
                    options={Object.entries(streamTypes).map((v) => ({
                      id: v[0],
                      name: v[1],
                    }))}
                    selectedItem={{
                      id: selected,
                      name: streamTypes[selected as StreamType],
                    }}
                    setSelectedItem={(item) => setSelected(item.id)}
                  />
                </div>

                {extensionState === "success" && (
                  <div className="flex-1 mb-4">
                    <div className="flex justify-between items-center gap-4">
                      <div className="my-3">
                        <p className="text-white font-bold">Headers</p>
                      </div>
                      <div>
                        <Toggle
                          onClick={toggleHeaders}
                          enabled={headersEnabled}
                        />
                      </div>
                    </div>
                    {headersEnabled && (
                      <>
                        <Divider marginClass="my-6 px-8 box-content -mx-8" />
                        <div className="my-6 space-y-2">
                          {headers.length === 0 ? (
                            <p>No headers configured.</p>
                          ) : (
                            headers.map((header, index) => (
                              <div
                                // eslint-disable-next-line react/no-array-index-key
                                key={index}
                                className="grid grid-cols-[1fr,1fr,auto] items-center gap-2"
                              >
                                <AuthInputBox
                                  value={header.key}
                                  onChange={(value) =>
                                    updateHeader(index, "key", value)
                                  }
                                  placeholder="Key"
                                />
                                <AuthInputBox
                                  value={header.value}
                                  onChange={(value) =>
                                    updateHeader(index, "value", value)
                                  }
                                  placeholder="Value"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeHeader(index)}
                                  className="h-full scale-90 hover:scale-100 rounded-full aspect-square bg-authentication-inputBg hover:bg-authentication-inputBgHover flex justify-center items-center transition-transform duration-200 hover:text-white cursor-pointer"
                                >
                                  <Icon className="text-xl" icon={Icons.X} />
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        <Button theme="purple" onClick={addHeader}>
                          Add header
                        </Button>
                      </>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={() => start(inputSource, selected as StreamType)}
                  >
                    Start stream
                  </Button>
                  <Button onClick={startFromCli} className="col-span-2">
                    Paste from CLI
                  </Button>
                </div>
              </div>
              <div className="flex-1">
                <Title>Preset tests</Title>
                <div className="grid grid-cols-[1fr,1fr] gap-2">
                  <Button onClick={() => start(testStreams.hls, "hls")}>
                    HLS test
                  </Button>
                  <Button onClick={() => start(testStreams.mp4, "mp4")}>
                    MP4 test
                  </Button>
                </div>
              </div>
            </div>

            {/* ── Embed tester — test TMDB-Embed endpoints directly ── */}
            <Divider marginClass="my-6 px-8 box-content -mx-8" />
            <div className="flex-1">
              <Title>Embed tester</Title>
              <p className="text-type-secondary text-sm mb-3">
                Fetch a TMDB-Embed endpoint, see every server with its quality
                &amp; latency, and play any stream straight in the player.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-center">
                <Dropdown
                  options={DEV_EMBED_PROVIDERS}
                  selectedItem={
                    DEV_EMBED_PROVIDERS.find((p) => p.id === embedProvider) ??
                    DEV_EMBED_PROVIDERS[0]!
                  }
                  setSelectedItem={(item) => setEmbedProvider(item.id)}
                />
                <TextInputControl
                  className="bg-video-context-flagBg rounded-md p-2 text-white w-full"
                  value={embedTmdbId}
                  onChange={setEmbedTmdbId}
                  placeholder="TMDB ID (e.g. 900)"
                />
                <Button
                  theme={embedIsSeries ? "purple" : "secondary"}
                  onClick={() => setEmbedIsSeries((v) => !v)}
                >
                  {embedIsSeries ? "Series" : "Movie"}
                </Button>
                {embedIsSeries ? (
                  <div className="grid grid-cols-2 gap-2">
                    <TextInputControl
                      className="bg-video-context-flagBg rounded-md p-2 text-white w-full"
                      value={embedSeason}
                      onChange={setEmbedSeason}
                      placeholder="Season"
                    />
                    <TextInputControl
                      className="bg-video-context-flagBg rounded-md p-2 text-white w-full"
                      value={embedEpisode}
                      onChange={setEmbedEpisode}
                      placeholder="Episode"
                    />
                  </div>
                ) : null}
              </div>

              <div className="my-2 text-xs text-type-secondary break-all">
                {buildEmbedEndpoint()}
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button onClick={playBestEmbed} disabled={embedLoading}>
                  {embedLoading ? "Fetching…" : "Fetch best stream & play"}
                </Button>
                <Button
                  theme="secondary"
                  onClick={() => fetchEmbedList()}
                  disabled={embedLoading}
                >
                  List all servers
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-[1fr,auto] gap-2 items-center">
                <TextInputControl
                  className="bg-video-context-flagBg rounded-md p-2 text-white w-full"
                  value={embedRawUrl}
                  onChange={setEmbedRawUrl}
                  placeholder="Or paste a full /api/streams/... endpoint URL"
                />
                <Button
                  theme="secondary"
                  onClick={() => fetchEmbedList(embedRawUrl)}
                  disabled={embedLoading || !embedRawUrl}
                >
                  Fetch raw URL
                </Button>
              </div>

              {embedError ? (
                <p className="mt-3 text-red-400 text-sm break-all">
                  {embedError}
                </p>
              ) : null}

              {embedResults.length > 0 ? (
                <div className="mt-4 space-y-2 max-h-64 overflow-y-auto pr-1">
                  {embedResults.map((r, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div
                      key={`${r.url}-${i}`}
                      className="flex items-center justify-between gap-3 bg-video-context-flagBg rounded-md px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-white text-sm truncate">{r.name}</p>
                        <p className="text-xs text-type-secondary">
                          {r.quality} · {r.hls ? "HLS" : "MP4"} ·{" "}
                          {r.latency !== null ? `${r.latency}ms` : "no response"}
                        </p>
                      </div>
                      <Button
                        theme={r.latency !== null ? "purple" : "secondary"}
                        onClick={() => start(r.url, r.hls ? "hls" : "mp4")}
                      >
                        Play
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {status === playerStatus.PLAYBACK_ERROR ? <PlaybackErrorPart /> : null}
    </PlayerPart>
  );
}

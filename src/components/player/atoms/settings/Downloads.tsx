import { useCallback, useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useCopyToClipboard } from "react-use";

import { downloadCaption } from "@/backend/helpers/subs";
import { getDownloadsData } from "@/utils/downloadPreload";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { OverlayPage } from "@/components/overlays/OverlayPage";
import { Menu } from "@/components/player/internals/ContextMenu";
import { convertSubtitlesToSrtDataurl } from "@/components/player/utils/captions";
import { useIsDesktopApp } from "@/hooks/useIsDesktopApp";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { openWindowSafely } from "@/setup/popupGuard";
import { usePlayerStore } from "@/stores/player/store";

// ---------------------------------------------------------------------------
// Downloads menu — powered by /api/downloads (TMDB-Embed aggregation).
//   * Download Movie    -> every downloadable file (quality + format) with
//                          its own download button (MKV/MP4 from any provider)
//   * Download Subtitle -> every provider subtitle track, grouped by language
//                          (English first), each with a download button
// ---------------------------------------------------------------------------

interface DownloadEntry {
  provider: string;
  name: string;
  title: string;
  quality: string;
  format: string;
  size: string;
  url: string;
}

interface SubtitleEntry {
  provider: string;
  lang: string;
  label: string;
  url: string;
  format: string;
}

interface DownloadsResponse {
  success: boolean;
  downloads: DownloadEntry[];
  subtitles: SubtitleEntry[];
}

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Español", fr: "Français", de: "Deutsch", it: "Italiano",
  pt: "Português", ru: "Русский", ja: "日本語", ko: "한국어", zh: "中文",
  ar: "العربية", hi: "हिन्दी", tr: "Türkçe", th: "ไทย", vi: "Tiếng Việt",
  id: "Bahasa Indonesia", nl: "Nederlands", pl: "Polski", ro: "Română",
  sv: "Svenska", el: "Ελληνικά", cs: "Čeština", hu: "Magyar", da: "Dansk",
  fi: "Suomi", hr: "Hrvatski", he: "עברית", iw: "עברית", is: "Íslenska",
  ms: "Bahasa Melayu", nb: "Norsk Bokmål", uk: "Українська", fil: "Filipino",
  bn: "বাংলা", pa: "ਪੰਜਾਬੀ", sw: "Kiswahili", ur: "اُردُو", ta: "தமிழ்",
  te: "తెలుగు", tl: "Tagalog",
};

const QUALITY_ORDER: Record<string, number> = {
  "2160p": 0, "1080p": 1, "720p": 2, "480p": 3, "360p": 4, unknown: 9,
};

function langName(code: string): string {
  return LANG_NAMES[code.toLowerCase()] ?? code;
}

export function useDownloadLink() {
  const source = usePlayerStore((s) => s.source);
  const currentQuality = usePlayerStore((s) => s.currentQuality);
  const url = useMemo(() => {
    if (source?.type === "file") {
      const quality = currentQuality
        ? source.qualities[currentQuality]
        : undefined;
      if (quality) return quality.url;
      const firstQuality = Object.values(source.qualities)[0];
      return firstQuality?.url;
    }
    if (source?.type === "hls") return source.url;
    return undefined;
  }, [source, currentQuality]);
  return url;
}

function StyleTrans(props: { k: string }) {
  return (
    <Trans
      i18nKey={props.k}
      components={{
        bold: <Menu.Highlight />,
        br: <br />,
        ios_share: (
          <Icon icon={Icons.IOS_SHARE} className="inline-block text-xl -mb-1" />
        ),
        ios_files: (
          <Icon icon={Icons.IOS_FILES} className="inline-block text-xl -mb-1" />
        ),
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Download Movie view — every downloadable quality/format as a button
// ---------------------------------------------------------------------------
function DownloadMovieView({ id }: { id: string }) {
  const router = useOverlayRouter(id);
  const meta = usePlayerStore((s) => s.meta);
  const [data, setData] = useState<DownloadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const isShow = meta?.type === "show";
  const tmdbId = meta?.tmdbId;
  const season = (meta as any)?.season?.number;
  const episode = (meta as any)?.episode?.number;

  useEffect(() => {
    if (!tmdbId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);

    // Reads the preload cache warmed when Play Now was pressed - usually
    // resolves instantly.
    getDownloadsData(isShow ? "show" : "movie", tmdbId, season, episode)
      .then((json) => {
        if (cancelled) return;
        if (json) setData(json);
        else setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tmdbId, isShow, season, episode]);

  const downloads = useMemo(() => {
    const list = [...(data?.downloads ?? [])];
    list.sort((a, b) => {
      const qa = QUALITY_ORDER[a.quality] ?? 9;
      const qb = QUALITY_ORDER[b.quality] ?? 9;
      if (qa !== qb) return qa - qb;
      return a.provider.localeCompare(b.provider);
    });
    return list;
  }, [data]);

  const label = meta?.title ?? "Download";

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/download")}>
        Download Movie
      </Menu.BackLink>
      <Menu.Section>
        {loading && (
          <Menu.Paragraph marginClass="mb-4">Loading download sources…</Menu.Paragraph>
        )}
        {error && (
          <Menu.Paragraph marginClass="mb-4">Could not load download sources.</Menu.Paragraph>
        )}
        {!loading && !error && downloads.length === 0 && (
          <Menu.Paragraph marginClass="mb-4">
            No downloadable files found for this title.
          </Menu.Paragraph>
        )}
        {downloads.map((dl, i) => (
          <div
            key={`${dl.provider}-${dl.url}-${i}`}
            className="w-full rounded-lg bg-video-context-light/10 p-3 mb-2"
          >
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-video-context-type-accent/20 text-video-context-type-accent">
                {dl.format}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-video-context-light/20 text-video-context-type-main">
                {dl.quality}
              </span>
              {dl.size && (
                <span className="text-xs text-video-context-type-secondary ml-auto">{dl.size}</span>
              )}
            </div>
            <p className="text-xs text-video-context-type-secondary break-all mb-2">
              {label} · {dl.provider}
              {dl.title ? ` — ${dl.title.slice(0, 90)}` : ""}
            </p>
            <a
              href={dl.url}
              download
              className="block text-center px-3 py-1.5 rounded bg-video-context-type-accent/20 hover:bg-video-context-type-accent/40 transition-colors text-xs font-medium text-video-context-type-main"
            >
              Download
            </a>
          </div>
        ))}
      </Menu.Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Download Subtitle view — grouped by language, English first
// ---------------------------------------------------------------------------
function DownloadSubtitleView({ id }: { id: string }) {
  const router = useOverlayRouter(id);
  const meta = usePlayerStore((s) => s.meta);
  const [data, setData] = useState<DownloadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openLang, setOpenLang] = useState<string | null>(null);

  const isShow = meta?.type === "show";
  const tmdbId = meta?.tmdbId;
  const season = (meta as any)?.season?.number;
  const episode = (meta as any)?.episode?.number;

  useEffect(() => {
    if (!tmdbId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);

    getDownloadsData(isShow ? "show" : "movie", tmdbId, season, episode)
      .then((json) => {
        if (cancelled) return;
        if (json) setData(json);
        else setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tmdbId, isShow, season, episode]);

  const groups = useMemo(() => {
    const byLang = new Map<string, SubtitleEntry[]>();
    for (const sub of data?.subtitles ?? []) {
      const key = (sub.lang || "und").toLowerCase();
      if (!byLang.has(key)) byLang.set(key, []);
      byLang.get(key)!.push(sub);
    }
    const list = [...byLang.entries()].map(([lang, subs]) => ({ lang, subs }));
    list.sort((a, b) => {
      if (a.lang === "en") return -1;
      if (b.lang === "en") return 1;
      return langName(a.lang).localeCompare(langName(b.lang));
    });
    return list;
  }, [data]);

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/download")}>
        Download Subtitle
      </Menu.BackLink>
      <Menu.Section>
        {loading && (
          <Menu.Paragraph marginClass="mb-4">Loading subtitles…</Menu.Paragraph>
        )}
        {error && (
          <Menu.Paragraph marginClass="mb-4">Could not load subtitles.</Menu.Paragraph>
        )}
        {!loading && !error && groups.length === 0 && (
          <Menu.Paragraph marginClass="mb-4">
            No provider subtitles found for this title.
          </Menu.Paragraph>
        )}
        {groups.map(({ lang, subs }) => (
          <div key={lang} className="w-full rounded-lg bg-video-context-light/10 mb-2 overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center gap-2 p-3 text-left hover:bg-video-context-light/10 transition-colors"
              onClick={() => setOpenLang(openLang === lang ? null : lang)}
            >
              <span className="text-sm font-medium text-video-context-type-main flex-1">
                {langName(lang)}
                <span className="ml-2 text-xs text-video-context-type-secondary">
                  ({subs.length})
                </span>
              </span>
              <Icon icon={Icons.CHEVRON_DOWN} className={`transition-transform ${openLang === lang ? "rotate-180" : ""}`} />
            </button>
            {openLang === lang && (
              <div className="px-3 pb-3 flex flex-col gap-2">
                {subs.map((sub, i) => (
                  <div key={`${sub.url}-${i}`} className="flex items-center gap-2">
                    <span className="text-xs text-video-context-type-secondary flex-1 truncate">
                      {sub.provider} · {sub.format.toUpperCase()}
                    </span>
                    <a
                      href={sub.url}
                      download
                      className="px-3 py-1 rounded bg-video-context-type-accent/20 hover:bg-video-context-type-accent/40 transition-colors text-xs font-medium text-video-context-type-main whitespace-nowrap"
                    >
                      Download
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </Menu.Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Legacy original-file view (kept for old links)
// ---------------------------------------------------------------------------
function OriginalFileView({ id }: { id: string }) {
  return <DownloadMovieView id={id} />;
}

function StreamLinkView({ id }: { id: string }) {
  const router = useOverlayRouter(id);
  const { t } = useTranslation();
  const downloadUrl = useDownloadLink();
  const [, copyToClipboard] = useCopyToClipboard();
  const selectedCaption = usePlayerStore((s) => s.caption?.selected);

  const openSubtitleDownload = useCallback(() => {
    const dataUrl = selectedCaption
      ? convertSubtitlesToSrtDataurl(selectedCaption?.srtData)
      : null;
    if (!dataUrl) return;
    openWindowSafely(dataUrl);
  }, [selectedCaption]);

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/download")}>
        {t("player.menus.downloads.stream.cardTitle")}
      </Menu.BackLink>
      <Menu.Section>
        <Menu.Paragraph marginClass="mb-4">
          <Trans i18nKey="player.menus.downloads.desktopDisclaimer" />
        </Menu.Paragraph>
        <Button
          className="w-full"
          theme="purple"
          onClick={(event) => {
            event.preventDefault();
            copyToClipboard(downloadUrl ?? "");
          }}
        >
          {t("player.menus.downloads.copyHlsPlaylist")}
        </Button>
        <Button
          className="w-full mt-2"
          onClick={openSubtitleDownload}
          disabled={!selectedCaption}
          theme="secondary"
        >
          {t("player.menus.downloads.downloadSubtitle")}
        </Button>

        <Menu.Divider />

        <Menu.ChevronLink onClick={() => router.navigate("/download/pc")}>
          {t("player.menus.downloads.onPc.title")}
        </Menu.ChevronLink>
        <Menu.ChevronLink onClick={() => router.navigate("/download/ios")}>
          {t("player.menus.downloads.onIos.title")}
        </Menu.ChevronLink>
        <Menu.ChevronLink onClick={() => router.navigate("/download/android")}>
          {t("player.menus.downloads.onAndroid.title")}
        </Menu.ChevronLink>
      </Menu.Section>
    </>
  );
}

function DesktopDownloadView({ id }: { id: string }) {
  const router = useOverlayRouter(id);
  const { t } = useTranslation();
  const downloadUrl = useDownloadLink();
  const meta = usePlayerStore((s) => s.meta);
  const selectedCaption = usePlayerStore((s) => s.caption?.selected);
  const captionList = usePlayerStore((s) => s.captionList);
  const duration = usePlayerStore((s) => s.progress.duration);
  const source = usePlayerStore((s) => s.source);
  const sourceType = usePlayerStore((s) => s.source?.type);

  const startOfflineDownload = useCallback(async () => {
    if (!downloadUrl) return;
    const title = meta?.title ? meta.title : t("player.menus.downloads.title");
    const poster = meta?.poster;
    let subtitleText: string | undefined;

    if (selectedCaption?.srtData) {
      subtitleText = selectedCaption.srtData;
    } else if (captionList.length > 0) {
      const defaultCaption =
        captionList.find((c) => c.language === "en") ?? captionList[0];
      try {
        subtitleText = await downloadCaption(defaultCaption);
      } catch {
        // Continue without subtitles if fetch fails
      }
    }

    const headers = {
      ...(source?.headers ?? {}),
      ...(source?.preferredHeaders ?? {}),
    };

    window.desktopApi?.startDownload({
      url: downloadUrl,
      title,
      poster,
      subtitleText,
      duration,
      type: sourceType,
      headers,
    });

    if (window.desktopApi?.openOffline) {
      window.desktopApi.openOffline();
    } else {
      router.navigate("/");
    }
  }, [
    downloadUrl,
    meta,
    selectedCaption,
    captionList,
    duration,
    router,
    source,
    sourceType,
    t,
  ]);

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/")}>
        {t("player.menus.downloads.title")}
      </Menu.BackLink>
      <Menu.Section>
        <Menu.Paragraph marginClass="mb-6">
          <Trans i18nKey="player.menus.downloads.desktopDisclaimer" />
        </Menu.Paragraph>
        <Button className="w-full" theme="purple" onClick={startOfflineDownload}>
          {t("player.menus.downloads.offlineButton")}
        </Button>
      </Menu.Section>
    </>
  );
}

export function DownloadView({ id }: { id: string }) {
  const isDesktopApp = useIsDesktopApp();
  const router = useOverlayRouter(id);
  const { t } = useTranslation();

  if (isDesktopApp) {
    return <DesktopDownloadView id={id} />;
  }

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/")}>
        {t("player.menus.downloads.title")}
      </Menu.BackLink>
      <Menu.Section>
        <div className="flex flex-col gap-3 mt-2">
          <button
            type="button"
            className="w-full rounded-lg bg-video-context-light/10 hover:bg-video-context-light/20 transition-colors p-4 text-left relative group cursor-pointer"
            onClick={() => router.navigate("/download/movie")}
          >
            <div className="flex items-center gap-3">
              <Icon
                icon={Icons.FILE_ARROW_DOWN}
                className="text-2xl text-video-context-type-accent"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-video-context-type-main">
                  Download Movie
                </p>
                <p className="text-xs text-video-context-type-secondary mt-0.5">
                  All qualities and formats from every provider
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            className="w-full rounded-lg bg-video-context-light/10 hover:bg-video-context-light/20 transition-colors p-4 text-left relative group cursor-pointer"
            onClick={() => router.navigate("/download/subtitle")}
          >
            <div className="flex items-center gap-3">
              <Icon
                icon={Icons.CAPTIONS}
                className="text-2xl text-video-context-type-accent"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-video-context-type-main">
                  Download Subtitle
                </p>
                <p className="text-xs text-video-context-type-secondary mt-0.5">
                  Every language, every provider
                </p>
              </div>
            </div>
          </button>

          <div className="flex items-center gap-3 px-2">
            <div className="flex-1 h-px bg-video-context-border" />
            <span className="text-xs text-video-context-type-secondary uppercase">
              {t("player.menus.downloads.or")}
            </span>
            <div className="flex-1 h-px bg-video-context-border" />
          </div>

          <button
            type="button"
            className="w-full rounded-lg bg-video-context-light/10 hover:bg-video-context-light/20 transition-colors p-4 text-left cursor-pointer relative group"
            onClick={() => router.navigate("/download/stream")}
          >
            <div className="flex items-center gap-3">
              <Icon
                icon={Icons.LINK}
                className="text-2xl text-video-context-type-accent"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-video-context-type-main">
                  {t("player.menus.downloads.stream.cardTitle")}
                </p>
                <p className="text-xs text-video-context-type-secondary mt-0.5">
                  {t("player.menus.downloads.stream.cardDesc")}
                </p>
              </div>
            </div>
          </button>
        </div>
      </Menu.Section>
    </>
  );
}

function AndroidExplanationView({ id }: { id: string }) {
  const router = useOverlayRouter(id);
  const { t } = useTranslation();

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/download/stream")}>
        {t("player.menus.downloads.onAndroid.shortTitle")}
      </Menu.BackLink>
      <Menu.Section>
        <Menu.Paragraph>
          <StyleTrans k="player.menus.downloads.onAndroid.1" />
        </Menu.Paragraph>
      </Menu.Section>
    </>
  );
}

function PCExplanationView({ id }: { id: string }) {
  const router = useOverlayRouter(id);
  const { t } = useTranslation();

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/download/stream")}>
        {t("player.menus.downloads.onPc.shortTitle")}
      </Menu.BackLink>
      <Menu.Section>
        <Menu.Paragraph>
          <StyleTrans k="player.menus.downloads.onPc.1" />
        </Menu.Paragraph>
      </Menu.Section>
    </>
  );
}

function IOSExplanationView({ id }: { id: string }) {
  const router = useOverlayRouter(id);

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/download/stream")}>
        <StyleTrans k="player.menus.downloads.onIos.shortTitle" />
      </Menu.BackLink>
      <Menu.Section>
        <Menu.Paragraph>
          <StyleTrans k="player.menus.downloads.onIos.1" />
        </Menu.Paragraph>
      </Menu.Section>
    </>
  );
}

export function DownloadRoutes({ id }: { id: string }) {
  return (
    <>
      <OverlayPage id={id} path="/download" width={343} height={400}>
        <Menu.CardWithScrollable>
          <DownloadView id={id} />
        </Menu.CardWithScrollable>
      </OverlayPage>
      <OverlayPage id={id} path="/download/movie" width={343} height={440}>
        <Menu.CardWithScrollable>
          <DownloadMovieView id={id} />
        </Menu.CardWithScrollable>
      </OverlayPage>
      <OverlayPage id={id} path="/download/subtitle" width={343} height={440}>
        <Menu.CardWithScrollable>
          <DownloadSubtitleView id={id} />
        </Menu.CardWithScrollable>
      </OverlayPage>
      <OverlayPage id={id} path="/download/original" width={343} height={440}>
        <Menu.CardWithScrollable>
          <OriginalFileView id={id} />
        </Menu.CardWithScrollable>
      </OverlayPage>
      <OverlayPage id={id} path="/download/stream" width={343} height={480}>
        <Menu.CardWithScrollable>
          <StreamLinkView id={id} />
        </Menu.CardWithScrollable>
      </OverlayPage>
      <OverlayPage id={id} path="/download/ios" width={343} height={440}>
        <Menu.CardWithScrollable>
          <IOSExplanationView id={id} />
        </Menu.CardWithScrollable>
      </OverlayPage>
      <OverlayPage id={id} path="/download/android" width={343} height={440}>
        <Menu.CardWithScrollable>
          <AndroidExplanationView id={id} />
        </Menu.CardWithScrollable>
      </OverlayPage>
      <OverlayPage id={id} path="/download/pc" width={343} height={440}>
        <Menu.CardWithScrollable>
          <PCExplanationView id={id} />
        </Menu.CardWithScrollable>
      </OverlayPage>
    </>
  );
}

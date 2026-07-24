import { detect } from "detect-browser";

import { usePlayerStore } from "@/stores/player/store";

export interface ErrorDebugInfo {
  timestamp: string;
  error: {
    name?: string;
    message: string;
    type: string;
    stackTrace?: string;
    causeChain?: string[];
    raw?: string;
  };
  react?: {
    componentStack: string;
  };
  device: {
    userAgent: string;
    browser: string;
    browserVersion?: string;
    os: string;
    isMobile: boolean;
    isTV: boolean;
    screenResolution: string;
    viewportSize: string;
    devicePixelRatio: number;
    language: string;
    languages: string[];
    cookiesEnabled: boolean;
    storageAvailable: boolean;
  };
  player: {
    status: string;
    sourceId: string | null;
    embedId: string | null;
    currentQuality: string | null;
    meta: {
      title: string;
      type: string;
      tmdbId: string;
      imdbId?: string;
      releaseYear: number;
      season?: number;
      episode?: number;
    } | null;
  };
  network: {
    online: boolean;
    connectionType?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  };
  hls?: {
    details: string;
    fatal: boolean;
    level?: number;
    levelDetails?: {
      url: string;
      width: number;
      height: number;
      bitrate: number;
    };
    frag?: {
      url: string;
      baseurl: string;
      duration: number;
      start: number;
      sn: number | string;
    };
    type: string;
    url?: string;
  };
  page: {
    pathname: string;
    search: string;
    hash: string;
    referrer: string;
    documentReadyState: DocumentReadyState;
    visibilityState: DocumentVisibilityState;
    pageLoadMs?: number;
    timeSincePageLoadMs?: number;
  };
  performance: {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
    timing: {
      navigationStart: number;
      loadEventEnd: number;
      domContentLoadedEventEnd: number;
    };
  };
}

function isStorageAvailable(): boolean {
  try {
    const k = "__err_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function buildCauseChain(err: any): string[] {
  const chain: string[] = [];
  let cur: any = err?.cause;
  let depth = 0;
  while (cur && depth < 6) {
    if (cur instanceof Error) {
      chain.push(`${cur.name}: ${cur.message}`);
      cur = cur.cause;
    } else {
      chain.push(String(cur));
      break;
    }
    depth += 1;
  }
  return chain;
}

// Heuristic: if a string starts with "TypeError: ..." / "Error: ..." and contains
// stack-frame-looking lines ("    at funcName (...)"), treat it as having a stack.
function looksLikeStackTrace(s: string): boolean {
  return /\n\s+at\s+/.test(s);
}

// Extract { message, stack } from a stringified error if possible.
function splitStringifiedError(s: string): { message: string; stack?: string } {
  if (!looksLikeStackTrace(s)) return { message: s };
  const firstLineEnd = s.indexOf("\n");
  if (firstLineEnd === -1) return { message: s };
  return {
    message: s.slice(0, firstLineEnd),
    stack: s,
  };
}

function normalizeError(error: any): ErrorDebugInfo["error"] {
  if (error == null) {
    return { message: "(no error provided)", type: "unknown" };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message || error.toString(),
      type: error.name || "Error",
      stackTrace: error.stack,
      causeChain: buildCauseChain(error),
    };
  }
  if (typeof error === "string") {
    const split = splitStringifiedError(error);
    return {
      message: split.message,
      type: "string",
      stackTrace: split.stack,
      raw: split.stack ? undefined : error,
    };
  }
  // DisplayError-like or other object
  const message: string =
    error.message || error.key || error.reason || String(error);
  const type: string =
    error.type || error.errorName || error.name || "unknown";
  const stackTrace: string | undefined = error.stackTrace || error.stack;
  return {
    name: error.errorName || error.name,
    message,
    type,
    stackTrace,
    causeChain: buildCauseChain(error),
  };
}

export function gatherErrorDebugInfo(
  error: any,
  componentStack?: string,
): ErrorDebugInfo {
  const browserInfo = detect();
  const isMobile = window.innerWidth <= 768;
  const isTV =
    /SmartTV|Tizen|WebOS|SamsungBrowser|HbbTV|Viera|NetCast|AppleTV|Android TV|GoogleTV|Roku|PlayStation|Xbox|Opera TV|AquosBrowser|Hisense|SonyBrowser|SharpBrowser|AFT|Chromecast/i.test(
      navigator.userAgent,
    );

  const playerStore = usePlayerStore.getState();

  // Get network information
  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  // Get performance information
  const navTiming = performance.getEntriesByType(
    "navigation",
  )[0] as PerformanceNavigationTiming | undefined;
  const memory = (performance as any).memory;

  const pageLoadMs = navTiming?.loadEventEnd
    ? Math.round(navTiming.loadEventEnd - navTiming.startTime)
    : undefined;
  const timeSincePageLoadMs = Math.round(performance.now());

  return {
    timestamp: new Date().toISOString(),
    error: normalizeError(error),
    react: componentStack ? { componentStack } : undefined,
    device: {
      userAgent: navigator.userAgent,
      browser: browserInfo?.name || "unknown",
      browserVersion: browserInfo?.version || undefined,
      os: browserInfo?.os || "unknown",
      isMobile,
      isTV,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      viewportSize: `${window.innerWidth}x${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio || 1,
      language: navigator.language,
      languages: Array.from(navigator.languages || []),
      cookiesEnabled: navigator.cookieEnabled,
      storageAvailable: isStorageAvailable(),
    },
    player: {
      status: playerStore.status,
      sourceId: playerStore.sourceId,
      embedId: (playerStore as any).embedId ?? null,
      currentQuality: playerStore.currentQuality,
      meta: playerStore.meta
        ? {
            title: playerStore.meta.title,
            type: playerStore.meta.type,
            tmdbId: playerStore.meta.tmdbId,
            imdbId: playerStore.meta.imdbId,
            releaseYear: playerStore.meta.releaseYear,
            season: playerStore.meta.season?.number,
            episode: playerStore.meta.episode?.number,
          }
        : null,
    },
    network: {
      online: navigator.onLine,
      connectionType: connection?.type,
      effectiveType: connection?.effectiveType,
      downlink: connection?.downlink,
      rtt: connection?.rtt,
      saveData: connection?.saveData,
    },
    hls: error?.hls
      ? {
          details: error.hls.details,
          fatal: error.hls.fatal,
          level: error.hls.level,
          levelDetails: error.hls.levelDetails
            ? {
                url: error.hls.levelDetails.url,
                width: error.hls.levelDetails.width,
                height: error.hls.levelDetails.height,
                bitrate: error.hls.levelDetails.bitrate,
              }
            : undefined,
          frag: error.hls.frag
            ? {
                url: error.hls.frag.url,
                baseurl: error.hls.frag.baseurl,
                duration: error.hls.frag.duration,
                start: error.hls.frag.start,
                sn: error.hls.frag.sn,
              }
            : undefined,
          type: error.hls.type,
          url: error.hls.url,
        }
      : undefined,
    page: {
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      referrer: document.referrer || "(none)",
      documentReadyState: document.readyState,
      visibilityState: document.visibilityState,
      pageLoadMs,
      timeSincePageLoadMs,
    },
    performance: {
      memory: memory
        ? {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
          }
        : undefined,
      timing: {
        navigationStart: navTiming?.fetchStart || 0,
        loadEventEnd: navTiming?.loadEventEnd || 0,
        domContentLoadedEventEnd: navTiming?.domContentLoadedEventEnd || 0,
      },
    },
  };
}

export function formatErrorDebugInfo(info: ErrorDebugInfo): string {
  const sections: (string | false | null | undefined)[] = [
    `=== ERROR DEBUG INFO ===`,
    `Timestamp: ${info.timestamp}`,
    ``,
    `=== ERROR DETAILS ===`,
    `Type: ${info.error.type}`,
    info.error.name && info.error.name !== info.error.type
      ? `Name: ${info.error.name}`
      : null,
    `Message: ${info.error.message}`,
    info.error.stackTrace ? `Stack Trace:\n${info.error.stackTrace}` : null,
    info.error.causeChain && info.error.causeChain.length > 0
      ? `Caused by:\n${info.error.causeChain.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}`
      : null,
    info.error.raw && info.error.raw !== info.error.message
      ? `Raw:\n${info.error.raw}`
      : null,
    ``,
    info.react
      ? [`=== REACT COMPONENT STACK ===`, info.react.componentStack.trim()].join(
          "\n",
        )
      : null,
    info.react ? `` : null,
    `=== DEVICE INFO ===`,
    `Browser: ${info.device.browser}${info.device.browserVersion ? ` ${info.device.browserVersion}` : ""} (${info.device.os})`,
    `User Agent: ${info.device.userAgent}`,
    `Screen: ${info.device.screenResolution} @ ${info.device.devicePixelRatio}x DPR`,
    `Viewport: ${info.device.viewportSize}`,
    `Mobile: ${info.device.isMobile}`,
    `TV: ${info.device.isTV}`,
    `Language: ${info.device.language}${info.device.languages.length > 1 ? ` (${info.device.languages.join(", ")})` : ""}`,
    `Cookies: ${info.device.cookiesEnabled ? "enabled" : "disabled"}`,
    `Local Storage: ${info.device.storageAvailable ? "available" : "blocked"}`,
    ``,
    `=== PLAYER STATE ===`,
    `Status: ${info.player.status}`,
    `Source ID: ${info.player.sourceId || "null"}`,
    `Embed ID: ${info.player.embedId || "null"}`,
    `Quality: ${info.player.currentQuality || "null"}`,
    info.player.meta
      ? [
          `Media: ${info.player.meta.title} (${info.player.meta.type})`,
          `TMDB ID: ${info.player.meta.tmdbId}`,
          info.player.meta.imdbId ? `IMDB ID: ${info.player.meta.imdbId}` : "",
          `Year: ${info.player.meta.releaseYear}`,
          info.player.meta.season ? `Season: ${info.player.meta.season}` : "",
          info.player.meta.episode
            ? `Episode: ${info.player.meta.episode}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "No media loaded",
    ``,
    `=== NETWORK INFO ===`,
    `Online: ${info.network.online}`,
    info.network.connectionType
      ? `Connection Type: ${info.network.connectionType}`
      : null,
    info.network.effectiveType
      ? `Effective Type: ${info.network.effectiveType}`
      : null,
    info.network.downlink ? `Downlink: ${info.network.downlink} Mbps` : null,
    info.network.rtt ? `RTT: ${info.network.rtt} ms` : null,
    info.network.saveData !== undefined
      ? `Save Data: ${info.network.saveData}`
      : null,
    ``,
    `=== PAGE INFO ===`,
    `Path: ${info.page.pathname}`,
    info.page.search ? `Query: ${info.page.search}` : null,
    info.page.hash ? `Hash: ${info.page.hash}` : null,
    `Referrer: ${info.page.referrer}`,
    `Document State: ${info.page.documentReadyState}`,
    `Visibility: ${info.page.visibilityState}`,
    info.page.pageLoadMs !== undefined
      ? `Page Load: ${info.page.pageLoadMs} ms`
      : null,
    info.page.timeSincePageLoadMs !== undefined
      ? `Time Since Load: ${info.page.timeSincePageLoadMs} ms`
      : null,
    ``,
    info.hls
      ? [
          `=== HLS ERROR DETAILS ===`,
          `Details: ${info.hls.details}`,
          `Fatal: ${info.hls.fatal}`,
          `Type: ${info.hls.type}`,
          info.hls.level !== undefined ? `Level: ${info.hls.level}` : "",
          info.hls.url ? `URL: ${info.hls.url}` : "",
          info.hls.levelDetails
            ? [
                `Level Details:`,
                `  URL: ${info.hls.levelDetails.url}`,
                `  Resolution: ${info.hls.levelDetails.width}x${info.hls.levelDetails.height}`,
                `  Bitrate: ${info.hls.levelDetails.bitrate} bps`,
              ].join("\n")
            : "",
          info.hls.frag
            ? [
                `Fragment Details:`,
                `  URL: ${info.hls.frag.url}`,
                `  Base URL: ${info.hls.frag.baseurl}`,
                `  Duration: ${info.hls.frag.duration}s`,
                `  Start: ${info.hls.frag.start}s`,
                `  Sequence: ${info.hls.frag.sn}`,
              ].join("\n")
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : null,
    info.hls ? `` : null,
    `=== PERFORMANCE ===`,
    info.performance.memory
      ? [
          `Memory Used: ${Math.round(info.performance.memory.usedJSHeapSize / 1024 / 1024)} MB`,
          `Memory Total: ${Math.round(info.performance.memory.totalJSHeapSize / 1024 / 1024)} MB`,
          `Memory Limit: ${Math.round(info.performance.memory.jsHeapSizeLimit / 1024 / 1024)} MB`,
        ].join("\n")
      : "Memory info not available",
  ];

  return sections.filter((s) => s !== null && s !== undefined).join("\n");
}

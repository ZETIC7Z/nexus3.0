import { detect, detectOS } from "detect-browser";

interface UAData {
  platform?: string;
  platformVersion?: string;
  model?: string;
  mobile?: boolean;
  brands?: Array<{ brand: string; version: string }>;
}

function getUAData(): UAData | null {
  try {
    const nav = navigator as Navigator & { userAgentData?: UAData };
    return nav.userAgentData ?? null;
  } catch {
    return null;
  }
}

/** Best-effort device model (e.g. "Poco X6 Pro 5G", "iPhone 15"). */
function detectModel(ua: UAData | null): string | null {
  if (ua?.model) return ua.model;
  // Fall back to a couple of well-known iOS markers in the UA string.
  const uaString = navigator.userAgent;
  const iosMatch = uaString.match(/\(([^)]*iPhone[^)]*)\)/i);
  if (iosMatch) {
    const m = uaString.match(/CPU iPhone OS (\d+[_\d]*)/);
    if (m) return `iPhone (iOS ${m[1].replace(/_/g, ".")})`;
  }
  return null;
}

/** Human-friendly OS name, e.g. "Android 14", "Windows 11", "macOS 14.3". */
function detectOSLabel(ua: UAData | null): string {
  const os = detectOS(navigator.userAgent);
  if (ua?.platform) {
    const platform = ua.platform.toLowerCase();
    if (platform.includes("win")) {
      const v = ua.platformVersion;
      return v ? `Windows ${v}` : "Windows";
    }
    if (platform.includes("mac")) {
      const v = ua.platformVersion;
      return v ? `macOS ${v}` : "macOS";
    }
    if (platform.includes("android")) {
      const v = ua.platformVersion;
      return v ? `Android ${v}` : "Android";
    }
  }
  return os ?? "Unknown OS";
}

/** Browser name + version, e.g. "Chrome 124", "Safari 17.2". */
function detectBrowserLabel(): string {
  const info = detect();
  if (!info?.name) return "Unknown Browser";
  const name = info.name;
  const version = info.version ? ` ${info.version.split(".")[0]}` : "";
  return `${name}${version}`;
}

/**
 * A short, human-readable label describing the current device, e.g.
 * "Poco X6 Pro 5G · Android 14 · Chrome 124". This is what gets stored as
 * the session's device name so users can recognise which device logged in.
 */

/** Parse a session user-agent string into a short device description. */
export function parseUserAgentDevice(userAgent?: string): string | null {
  if (!userAgent) return null;
  const parts: string[] = [];
  try {
    const info = detect(userAgent);
    if (info?.name) {
      parts.push(info.name + (info.version ? " " + info.version.split(".")[0] : ""));
    }
    const os = detectOS(userAgent);
    if (os) parts.push(os);
  } catch {
    /* best-effort only */
  }
  const android = userAgent.match(/Android [0-9.]+; ([^;)]+)/i);
  if (android && android[1] && !parts.some((p) => p.toLowerCase().includes("android"))) {
    parts.unshift(android[1].trim());
  }
  return parts.length ? parts.join(" · ") : null;
}

export function detectDeviceLabel(): string {
  const ua = getUAData();
  const model = detectModel(ua);
  const os = detectOSLabel(ua);
  const browser = detectBrowserLabel();
  const parts = [model, os, browser].filter(
    (p): p is string => !!p && p !== "Unknown OS" && p !== "Unknown Browser",
  );
  return parts.join(" · ") || "Unknown device";
}

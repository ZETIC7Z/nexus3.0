import Hls from "hls.js";
import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { getLoadbalancedProxyUrl } from "@/backend/providers/fetchers";

const DefaultLoader: any = (Hls as any).DefaultConfig.loader;

const ARTEMIS_HOST_RE = /(^|\.)shegu\.net$/i;

function isArtemisUrl(url: string): boolean {
  if (!url) return false;
  try {
    const checkUrl = url.includes("destination=")
      ? decodeURIComponent(new URL(url).searchParams.get("destination") ?? "")
      : url;
    return ARTEMIS_HOST_RE.test(new URL(checkUrl).hostname);
  } catch {
    return false;
  }
}

function bodyText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) {
    if (data.byteLength === 0 || data.byteLength > 4096) return "";
    try {
      return new TextDecoder().decode(new Uint8Array(data));
    } catch {
      return "";
    }
  }
  if (data instanceof Uint8Array) {
    if (data.byteLength === 0 || data.byteLength > 4096) return "";
    try {
      return new TextDecoder().decode(data);
    } catch {
      return "";
    }
  }
  return "";
}

function looksLike403Body(t: string): boolean {
  if (!t) return false;
  if (/#EXTM3U/.test(t)) return false;
  return /\b403\b/.test(t) || /forbidden/i.test(t);
}

const MAX_RETRIES = 12;
const BASE_DELAY = 250;
const MAX_DELAY = 3000;

export class ArtemisRetryLoader extends DefaultLoader {
  private _retryTimer?: ReturnType<typeof setTimeout>;

  load(context: any, config: any, callbacks: any): void {
    let url: string = context?.url ?? "";

    if (!isExtensionActiveCached()) {
      const proxyBase = getLoadbalancedProxyUrl();
      if (proxyBase && url && !url.includes("destination=") && !url.includes("m3u8-proxy")) {
        context.url = `${proxyBase}?destination=${encodeURIComponent(url)}`;
        url = context.url;
      }
    }

    if (!isArtemisUrl(url)) {
      super.load(context, config, callbacks);
      return;
    }

    const originalSuccess = callbacks.onSuccess;
    let attempts = 0;
    let delay = BASE_DELAY;

    const guardedSuccess = (response: any, stats: any, ctx: any, net: any) => {
      const txt = bodyText(response?.data);
      if (looksLike403Body(txt) && attempts < MAX_RETRIES) {
        attempts += 1;
        const wait = delay;
        delay = Math.min(delay * 2, MAX_DELAY);
        this._retryTimer = setTimeout(() => {
          this._retryTimer = undefined;
          super.load(context, config, { ...callbacks, onSuccess: guardedSuccess });
        }, wait);
        return;
      }
      originalSuccess(response, stats, ctx, net);
    };

    super.load(context, config, { ...callbacks, onSuccess: guardedSuccess });
  }

  abort(): void {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = undefined;
    }
    super.abort();
  }

  destroy(): void {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = undefined;
    }
    super.destroy();
  }
}

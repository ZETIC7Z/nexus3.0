declare global {
  interface Window {
    __zsPopupAllow?: boolean;
    __zsPopupGuardInstalled?: boolean;
  }
}

export function openWindowSafely(
  url?: string | URL,
  target?: string,
  features?: string,
): WindowProxy | null {
  window.__zsPopupAllow = true;
  try {
    return window.open(url, target, features);
  } finally {
    window.__zsPopupAllow = false;
  }
}

function isWatchPagePath(pathname: string): boolean {
  return pathname.startsWith("/media/");
}


export function installPopupGuard(): void {
  if (typeof window === "undefined") return;
  if (window.__zsPopupGuardInstalled) return;

  try {
    // Check if window.open is configurable before attempting to redefine it.
    // In some environments (e.g. when React DevTools or browser extensions
    // have already patched window.open as non-configurable) defineProperty
    // throws "Cannot redefine property: open". We check first and bail out.
    const descriptor = Object.getOwnPropertyDescriptor(window, "open");
    if (descriptor && descriptor.configurable === false) {
      // Property is locked — skip guard installation silently.
      window.__zsPopupGuardInstalled = true;
      return;
    }

    const nativeOpen = window.open.bind(window);

    const guarded = ((...args: Parameters<typeof window.open>) => {
      if (window.__zsPopupAllow) return nativeOpen(...args);
      if (isWatchPagePath(window.location.pathname)) return null;
      return nativeOpen(...args);
    }) as typeof window.open;

    // window.open is a getter-only accessor in some browsers -- a plain
    // `window.open = guarded` assignment throws "open is read-only" under
    // strict mode (all ES modules are strict), which took the whole app
    // down since this runs synchronously before React mounts. defineProperty
    // works even when the original was accessor-defined, as long as it's
    // configurable (which it is in every browser that matters here).
    Object.defineProperty(window, "open", {
      value: guarded,
      writable: true,
      configurable: true,
    });
    window.__zsPopupGuardInstalled = true;
  } catch (err) {
    // Never let a popup-guard install failure break the app.
    console.warn("popupGuard: failed to install, skipping", err);
  }
}

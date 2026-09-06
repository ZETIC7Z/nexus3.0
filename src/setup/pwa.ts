import { registerSW } from "virtual:pwa-register";

// Older installs registered the PWA worker at /sw.js — that path now belongs
// to Monetag's verification service worker. Unregister any legacy worker so
// it can neither intercept Monetag's file nor serve stale app shells.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      regs.forEach((r) => {
        const url = new URL(r.active?.scriptURL || "", location.href).pathname;
        if (url === "/sw.js") r.unregister();
      });
    })
    .catch(() => {
      /* best-effort */
    });
}

const intervalMS = 60 * 60 * 1000;

registerSW({
  immediate: true,
  onRegisteredSW(swUrl, r) {
    if (!r) return;
    setInterval(async () => {
      if (!(!r.installing && navigator)) return;

      if ("connection" in navigator && !navigator.onLine) return;

      const resp = await fetch(swUrl, {
        cache: "no-store",
        headers: {
          cache: "no-store",
          "cache-control": "no-cache",
        },
      });

      if (resp?.status === 200) {
        await r.update();
      }
    }, intervalMS);
  },
});

// Locale translation files are deliberately NOT statically imported here.
// Statically importing all ~55 locales put ~1.2 MB of JSON into the first-paint
// bundle when each visitor only ever needs one language. Instead:
//  - en.json ships statically (fallback + default language for most visitors)
//  - every other locale is code-split and loaded on demand via loadLocale()

import en from "@/assets/locales/en.json";

/** Locale codes the app can display. Static single source of truth. */
export const localeCodes = [
  "en",
  "ca",
  "ca-ES",
  "cs",
  "da",
  "de",
  "de-CH",
  "fr",
  "it",
  "nl",
  "pl",
  "tr",
  "vi",
  "zh",
  "he",
  "sv",
  "pirate",
  "kitty",
  "uwu",
  "minion",
  "futhark",
  "lv",
  "th",
  "ne",
  "ar",
  "es",
  "et",
  "tok",
  "hi",
  "pt-BR",
  "pt-PT",
  "uk",
  "bg",
  "bn",
  "el",
  "fa",
  "gu",
  "id",
  "ja",
  "ko",
  "sl",
  "ta",
  "zh-Hant",
  "is",
  "ru",
  "gl",
  "pa",
  "ro",
  "fi",
  "nv",
  "hu",
  "km",
  "si",
  "umb",
  "ur-PK",
] as const;

export type Locales = (typeof localeCodes)[number];

/** App language code -> lazy loader for its translation json. */
const loaders: Record<string, () => Promise<{ default: unknown }>> = {
  ar: () => import("@/assets/locales/ar.json"),
  bg: () => import("@/assets/locales/bg.json"),
  bn: () => import("@/assets/locales/bn.json"),
  ca: () => import("@/assets/locales/ca.json"),
  "ca-ES": () => import("@/assets/locales/ca@valencia.json"),
  cs: () => import("@/assets/locales/cs.json"),
  da: () => import("@/assets/locales/da.json"),
  "de-CH": () => import("@/assets/locales/de-CH.json"),
  de: () => import("@/assets/locales/de.json"),
  el: () => import("@/assets/locales/el.json"),
  es: () => import("@/assets/locales/es.json"),
  et: () => import("@/assets/locales/et.json"),
  fa: () => import("@/assets/locales/fa.json"),
  fi: () => import("@/assets/locales/fi-FI.json"),
  fr: () => import("@/assets/locales/fr.json"),
  futhark: () => import("@/assets/locales/futhark.json"),
  gl: () => import("@/assets/locales/gl.json"),
  gu: () => import("@/assets/locales/gu.json"),
  he: () => import("@/assets/locales/he.json"),
  hi: () => import("@/assets/locales/hi.json"),
  hu: () => import("@/assets/locales/hu.json"),
  id: () => import("@/assets/locales/id.json"),
  is: () => import("@/assets/locales/is-IS.json"),
  it: () => import("@/assets/locales/it.json"),
  ja: () => import("@/assets/locales/ja.json"),
  kitty: () => import("@/assets/locales/kitty.json"),
  km: () => import("@/assets/locales/km.json"),
  ko: () => import("@/assets/locales/ko.json"),
  lv: () => import("@/assets/locales/lv.json"),
  minion: () => import("@/assets/locales/minion.json"),
  ne: () => import("@/assets/locales/ne.json"),
  nl: () => import("@/assets/locales/nl.json"),
  nv: () => import("@/assets/locales/nv.json"),
  pa: () => import("@/assets/locales/pa.json"),
  pirate: () => import("@/assets/locales/pirate.json"),
  pl: () => import("@/assets/locales/pl.json"),
  "pt-BR": () => import("@/assets/locales/pt-BR.json"),
  "pt-PT": () => import("@/assets/locales/pt-PT.json"),
  ro: () => import("@/assets/locales/ro.json"),
  ru: () => import("@/assets/locales/ru.json"),
  si: () => import("@/assets/locales/si.json"),
  sl: () => import("@/assets/locales/sl.json"),
  sv: () => import("@/assets/locales/sv.json"),
  ta: () => import("@/assets/locales/ta.json"),
  th: () => import("@/assets/locales/th.json"),
  tok: () => import("@/assets/locales/tok.json"),
  tr: () => import("@/assets/locales/tr.json"),
  uk: () => import("@/assets/locales/uk.json"),
  umb: () => import("@/assets/locales/umb.json"),
  "ur-PK": () => import("@/assets/locales/ur_PK.json"),
  uwu: () => import("@/assets/locales/uwu.json"),
  vi: () => import("@/assets/locales/vi.json"),
  "zh-Hant": () => import("@/assets/locales/zh-Hant.json"),
  zh: () => import("@/assets/locales/zh.json"),
};

const loadedLocales = new Map<string, unknown>();

export function isLocaleSupported(code: string): boolean {
  return code === "en" || !!loaders[code];
}

/** Static fallback + default language. Ships in the first-paint bundle. */
export const staticEnglish = en as Record<string, unknown>;

/**
 * Load one locale's translations on demand (cached after first load).
 * Resolves to the translation object, or null when unsupported/failed.
 */
export async function loadLocale(
  code: string,
): Promise<Record<string, unknown> | null> {
  if (code === "en") return staticEnglish;
  const cached = loadedLocales.get(code);
  if (cached) return cached as Record<string, unknown>;
  const loader = loaders[code];
  if (!loader) return null;
  try {
    const mod = await loader();
    const data = (mod.default ?? mod) as Record<string, unknown>;
    loadedLocales.set(code, data);
    return data;
  } catch (err) {
    console.warn(`Failed to load locale "${code}"`, err);
    return null;
  }
}

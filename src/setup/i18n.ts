import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import {
  getLightLocaleInfo,
  populateLanguageCode,
} from "@/utils/locale/language";
import {
  isLocaleSupported,
  loadLocale,
  localeCodes,
  staticEnglish,
} from "@/utils/locale/localeMap";

// Only English ships in the first-paint bundle; every other locale is
// code-split and loaded on demand by ensureLanguageLoaded(). This keeps
// ~1.2 MB of translation JSON for 54 unused languages off the critical path.
i18n.use(initReactI18next).init({
  fallbackLng: "en",
  partialBundledLanguages: true,
  resources: {
    en: { translation: staticEnglish },
  },
  interpolation: {
    escapeValue: false, // not needed for react as it escapes by default
  },
});

export const appLanguageOptions = localeCodes.map((lang) =>
  getLightLocaleInfo(lang),
);

const loadedCodes = new Set<string>(["en"]);

/**
 * Make sure translations for a language are loaded, then switch to it.
 * Falls back to English when a language cannot be loaded (e.g. offline).
 */
export async function ensureLanguageLoaded(code: string): Promise<void> {
  // A stored code may resolve to a regional variant we ship ("pt" -> "pt-BR").
  const candidates = Array.from(
    new Set([code, populateLanguageCode(code), code.split("-")[0]]),
  ).filter((c): c is string => !!c && isLocaleSupported(c));

  let resolved: string | null = null;
  for (const candidate of candidates) {
    if (loadedCodes.has(candidate)) {
      resolved = candidate;
      break;
    }
    const data = await loadLocale(candidate);
    if (data) {
      i18n.addResourceBundle(candidate, "translation", data, true, true);
      loadedCodes.add(candidate);
      resolved = candidate;
      break;
    }
  }

  const target = resolved ?? "en";
  if (i18n.language !== target) await i18n.changeLanguage(target);

  // Cosmetic quirk preserved from the old getLocaleInfo(): the runic
  // futhark "translation" needs extra word spacing to be readable.
  document.body.style.wordSpacing = target === "futhark" ? "5px" : "normal";
}

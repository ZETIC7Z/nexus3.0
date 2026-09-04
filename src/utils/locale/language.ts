// Light-weight language utilities that are safe to import on the boot path.
// The heavy language database (@ladjs/country-language + ietf-language-tags,
// ~1.1 MB) lives in ./languageFull and is only imported by settings UI —
// nothing here may import it.

const languageOrder = ["en", "hi", "fr", "de", "nl", "pt"];

// mapping of language code to country code.
// multiple mappings can exist, since languages are spoken in multiple countries.
// This mapping purely exists to prioritize a country over another in languages where the base language code does
// not contain a region (i.e. if the language code is zh-Hant where Hant is a script) or if the region in the language code is incorrect
// iso639_1 -> iso3166 Alpha-2
// list of iso639_1 Alpha-2 codes used as default languages
const defaultLanguageCodes: string[] = [
  "ar-SA",
  "bg-BG",
  "bn-BD",
  "cs-CZ",
  "ca-AD",
  "da-DK",
  "de-DE",
  "de-CH",
  "el-GR",
  "en-US",
  "es-ES",
  "et-EE",
  "fa-IR",
  "fr-FR",
  "gl-ES",
  "gu-IN",
  "he-IL",
  "id-ID",
  "it-IT",
  "ja-JP",
  "ko-KR",
  "lv-LV",
  "ne-NP",
  "nl-NL",
  "pl-PL",
  "pt-BR",
  "ru-RU",
  "sl-SI",
  "sv-SE",
  "ta-LK",
  "th-TH",
  "tr-TR",
  "vi-VN",
  "zh-CN",
  "nv-US",
];

export interface LocaleInfo {
  name: string;
  nativeName?: string;
  code: string;
  isRtl?: boolean;
}

const extraLanguages: Record<string, LocaleInfo> = {
  pirate: {
    code: "pirate",
    name: "Pirate",
    nativeName: "Pirate Tongue",
  },
  kitty: {
    code: "cat",
    name: "Cat",
    nativeName: "Kitty Speak",
  },
  uwu: {
    code: "uwu",
    name: "Cutsie OwO",
    nativeName: "UwU",
  },
  minion: {
    code: "minion",
    name: "Minion",
    nativeName: "Minionese",
  },
  tok: {
    code: "tok",
    name: "Toki pona",
    nativeName: "Toki pona",
  },
  futhark: {
    code: "futhark",
    name: "Elder Futhark (EN)",
    nativeName: "ᛖᛚᛞᛖᚱ ᚠᚢᚦᚨᚱᚲ",
  },
};

// Languages written right-to-left. This fixed set replaces the old
// country-language database lookup for the boot path (direction only).
const rtlLanguageCodes = ["ar", "he", "fa", "ur", "ps", "sd", "ug", "yi"];

export function populateLanguageCode(language: string): string {
  if (language.includes("-")) return language;
  if (language.length !== 2) return language;
  return (
    defaultLanguageCodes.find((v) => v.startsWith(`${language}-`)) ?? language
  );
}

/**
 * Boot-safe locale info without any language database. Code resolution uses
 * the same default-region mapping as before; display names for the standard
 * languages are resolved by the heavy variant in languageFull (settings UI).
 * @param locale locale code in ietf-ish format
 * @returns minimal locale info
 */
export function getLightLocaleInfo(locale: string): LocaleInfo {
  const realLocale = populateLanguageCode(locale);
  const extraLang = extraLanguages[locale] ?? extraLanguages[realLocale];
  if (extraLang) return { ...extraLang };
  const base = realLocale.split("-")[0];
  return {
    code: realLocale,
    isRtl: rtlLanguageCodes.includes(base),
    name: locale,
  };
}

/**
 * Sort locale codes by occurrence, rest on alphabetical order
 * @param langCodes list language codes to sort
 * @param appLanguage optional app language to prioritize
 * @returns sorted version of inputted list
 */
export function sortLangCodes(langCodes: string[], appLanguage?: string) {
  const languagesOrder = [...languageOrder];
  if (appLanguage && !languagesOrder.includes(appLanguage)) {
    languagesOrder.unshift(appLanguage);
  }
  const reversedOrder = [...languagesOrder].reverse(); // Reverse is necessary, not sure why

  const results = langCodes.sort((a, b) => {
    const langOrderA = reversedOrder.findIndex(
      (v) => a.startsWith(`${v}-`) || a === v,
    );
    const langOrderB = reversedOrder.findIndex(
      (v) => b.startsWith(`${v}-`) || b === v,
    );
    if (langOrderA !== -1 || langOrderB !== -1) return langOrderB - langOrderA;

    return a.localeCompare(b);
  });

  return results;
}

/**
 * Converts a language code to a TMDB-compatible format (ISO 639-1 with region)
 * @param language The language code to convert
 * @returns A TMDB-compatible language code (e.g., "en-US", "el-GR")
 */
export function getTmdbLanguageCode(language: string): string {
  // Handle empty or undefined
  if (!language) return "en-US";

  // If it already has a region code (e.g., "en-US"), use it directly
  if (language.includes("-")) return language;

  // Handle special/custom languages by defaulting to English
  if (language.length > 2 || Object.keys(extraLanguages).includes(language))
    return "en-US";

  // For standard language codes, find the appropriate region from the existing defaultLanguageCodes array
  const defaultCode = defaultLanguageCodes.find((code) =>
    code.startsWith(`${language}-`),
  );

  if (defaultCode) return defaultCode;

  // If we can't find a good match, create a standard format like "fr-FR" from "fr"
  if (language.length === 2) {
    return `${language}-${language.toUpperCase()}`;
  }

  // Last resort fallback
  return "en-US";
}

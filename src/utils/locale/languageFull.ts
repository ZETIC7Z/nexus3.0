// Heavy language utilities backed by the full country-language database
// (~1.1 MB). Anything importing this file pulls that database into its chunk,
// so only settings/preferences UI should use these. Boot-path code must use
// the light variants from ./language instead.

import countryLanguages, { LanguageObj } from "@ladjs/country-language";
import { getTag } from "@sozialhelden/ietf-language-tags";
import { iso6393To1 } from "iso-639-3";

import {
  LocaleInfo,
  populateLanguageCode,
} from "@/utils/locale/language";

const countryPriority: Record<string, string> = {
  zh: "cn",
  nv: "us",
};

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

/**
 * @param locale idk what kinda code this takes, anything in ietf format I guess
 * @returns pretty format for language, null if it no info can be found for language
 */
export function getPrettyLanguageNameFromLocale(locale: string): string | null {
  const tag =
    locale.length === 3
      ? getTag(iso6393To1[locale] ?? locale, true)
      : getTag(locale, true);
  const lang = tag?.language?.Description?.[0] ?? null;
  if (!lang) return null;

  const region = tag?.region?.Description?.[0] ?? null;
  let regionText = "";
  if (region) regionText = ` (${region})`;

  return `${lang}${regionText}`;
}

/**
 * Get country code for locale
 * @param locale input locale
 * @returns country code or null
 */
export function getCountryCodeForLocale(locale: string): string | null {
  let output: LanguageObj | null = null as any as LanguageObj;
  const tag = getTag(populateLanguageCode(locale), true);

  if (!tag?.language?.Subtag) return null;
  // this function isn't async, so its guaranteed to work like this
  countryLanguages.getLanguage(tag.language.Subtag, (_err, lang) => {
    if (lang) output = lang;
  });

  if (!output) return null;
  const iso = output.iso639_1?.toLowerCase();
  const priority = iso ? countryPriority[iso] : undefined;
  if (output.countries.length === 0) {
    return priority ?? null;
  }

  if (priority) {
    const prioritizedCountry = output.countries.find(
      (v) => v.code_2?.toLowerCase() === priority,
    );
    if (prioritizedCountry?.code_2)
      return prioritizedCountry.code_2.toLowerCase();
  }

  // If the language contains a region, check that against the countries and
  // return the region if it matches
  const regionSubtag = tag?.region?.Subtag?.toLowerCase();
  if (regionSubtag) {
    const regionCode = output.countries.find(
      (c) =>
        c.code_2?.toLowerCase() === regionSubtag ||
        c.code_3?.toLowerCase() === regionSubtag,
    );
    if (regionCode?.code_2) return regionCode.code_2.toLowerCase();
  }

  const firstWithCode = output.countries.find((c) => !!c.code_2);
  return firstWithCode?.code_2 ? firstWithCode.code_2.toLowerCase() : null;
}

/**
 * Get information for a specific local
 * @param locale local code
 * @returns locale object
 */
export function getLocaleInfo(locale: string): LocaleInfo | null {
  const realLocale = populateLanguageCode(locale);

  document.body.style.wordSpacing = "normal";

  const extraLang = extraLanguages[realLocale];
  if (extraLang) {
    if (extraLang.code === "futhark") {
      document.body.style.wordSpacing = "5px";
    }
    return extraLang;
  }

  const tag = getTag(realLocale, true);
  if (!tag?.language?.Subtag) return null;

  let output: LanguageObj | null = null as any as LanguageObj;
  // this function isnt async, so its garuanteed to work like this
  countryLanguages.getLanguage(tag.language.Subtag, (_err, lang) => {
    if (lang) output = lang;
  });
  if (!output) return null;

  const extras = [];
  if (tag.region?.Description) extras.push(tag.region.Description[0]);
  if (tag.script?.Description) extras.push(tag.script.Description[0]);
  const extraStringified = extras.map((v) => `(${v})`).join(" ");

  return {
    code: tag.parts.langtag ?? realLocale,
    isRtl: output.direction === "RTL",
    name: output.name[0] + (extraStringified ? ` ${extraStringified}` : ""),
    nativeName: output.nativeName[0] ?? undefined,
  };
}

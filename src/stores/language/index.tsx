import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { ensureLanguageLoaded } from "@/setup/i18n";
import { getLightLocaleInfo } from "@/utils/locale/language";

export interface LanguageStore {
  language: string;
  setLanguage(v: string): void;
}

export const useLanguageStore = create(
  persist(
    immer<LanguageStore>((set) => ({
      language: navigator.language.split("-")[0],
      setLanguage(v) {
        set((s) => {
          s.language = v;
        });
      },
    })),
    { name: "__MW::locale" },
  ),
);

export function changeAppLanguage(language: string) {
  // ensureLanguageLoaded lazy-loads the locale bundle, resolves regional
  // variants and falls back to English when a locale cannot load.
  void ensureLanguageLoaded(language);
}

export function isRightToLeft(language: string) {
  return getLightLocaleInfo(language).isRtl === true;
}

export function LanguageProvider() {
  const language = useLanguageStore((s) => s.language);

  useEffect(() => {
    changeAppLanguage(language);
  }, [language]);

  const isRtl = isRightToLeft(language);

  return (
    <Helmet>
      <html dir={isRtl ? "rtl" : "ltr"} />
    </Helmet>
  );
}

import React, { createContext, useContext, useState, useCallback } from "react";
import type { Locale } from "./translations";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (obj: Record<string, string> | { fr: string; en: string }) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: "fr",
  setLocale: () => {},
  t: (obj) => (obj as any).fr ?? "",
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem("pulse-lang");
    return (stored === "en" || stored === "fr") ? stored : "fr";
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("pulse-lang", l);
  }, []);

  const t = useCallback(
    (obj: Record<string, string> | { fr: string; en: string }) => {
      return (obj as any)[locale] ?? (obj as any).fr ?? "";
    },
    [locale]
  );

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);

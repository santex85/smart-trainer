import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { en, ru, type Locale } from "./translations";

const STORAGE_KEY = "tssproai-landing-locale";

function get(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const p of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  return typeof current === "string" ? current : undefined;
}

const messages: Record<Locale, Record<string, unknown>> = {
  en: en as unknown as Record<string, unknown>,
  ru: ru as unknown as Record<string, unknown>,
};

type I18nValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "ru" || stored === "en") return stored;
  return "en";
}

export function LandingI18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocaleState(getInitialLocale());
    setMounted(true);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, next);
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = next === "ru" ? "ru" : "en";
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.lang = locale === "ru" ? "ru" : "en";
    const title = locale === "ru"
      ? "tssproAI — ИИ-система для атлетов на выносливость"
      : "tssproAI — AI system for endurance athletes";
    const desc = locale === "ru"
      ? "Питание, сон, нагрузка и дневная готовность в одном приложении. Конкретные рекомендации ИИ, а не только графики."
      : "Track nutrition, sleep, training load and daily readiness in one app. Get actionable AI guidance, not just charts.";
    document.title = title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", desc);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute("content", desc);
  }, [locale, mounted]);

  const t = useCallback(
    (key: string): string => {
      const data = messages[locale];
      const out = get(data, key);
      return out ?? get(messages.en as Record<string, unknown>, key) ?? key;
    },
    [locale]
  );

  const value = useMemo<I18nValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLandingTranslation(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useLandingTranslation must be used within LandingI18nProvider");
  return ctx;
}

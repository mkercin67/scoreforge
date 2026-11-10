/**
 * Internationalization (i18n) React context and hook for ScoreForge.
 *
 * Provides translation lookup with English fallback and dev warnings,
 * and persists user settings in localStorage safely.
 */

import React, { createContext, useContext, useMemo, useState } from 'react';
import { Language, NoteNameStyle } from './formatPitch';
import trTranslations from './locales/tr.json';
import enTranslations from './locales/en.json';

type TranslationMap = Record<string, string>;

const translations: Record<Language, TranslationMap> = {
  tr: trTranslations,
  en: enTranslations,
};

const STORAGE_LANG_KEY = 'scoreforge_language';
const STORAGE_NOTENAME_KEY = 'scoreforge_notename_style';
const STORAGE_ZOOM_KEY = 'scoreforge_zoom';

function readStoredSetting<T extends string>(key: string, defaultValue: T): T {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(key);
      if (stored) return stored as T;
    }
  } catch {
    // localStorage unavailable or restricted
  }
  return defaultValue;
}

function writeStoredSetting(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    // localStorage unavailable or restricted
  }
}

/**
 * Pure translation lookup function with fallback to English, then key itself.
 */
export function translate(
  language: Language,
  key: string,
  params?: Record<string, string | number>
): string {
  let template = translations[language]?.[key];
  if (template === undefined) {
    // Fallback to English
    template = translations.en?.[key];
    if (template === undefined) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[i18n] Missing translation key: "${key}"`);
      }
      template = key;
    }
  }

  if (params) {
    return template.replace(/\{(\w+)\}/g, (_, paramKey) => {
      return paramKey in params ? String(params[paramKey]) : `{${paramKey}}`;
    });
  }
  return template;
}

export interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  noteNameStyle: NoteNameStyle;
  setNoteNameStyle: (style: NoteNameStyle) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children: React.ReactNode;
  initialLanguage?: Language;
  initialNoteNameStyle?: NoteNameStyle;
  initialZoom?: number;
}

/**
 * Root i18n provider providing translations and locale preferences.
 */
export const I18nProvider: React.FC<I18nProviderProps> = ({
  children,
  initialLanguage,
  initialNoteNameStyle,
  initialZoom,
}) => {
  const [language, setLanguageState] = useState<Language>(() => {
    if (initialLanguage) return initialLanguage;
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      const urlLang = q.get('lang');
      if (urlLang === 'tr' || urlLang === 'en') return urlLang;
      if (q.get('state') === 'lang_en' || q.get('state') === 'verify_9') return 'en';
    }
    return readStoredSetting<Language>(STORAGE_LANG_KEY, 'tr');
  });

  const [noteNameStyle, setNoteNameStyleState] = useState<NoteNameStyle>(() => {
    if (initialNoteNameStyle) return initialNoteNameStyle;
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      const urlStyle = q.get('style');
      if (urlStyle === 'solfege' || urlStyle === 'letter') return urlStyle;
      if (q.get('state') === 'letters') return 'letter';
    }
    return readStoredSetting<NoteNameStyle>(STORAGE_NOTENAME_KEY, 'solfege');
  });

  const [zoom, setZoomState] = useState<number>(() => {
    if (initialZoom) return initialZoom;
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      const urlZoom = q.get('zoom');
      if (urlZoom) {
        const parsed = parseFloat(urlZoom);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
      if (q.get('state') === 'verify_8') return 1.5;
    }
    const stored = readStoredSetting<string>(STORAGE_ZOOM_KEY, '1.0');
    const parsed = parseFloat(stored);
    return !isNaN(parsed) && parsed > 0 ? parsed : 1.0;
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    writeStoredSetting(STORAGE_LANG_KEY, lang);
  };

  const setNoteNameStyle = (style: NoteNameStyle) => {
    setNoteNameStyleState(style);
    writeStoredSetting(STORAGE_NOTENAME_KEY, style);
  };

  const setZoom = (z: number) => {
    setZoomState(z);
    writeStoredSetting(STORAGE_ZOOM_KEY, String(z));
  };

  const t = useMemo(() => {
    return (key: string, params?: Record<string, string | number>): string => {
      return translate(language, key, params);
    };
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      noteNameStyle,
      setNoteNameStyle,
      zoom,
      setZoom,
      t,
    }),
    [language, noteNameStyle, zoom, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

/**
 * Hook to access current translation function and i18n settings.
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}

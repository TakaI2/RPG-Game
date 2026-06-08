const LOCALE_STORAGE_KEY = 'rpg_locale'

export const SUPPORTED_LOCALES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'es', label: 'Español' },
] as const

export type Locale = typeof SUPPORTED_LOCALES[number]['code']

export function getLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored && SUPPORTED_LOCALES.some(l => l.code === stored)) {
      return stored as Locale
    }
  } catch { /* ignore */ }
  return 'ja'
}

export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch { /* ignore */ }
}

/**
 * i18n フィールドを使って現在の言語に解決する。
 * 日本語か翻訳が見つからない場合は base をそのまま返す。
 */
export function resolveText<T extends object>(base: T, i18n?: Record<string, Partial<T>>): T {
  const lang = getLocale()
  if (lang === 'ja' || !i18n?.[lang]) return base
  return { ...base, ...i18n[lang] }
}

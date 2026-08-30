export type Locale = 'en' | 'ko'
export const LOCALE_STORAGE_KEY = 'voyage-ui-locale'

/** English source messages are also the fallback catalog. Game identifiers and
 * clipboard text must never be translated before parsing or persistence. */
export type MessageValues = Readonly<Record<string, string | number | null | undefined>>
export type UiMessage =
  | string
  | { source: string; values?: MessageValues }
  | { parts: readonly UiMessage[]; separator: string }

/** Preserve source messages in state so a later language change can translate
 * them again. Translation happens only at the rendering boundary. */
export function message(source: string, values?: MessageValues): UiMessage {
  return { source, values }
}

export function joinMessages(parts: readonly UiMessage[], separator = '; '): UiMessage {
  return { parts, separator }
}

let koreanMessages: Readonly<Record<string, string>> = {}
let koreanCatalog: Promise<void> | undefined
let selectionVersion = 0

async function loadCatalog(locale: Locale): Promise<Locale> {
  if (locale === 'en') return locale
  try {
    koreanCatalog ??= import('./ko').then((catalog) => {
      koreanMessages = catalog.koreanMessages
    })
    await koreanCatalog
    return locale
  } catch {
    // A failed optional language download must leave a usable English UI.
    koreanCatalog = undefined
    return 'en'
  }
}

export function supportedLocale(value: string | null | undefined): Locale | null {
  const language = value?.trim().toLowerCase().split(/[-_]/)[0]
  return language === 'en' || language === 'ko' ? language : null
}

export function resolveLocale(
  languages: readonly string[],
  savedPreference?: string | null,
): Locale {
  const saved = supportedLocale(savedPreference)
  if (saved) return saved
  for (const language of languages) {
    const locale = supportedLocale(language)
    if (locale) return locale
  }
  return 'en'
}

export function formatNumberForLocale(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value)
}

export function translate(locale: Locale, message: string, values?: MessageValues): string {
  const translated =
    locale === 'ko' && Object.prototype.hasOwnProperty.call(koreanMessages, message)
      ? koreanMessages[message]
      : message
  if (!values) return translated
  return translated.replace(/\{(\w+)\}/g, (placeholder, key: string) => {
    const value = values[key]
    if (!Object.prototype.hasOwnProperty.call(values, key)) return placeholder
    return typeof value === 'number' ? formatNumberForLocale(locale, value) : String(value)
  })
}

let selectedLocale: Locale = 'en'
const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return selectedLocale
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function applyLocale(locale: Locale): void {
  selectedLocale = locale
  if (typeof document !== 'undefined') document.documentElement.lang = locale
  for (const listener of listeners) listener()
}

/** Called after the anti-framing guard, before the first application render. */
export async function initializeLocale(): Promise<Locale> {
  const version = ++selectionVersion
  let saved: string | null = null
  try {
    saved = localStorage.getItem(LOCALE_STORAGE_KEY)
  } catch {
    // Private browsing or blocked storage must not prevent language selection.
  }
  const languages =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language]
  const locale = await loadCatalog(resolveLocale(languages, saved))
  if (version === selectionVersion) applyLocale(locale)
  return locale
}

export async function setLocale(locale: Locale): Promise<void> {
  const version = ++selectionVersion
  const availableLocale = await loadCatalog(locale)
  if (version !== selectionVersion) return
  applyLocale(availableLocale)
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, availableLocale)
  } catch {
    // Selection still works for this visit when browser storage is unavailable.
  }
}

export function t(message: string, values?: MessageValues): string {
  return translate(selectedLocale, message, values)
}

/** Render boundary for existing data-driven UI copy and numeric values. Keep
 * canonical game names, regexes, dates, and editable input values unmodified. */
export function ui(value: UiMessage | number): string
export function ui(value: UiMessage | number | undefined): string | undefined
export function ui(value: UiMessage | number | null): string | null
export function ui(value: UiMessage | number | null | undefined): string | null | undefined
export function ui(value: UiMessage | number | null | undefined): string | null | undefined {
  if (value && typeof value === 'object') {
    return 'parts' in value
      ? value.parts.map((part) => ui(part)).join(value.separator)
      : t(value.source, value.values)
  }
  return typeof value === 'number' ? formatNumber(value) : value == null ? value : t(value)
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return formatNumberForLocale(selectedLocale, value, options)
}

export function formatDecimal(value: number, digits = 1): string {
  return formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

import type { LanguageCode, LanguageDescriptor } from '../types';

export const languageCatalogue: readonly LanguageDescriptor[] = [
  { code: 'it', label: 'Italiano', flag: '🇮🇹', transliterationRequired: false, locale: 'it-IT' },
  { code: 'en', label: 'English', flag: '🇬🇧', transliterationRequired: false, locale: 'en-US' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪', transliterationRequired: false, locale: 'de-DE' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', transliterationRequired: false, locale: 'fr-FR' },
  { code: 'es', label: 'Español', flag: '🇪🇸', transliterationRequired: false, locale: 'es-ES' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺', transliterationRequired: true, locale: 'ru-RU' },
  { code: 'ja', label: '日本語', flag: '🇯🇵', transliterationRequired: true, locale: 'ja-JP' },
  { code: 'zh', label: '中文', flag: '🇨🇳', transliterationRequired: true, locale: 'zh-CN' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', transliterationRequired: true, locale: 'ar-SA' },
  { code: 'he', label: 'עברית', flag: '🇮🇱', transliterationRequired: true, locale: 'he-IL' }
] as const;

export const transliterationCodes: Set<LanguageCode> = new Set(
  languageCatalogue.filter((lang) => lang.transliterationRequired).map((lang) => lang.code)
);

export const languageByCode: Record<LanguageCode, LanguageDescriptor> = Object.fromEntries(
  languageCatalogue.map((lang) => [lang.code, lang])
) as Record<LanguageCode, LanguageDescriptor>;

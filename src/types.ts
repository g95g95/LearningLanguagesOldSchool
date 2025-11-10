export type ScreenState = 'intro' | 'setup' | 'quiz' | 'complete' | 'insights';

export type WordEntry = {
  unknown: string;
  translation: string;
  transliteration?: string;
};

export type UserResponse = {
  word: WordEntry;
  userTranslation: string;
  userTransliteration?: string;
  isCorrect: boolean;
  revealedTransliteration: boolean;
};

export type LanguageDescriptor = {
  code: string;
  label: string;
  flag: string;
  transliterationRequired: boolean;
  locale: string;
};

export type LanguageCode = LanguageDescriptor['code'];

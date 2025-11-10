import { formatDuration } from './time';
import { languageByCode } from '../data/languages';
import type { LanguageCode, UserResponse, WordEntry } from '../types';

type ExportPayload = {
  motherLanguage: LanguageCode | null;
  learningLanguages: LanguageCode[];
  entries: WordEntry[];
  responses: UserResponse[];
  quizDuration: number;
  accuracy: number;
};

export const exportInsights = (format: 'json' | 'txt', payload: ExportPayload) => {
  const labelFor = (code: LanguageCode | null) => (code ? languageByCode[code].label : 'N/A');
  const stats = {
    motherLanguage: labelFor(payload.motherLanguage),
    learningLanguages: payload.learningLanguages.map((code) => languageByCode[code].label),
    totalWords: payload.entries.length,
    accuracy: `${payload.accuracy}%`,
    duration: formatDuration(payload.quizDuration),
    mistakes: payload.responses.filter((response) => !response.isCorrect).map((response) => ({
      word: response.word.unknown,
      translation: response.word.translation
    }))
  };

  let content: string;
  let mimeType: string;
  let extension: string;

  if (format === 'json') {
    content = JSON.stringify(stats, null, 2);
    mimeType = 'application/json';
    extension = 'json';
  } else {
    const lines = [
      `Lingua madre: ${stats.motherLanguage}`,
      `Lingue studiate: ${stats.learningLanguages.join(', ') || 'Nessuna'}`,
      `Vocaboli totali: ${stats.totalWords}`,
      `Accuratezza: ${stats.accuracy}`,
      `Durata: ${stats.duration}`,
      'Parole da ripassare:'
    ];

    if (stats.mistakes.length) {
      stats.mistakes.forEach((mistake, index) => {
        lines.push(`${index + 1}. ${mistake.word} → ${mistake.translation}`);
      });
    } else {
      lines.push('Nessuna! Performance impeccabile.');
    }

    content = lines.join('\n');
    mimeType = 'text/plain';
    extension = 'txt';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `insights.${extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
};

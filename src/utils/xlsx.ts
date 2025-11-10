import * as XLSX from 'xlsx';
import type { WordEntry } from '../types';

type ParsedRows = Array<Array<string | number>>;

type HeaderDetection =
  | { hasHeader: false }
  | {
      hasHeader: true;
      indexes: {
        unknown: number;
        translation: number;
        transliteration: number;
      };
    };

const HEADER_ALIASES = {
  unknown: ['parola', 'parola sconosciuta', 'sconosciuta', 'unknown', 'word', 'fremd'],
  translation: ['traduzione', 'translation', 'meaning', 'bedeutung', 'ubersetzung', 'übersetzung'],
  transliteration: ['traslitterazione', 'transliteration', 'trascrizione', 'transcription']
} as const;

const ALL_HEADER_KEYWORDS = [
  ...HEADER_ALIASES.unknown,
  ...HEADER_ALIASES.translation,
  ...HEADER_ALIASES.transliteration
];

const normalizeHeaderValue = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const matchesAlias = (cell: string, alias: string) => {
  if (!alias) {
    return false;
  }

  const normalizedAlias = normalizeHeaderValue(alias);
  if (!normalizedAlias) {
    return false;
  }

  return cell === normalizedAlias || cell.includes(normalizedAlias) || cell.split(' ').includes(normalizedAlias);
};

const includesAlias = (cell: string, aliases: readonly string[]) =>
  aliases.some((alias) => matchesAlias(cell, alias));

const locateIndex = (cells: string[], aliases: readonly string[], fallback: number) => {
  const index = cells.findIndex((cell) => includesAlias(cell, aliases));

  return index >= 0 ? index : fallback;
};

export const detectHeaders = (rows: ParsedRows): HeaderDetection => {
  if (!rows.length) {
    return { hasHeader: false };
  }

  const [firstRow] = rows;
  const normalized = firstRow.map((cell) => normalizeHeaderValue(String(cell ?? '')));
  const hasHeader = normalized.some((cell) => includesAlias(cell, ALL_HEADER_KEYWORDS));

  if (!hasHeader) {
    return { hasHeader: false };
  }

  return {
    hasHeader: true,
    indexes: {
      unknown: locateIndex(normalized, HEADER_ALIASES.unknown, 0),
      translation: locateIndex(normalized, HEADER_ALIASES.translation, 1),
      transliteration: locateIndex(normalized, HEADER_ALIASES.transliteration, 2)
    }
  };
};

export const rowsToEntries = (rows: ParsedRows): WordEntry[] => {
  if (!rows.length) {
    return [];
  }

  const detection = detectHeaders(rows);
  const effectiveRows = detection.hasHeader ? rows.slice(1) : rows;

  return effectiveRows.reduce<WordEntry[]>((accumulator, row) => {
    const unknownRaw = row[detection.hasHeader ? detection.indexes.unknown : 0];
    const translationRaw = row[detection.hasHeader ? detection.indexes.translation : 1];
    const transliterationRaw = row[detection.hasHeader ? detection.indexes.transliteration : 2];

    const unknown = String(unknownRaw ?? '').trim();
    const translation = String(translationRaw ?? '').trim();
    const transliteration = transliterationRaw ? String(transliterationRaw ?? '').trim() : undefined;

    if (!unknown || !translation) {
      return accumulator;
    }

    const looksLikeHeaderRow =
      includesAlias(normalizeHeaderValue(unknown), HEADER_ALIASES.unknown) &&
      includesAlias(normalizeHeaderValue(translation), HEADER_ALIASES.translation);

    if (looksLikeHeaderRow) {
      return accumulator;
    }

    accumulator.push({ unknown, translation, transliteration });
    return accumulator;
  }, []);
};

export const readWorkbook = (workbook: XLSX.WorkBook): WordEntry[] => {
  const [firstSheetName] = workbook.SheetNames;
  if (!firstSheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    blankrows: false,
    defval: ''
  }) as ParsedRows;

  return rowsToEntries(rows);
};

export const readFile = async (file: File): Promise<WordEntry[]> => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  return readWorkbook(workbook);
};

export const readFromUrl = async (url: string): Promise<WordEntry[]> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Risposta non valida dal foglio Google.');
  }

  const contentType = response.headers.get('content-type');
  const isCsv = contentType?.includes('text/csv') || url.includes('format=csv');
  const payload = isCsv ? await response.text() : await response.arrayBuffer();

  const workbook = isCsv ? XLSX.read(payload, { type: 'string' }) : XLSX.read(payload, { type: 'array' });
  return readWorkbook(workbook);
};

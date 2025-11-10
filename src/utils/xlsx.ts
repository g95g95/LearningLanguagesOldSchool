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

const HEADER_KEYWORDS = ['parola', 'unknown', 'traduzione', 'translation', 'traslitterazione', 'transliteration'];

const locateIndex = (cells: string[], aliases: string[]) =>
  cells.findIndex((cell) => aliases.some((alias) => cell.includes(alias)));

export const detectHeaders = (rows: ParsedRows): HeaderDetection => {
  if (!rows.length) {
    return { hasHeader: false };
  }

  const [firstRow] = rows;
  const normalized = firstRow.map((cell) => String(cell ?? '').toLowerCase());
  const hasHeader = normalized.some((cell) => HEADER_KEYWORDS.some((keyword) => cell.includes(keyword)));

  if (!hasHeader) {
    return { hasHeader: false };
  }

  return {
    hasHeader: true,
    indexes: {
      unknown: locateIndex(normalized, ['parola', 'unknown']) ?? 0,
      translation: locateIndex(normalized, ['traduzione', 'translation']) ?? 1,
      transliteration: locateIndex(normalized, ['traslitterazione', 'transliteration']) ?? 2
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

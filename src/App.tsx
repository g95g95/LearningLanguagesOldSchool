import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

const languageCatalogue = [
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

type LanguageCode = (typeof languageCatalogue)[number]['code'];

type ScreenState =
  | 'intro'
  | 'mother-language'
  | 'dataset-upload'
  | 'quiz'
  | 'complete'
  | 'insights';

type WordEntry = {
  unknown: string;
  translation: string;
  transliteration?: string;
};

type UserResponse = {
  word: WordEntry;
  userTranslation: string;
  userTransliteration?: string;
  isCorrect: boolean;
  revealedTransliteration: boolean;
};

const transliterationCodes = new Set(
  languageCatalogue.filter((lang) => lang.transliterationRequired).map((lang) => lang.code)
);

const languageByCode = Object.fromEntries(languageCatalogue.map((lang) => [lang.code, lang]));

type ParsedRows = Array<Array<string | number>>;

const detectHeaders = (rows: ParsedRows) => {
  if (!rows.length) {
    return { hasHeader: false } as const;
  }

  const [firstRow] = rows;
  const normalized = firstRow.map((cell) => String(cell ?? '').toLowerCase());
  const headerKeywords = ['parola', 'unknown', 'traduzione', 'translation', 'traslitterazione', 'transliteration'];
  const hasHeader = normalized.some((cell) => headerKeywords.some((keyword) => cell.includes(keyword)));

  if (!hasHeader) {
    return { hasHeader: false } as const;
  }

  const locate = (aliases: string[]) =>
    normalized.findIndex((cell) => aliases.some((alias) => cell.includes(alias)));

  const unknownIndex = locate(['parola', 'unknown']);
  const translationIndex = locate(['traduzione', 'translation']);
  const transliterationIndex = locate(['traslitterazione', 'transliteration']);

  return {
    hasHeader: true,
    indexes: {
      unknown: unknownIndex >= 0 ? unknownIndex : 0,
      translation: translationIndex >= 0 ? translationIndex : 1,
      transliteration: transliterationIndex >= 0 ? transliterationIndex : 2
    }
  } as const;
};

const rowsToEntries = (rows: ParsedRows): WordEntry[] => {
  if (!rows.length) {
    return [];
  }

  const { hasHeader, indexes } = detectHeaders(rows);
  const effectiveRows = hasHeader ? rows.slice(1) : rows;

  return effectiveRows
    .map((row) => {
      const unknownRaw = row[indexes?.unknown ?? 0];
      const translationRaw = row[indexes?.translation ?? 1];
      const transliterationRaw = row[indexes?.transliteration ?? 2];

      const unknown = String(unknownRaw ?? '').trim();
      const translation = String(translationRaw ?? '').trim();
      const transliteration = transliterationRaw ? String(transliterationRaw ?? '').trim() : undefined;

      if (!unknown || !translation) {
        return undefined;
      }

      return { unknown, translation, transliteration } satisfies WordEntry;
    })
    .filter((entry): entry is WordEntry => Boolean(entry));
};

const readWorkbook = (workbook: XLSX.WorkBook): WordEntry[] => {
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

const formatDuration = (milliseconds: number) => {
  if (!Number.isFinite(milliseconds)) {
    return '0s';
  }

  const seconds = Math.floor(milliseconds / 1000);
  const mins = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const parts = [] as string[];

  if (mins) {
    parts.push(`${mins}m`);
  }

  parts.push(`${remainingSeconds}s`);
  return parts.join(' ');
};

const App = () => {
  const [screen, setScreen] = useState<ScreenState>('intro');
  const [motherLanguage, setMotherLanguage] = useState<LanguageCode | null>(null);
  const [learningLanguages, setLearningLanguages] = useState<LanguageCode[]>([]);
  const [entries, setEntries] = useState<WordEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [guess, setGuess] = useState('');
  const [transliterationGuess, setTransliterationGuess] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [revealedTransliteration, setRevealedTransliteration] = useState(false);
  const [responses, setResponses] = useState<UserResponse[]>([]);
  const [isAnswered, setIsAnswered] = useState(false);
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const startTimestampRef = useRef<number | null>(null);
  const endTimestampRef = useRef<number | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const synth = window.speechSynthesis;

    const populateVoices = () => {
      setVoices(synth.getVoices());
    };

    populateVoices();
    synth.addEventListener('voiceschanged', populateVoices);

    return () => {
      synth.removeEventListener('voiceschanged', populateVoices);
    };
  }, []);

  const resetQuizState = () => {
    setCurrentIndex(0);
    setGuess('');
    setTransliterationGuess('');
    setFeedback(null);
    setResponses([]);
    setIsAnswered(false);
    setRevealedTransliteration(false);
    startTimestampRef.current = null;
    endTimestampRef.current = null;
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result;
      if (!data) {
        setLoadError('Impossibile leggere il file caricato.');
        return;
      }

      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(data, { type: 'array' });
      } catch (error) {
        setLoadError('Formato file non supportato o file corrotto.');
        return;
      }

      const parsedEntries = readWorkbook(workbook);
      if (!parsedEntries.length) {
        setLoadError('Il file non contiene vocaboli validi.');
        return;
      }

      setEntries(parsedEntries);
      setLoadError(null);
    };

    reader.readAsArrayBuffer(file);
  };

  const handleGoogleSheetImport = async () => {
    if (!googleSheetUrl) {
      return;
    }

    try {
      setIsLoadingSheet(true);
      setLoadError(null);
      const response = await fetch(googleSheetUrl);
      if (!response.ok) {
        throw new Error('Risposta non valida dal foglio Google.');
      }

      const contentType = response.headers.get('content-type');
      const isCsv = contentType?.includes('text/csv') || googleSheetUrl.includes('format=csv');
      const buffer = isCsv ? await response.text() : await response.arrayBuffer();

      const workbook = isCsv
        ? XLSX.read(buffer, { type: 'string' })
        : XLSX.read(buffer, { type: 'array' });

      const parsedEntries = readWorkbook(workbook);
      if (!parsedEntries.length) {
        throw new Error('Il foglio non contiene vocaboli validi.');
      }

      setEntries(parsedEntries);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setIsLoadingSheet(false);
    }
  };

  const handleConfirm = () => {
    const currentWord = entries[currentIndex];
    if (!currentWord || isAnswered) {
      return;
    }

    const normalizedGuess = guess.trim().toLowerCase();
    const normalizedTranslation = currentWord.translation.trim().toLowerCase();
    const isCorrect = normalizedGuess === normalizedTranslation;

    setResponses((previous) => [
      ...previous,
      {
        word: currentWord,
        userTranslation: guess,
        userTransliteration: transliterationGuess || undefined,
        isCorrect,
        revealedTransliteration
      }
    ]);

    setFeedback(isCorrect ? 'Bravo, parola esatta' : 'risposta sbagliata');
    setIsAnswered(true);

    if (currentIndex === entries.length - 1) {
      endTimestampRef.current = Date.now();
    }
  };

  const handleNext = () => {
    if (!isAnswered) {
      return;
    }

    if (currentIndex >= entries.length - 1) {
      setScreen('complete');
      return;
    }

    setCurrentIndex((prev) => prev + 1);
    setGuess('');
    setTransliterationGuess('');
    setFeedback(null);
    setIsAnswered(false);
    setRevealedTransliteration(false);
  };

  const startQuiz = () => {
    if (!entries.length) {
      setLoadError('Carica prima un dataset di vocaboli.');
      return;
    }

    resetQuizState();
    setScreen('quiz');
    startTimestampRef.current = Date.now();
  };

  const speakWord = () => {
    const word = entries[currentIndex]?.unknown;
    if (!word) {
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();

    const preferredLanguages = learningLanguages.length ? learningLanguages : motherLanguage ? [motherLanguage] : [];
    const voice = voices.find((candidate) =>
      preferredLanguages.some((code) => candidate.lang.toLowerCase().startsWith(languageByCode[code].locale.split('-')[0]))
    );

    const utterance = new SpeechSynthesisUtterance(word);
    if (voice) {
      utterance.voice = voice;
    } else if (preferredLanguages[0]) {
      utterance.lang = languageByCode[preferredLanguages[0]].locale;
    }

    synth.speak(utterance);
  };

  const accuracy = useMemo(() => {
    if (!responses.length) {
      return 0;
    }

    const correctAnswers = responses.filter((response) => response.isCorrect).length;
    return Math.round((correctAnswers / responses.length) * 100);
  }, [responses]);

  const mistakes = useMemo(
    () =>
      responses.filter((response) => !response.isCorrect).map((response) => response.word.unknown),
    [responses]
  );

  const quizDuration = useMemo(() => {
    if (!startTimestampRef.current || !endTimestampRef.current) {
      return 0;
    }

    return endTimestampRef.current - startTimestampRef.current;
  }, [screen]);

  const currentWord = entries[currentIndex];
  const requiresTransliteration =
    Boolean(currentWord?.transliteration) || learningLanguages.some((code) => transliterationCodes.has(code));

  const canStartQuiz = entries.length > 0 && learningLanguages.length > 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 pb-16 pt-10">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-sky-300">Learning Languages Old School</h1>
        <p className="text-sm text-slate-400">
          Immergiti in un allenamento iper-moderno per memorizzare vocaboli con un tocco nostalgico.
        </p>
      </header>

      {screen === 'intro' && (
        <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 rounded-3xl border border-slate-800 bg-slate-900/60 p-10 text-center shadow-xl">
          <h2 className="text-2xl font-semibold text-sky-200">Come funziona?</h2>
          <p className="text-base leading-relaxed text-slate-300">
            Carica il tuo vocabolario personale e trasforma l&apos;esercizio in un gioco immersivo. Scegli la tua lingua madre,
            seleziona le lingue che vuoi imparare, ascolta la pronuncia, annota la traslitterazione quando serve e osserva gli
            insight finali.
          </p>
          <button
            onClick={() => setScreen('mother-language')}
            className="mt-4 rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 px-6 py-3 text-lg font-semibold text-slate-950 shadow-lg transition hover:from-sky-400 hover:to-cyan-300"
          >
            Inizia adesso
          </button>
        </section>
      )}

      {screen === 'mother-language' && (
        <section className="flex flex-1 flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
          <h2 className="text-2xl font-semibold text-sky-200">Choose your mother language</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {languageCatalogue.map((language) => {
              const isActive = motherLanguage === language.code;
              return (
                <button
                  key={language.code}
                  type="button"
                  onClick={() => setMotherLanguage(language.code)}
                  className={`flex items-center gap-4 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
                    isActive ? 'border-sky-400 bg-sky-400/10 shadow-lg' : 'border-slate-800 bg-slate-950/40 hover:border-slate-600'
                  }`}
                >
                  <span className="text-3xl" aria-hidden>
                    {language.flag}
                  </span>
                  <span className="text-lg font-medium text-slate-100">{language.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setScreen('intro')}
              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              Indietro
            </button>
            <button
              disabled={!motherLanguage}
              onClick={() => setScreen('dataset-upload')}
              className="rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 shadow-md transition enabled:hover:from-sky-400 enabled:hover:to-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continua
            </button>
          </div>
        </section>
      )}

      {screen === 'dataset-upload' && (
        <section className="flex flex-1 flex-col gap-8 rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold text-sky-200">Prepara il tuo dataset personale</h2>
            <p className="text-sm leading-relaxed text-slate-300">
              Carica un file con tre colonne: parola sconosciuta, traduzione e (opzionale) traslitterazione per alfabeti non
              latini. Accettiamo Excel, CSV o un link Google Sheets (usa l&apos;URL di esportazione in CSV).
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-6">
              <label className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Upload da file
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      handleFile(file);
                    }
                  }}
                  className="mt-3 block w-full cursor-pointer rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-200 focus:outline-none"
                />
              </label>
              {entries.length > 0 && (
                <p className="text-xs text-emerald-400">{entries.length} vocaboli pronti all&apos;uso.</p>
              )}
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-6">
              <label className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Oppure importa da Google Sheets
                <input
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/.../export?format=csv"
                  value={googleSheetUrl}
                  onChange={(event) => setGoogleSheetUrl(event.target.value)}
                  className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={handleGoogleSheetImport}
                disabled={!googleSheetUrl || isLoadingSheet}
                className="w-fit rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-md transition enabled:hover:from-sky-400 enabled:hover:to-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingSheet ? 'Importazione in corso…' : 'Importa'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-6">
            <h3 className="text-lg font-semibold text-sky-200">Scegli le lingue che vuoi imparare</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {languageCatalogue.map((language) => {
                const isChecked = learningLanguages.includes(language.code);
                return (
                  <label
                    key={language.code}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-sm transition ${
                      isChecked ? 'border-sky-400 bg-sky-400/10' : 'border-slate-800 bg-transparent hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(event) => {
                        setLearningLanguages((previous) => {
                          if (event.target.checked) {
                            return [...new Set([...previous, language.code])];
                          }
                          return previous.filter((code) => code !== language.code);
                        });
                      }}
                      className="h-4 w-4 rounded border-slate-600 text-sky-400 focus:ring-sky-500"
                    />
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="text-xl">
                        {language.flag}
                      </span>
                      <span>{language.label}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {loadError && <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{loadError}</p>}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setScreen('mother-language')}
              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              Indietro
            </button>
            <button
              onClick={startQuiz}
              disabled={!canStartQuiz}
              className="rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 px-6 py-3 text-base font-semibold text-slate-950 shadow-lg transition enabled:hover:from-emerald-400 enabled:hover:to-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Avvia sessione
            </button>
          </div>
        </section>
      )}

      {screen === 'quiz' && currentWord && (
        <section className="flex flex-1 flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold text-sky-200">Sessione attiva</h2>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Parola {currentIndex + 1}</p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold uppercase tracking-wide text-slate-400">Parola sconosciuta</span>
                <span className="text-3xl font-bold text-slate-100">{currentWord.unknown}</span>
              </div>
              <button
                onClick={speakWord}
                className="flex items-center gap-3 rounded-full border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-200 transition hover:border-sky-400 hover:bg-sky-500/20"
              >
                <span aria-hidden className="text-lg">🔊</span>
                Ascolta parola sconosciuta
              </button>
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
              <label className="flex flex-col gap-2 text-sm text-slate-200">
                <span className="font-semibold uppercase tracking-wide text-slate-400">La tua guess</span>
                <input
                  type="text"
                  value={guess}
                  onChange={(event) => setGuess(event.target.value)}
                  disabled={isAnswered}
                  placeholder="Scrivi la traduzione..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              {requiresTransliteration && (
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-2 text-sm text-slate-200">
                    <span className="font-semibold uppercase tracking-wide text-slate-400">Traslitterazione</span>
                    <input
                      type="text"
                      value={revealedTransliteration ? currentWord.transliteration ?? '' : transliterationGuess}
                      onChange={(event) => setTransliterationGuess(event.target.value)}
                      disabled={revealedTransliteration || isAnswered}
                      placeholder="Annota la traslitterazione..."
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                  {currentWord.transliteration && (
                    <button
                      type="button"
                      onClick={() => setRevealedTransliteration(true)}
                      className="self-start rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-200 transition hover:border-amber-300 hover:bg-amber-400/20"
                    >
                      Mostra traslitterazione
                    </button>
                  )}
                </div>
              )}

              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={handleConfirm}
                  disabled={isAnswered || !guess.trim()}
                  className="rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-2 text-sm font-semibold text-slate-950 shadow-md transition enabled:hover:from-emerald-400 enabled:hover:to-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Conferma
                </button>
                <button
                  onClick={handleNext}
                  disabled={!isAnswered}
                  className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition enabled:hover:border-slate-500 enabled:hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Avanti
                </button>
              </div>

              {feedback && (
                <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 text-sm text-slate-200">
                  <p className="font-semibold">{feedback}</p>
                  {!feedback.includes('Bravo') && (
                    <p className="mt-1 text-slate-400">Traduzione corretta: {currentWord.translation}</p>
                  )}
                  {revealedTransliteration && currentWord.transliteration && (
                    <p className="mt-1 text-slate-400">Traslitterazione: {currentWord.transliteration}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {screen === 'complete' && (
        <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-12 text-center">
          <h2 className="text-4xl font-bold text-emerald-300">Complimenti!</h2>
          <p className="text-base text-slate-300">Hai completato l&apos;intero dataset. Sei pronto a esplorare gli insight?</p>
          <button
            onClick={() => setScreen('insights')}
            className="rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 px-6 py-3 text-lg font-semibold text-slate-950 shadow-lg transition hover:from-sky-400 hover:to-cyan-300"
          >
            Visualizza insights
          </button>
        </section>
      )}

      {screen === 'insights' && (
        <section className="flex flex-1 flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
          <div className="flex flex-col gap-2">
            <h2 className="text-3xl font-semibold text-sky-200">I tuoi insight</h2>
            <p className="text-sm text-slate-400">
              Ecco come è andata la sessione: tempo impiegato, percentuale di risposte esatte e parole da ripassare.
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
              <dt className="text-xs uppercase tracking-[0.3em] text-slate-500">Tempo impiegato</dt>
              <dd className="mt-2 text-2xl font-semibold text-slate-100">{formatDuration(quizDuration)}</dd>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
              <dt className="text-xs uppercase tracking-[0.3em] text-slate-500">Accuratezza</dt>
              <dd className="mt-2 text-2xl font-semibold text-slate-100">{accuracy}%</dd>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
              <dt className="text-xs uppercase tracking-[0.3em] text-slate-500">Vocaboli totali</dt>
              <dd className="mt-2 text-2xl font-semibold text-slate-100">{entries.length}</dd>
            </div>
          </dl>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
            <h3 className="text-lg font-semibold text-sky-200">Parole da ripassare</h3>
            {mistakes.length > 0 ? (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-200">
                {mistakes.map((word) => (
                  <li key={word}>{word}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-emerald-300">Zero errori! Proseguire così è la strada giusta.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => exportInsights('json', {
                motherLanguage,
                learningLanguages,
                entries,
                responses,
                quizDuration,
                accuracy
              })}
              className="rounded-full border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:border-sky-400 hover:bg-sky-500/20"
            >
              Esporta in JSON
            </button>
            <button
              onClick={() => exportInsights('txt', {
                motherLanguage,
                learningLanguages,
                entries,
                responses,
                quizDuration,
                accuracy
              })}
              className="rounded-full border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-400 hover:text-slate-50"
            >
              Esporta in TXT
            </button>
            <button
              onClick={() => {
                setScreen('dataset-upload');
              }}
              className="ml-auto rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              Nuova sessione
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

type ExportPayload = {
  motherLanguage: LanguageCode | null;
  learningLanguages: LanguageCode[];
  entries: WordEntry[];
  responses: UserResponse[];
  quizDuration: number;
  accuracy: number;
};

const exportInsights = (format: 'json' | 'txt', payload: ExportPayload) => {
  const languageLabel = (code: LanguageCode | null) => (code ? languageByCode[code].label : 'N/A');
  const stats = {
    motherLanguage: languageLabel(payload.motherLanguage),
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

export default App;

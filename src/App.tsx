import { ChangeEvent, useCallback, useMemo, useRef, useState } from 'react';
import {
  languageByCode,
  languageCatalogue,
  transliterationCodes
} from './data/languages';
import { useSpeechVoices } from './utils/speech';
import { formatDuration } from './utils/time';
import { exportInsights } from './utils/export';
import { readFile, readFromUrl } from './utils/xlsx';
import type { LanguageCode, ScreenState, UserResponse, WordEntry } from './types';

type QuizState = {
  currentIndex: number;
  guess: string;
  transliterationGuess: string;
  feedback: string | null;
  isAnswered: boolean;
  revealedTransliteration: boolean;
  responses: UserResponse[];
};

const createEmptyQuizState = (): QuizState => ({
  currentIndex: 0,
  guess: '',
  transliterationGuess: '',
  feedback: null,
  isAnswered: false,
  revealedTransliteration: false,
  responses: []
});

const App = () => {
  const [screen, setScreen] = useState<ScreenState>('intro');
  const [motherLanguage, setMotherLanguage] = useState<LanguageCode | null>(null);
  const [learningLanguages, setLearningLanguages] = useState<LanguageCode[]>([]);
  const [entries, setEntries] = useState<WordEntry[]>([]);
  const [quizState, setQuizState] = useState<QuizState>(() => createEmptyQuizState());
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const startTimestampRef = useRef<number | null>(null);
  const endTimestampRef = useRef<number | null>(null);
  const voices = useSpeechVoices();

  const resetQuiz = useCallback(() => {
    setQuizState(createEmptyQuizState());
    startTimestampRef.current = null;
    endTimestampRef.current = null;
  }, []);

  const handleFileUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      try {
        const parsedEntries = await readFile(file);
        if (!parsedEntries.length) {
          setLoadError('Il file non contiene vocaboli validi.');
          return;
        }

        setEntries(parsedEntries);
        setFileName(file.name);
        setLoadError(null);
      } catch (error) {
        console.error(error);
        setLoadError('Formato file non supportato o file corrotto.');
      } finally {
        event.target.value = '';
      }
    },
    []
  );

  const handleGoogleSheetImport = useCallback(async () => {
    if (!googleSheetUrl) {
      return;
    }

    try {
      setIsLoadingSheet(true);
      setLoadError(null);
      const parsedEntries = await readFromUrl(googleSheetUrl);
      if (!parsedEntries.length) {
        throw new Error('Il foglio non contiene vocaboli validi.');
      }

      setEntries(parsedEntries);
      setFileName('Google Sheet');
    } catch (error) {
      console.error(error);
      setLoadError((error as Error).message);
    } finally {
      setIsLoadingSheet(false);
    }
  }, [googleSheetUrl]);

  const startQuiz = useCallback(() => {
    if (!entries.length || !learningLanguages.length) {
      setLoadError('Seleziona almeno una lingua e carica un dataset.');
      return;
    }

    resetQuiz();
    setScreen('quiz');
    startTimestampRef.current = Date.now();
  }, [entries.length, learningLanguages.length, resetQuiz]);

  const currentWord = entries[quizState.currentIndex];
  const requiresTransliteration = useMemo(
    () =>
      Boolean(currentWord?.transliteration) ||
      learningLanguages.some((code) => transliterationCodes.has(code)),
    [currentWord?.transliteration, learningLanguages]
  );

  const speakWord = useCallback(() => {
    const word = currentWord?.unknown;
    if (!word) {
      return;
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();

    const preferredLanguages = learningLanguages.length
      ? learningLanguages
      : motherLanguage
        ? [motherLanguage]
        : [];

    const voice = voices.find((candidate) =>
      preferredLanguages.some((code) =>
        candidate.lang.toLowerCase().startsWith(languageByCode[code].locale.split('-')[0])
      )
    );

    const utterance = new SpeechSynthesisUtterance(word);
    if (voice) {
      utterance.voice = voice;
    } else if (preferredLanguages[0]) {
      utterance.lang = languageByCode[preferredLanguages[0]].locale;
    }

    synth.speak(utterance);
  }, [currentWord?.unknown, learningLanguages, motherLanguage, voices]);

  const handleConfirm = useCallback(() => {
    const word = entries[quizState.currentIndex];
    if (!word || quizState.isAnswered) {
      return;
    }

    const normalizedGuess = quizState.guess.trim().toLowerCase();
    const normalizedTranslation = word.translation.trim().toLowerCase();
    const isCorrect = normalizedGuess === normalizedTranslation;

    setQuizState((previous) => ({
      ...previous,
      isAnswered: true,
      feedback: isCorrect ? 'Bravo, parola esatta' : 'Risposta sbagliata',
      responses: [
        ...previous.responses,
        {
          word,
          userTranslation: previous.guess,
          userTransliteration: previous.revealedTransliteration ? undefined : previous.transliterationGuess || undefined,
          isCorrect,
          revealedTransliteration: previous.revealedTransliteration
        }
      ]
    }));

    if (quizState.currentIndex === entries.length - 1) {
      endTimestampRef.current = Date.now();
    }
  }, [entries, quizState]);

  const handleNext = useCallback(() => {
    if (!quizState.isAnswered) {
      return;
    }

    if (quizState.currentIndex >= entries.length - 1) {
      setScreen('complete');
      return;
    }

    setQuizState((previous) => ({
      ...previous,
      currentIndex: previous.currentIndex + 1,
      guess: '',
      transliterationGuess: '',
      feedback: null,
      isAnswered: false,
      revealedTransliteration: false
    }));
  }, [entries.length, quizState.isAnswered, quizState.currentIndex]);

  const accuracy = useMemo(() => {
    if (!quizState.responses.length) {
      return 0;
    }

    const correctAnswers = quizState.responses.filter((response) => response.isCorrect).length;
    return Math.round((correctAnswers / quizState.responses.length) * 100);
  }, [quizState.responses]);

  const mistakes = useMemo(
    () => quizState.responses.filter((response) => !response.isCorrect).map((response) => response.word.unknown),
    [quizState.responses]
  );

  const quizDuration = useMemo(() => {
    if (!startTimestampRef.current || !endTimestampRef.current) {
      return 0;
    }

    return endTimestampRef.current - startTimestampRef.current;
  }, [screen]);

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
            seleziona le lingue che vuoi imparare, ascolta la pronuncia e osserva gli insight finali.
          </p>
          <button
            onClick={() => setScreen('setup')}
            className="mt-4 rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 px-6 py-3 text-lg font-semibold text-slate-950 shadow-lg transition hover:from-sky-400 hover:to-cyan-300"
          >
            Inizia adesso
          </button>
        </section>
      )}

      {screen === 'setup' && (
        <section className="flex flex-1 flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
              <h3 className="text-lg font-semibold text-sky-200">Lingua madre</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
              <h3 className="text-lg font-semibold text-sky-200">Lingue da allenare</h3>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Seleziona anche più lingue</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {languageCatalogue.map((language) => {
                  const isChecked = learningLanguages.includes(language.code);
                  return (
                    <label
                      key={language.code}
                      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition ${
                        isChecked ? 'border-emerald-400 bg-emerald-400/10 shadow-lg' : 'border-slate-800 bg-slate-950/40 hover:border-slate-600'
                      }`}
                    >
                      <span className="flex items-center gap-3 text-slate-100">
                        <span aria-hidden className="text-xl">
                          {language.flag}
                        </span>
                        {language.label}
                      </span>
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
                        className="h-4 w-4 rounded border-slate-600 text-emerald-400 focus:ring-emerald-500"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
              <h3 className="text-lg font-semibold text-sky-200">Carica un file</h3>
              <p className="text-sm text-slate-400">Supporto per XLSX, ODS, CSV: è sufficiente avere colonne per parola, traduzione e traslitterazione.</p>
              <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-6 text-center transition hover:border-sky-400">
                <span className="text-4xl" aria-hidden>
                  📂
                </span>
                <span className="text-sm text-slate-200">Trascina o seleziona un file</span>
                <input type="file" accept=".xlsx,.xls,.csv,.ods" className="hidden" onChange={handleFileUpload} />
              </label>
              {fileName && <p className="text-xs text-slate-500">Ultimo file caricato: {fileName}</p>}
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
              <h3 className="text-lg font-semibold text-sky-200">Oppure incolla un Google Sheet</h3>
              <div className="flex flex-col gap-3">
                <input
                  type="url"
                  value={googleSheetUrl}
                  onChange={(event) => setGoogleSheetUrl(event.target.value)}
                  placeholder="URL pubblico del foglio (consigliato formato CSV)"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                />
                <button
                  onClick={handleGoogleSheetImport}
                  disabled={!googleSheetUrl || isLoadingSheet}
                  className="self-start rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 px-5 py-2 text-sm font-semibold text-slate-950 shadow-md transition enabled:hover:from-violet-400 enabled:hover:to-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoadingSheet ? 'Caricamento...' : 'Importa'}
                </button>
              </div>
            </div>
          </div>

          {loadError && <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{loadError}</p>}

          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setScreen('intro');
                resetQuiz();
              }}
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
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Parola {quizState.currentIndex + 1}</p>
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
                  value={quizState.guess}
                  onChange={(event) => setQuizState((previous) => ({ ...previous, guess: event.target.value }))}
                  disabled={quizState.isAnswered}
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
                      value={quizState.revealedTransliteration ? currentWord.transliteration ?? '' : quizState.transliterationGuess}
                      onChange={(event) =>
                        setQuizState((previous) => ({ ...previous, transliterationGuess: event.target.value }))
                      }
                      disabled={quizState.revealedTransliteration || quizState.isAnswered}
                      placeholder="Annota la traslitterazione..."
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>
                  {currentWord.transliteration && (
                    <button
                      type="button"
                      onClick={() => setQuizState((previous) => ({ ...previous, revealedTransliteration: true }))}
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
                  disabled={quizState.isAnswered || !quizState.guess.trim()}
                  className="rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-2 text-sm font-semibold text-slate-950 shadow-md transition enabled:hover:from-emerald-400 enabled:hover:to-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Conferma
                </button>
                <button
                  onClick={handleNext}
                  disabled={!quizState.isAnswered}
                  className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition enabled:hover:border-slate-500 enabled:hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Avanti
                </button>
              </div>

              {quizState.feedback && (
                <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 text-sm text-slate-200">
                  <p className="font-semibold">{quizState.feedback}</p>
                  {!quizState.feedback.includes('Bravo') && (
                    <p className="mt-1 text-slate-400">Traduzione corretta: {currentWord.translation}</p>
                  )}
                  {quizState.revealedTransliteration && currentWord.transliteration && (
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
              onClick={() =>
                exportInsights('json', {
                  motherLanguage,
                  learningLanguages,
                  entries,
                  responses: quizState.responses,
                  quizDuration,
                  accuracy
                })
              }
              className="rounded-full border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:border-sky-400 hover:bg-sky-500/20"
            >
              Esporta in JSON
            </button>
            <button
              onClick={() =>
                exportInsights('txt', {
                  motherLanguage,
                  learningLanguages,
                  entries,
                  responses: quizState.responses,
                  quizDuration,
                  accuracy
                })
              }
              className="rounded-full border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-400 hover:text-slate-50"
            >
              Esporta in TXT
            </button>
            <button
              onClick={() => {
                setScreen('setup');
                resetQuiz();
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

export default App;

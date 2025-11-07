# LearningLanguagesOldSchool

Web app ultra-moderna per allenare il vocabolario con un flusso old school:

- onboarding guidato con spiegazione iniziale;
- scelta della lingua madre tramite bandiere interattive (10 lingue supportate);
- import di dataset personali da Excel, CSV o Google Sheets;
- selezione delle lingue che si vogliono studiare con memorizzazione della scelta;
- esercizi di traduzione con pronuncia tramite Web Speech API, gestione della traslitterazione e feedback immediato;
- schermata finale con complimenti e raccolta di insight esportabili in JSON o TXT.

Il progetto è pronto per essere pubblicato su GitHub Pages grazie al build statico generato da Vite.

## Requisiti

- Node.js >= 18
- npm (oppure pnpm/yarn se preferisci adattare gli script)

## Installazione

```bash
npm install
```

## Modalità sviluppo

```bash
npm run dev
```

Apri il browser su [http://localhost:5173](http://localhost:5173) per visualizzare l&apos;app.

## Build produzione

```bash
npm run build
```

I file pronti per il deploy saranno prodotti nella cartella `dist/`.

## Deploy su GitHub Pages

1. Assicurati di aver configurato il repository GitHub.
2. Esegui:

   ```bash
   npm run deploy
   ```

   Il comando esegue il build e pubblica la cartella `dist/` sul branch `gh-pages` tramite [`gh-pages`](https://github.com/tschaub/gh-pages).

3. Attiva GitHub Pages dal repository (`Settings` → `Pages`) puntando al branch `gh-pages`.

## Formato del dataset

| Colonna             | Descrizione                                                                 |
| ------------------- | ---------------------------------------------------------------------------- |
| Parola sconosciuta  | La parola nella lingua che vuoi studiare.                                   |
| Traduzione          | Il significato nella tua lingua o in un&apos;altra lingua pivot.               |
| Traslitterazione    | Facoltativa. Da compilare solo per alfabeti non latini (russo, arabo, ecc.). |

- Le intestazioni sono facoltative ma, se presenti, vengono riconosciute automaticamente.
- Sono accettati file Excel (`.xlsx`, `.xls`), CSV oppure link Google Sheets in esportazione CSV (`.../export?format=csv`).

## Licenza

Distribuito con licenza MIT.

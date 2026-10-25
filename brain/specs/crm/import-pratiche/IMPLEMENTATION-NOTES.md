---
domain: crm
type: implementation-notes
links:
  - "[[specs/crm/import-pratiche/SPEC]]"
  - "[[specs/crm/import-pratiche/PLAN]]"
created: 2026-10-24
updated: 2026-10-24
---

# Implementation Notes

## Summary

- PR A (#77, `claude/import-caratterizzazione`, da `dev`): T1 e T2, test di caratterizzazione sul codice di oggi. Nessun cambio al codice.
- PR D (#82, `claude/import-coda`, da `dev`): T12a, `setup-import-queue.sh` e le variabili `IMPORT_*` nel deploy di staging. Lo script lo lancia Leonardo dal Mac.
- PR C (#81, `claude/import-storico-schema`, da `dev`): T7, tabelle `import_run`, `import_upload`, `import_upload_part` e la loro migrazione, solo additiva. Nessun codice le usa ancora.
- PR B (#78, `claude/import-dominio`, sopra la A): T3, T4, T5, T6, T8a. Tracciati, conversione, classificazione, raggruppamento e piano nel dominio, puri. L'import di oggi usa solo la conversione spostata; il resto lo chiamano le PR E ed F.

## Execution Mode

- Mode: sequential
- Delegation: inline. Le regole del progetto (Opus Tech Lead) tengono su Opus architettura, migrazioni, permessi e requisiti; Haiku solo per T3 e T15 (D18). Budget di 5 sub-agent per richiesta.
- Escalations: nessuna.

## Deviations From the Plan

- T1: il piano chiedeva `process.env.TZ = "Europe/Rome"`. Con vitest 1.6 (pool `threads`) il fuso non cambia dentro un file, e `vitest.config.ts` fissa `TZ: "UTC"`. Le date sono verificate come mezzanotte locale (`new Date(2024, 1, 15)`), che nel browser è quella di Roma. T4 e T8a, con la conversione pura e `now` come argomento, verificano gli istanti di Roma espliciti (AC33).
- T1: ambiente `node` invece di jsdom, perché il `File` di jsdom 24 non ha `arrayBuffer()`. `processFile` non usa il DOM.
- T1: le date "come le salva Excel" sono celle numeriche con formato `m/d/yy`. Nel CSV di SheetJS diventano `1/15/24`, quindi il caso `M/G/AA` è quello delle celle data vere.
- T4: per fissare il fuso, `vitest.workspace.ts` ha due progetti in più, `utc` e `rome` (pool `forks`, `env.TZ`), che eseguono i file di `timeZoneTests` (`vitest.config.ts`); il progetto `unit` li esclude. I test di T1 sono divisi: valori della singola riga in `src/lib/import/_test/characterization.test.ts` (su `parseWorkbook` + dominio, istanti di Roma espliciti), comportamento di `processFile` (validazione, fusione, errori) in `process/_test` (12 test).
- T4: `spark-md5` non entra nel `package.json` di `@mito/domain`: `pnpm install` rimescolava voci estranee del lockfile. Il dominio usa le dipendenze della root, come già per zod e drizzle.
- T4: `romeWallClock` e `romeWallToInstant` vengono dal seed locale (`src/server/db/seeds/local/day.ts`), che ora li importa dal dominio.
- T4: `parseDateInput` non è più riesportata da `src/lib/utils` (nessun chiamante fuori dall'import). `DAYS_PER_RATE` in `src/app/api/_utils` resta riesportato senza chiamanti: lo toglie T20.
- T7: il test sta in `packages/db/src/_test/importRun.db.test.ts`, non in `schema/_test/`: drizzle-kit legge come schema ogni file sotto `packages/db/src/schema/*` e caricava il test (con vitest) a `db:generate`.
- T7: `bytea` con `customType` (drizzle-orm 0.45 non lo ha); `uuid` con `gen_random_uuid()`; `failure_reason` fino a 1.000 caratteri; i numeri di quello che l'import ha scritto restano null finché non è `completed`.
- T8a: `planRows(righe classificate, CRM)` invece di `planRows(gruppi, CRM)`: dopo AC11b il file si raggruppa di nuovo senza le righe scartate, così una pratica scritta anche da una di loro prende i valori solo dalle altre. Il worker chiama `groupRows` + `lookupKeys` per le chiavi, poi `planRows`.

## Surprises and Decisions

Difetti in più rispetto alla spec, fissati dai test e non corretti:
- CAP: papaparse lo legge come numero, quindi `00184` diventa `184`. Riguarda tutti i CAP che iniziano con 0 (Lazio, Piemonte, Liguria…).
- Importi scritti come testo italiano: `1.234,50` diventa `1.23` e `1234,50` diventa `123450.00`. I numeri veri sono letti bene, anche con il separatore delle migliaia, perché SheetJS li scrive come `1,234.50`.
- Un codice fiscale in minuscolo è salvato come partita IVA.
- Il testo `15/01/2024` è letto come mese 15: in Wave diventa 01/03/2025, poi +1 mese; nello Standard la pratica sparisce.
- Standard con date AAAAMMGG o seriali: le rate partono dal 1970 (`new Date(numero)`), quindi risultano tutte pagate, con debito `0` e stato `Chiusa` se `SITUAZIONE` non è nota.
- Standard con data illeggibile: la pratica non diventa "oggi", come diceva la spec. Le rate pagate escono `NaN` e la pratica non passa la validazione: resta solo il cliente, senza errore. Spec corretta nelle Technical Notes. Con AC11 la riga è scartata con `"DATA_LIQUIDAZIONE" non è una data leggibile` (T5): un valore che il CRM non può salvare scarta la riga, anche col cliente valido.
- Una riga Wave senza "Garante" né "Cliente Coobbligato" è letta come Standard e finisce tra gli errori con sette motivi.
- Debito residuo a zero: Wave lo salva come `0.00`, Standard come `0`.
- Riconoscimento: il cliente aggiornato per errore (stessa P.IVA o stesso codice cliente) prende tutti i campi del primo, data di creazione compresa. Restano solo `id`, codice cliente, hash e operatore.
- Una riga con un CF che il CRM non ha va tra i nuovi anche se il suo codice cliente è già nel CRM: poi l'inserimento fallisce sul `temp_id` unico (difetto già nella spec).

Decisioni di T5–T8a:
- AC11: i limiti che drizzle-zod non mette (`smallint`, `integer`, importi `NaN` o `Infinity`) si leggono dal tipo delle colonne delle tabelle, così seguono lo schema. Un valore calcolato (rate pagate, debito residuo, importo erogato) non ripete il motivo del dato da cui viene; se nessuno di quei dati ha un motivo, il motivo dice che il valore non si può calcolare e da quali colonne.
- Standard con `IMPORTO_RATA` come testo (es. `1,234.50`, una cella con il separatore delle migliaia e un importo ≥ 1.000): il debito residuo esce `NaN` e oggi si salva così. Con la riscrittura la riga è scartata con "Non si può calcolare il debito residuo da …". La conversione resta com'è (AC32): difetto in [[tech-debt/crm/import-pratiche]].
- Una conversione che lancia (un numero in `DES_CLIENTE`, `DES_SUBAGENTE` o "Descrizione PdV", che la conversione tratta come testo) oggi ferma l'elaborazione; ora scarta la riga con "La riga ha un valore che l'import non sa leggere".
- Un codice fatto di spazi manca (AC9, AC10): oggi vale come valore.
- AC11b, "tutte le righe con quel codice cliente": le righe dei clienti nuovi con quel codice. Un cliente riconosciuto nel CRM con lo stesso codice tiene le sue righe, perché non crea nulla.
- D11: il legame di una riga va al primo cliente riconosciuto (oggi `processCTP` fa lo stesso). Il primo è il primo nell'ordine di `id` che dà `import.lookup`: `planRows` non riordina, perché l'ordine delle stringhe di Postgres e di JavaScript può differire.
- Limiti del corpo (T6): 50.000 righe (2,5 volte il file più grande, OQ4), 500 colonne, 32.767 caratteri per cella (il limite di Excel), chiavi fino a 255 caratteri. La spec non dice che messaggio dare a un file più lungo: oggi il server risponderebbe `BAD_REQUEST` alla conferma. Da decidere in T14 (un messaggio nell'anteprima).

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| Mutazioni su T1 | ok | Togliendo il +1 mese o leggendo il CAP come testo, 9 test falliscono |
| Mutazioni su T2 | ok | Togliendo la P.IVA dalla condizione di `updateImportedCustomer`, 2 test falliscono |
| Gate CI in locale | ok | `next lint`, `tsc --noEmit`, `pnpm run test --run`. La build la fa la CI (solo file di test) |
| Equivalenza di T4 | ok | I 50 test di T1 verdi a Roma dopo lo spostamento; il test del seed (`importRates`, oltre 1.000 casi contro `calculateDebitoResiduo`) verde; `romeLocalDate`, `addRomeMonth` e `romeParseDate` uguali al `Date` nativo di un processo a Roma su 800 giorni |
| Mutazioni su T5, T6, T8a | ok | Togliendo AC10, la soppressione dei motivi derivati, i limiti delle colonne, la regola solo cliente, la fusione dei valori non vuoti, il codice cliente nella chiave, il nuovo raggruppamento dopo AC11b o il salto dei legami esistenti, almeno un test fallisce |
| Gate CI in locale (PR C) | ok | `next lint`, `tsc --noEmit`, `pnpm run test --run` (3185 passati), progetto `pg` su Postgres 16 (94 passati, tutte le migrazioni), `pnpm build`, `pnpm api:build`, `db:check` |
| Mutazioni su T7 | ok | Senza l'indice unico parziale o senza il `cascade` nella migrazione, un test fallisce |
| Gate CI in locale (PR B) | ok | `next lint`, `tsc --noEmit`, `pnpm run test --run` (3243 passati, 75 saltati), `pnpm build` coi segnaposto di CI, `pnpm api:build` |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC32 | Caratterizzato, spostato | T1 copre ogni voce; T4 sposta la conversione nel dominio con gli stessi valori |
| AC33 | Nel dominio | Date di Roma in qualunque processo, test in UTC e a Roma |
| AC6 | Nel dominio | `detectFormat` (T3); il messaggio lo scrive la UI (T16) |
| AC7, AC8 | Nel dominio | `planRows` (T8a); l'anteprima arriva con T14 e T16 |
| AC9–AC11, AC13, AC40 | Nel dominio | `classifyRow` (T5) |
| AC11b | Nel dominio | `planRows` (T8a); il 23505 dentro l'import è di T9 |
| AC31 | Schema | `import_run` senza colonne per i dati delle righe (T7) |
| AC37, AC38 | Nel dominio | `groupRows` (T6), `planRows` (T8a); la scrittura è di T9 |
| OQ1 (riconoscimento) | Caratterizzato, nel dominio | T2 sul codice di oggi; i suoi casi hanno il gemello in `plan.test.ts` (chi si aggiorna). Quali valori riceve ogni cliente (AC35) è di T9 |

## Pre-existing Issues

- I difetti elencati sopra, tutti in produzione oggi: in [[tech-debt/crm/import-pratiche]], una PR per difetto dopo la riscrittura.

## Out of Scope Observations

- `handleCustomerUpdateV2` e `updateExistingCustomers` in `src/lib/workers/import/service/updateCustomer.ts` sono usati solo dalle 4 procedure senza chiamanti: spariscono con T20.

## Remaining Work

- T0 (limite della rewrite di Vercel), prima di T11: serve il Chrome di Leonardo con Vercel aperto o una sessione sul Mac, perché il container non raggiunge staging.
- Leonardo lancia `sh apps/api/gcp/setup-import-queue.sh` dal Mac (T12a).
- PR E (servizi, sopra B + C).
- Prima del primo merge su `dev`: conferma di Leonardo che la promozione `dev` → `main` resta ferma fino al go/no-go (PLAN §10).

## Steering

| Date | Feedback | Changes |
|------|----------|---------|
| 2026-10-24 | Leonardo: ok al piano, si parte dalla PR A | — |

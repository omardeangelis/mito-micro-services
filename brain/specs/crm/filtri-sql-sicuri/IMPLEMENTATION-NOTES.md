---
domain: crm
type: implementation-notes
spec: filtri-sql-sicuri
links:
  - "[[specs/crm/filtri-sql-sicuri/SPEC]]"
  - "[[specs/crm/filtri-sql-sicuri/PLAN]]"
  - "[[specs/crm/filtri-sql-sicuri/REPORT]]"
  - "[[tech-debt/crm/filtri-sql-sicuri]]"
ingested: false
last_ingested: null
created: 2026-10-24
updated: 2026-10-24
---

# Implementation Notes: Filtri avanzati sicuri

## Summary

- Branch `claude/filtri-sql-sicuri`, creato da `dev` a `594ff64` (la baseline del PLAN). Il primo commit porta SPEC e PLAN; poi un commit per task: T1 `8cce71a`, T2 `ba6d84a`, T5 `5de18c8`, T3+T4 `d00af73` e `a4ad30e`, T6 `edcac44`, T8 `c9193e6`, T7 `e0454a1`; `$simplify` `bfd559e`; correzioni della review `9c0d770`.
- `customer.getAllCustomers` e `pratiche.getAllPratiche` non eseguono più SQL del client. La pagina manda `advancedFilters: {field, op, value}[]`, letti dal parametro `filter` dell'URL. Il server li convalida contro mappe chiuse per tabella (`packages/domain/src/filters/advanced.ts`). Il traduttore unico (`packages/server/src/api/routers/utils/advancedFilters.ts`) li trasforma in condizioni Drizzle con parametri legati. `sqlFilter` è sparito dallo zod e non ha più effetto; in `src/lib/utils/filters.ts` non c'è più un costruttore di SQL.
- `getAllPratiche` è un programma Effect (`query`, `runTrpc`) a comportamento invariato, provato da 46 test di caratterizzazione scritti prima.
- Review avversariale: **SHIP**, 7 passaggi, 0 BLOCKER, 0 MAJOR ([[specs/crm/filtri-sql-sicuri/REPORT]]).

## Execution Mode

- Mode: `parallel`, per le wave del PLAN §10 (wave 1: T1+T2; wave 2: T3+T5; poi T4, T6, T7+T8, T9).
- Delegation: `supervised`. `complexity` → tier: `medium` → sonnet, `high` → il modello dell'orchestratore. L'orchestratore scrive i test rossi dei task che ne hanno uno, rivede ogni diff e lancia la validazione.
- Escalations: nessuna. Nessun worker ha avuto bisogno di una correzione. Le correzioni della review (`9c0d770`) le ha scritte l'orchestratore: sono piccole e nascono dai mutanti della review.

## Deviations From the Plan

- **T3 e T4 in un solo passaggio.** Il traduttore è uno: scriverne prima una versione volutamente ingenua, solo per avere T4 rosso, non aveva senso. I test di T4 sono stati scritti prima del codice e provati rossi sulla base (30 su 31; l'unico verde, "solo voci non valide", lo è per costruzione).
- **Un enum nei test di AC5.** Nei due test sui parametri legati c'è anche un filtro su un enum (`source = passaparola`, `state`), per uccidere M4 sull'enum.
- **Un commento corretto nel test di T1.** Il commento dell'helper di `getAllPratiche.db.test.ts` era diventato falso quando l'input `filter` è uscito. Nessuna asserzione è cambiata.
- **Le stranezze di F6 nel debito della migrazione.** Il PLAN le metteva nel tech debt della spec; sono in [[chore/migrazione-effect]] §7 (TD7), perché la regola di Omar del 2026-10-22 mette lì i difetti che un refactor a comportamento invariato conserva di proposito, come TD3. Il tech debt della spec rimanda lì.
- **Correzioni dopo la review.** Tutti MINOR:
  - Un testo con il byte NUL ora si scarta (AC8); prima dava `INTERNAL_SERVER_ERROR`.
  - `validateAndFormatDate` rilegge la data in UTC: ora la chiama anche il server, e a ovest di UTC rifiutava ogni data.
  - Test per i mutanti sopravvissuti: intero sotto il range, testo vuoto con righe NULL, decimale `.5`, Select degli enum e segnaposto delle date nel popover.
  - Il §13 del PLAN ora elenca anche `\`, i due effetti di D17 e il byte NUL.

## Surprises and Decisions

- **Il tipo di colonna si legge da `columnType`, non da `dataType`.** In drizzle 0.45.4 `PgNumeric` ha `dataType "string"`: era la causa di F5 (`=` su un decimale finiva in `ilike` su un `numeric`). `columnType` è una stringa letterale passata al costruttore, quindi la minificazione non lo rompe (verificato dalla review, v5).
- **Valori legati con `` sql`${v}` `` e non con l'encoder della colonna.** L'encoder di `PgTimestamp` chiama `toISOString` e sposterebbe le date al confine del giorno. Con il testo legato Postgres converte la data nel fuso della sessione (D11), come faceva il vecchio letterale. Provato su PGlite e su Postgres 15 con postgres-js (`prepare: false`); un mutante con l'encoder fa fallire i test del confine di Roma.
- **Nei worker di vitest `TZ` non si cambia a runtime.** `process.env.TZ` assegnato in un test non cambia il fuso del thread. Il test di `validateAndFormatDate` a ovest di UTC gira quindi in un Node a parte (`--import tsx`, `TZ=America/New_York`).
- **`next lint` nel worktree annidato fallisce** per due `.eslintrc.cjs` in conflitto (quello del checkout principale e quello del worktree). Durante il lavoro ho usato `eslint --no-eslintrc -c .eslintrc.cjs`; il gate vero è girato in un worktree fuori dal checkout principale.
- **Errore preesistente su `/dashboard`:** `invalid input value for enum task_status: "non risponde"`, uguale sulla base e sul branch. Fuori scope, nel tech debt della spec.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| AC1: `git grep -nE "sql\.raw\|sql\.identifier\|StringChunk\|\.unsafe\(" -- <percorsi del PLAN T9>` | vuoto | Nel repo, `sql.raw` resta solo in `src/server/db/seeds/local/write.ts`, fuori perimetro |
| Gate in un worktree di scratchpad senza `.env*`, a `bfd559e` | verde | `pnpm install --frozen-lockfile`; `SKIP_ENV_VALIDATION=true pnpm exec next lint`; `pnpm exec tsc --noEmit`; `pnpm run test --run` con `TEST_DATABASE_URL` (211 file, 3102 test verdi, 2 saltati); `pnpm build` con i placeholder; `pnpm api:build`; `pnpm api:smoke` |
| Dopo `9c0d770` | verde | `tsc --noEmit` (solo i TS6053 di `.next/types`, assenti nel worktree), eslint sui file toccati, le suite di dominio, Clienti, Pratiche, `utils` e popover con `TEST_DATABASE_URL`: 12 file, 238 test |
| Mutanti di AC3 sul branch finito | tutti uccisi | **M1** da 4 test di Clienti "sqlFilter non arriva al database". **M2, M3** da 3 test di Pratiche (NOT EXISTS, bypass, frontend vecchio). **M4** su testo, intero, decimale, data ed enum dai test di AC4 e AC5. **M5** (`sql.raw`/`sql.identifier` sul nome di colonna) dai test delle colonne malevole, "una colonna di task tolta da Clienti", "solo voci non valide", "una colonna fuori mappa". **D11** (valore passato all'encoder) dai test del confine di Roma e da quelli di AC5 |
| Mutanti dei rilievi della review, dopo `9c0d770` | tutti uccisi | limite inferiore degli interi (4 test, pg compreso), guardia del testo vuoto (2), byte NUL (3, pg compreso), `.5` (1), Select degli enum (1), segnaposto delle date (1), getter UTC (1) |
| A/B su `mito_local` (10.000 clienti, 9.345 pratiche, sessione Europe/Rome), base `594ff64` su :3001 contro il branch su :3000 | uguali fuori dal §13 | Totali uguali per tutti i filtri validi del PLAN T9. Differenze, tutte del §13: `comune:eq:%` 10.000 → 0; `comune:eq:nell'emilia` errore di sintassi → 484; `comune:gt:M` 5.858 → 10.000 (operatore scartato); `importo_rata:eq:200` errore → 19 (D16); iniezione su `region` errore di sintassi → 0; `state:gt:Liquidata` 3.841 → 9.345; iniezione su `comune` in Pratiche 9.345 = 9.345. Il popover mostra gli stessi operatori |
| Review avversariale | SHIP | 7/7 passaggi. v1 sicurezza (20 mutanti, parametri visti su postgres-js), v2 AC12 (600 input casuali base contro head, stesso SQL e stessi risultati), v3 equivalenza (2.600 tuple su PG15 e PGlite), v7 UI (popover identico alla base da 280 a 1440 px) |
| A2 | confermata | In prod il deploy è `vercel deploy --prebuilt --prod` (`deploy-production.yaml:70`); Cloud Run solo su staging |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1 | Met | grep vuoto; `filters.ts` senza SQL (review v1, v4) |
| AC2 | Met | `NOT EXISTS` e `1=1) OR (1=1` con ricerca non cambiano lista né `total` in tutte e due le procedure; i payload cambiano il risultato sulla base |
| AC3 | Met | mutanti M1–M5 e D11 uccisi; v1 ne ha uccisi 20, compresi `sql.raw` su un solo ramo della `union` |
| AC4 | Met | `'`, `%`, `_` e `\` letterali, su PGlite e su Postgres |
| AC5 | Met | spy su PGlite per pagina e `total`; v1 l'ha visto sul driver di produzione |
| AC6 | Met | A/B e differenziale di v3: stessi risultati per i filtri validi; le differenze sono nel §13 o in D16 |
| AC7 | Met | `Map` chiuse per tabella, operatori per tipo da `operatorsFor` e `COMPARE` |
| AC8 | Met | voci non valide scartate senza errore; il byte NUL corretto in `9c0d770`. Un `value` non stringa fa fallire lo zod dell'intera richiesta (fallisce chiuso; follow-up nel tech debt) |
| AC9 | Met | forma `nome:operatore:valore`, ripetibile; i link vecchi danno la stessa lista |
| AC10 | Met | `sqlFilter` tolto dallo zod; test con il payload di un frontend vecchio |
| AC11 | Met | un'unica PR; nessun costruttore di SQL in `filters.ts` |
| AC12 | Met | caratterizzazione invariata, 50/50 sulla base e su HEAD; differenziale di v2 |

## Remaining Work

- **Revisione di Leo** (PLAN T9, punto 6).
- **PR verso `dev`** solo quando Omar la chiede (T9, punto 8). Il diff non aggiunge migrazioni.
- **G2/G3 del PLAN:** finestra su staging fra Cloud Run e Vercel; in prod il rilascio va insieme a PR5a, PR5b e PR6, con Standard Protection sui deployment vecchi e la regola sull'Instant Rollback.
- Le voci di [[tech-debt/crm/filtri-sql-sicuri]] e TD7 in [[chore/migrazione-effect]].

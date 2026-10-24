---
domain: crm
type: review
scope: spec
spec: filtri-sql-sicuri
review_target: spec implementation
base_ref: 594ff64
head_ref: bfd559e
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/filtri-sql-sicuri/RUBRIC]]"
  - "[[specs/crm/filtri-sql-sicuri/SPEC]]"
  - "[[specs/crm/filtri-sql-sicuri/PLAN]]"
  - "[[specs/crm/filtri-sql-sicuri/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-10-24
updated: 2026-10-24
---

# Review Report: Filtri avanzati sicuri di Clienti e Pratiche

## Verdict

**SHIP** · impact: critical

Nessun verificatore ha trovato un BLOCKER o un MAJOR. Il passaggio di sicurezza non ha trovato un percorso per cui SQL del chiamante arrivi al database in una delle cinque query (pagina e `total` di Clienti, `total` e i due rami della `union` di Pratiche), con 20 mutanti uccisi e i parametri legati osservati sul driver di produzione (postgres-js).

## Coverage

- Rubric passes run: 7/7. v1, v2, v3 sul modello più forte (inherit); v4, v5, v6 su sonnet; v7 su haiku.
- Passes skipped or failed: none.
- UI pass: ran on http://localhost:3000/dashboard/customers e /dashboard/pratiche (branch) contro http://localhost:3001 (base 594ff64), stesso database locale, sessione ADMIN di seed. Chromium (agent-browser 0.27.1). Eseguiti `width-sweep` (solo riga di testo di Clienti) e `resize` a mano; `edge` non eseguito (corsa al reload nello script).

## Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MINOR | v1 — sicurezza (AC8) | `packages/server/src/api/routers/utils/advancedFilters.ts:106-110` | Un valore di testo con un byte NUL (`\u0000`) passa la convalida e Postgres lo rifiuta: `region:eq:La%00zio` dà `INTERNAL_SERVER_ERROR` invece di essere scartato. Niente viene eseguito: fallisce chiuso. Vale anche per `q` oggi. | Scartare la voce di testo che contiene `\u0000` e aggiungere il caso alla lista di AC8. | no |
| MINOR | v3 — equivalenza (AC6) | `advancedFilters.ts:113-115` via `containsPattern` | `\` in un valore di testo: prima faceva da escape del LIKE, ora è letterale. Differenza misurata su PG15 (`comune:eq:a\b` 0 → 1 riga) e non elencata nel §13. Coerente con AC4. | Aggiungere la voce al §13 del PLAN. | no |
| MINOR | v3 — equivalenza (AC6) | `advancedFilters.ts:28-30, 105, 129` | I limiti di D17 cambiano risultati e non sono nel §13: un testo oltre 255 caratteri prima dava 0 righe, ora si scarta e la lista è intera; oltre la ventesima voce i filtri non si applicano. | Aggiungere i due effetti di D17 al §13. | no |
| MINOR | v6 — integrità dei test; v3 (NIT) | `packages/domain/src/filters/advanced.ts:153-190` | `validateAndFormatDate` interpreta la data in UTC e la controlla con i getter locali: a ovest di UTC ogni data valida è rifiutata (`TZ=America/New_York` fa fallire `advanced.test.ts:163`). La funzione c'era già, ma ora la chiama anche il server, dove scarterebbe in silenzio tutti i filtri sulle date. Vercel e Cloud Run girano in UTC. | Usare i getter `getUTC*` e aggiungere un test con un fuso a ovest di UTC. | no |
| MINOR | v6 — integrità dei test | `advancedFilters.ts`, `integerValue` | Il limite inferiore del range intero non ha un test: il mutante `n <= max` sopravvive, e `age gt -99999` darebbe un 500 con tutti i test verdi. Il codice è corretto. | Aggiungere un caso con un intero sotto il minimo nei test di Clienti, Pratiche e pg. | no |
| MINOR | v6 — integrità dei test | `advancedFilters.ts`, caso `text` | Il caso "un testo vuoto" è fissato solo a metà: senza la guardia `length > 0`, `ILIKE '%%'` differisce da "nessun filtro" solo sulle righe NULL, e il seed non ne ha. | Seminare un cliente con `occupazione` NULL e una pratica con `region` NULL nel caso del testo vuoto. | no |
| MINOR | v4 — cablaggio frontend; v6 (NIT) | `src/components/custom/table/PopoverFilter.tsx` ~L299, ~L329 | Le due righe riscritte del popover (Select per gli enum, placeholder `aaaa-mm-gg` sulle date) non hanno un'asserzione: i mutanti sopravvivono. Non erano coperte nemmeno prima. | Due casi in `PopoverFilter.test.tsx`: `state:eq:Liquidata` mostra un combobox per il valore; `birthday_date:lt:…` mostra il placeholder. | no |
| MINOR | v5 — confini tra pacchetti | `packages/domain/package.json:4` | La descrizione del pacchetto non menziona le mappe delle colonne filtrabili, che ora vivono nel dominio. Nessuna regola violata: il dominio importa già lo schema di `@mito/db`. | Facoltativo: aggiornare la descrizione. | yes |
| NIT | v1 — sicurezza (AC8) | `packages/domain/src/filters/advanced.ts:120-124` | Un `value` non stringa (`5`) fallisce lo zod dell'intera richiesta invece di scartare la sola voce. Solo un chiamante diretto ci arriva; fallisce chiuso. | Facoltativo: `z.unknown()` e scarto nel traduttore. | yes |
| NIT | v2 — AC12 | `packages/server/src/api/routers/pratiche/GET/index.ts:200` | `Effect.all` concorrente: se `total` fallisce parte comunque la query della pagina, e con due errori il messaggio dipende da quale arriva prima. Codice sempre `INTERNAL_SERVER_ERROR`; stesso schema di `getAllCustomers`. | Facoltativo. | yes |
| NIT | v2 — AC12 | `pratiche/GET/index.ts:82` | `getAllPratichePage` non dichiara il tipo di ritorno, a differenza di `getAllCustomersPage`. | Facoltativo: dichiararlo. | yes |
| NIT | v4 — cablaggio frontend | `src/app/dashboard/customers/_constants/index.ts:3-8` | Le riesportazioni di `*_FILTER_QUERY_MAP` servono solo a un test; `TableFilterSection` di Pratiche importa ancora da `customers/_constants`. | Facoltativo. | yes |
| NIT | v4 — cablaggio frontend | `PopoverFilter.tsx` ~L162 | `filter.op as FilterOperator` senza convalida (c'era già). | Facoltativo. | yes |
| NIT | v5 — confini tra pacchetti | `apps/api/smoke.mjs` | Lo smoke non chiama le nuove procedure; la prova che girano nel bundle Hono è che il bundle le contiene e che i test passano. | Nessuna. | no |
| NIT | v6 — integrità dei test | test dei decimali | `.5` non ha un caso (il mutante sul regex sopravvive). | Facoltativo: un caso `importo_rata gt .5`. | no |
| NIT | v6 — integrità dei test | `advanced.test.ts` | Il primo test di `operatorsFor` è un sottoinsieme della tabella colonna per colonna. | Facoltativo. | no |
| NIT | v6 — integrità dei test | `getAllCustomers.db.test.ts` | `closed_at` non è più nominato come scartato dal server; segue lo stesso percorso di `state`. | Nessuna. | no |
| NIT | v7 — UI del PopoverFilter; v4 | `packages/domain/src/filters/advanced.ts:110-111` | Per un `columnType` fuori da `KIND_BY_COLUMN_TYPE`, `operatorsFor` dà nessun operatore, dove la base dava `=`. Nessuna colonna di oggi ci arriva. È voluto: il server non deve accettare `eq` su un tipo che non sa tradurre, e il test colonna per colonna di `advanced.test.ts` fallisce se una colonna della mappa non ha tipo. | Nessuna. | no |

## What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — sicurezza | `git grep sql.raw` a bfd559e: solo in un seed fuori perimetro. Colonne solo da `Map` chiuse di `PgColumn`; operatori solo da una mappa chiusa di funzioni drizzle filtrata per tipo. Su postgres-js reale (sessione Europe/Rome) `total` e i due rami della `union` hanno solo `$1…$12`, nessun valore nel testo SQL. 20 mutanti uccisi, compresi `sql.raw` su un solo ramo della `union`, su ogni tipo di valore, e la rimozione di ogni controllo. I payload di AC2 cambiano il risultato sul vecchio cablaggio (Clienti `NOT EXISTS` 2→0, `1=1) OR (1=1` 1→2; Pratiche 4→0 e 2→4). `sqlFilter` tolto dallo zod. |
| v2 — AC12 | Confronto base contro head nello stesso processo su 600 input casuali (pagine, ordinamenti, ricerche con `%`, `_`, `'`, ogni `filterBy`, OPERATORE e ADMIN): 407 successi identici per dati, `total`, ordine, testo SQL e parametri; 193 errori identici per codice e messaggio. Le asserzioni di caratterizzazione non cambiano da T1 e passano 50/50 sulla base e su HEAD. `query` e `runTrpc` usati come in `getAllCustomers`. |
| v3 — equivalenza (AC6, AC9) | Differenziale su PG15 reale (postgres-js, `prepare: false`, Europe/Rome) e su PGlite: 2.600 tuple. Colonne, operatori, interi, decimali, date ai confini del giorno e dell'ora legale e forma dell'URL coincidono con il vecchio percorso; ogni differenza è un vecchio errore del database, una voce del §13, D16, o uno dei due MINOR sopra. |
| v4 — cablaggio frontend | Le pagine mandano `advancedFilters: parseFilterParams(filter)` e niente SQL. Operatori, controllo date ed enum identici a prima per tutte le 18 colonne. 17 mutanti su ripetibilità, troncamento, operatori, date e filtri sconosciuti uccisi. Nessun importatore rotto dopo AC11. |
| v5 — confini tra pacchetti | Nessun `next/*` o `@/` in `packages/server` fuori dai test. `tsc`, `api:build`, `api:smoke` verdi in una copia pulita. `columnType` è una stringa letterale, la minificazione non lo rompe. Il bundle del browser riceve solo definizioni di tabelle e funzioni pure, già presenti prima. |
| v6 — integrità dei test | Ogni copertura tolta o riscritta è ancora protetta da un test nominato. Il file pg gira in CI (15 test), si salta senza variabile e fallisce con `CI=1` se manca il database. I test passano per le interfacce pubbliche. |
| v7 — UI del PopoverFilter | Base e branch a confronto su 8 tipi di colonna: opzioni di colonna e operatori, Select per gli enum (11 valori di `source`, 6 di `state`), placeholder `aaaa-mm-gg` solo sulle date, markup del dialog identico tolti gli id di Radix, alberi dei nomi accessibili identici, geometria identica da 280 a 1440 px, cambio di colonna su una riga nuova identico a ogni passo. I difetti a 280 px (pagina che sborda, trigger fuori schermo) e i controlli senza nome esistono uguali sulla base. |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Sicurezza (AC1–AC5, AC7, AC8, AC10) | SHIP | Nessun percorso per SQL del chiamante; i due rilievi falliscono chiusi. |
| v2 | AC12, getAllPratiche su Effect | SHIP | Stesso SQL, stessi risultati su 600 input; differenze solo sul percorso d'errore, codice invariato. |
| v3 | Equivalenza dei filtri validi (AC6, AC9) | SHIP | Equivalente per i filtri validi; due lacune di documentazione nel §13. |
| v4 | Cablaggio del frontend e AC11 | SHIP | Nessun criterio mancato; una lacuna di test su righe già scoperte. |
| v5 | Confini tra pacchetti e portabilità | SHIP | Nessuna violazione; gate verdi in una copia pulita. |
| v6 | Integrità dei test | SHIP | Copertura preservata; tre lacune di test minori. |
| v7 | UI del PopoverFilter | SHIP | Popover reso identico alla base per ogni tipo di colonna. |

## Human Review Checklist

1. Rileggere il traduttore `packages/server/src/api/routers/utils/advancedFilters.ts` e le due procedure (`customer/GET`, `pratiche/GET`): ogni colonna viene da `columns.get(field)`, ogni operatore da `COMPARE`, ogni valore da `bound(...)` o da un helper drizzle. Nessun `sql.raw` (`git grep -n "sql.raw" packages src apps` trova solo `src/server/db/seeds/local/write.ts`).
2. Eseguire i gate del root `AGENTS.md` in un checkout senza `.env*`: `SKIP_ENV_VALIDATION=true pnpm exec next lint`, `pnpm exec tsc --noEmit`, `pnpm run test --run` con `TEST_DATABASE_URL` (i `*.pg.test.ts` devono risultare eseguiti, non saltati), `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke`. Buono: tutti verdi.
3. Verificare che il diff non aggiunga file in `packages/db/migrations/` (`git diff --stat 594ff64..HEAD -- packages/db/migrations` vuoto).
4. Provare a mano una chiamata diretta: con una sessione da OPERATORE, una POST a `customer.getAllCustomers` con `sqlFilter: "NOT EXISTS (SELECT 1 FROM \"mito-deutsche_user\")"` deve dare lo stesso `total` della chiamata senza; lo stesso per `pratiche.getAllPratiche`.
5. In staging, dopo il deploy: un link salvato con `filter=comune:eq:Roma` e uno con `filter=importo_rata:gte:100` mostrano le liste attese; un link con `filter=state:eq:chiamare` su Clienti mostra la lista intera, senza errore.
6. Confermare che i MINOR del report sono risolti o accettati, e che le differenze volute del §13 del PLAN (aggiornato con `\` e D17) sono note a chi usa i filtri.
7. Revisione del codice di Leo prima del merge in `dev`.

## Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1 | Met | v1: `sql.raw` solo in un seed fuori perimetro; `filters.ts` senza SQL. |
| AC2 | Met | v1: `NOT EXISTS` e `1=1) OR (1=1` con ricerca non cambiano lista né `total`, in entrambe le procedure. |
| AC3 | Met | v1: i mutanti `sql.raw` per procedura, per query e per ramo della `union` fanno fallire i test. |
| AC4 | Met | v1: `'`, `%`, `_` e `\` restano letterali, su PGlite e su Postgres. |
| AC5 | Met | v1: parametri legati per ogni tipo e operatore, visti su postgres-js e con lo spy su PGlite. |
| AC6 | Met | v3: stessi risultati per i filtri validi; differenze tutte nel §13 o in D16, più `\` e D17 da annotare. |
| AC7 | Met | v1: mappe chiuse per tabella, operatori per tipo, nessun nome o operatore nel testo SQL. |
| AC8 | Met | v1, v6: voci fuori mappa o non valide scartate senza errore. Bordo: un testo con NUL dà un 500 (MINOR). |
| AC9 | Met | v3, v4: forma `nome:operatore:valore` ripetibile; i link vecchi danno la stessa lista. |
| AC10 | Met | v1: `sqlFilter` tolto dallo zod, nessun effetto. |
| AC11 | Met | v4: un'unica PR; nessun costruttore di SQL in `filters.ts`, nessun importatore rotto. |
| AC12 | Met | v2: stessi dati, `total`, ordine ed errori su 600 input; caratterizzazione invariata. |

## Notes for docs-maintenance

- Correzioni prima del merge (commit `9c0d770`, dopo questa review): byte NUL scartato; `validateAndFormatDate` in UTC; test per il limite inferiore degli interi, il testo vuoto con righe NULL, `.5`, il Select degli enum e il segnaposto delle date (i mutanti dei rilievi ora muoiono). `\` e D17 aggiunti al §13 del PLAN.
- Durable findings to fold into `brain/tech-debt/crm/filtri-sql-sicuri.md` (già scritti lì dall'implementazione): le righe marcate `yes`.
- Domain pages that should backlink this review: le pagine di flusso dei filtri di Clienti e Pratiche, quando `docs-maintenance` le scrive.

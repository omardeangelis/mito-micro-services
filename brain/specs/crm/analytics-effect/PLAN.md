---
domain: crm
type: plan
links:
  - "[[specs/crm/analytics-effect/SPEC]]"
  - "[[chore/migrazione-effect]]"
  - "[[specs/crm/pratiche-effect/PLAN]]"
  - "[[specs/crm/chat-storage-effect/PLAN]]"
  - "[[tech-debt/crm/export-chiamate]]"
created: 2026-10-26
updated: 2026-10-26
---

# Plan: Router `analytics` su Effect, con le correzioni della dashboard (passo 6 della migrazione)

**Spec:** [[specs/crm/analytics-effect/SPEC]], scritta il 2026-10-26, con due passate di verifica (la prima DO NOT SHIP con 1 blocker e 2 major, la seconda con 1 blocker; tutti corretti).

**Status:** Complete per il perimetro dell'esecuzione (2026-10-26): G0–T18 fatti e T19 in locale, review SHIP al giro 2 ([[specs/crm/analytics-effect/REPORT]]), prova nel browser su `mito_local` fatta dopo il giro 2 (un difetto, il fuoco dopo la scelta del periodo, corretto in `a44ed77`), poi le correzioni della UI trovate nella prova (`2f583e6`, `1f13227`). Resta la PR verso `dev` con Leonardo, in mano a Omar
**Generato:** 2026-10-26 con `create-plan`. Il flusso: spec (4 decisioni di Omar), verifica della spec, grill (nessuna domanda: le decisioni rimaste si ricavano dal codice e dai passi 4 e 5), task graph, tdd, verifica del piano.
- **Verifica del piano:** DO NOT SHIP, 0 blocker, 2 major, 7 minor e 5 nit, tutti corretti (§17).

**Baseline:** `dev` a `2fd59da` (merge della PR #74).
**Branch:** `claude/analytics-effect`, da `dev`, una PR verso `dev`. Il primo commit porta SPEC, PLAN e indici di `brain/`.
**Chi:** scrive Omar, rivede Leonardo (AC19 cambia i permessi).
**Strategia di contesto:** [[chore/migrazione-effect]], passo 6 dell'ordine dei router (§4).

---

## 1. Situazione iniziale

- **Router `analitycs`** (`packages/server/src/api/routers/analytics/`): `index.ts` e `GET/index.ts` (379 righe), 8 procedure, montato come `analitycs` in `packages/server/src/api/root.ts`. Nessun test.

  | Procedura | Middleware | Chiamante | Query |
  |---|---|---|---|
  | `getFinanziatoMedioPerOperatore` | `protectedProcedure` | `AdminDataSection` | `avg` con `innerJoin` su `customerToPratica`, `customers`, `operators`, più `isNotNull(customers.operatorId)`; nessun filtro per ruolo |
  | `getAmountPerSedeInLastMonth` | `protectedProcedure` | `AdminDataSection` | `selectDistinct` + `groupBy` su `practices.desPuntoVendita`, `orderBy` sul nome, un `count()` che non restituisce; risposta `as { data: string; total: number }[]` |
  | `getAllDoneTasksInLastMonth` | `operatorProcedure` | tutte e due le sezioni | `done` = `notInArray(task.state, ["chiamare", "nessuno"])`, `todo` = `eq(task.state, "chiamare")`; niente `isActive`, niente data; `ADMIN` tutti, `OPERATORE` `eq(task.operatorId, id)` |
  | `getFinanziatoTotalePerOperatore` | `operatorProcedure` | `OperatorDataSection` | `sum` con gli stessi join; `OPERATORE` `eq(customers.operatorId, id)`, `ADMIN` nessun filtro |
  | `getFinaziatoMedioPerCliente` | `operatorProcedure` | `OperatorDataSection` | `avg`, stesso filtro di quella sopra |
  | `getPraticheLiquidate`, `getAllNewPraticheOfLastMonth`, `getAllImportoRatePageteOfLastMonth` | `operatorProcedure`, `operatorProcedure`, `protectedProcedure` | nessuno | – |

- **Finestre.** Le procedure sugli importi usano `between(practices.dataLiquidazione, ...)` con `TIMEFRAMEMAP[tf]` (riferimento) e `TIMEFRAMEDELTA[tf]` (confronto), costanti di `packages/domain/src/constants/timeframes.ts` calcolate con `setDate(getDate() - N)` al caricamento del modulo. `between` include gli estremi: una pratica liquidata a "adesso − N giorni" cade in tutte e due le finestre.
- **Risposte.** `sum(castAsNumber(...))` e `avg(...)` sono `SQL<string | null>`. Con `?? 0`, nell'oggetto restituito il `0` si allarga, quindi `inferRouterOutputs` dà `{ reference: string | number; comparison: string | number }`; a runtime il valore è la stringa del driver o lo `0`. `count()` è `number`.
- **Due query per procedura.** Ogni procedura sugli importi ripete la stessa query due volte, una per finestra (`GET/index.ts:272–314`, `:331–373`): il riferimento e il confronto hanno ognuno il proprio filtro per ruolo e i propri join.
- **UI** (`src/app/dashboard/`):
  - `page.tsx` legge `tf` da `searchParams` e lo passa con `tf as TimeFrame` a `DataSection`, che sceglie `AdminDataSection` o `OperatorDataSection` dal ruolo di `user.getUserPreference`. Non c'è un `error.tsx`.
  - `AdminDataSection`: `FinanceCard` "Finanziato medio per operatore", `CircleCard` "Chiamate completate", `DonutCard` (titolo fisso "Finanziato totale per sede"). `OperatorDataSection`: `FinanceCard` "Finanziato medio per operatore" (con il totale), `CircleCard`, `FinanceCard` "Finanziato medio per cliente". Tutte e due convertono con `Number(...)`.
  - `FinanceCard` (`"use client"`): `delta = (ref − comp) / (comp || 1)`; le tre date sono `TIMEFRAMEDELTA[tf].start`, `TIMEFRAMEDELTA[tf].end` e `TIMEFRAMEMAP[tf].end`, formattate con `toLocaleDateString("it-IT", financeCardFormattingSettings)` nel fuso del processo.
  - `CircleCard`: `switch (percentage > 100)` con `case percentage > 75: "green"`… L'espressione vale sempre `false`, quindi fino al 75% il colore è verde e sopra è rosso.
  - `DonutCard` mostra già `d.data ?? "Nessuna"` per il punto vendita `null`.
  - `TimeFrameSelector` (`src/components/custom/date-picker/index.tsx`): `defaultValue={tf ?? DEFUALTTIMEFRAME}`, con `tf` letto da `useSearchParams` e lo store `useAnalitycsStore` (`src/store/useAnalitycsStore.ts`) che spinge `?tf=` nell'URL.
- **Chi usa le costanti** (fuori da `analytics`): `TIMEFRAMEMAP`/`TIMEFRAMEDELTA` solo `FinanceCard`; `DEFUALTTIMEFRAME` `page.tsx`, `DataSection`, le due sezioni, il selettore; `TIMEFRAMEOPTIONS` il selettore; `type TimeFrame` le sezioni, `FinanceCard`, `page.tsx`, il selettore, lo store.
- **Middleware** (`packages/server/src/api/trpc.ts`): `operatorProcedure` passa da `resolveActor` e mette in `ctx` `operator` e `actor` (`Actor` di `@mito/domain/contact/permissions`); un utente senza operatore riceve `BAD_REQUEST`, un disattivato `UNAUTHORIZED` "Utente disattivato". `adminProcedure` è `operatorProcedure` più `FORBIDDEN` "admin-only" per chi non è `ADMIN`.
- **Infrastruttura pronta:**
  - `effect/db.ts` (`Db`, `query`, `DbError`) ed `effect/trpc.ts` (`runTrpc`: senza traduttore, ogni `DbError` diventa `INTERNAL_SERVER_ERROR` con il messaggio del driver);
  - `ctx.actor` nelle procedure su `operatorProcedure` (come `operator/PUT`);
  - `Clock.currentTimeMillis` nei servizi (`services/import/run.ts`) ed `Effect.withClock` nei test (`services/import/_test/apply.db.test.ts:627–646`);
  - `callStates` e `outcomeStates` di `@mito/domain/contact/status`;
  - `RouterOutputs` di `src/trpc/shared.ts` (usato da `import/_components/format.ts`).
- **Harness di test:**
  - `createTestCaller`, `rejectionOf` (`src/test/caller.ts`); `runServer` (`src/test/effect.ts`), che esegue un programma con `ServerLive` sul database di test;
  - factory `createUser` (senza operatore), `createOperator` (`role`, `disabledAt`), `createCustomer`, `createPractice` (sempre con un cliente `Intestatario`), `createTask`;
  - `migrateUpTo`, `resetDb` (`src/test/db.ts`), PGlite per `*.db.test.ts`;
  - test di componenti con `vi.mock("@/trpc/server")` (`export/_test/CallsSection.test.tsx`) e con `@tremor/react` finto in parte (`export/_test/ExportCharts.test.tsx`);
  - tabella dei middleware tipata sulle chiavi del router, con una lista `REMOVED` (`pratiche/_test/procedures.db.test.ts`); test sulle chiavi (`task/_test/router.db.test.ts`);
  - `timeZoneTests` di `vitest.config.ts`, eseguiti dai progetti `utc` e `rome` di `vitest.workspace.ts` in processi separati.
- **Nessun test di tipo** nel repo: `expectTypeOf` di vitest 1.6 si usa per la prima volta (T5). `tsconfig.json` include `**/*.ts`, quindi `tsc --noEmit` controlla anche i file di `_test/`.
- **`server-only`:** 38 file di `packages/server/src` a `2fd59da`. Nessuno sta in `routers/analytics/`.

## 2. Problema

1. Le 8 procedure di `analytics` hanno la logica e le query nel router, senza test: blocca L3 e viola la regola 5 del §2 di [[chore/migrazione-effect]].
2. Le card della dashboard "Analisi Andamento" sbagliano: finestre ferme all'avvio del processo (S1), pratiche contate una volta per cliente (S2), numeri di tutto il CRM a ogni sessione (S3), "Chiamate completate" che conta lo storico e mette la coda fra i completati (S4), titoli e nomi sbagliati (S5), importi come stringhe (S6), badge e colori sbagliati (S7), pagina che cade con un `tf` non valido (S8), pratiche rifiutate e stornate contate come finanziato (S9).
3. Senza caratterizzazione, nessuno può dire che il refactor non cambia niente, né distinguere le correzioni dal refactor.

## 3. Forma della soluzione

Una PR, tre round, ognuno nei suoi commit:

| Round | Task | Contenuto | Comportamento |
|---|---|---|---|
| **1. Caratterizzazione** | T1–T5 | Test via `createTestCaller` sulle risposte delle 5 procedure con chiamanti, tabella dei middleware, test di tipo. Ogni file uccide i suoi mutanti sul codice di oggi | Nessun cambio; verdi su `2fd59da` |
| **2. Refactor** | T6–T8 | Le 3 procedure senza chiamanti tolte; servizi in `services/analytics/`, procedure adapter; controllo del round | Invariato (AC4–AC8) |
| **3. Correzioni** | T9–T17 | Contratto nuovo del router e permessi, finestre dal `Clock`, conteggi, contatti, card, periodo, refusi, debito | Cambia, ogni correzione da un test rosso |
| **Chiusura** | T18–T19 | Documenti, gate di CI, prova nel browser, `adversarial-review`, PR | – |

**Servizi alla fine del round 2:**

```
services/analytics/
  financed.ts         financedTotal({ timeFrame, actor }), financedAverage({ timeFrame, actor? }),
                      financedByBranch({ timeFrame })
  contactProgress.ts  contactProgress({ actor })
```

**Alla fine del round 3:**

```
services/analytics/
  windows.ts          financeWindows(timeFrame): le due finestre dal Clock (AC9)
  financed.ts         financedTotal({ timeFrame, actor }), financedAverage({ timeFrame, actor }),
                      financedByBranch({ timeFrame })
  contactProgress.ts  contactProgress({ actor })
```

- **Nessun `errors.ts`:** i servizi non hanno errori attesi. Un errore del driver resta un `DbError`, che `runTrpc` rende `INTERNAL_SERVER_ERROR` con il messaggio del driver, come oggi `driverErrorMiddleware`.
- **Nessun `server-only`** nei file nuovi, come nei passi 4 e 5: TD6 resta a 38.
- **Router alla fine** (AC15, AC19):

  | Procedura | Middleware | Servizio | Risposta |
  |---|---|---|---|
  | `getFinancedTotal` | `operatorProcedure` | `financedTotal` | `{ reference: number; comparison: number; windows }` |
  | `getFinancedAverage` | `operatorProcedure` | `financedAverage` | `{ reference: number; comparison: number; windows }` |
  | `getFinancedByBranch` | `adminProcedure` | `financedByBranch` | `{ data: string \| null; total: number }[]` |
  | `getContactProgress` | `operatorProcedure` | `contactProgress` | `{ done: number; todo: number }` |

  `windows` è `{ reference: { start: Date; end: Date }; comparison: { start: Date; end: Date } }`: le finestre su cui il servizio ha contato, con `comparison.end` = `reference.start` (escluso dal confronto). `superjson` porta i `Date` anche via HTTP (`BACKEND_URL`).

## 4. Decision ledger (risolto)

| # | Decisione | Fonte |
|---|---|---|
| D1 | SPEC e PLAN in `brain/specs/crm/analytics-effect/` | SPEC |
| D2 | Una PR verso `dev`, tre round in commit separati, le correzioni per ultime | Omar, 2026-10-26 (SPEC, Constraints) |
| D3 | Revisione obbligatoria di Leonardo prima del merge | SPEC, AC19; §4 di [[chore/migrazione-effect]] |
| D4 | Le 4 decisioni di prodotto: "Contatti con esito" sulla coda attuale; una pratica conta una volta, per chi ha un cliente; medie rinominate "per pratica"; contano solo Liquidata, Chiusa ed Estinta anticipata | Omar, 2026-10-26 (OQ4–OQ7 della SPEC) |
| D5 | I test del round 1 girano all'ora vera, senza timer finti: `TIMEFRAMEMAP` si calcola al caricamento del modulo, prima di qualsiasi `vi.setSystemTime`. Le date si calcolano da `Date.now()` del test, ad almeno un giorno dagli estremi (il margine copre anche il cambio dell'ora, SPEC, Technical Notes) | SPEC, AC1 |
| D6 | Nessun file di test nomina `TIMEFRAMEMAP`, `TIMEFRAMEDELTA` o `insertChatToOperatorSchema`: le `grep` di AC10 e AC23 non escludono `_test/`. I test possono nominare `analitycs` e le chiavi vecchie (AC18) | SPEC, AC10, AC18, AC23 |
| D7 | I file di test hanno dal round 1 nomi che valgono anche dopo il round 3: `financed`, `byBranch`, `contactProgress`, `procedures`, `types`, `router` | Meno rinomine nel round 3 |
| D8 | La tabella dei middleware del round 1 è tipata sulle chiavi del router meno una lista `REMOVED` con le 3 procedure senza chiamanti: resta verde dopo T6 senza modifiche. T9 la riscrive sulle chiavi nuove, esatte, senza `REMOVED` | Precedente D14 di [[specs/crm/pratiche-effect/PLAN]]; AC2, AC8, AC19 |
| D9 | Nel round 2 `financedAverage` prende un `actor` opzionale: senza `actor` nessun filtro per ruolo, come `getFinanziatoMedioPerOperatore`, che è `protectedProcedure` e non ha `ctx.actor`. Con un `ADMIN` è la stessa query. T9 rende `actor` obbligatorio | SPEC, Technical Notes ("Media admin e media operatore sono già la stessa query"); AC6 |
| D10 | `isNotNull(customers.operatorId)` di `getFinanziatoMedioPerOperatore` non passa nel servizio: con l'`innerJoin` su `operators.id = customers.operatorId` è ridondante. È un mutante equivalente (§11) | Prova: un `operatorId` `null` non è uguale a nessun `operators.id` |
| D11 | T7 sposta la query di `getAmountPerSedeInLastMonth` com'è, `selectDistinct`, `count()` e cast compresi. La riscrive T11, con gli stati | Refactor senza sorprese; il cast si toglie dove la risposta cambia |
| D12 | Il round 3 parte dal contratto del router (T9: nomi, chiavi, permessi), poi le correzioni lato server sui nomi nuovi. Le correzioni della UI che non toccano gli stessi file (T13, T14, T17) girano accanto a T9 | Con i nomi vecchi, la media dell'admin (`protectedProcedure`, senza `ctx.actor`) non potrebbe seguire AC13 |
| D13 | Le finestre stanno in `services/analytics/windows.ts`, lette con `Clock.currentTimeMillis` a ogni chiamata. Riferimento: `practices.dataLiquidazione` fra `now − N × 86 400 000` e `now`, estremi inclusi (`gte` e `lte`). Confronto: da `now − 2N × 86 400 000`, incluso, a `now − N × 86 400 000`, escluso (`gte` e `lt`). `getFinancedByBranch` usa la finestra di riferimento | SPEC, AC9 |
| D14 | `getFinancedTotal` e `getFinancedAverage` restituiscono anche `windows` (§3), così `FinanceCard` mostra le date su cui il server ha contato. `FinanceCard` prende il tipo da `RouterOutputs["analytics"]["getFinancedTotal"]["windows"]` (`src/trpc/shared.ts`), senza un tipo nuovo in `@mito/domain` | SPEC, AC10; T10 e T15 girano insieme e non toccano tutti e due `timeframes.ts` |
| D15 | Le date in ora di Roma: `financeCardFormattingSettings` prende `timeZone: "Europe/Rome"`. Il test sta in `src/app/dashboard/_components/_test/FinanceCard.dates.test.tsx`, aggiunto a `timeZoneTests`, con un istante fra la mezzanotte UTC e quella di Roma | SPEC, AC10; precedente di `romeClock` |
| D16 | Una pratica conta una volta: totale e media si calcolano su `practices` con una `exists` su `customerToPratica` ⋈ `customers`: `customers.operatorId = actor.operatorId` per un `OPERATORE`, `customers.operatorId is not null` per un `ADMIN`. Gli stati che contano sono una costante `FINANCED_STATES = ["Liquidata", "Chiusa", "Estinta anticipata"]` in `financed.ts`, tipata su `stateEnum` | SPEC, AC12–AC14 |
| D17 | `getFinancedByBranch` restituisce `data: string \| null`, senza il cast di oggi; il tipo `Data` di `DonutCard` accetta `null`, che mostra già come "Nessuna" | Il cast nasconde il punto vendita `null` che AC1 fissa; nessun cambio visibile |
| D18 | Il periodo: `TIMEFRAMEOPTIONS = ["30d", "90d", "365d"] as const`, `type TimeFrame` dalle opzioni, `parseTimeFrame(value)` che restituisce `30d` per un valore assente, non valido o una lista. Li usano `page.tsx` e il selettore. Il refuso diventa `DEFAULTTIMEFRAME`, con lo stile delle altre costanti del file | SPEC, AC11, AC18, Technical Notes (`type TimeFrame`) |
| D19 | I test di `FinanceCard`, `CircleCard` e delle sezioni fingono i componenti di `@tremor/react` che usano (`BadgeDelta`, `DeltaBar`, `ProgressCircle`, `DonutChart`, `Legend`) con elementi che espongono le prop (`data-delta-type`, `data-value`, `data-color`), e tengono il resto del modulo vero con `vi.mock("@tremor/react", async (original) => ...)` | Il precedente `ExportCharts.test.tsx` usa lo stesso `vi.mock` parziale, ma rende `BarChart` nullo senza esporre le prop: qui servono anche le prop. Recharts in jsdom non ha un contenitore misurato |
| D20 | I test dei servizi girano con `runServer(program.pipe(Effect.withClock(clock)))` e un `Clock` fisso costruito nel test, come in `apply.db.test.ts`. Quali test vanno sui servizi e quali sulle procedure lo dice D25 | SPEC, AC9; skill `tdd` |
| D21 | T18 scrive nella PR tutto quello che AC24 chiede: §1, §4 e §5 con il passo fatto, TD11 con S1–S9 `[CLOSED <data del merge>]` e la voce dell'utente senza operatore `[PREVISTO]`, TD10 (f) `[CLOSED <data del merge>]`. Dopo il merge, chi lo fa scrive in un commit di documenti solo la data, il numero della PR, e la voce di TD11 da `[PREVISTO]` a `[OPEN]` | Regole del §7 di [[chore/migrazione-effect]]; precedente D16 di [[specs/crm/pratiche-effect/PLAN]] |
| D22 | I worker di una wave lavorano sullo stesso albero. Ognuno lancia solo i test dei suoi file; `tsc`, `next lint` e la suite intera li lancia l'orchestratore a fine wave. I mutanti si applicano solo fra una wave e l'altra, uno alla volta, senza worker attivi | Precedente D20 di [[specs/crm/pratiche-effect/PLAN]] |
| D23 | OQ1 (titoli di AC16) e OQ2 (`—` di AC21) restano ai default della SPEC. Omar li conferma con G0 | SPEC, Open Questions |
| D24 | Le memorie dell'`adversarial-verifier` (`.agents/agent-memory/`), scritte dalle verifiche della SPEC e del PLAN, restano fuori dal branch, che resta nel perimetro di AC25. Vanno nel commit di documenti dopo il merge (D21) | SPEC, AC25 |
| D25 | Le regole del §2 di [[chore/migrazione-effect]] valgono così. Nei round 1 e 2 i test passano dalle procedure: la caratterizzazione deve girare sul codice di oggi, dove i servizi non esistono (precedente D8 di [[specs/crm/pratiche-effect/PLAN]]). Nel round 3 i test nuovi sui dati (finestre in T10, conteggi in T11, contatti in T12) vanno sui servizi, in `services/analytics/_test/`, con `runServer` (regola 3). Sulle procedure restano i test di contratto: chiavi, middleware, forma e tipi della risposta. Restano anche i casi del round 1 che la correzione rompe, aggiornati: in L3 si possono togliere, perché li coprono i test dei servizi | Regola 3 del §2; skill `tdd` |
| D26 | Ogni test sui dati degli importi mette le stesse fixture nel riferimento e nel confronto, con importi diversi, e controlla tutti e due i numeri. Oggi ogni procedura ha due query copiate, con il proprio filtro per ruolo, e un errore in una sola delle due cambierebbe il numero di confronto e il badge. T10 le riduce a una funzione chiamata una volta per finestra | Prova del verificatore del piano; AC12–AC14 ("ogni misura sugli importi") |

## 5. Assunzioni e vincoli

- **G0 prima di ogni task:** Omar porta la SPEC a `status: approved`, o lo conferma lanciando `implement-spec`, che aggiorna il frontmatter come primo passo.
- **Nessuna migrazione:** la PR non tocca `packages/db/` (AC25). Resta il merge di `dev` nel branch prima della PR.
- **Nessun pacchetto nuovo.**
- **Nessun refactor di router nella stessa release di un cutover GCP**, né durante le 2 settimane di osservazione di S6 di [[chore/migrazione-gcp]] (§4 di [[chore/migrazione-effect]]). Il rilascio va in prod con il resto della migrazione.
- **Se `dev` tocca `analytics/`, la dashboard o `timeframes.ts` durante il lavoro**, si fa il merge e si ripetono i test.
- **La prova nel browser** (T19) gira su `mito_local` con `pnpm dev` e `.env.development.local`. Mai con le variabili di prod, mai uno script con `NODE_ENV=production`.

## 6. Findings dal codice

- **Media admin e media operatore.** `getFinaziatoMedioPerCliente` chiamata da un `ADMIN` non filtra, e l'`innerJoin` con `operators` vale il `isNotNull` di `getFinanziatoMedioPerOperatore`: per l'admin sono la stessa query (D9, D10).
- **`todo` di oggi** conta solo `chiamare`: `followup` e `non risponde` non sono né fra i da fare né fuori, ma fra i completati. `nessuno` e lo stato `null` non contano in nessuno dei due (`NULL NOT IN (...)` non è vero).
- **`task.state`** ha default `nessuno` e può essere `null`; `task.isActive` è `boolean` non nullo, default `false`.
- **`createPractice`** collega sempre un cliente come `Intestatario`. Una pratica con tre clienti si costruisce aggiungendo nel test due righe di `customerToPratica` (`Coobbligato`, `Garante`); una pratica senza clienti con un insert diretto in `practices`.
- **`ORDER BY practices.desPuntoVendita`** mette il punto vendita `null` per ultimo (ordine crescente di Postgres).
- **`count()` di Drizzle** è già `number` sui due driver; `sum` e `avg` di un `numeric` sono stringhe su PGlite e su postgres-js. Dal round 3 il servizio li converte, quindi il driver non conta più.
- **`DonutCard`** mostra già `"Nessuna"` per `data` `null` e somma i `total` per il numero grande.
- **Il selettore** ha anche un `console.log("TimeFrameSelector mounted")`: fuori dal passo, resta.
- **`schemas.ts`**: togliere `insertChatToOperatorSchema` lascia usati `chatToOperator` (nei tipi `ChatToOperator`) e `createInsertSchema` (altri schemi).
- **Gli altri file con `analitycs`, fuori da `analytics/`:** `root.ts`, le due sezioni, il selettore, lo store. Nessun test e niente in `apps/`.

## 7. Ricerca esterna

Nessuna. Il passo usa API già in uso nel repo: Effect 3.x (`Clock`, `Effect.withClock`), Drizzle 0.45 (`exists`, `inArray`, `gte`, `lt`), tRPC v10 con `superjson`, `expectTypeOf` di vitest 1.6, Radix Select del selettore. Da controllare in T16 e T19, non da cercare: che un `Date` passi intero dalla sezione server a `FinanceCard` (componente client). React 18.3 lo serializza nelle prop dei componenti client; la prova nel browser lo conferma.

## 8. Grafo delle dipendenze

```
G0 ─┬─ T1 ─┐
    ├─ T2 ─┤
    ├─ T3 ─┼─ T6 ── T7 ── T8 ─┬─ T9 ──┬─ T10 ──┬─ T11 ─────┐
    ├─ T4 ─┤                  │       ├─ T12 ──┼───────────┤
    └─ T5 ─┘                  │       └─ T15 ──┤           │
                              ├─ T13 ──────────┼───────────┤
                              ├─ T14 ──────────┴─ T16 ─────┼─ T18 ── T19
                              └─ T17 ──────────────────────┘
```

- **T6** dipende da tutta la caratterizzazione: il primo commit del refactor arriva dopo che i test sono nel branch e verdi sulla base.
- **T6 → T7 → T8** in fila: T6 e T7 toccano tutti e due `analytics/GET/index.ts` e `analytics/index.ts`.
- **Il round 3** parte da T8, così ogni suo commit viene dopo il refactor.
- **Wave 5** (T9, T13, T14, T17): T9 tocca il router, `root.ts`, `services/analytics/financed.ts`, le due sezioni e i test di `analytics/`; T13 solo `CircleCard`; T14 solo `FinanceCard`; T17 solo `schemas.ts`.
- **Wave 6** (T10, T12, T15), dopo T9:
  - T10 tocca `financed.ts`, il nuovo `windows.ts` e il suo test, e i test `financed`, `byBranch` e `types` delle procedure;
  - T12 tocca `contactProgress.ts`, il suo test di servizio nuovo e quello della procedura;
  - T15 tocca `timeframes.ts`, lo store, il selettore, `page.tsx`, `DataSection` e gli import delle due sezioni.
- **Wave 7** (T11, T16):
  - T11 (dopo T10) tocca `financed.ts`, il test di servizio nuovo `financed.db.test.ts`, i test `financed`, `byBranch` e `types` delle procedure, e il tipo di `DonutCard`;
  - T16 (dopo T10, T14, T15) tocca `FinanceCard` e il suo test di T14, le due sezioni, `timeframes.ts` e `vitest.config.ts`.
- **`procedures.db.test.ts`** lo toccano solo T4 e T9: da T9 controlla solo gli esiti, non i numeri.

## 9. Task

### Round 1: caratterizzazione

#### G0: SPEC approvata
- **depends_on**: []
- **location**: `brain/specs/crm/analytics-effect/SPEC.md`
- **description**: Omar porta la SPEC a `status: approved`, con i default di OQ1 e OQ2 (D23). Lanciare `implement-spec` vale come approvazione: l'orchestratore aggiorna il frontmatter e fa il primo commit del branch con SPEC, PLAN e indici. Nessun task parte prima.
- **validation**: frontmatter `status: approved`; il primo commit di `claude/analytics-effect` contiene solo file di `brain/`.
- **status**: Complete
- **log**: 2026-10-26, lancio di `implement-spec` (approvazione). SPEC `approved`, OQ1 e OQ2 chiuse ai default (D23); indici `Approved, in implementazione`. Il branch è `claude/analytics-effect-spec` (IMPLEMENTATION-NOTES, Deviations). Le memorie di `.agents/` restano fuori dal commit (D24).
- **files edited/created**: `brain/specs/crm/analytics-effect/{SPEC,PLAN,IMPLEMENTATION-NOTES}.md`, `brain/chore/migrazione-effect.md`, `brain/index.md`, `brain/log.md`, `brain/specs/crm/crm-specs.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

#### T1: Caratterizzazione degli importi
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/analytics/_test/financed.db.test.ts`
- **description**: Fissa via `createTestCaller` le risposte di oggi di `getFinanziatoMedioPerOperatore`, `getFinanziatoTotalePerOperatore` e `getFinaziatoMedioPerCliente` (AC1), con `toEqual` sulla risposta intera.
  - **Le date** (D5): `const now = Date.now()` all'inizio del test. Per un `timeFrame` di N giorni, una pratica di riferimento a `now − N/2` giorni, una di confronto a `now − 1,5 N`, una fuori a `now − 2,5 N` e una a `now + 2` giorni. Nessun timer finto, nessun import di `TIMEFRAMEMAP` o `TIMEFRAMEDELTA` (D6).
  - **Gli importi** sono potenze di 2 (1000, 2000, 4000, …), diverse fra riferimento e confronto, così una somma dice esattamente quali pratiche ha contato.
  - **Tutte e due le finestre** (D26): ogni fixture qui sotto c'è due volte, una nel riferimento (`now − N/2`) e una nel confronto (`now − 1,5 N`), con importi diversi, e ogni caso controlla `{ reference, comparison }` insieme.
  - **Per ogni `timeFrame`** (`describe.each` su `30d`, `90d`, `365d`) e con `{}` (vale `30d`):
    - una pratica con tre clienti dello stesso operatore (`Intestatario`, `Coobbligato`, `Garante`) conta tre volte nel totale e pesa tre volte nella media (S2);
    - una pratica con soli clienti senza operatore non conta;
    - le pratiche dei 6 stati contano tutte (S9);
    - le pratiche fuori dalle due finestre non contano.
  - **Chi vede che cosa**, in tutte e due le finestre:
    - `getFinanziatoTotalePerOperatore` e `getFinaziatoMedioPerCliente`: un `OPERATORE` conta solo le pratiche dei suoi clienti; un `ADMIN` conta quelle di tutti i clienti con un operatore;
    - `getFinanziatoMedioPerOperatore`: un `OPERATORE` e un `ADMIN` ricevono gli stessi numeri, quelli di tutto il CRM.
  - **La forma** (S6): `reference` e `comparison` sono le stringhe del driver, lette su `2fd59da` e fissate così come sono (annotate nel log); senza pratiche nella finestra sono lo `0` numerico.
  - Nessun codice di produzione cambia.
- **validation**:
  - test verdi su `2fd59da`, stabili su due giri; il diff contiene solo il file nuovo;
  - mutanti sul codice di `2fd59da`, applicati dall'orchestratore senza commit (D22), ognuno ucciso da un test del file, annotati nel log:
    - `TIMEFRAMEMAP` ↔ `TIMEFRAMEDELTA` in una delle tre procedure;
    - `accessCondition` tolto solo dalla query del confronto di `getFinanziatoTotalePerOperatore`, e poi solo da quella del riferimento;
    - `accessCondition` tolto solo dalla query del confronto di `getFinaziatoMedioPerCliente`;
    - un filtro per operatore aggiunto alla media dell'admin (`getFinanziatoMedioPerOperatore`);
    - `sum` → `avg` in `getFinanziatoTotalePerOperatore`; `avg` → `sum` in ognuna delle due medie;
    - un filtro `eq(practices.state, "Liquidata")` aggiunto solo alla query del confronto;
    - `?? 0` → `?? "0"`;
    - il default di `timeFrameInput` a `"90d"`.
- **status**: Complete
- **log**: Wave 1, worker `sonnet`. 37 test (`describe.each` su `{}`, `30d`, `90d`, `365d`, più il `tdd_target` a sé), verdi due volte. Stringhe del driver fissate: le somme intere (`"5000"`), le medie con la scala di Postgres (`"1250.0000000000000000"`, `"24000.000000000000"`, `"2333.3333333333333333"`), lo `0` numerico senza righe. Mutanti dell'orchestratore, tutti uccisi da asserzioni: MAP↔DELTA in ognuna delle tre (32–33 test rossi), `accessCondition` tolto dal solo confronto e dal solo riferimento del totale e dal confronto della media per cliente (4), filtro per operatore nella media dell'admin (12), `sum`↔`avg` (32–33), `Liquidata` nel solo confronto del totale e della media dell'admin (4), `?? "0"` (12), default `90d` (7).
- **files edited/created**: nuovo `packages/server/src/api/routers/analytics/_test/financed.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "con `30d`, una pratica con Intestatario, Coobbligato e Garante dello stesso operatore somma tre volte il suo importo in `getFinanziatoTotalePerOperatore`" (verde su `2fd59da`; il rosso arriva dai mutanti).
- **review_mode**: cli
- **complexity**: medium

#### T2: Caratterizzazione della ciambella per sede
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/analytics/_test/byBranch.db.test.ts`
- **description**: Fissa via `createTestCaller` la risposta di `getAmountPerSedeInLastMonth` (AC1), con le date di T1 (D5, D6).
  - Per ogni `timeFrame` e con `{}`: pratiche nella finestra a "Roma", con punto vendita `null` e a "Milano", inserite in quest'ordine (non alfabetico, così un `orderBy` tolto si vede), più una a "Milano" fuori finestra. Risposta: una riga per punto vendita, in ordine di nome, `null` per ultimo, `{ data, total }` con `total` numerico.
  - Una pratica senza clienti (insert diretto in `practices`) conta.
  - Una pratica `Rifiutata` nella finestra conta (S9).
  - Un `ADMIN` e un `OPERATORE` ricevono la stessa risposta.
- **validation**:
  - verdi su `2fd59da`; il diff contiene solo il file nuovo;
  - mutanti (D22), uccisi e annotati: `orderBy` tolto; `TIMEFRAMEMAP` → `TIMEFRAMEDELTA`; `Number(r.total)` → `r.total`; un `innerJoin` su `customerToPratica` aggiunto.
- **status**: Complete
- **log**: Wave 1, worker `haiku`. 16 test, verdi due volte. Ritocco dell'orchestratore in review: gli importi dei 6 stati passano da 100…600 a potenze di 2 (100·2^i), come chiede il §11, perché nel round 3 un sottoinsieme sbagliato non dia la stessa somma. Mutanti uccisi: `orderBy` tolto (16), MAP→DELTA (16), `Number(r.total)` tolto (16), `innerJoin` su `customerToPratica` (4).
- **files edited/created**: nuovo `packages/server/src/api/routers/analytics/_test/byBranch.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "con `30d`, la pratica senza clienti nella finestra conta nel totale del suo punto vendita".
- **review_mode**: cli
- **complexity**: low

#### T3: Caratterizzazione di "Chiamate completate"
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/analytics/_test/contactProgress.db.test.ts`
- **description**: Fissa via `createTestCaller` la risposta di `getAllDoneTasksInLastMonth` (AC1, S4), con `toEqual` su `{ done, todo }`.
  - Contatti di due operatori e senza operatore, attivi e non attivi, in ognuno degli stati (`chiamare`, `followup`, `non risponde`, `app.to`, `caricato`, `erogata`, `non interessato`, `richiamare`, `nessuno`, `null`).
  - `done` conta tutti gli stati tranne `chiamare`, `nessuno` e `null`, attivi e non attivi: `followup` e `non risponde` compresi. `todo` conta solo `chiamare`, attivi e non attivi.
  - Un contatto creato due anni fa (`createdAt` esplicito) conta: nessun filtro di data.
  - Un `ADMIN` conta tutti i contatti; un `OPERATORE` solo quelli con il suo `task.operator_id`; un `OPERATORE` senza contatti riceve `{ done: 0, todo: 0 }`.
- **validation**:
  - verdi su `2fd59da`; il diff contiene solo il file nuovo;
  - mutanti (D22), uccisi e annotati: `accessCondition` sempre `undefined`; `"nessuno"` tolto da `notInArray`; un filtro `eq(task.isActive, true)` aggiunto; `todo` con `inArray(task.state, ["chiamare", "followup"])`.
- **status**: Complete
- **log**: Wave 1, worker `haiku`. 10 test, verdi due volte: OPERATORE `{ done: 14, todo: 2 }`, ADMIN `{ done: 42, todo: 6 }` sul fixture completo, più i casi per stato, il contatto di due anni fa e l'operatore senza contatti. Mutanti uccisi: `accessCondition` sempre `undefined` (3), `nessuno` tolto (5), `isActive` aggiunto (6), `todo` con `followup` (5).
- **files edited/created**: nuovo `packages/server/src/api/routers/analytics/_test/contactProgress.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "un contatto non attivo in `app.to` conta in `done`".
- **review_mode**: cli
- **complexity**: low

#### T4: Tabella dei middleware
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/analytics/_test/procedures.db.test.ts`
- **description**: Una tabella tipata sulle chiavi di `appRouter._def.record.analitycs._def.record` meno `REMOVED = ["getPraticheLiquidate", "getAllNewPraticheOfLastMonth", "getAllImportoRatePageteOfLastMonth"]` (D8), con `satisfies Record<Procedure, ProcedureSpec>`: una riga per procedura, con la guardia attesa (`session` o `operator`) e una chiamata con input valido (AC2).
  - **Utente senza operatore** (`createUser`): `BAD_REQUEST` dalle 3 su `operatorProcedure`, risposta dalle 2 su `protectedProcedure`.
  - **Operatore disattivato** (`createOperator({ disabledAt })`): `UNAUTHORIZED` con il messaggio `Utente disattivato` dalle stesse 3, risposta dalle 2.
  - **`OPERATORE` attivo:** risposta da tutte e 5. Da `getFinanziatoMedioPerOperatore` e da `getAmountPerSedeInLastMonth` riceve i numeri di una pratica di un cliente di un altro operatore (S3).
  - I codici e i messaggi si leggono su `2fd59da` e si fissano.
- **validation**:
  - verde su `2fd59da`; il diff contiene solo il file nuovo;
  - `tsc` fallisce se manca una riga per una procedura con chiamanti;
  - mutanti (D22), uccisi e annotati: `getAllDoneTasksInLastMonth` su `protectedProcedure`; `getAmountPerSedeInLastMonth` su `operatorProcedure`.
- **status**: Complete
- **log**: Wave 1, worker `sonnet`. 18 test, verdi due volte. Fissati `BAD_REQUEST` con messaggio `BAD_REQUEST` e `UNAUTHORIZED` `Utente disattivato`; S3 con la media `"1000.0000000000000000"` e `[{ data: "Roma", total: 1000 }]`. `tsc` rosso togliendo una riga dalla tabella (TS1360). Mutanti uccisi: `getAllDoneTasksInLastMonth` su `protectedProcedure` (3), `getAmountPerSedeInLastMonth` su `operatorProcedure` (2).
- **files edited/created**: nuovo `packages/server/src/api/routers/analytics/_test/procedures.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "un utente senza operatore riceve `BAD_REQUEST` da `getAllDoneTasksInLastMonth`".
- **review_mode**: cli
- **complexity**: medium

#### T5: Test di tipo
- **depends_on**: [G0]
- **location**: nuovo `packages/server/src/api/routers/analytics/_test/types.test.ts`
- **description**: Con `expectTypeOf` di vitest e `inferRouterInputs`/`inferRouterOutputs` di `@trpc/server` su `type AppRouter` (import solo di tipo), fissa con `toEqualTypeOf` gli input e gli output delle 5 procedure con chiamanti (AC3). Gli output sugli importi sono `{ reference: string | number; comparison: string | number }` (il `?? 0` si allarga a `number`, §1), quello della ciambella `{ data: string; total: number }[]`, quello dei contatti `{ done: number; todo: number }`; gli input sono `{ timeFrame?: "30d" | "90d" | "365d" }` per le 4 con `timeFrameInput` e nessun input per i contatti. I tipi esatti si confermano con `tsc` su `2fd59da` prima di fissarli.
- **validation**:
  - `pnpm exec tsc --noEmit` verde su `2fd59da`; il file gira anche in vitest (verde);
  - mutante (D22): `?? 0` → `?? null` in una procedura fa fallire `tsc`.
- **status**: Complete
- **log**: Wave 1, worker `haiku`. Tipi confermati con `tsc`: come nel piano, salvo l'input di `getAllDoneTasksInLastMonth`, che è `void | undefined`. `tsc` rosso cambiando un tipo atteso; mutante `?? null` ucciso da `tsc` (TS2344).
- **files edited/created**: nuovo `packages/server/src/api/routers/analytics/_test/types.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "l'output di `getFinanziatoTotalePerOperatore` è `{ reference: string | number; comparison: string | number }`".
- **review_mode**: cli
- **complexity**: low

### Round 2: refactor a comportamento invariato

#### T6: Le 3 procedure senza chiamanti
- **depends_on**: [T1, T2, T3, T4, T5]
- **location**: `packages/server/src/api/routers/analytics/{index.ts,GET/index.ts}`; nuovo `packages/server/src/api/routers/analytics/_test/router.db.test.ts`
- **description**: Toglie `getPraticheLiquidate`, `getAllNewPraticheOfLastMonth` e `getAllImportoRatePageteOfLastMonth`, con gli import che restano senza uso (AC4). Il test sulle chiavi, come `task/_test/router.db.test.ts`: `it.each` sulle 3 ("non espone più la procedura senza chiamanti %s") e sulle 5 che restano ("espone %s").
- **validation**:
  - il test nuovo è rosso prima della rimozione e verde dopo;
  - T1–T5 verdi senza modifiche;
  - `git grep -nE 'getPraticheLiquidate|getAllNewPraticheOfLastMonth|getAllImportoRatePageteOfLastMonth' -- packages src apps ':!**/_test/**'` non trova niente.
- **status**: Complete
- **log**: Wave 2, worker `haiku`. RED scritto dall'orchestratore: `router.db.test.ts` con 3 rossi su 8 ("non espone più la procedura senza chiamanti …"), verde dopo la rimozione. Nessun import tolto: quelli delle 3 procedure restano usati dalle 5 che restano. T1–T5 verdi senza modifiche (6 file, 99 test), `tsc` verde, `git grep` dei 3 nomi fuori da `_test/` vuota.
- **files edited/created**: `packages/server/src/api/routers/analytics/{index.ts,GET/index.ts}`; nuovo `packages/server/src/api/routers/analytics/_test/router.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "il router `analitycs` non espone più `getPraticheLiquidate`".
- **review_mode**: cli
- **complexity**: low

#### T7: Servizi e adapter
- **depends_on**: [T6]
- **location**: nuovi `packages/server/src/services/analytics/{financed.ts,contactProgress.ts}`; `packages/server/src/api/routers/analytics/GET/index.ts`
- **description**: Sposta le query delle 5 procedure in servizi Effect (AC5–AC7), con le firme del §3:
  - `financedTotal({ timeFrame, actor })`, `financedAverage({ timeFrame, actor? })` (D9, D10) e `financedByBranch({ timeFrame })` in `financed.ts`; `contactProgress({ actor })` in `contactProgress.ts`. Ognuno è `Effect.gen` con `query` di `effect/db`, e restituisce esattamente il valore di oggi, comprese le stringhe, lo `0` e il cast della ciambella (D11);
  - `timeFrame: TimeFrame` di `@mito/domain/constants/timeframes`; `actor: Actor` di `@mito/domain/contact/permissions`. Le finestre restano `TIMEFRAMEMAP` e `TIMEFRAMEDELTA` (AC7);
  - nessun `errors.ts`, nessun `server-only`, nessun import da `zod`, `@trpc/*` o `api/`;
  - le procedure restano con lo stesso middleware e lo stesso `timeFrameInput` zod, e diventano `runTrpc(servizio(...))`: `actor: ctx.actor` per le 3 su `operatorProcedure`, nessun `actor` per `getFinanziatoMedioPerOperatore`;
  - `castAsNumber` e gli import di Drizzle e di `@mito/db/schema/*` passano nei servizi.
- **validation**:
  - T1–T6 verdi senza modifiche, `tsc` compreso (T5);
  - le `grep` di AC5 su `packages/server/src/api/routers/analytics` non trovano niente;
  - `git grep -nE 'zod|@trpc|TRPCError|server-only|/api/' -- packages/server/src/services/analytics ':!**/_test/**'` e `git grep -n Clock -- packages/server/src/services/analytics` non trovano niente; `git grep -n TIMEFRAMEMAP -- packages/server/src/services/analytics` trova i servizi (AC6, AC7).
- **status**: Complete
- **log**: Wave 3, worker `sonnet`. Servizi con le firme del §3; le espressioni SQL e le due query per finestra restano quelle di oggi. Il filtro per ruolo di `financedTotal` e `financedAverage` è un helper privato, `customerAccess`. `isNotNull(customers.operatorId)` tolto (D10). Contratto: 6 file, 99 test verdi senza modifiche; `tsc` verde; le `grep` di AC5, AC6 e AC7 vuote, `TIMEFRAMEMAP` nei servizi.
- **files edited/created**: nuovi `packages/server/src/services/analytics/{financed.ts,contactProgress.ts}`; `packages/server/src/api/routers/analytics/GET/index.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: nessun test nuovo: i test di T1–T5 sono il contratto, e T8 ripete i mutanti sui servizi.
- **review_mode**: cli
- **complexity**: medium

#### T8: Controllo del round 2
- **depends_on**: [T7]
- **location**: nessun file (lo esegue l'orchestratore)
- **description**: Verifica AC4–AC8 all'ultimo commit del round 2:
  - `git diff <ultimo commit del round 1>..HEAD -- '**/_test/**'` contiene solo `router.db.test.ts` nuovo: nessuna riga di asserzione cambiata (AC8);
  - le `grep` di T7;
  - `SKIP_ENV_VALIDATION=true pnpm exec next lint`, `pnpm exec tsc --noEmit`, `pnpm run test --run` verdi;
  - i mutanti di T1–T5 ripetuti sui servizi, uno alla volta, tutti uccisi;
  - il conteggio di `server-only` in `packages/server/src` è ancora 38.
- **validation**: i controlli sopra, annotati nel log con gli hash dei commit.
- **status**: Complete
- **log**: Wave 4, orchestratore, sull'ultimo commit del round 2 (`2ddd53a`; il round 1 finisce a `545c6ce`). `git diff 545c6ce..2ddd53a -- '**/_test/**'` aggiunge solo `router.db.test.ts` (26 righe) e non modifica righe (AC8). Le `grep` di AC5, AC6 (anche `ctx`) e AC7 vuote; `TIMEFRAMEMAP` in `financed.ts`. `tsc` verde; `eslint --no-eslintrc -c .eslintrc.cjs src packages` verde (sostituisce `next lint`, IMPLEMENTATION-NOTES); `pnpm run test --run` 266 file verdi, 23 saltati (`pg`). Mutanti di T1–T5 ripetuti sui servizi: 24 su 24 uccisi (il filtro per operatore nella media dell'admin diventa due mutanti di `customerAccess`: un filtro senza `actor`, 32 rossi, e l'ADMIN filtrato sul suo operatore, 8). `server-only` in `packages/server/src`: 38, come a `2fd59da`.
- **files edited/created**: nessuno
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

### Round 3: correzioni

Ogni task parte da un test rosso sul comportamento nuovo, poi aggiorna i test vecchi che tocca. Il nome di ogni test aggiornato dice il comportamento nuovo.

#### T9: Contratto del router e permessi
- **depends_on**: [T8]
- **location**: `packages/server/src/api/routers/analytics/{index.ts,GET/index.ts}`, `packages/server/src/api/root.ts`, `packages/server/src/services/analytics/financed.ts`, `src/app/dashboard/_components/{AdminDataSection,OperatorDataSection}.tsx`, tutti i test di `packages/server/src/api/routers/analytics/_test/`
- **description**: Il router nuovo (AC15, AC19, S3, la parte server di S5 e AC18):
  - `root.ts` monta `analytics: analyticsRouter`; `analytics/index.ts` esporta `analyticsRouter` con esattamente `getFinancedTotal`, `getFinancedAverage`, `getFinancedByBranch`, `getContactProgress`;
  - `getFinancedTotal` ← `getFinanziatoTotalePerOperatore`, `getFinancedAverage` ← le due medie, `getFinancedByBranch` ← `getAmountPerSedeInLastMonth`, `getContactProgress` ← `getAllDoneTasksInLastMonth`. I numeri restano quelli di oggi: le correzioni dei conteggi sono in T10–T12;
  - middleware: `adminProcedure` per `getFinancedByBranch`, `operatorProcedure` per le altre tre; nessuna su `protectedProcedure`;
  - `financedAverage` prende `actor` obbligatorio (D9);
  - le due sezioni chiamano `api.analytics.*`: l'admin `getFinancedAverage`, `getContactProgress`, `getFinancedByBranch`; l'operatore `getFinancedTotal`, `getContactProgress`, `getFinancedAverage`. Titoli e `Number(...)` restano fino a T16;
  - i test di `analytics/_test/` chiamano le chiavi nuove:
    - `router.db.test.ts`: `analitycs` non c'è più fra le chiavi di `appRouter`, e le chiavi di `analytics` sono esattamente le quattro (`toEqual` sulle chiavi ordinate);
    - `procedures.db.test.ts`: tabella sulle chiavi esatte, senza `REMOVED` (D8). `getFinancedByBranch`: `FORBIDDEN` `admin-only` a un `OPERATORE`, `BAD_REQUEST` a chi non ha operatore, `UNAUTHORIZED` `Utente disattivato` a un disattivato, risposta a un `ADMIN`. Le altre tre: `BAD_REQUEST` e `UNAUTHORIZED` come oggi, risposta a un `OPERATORE`. La tabella controlla solo l'esito (risposta o errore, con codice e messaggio), non i numeri: il caso S3 del round 1 esce dalla tabella, e chi vede che cosa resta in `financed.db.test.ts` e in `byBranch.db.test.ts`, così T10 e T11 non toccano questo file;
    - `financed.db.test.ts`: il caso "`getFinanziatoMedioPerOperatore` non filtra per ruolo" diventa "un `OPERATORE` vede da `getFinancedAverage` solo le pratiche dei suoi clienti", nelle due finestre; il caso dell'admin resta con gli stessi numeri;
    - `types.test.ts`: le chiavi nuove, con gli stessi tipi di output.
- **validation**:
  - i test nuovi di `router.db.test.ts` e di `procedures.db.test.ts` sono rossi prima del cambio e verdi dopo;
  - i numeri dell'admin in `financed.db.test.ts`, `byBranch.db.test.ts` e `contactProgress.db.test.ts` non cambiano;
  - `git grep -ni analitycs -- packages/server src/app ':!**/_test/**'` non trova niente;
  - `pnpm exec tsc --noEmit` verde a fine wave (D22).
- **status**: Complete
- **log**: Wave 5, worker sul modello dell'orchestratore (`high`). RED dell'orchestratore: `router.db.test.ts` (chiave `analytics`, le 4 chiavi esatte, i nomi vecchi assenti) e `procedures.db.test.ts` (tabella sulle chiavi esatte; in più dei casi del piano, un ADMIN senza riga operatore, il caso di TD11, e un ADMIN disattivato), rossi con `TypeError … reading '_def'`; verdi dopo, senza modifiche. Test aggiornati dal worker: `financed` (`readAll` → `{ totale, media }`; "un OPERATORE vede solo le pratiche dei suoi clienti, anche nella media di `getFinancedAverage`" con i numeri della vecchia media per cliente; l'ADMIN con gli stessi numeri), `byBranch` (il 4° caso diventa "un ADMIN riceve anche le pratiche dei clienti di un altro operatore"), `contactProgress` e `types` sulle chiavi nuove. 6 file, 106 test verdi; `tsc` e `eslint` verdi; `git grep -ni analitycs` fuori dai test vuota in `packages/server` e `src/app`; nessun `protectedProcedure` nel router.
- **files edited/created**: `packages/server/src/api/{root.ts,routers/analytics/index.ts,routers/analytics/GET/index.ts}`, `packages/server/src/services/analytics/financed.ts`, `src/app/dashboard/_components/{AdminDataSection,OperatorDataSection}.tsx`, tutti i test di `packages/server/src/api/routers/analytics/_test/`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "un `OPERATORE` riceve `FORBIDDEN` con il messaggio `admin-only` da `analytics.getFinancedByBranch`".
- **review_mode**: cli
- **complexity**: high

#### T10: Finestre dal `Clock` e importi numerici
- **depends_on**: [T9]
- **location**: nuovo `packages/server/src/services/analytics/windows.ts`; `packages/server/src/services/analytics/financed.ts`; nuovo `packages/server/src/services/analytics/_test/windows.db.test.ts`; `packages/server/src/api/routers/analytics/_test/{financed,byBranch}.db.test.ts` e `types.test.ts`
- **description**: AC9 e la parte server di AC20 (S1, S6):
  - `financeWindows(timeFrame)` legge `Clock.currentTimeMillis` e restituisce `{ reference, comparison }` di D13; `financedTotal`, `financedAverage` e `financedByBranch` lo usano al posto di `TIMEFRAMEMAP` e `TIMEFRAMEDELTA`, con `gte`/`lte` per il riferimento e `gte`/`lt` per il confronto. Il riferimento e il confronto si contano con una sola funzione, chiamata una volta per finestra, al posto delle due query copiate (D26);
  - `financedTotal` e `financedAverage` restituiscono `{ reference: number; comparison: number; windows }` (D14): `Number(...)` del valore del driver, `0` senza righe;
  - test nuovi sui servizi (D20), con un `Clock` fisso a un istante `T`:
    - una pratica a `T − 29,5` giorni conta nel riferimento di `30d` con il `Clock` a `T`, e nel confronto con il `Clock` a `T + 1` giorno, nello stesso processo;
    - una pratica a esattamente `T` conta nel riferimento; una a esattamente `T − 30 × 86 400 000` ms conta solo nel riferimento; una a `T − 60 × 86 400 000` ms conta nel confronto; una a `T − 60 × 86 400 000 − 1` ms e una a `T + 1` ms in nessuna;
    - `windows` è esattamente `{ reference: { start: T − N giorni, end: T }, comparison: { start: T − 2N giorni, end: T − N giorni } }` per i tre `timeFrame`;
    - la ciambella conta con la finestra di riferimento;
  - i test del round 1 su importi e forma passano ai numeri: `reference` e `comparison` numerici, `0` senza righe, e `windows` presente; `types.test.ts` fissa i tipi nuovi.
- **validation**:
  - `windows.db.test.ts` rosso prima del cambio e verde dopo;
  - mutanti (D22), uccisi da `windows.db.test.ts`: `lte(now)` → `lt(now)`; `lt` → `lte` sulla fine del confronto; `gte` → `gt` sull'inizio del confronto;
  - `git grep -nE 'TIMEFRAMEMAP|TIMEFRAMEDELTA' -- packages/server` non trova niente;
  - `pnpm exec tsc --noEmit` verde a fine wave (D22): le sezioni convertono ancora con `Number(...)`, che accetta un `number`.
- **status**: Complete
- **log**: Wave 6, worker `sonnet`. RED dell'orchestratore: `windows.db.test.ts`, 9 rossi su 9 (con le finestre di oggi la pratica a `T − 29,5` giorni non conta; `windows` assente). `financeWindows` legge `Clock.currentTimeMillis` a ogni chiamata; una sola funzione privata, `financedIn(aggregate, actor, period)`, conta una finestra ed è chiamata una volta per finestra al posto delle due query copiate (D26); riferimento `gte`/`lte`, confronto `gte`/`lt`. Importi `Number(...)`, `0` senza righe, e `windows` nella risposta. Test aggiornati: `financed.db.test.ts` (numeri; le medie periodiche `7000 / 3` e `112000 / 3` passano con `toEqual`; un caso nuovo per `timeFrame` su `windows`), `types.test.ts` (`tsc` conferma `Date` nelle finestre, con `superjson`). 9 verdi; mutanti uccisi da `windows.db.test.ts`: `lte(now)` → `lt` (4 rossi), `lt` → `lte` sulla fine del confronto (3), `gte` → `gt` sull'inizio del confronto (3). `git grep TIMEFRAMEMAP|TIMEFRAMEDELTA -- packages/server` vuota.
- **files edited/created**: nuovo `packages/server/src/services/analytics/windows.ts`; `packages/server/src/services/analytics/financed.ts`; nuovo `packages/server/src/services/analytics/_test/windows.db.test.ts`; `packages/server/src/api/routers/analytics/_test/{financed.db.test.ts,types.test.ts}` (`byBranch.db.test.ts` resta verde senza modifiche)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "con il `Clock` a `T` e poi a `T + 1` giorno, `financedTotal` di `30d` conta la stessa pratica prima nel riferimento e poi nel confronto".
- **review_mode**: cli
- **complexity**: medium

#### T11: Quali pratiche contano
- **depends_on**: [T10]
- **location**: `packages/server/src/services/analytics/financed.ts`; nuovo `packages/server/src/services/analytics/_test/financed.db.test.ts`; `packages/server/src/api/routers/analytics/_test/{financed,byBranch}.db.test.ts` e `types.test.ts`; `src/app/dashboard/_components/DonutCard.tsx` (solo il tipo `Data`)
- **description**: AC12, AC13, AC14 (S2, S9), con D16 e D17:
  - totale e media su `practices`, con una `exists` sui clienti: un `OPERATORE` le pratiche con almeno un cliente suo, un `ADMIN` quelle con almeno un cliente con un operatore;
  - totale, media e ciambella contano solo `FINANCED_STATES`;
  - la ciambella senza `selectDistinct`, `count()` e cast: `{ data: string | null; total: number }[]`, sempre senza condizioni sui clienti; `DonutCard` accetta `data: string | null`;
  - test nuovi sui servizi (D25), in `services/analytics/_test/financed.db.test.ts`, con un `Clock` fisso. Ogni fixture c'è nel riferimento e nel confronto, con importi diversi, e ogni caso controlla `reference` e `comparison` (D26):
    - una pratica con tre clienti dello stesso operatore conta una volta nel totale e vale una pratica nella media;
    - una pratica con un cliente dell'operatore A e uno dell'operatore B conta una volta per A, una per B e una per l'admin;
    - una pratica per ognuno dei 6 stati: per il totale, la media e la ciambella, `Liquidata`, `Chiusa` ed `Estinta anticipata` contano, e `Rifiutata`, `Rinunciata`, `Stornata` non cambiano il risultato;
    - una pratica con soli clienti senza operatore resta fuori per l'admin e per l'operatore;
    - la pratica senza clienti conta ancora nella ciambella;
  - i test del round 1 sulle procedure che la correzione rompe si aggiornano: "una pratica con tre clienti conta tre volte" diventa "conta una volta", e il caso "tutti gli stati contano" diventa "contano solo le finanziate";
  - `types.test.ts`: l'output della ciambella con `data: string | null`.
- **validation**:
  - il test "conta una volta" dei servizi è rosso prima del cambio e verde dopo; gli altri test di `analytics/` verdi; `tsc` verde a fine wave (D22);
  - mutanti (D22), ognuno ucciso da un test di servizio: la `exists` sostituita dai join di oggi; il filtro per operatore tolto per un `OPERATORE`; `is not null` tolto per un `ADMIN`; `Stornata` aggiunta a `FINANCED_STATES`; il filtro degli stati tolto dalla ciambella. Se T10 ha lasciato due query separate, ognuno di questi si applica anche a una sola delle due.
- **status**: Complete
- **log**: Wave 7, worker sul modello dell'orchestratore (`high`). RED dell'orchestratore: il test di servizio `financed.db.test.ts`, 4 rossi su 6 (tre clienti contati tre volte, la pratica di due operatori contata due volte per l'admin, i 6 stati nel totale e nella ciambella, `63000` invece di `13000`); i due casi già verdi (soli clienti senza operatore fuori, la ciambella con le pratiche senza clienti) restano come guardia. Il fixed `Clock` dei test di servizio passa in `_test/clock.ts`, usato anche da `windows.db.test.ts` (nessuna asserzione cambiata). Difetto del test dell'orchestratore trovato dal worker: `expect.closeTo` è `any` per `no-unsafe-assignment`; sostituito da `13000 / 3` esatto, che `toEqual` accetta. `financedIn` aggrega su `practices` senza join, con `FINANCED_STATES` e una `exists` correlata su `customerToPratica` ⋈ `customers` (`operatorId` del chiamante, o `is not null` per l'admin); la ciambella senza `selectDistinct`, `count()` e cast, `{ data: string | null; total: number }[]`. Test della procedura aggiornati ("conta una volta", "contano solo le pratiche finanziate"; `byBranch` Napoli 1300; il tipo della ciambella). 131 test verdi; mutanti uccisi dai test di servizio: la `exists` sostituita dai join di oggi (2 rossi), il filtro dell'operatore tolto (1), `is not null` tolto per l'admin (1), `Stornata` fra le finanziate (2), il filtro degli stati tolto dalla ciambella (1).
- **files edited/created**: `packages/server/src/services/analytics/financed.ts`; nuovi `packages/server/src/services/analytics/_test/{financed.db.test.ts,clock.ts}`; `packages/server/src/services/analytics/_test/windows.db.test.ts` (solo l'import del `Clock` fisso); `packages/server/src/api/routers/analytics/_test/{financed,byBranch}.db.test.ts`, `types.test.ts`; `src/app/dashboard/_components/DonutCard.tsx` (solo il tipo `Data`)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "una pratica con Intestatario, Coobbligato e Garante dello stesso operatore somma il suo importo una volta in `getFinancedTotal`".
- **review_mode**: cli
- **complexity**: high

#### T12: "Contatti con esito" sulla coda attuale
- **depends_on**: [T9]
- **location**: `packages/server/src/services/analytics/contactProgress.ts`; nuovo `packages/server/src/services/analytics/_test/contactProgress.db.test.ts`; `packages/server/src/api/routers/analytics/_test/contactProgress.db.test.ts`
- **description**: AC17 (S4): solo i contatti con `isActive`; `done` = stato in `outcomeStates`, `todo` = stato in `callStates`; `nessuno` e `null` in nessuno dei due; un `ADMIN` conta tutti i contatti attivi, un `OPERATORE` quelli con il suo `task.operator_id`; nessun input.
  - I test nuovi stanno sul servizio (D25): ogni stato attivo e non attivo, i due ruoli, il contatto di due anni fa attivo che conta ancora.
  - I casi del round 1 sulla procedura si aggiornano: i non attivi non contano, `followup` e `non risponde` passano fra i da fare.
- **validation**: il test di servizio "un contatto non attivo con un esito non conta" è rosso prima del cambio e verde dopo; gli altri casi di AC17 verdi.
- **status**: Complete
- **log**: Wave 6, worker `haiku`. RED dell'orchestratore: il test di servizio `contactProgress.db.test.ts`, 5 rossi su 6 (un contatto non attivo in `app.to` contava; l'ADMIN `{ done: 42, todo: 6 }` invece di `{ done: 15, todo: 9 }`); il caso del contatto di due anni fa era già verde, come guardia. Solo i contatti attivi, `done` su `outcomeStates`, `todo` su `callStates`. Test della procedura aggiornati, con i nomi del comportamento nuovo (`{ done: 5, todo: 3 }` per operatore). 16 verdi.
- **files edited/created**: `packages/server/src/services/analytics/contactProgress.ts`; nuovo `packages/server/src/services/analytics/_test/contactProgress.db.test.ts`; `packages/server/src/api/routers/analytics/_test/contactProgress.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "un contatto non attivo in `app.to` non conta in `done` di `getContactProgress`".
- **review_mode**: cli
- **complexity**: low

#### T13: Colore di `CircleCard`
- **depends_on**: [T8]
- **location**: `src/app/dashboard/_components/CircleCard.tsx`; nuovo `src/app/dashboard/_components/_test/CircleCard.test.tsx`
- **description**: AC22 (S7): il colore dipende dalla percentuale arrotondata che la card mostra: verde oltre 75, blu oltre 50, giallo oltre 25, rosso altrimenti. `ProgressCircle` finto (D19) espone `color`. Casi, come `done`/`todo`: 0/0 → `0%` rosso; 25/75 → `25%` rosso; 26/74 → giallo; 51/49 → blu; 76/24 → verde; 754/246 (75,4%, mostrato `75%`) → blu; 756/244 (75,6%, mostrato `76%`) → verde.
- **validation**: il test è rosso su `CircleCard` di oggi e verde dopo.
- **status**: Complete
- **log**: Wave 5, worker `haiku`. RED dell'orchestratore: 7 rossi su 8 (`{ color: 'green', shown: '26%' }` invece di giallo; 75,4% mostrato 75% rosso invece di blu). Il colore deriva dalla percentuale arrotondata, con tre `if`. 8 verdi.
- **files edited/created**: `src/app/dashboard/_components/CircleCard.tsx`; nuovo `src/app/dashboard/_components/_test/CircleCard.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "con 26 completati su 100, `CircleCard` è gialla".
- **review_mode**: cli
- **complexity**: low

#### T14: Badge di `FinanceCard` con un confronto a 0
- **depends_on**: [T8]
- **location**: `src/app/dashboard/_components/FinanceCard.tsx`; nuovo `src/app/dashboard/_components/_test/FinanceCard.test.tsx`
- **description**: AC21 (S7). `BadgeDelta` e `DeltaBar` finti (D19) espongono `deltaType` e `value`. Casi:
  - riferimento 150 000, confronto 0: badge `—`, `unchanged`, barra 0;
  - riferimento 0, confronto 0: badge `0%`, `unchanged`, barra 0;
  - riferimento 150, confronto 100: `50%`, `increase`, barra 50; riferimento 50, confronto 100: `-50%`, `decrease`, barra −50 (il comportamento di oggi, che resta).
  Le prop delle date restano quelle di oggi: le cambia T16.
- **validation**: il caso 150 000 / 0 è rosso su `FinanceCard` di oggi; gli altri sono già verdi e restano come guardia (con 0 / 0, `delta` è già 0); tutti verdi dopo.
- **status**: Complete
- **log**: Wave 5, worker `haiku`. RED dell'orchestratore: 1 rosso su 4 (`15000000%` invece di `—`); i casi 0/0, 150/100 e 50/100 verdi già prima, come guardia. Con un confronto a 0 la variazione vale 0 (`unchanged`, barra a 0) e il badge mostra `—`, o `0%` con tutti e due a 0. 4 verdi.
- **files edited/created**: `src/app/dashboard/_components/FinanceCard.tsx`; nuovo `src/app/dashboard/_components/_test/FinanceCard.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "con un riferimento di 150 000 e un confronto a 0, il badge mostra `—` con l'indicatore `unchanged`".
- **review_mode**: cli
- **complexity**: low

#### T15: Periodo non valido e refusi della UI
- **depends_on**: [T9]
- **location**: `packages/domain/src/constants/timeframes.ts`; `src/store/useAnalitycsStore.ts` → `src/store/useAnalyticsStore.ts`; `src/components/custom/date-picker/index.tsx`; `src/app/dashboard/page.tsx`; `src/app/dashboard/_components/{DataSection,AdminDataSection,OperatorDataSection}.tsx` (solo gli import); nuovi `src/app/dashboard/_test/page.test.tsx`, `src/components/custom/date-picker/_test/TimeFrameSelector.test.tsx`, `packages/domain/src/constants/_test/timeframes.test.ts`
- **description**: AC11 (S8) e la parte UI di AC18 (S5), con D18:
  - `timeframes.ts`: `DEFAULTTIMEFRAME`, `TIMEFRAMEOPTIONS` come tupla `as const`, `type TimeFrame` dalle opzioni, `parseTimeFrame(value: string | string[] | null | undefined): TimeFrame`. `TIMEFRAMEMAP` e `TIMEFRAMEDELTA` restano finché T16 non li toglie;
  - lo store si chiama `useAnalyticsStore` (file e interfaccia `AnalyticsStore`), con `git mv`;
  - `page.tsx` passa `parseTimeFrame(props.searchParams?.tf)` a `DataSection`, senza `as TimeFrame`; il selettore usa `defaultValue={parseTimeFrame(searchParams.get("tf"))}`;
  - test:
    - `parseTimeFrame`: `"90d"` → `"90d"`; `undefined`, `"7d"`, `["90d"]` → `"30d"`;
    - la pagina, con `DataSection`, il selettore e le altre sezioni finti: `tf` assente o `"7d"` → `DataSection` riceve `"30d"`; `"365d"` → `"365d"`;
    - il selettore, con `next/navigation` finto: con `?tf=7d` il valore mostrato è `30d`, con `?tf=90d` è `90d`.
- **validation**:
  - i test della pagina e del selettore sono rossi su `dev` e verdi dopo;
  - `git grep -niE 'analitycs|defualttimeframe' -- packages src apps ':!**/_test/**'` non trova niente;
  - `tsc` verde a fine wave (D22).
- **status**: Complete
- **log**: Wave 6, worker `sonnet`. RED dell'orchestratore: `timeframes.test.ts` (8 rossi, `parseTimeFrame is not a function`), `page.test.tsx` (`'7d'`, `''` con `{}` e `'90d365d'` con `tf` ripetuto invece di `30d`), `TimeFrameSelector.test.tsx` (`''` con `?tf=7d`). Due difetti dei test dell'orchestratore, corretti in review: in `page.test.tsx` due render nello stesso test (diviso in due), e i file formattati da `prettier` fuori dal repo, con i punti e virgola (riformattati). `parseTimeFrame` con `TIMEFRAMEOPTIONS.find`, senza cast; lo store rinominato con `git mv`. 15 verdi; `git grep -niE 'analitycs|defualttimeframe|finaziato'` fuori dai test vuota.
- **files edited/created**: `packages/domain/src/constants/timeframes.ts`; `src/store/useAnalitycsStore.ts` → `src/store/useAnalyticsStore.ts`; `src/components/custom/date-picker/index.tsx`; `src/app/dashboard/page.tsx`; `src/app/dashboard/_components/{DataSection,AdminDataSection,OperatorDataSection}.tsx` (solo gli import); nuovi `src/app/dashboard/_test/page.test.tsx`, `src/components/custom/date-picker/_test/TimeFrameSelector.test.tsx`, `packages/domain/src/constants/_test/timeframes.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "con `?tf=7d`, la pagina della dashboard passa `30d` a `DataSection`".
- **review_mode**: cli (la prova nel browser del periodo è in T19)
- **complexity**: medium

#### T16: Date delle finestre, titoli, importi senza conversione
- **depends_on**: [T10, T14, T15]
- **location**: `src/app/dashboard/_components/{FinanceCard,AdminDataSection,OperatorDataSection}.tsx`; `packages/domain/src/constants/timeframes.ts`; `vitest.config.ts` (solo `timeZoneTests`); `src/app/dashboard/_components/_test/FinanceCard.test.tsx` di T14 (le prop passano da `comparisonTimeFrame` a `windows`, le asserzioni restano); nuovi `src/app/dashboard/_components/_test/FinanceCard.dates.test.tsx`, `src/app/dashboard/_components/_test/DataSection.test.tsx`
- **description**: AC10 (S1), AC16 (S5), la parte UI di AC20 (S6):
  - `FinanceCard` prende `windows` (D14) al posto di `comparisonTimeFrame`, e mostra `windows.comparison.start`, `windows.reference.start`, `windows.reference.end`;
  - `financeCardFormattingSettings` prende `timeZone: "Europe/Rome"` (D15); `TIMEFRAMEMAP` e `TIMEFRAMEDELTA` si tolgono da `timeframes.ts`;
  - le sezioni passano `reference`, `comparison` e `windows` senza `Number(...)`, con i titoli di AC16: admin "Finanziato medio per pratica", "Contatti con esito", poi la ciambella; operatore "Finanziato totale", "Contatti con esito", "Finanziato medio per pratica";
  - `FinanceCard.dates.test.tsx` va in `timeZoneTests`: con `windows.reference.end` = `2026-10-25T23:30:00Z` mostra `26/10/2026`, nei progetti `utc` e `rome`, e le tre date sono nell'ordine di AC10;
  - `DataSection.test.tsx`, con `@/trpc/server` finto (come `CallsSection.test.tsx`) e `@tremor/react` finto (D19): i titoli nell'ordine di AC16 per le due sezioni, e le date delle `windows` della risposta (istanti a mezzogiorno UTC, uguali nei due fusi) nella card.
- **validation**:
  - `FinanceCard.dates.test.tsx` è rosso nel progetto `utc` prima del cambio; `DataSection.test.tsx` è rosso sui titoli prima del cambio; tutti verdi dopo;
  - `git grep -nE 'TIMEFRAMEMAP|TIMEFRAMEDELTA' -- packages src apps` non trova niente (AC10);
  - `git grep -n 'Number(' -- src/app/dashboard/_components/AdminDataSection.tsx src/app/dashboard/_components/OperatorDataSection.tsx` non trova niente (AC20);
  - il diff di `vitest.config.ts` aggiunge solo una riga a `timeZoneTests`.
- **status**: Complete
- **log**: Wave 7, worker `sonnet`. RED dell'orchestratore: `FinanceCard.dates.test.tsx` (in `timeZoneTests`, riga aggiunta dall'orchestratore con il RED) e `DataSection.test.tsx`. Con le date del piano (`2026-10-25T23:30:00Z`) i test erano verdi già prima: oggi è il 26/10/2026 e le finestre calcolate al caricamento del modulo davano le stesse date. L'orchestratore li ha spostati su istanti lontani da oggi (`2026-01-14T23:30:00Z` → `15/01/2026`; mezzogiorno UTC di gennaio–marzo per le sezioni): rossi in `utc` e in `rome` (`'26/10/2026'` invece di `'15/01/2026'`) e sulle sezioni (titoli vecchi, date non della risposta). `FinanceCard` prende `windows` (`RouterOutputs`), le date in ora di Roma; `TIMEFRAMEMAP` e `TIMEFRAMEDELTA` tolti; titoli di AC16; nessun `Number(...)` nelle sezioni. Verdi: date in `utc` e `rome`, 8 test di componente, `src/app/dashboard` 743 test. `git grep TIMEFRAMEMAP|TIMEFRAMEDELTA -- packages src apps` e `git grep 'Number('` nelle sezioni vuote; `vitest.config.ts` aggiunge una riga.
- **files edited/created**: `src/app/dashboard/_components/{FinanceCard,AdminDataSection,OperatorDataSection}.tsx`; `packages/domain/src/constants/timeframes.ts`; `vitest.config.ts` (solo `timeZoneTests`); `src/app/dashboard/_components/_test/FinanceCard.test.tsx` (solo la prop `windows`); nuovi `src/app/dashboard/_components/_test/{FinanceCard.dates.test.tsx,DataSection.test.tsx}`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "in UTC, `FinanceCard` con una finestra che finisce a `2026-10-25T23:30:00Z` mostra `26/10/2026` come fine del riferimento".
- **review_mode**: cli (la prova nel browser delle card è in T19)
- **complexity**: medium

#### T17: `insertChatToOperatorSchema`
- **depends_on**: [T8]
- **location**: `packages/domain/src/schemas.ts`
- **description**: AC23, TD10 (f): toglie la riga di `insertChatToOperatorSchema`. `chatToOperator` e `createInsertSchema` restano usati.
- **validation**: `git grep -n insertChatToOperatorSchema -- packages src apps` non trova niente; `tsc` verde a fine wave (D22).
- **status**: Complete
- **log**: Wave 5, worker `haiku`. Tolta la riga; `chatToOperator` e `createInsertSchema` restano usati. `git grep -n insertChatToOperatorSchema -- packages src apps` vuota; `tsc` verde a fine wave.
- **files edited/created**: `packages/domain/src/schemas.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a (rimozione senza chiamanti: la prova è la `grep`).
- **review_mode**: cli
- **complexity**: low

### Chiusura

#### T18: Documenti della migrazione
- **depends_on**: [T11, T12, T13, T16, T17]
- **location**: `brain/chore/migrazione-effect.md`
- **description**: AC24, con D21:
  - **§1:** `analytics` fuori da "Manca per" nella riga L1, e fra i router fatti nella riga L2, con il link al piano;
  - **§4 e §5:** la riga 6 del §4 dice che il passo è fatto con questa PR, e `analytics` è ☑☑ nel §5, con i servizi `windows`, `financed`, `contactProgress` e le 4 procedure. Il numero della PR e la data li aggiunge chi fa il merge (D21);
  - **§4, riga del passo 0:** il conteggio di `server-only` allineato a TD6 (38 a `2fd59da`; oggi la riga dice ancora 30);
  - **TD11, nuovo nel §7:** S1–S9, ognuna con la correzione e il task che la fa (S1 → AC9, AC10: T10, T16; S2 → AC12, AC13: T11; S3 → AC19: T9; S4 → AC17: T12; S5 → AC15, AC16, AC18: T9, T15, T16; S6 → AC20: T10, T16; S7 → AC21, AC22: T14, T13; S8 → AC11: T15; S9 → AC14: T11), come `[CLOSED <data del merge>]`;
  - **TD11, voce `[PREVISTO]`:** un utente senza riga operatore riceve `BAD_REQUEST` da tutte le procedure della sezione, come oggi da `getAllDoneTasksInLastMonth`; rimanda al FOLLOW-UP sull'admin senza riga operatore di [[tech-debt/crm/export-chiamate]];
  - **TD10 (f)** `[CLOSED <data del merge>]`; **TD6** "38 a `2fd59da`, più quelli che il passo aggiunge, meno quelli che toglie": il passo non ne aggiunge né ne toglie.
  Non tocca le righe dei passi 1 e 3, fuori dal passo.
- **validation**: le voci sopra ci sono; i link `[[...]]` puntano a pagine esistenti.
- **status**: Complete
- **log**: Wave 8, worker `haiku`, con il testo esatto di ogni modifica nel brief. §1 (L1 e L2), §4 (riga 6 ✓, conteggio di `server-only` del passo 0), §5 (☑☑), TD6, TD10 (f) `[CLOSED <data del merge>]` e TD11 nuovo (S1–S9 `[CLOSED <data del merge>]`, (u) `[PREVISTO]`). Il conteggio di `server-only` della riga del passo 0 e di TD6 diceva 30: a `2fd59da` sono 38, perché l'import nuovo l'ha messo negli 8 file nuovi di `services/import/` (34 a `bc7aa2e`, meno i 4 tolti dai passi 2 e 5, più 8); il passo 6 non ne aggiunge né ne toglie (38 anche a `309b46f`). Link `[[...]]` verso pagine esistenti; le righe dei passi 1 e 3 intatte.
- **files edited/created**: `brain/chore/migrazione-effect.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

#### T19: Gate, prova nel browser, review e PR
- **depends_on**: [T18]
- **location**: nessun file di codice; `brain/specs/crm/analytics-effect/{IMPLEMENTATION-NOTES,RUBRIC,REPORT}.md`
- **description**:
  1. **Controlli di AC:** le `grep` di AC5, AC6 (con `':!**/_test/**'`), AC10, AC18 e AC23; `git diff --name-only origin/dev...HEAD` dentro il perimetro di AC25, nessun file di `packages/db/` né di `.agents/` (D24); i tre round in commit separati e nell'ordine (`git log --oneline`); `server-only` ancora 38.
  2. **Gate di CI (AC26):** `SKIP_ENV_VALIDATION=true pnpm exec next lint`, `pnpm exec tsc --noEmit`, `pnpm db:check`, `pnpm run test --run` (con i progetti `utc` e `rome`), `pnpm build` con i placeholder del gate Build, `pnpm api:build`, `pnpm api:smoke`.
  3. **Prova nel browser** (`agent-browser`, `mito_local`): come admin e come operatore, la dashboard si carica senza errori in console; le tre card hanno i titoli di AC16; le date di `FinanceCard` sono gli estremi delle finestre; con `?tf=7d` la pagina mostra `30d` e i numeri di `30d`; il cambio a `90d` aggiorna numeri e date. Annota nel log che i `Date` arrivano integri a `FinanceCard` (§7).
  4. **`adversarial-review`** (`review.mode: total`) sulla PR, con un passaggio dedicato ai permessi (AC19). I BLOCKER si chiudono prima della PR.
  5. **PR verso `dev`**, dopo il merge di `dev` nel branch, con Leonardo come revisore obbligatorio. Nella descrizione: i tre round, le correzioni con le loro AC, il cambio dei permessi.
- **validation**: tutti i controlli verdi e annotati; REPORT SHIP; PR aperta con Leonardo fra i revisori.
- **status**: Done in locale (punti 1–4); la PR (punto 5) da aprire con l'ok di Omar
- **log**:
  1. Controlli di AC a `0c3d384`: le `grep` di AC5, AC6, AC10, AC18, AC23 e di `protectedProcedure` nel router vuote; 48 file nel perimetro di AC25, nessuno di `packages/db/` né di `.agents/`; i tre round nell'ordine (v4 li ha rifatti commit per commit); `server-only` 38.
  2. Gate a `0c3d384`: `tsc --noEmit`, `eslint --no-eslintrc -c .eslintrc.cjs src packages` (al posto di `next lint`, che nel worktree non parte: IMPLEMENTATION-NOTES), `pnpm db:check`, `pnpm run test --run` (279 file verdi, 23 saltati: il progetto `pg`), `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke`: verdi.
  3. Prova nel browser, dopo il giro 2 (all'inizio l'orchestratore l'aveva data per bloccata: aveva cercato il Postgres locale sulla porta sbagliata, IMPLEMENTATION-NOTES). Su `mito_local` (migrazioni allineate con `pnpm db:local:migrate`), `next dev` di un worktree pulito a `f2f82a1` con le sole variabili locali, senza il backend; sessioni di prova in `session` per l'ADMIN `seed-user-01` e l'OPERATORE `seed-user-04`, con il browser del pannello. Verde: come admin e come operatore nessun errore in console, i titoli di AC16 nell'ordine, i numeri uguali a un calcolo SQL diretto, le date di `FinanceCard` uguali agli estremi delle finestre in ora di Roma (i `Date` arrivano integri alla card: `toLocaleDateString` li formatta), `?tf=7d` mostra `30d` e i numeri di `30d`, il cambio a `90d` aggiorna numeri e date. Un difetto: dopo una scelta il router di Next dava il fuoco a `main`, corretto in `a44ed77` (`router.push` con `scroll: false`) e riprovato. Gli altri punti della checklist (13–23) e le misure della UI sono nel REPORT. Su richiesta di Omar, i problemi della UI trovati sono corretti: `2f583e6` (la navigazione scartata) e `1f13227` (griglia delle card, ciambella con le prime 5 sedi e "Altre", contrasto, nomi, barra e badge della variazione), riprovati nel browser; resta il layout sotto i 768 px, di tutta l'app (tech debt).
  4. `adversarial-review`, con un passaggio sui permessi (v1). Giro 1 su `54da3e2` (oggi `0d7c2f9`): DO NOT SHIP, un MAJOR su AC11, corretto in `9f8da93`, e le guardie dei MINOR in `7cd07b9`. Giro 2: v3 DO NOT SHIP su `29ae6cb` (la chiave della correzione mandava il fuoco sul `body`), corretto in `ab8b2c3` da un test rosso, con le guardie di `1cbcfe3` e `0c3d384`; v3 SHIP su `1cbcfe3`, v4 SHIP sulla storia riscritta. Nessun BLOCKER. La navigazione scartata che lascia la scelta nel selettore, FOLLOW-UP del giro 2, è corretta in `2f583e6`.
  5. PR verso `dev`: non aperta. Serve l'ok di Omar per il push e la PR, dopo il merge di `dev` nel branch, con Leonardo come revisore; la checklist obbligatoria del REPORT va fatta prima del merge.
- **files edited/created**: `brain/specs/crm/analytics-effect/{IMPLEMENTATION-NOTES,RUBRIC,REPORT}.md`, `brain/tech-debt/crm/analytics-effect.md`, `brain/index.md`, `brain/log.md`, `brain/specs/crm/crm-specs.md`; dalle correzioni della review e della prova nel browser: `src/components/custom/date-picker/index.tsx`, `vitest.config.ts`, `src/app/dashboard/page.tsx`, `src/app/dashboard/_components/{CardRow,DonutCard,FinanceCard,AdminDataSection,OperatorDataSection}.tsx` e i test (Surprises di IMPLEMENTATION-NOTES)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: mixed
- **assigned_skills**: agent-browser, adversarial-review
- **complexity**: medium

## 10. Wave di esecuzione

| Wave | Task | Quando parte |
|---|---|---|
| 0 | G0 | SPEC approvata |
| 1 | T1, T2, T3, T4, T5 | G0 fatto. Cinque file di test nuovi, disgiunti. A fine wave, l'orchestratore lancia `tsc`, `next lint` e la suite intera, poi i mutanti di ogni task, uno alla volta (D22) |
| 2 | T6 | Round 1 nel branch |
| 3 | T7 | T6 fatto (stessi file) |
| 4 | T8 | T7 fatto |
| 5 | T9, T13, T14, T17 | T8 fatto. File disgiunti (§8) |
| 6 | T10, T12, T15 | T9 fatto. File disgiunti (§8) |
| 7 | T11, T16 | T10 fatto; per T16 anche T14 e T15. File disgiunti (§8) |
| 8 | T18 | T11, T12, T13, T16, T17 fatti |
| 9 | T19 | T18 fatto |

## 11. Strategia di test (fase TDD)

- **Interfaccia pubblica** (D25): nei round 1 e 2 le procedure via `createTestCaller` su PGlite; nel round 3 i servizi con `runServer` e un `Clock` fisso per i dati (T10, T11, T12), e le procedure per il contratto (chiavi, middleware, forma, tipi); i componenti con `@testing-library/react`. Nessun test chiama una funzione privata.
- **Due finestre** (D26): ogni caso sugli importi ha le fixture nel riferimento e nel confronto, e controlla tutti e due i numeri; i mutanti toccano anche una sola delle due query.
- **Il "rosso" nei round 1 e 2.** I test del round 1 nascono verdi sul codice di oggi. Quello che li rende utili sono i mutanti: ogni file uccide, sul codice di `2fd59da`, almeno un mutante per procedura e per stranezza coperta, e T8 li ripete sui servizi. L'unico rosso vero del round 2 è il test sulle chiavi di T6.
- **Mutanti equivalenti**, dichiarati e non da uccidere:
  - `isNotNull(customers.operatorId)` con l'`innerJoin` su `operators` (D10);
  - `selectDistinct` → `select` e il `count()` della ciambella: il `groupBy` dà già righe uniche, e il `count` non arriva nella risposta.
  Un mutante nuovo che sopravvive si annota come equivalente solo con una prova.
- **Il rosso nel round 3.** Ogni task scrive per primo il suo `tdd_target`, lo vede fallire, poi cambia il codice. I test vecchi che la correzione rompe si aggiornano nello stesso commit, e il loro nome dice il comportamento nuovo.
- **Regola di AC8.** Fra l'ultimo commit del round 1 e l'ultimo del round 2, nessuna riga di `_test/` cambia: si aggiunge solo `router.db.test.ts` (T8 lo controlla). Se un'asserzione va cambiata nel round 2, ci si ferma e si chiede.
- **Date e tempo:**
  - round 1 all'ora vera, con un giorno di margine dagli estremi (D5);
  - round 3 con un `Clock` fisso nei test dei servizi, e con gli estremi esatti (`now − N × 24 h`) che il round 1 non può toccare;
  - la formattazione in ora di Roma nei progetti `utc` e `rome` (D15); gli altri test dei componenti usano istanti a mezzogiorno UTC, che danno lo stesso giorno in tutti e due i fusi.
- **Importi riconoscibili:** potenze di 2, così una somma sbagliata dice quali pratiche sono state contate.
- **Permessi:** la tabella dei middleware copre le chiavi del router per costruzione (`satisfies Record<...>`), e prova i tre chiamanti: senza operatore, disattivato, `OPERATORE` attivo.
- **Tipi:** `types.test.ts` lo controlla `tsc`; nel round 3 si aggiorna con AC20 e D17.
- **Lint:** `next lint` gira sui file di test a fine di ogni wave (D22).

## 12. Gate di rilascio

| Gate | Quando | Che cosa |
|---|---|---|
| G0 | Prima della wave 1 | SPEC `approved` |
| G1 | Merge in `dev` | CI verde; AC1–AC26 annotati; mutanti uccisi; prova nel browser senza errori; REPORT SHIP; approvazione di Leonardo. Dopo il merge, il commit di documenti di D21 (date, PR, TD11, TD10 (f), §4, §5) |
| G2 | Staging, dopo il merge | Con `BACKEND_URL` (Cloud Run), la dashboard come admin e come operatore: card, date e cambio di periodo come in T19, con le chiamate via HTTP |
| G3 | Prod | Nel rilascio unico della migrazione. Mai nella stessa release di un cutover GCP, né durante l'osservazione di S6 |

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Un test di caratterizzazione passa per caso | Mutanti per procedura e per stranezza in T1–T5, ripetuti sui servizi in T8; equivalenti dichiarati con la prova (§11) |
| Un errore nella sola query del confronto passa con tutti i test verdi | Fixture e controlli nelle due finestre, e mutanti su una sola query (D26); T10 riduce le due query a una funzione |
| I test del round 1 falliscono a cavallo di mezzanotte o del cambio dell'ora | Un giorno di margine dagli estremi (D5); le finestre di oggi si calcolano al caricamento del modulo, pochi secondi prima del test |
| Il rename di T9 rompe la UI o i test in un punto che `tsc` non vede | Le sezioni sono le uniche chiamanti (`git grep` di §6); T9 aggiorna tutti i test di `analytics/`; `tsc` e suite a fine wave |
| Un `OPERATORE` perde o guadagna dati per un errore nei permessi | La tabella dei middleware sulle chiavi esatte (T9); i casi di chi vede che cosa in T1, T9 e T11; un passaggio dedicato in `adversarial-review`; la revisione di Leonardo |
| La `exists` conta male una pratica con clienti di due operatori | Il caso esplicito di AC13 in T11 |
| Il confronto conta due volte la pratica sull'estremo | Il caso a esattamente `now − N × 24 h` in T10 |
| Un `Date` non arriva intero a `FinanceCard` (componente client), o via HTTP | `superjson` per tRPC; React 18.3 serializza i `Date` nelle prop; la prova nel browser in T19 e su staging in G2 |
| Le date in ora di Roma dipendono dal fuso del processo di test | Il test nei `timeZoneTests`, eseguito in `utc` e `rome` (D15) |
| Radix Select non mostra il valore in jsdom | Se il valore mostrato non si legge nel trigger, il test di T15 legge il valore del `select` nativo nascosto di Radix; la prova nel browser lo conferma |
| Due worker sullo stesso albero si rompono `tsc` a vicenda | D22; i file delle wave sono disgiunti (§8) |
| Un test nomina `TIMEFRAMEMAP` e fa fallire la `grep` di AC10 | D6, controllato in T16 e T19 |

## 14. Debito della migrazione (TD11)

T18 lo scrive nel §7 di [[chore/migrazione-effect]], e chi fa il merge lo completa (D21):

- **S1–S9**, ognuna `[CLOSED <data del merge>]` con la correzione di questa PR (la mappa è in T18).
- **Voce `[PREVISTO]`, poi `[OPEN]` dopo il merge:** un utente senza riga operatore riceve `BAD_REQUEST` da tutte e quattro le procedure della sezione, quindi la sezione "Analisi Andamento" non si carica per un admin senza operatore, come oggi per `getAllDoneTasksInLastMonth`. Fix: lo stesso del FOLLOW-UP sull'admin senza riga operatore di [[tech-debt/crm/export-chiamate]], quando si decide.

Il passo non genera altro debito: le stranezze trovate sono tutte corrette nel round 3.

## 15. Domande aperte

Nessuna che blocchi il piano:
- OQ1 (titoli) e OQ2 (`—` nel badge) della SPEC restano ai default, e Omar li conferma con G0 (D23);
- OQ3–OQ7 sono chiuse dalle decisioni di Omar del 2026-10-26;
- le altre decisioni si ricavano dal codice e dai passi 4 e 5.

## 16. Backlog

Nessun tracker collegato: il passo non ha epic né story in un backlog. I campi `backlog_*` dei task sono `n/a`, come nei passi 2, 4 e 5.

## 17. Correzioni dopo la verifica del piano (2026-10-26)

L'`adversarial-verifier` ha dato DO NOT SHIP, con 0 blocker, 2 major, 7 minor e 5 nit. Tutti corretti:

- **Major, la finestra di confronto senza prove.** T1 e T11 fissavano doppio conteggio, stati e permessi solo nel riferimento, e il mutante su `accessCondition` colpiva tutte e due le query. Ora ogni fixture è nelle due finestre, e i mutanti toccano anche una sola query (D26, T1, T11); T10 riduce le due query a una funzione.
- **Major, il tipo di T5.** `inferRouterOutputs` dà `string | number`, non `string | 0`: corretti §1, T5 e il suo `tdd_target`.
- **Minor:**
  - "senza input" in T1 e T2 diventa `{}`, perché `timeFrameInput` è un oggetto obbligatorio;
  - in T14 è rosso solo il caso 150 000 / 0: con 0 / 0 il badge è già `0%` e `unchanged`;
  - in T10, una pratica a esattamente `T` conta nel riferimento, più tre mutanti sugli estremi;
  - T16 elenca `FinanceCard.test.tsx` di T14. Da T9 la tabella dei middleware controlla solo gli esiti, quindi T10 e T11 non la toccano;
  - T1 ha i mutanti delle due medie;
  - i test nuovi sui dati del round 3 vanno sui servizi, per la regola 3 del §2 di [[chore/migrazione-effect]] (D25);
  - le memorie degli agenti restano fuori dal branch (D24).
- **Nit:**
  - T15 e T16 diventano `review_mode: cli`, perché la prova nel browser è in T19; "`tsc` verde" nei task paralleli vale "a fine wave" (D22);
  - la `grep` di AC6 esclude `_test/`;
  - D21 dice che cosa scrive T18 e che cosa scrive chi fa il merge; T18 allinea anche il conteggio di `server-only` nella riga del passo 0;
  - in T2 le pratiche si inseriscono in ordine non alfabetico;
  - D19 dice in che cosa `ExportCharts.test.tsx` è un precedente e in che cosa no.

---
domain: crm
type: plan
links:
  - "[[specs/crm/pagina-analisi/SPEC]]"
  - "[[specs/crm/pagina-analisi/FLOW]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/design-system-web/SPEC]]"
  - "[[chore/migrazione-frontend-react]]"
  - "[[chore/migrazione-gcp]]"
created: 2026-10-30
updated: 2026-10-30
---

# Plan: Pagina Analisi in `apps/web`

**Spec:** [[specs/crm/pagina-analisi/SPEC]], 2026-10-30: 42 criteri, nessuna domanda aperta. La mappa è [[specs/crm/pagina-analisi/FLOW]].
**Status:** Complete. T1–T19 fatti; dopo la revisione, per decisione di Omar, classifiche ai primi 8 e legenda, grafico e note in un riquadro alto quanto lo scheletro (AC19). Revisione al sesto giro: SHIP. Nulla committato.
- **Verifica del piano:** DO NOT SHIP, con 0 blocker, 8 major e 11 minor, tutti corretti (§15). Nessun secondo giro.

**Generato:** 2026-10-30 con `create-plan`.
- **Grill:** non ha richiesto domande. Le decisioni di prodotto sono nella spec, e Omar ha chiuso tutte le domande aperte. Le decisioni tecniche sono D1–D18 qui sotto, e Omar le rivede insieme al piano.
- **Poi:** ricerca nel codice, grafo dei task, tdd e verifica del piano.

**Baseline:** `dev` a `632b7b12`. Il branch nasce da `dev` com'è al via.
**Chi:** Claude con `implement-spec`, supervisionato. Una PR verso `dev`; la unisce Claude su richiesta di Omar, solo con i gate verdi e T19 fatto.
**Backlog:** nessun tracker collegato. I campi `backlog_*` dei task sono `n/a`, come nei piani precedenti.

---

## 1. Situazione iniziale

- **Il gruppo `analytics`** (`packages/contract/src/analytics.ts`, handler in `packages/server/src/http/analytics.ts`) ha quattro endpoint:
  - `getFinancedTotal` e `getFinancedAverage`;
  - `getFinancedByBranch`, `AdminOnly`;
  - `getContactProgress`.

  I periodi sono `30d`, `90d` e `365d`, su finestre di N×24 ore che finiscono adesso (`services/analytics/windows.ts`). Non ci sono serie nel tempo, né il confronto con l'anno prima, né intervalli qualsiasi.
- **`financed.ts`:**
  - `customerAccess` limita l'admin ai clienti con un operatore (`isNotNull(customers.operatorId)`), mentre `financedByBranch` conta tutte le pratiche;
  - `avg` senza pratiche torna `0`;
  - gli stati finanziati sono `Liquidata`, `Chiusa` ed `Estinta anticipata`;
  - `dataLiquidazione` è un `timestamp with time zone` e non ha indici.
- **Le chiamate** (`services/export/callStats.ts`):
  - si contano dal registro (`task_event_log`): cambi di stato manuali (`source` `detail`/`list`) da `callFromStates` a `callToStates`;
  - una query raggruppa per operatore su `[start, end)`;
  - il gruppo `export` le espone come `callStats`, `AdminOnly`;
  - c'è già una prova di carico, `callStats.perf.pg.test.ts`;
  - il registro ha l'indice `task_event_log_createdAt_idx`, ma nessun indice su `actor_operator_id`.
- **Giorni di Roma** (`packages/domain/src/export/period.ts`):
  - le funzioni sono `romeDay`, `romeDayBounds` e `periodBounds`, con `addDays` e `addMonths` private;
  - `COMPLETE_DATA_SINCE = "2026-09-15"`;
  - `LOG_RETENTION_MONTHS = 3` lo usano sia `selectableDays` (export chiamate di Next e di `apps/web`) sia `cleanupTaskEventLog`;
  - `period.test.ts` fissa i 3 mesi.
- **La pulizia:**
  - il job `cleanup-task-event-log` esiste nel registro dei cron del backend (`apps/api/src/cron/jobs.ts`);
  - `apps/api/gcp/setup-staging.sh` crea, in pausa, solo `priority`, `alert`, `update` e `delete-export`;
  - [[chore/migrazione-gcp]] (riga 251) dice che nessuno scheduler lancia la pulizia.
- **`apps/web`:**
  - gli hook di `src/api/analytics.ts` usano `routeErrorWhenEmpty`: il primo errore porta alla pagina d'errore della rotta;
  - `queryClient` riprova solo `ApiUnavailable`, e `meta.toastErrors: false` spegne il toast;
  - `describeApiError` (`src/api/errors.ts`) ha un caso per ogni errore del contratto, quindi un errore nuovo fa fallire `tsc` finché non ha il suo testo;
  - i test girano con `renderWithApi` su handler in memoria (`src/test/api.tsx`, falsi per pagina in `src/test/*.ts`);
  - `components/ui/` ha `chart.tsx`, `calendar.tsx` (react-day-picker 9), `table.tsx`, `tabs.tsx`, `tooltip.tsx`, `toast`, `skeleton.tsx`, `select.tsx` e `popover.tsx`; recharts è alla 3.10.
- **La barra laterale** (`components/layout/DashboardLayout.tsx`): la home ha `HomeIcon` con l'etichetta «Analisi». `DashboardLayout.test.tsx` fissa «Mito SRL, Analisi, Clienti, Pratiche, Chiamate».
- **Il router** (`src/router.tsx`): pagine `lazy` sotto `/dashboard`; il prototipo sta su `/_dev/prototypes/analisi`, solo con `import.meta.env.DEV`.
- **Il prototipo** (`apps/web/src/prototypes/analisi/`, 2.800 righe):
  - `model.ts` ha le regole di finestra e intervalli e i risultati dei grafici su dati finti;
  - `parts.tsx` ha i grafici, le parti dell'interfaccia e l'export;
  - `VariantEsplora.tsx` è la pagina.

  È il riferimento dei valori (misure, testi, forme), non codice da copiare: gli manca lo spostamento di AC11, la tabella come regione, le schede come tablist e gli stati di errore veri.
- **Il seed locale** (`pnpm seed:local`, [[specs/crm/seeder-locale/SPEC]]) scrive pratiche liquidate e righe del registro, quindi la pagina si prova su `mito_local`.

## 2. Problema

La pagina della spec ha bisogno di:
- **finestre a giorni di Roma**, qualsiasi tra 1 e 366 giorni, con due confronti e il raggruppamento;
- **sei grafici**, ognuno con stati e export propri;
- **un permesso nuovo:** l'operatore vede le sue chiamate;
- **un registro delle chiamate di 25 mesi**, con la pulizia programmata.

Gli endpoint di oggi non danno nessuna di queste cose. La home non va toccata, salvo il nome della sua voce.

## 3. Forma della soluzione

1. **Regole di calendario pure in `@mito/domain/analytics/`:**
   - periodi, confronto, raggruppamento, intervalli e spostamento di AC11;
   - condivise da server e browser, testate una per una sugli esempi della spec.
2. **Quattro endpoint nuovi nel gruppo `analytics`:**
   - prendono `from`, `to` e `compare`;
   - il server valida la finestra e calcola il confronto con le regole del punto 1;
   - restituiscono **numeri per giorno di Roma** (finanziato, chiamate dell'operatore) o totali della finestra (sedi, chiamate per operatore);
   - insieme ai numeri restituiscono la finestra e il confronto usati.
3. **Il browser** raggruppa i giorni negli intervalli, applica lo spostamento, costruisce righe, numeri, note e stati di ogni grafico (moduli puri in `routes/dashboard/analisi/_lib/`), e da quelle stesse righe la tabella e i file.
4. **La pagina** `routes/dashboard/analisi/` è il master-detail di «Esplora · tabella», con le schede come tablist, una query per grafico e l'errore nel riquadro del grafico.
5. **Conservazione 25 mesi** (una costante); il job di pulizia entra negli scheduler di staging (in pausa) e di prod (R10).

## 4. Decision ledger

### Di prodotto (dalla spec, chiuse da Omar)
Tutte nel Decision Log di [[specs/crm/pagina-analisi/SPEC]]; il piano non ne riapre nessuna.

### Tecniche (questo piano; Omar le rivede col piano)

| # | Decisione | Motivo |
|---|---|---|
| D1 | Una PR verso `dev`, branch `claude/pagina-analisi` | Rilascio con il resto della migrazione, in una sola finestra (R10). |
| D2 | Solo `HttpApi`: nessuna procedura tRPC, niente in Next salvo l'effetto della costante di AC17 | Constraint della spec; decisione del 2026-10-30 «Next deprecato». |
| D3 | Regole di calendario in `packages/domain/src/analytics/` (`window.ts`, `buckets.ts`), su giorni `YYYY-MM-DD` di Roma, senza `Date` locali. I loro test entrano in `timeZoneTests` di `vitest.config.ts`, così girano in UTC e in Europe/Rome | Le usano server e browser. Con giorni-stringa nessun calcolo dipende dal fuso della macchina, come in `export/period.ts`. `addDays` e `isDay` di `period.ts` diventano esportate e si riusano. `addMonths` no: si ferma all'ultimo giorno del mese (31 ott → 30 set), mentre lo spostamento di AC11 lascia fuori il giorno che non esiste. Per questo T2 scrive `shiftMonths`, che restituisce `null` per quel giorno. |
| D4 | I due endpoint nel tempo restituiscono **un valore per giorno** della finestra e del confronto; raggruppamento e spostamento li fa il browser | Cambiare «Raggruppa per» non rifà richieste. AC11 sta tutto in funzioni pure. Sono al massimo 366 + 366 righe. La media per intervallo si calcola da somma e pratiche, non da medie di medie. |
| D5 | Il server riceve `compare`, non le date del confronto, e lo calcola con `comparisonOf` di D3. La risposta riporta `window` e `comparison` | Una sola regola per il confronto. Il file prende finestra e confronto dai dati arrivati (AC30). |
| D6 | Endpoint nuovi: `getFinancedSeries` (`GET /analytics/financed-series`), `getBranchTotals` (`/analytics/branch-totals`, `AdminOnly`), `getCallsByOperator` (`/analytics/calls-by-operator`, `AdminOnly`), `getMyCallSeries` (`/analytics/my-call-series`). I vecchi restano per la home | Non-Goal: la home non cambia. |
| D7 | Una finestra fuori da AC9 (formato, ordine, oltre 366 giorni) è `InvalidWindow`, 400, `Schema.TaggedError` del contratto con il testo «Finestra di date non valida». Un `to` di un solo giorno dopo l'oggi del server si accorcia a oggi, e la risposta lo dice in `window`; più in là è `InvalidWindow` | Come `InvalidPeriod` dell'export. L'indirizzo non valido torna al valore iniziale (AC14). Resta un caso: l'orologio del browser avanti rispetto al server subito dopo mezzanotte. Lì l'accorciamento evita un errore su ogni grafico, e il file prende la finestra arrivata (AC30). |
| D8 | `getMyCallSeries` legge l'operatore solo da `CurrentUser` e non ha parametri per sceglierlo; i dati degli altri sono solo negli endpoint `AdminOnly`, che a un OPERATORE rispondono `NotAdmin` (403) | AC18: «una richiesta dei dati di un altro operatore è rifiutata», senza un controllo da dimenticare. |
| D9 | Per l'ADMIN, `getFinancedSeries` conta tutte le pratiche finanziate, con o senza clienti; per l'OPERATORE, quelle con un cliente assegnato a lui, contate una volta | AC5 e AC6. Un servizio nuovo, perché `customerAccess` di oggi resta alla home. |
| D10 | Le query della pagina non usano `routeErrorWhenEmpty` e non hanno `placeholderData`. Hanno `meta.toastErrors: "session"`, un valore nuovo del `QueryCache` (`api/queryClient.ts`): il toast parte solo per `Unauthorized` («Sessione scaduta: accedi di nuovo»). Un `Unauthorized` non disegna il riquadro d'errore del grafico: il pannello mostra lo stesso testo della sessione. In più ogni pannello ha un error boundary suo, così un'eccezione mentre recharts disegna resta nel riquadro | L'errore sta nel riquadro del grafico (AC20, AC21), e mai i dati della finestra vecchia (AC26). Una sessione scaduta passa dal flusso di sessione dell'app, cioè il suo toast, e non da 6 riquadri d'errore (AC23). |
| D11 | Il ruolo viene da `useUserPreferenceContext((s) => s.role)`, come nella barra laterale, e l'operatore da `useCurrentUser`. Le chiavi di **tutte** le query della pagina contengono ruolo e id dell'operatore, così dopo un cambio di ruolo nessun numero della vista ADMIN resta a video. Un `NotAdmin` da un endpoint solo admin vale come ruolo cambiato: si rileggono preferenze e utente, si tolgono dalla cache le query della pagina con la vecchia chiave, e le schede non consentite spariscono senza riquadro d'errore | AC23. Contano anche `getFinancedSeries` e `getContactProgress`, che non sono solo admin ma danno numeri diversi per ruolo. |
| D12 | Export costruito nel browser dalle righe della tabella (`_lib/export.ts`); `xlsx` caricato con `import()` al clic | Come `buildCallStatsWorkbook`: file e schermo non divergono (AC30). Il bundle iniziale non porta `xlsx`. |
| D13 | Grafici sul `ChartContainer` di `components/ui/chart.tsx` con recharts 3: `isAnimationActive={false}` su ogni serie e `accessibilityLayer={false}` su ogni grafico | AC8 e AC34. In recharts 3 lo strato di accessibilità è acceso di default e rende la superficie un tab stop: da verificare in T15. |
| D14 | Nessun `design-engineer`: il movimento è chiuso da AC8 | Nessuna animazione da specificare; resta un controllo in T15. |
| D15 | Nessuna migrazione. Se la prova di carico di T7 (`PERF=1 pnpm test:pg`, che la CI non lancia) supera il suo limite, l'indice `(actor_operator_id, created_at)` va in un task aggiunto, con la sua migrazione e le regole di CLAUDE.md: `db:generate`, la riga `customers.id SET DEFAULT` tolta, il journal controllato, la rigenerazione se `dev` ha migrazioni nuove al momento dell'unione | Il registro ha già l'indice su `created_at`, e non si aggiunge schema senza una misura. |
| D16 | `LOG_RETENTION_MONTHS = 25`; in `period.ts` nasce `callsCompleteSince(now)`, cioè il più recente tra `COMPLETE_DATA_SINCE` e `selectableDays(now).first` | AC16 e AC17 con una sola costante, come dice la spec. |
| D17 | Job `cleanup-task-event-log` alle 01:17 UTC: in `setup-staging.sh`, in pausa come gli altri, e nella lista dei job di prod di R10 in [[chore/migrazione-gcp]]. Lo staging esiste già, e rilanciare lo script fallirebbe sul service account (`set -e`): Omar riceve i due comandi `gcloud scheduler jobs create http …` e `… pause` per il solo job nuovo | Dopo `delete-export` (00:47). La spec chiede lo scheduler di R10; il piano non tocca GCP. |
| D18 | Il prototipo si cancella in T19: cartella, rotta di sviluppo, `apps/web/prototypes/scenario.css` e la configurazione `web-prototype` di `.claude/launch.json` | Hard Rule 5 di `prototype`: si cancella quando la pagina vera arriva. |

### Assunzioni
- **A1.** `dataLiquidazione` va letto come giorno di Roma (`AT TIME ZONE 'Europe/Rome'`), come i giorni del registro. L'import scrive l'istante della mezzanotte del giorno, quindi il giorno non cambia: T5 lo prova con una pratica liquidata alle 23:30 UTC.
- **A2.** «Pratiche» nella tabella del finanziato conta le pratiche finanziate distinte di ogni intervallo.
- **A3.** Il nome dell'operatore per «Dati di» è `name surname` di `GET /me`.

### Ancora aperte
Nessuna.

## 5. Assunzioni e vincoli

- Gate di CI: Lint (`next lint`, `tsc --noEmit`), Test (`pnpm run test --run`, anche i `.db.test.ts` sul database di test) e Build; poi il job Web (`pnpm web:lint`, `pnpm web:test`, `pnpm web:build`).
- Il gate dei colori di `apps/web` (`src/_test/colors.test.ts`) vale anche per la pagina nuova.
- Stile Effect 4 di CLAUDE.md:
  - `Effect.fn("analytics.<nome>")` per i servizi esportati;
  - `Schema.TaggedError` per gli errori;
  - test con `@effect/vitest` e `it.effect`, con `TestClock.setTime` per «oggi».
- Le regole del layout sotto i 768 px restano rinviate, salvo AC33.
- Nessuna modifica alla home salvo l'etichetta (AC1) e l'effetto di AC17 sul periodo dell'export.

## 6. Findings dal codice

- `exportPeriodInput` di `period.ts` è il modello per la validazione di D7: giorni esistenti, in ordine, dentro i limiti, all'ora del `Clock` del server.
- `callStats` conta per operatore in una query; il conteggio per giorno dell'operatore è la stessa `where` con `actor_operator_id` e un `group by` sul giorno di Roma.
- `financedByBranch` raggruppa per `desPuntoVendita` ordinando per nome; la pagina ordina per finanziato e aggiunge «Senza sede» e «Altre» nel browser.
- `contactProgress` serve già sia all'ADMIN sia all'OPERATORE e non ha finestra: la pagina lo riusa con un hook nuovo senza `routeErrorWhenEmpty` (AC7, AC21).
- `DashboardShell` mette già un `main`, quindi la pagina non ne aggiunge un altro (AC41).
- `src/test/home.ts` è il modello per i falsi della pagina; `routes/_test` ha un router di prova che serve le pagine.

## 7. Ricerca esterna

- **recharts 3:** `accessibilityLayer` acceso di default (superficie con `tabIndex=0` e `role="application"`, AC34) e `isAnimationActive` per ogni serie (AC8). Da confermare sul codice installato in T15, prima di scrivere i grafici.
- **react-day-picker 9:** la modalità `range` con `disabled={{ after: today }}` e `max` per i 366 giorni (AC9). Il calendario di `components/ui/calendar.tsx` lo avvolge già.
- **Pattern tab di WAI-ARIA:** `role="tablist"` con `aria-orientation`, schede con `aria-selected` e `aria-controls`, attivazione automatica con le frecce, Home/End (AC36).

## 8. Grafo delle dipendenze

| Task | Dipende da |
|---|---|
| T1, T4 | G0 |
| T2, T3, T10 | T1 |
| T5 | T1, T4 |
| T6 | T5 |
| T7 | T6, T3 |
| T8 | T3 |
| T9 | T4 |
| T11 | T2, T3, T4 |
| T12 | T11, T3 |
| T13 | T12, T10 |
| T14 | T9, T10, T11, T12 |
| T15 | T14 |
| T16 | T15 |
| T17 | T16 |
| T18 | T17, T13 |
| T19 | T18, T7, T8 |

In sintesi:
- **dominio:** T1 → T2;
- **backend:** T4 → T5 → T6 → T7, in serie perché tutti toccano il file degli handler;
- **librerie della pagina:** T10, T11, T12 e T13, funzioni pure;
- **pagina:** T14 → T15 → T16 → T17 → T18, in serie perché toccano `ChartPanel` e `AnalisiPage`;
- **chiusura:** T19.

## 9. Task

Ogni task comincia dal test di `tdd_target`, rosso, e finisce con i gate del suo pacchetto verdi. I task del browser si provano su `mito_local` con il seed (`pnpm db:local:up`, `pnpm db:local:migrate`, `pnpm seed:local`, poi `pnpm web:dev`), con una persona ADMIN e una OPERATORE del seed.

### G0: Piano approvato
- **depends_on**: []
- **location**: `brain/specs/crm/pagina-analisi/{SPEC,PLAN}.md`
- **description**: Omar approva spec e piano. `implement-spec` porta la spec a `status: approved` e crea il branch `claude/pagina-analisi` da `dev` aggiornato. Il prototipo, ancora non committato, entra nel primo commit del branch, così resta riferimento fino a T19.
- **validation**: frontmatter `approved`; branch creato da `dev`.
- **status**: Done
- **log**: 2026-10-30: `/implement-spec` di Omar vale come approvazione; spec `approved`. Branch del worktree (`claude/analysis-page-charts-alignment-97c602`, da `dev` a `632b7b12`) al posto di `claude/pagina-analisi`; nessun commit del prototipo, che T19 cancella (note).
- **files edited/created**: `SPEC.md` (status), `PLAN.md`, `IMPLEMENTATION-NOTES.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

### T1: Regole della finestra nel dominio (AC9, AC10, AC13, AC15)
- **depends_on**: [G0]
- **location**: `packages/domain/src/analytics/window.ts` (nuovo), `packages/domain/src/export/period.ts` (esporta `addDays` e `isDay`), `packages/domain/src/analytics/_test/window.test.ts`, `vitest.config.ts` (`timeZoneTests`: `packages/domain/src/analytics/_test/*.test.ts`)
- **description**: Funzioni pure su giorni `YYYY-MM-DD` di Roma, con `today` passato come giorno:
  - `presetRange(preset, today)` per `7d`, `30d`, `90d`, `ytd` e `12m`, con i valori della tabella di AC9;
  - `initialComparison(preset)`: «Stesso periodo, anno prima» per `ytd`, «Periodo precedente» per gli altri e per `custom`;
  - `validateWindow({from, to}, today)`: giorni esistenti, `from ≤ to`, da 1 a 366 giorni, `to ≤ today`; restituisce un risultato, non lancia;
  - `comparisonOf(window, compare)` (AC10):
    - mesi interi → stessi mesi di calendario subito prima;
    - altrimenti stessi giorni subito prima;
    - anno prima → stesse date un anno prima;
    - `none` → `null`;
  - `daysIn`, `autoGroup(days)` (giorno fino a 14, settimana fino a 120, poi mese), `allowedGroups(days)` e `effectiveGroup(choice, days)`, che torna `auto` se la scelta non è più ammessa (AC13);
  - `widenAction(preset)`: 7d e custom → 30d; 30d → 90d; 90d → 12m; ytd e 12m → nessuna (AC15).

  I tipi `Preset`, `Compare` (`previous`, `last-year`, `none`) e `Group` (`auto`, `day`, `week`, `month`) stanno qui; le chiavi sono quelle dell'indirizzo di AC14.
- **validation**:
  - i casi della tabella di AC9 al 30/10/2026;
  - gli esempi di AC10 (1–30 set → 1–31 ago; 01/10–30/10 → 01/09–30/09; 01/01–30/10/2026 → 01/01–30/10/2025; «L'anno in corso» con «Periodo precedente» → 4 mar – 31 dic 2025);
  - i limiti di 1 e 366 giorni e il giorno dopo oggi;
  - le soglie 14, 60 e 120 di AC13;
  - `pnpm run test --run packages/domain/src/analytics`.
- **status**: Done
- **log**: 2026-10-30: RED del supervisore (`window.test.ts`), worker sonnet; review passata. Il supervisore ha spostato `isDay`, `addDays`, `addMonths` e `noonOf` in `packages/domain/src/utils/calendarDays.ts` senza zod (il browser importa `window.ts`, e `period.ts` porta zod), e `isDay` non lancia più su «2026-13-45» (prima `toISOString` dava RangeError dentro il refine di zod).
- **files edited/created**: `packages/domain/src/analytics/window.ts`, `_test/window.test.ts`, `packages/domain/src/utils/calendarDays.ts`, `packages/domain/src/export/period.ts`, `vitest.config.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `comparisonOf({from: "2026-09-01", to: "2026-09-30"}, "previous")` è `{from: "2026-08-01", to: "2026-08-31"}`.
- **review_mode**: cli
- **complexity**: medium

### T2: Intervalli e spostamento del confronto (AC11)
- **depends_on**: [T1]
- **location**: `packages/domain/src/analytics/buckets.ts` (nuovo), `packages/domain/src/analytics/_test/buckets.test.ts`
- **description**: `bucketsOf(window, group, comparison)` restituisce gli intervalli in ordine. Per ognuno:
  - `from` e `to`;
  - l'etichetta corta dell'asse e quella lunga della tabella («1 – 6 set 2026», tagliata dai bordi della finestra);
  - `comparisonDays`: l'elenco dei giorni di confronto, o `null` quando non si confronta.

  Le regole sono quelle di AC11:
  - settimane dal lunedì, mesi di calendario;
  - lo spostamento in mesi (per mese; 12 mesi per anno prima; N mesi per «Periodo precedente» su mesi interi) o in giorni negli altri casi;
  - un giorno che non esiste nel mese di arrivo resta fuori, come le date fuori dal confronto;
  - un mese intero si confronta col mese intero di arrivo; ogni altro intervallo solo a parità di giorni.

  Lo spostamento in mesi usa `shiftMonths(day, n)`, nuova in `buckets.ts`: restituisce `null` per un giorno che nel mese di arrivo non esiste. `addMonths` di `period.ts` invece si ferma all'ultimo giorno (D3).

  Più `sumDays(days, rows, pick)`, che somma i valori per giorno di un intervallo.
- **validation**: un test per ogni esempio di AC11:
  - set per settimana contro ago;
  - ott contro set («26 – 31 ott 2026» → `null`, il 1 ott mai nel confronto);
  - gen–giu 2026 per mese contro lug–dic 2025;
  - «L'anno in corso» con «Periodo precedente» («gen 2026» → `null`, «1 – 30 ott 2026» → 1–30 dic 2025);
  - il 29 feb 2028 per giorno con anno prima;
  - «27 lug – 2 ago» → `null`.

  Inoltre i bordi tagliati e le etichette in italiano.
- **status**: Done
- **log**: 2026-10-30: RED del supervisore con ogni esempio di AC11, worker sul modello del supervisore; review passata, 102 test verdi in UTC e Roma. `bucketsOf` prende `{ window, group, compare, comparison }`: lo spostamento dipende anche da `compare` (un «12m» col periodo precedente ha le stesse date dell'anno prima, ma si sposta in giorni).
- **files edited/created**: `packages/domain/src/analytics/buckets.ts`, `_test/buckets.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Per 1–31 ott 2026 per settimana, confronto 1–30 set, l'ultimo intervallo «26 – 31 ott 2026» ha `comparisonDays: null`.
- **review_mode**: cli
- **complexity**: high

### T3: Conservazione di 25 mesi e giorno dei dati completi (AC16, AC17)
- **depends_on**: [T1]
- **location**:
  - `packages/domain/src/export/period.ts` e `_test/period.test.ts`;
  - `packages/server/src/services/cron/cleanupTaskEventLog.ts` (commento) e `_test/cronServices.db.test.ts` (righe 86–98);
  - `packages/server/src/http/_test/analytics.db.test.ts` (righe 302–305, «più vecchio di 3 mesi»);
  - `packages/server/src/api/routers/export/_test/callStats.db.test.ts` (riga 115);
  - `apps/web/src/routes/dashboard/home/_components/export/_test/export.test.tsx` (righe 55 e 106, `min` 2026-07-24);
  - `src/app/dashboard/_components/export/_test/AdminExportSection.test.tsx` (righe 77 e 118).
- **description**:
  - `LOG_RETENTION_MONTHS = 25`; il commento della pulizia dice 25 mesi.
  - Nuova `callsCompleteSince(now)`: il più recente tra `COMPLETE_DATA_SINCE` e `selectableDays(now).first`.
  - **Test che cambiano di proposito** (AC17, da scrivere nel log): i sei file sopra fissano i 3 mesi. Ognuno riscrive i suoi valori di confine sui 25 mesi e tiene il senso dell'asserzione, cioè il primo giorno ammesso e il giorno prima rifiutato.
  - Nella pulizia resta il confine al millisecondo: al momento `now`, la riga di 25 mesi prima meno 1 ms si cancella, e quella dello stesso istante resta. Così una `lte` al posto della `lt` fa fallire il test.
  - L'export chiamate di Next e di `apps/web` segue la costante senza altre modifiche: lo provano i due test dell'export, aggiornati.
- **validation**:
  - `selectableDays` al 23/10/2026 parte dal 24/09/2024;
  - `callsCompleteSince` dà `2026-09-15` oggi e il giorno dopo i 25 mesi quando quello è più recente (per esempio `2026-11-11` al 2028-11-10);
  - il confine al millisecondo della pulizia;
  - gate Test della root e `pnpm web:test`.
- **status**: Done
- **log**: 2026-10-30: RED del supervisore (25 mesi in `selectableDays` e i due `callsCompleteSince`), worker haiku; review passata, 154 test verdi più gli 11 dell'export di `apps/web`. Test cambiati di proposito, con gli stessi sensi delle asserzioni: i sei del piano più `src/app/api/cron/cleanupTaskEventLog/_test/cleanupTaskEventLog.db.test.ts`, che il piano non elencava e fissava i 3 mesi sulla route di Next. Il confine al millisecondo resta (2024-09-14T02:59:59.999Z cancellata, 03:00:00.000Z tenuta). L'esempio del piano «`2026-11-11` al 2028-11-10» era sbagliato: è `2026-10-11`, e il test usa quello.
- **files edited/created**: `packages/domain/src/export/{period.ts,_test/period.test.ts}`, `packages/server/src/services/cron/{cleanupTaskEventLog.ts,_test/cronServices.db.test.ts}`, `packages/server/src/http/_test/analytics.db.test.ts`, `packages/server/src/api/routers/export/_test/callStats.db.test.ts`, `apps/web/src/routes/dashboard/home/_components/export/_test/export.test.tsx`, `src/app/dashboard/_components/export/_test/AdminExportSection.test.tsx`, `src/app/api/cron/cleanupTaskEventLog/_test/cleanupTaskEventLog.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `selectableDays(new Date("2026-10-23T10:00:00Z")).first` è `"2024-09-24"`.
- **review_mode**: cli
- **complexity**: low

### T4: Contratto degli endpoint della pagina (AC3, AC14, AC18)
- **depends_on**: [G0]
- **location**: `packages/contract/src/analytics.ts`, `packages/contract/src/errors.ts`, `packages/server/src/http/analytics.ts`, `apps/web/src/api/errors.ts`, `apps/web/src/test/api.tsx`, `apps/web/src/test/home.ts`
- **description**: Nel gruppo `analytics`, con la tabella del commento aggiornata, gli endpoint di D6:
  - **query comune:** `{ from, to, compare }`, con giorni `YYYY-MM-DD` e `compare` tra `previous`, `last-year` e `none`;
  - **campi comuni della risposta:** `window: {from, to}` e `comparison: {from, to} | null`.

  | Endpoint | Risposta | Accesso |
  |---|---|---|
  | `getFinancedSeries` | `days` e `comparisonDays`: `{ day, practices, amount }` per ogni giorno con pratiche | tutti |
  | `getBranchTotals` | `rows: { branch: string \| null, practices, amount }` sulla finestra; più `comparisonTotal`, per la variazione | `AdminOnly` |
  | `getCallsByOperator` | `rows: { operatorId, name, surname, calls, answered, noAnswer, appointments }` sulla finestra; `comparisonTotals: { calls, answered, appointments } \| null` | `AdminOnly` |
  | `getMyCallSeries` | `days` e `comparisonDays`: `{ day, calls, answered, noAnswer, appointments }` per ogni giorno con chiamate | tutti |

  L'errore nuovo è `InvalidWindow` (400), con il suo testo in `describeApiError`. Il contratto importa solo `effect` (H5): i letterali si riscrivono qui, come `TimeFrame`.

  In Effect 4 `HttpApiBuilder.group` non compila finché ogni endpoint del gruppo non ha un handler. Per questo T4 aggiunge anche:
  - in `packages/server/src/http/analytics.ts` un handler provvisorio per ognuno dei quattro endpoint (`Effect.die("not implemented")`), che T5, T6 e T7 sostituiscono; nessuno resta nella PR;
  - gli endpoint nuovi, `unserved`, in `unservedGroups` di `apps/web/src/test/api.tsx` e nel gruppo `analytics` di `apps/web/src/test/home.ts`.
- **validation**: `tsc --noEmit` della root, `pnpm web:lint` e `pnpm web:build` verdi; un test del contratto rifiuta `compare=foo` e un `from` non `YYYY-MM-DD`, se il pacchetto ha già test di schema (altrimenti lo fa T5 via HTTP).
- **status**: Done
- **log**: 2026-10-30: RED del supervisore (`analisiQuery.test.ts`: `compare=foo` e giorni non `YYYY-MM-DD` rifiutati), worker haiku; review passata. `pnpm web:lint`, `web:build`, `web:test` verdi.
- **files edited/created**: `packages/contract/src/{analytics,errors}.ts`, `packages/server/src/http/analytics.ts` (handler provvisori), `packages/server/src/http/_test/analisiQuery.test.ts`, `apps/web/src/api/errors.ts`, `apps/web/src/test/{api.tsx,home.ts}`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Lo schema della query di `getFinancedSeries` rifiuta `compare: "foo"`.
- **review_mode**: cli
- **complexity**: low

### T5: Finanziato per giorno (AC5, AC6, AC10, AC14)
- **depends_on**: [T1, T4]
- **location**: `packages/server/src/services/analytics/series.ts` (nuovo), `packages/server/src/services/analytics/range.ts` (nuovo, per non confonderlo con `windows.ts` della home: valida con `validateWindow` al `Clock` del server, accorcia `to` di un giorno come in D7 e calcola `comparisonOf`), `packages/server/src/http/analytics.ts`, `packages/server/src/http/_test/analisi.db.test.ts` (nuovo)
- **description**:
  - `financedSeries({ window, compare, actor })`: somma e numero delle pratiche finanziate per giorno di Roma di `dataLiquidazione`, nella finestra e nel confronto (D4, D9).
  - Una finestra non valida è `InvalidWindow` (D7).
  - L'handler `getFinancedSeries` adatta il servizio, con `unexpectedAs500` in fondo.
- **validation**: test HTTP sul database di test, con `TestClock` al 30/10/2026:
  - ADMIN: conta anche una pratica senza clienti e una con un cliente senza operatore (AC5);
  - OPERATORE: conta solo i clienti assegnati a lui, e una pratica con due suoi clienti una volta (AC6);
  - una pratica liquidata il 14/10 alle 23:30 UTC sta nel giorno 15/10 (A1);
  - stati non finanziati esclusi;
  - `comparison` è quella di AC10;
  - `to` domani diventa oggi in `window` (D7); `to` dopodomani, 367 giorni o `from > to` danno 400 `InvalidWindow`;
  - senza sessione 401.
- **status**: Done
- **log**: 2026-10-30: RED del supervisore (pratica senza clienti nei `days` dell'admin, confronto 1–30 set), worker sonnet; review passata, 53 test verdi. `range.ts` (`analysisRange`, `instantsOf`) valida al `Clock`, accorcia `to` di domani (D7) e calcola il confronto; `series.ts` raggruppa per giorno di Roma con `to_char(... AT TIME ZONE 'Europe/Rome')`; l'operatore con un `exists` sui suoi clienti. `FINANCED_STATES` di `financed.ts` ora è esportato.
- **files edited/created**: `packages/server/src/services/analytics/{range,series}.ts`, `packages/server/src/services/analytics/financed.ts` (export), `packages/server/src/http/analytics.ts`, `packages/server/src/http/_test/analisi.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `GET /api/v1/analytics/financed-series?from=2026-10-01&to=2026-10-30&compare=previous` da ADMIN restituisce in `days` il giorno di una pratica senza clienti, e `comparison` 2026-09-01 – 2026-09-30.
- **review_mode**: cli
- **complexity**: medium

### T6: Totali per sede (AC4, AC5)
- **depends_on**: [T5]
- **location**: `packages/server/src/services/analytics/series.ts`, `packages/server/src/http/analytics.ts`, `packages/server/src/http/_test/analisi.db.test.ts`
- **description**: `branchTotals({ window, compare })`:
  - somma e pratiche per `desPuntoVendita` nella finestra, `null` compreso, su tutte le pratiche finanziate;
  - più il totale del confronto.

  L'handler `getBranchTotals` è `AdminOnly`.
- **validation**:
  - la somma delle righe è uguale alla somma dei `days` di `getFinancedSeries` dell'ADMIN, nella stessa finestra (AC5);
  - la riga `null` per le pratiche senza sede;
  - un OPERATORE riceve 403 `NotAdmin`.
- **status**: Done
- **log**: 2026-10-30: RED del supervisore (somma per sede = somma della serie dell'admin, riga `null` senza sede), worker haiku; review passata, 11 test di `analisi.db.test.ts` verdi. `financedBetween` è il predicato comune a serie e sedi; righe per finanziato decrescente.
- **files edited/created**: `packages/server/src/services/analytics/series.ts`, `packages/server/src/http/analytics.ts`, `packages/server/src/http/_test/analisi.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Con tre pratiche in due sedi e una senza sede, la somma di `rows[].amount` di `branch-totals` è uguale alla somma di `days[].amount` di `financed-series` per la stessa finestra.
- **review_mode**: cli
- **complexity**: low

### T7: Chiamate per operatore e chiamate dell'operatore (AC12, AC16, AC18)
- **depends_on**: [T6, T3]
- **location**: `packages/server/src/services/analytics/calls.ts` (nuovo), `packages/server/src/services/export/callStats.ts` (la condizione «è una chiamata» diventa una funzione condivisa), `packages/server/src/http/analytics.ts`, `packages/server/src/http/_test/analisi.db.test.ts`, `packages/server/src/services/analytics/_test/calls.perf.pg.test.ts` (nuovo)
- **description**:
  - `callsByOperator({ window, compare })`: `callStats` sui limiti di Roma della finestra, più i totali del confronto.
  - `myCallSeries({ window, compare, actor })`: le stesse chiamate di `actor.operatorId`, raggruppate per giorno di Roma di `created_at`.
  - Handler: `getCallsByOperator` è `AdminOnly`; `getMyCallSeries` è per tutti, con l'operatore preso da `CurrentUser` (D8).
  - `callStats` dell'export continua a dare gli stessi numeri: i suoi test restano verdi senza modifiche.
- **validation**:
  - `callsByOperator` ordina per chiamate e somma come `callStats` sullo stesso periodo;
  - `myCallSeries` di un OPERATORE non contiene le chiamate di un altro;
  - un OPERATORE su `calls-by-operator` riceve 403;
  - una chiamata alle 23:30 UTC del 14/10 sta nel 15/10;
  - prova di carico con `PERF=1 pnpm test:pg` (la CI non la lancia): `calls-by-operator` e `my-call-series` su «Gli ultimi 12 mesi» con «Stesso periodo, anno prima» e 25 mesi di registro restano sotto il limite di `callStats.perf.pg.test.ts`. La mediana va nel log del task. Se lo superano, si applica D15.
- **status**: Done
- **log**: 2026-10-30: RED del supervisore (un OPERATORE riceve `NotAdmin` su `calls-by-operator` e in `my-call-series` ha solo i suoi giorni), worker sonnet; review passata, 16 test di `analisi.db.test.ts` e quelli dell'export verdi senza modifiche. «È una chiamata» è ora `isCallIn` di `callStats.ts`, condiviso. Prova di carico (`PERF=1 pnpm test:pg packages/server/src/services/analytics`, Postgres locale in Docker, 100.000 righe su 760 giorni e 30 operatori, «Gli ultimi 12 mesi» contro l'anno prima): mediana 12,1 ms per `calls-by-operator`, 9,3 ms per `my-call-series`, sotto i 500 ms. D15: nessun indice, nessuna migrazione.
- **files edited/created**: `packages/server/src/services/analytics/calls.ts`, `packages/server/src/services/analytics/_test/calls.perf.pg.test.ts`, `packages/server/src/services/export/callStats.ts`, `packages/server/src/http/analytics.ts`, `packages/server/src/http/_test/analisi.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `GET /api/v1/analytics/calls-by-operator?...` da OPERATORE risponde 403 `NotAdmin`, e `GET /api/v1/analytics/my-call-series?...` dallo stesso OPERATORE restituisce solo i suoi giorni.
- **review_mode**: cli
- **complexity**: medium

### T8: Pulizia del registro negli scheduler (AC16)
- **depends_on**: [T3]
- **location**: `apps/api/gcp/setup-staging.sh`, `brain/chore/migrazione-gcp.md`, `brain/chore/roadmap-nuovo-stack.md` (solo se elenca i job di R10)
- **description**:
  - Aggiunge `cleanup-task-event-log|17 1 * * *` ai job di Cloud Scheduler dello staging, in pausa come gli altri (D17).
  - In [[chore/migrazione-gcp]] mette il job nella lista dei cron di prod per la finestra di R10, con la conservazione di 25 mesi. Aggiunge una voce datata 2026-10-30 che dice che la pulizia ha ora uno scheduler, senza riscrivere la voce storica della riga 251.
  - Non lancia niente su GCP. Nelle note per Omar mette i due comandi per lo staging già esistente (`gcloud scheduler jobs create http mito-crm-staging-cleanup-task-event-log …` con gli stessi parametri degli altri job, poi `gcloud scheduler jobs pause …`), perché rilanciare `setup-staging.sh` fallirebbe sul service account.
- **validation**: `bash -n apps/api/gcp/setup-staging.sh`; il nome del job è nel registro `apps/api/src/cron/jobs.ts`; la voce nuova di [[chore/migrazione-gcp]] e i due comandi nelle note.
- **status**: Done
- **log**: 2026-10-30: worker haiku, nessun comando su GCP; review passata, `bash -n` verde. Il supervisore ha corretto due frasi: il commento dello script («stessi orari dei cron di GitHub») e la riga «Orari UTC invariati», perché nessun cron di GitHub lancia la pulizia. La roadmap non elenca i job di R10 e resta com'è. I due comandi per lo staging esistente sono nelle note.
- **files edited/created**: `apps/api/gcp/setup-staging.sh`, `brain/chore/migrazione-gcp.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: script e documenti, senza codice da testare.
- **review_mode**: cli
- **complexity**: low

### T9: Hook dei dati e falsi per i test (AC21, AC23, AC26)
- **depends_on**: [T4]
- **location**: `apps/web/src/api/analytics.ts`, `apps/web/src/api/queryClient.ts` (`toastErrors: "session"`), `apps/web/src/test/analisi.ts` (nuovo), `apps/web/src/api/_test/analisi.test.tsx` (nuovo)
- **description**:
  - Chiavi e hook `useFinancedSeries`, `useBranchTotals`, `useCallsByOperator`, `useMyCallSeries` e `useContactProgressNow` (lo stesso endpoint di oggi, con un'altra chiave), con `enabled` per gli hook solo admin.
  - Nessuno usa `routeErrorWhenEmpty`: tutti hanno `meta.toastErrors: "session"` e nessun `placeholderData` (D10).
  - Le chiavi di tutti contengono ruolo e id dell'operatore (D11).
  - `useRoleChangeGuard`: a un `NotAdmin` rilegge preferenze e utente e toglie dalla cache le query della pagina con la vecchia chiave (D11).
  - I falsi del backend in memoria per tutti i test della pagina (dati, vuoto, errore, `NotAdmin`).
- **validation**:
  - con `renderWithApi`, un hook che fallisce non porta alla pagina d'errore e non mostra toast;
  - cambiando finestra, `data` è `undefined` finché arriva la nuova;
  - un `NotAdmin` toglie le query della pagina con la vecchia chiave;
  - un `Unauthorized` mostra un solo toast «Sessione scaduta: accedi di nuovo»; un 500 nessun toast.
- **status**: Done
- **log**: 2026-10-30: RED del supervisore (un 500 resta nello stato dell'hook, senza errore della rotta né toast; `Unauthorized` dà un solo toast «Sessione scaduta: accedi di nuovo»), worker sonnet; review passata, 13 test di `src/api` verdi. Il toast della sessione si mostra una volta per `QueryClient` e si riarma al primo successo. `useRoleChangeGuard` rilegge `/me` e toglie le query con scope ADMIN al passaggio a `NotAdmin`.
- **files edited/created**: `apps/web/src/api/{analytics,queryClient}.ts`, `apps/web/src/test/analisi.ts`, `apps/web/src/api/_test/analisi.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Un componente di prova con `useFinancedSeries` su un backend che risponde 500 mostra lo stato d'errore dell'hook e non la pagina d'errore della rotta.
- **review_mode**: cli
- **complexity**: medium

### T10: Stato della pagina nell'indirizzo (AC9, AC13, AC14, AC15)
- **depends_on**: [T1]
- **location**: `apps/web/src/routes/dashboard/analisi/_lib/urlState.ts` (nuovo), `apps/web/src/routes/dashboard/analisi/_lib/_test/urlState.test.ts`
- **description**: `readState(search, today, role)` e `writeState(state)`:
  - **chiavi:** `chart`, `range`, `from`, `to`, `compare` e `group`, con i valori di AC14;
  - **valore non valido:** torna al valore iniziale, compreso un intervallo `custom` fuori da AC9;
  - **`compare` assente:** vale il confronto iniziale del periodo;
  - **`chart` non consentito al ruolo:** apre il primo grafico consentito;
  - **`group` non più ammesso:** torna `auto`.

  Più le transizioni pure:
  - `withPreset`, che tiene il confronto (AC9);
  - `withCustom`;
  - `withCompare`;
  - `withGroup`;
  - `widen`, che cambia solo le date (AC15).
- **validation**: un test per ogni regola; l'esempio di AC14 fa andata e ritorno identico.
- **status**: Done
- **log**: 2026-10-30: RED del supervisore (`urlState.test.ts`, 20 casi), worker haiku; review passata. `chartsFor` sta in `_lib/charts.ts`, che il piano non nominava. `withCustom` non valida la finestra: la pagina la passa già validata dal calendario (T17).
- **files edited/created**: `apps/web/src/routes/dashboard/analisi/_lib/{charts,urlState}.ts`, `_lib/_test/urlState.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `readState("?chart=branches&range=30d", "2026-10-30", "OPERATORE").chart` è `"financed"`.
- **review_mode**: cli
- **complexity**: low

### T11: Risultati dei grafici nel tempo (AC3, AC6, AC11, AC12, AC16, AC18, AC19, AC24)
- **depends_on**: [T2, T3, T4]
- **location**: `apps/web/src/routes/dashboard/analisi/_lib/results.ts` (nuovo: tipi comuni `ChartResult`, `Status`, `Kpi`, `Table`), `_lib/trends.ts` (nuovo), `_lib/_test/trends.test.ts`
- **description**: Funzioni pure dalla risposta di un endpoint e dallo stato della pagina a un `ChartResult`. Un `ChartResult` contiene:
  - lo stato: `ready`, `empty` con motivo e azione, o `kpiOnly` con motivo e azione (AC19);
  - il numero, con la variazione di AC12;
  - i punti del grafico;
  - la tabella, con le colonne e l'ordine di AC3;
  - le note.

  I grafici coperti:
  - **`financed` e `average`:** il medio senza pratiche è «—» e un vuoto nella linea (AC24); per l'OPERATORE c'è la nota «Numeri dei clienti assegnati a te» e lo stato vuoto «dei tuoi clienti» (AC6);
  - **`calls` e `appointments` dell'OPERATORE** (AC18), con:
    - la colonna «Chiamate confronto»;
    - il campione piccolo per intervallo;
    - il tasso «—» senza risposte;
    - le domande per lui;
    - la nota «Le tue chiamate»;
    - la nota «Dati delle chiamate completi dal …» da `callsCompleteSince` (AC16);
    - lo stato vuoto «Nessuna chiamata registrata in questa finestra» per una finestra che finisce prima di quel giorno.

  Le colonne di confronto sono «—» dove l'intervallo non si confronta (AC11). La variazione usa i totali interi dei due periodi (AC12).
- **validation**:
  - le note e i «—» di AC12 per confronto a zero, senza dati e senza pratiche;
  - «+3,2 punti» per un tasso;
  - 0% che è un valore;
  - «Un solo intervallo» con «Mostra 7 giorni»;
  - stato vuoto con «Allarga a 90 giorni» da 30 giorni;
  - per l'OPERATORE, un intervallo con 14 risposte ha «sì» in «Campione piccolo».
- **status**: Done
- **log**: 2026-10-30: RED del supervisore (`trends.test.ts`), worker sul modello del supervisore; review con una correzione del supervisore: il worker ricavava il tipo di confronto dalle date della risposta, ma su 12 mesi che attraversano un 29 febbraio «periodo precedente» (in giorni) e «anno prima» (in mesi) danno le stesse date e spostamenti diversi. Ora gli intervalli usano il `compare` della query, che sta nella sua chiave. Le note della variazione viaggiano in `kpi.delta.note`, non in `notes`: la pagina le mostra sotto il numero.
- **files edited/created**: `apps/web/src/routes/dashboard/analisi/_lib/{results,trends}.ts`, `_lib/_test/trends.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `averageResult` su una finestra con un intervallo senza pratiche dà `null` per quel punto e «—» nella cella «Finanziato medio (€)».
- **review_mode**: cli
- **complexity**: high

### T12: Risultati delle classifiche e della coda (AC3, AC4, AC7, AC12, AC16, AC19, AC25, AC41)
- **depends_on**: [T11, T3]
- **location**: `apps/web/src/routes/dashboard/analisi/_lib/rankings.ts` (nuovo), `_lib/_test/rankings.test.ts`
- **description**: `ChartResult` di:
  - **`branches`:**
    - tutte le sedi in tabella, ordinate per finanziato, con «Quota (%)»;
    - «Senza sede» per `null`;
    - nel grafico le prime 7 più «Altre» da 9 sedi in su (AC4);
    - «Una sola sede» come `kpiOnly`;
  - **`calls` dell'ADMIN:** ordine per chiamate; variazione sulle chiamate;
  - **`appointments` dell'ADMIN:** ordine per tasso, i campioni sotto 15 risposte in fondo e neutri, con la nota (AC25); variazione in punti;
  - **`progress`:** «Con esito», poi «Da chiamare»; badge «Adesso» (AC7).

  Per `calls` e `appointments` dell'ADMIN valgono anche le regole di AC16, come in T11:
  - la nota «Dati delle chiamate completi dal …» quando finestra o confronto iniziano prima di `callsCompleteSince`;
  - lo stato vuoto «Nessuna chiamata registrata in questa finestra» quando la finestra finisce prima.

  Ogni grafico ha il suo stato vuoto, con il motivo e l'azione di AC15 (AC19):
  - `branches` senza pratiche;
  - `calls` e `appointments` senza chiamate;
  - `progress` senza contatti.

  Il motivo è quello che la riga «Dati del grafico» e il toast di «Esporta tutto» riportano (AC31, AC32).

  Le colonne «(%)» hanno sempre un decimale (AC41).
- **validation**:
  - 8 sedi → 8 barre;
  - 9 sedi → 7 + «Altre», e la tabella con 9 righe;
  - un operatore con 14 risposte è ultimo e neutro;
  - «54,0%»;
  - la nota e lo stato vuoto di AC16 per l'ADMIN;
  - lo stato vuoto di ogni grafico.
- **status**: Done
- **log**: 2026-10-30: RED del supervisore (`rankings.test.ts`: 9 sedi → 7 + «Altre» e 9 righe, ordine e campioni piccoli, nota e stato vuoto di AC16, coda), worker sonnet; review passata, 33 test con quelli di T11. Le regole delle chiamate comuni ai due ruoli (nota dei dati completi, stato vuoto prima dei dati) stanno in `_lib/calls.ts`, usato anche da `trends.ts` senza cambiarne i test.
- **files edited/created**: `apps/web/src/routes/dashboard/analisi/_lib/{rankings,calls}.ts`, `_lib/results.ts` (helper esportati), `_lib/trends.ts`, `_lib/_test/rankings.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `branchesResult` con 9 sedi dà 8 barre, l'ultima «Altre», e 9 righe in tabella.
- **review_mode**: cli
- **complexity**: medium

### T13: Export dei grafici (AC7, AC27, AC28, AC29, AC30, AC32)
- **depends_on**: [T12, T10]
- **location**: `apps/web/src/routes/dashboard/analisi/_lib/export.ts` (nuovo), `_lib/_test/export.test.ts`
- **description**: Dalle righe della tabella di un `ChartResult` e dalla finestra arrivata:
  - **`exportHeader`:**
    - titolo, domanda, finestra, confronto e raggruppamento;
    - «Dati di»: «tutta la rete», o il nome dell'operatore (A3);
    - «Estratto il» e le note;
    - per `progress`, «Adesso» al posto di finestra, confronto e raggruppamento;
  - **`fileName`:**
    - `mito_<slug>_<da>_<a>.<ext>`, con gli slug di AC30;
    - per `progress`, `mito_contatti-con-esito_<oggi>.<ext>`;
    - per «Esporta tutto», `mito_analisi_<da>_<a>.xlsx`;
  - **`toCsv`:** `;`, virgola decimale e BOM (AC27);
  - **`toTsv`:** con le righe d'intestazione e la riga delle colonne (AC29);
  - **`toWorkbook`:** un foglio per grafico, con `xlsx` caricato con `import()` (D12, AC28, AC32);
  - **`exportAllSummary`:** quanti grafici hanno dati e quale manca, per il pulsante e per il toast.
- **validation**:
  - un CSV di `branches` inizia con BOM, ha `;` e «12.500,50»;
  - le righe del file sono quelle della tabella, nello stesso ordine;
  - i nomi degli esempi di AC7 e AC30;
  - il workbook letto da `xlsx` ha un foglio per grafico con dati.
- **status**: Done
- **log**: 2026-10-30: RED del supervisore (`export.test.ts`: nomi di AC7 e AC30, intestazione, BOM e `;`, TSV, workbook letto da `xlsx`, «Esporta tutto 5/6» con il toast), worker sonnet; review passata. Il supervisore ha aggiunto: un nome di sede o di operatore che comincia con `=`, `+`, `-` o `@` va nel CSV e nel TSV con un `'` davanti, così Excel non lo legge come formula (il dato viene dagli import). `xlsx` si carica con `import()` dentro `toWorkbook` e `writeWorkbook`.
- **files edited/created**: `apps/web/src/routes/dashboard/analisi/_lib/export.ts`, `_lib/_test/export.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `fileName("branches", {from: "2026-10-01", to: "2026-10-30"}, "csv")` è `"mito_finanziato-per-sede_2026-10-01_2026-10-30.csv"`.
- **review_mode**: cli
- **complexity**: medium

### T14: Barra laterale, rotta e master-detail (AC1, AC2, AC6, AC7, AC14, AC23, AC36, AC37, AC38, AC39, AC41)
- **depends_on**: [T9, T10, T11, T12]
- **location**: `apps/web/src/components/layout/DashboardLayout.tsx` e il suo test, `apps/web/src/router.tsx`, `apps/web/src/routes/dashboard/analisi/AnalisiPage.tsx` (nuovo), `analisi/_components/{IndicatorRail,IndicatorTab,ChartPanel,Header}.tsx` (nuovi), `analisi/_test/AnalisiPage.test.tsx` (nuovo)
- **description**:
  - **Barra laterale:** «Home» per `/dashboard` e «Analisi» con un'icona di grafico per `/dashboard/analisi`, per i due ruoli; il test della barra si aggiorna (AC1).
  - **Rotta:** `lazy` sotto `/dashboard`.
  - **La pagina:**
    - legge e scrive lo stato con T10 (`replace`, AC14);
    - lancia le query di T9 per la finestra;
    - costruisce i `ChartResult` con T11 e T12.
  - **La colonna degli indicatori** è un `tablist` «Indicatori» (AC36), con 6 schede per l'ADMIN e 5 per l'OPERATORE:
    - titolo, numero con unità, andamento in miniatura solo per i grafici nel tempo, badge di stato;
    - una sola scheda selezionata e nel giro del Tab;
    - ↑/↓ nella colonna da 1280 px, ←/→ nella striscia sotto i 1280 px, Home/End;
    - il pannello è chiamato con il titolo del grafico;
    - il cambio è annunciato in una regione `polite`;
    - le schede sono alte uguali, con o senza badge (AC41);
    - la scheda selezionata ha una barra interna di 2–3 px, o il bordo `ring`, con almeno 3:1 sul fondo vicino (AC37);
    - in colonna da 1280 px, larga 320 px; sotto, una striscia orizzontale sopra il grafico, con l'area del grafico di almeno 700 px a 1024–1279 px con la barra laterale aperta (AC38);
    - nella striscia la scheda selezionata si porta tutta in vista all'apertura e a ogni selezione, e i titoli stanno alla stessa altezza (AC39).
  - **L'intestazione** ha per ora periodo, confronto e «Esporta tutto» come segnaposto: i controlli arrivano in T17, «Esporta tutto» in T18. Va a capo invece di uscire di lato, da 280 px (AC33).
  - **All'apertura** la pagina scrive nell'indirizzo, con `replace`, tutto lo stato, anche i valori iniziali (AC14).
  - **Nel pannello:** titolo, domanda, nota di ambito (AC6), riga del numero con variazione.
  - **Il badge «Adesso»** apre il tooltip da un pulsante (AC7, AC41).
  - **Un solo `main`:** l'area del grafico è una `section` (AC41).
  - **Ruolo cambiato (AC23):** le schede non consentite spariscono e la scelta va alla prima consentita.
- **validation**: test della pagina con `renderWithApi`:
  - le schede per ruolo;
  - ↓ seleziona la scheda dopo e sposta il focus;
  - End va all'ultima;
  - l'indirizzo si aggiorna senza nuove voci nella cronologia;
  - `?chart=branches` da OPERATORE apre «Finanziato totale»;
  - un `NotAdmin` a pagina aperta toglie le schede solo admin senza riquadro d'errore e mostra i dati delle chiamate dell'operatore;
  - un solo `main`;
  - gate dei colori verde.
- **status**: Done (browser in T19)
- **log**: 2026-10-30: RED del supervisore (`AnalisiPage.test.tsx` con il helper `_test/page.tsx` su `UserPreferenceProvider` e `fakeMe`, così il ruolo segue `/me` come nell'app; `DashboardLayout.test.tsx` per AC1), worker sul modello del supervisore; review passata, 32 test verdi, `web:lint` e `web:build` verdi. `useAnalisi` tiene stato, query e `ChartView` per grafico; un `NotAdmin` vale come caricamento, non come errore (AC23). Verifica nel browser rimandata a T19: la porta 4000 di `api:dev` è occupata dal container di un altro progetto (`sevedemo-app-local`).
- **files edited/created**: `apps/web/src/components/layout/DashboardLayout.tsx` e il suo test, `apps/web/src/router.tsx`, `apps/web/src/routes/dashboard/analisi/AnalisiPage.tsx`, `_components/{useAnalisi.ts,Header,IndicatorRail,IndicatorTab,ChartPanel}.tsx`, `_test/{page.tsx,AnalisiPage.test.tsx,AnalisiPage.more.test.tsx}`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Da OPERATORE, `/dashboard/analisi` mostra un `tablist` «Indicatori» con 5 schede, senza «Finanziato per sede».
- **review_mode**: mixed
- **complexity**: high

### T15: Grafici (AC3, AC4, AC8, AC34, AC40, AC41)
- **depends_on**: [T14]
- **location**: `apps/web/src/routes/dashboard/analisi/_components/charts/{TrendChart,BranchChart,ProgressChart,CallsChart,AppointmentChart,OperatorCallsChart}.tsx` (nuovi), `ChartPanel.tsx`, `_test/charts.test.tsx`
- **description**: Prima conferma D13 sul recharts installato. Poi scrive le forme di AC3 e AC18 su `ChartContainer`:
  - **financed:** Area con il confronto tratteggiato;
  - **average:** Line · Dots con i vuoti;
  - **branches:** Bar orizzontale con le etichette e «Altre»;
  - **progress:** Radial con il testo;
  - **calls:** Bar orizzontale impilata con la legenda; per l'OPERATORE, barre impilate per intervallo con la linea tratteggiata delle chiamate del confronto;
  - **appointments:** Bar orizzontale con le etichette e le barre neutre dei campioni piccoli; per l'OPERATORE, una linea con il confronto tratteggiato e il punto neutro.

  Tutte le forme rispettano queste regole:
  - colori solo dai token, anche i punti, i punti attivi e la traccia del radiale (AC41);
  - nessuna animazione (AC8);
  - la superficie non è un tab stop (AC34);
  - i segmenti impilati separati da 2 px del colore della card (AC40);
  - i nomi tagliati con i puntini a 150 px per le sedi e 130 px per gli operatori, interi nel tooltip (AC3);
  - altezze del prototipo: 320 px; le classifiche, con al massimo 8 barre, stanno nella stessa altezza (AC4, decisione del 2026-10-30).
- **validation**:
  - test dei grafici letti dall'SVG, come quelli della home: 8 barre con «Altre»;
  - nessun elemento con `tabindex` dentro la superficie;
  - nessun `fill` o `stroke` letterale fuori dai token (gate dei colori);
  - nel browser, a 1440 px, ogni grafico nei due ruoli.
- **status**: Done (browser in T19)
- **log**: 2026-10-30: D13 verificato sul recharts 3.10.1 installato prima del RED: con `accessibilityLayer={false}` la superficie non ha `tabindex`/`role="application"` (`container/RootSurface.js`). RED del supervisore (`charts.test.tsx`), worker sul modello del supervisore. Due correzioni del supervisore: (1) il test cercava qualsiasi `[tabindex]`, ma recharts mette `tabindex="-1"` sui suoi layer (`zIndex/ZIndexPortal.js`) e sul tooltip, che non sono punti di sosta: il selettore ora è `[tabindex]:not([tabindex="-1"])`; (2) il worker aveva riscritto `ChartContainer` di `components/ui/chart.tsx` perché in jsdom il grafico non si disegnava: modifica annullata, e il helper `_test/page.tsx` usa lo stesso `ResizeObserver` finto dei test dei grafici della home. 88 test verdi, home compresa. Separatore di AC40: tratto di 2 px nel colore `card` su ogni segmento impilato.
- **files edited/created**: `apps/web/src/routes/dashboard/analisi/_components/charts/{parts,DrawnChart,TrendChart,BranchChart,ProgressChart,CallsChart,AppointmentChart,OperatorCallsChart}.tsx`, `_components/ChartPanel.tsx`, `_test/{charts.test.tsx,page.tsx}`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Con «Finanziato per sede» pronto, dentro la superficie del grafico nessun elemento ha `tabindex` né `role="application"`.
- **review_mode**: mixed
- **complexity**: high

### T16: Stati di ogni grafico (AC15, AC19, AC20, AC21, AC22, AC24, AC26, AC42)
- **depends_on**: [T15]
- **location**: `apps/web/src/routes/dashboard/analisi/_components/{ChartPanel,ChartState,IndicatorTab}.tsx`, `_test/states.test.tsx` (nuovo)
- **description**:
  - **Caricamento:** scheletro alto quanto il grafico e la riga del numero, così il passaggio a «pronto» non sposta nulla (AC19).
  - **Vuoto:** titolo, motivo e l'azione di AC15.
  - **Solo numero:** numero e motivo, con l'azione.
  - **Errore:** «Non è stato possibile caricare questo grafico. Gli altri sono aggiornati.» con «Riprova». Se fallisce ancora il riquadro resta; gli altri grafici restano utilizzabili (AC20, AC21).
  - **Offline:** il messaggio di AC22, letto da `navigator.onLine` e dagli eventi `online`/`offline`; nessuno scheletro resta senza testo.
  - **Mai la finestra vecchia** sotto l'etichetta nuova (AC26).
  - **Focus:** dopo «Riprova» o un'azione di stato vuoto va sul titolo del grafico (AC42).
  - **Badge della scheda:** «Vuoto», «Errore», «Solo numero» o «Adesso» (AC2).
  - **Error boundary per pannello:** un'eccezione mentre il grafico si disegna mostra il riquadro d'errore di quel grafico, non la pagina d'errore della rotta (AC21, D10).
  - **Sessione scaduta:** nessun riquadro d'errore; il pannello mostra «Sessione scaduta: accedi di nuovo», e il toast è uno solo (AC23, D10).
- **validation**:
  - con i falsi di T9: un grafico in 500 mostra il riquadro, e le altre schede funzionano;
  - «Riprova» che fallisce ancora lascia il riquadro;
  - «Allarga a 90 giorni» cambia solo `range`, e il focus va sul titolo;
  - con un backend lento la finestra nuova mostra lo scheletro, non i numeri vecchi;
  - l'evento `offline` mostra il messaggio;
  - un grafico che lancia mentre si disegna resta nel suo riquadro;
  - con tutti gli endpoint in 401, nessun riquadro d'errore e un solo toast.
- **status**: Done (browser in T19)
- **log**: 2026-10-30: RED del supervisore (`states.test.tsx`: errore nel riquadro con le altre schede usabili, «Riprova» che fallisce ancora col focus sul titolo, badge «Errore», «Allarga a 90 giorni» che cambia solo `range` e porta il focus sul titolo, scheletro e mai i numeri vecchi, offline), worker sonnet; review passata, 113 test verdi; il supervisore ha tolto due avvisi di lint dai suoi test. Scelte del worker accettate: il testo offline compare una volta, come `role="status"` sotto l'intestazione, e lo scheletro offline smette di pulsare e vi rimanda; le classifiche caricano con uno scheletro di 320 px, perché la loro altezza dipende dalle righe; `Unauthorized` è uno stato `session` del pannello, senza «Riprova».
- **files edited/created**: `apps/web/src/routes/dashboard/analisi/_components/{ChartState,PanelBoundary}.tsx`, `_components/useOnline.ts`, `_components/{ChartPanel,IndicatorTab}.tsx`, `_components/useAnalisi.ts`, `AnalisiPage.tsx`, `_lib/trends.ts` (domande esportate), `_test/{states.test.tsx,states.more.test.tsx,page.tsx}`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Con `getBranchTotals` in 500, il pannello di «Finanziato per sede» mostra «Non è stato possibile caricare questo grafico. Gli altri sono aggiornati.» e la scheda «Finanziato totale» resta selezionabile con i suoi numeri.
- **review_mode**: mixed
- **complexity**: medium

### T17: Controlli della finestra (AC9, AC10, AC13, AC41, AC42)
- **depends_on**: [T16]
- **location**: `apps/web/src/routes/dashboard/analisi/_components/{Header,PeriodSelect,RangePicker,CompareSelect,GroupSelect}.tsx`, `_test/window.test.tsx` (nuovo)
- **description**:
  - **Menu dei periodi:** con «Date personalizzate…», che apre il calendario.
  - **Calendario a intervallo:**
    - da 1 a 366 giorni, nessun giorno dopo oggi;
    - la riga «1 – 30 set 2026 · 30 giorni» annunciata;
    - «Applica» chiude, applica e rimette il focus sul pulsante;
    - Esc chiude senza cambiare;
    - il pulsante si chiama «Date: 1 – 30 ott 2026, scegli dal calendario»;
    - resta ad almeno 8 px dal bordo a 768–1069 px.
  - **Confronto:** tre voci.
  - **«Raggruppa per»:** solo nei grafici nel tempo, con le voci non ammesse disabilitate (AC13).
  - **Riassunto della finestra** sopra la colonna degli indicatori.
- **validation**:
  - test: «L'anno in corso» porta il confronto ad «anno prima» solo all'apertura senza `compare`, e dopo il confronto scelto resta;
  - il calendario applica 1–30 set e tutta la pagina segue;
  - un intervallo di 366 giorni si applica, uno di 367 no (verificando prima come si comporta `max` di react-day-picker 9);
  - Esc non cambia l'indirizzo;
  - «per mese» è disabilitato su 30 giorni;
  - nel browser, il margine del calendario a 768 px.
- **status**: Done (browser in T19)
- **log**: 2026-10-30: RED del supervisore (`window.test.tsx`: nome del pulsante del calendario, Esc che non cambia l'indirizzo e rimette il focus, «Raggruppa per» solo nei grafici nel tempo), worker sonnet; due giri di review. Primo giro: il worker aveva smontato il `Popover` per aggirare il test di AC23 instabile; il supervisore ha reso il test deterministico e il worker è tornato al `Popover` del design system. 125 test verdi in tre esecuzioni. In react-day-picker 9 `max` conta le notti e, se superato, riparte dal giorno cliccato: non si usa; i giorni oltre `from ± 365` sono disabilitati e la bozza passa da `validateWindow`, così 366 giorni si applicano e 367 no.
- **files edited/created**: `apps/web/src/routes/dashboard/analisi/_components/{PeriodSelect,RangePicker,CompareSelect,GroupSelect,WindowSummary,Header,ChartPanel,IndicatorRail}.tsx`, `AnalisiPage.tsx`, `_test/{window.more.test.tsx,AnalisiPage.test.tsx}`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Con il calendario aperto, Esc lo chiude e l'indirizzo non cambia.
- **review_mode**: mixed
- **complexity**: medium

### T18: «Dati del grafico» ed export (AC26, AC27–AC32, AC33, AC34, AC35, AC38, AC41)
- **depends_on**: [T17, T13]
- **location**: `apps/web/src/routes/dashboard/analisi/_components/{DataSection,DataTable,ExportButtons,ExportAllButton}.tsx`, `_test/export.test.tsx` (nuovo)
- **description**: Sotto il grafico, la sezione «Dati del grafico»:
  - **riga del titolo:** numero di righe e nome del file, che va a capo solo dopo `_` (AC38); pulsanti CSV, Excel e Copia;
  - **tabella:** una regione chiamata «Dati del grafico», raggiungibile con Tab e con l'anello di focus; alta al massimo 480 px, scorre sui due assi, con l'intestazione fissa (AC35);
  - un solo bordo, nessuno sfondo al passaggio del mouse (AC41);
  - **grafico vuoto o in errore:** nessuna tabella, il motivo nella riga del titolo e i pulsanti disabilitati (AC31);
  - **in caricamento:** «Il grafico sta caricando.» (AC26);
  - **larghezze delle colonne:** da 1280 px nessuna tabella scorre di lato, compresa quella a sette colonne delle chiamate dell'OPERATORE (AC38). Sotto, scorre la tabella e non la pagina (AC33).

  Gli export usano T13. «Copia» mostra il toast «Tabella copiata» o «Copia non riuscita» (AC29). «Esporta tutto 5/6» è disabilitato mentre un grafico carica, con i toast di AC32.
- **validation**:
  - test: «Copia» scrive negli appunti il TSV con le intestazioni e mostra il toast;
  - il rifiuto degli appunti mostra «Copia non riuscita»;
  - CSV crea un `Blob` con il nome atteso;
  - «Esporta tutto» con un grafico vuoto mostra il toast che lo nomina;
  - un download che non parte mostra «Excel non scaricato. Riprova.»;
  - la tabella è una `region` con quel nome e `tabindex=0`;
  - da 768 px, in ogni grafico pronto, Tab passa dall'ultimo controllo sopra il grafico («Raggruppa per», o il badge «Adesso») direttamente a «CSV» (AC34).
- **status**: Done (browser in T19)
- **log**: 2026-10-30: RED del supervisore (`export.test.tsx`: «Copia» con le intestazioni e il toast, la regione «Dati del grafico» con `tabindex=0` e 10 righe), worker sonnet; review passata. Il supervisore ha corretto un test di T16 (`states.more.test.tsx`) che vietava ogni pulsante in un grafico «solo numero», contro AC27: ora vieta solo l'azione dello stato. Gate del job Web verdi: 1.638 test, lint senza errori, build; `xlsx` sta nel suo chunk, caricato al clic (D12). La finestra del file viene dalla risposta (AC30).
- **files edited/created**: `apps/web/src/routes/dashboard/analisi/_components/{DataSection,DataTable,ExportButtons,ExportAllButton}.tsx`, `_components/exportContext.ts`, `_components/{useAnalisi.ts,ChartPanel,Header}.tsx`, `AnalisiPage.tsx`, `_test/{export.test.tsx,export.more.test.tsx,states.more.test.tsx}`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Con «Finanziato per sede» pronto, «Copia» mette negli appunti un testo che inizia con le righe d'intestazione del file e contiene «Sede\tPratiche\tFinanziato (€)\tQuota (%)», poi mostra «Tabella copiata».
- **review_mode**: mixed
- **complexity**: medium

### T19: Verifica nel browser, pulizia del prototipo e gate pieno (AC33, AC34, AC35, AC37, AC38, AC39, AC40, AC41, AC42)
- **depends_on**: [T18, T7, T8]
- **location**: tutta la pagina; `apps/web/src/prototypes/analisi/` (cancellata), `apps/web/src/router.tsx` (rotta del prototipo tolta), `apps/web/prototypes/scenario.css` (cancellato), `.claude/launch.json` (tolta `web-prototype`), `brain/chore/migrazione-frontend-react.md` (riga della pagina), `brain/specs/crm/pagina-analisi/IMPLEMENTATION-NOTES.md`
- **description**:
  - **Su `mito_local` con il seed, nei due ruoli, con `agent-browser` a 280, 768, 1024, 1280, 1440 e 1920 px:**
    - nessuno scorrimento di lato (AC33);
    - Tab salta il grafico (AC34);
    - la tabella scorre con l'intestazione fissa (AC35);
    - la scheda selezionata ha la barra interna o il bordo `ring` con almeno 3:1 (AC37);
    - colonna da 1280 px e striscia sotto (AC38, AC39);
    - a 1024–1279 px con la barra laterale aperta, l'area del grafico è di almeno 700 px;
    - al 125% del testo, nulla esce dall'area del grafico da 1024 px;
    - da 1280 px nessuna tabella scorre di lato, compresa quella a sette colonne dell'OPERATORE;
    - nella striscia la scheda scelta è tutta visibile e i titoli sono allineati (±1 px);
    - separazione delle barre impilate (AC40);
    - le correzioni di AC41;
    - il percorso di AC42 da tastiera.
  - **Download:** Excel ed «Esporta tutto» scaricano davvero un file che si apre.
  - **Cancella il prototipo** (D18) e aggiunge la pagina alla tabella di [[chore/migrazione-frontend-react]].
  - **Gate pieno:** Lint, Test, Build e job Web.
  - **Per Omar, nelle note:** le prove a mano dei Constraints della spec (Safari 18; VoiceOver + Safari; NVDA + Firefox).
- **validation**: schermate e misure nelle note; gate verdi; `git grep prototypes/analisi -- apps .claude` vuoto.
- **status**: Done
- **log**: 2026-10-30, supervisore. Browser (Chromium del pannello di Claude) su `mito_local` già popolato (13.585 pratiche, 14.516 righe del registro): backend con `PORT=4100` perché la 4000 è di un altro progetto, Vite su 5173 con `WEB_BACKEND_URL`, accesso rapido del seed come ADMIN e come OPERATORE (sessione locale rimessa come admin alla fine). Misure nelle note. Prototipo cancellato (cartella, `scenario.css`, rotta di sviluppo, `web-prototype` di `.claude/launch.json`); `git grep prototypes/analisi -- apps .claude` vuoto. Pagina aggiunta alla tabella delle rotte di [[chore/migrazione-frontend-react]]. Gate: `tsc --noEmit` 0; test della root 4.827 verdi e 120 saltati; `pnpm build` con i segnaposto della CI verde; `api:build` e `api:smoke` verdi; `web:test` 1.638, `web:lint` 0 errori, `web:build` verde. `next lint` qui non parte perché il worktree sta dentro il repo e ESLint trova due `.eslintrc.cjs` con `prettier`: al suo posto `eslint --no-eslintrc -c .eslintrc.cjs src`, verde; in CI il problema non c'è.
- **files edited/created**: `apps/web/src/prototypes/analisi/` e `apps/web/prototypes/` (cancellati), `apps/web/src/router.tsx`, `.claude/launch.json`, `brain/chore/migrazione-frontend-react.md`, `IMPLEMENTATION-NOTES.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: verifica e pulizia. Ogni difetto trovato torna al task che possiede il componente, con un test rosso.
- **review_mode**: browser
- **complexity**: medium

## 10. Wave di esecuzione

| Wave | Task | Note |
|---|---|---|
| 0 | G0 | |
| 1 | T1, T4 | Pacchetti diversi. |
| 2 | T2, T3, T5, T9, T10 | T3 dopo T1, perché toccano `period.ts`. T2 e T3 stanno nello stesso pacchetto ma in file diversi. |
| 3 | T6, T8, T11 | T6 sul file degli handler dopo T5; T8 su T3. |
| 4 | T7, T12 | |
| 5 | T13, T14 | T14 aspetta T11 e T12. |
| 6 | T15 | |
| 7 | T16 | |
| 8 | T17 | |
| 9 | T18 | |
| 10 | T19 | Poi `adversarial-review` di `implement-spec` (`review.mode: total`). |

Il percorso critico è T1 → T2 → T11 → T12 → T14 → T15 → T16 → T17 → T18 → T19. I task della pagina sono in serie perché toccano `ChartPanel` e `AnalisiPage`.

## 11. Strategia di test

- **Dominio (T1, T2, T3):** test unitari sui valori, uno per esempio della spec. Le regole di AC9–AC13 vivono solo lì.
- **Backend (T5–T7):** test HTTP `.db.test.ts` con il backend in processo e il database di test, `TestClock.setTime` al 30/10/2026 a Roma; più una prova di carico `.perf.pg.test.ts` (T7).
- **Librerie della pagina (T10–T13):** test unitari sulle funzioni pure.
- **Pagina (T14–T18):** test con `renderWithApi` e i falsi di `src/test/analisi.ts`, dall'interfaccia pubblica: ruoli, tastiera, testi, appunti, `Blob`. Niente mock di moduli o di `fetch`.
- **Browser (T14–T19):** `agent-browser` su `mito_local`, a tutte le larghezze di AC33–AC39, nei due ruoli.
- **Test che cambiano di proposito:**
  - i sei file dei 3 mesi elencati in T3 (3 → 25 mesi, AC17): cambiano i valori di confine, non il senso delle asserzioni;
  - `DashboardLayout.test.tsx` (AC1);
  - `apps/web/src/test/api.tsx` e `home.ts` aggiungono gli endpoint nuovi (T4), senza asserzioni nuove.

  Nessun altro test esistente cambia asserzioni.

## 12. Gate di rilascio

- CI verde su Lint, Test, Build e Web.
- T19 fatto, con le misure nelle note.
- `adversarial-review` SHIP.
- Le prove a mano dei Constraints restano a Omar prima della finestra di prod.
- Il job di pulizia si accende in prod solo nella finestra di R10 (D17).

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Lo spostamento di AC11 ha casi limite (fine mese, bisestili) | T2 ha un test per ogni esempio della spec; la logica vive solo nel dominio. |
| Le query delle chiamate su 25 mesi sono lente | La prova di carico di T7; l'indice di D15 in un task aggiunto, solo con una misura. |
| `accessibilityLayer` di recharts non si spegne come atteso | T15 lo verifica prima di scrivere i grafici; altrimenti `tabIndex=-1` sulla superficie, con un test. |
| Un `NotAdmin` scambiato per un errore | D11 e il test di T14. |
| Fuso orario della macchina nei test | Tutto su giorni-stringa di Roma (D3); i test del dominio stanno in `timeZoneTests` e girano in UTC e in Europe/Rome; i test fissano «oggi». |
| `xlsx` nel bundle iniziale | `import()` al clic (D12); T19 controlla che il chunk iniziale non lo contenga. |
| Allungare la conservazione cambia anche l'export della home | È voluto (AC17); lo provano T3 e i test dell'export. |

## 14. Domande aperte

Nessuna.

## 15. Correzioni dopo la verifica del piano (2026-10-30)

L'`adversarial-verifier` ha dato DO NOT SHIP. Correzioni:

- **T4:** in Effect 4 un gruppo con endpoint senza handler non compila. T4 aggiunge handler provvisori e gli endpoint `unserved` in `src/test/api.tsx` e `src/test/home.ts`.
- **T3:**
  - elenca i sei file di test che fissano i 3 mesi;
  - tiene il confine al millisecondo della pulizia;
  - §11 non dice più che cambiano solo due test.
- **T1 e T3** toccano entrambi `period.ts`: T3 ora dipende da T1. **T11** dipende da T3, per `callsCompleteSince`.
- **T12** costruisce anche per l'ADMIN la nota e lo stato vuoto di AC16, e lo stato vuoto di ogni classifica.
- **T15** ha un `tdd_target` che si chiude da solo: nessun tab stop nella superficie. Il percorso Tab → «CSV» passa a T18, dove «CSV» esiste.
- **D10:** la sessione scaduta passa dal toast della sessione e non da sei riquadri d'errore (`toastErrors: "session"`). Ogni pannello ha un error boundary suo (T9, T16).
- **D11:**
  - le chiavi di tutte le query della pagina portano ruolo e operatore, così nessun numero della vista ADMIN resta dopo un cambio di ruolo;
  - le fonti del ruolo sono quelle vere: `useUserPreferenceContext` e `useCurrentUser`.
- **D3 e T2:** lo spostamento usa `shiftMonths`, che non si ferma a fine mese, e non `addMonths`. I test del dominio entrano in `timeZoneTests`.
- **D7:** un `to` di un giorno avanti si accorcia a oggi, per l'orologio del browser avanti dopo mezzanotte.
- **AC33 e AC38:** li costruiscono T14 (l'intestazione va a capo) e T18 (larghezze delle colonne), e non solo T19 li verifica.
- **T8:** due comandi `gcloud` per Omar invece di rilanciare lo script; una voce datata nuova in [[chore/migrazione-gcp]].
- **T7 e D15:** il comando della prova di carico, la mediana nel log, e le regole delle migrazioni di CLAUDE.md.
- **T17:** prova 366 giorni accettati e 367 rifiutati; l'indirizzo «non cambia» con Esc, e T14 scrive tutto lo stato all'apertura.
- **T19:** il controllo con `git grep` è limitato ad `apps` e `.claude`.
- **Nome:** il modulo nuovo del server è `range.ts`, per non confonderlo con `windows.ts`.

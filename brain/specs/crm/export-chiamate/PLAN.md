---
domain: crm
type: plan
links:
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[chore/migrazione-gcp]]"
created: 2026-10-23
updated: 2026-10-23
---

# Plan: Export chiamate per operatore, solo admin

**Spec:** [[specs/crm/export-chiamate/SPEC]]
**Status:** Planned (gate `adversarial-verifier`: DO NOT SHIP al primo giro, 2 MAJOR corretti; SHIP al secondo)
**Generato:** 2026-10-23 con `create-plan`: grill → swarm-plan → tdd → adversarial-verifier. Nessun codice scritto.

---

## 1. Situazione iniziale

- **Stato `non risponde`.** È in due PR draft, non ancora su `dev`:
  - #57 (`claude/project-thread-kbx53m`): valore dell'enum `task_status` e migrazione `ADD VALUE`;
  - #61 (`claude/export-non-risponde-in-coda`, impilata su #57): stato aperto (`callStates`), priorità 100, scenario P13 del seed locale.
  - Manca la regola di AC1b: oggi `isAllowedChange` (`packages/domain/src/contact/status.ts`) permette `non risponde` → `chiamare`; vieta solo `followup` → `chiamare` e ogni passaggio a `followup`.
- **Export di oggi** (da togliere, AC15):
  - `src/app/dashboard/_components/ExportDialog.tsx`, montato in `src/app/dashboard/page.tsx` per tutti;
  - web worker `src/lib/workers/export/*` e contesto `src/app/_context/ExportWorker.tsx`;
  - rotte `src/app/api/export/[export]/*` (molte commentate), `fetchCall` → `closedCalls` (`packages/server/src/services/export/calls.ts`, Effect);
  - procedura `export.getTasksmessages` (`packages/server/src/api/routers/export/GET/index.ts`), upload nello storage (`saveExport`, `createExportUploadUrl`), cron `delete-export`.
- **Dati.** `task_event_log` (`packages/db/src/schema/taskEventLog.ts`): `action`, `source` (`detail`, `list`, `bulk`, `self_assign`, `cron_alert`), `from_state`, `to_state`, `actor_operator_id`, `created_at` (indice su `created_at`). La pulizia notturna cancella le righe più vecchie di 3 mesi (`cleanupTaskEventLog.ts`, `RETENTION_MONTHS = 3`).
- **Permessi.** `adminProcedure` = `operatorProcedure` + `enforceIsAdmin` (`packages/server/src/api/trpc.ts`): senza sessione `UNAUTHORIZED`; chi non ha la riga operatore riceve `BAD_REQUEST` **prima** del controllo admin, quindi un non admin senza riga operatore non riceve `FORBIDDEN` (contro AC7).
- **Calendario.** `romeDayBounds` (`packages/domain/src/contact/time.ts`) dà mezzanotte di Roma e mezzanotte del giorno dopo.
- **Dashboard.** `DataSection` sceglie `AdminDataSection` o `OperatorDataSection` dal ruolo; Tremor e `xlsx` (vendor 0.20.3) sono già dipendenze.

## 2. Problema

La spec chiede un export dell'admin che oggi non esiste: totali per operatore e periodo, calcolati dal registro dei cambi di stato, in un file e in grafici, con i permessi chiusi agli operatori e il vecchio export rimosso. Ostacoli:

1. La regola di "chiamata effettuata" deve vivere in un posto solo: la usano la query e, per i test, i casi d'esempio.
2. Il periodo si ragiona in giorni di Roma, la query in istanti UTC; i bordi (AC11, AC11b) devono coincidere fra UI e server.
3. AC21 chiede < 500 ms con 100.000 cambi nel periodo: va misurato prima di decidere un indice.
4. La procedura nuova tocca i permessi: la rivede Leonardo.

## 3. Forma della soluzione

Quattro PR draft, in ordine, finché la prod GCP non ha il go/no-go:

| PR | Branch | Base | Contenuto | Revisione |
|---|---|---|---|---|
| A | `claude/export-non-risponde-in-coda` (#61) | #57 | T0: AC1b | Leonardo |
| B | `claude/export-call-stats` | #61 | T1–T5: dominio, servizio Effect, procedura admin, misura | Leonardo (permessi) |
| C | `claude/export-admin-ui` | B | T6, T7a–T7d: file Excel e sezione admin con grafici | Leonardo (si unisce insieme a D, D11) |
| D | `claude/export-cleanup` | C | T8: rimozione del vecchio export | Leonardo |

Moduli nuovi:

```
packages/domain/src/export/period.ts      periodo selezionabile in giorni di Roma → intervallo UTC (puro)
packages/domain/src/export/calls.ts       stati di partenza/arrivo di una chiamata, ordinamenti (puro)
packages/server/src/services/export/callStats.ts   Effect: una query aggregata per operatore
packages/server/src/api/routers/export/   procedura export.callStats (adminProcedure)
src/lib/export/callStatsWorkbook.ts       file Excel dai totali (puro)
src/app/dashboard/_components/export/     sezione admin: periodo, indicatori, grafici, download
```

- **Una query sola.** `callStats` conta con `count(*) filter (where …)` le righe `state_change` con `source` in (`detail`, `list`), `from_state` negli stati di partenza, `to_state` negli stati di arrivo, `created_at` nell'intervallo, raggruppate per `actor_operator_id`, unite a `operators` per nome e cognome. Gli insiemi di stati vengono da `@mito/domain/export/calls`, non sono riscritti nella query.
- **Niente storage.** Il file nasce nel browser dai totali (AC13); nessun upload, nessun file da pulire.
- **Trasporto tRPC** (CLAUDE.md: le operazioni nuove sono procedure). Il backend Hono la serve senza modifiche perché monta lo stesso router.

## 4. Decision ledger

| # | Decisione | Fonte |
|---|---|---|
| D1 | Nuovo stato `non risponde`, aperto, priorità 100 | Leonardo 2026-10-22 (spec) |
| D2 | Da `non risponde` mai a `chiamare` né `followup` (AC1b): va in #61, non in una PR nuova | Spec, gate 2026-10-23 |
| D3 | Le 4 domande aperte della spec seguono il default (richiamate contano; solo totali; grafici nella dashboard home, sezione admin; admin con riga operatore conta come operatore) | Assunzione in attesa della conferma di Leonardo (domanda del 2026-10-23); se cambia, cambiano T2, T3, T6, T7c, T7d |
| D4 | tRPC, non HttpApi: il risultato è piccolo e i permessi stanno già in `adminProcedure`. Il pilota Effect riguarda il servizio, non il trasporto | Piano 2026-10-21, CLAUDE.md |
| D5 | Il file Excel nasce nel browser con `xlsx` già installato; sparisce il giro storage | Spec, Technical Notes |
| D6 | Indice nuovo solo se T5 misura più di 500 ms; in quel caso migrazione additiva (indice parziale su `created_at` con `action = 'state_change'`) in PR B | Piano |
| D7 | Il cron `delete-export` e il path di storage degli export restano fino a quando gli ultimi file vecchi sono scaduti: rimozione in una PR successiva, fuori da questo piano | Piano |
| D8 | Nessun backlog esterno: solo questo `PLAN.md` | Convenzione del progetto (come seeder-locale) |
| D9 | Esecuzione: Opus per T0–T5 e T7a–T7d (permessi, query, design UI); Haiku per T6 e T8 (puri o meccanici, verificabili in review) | Regole del progetto |
| D10 | `export.callStats` non usa `adminProcedure` ma una base nuova `adminSessionProcedure` = `protectedProcedure` + `enforceIsAdmin`: il servizio non usa `ctx.operator`, e così ogni non admin riceve `FORBIDDEN` (AC7). `adminProcedure` non cambia, per non toccare le altre procedure admin | Gate del piano 2026-10-23 |
| D11 | PR C e PR D si uniscono insieme: fino a D restano aperte agli operatori le vie vecchie (`fetchCall`, `export.getTasksmessages`). Nessuna delle due va in prod prima del go/no-go | Gate del piano 2026-10-23 |

## 5. Assunzioni e vincoli

- La spec è considerata approvata con il lancio di `create-plan` (2026-10-23).
- Branch in draft fino al go/no-go della prod GCP; PR che toccano permessi non si uniscono in autonomia.
- Gate di ogni PR: `next lint`, `tsc --noEmit`, `pnpm run test --run` (con `TEST_DATABASE_URL`), `pnpm build`.

## 6. Task

### T0: Da `non risponde` non si torna a `chiamare` né a `followup`

- **depends_on**: []
- **location**: `packages/domain/src/contact/status.ts`, `packages/domain/src/contact/_test/status.test.ts`, `packages/domain/src/contact/_test/transition.test.ts`, `packages/server/src/services/contact/_test/changeState.db.test.ts` (branch di #61)
- **description**: `isAllowedChange` rifiuta `non risponde` → `chiamare`. `followup` è già vietato come destinazione. `selectableStates("non risponde")` non offre `chiamare`.
- **validation**: test di dominio e `task.changeState` da `non risponde` a `chiamare` → `CONTACT_TRANSITION_REJECTED`, nessuna modifica; gate completi.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: `task.changeState` da `non risponde` a `chiamare` risponde `BAD_REQUEST` con `CONTACT_TRANSITION_REJECTED` e il contatto resta com'era (AC1b).
- **review_mode**: cli
- **complexity**: low

### T1: Periodo selezionabile in giorni di Roma

- **depends_on**: []
- **location**: `packages/domain/src/export/period.ts` + `_test/`
- **description**: funzioni pure: limiti selezionabili dato `now` (primo = giorno dopo quello di 3 mesi fa, ultimo = oggi, AC11b); conversione di `{ from, to }` (giorni `AAAA-MM-GG`) in `[start, end)` UTC con `romeDayBounds`; schema zod che rifiuta periodi fuori limite o invertiti; flag "prima del 15/09/2026" per l'avviso.
- **validation**: test unitari su giorni normali, cambio d'ora (marzo/ottobre), bordo dei 3 mesi, fine mese (31 → mese corto).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: con `now` = 2026-10-23 12:00 Roma, il primo giorno selezionabile è 2026-07-24 e l'ultimo 2026-10-23.
- **review_mode**: cli
- **complexity**: low

### T2: Regola di chiamata e ordinamenti

- **depends_on**: []
- **location**: `packages/domain/src/export/calls.ts` + `_test/`
- **description**: insiemi esportati `callFromStates` (`chiamare`, `followup`, `non risponde`, `richiamare`) e `callToStates` (esiti + `non risponde`), `isCall(from, to)`, `noAnswerState`, `appointmentState`; ordinamento delle righe (effettuate decrescenti, poi cognome e nome, AC12) e della classifica (quota appuntamenti/risposte decrescente, 0% senza risposte, poi cognome e nome, AC18); riga dei totali.
- **validation**: test su ogni coppia di stati scritta a mano (come `transition.test.ts`), esempi di AC10.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: `isCall("richiamare", "app.to")` è vero, `isCall("app.to", "caricato")` è falso.
- **review_mode**: cli
- **complexity**: low

### T3: Servizio `callStats` in Effect

- **depends_on**: [T1, T2]
- **location**: `packages/server/src/services/export/callStats.ts` + `_test/callStats.db.test.ts`; factory `createTaskEvent` in `src/test/factories.ts`
- **description**: `callStats({ start, end })`: `Effect<CallStats, DbError, Db>` con una query aggregata come in §3; restituisce righe `{ operatorId, name, surname, calls, answered, appointments, noAnswer }` già ordinate (T2) e la riga dei totali. Solo totali, nessun dato di clienti (AC22).
- **validation**: test db: conteggi per operatore (AC9), esclusioni di AC10 (esito→esito, esito→`chiamare`, `bulk`, `cron_alert`, `self_assign`), bordi di Roma (AC11, 23:59 e 00:00 del giorno dopo), operatori senza chiamate assenti, totali (AC12), periodo vuoto → nessuna riga.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: due `state_change` di Anna (`chiamare`→`app.to`, `chiamare`→`non risponde`) nel periodo danno `{ calls: 2, answered: 1, appointments: 1, noAnswer: 1 }`.
- **review_mode**: cli
- **complexity**: medium

### T4: Procedura `export.callStats` solo admin

- **depends_on**: [T3]
- **location**: `packages/server/src/api/trpc.ts` (`adminSessionProcedure`, D10), `packages/server/src/api/routers/export/` + `_test/callStats.db.test.ts`; eventuale caller senza sessione in `src/test/caller.ts`
- **description**: `adminSessionProcedure` (D10), input = schema del periodo di T1 (validato con `now` del server), esegue `callStats` con `runPromiseExit` e mappa `DbError` a `INTERNAL_SERVER_ERROR` in un punto solo. Toglie `getTasksmessages` solo in T8.
- **validation**: test: admin → dati; operatore → `FORBIDDEN` senza dati (AC7); utente non admin senza riga operatore → `FORBIDDEN`; senza sessione → `UNAUTHORIZED` (AC8); periodo fuori limite → `BAD_REQUEST`. Revisione riga per riga di Opus e di Leonardo.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: un operatore non admin che chiama `export.callStats` riceve `FORBIDDEN`.
- **review_mode**: cli
- **complexity**: medium

### T5: Misura di AC21 e indice se serve

- **depends_on**: [T3]
- **location**: `packages/server/src/services/export/_test/callStats.perf.pg.test.ts` (saltato senza `PERF=1`; si lancia con `PERF=1 pnpm test:pg`); eventuale migrazione in `packages/db/migrations/`
- **description**: inserisce 100.000 `state_change` su 30 operatori in 3 mesi, una richiesta di riscaldamento, poi 10 richieste alla procedura `export.callStats` via `createTestCaller` (middleware compreso, AC21); mediana < 500 ms. Se non passa: indice parziale (D6), `pnpm db:generate`, rimisura.
- **validation**: output della misura riportato nella PR; se c'è una migrazione, solo additiva.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: la mediana di 10 chiamate a `export.callStats` su 100.000 righe è sotto 500 ms.
- **review_mode**: cli
- **complexity**: medium

### T6: File Excel dai totali

- **depends_on**: [T2]
- **location**: `src/lib/export/callStatsWorkbook.ts` + `_test/`
- **description**: `buildCallStatsWorkbook(stats, period)` → workbook con un foglio, colonne "Operatore", "Chiamate effettuate", "Risposte", "Appuntamenti fissati", "Non risposte", righe ordinate e riga dei totali; `callStatsFileName(period)` = `chiamate_<da>_<a>.xlsx`.
- **validation**: test che rilegge il workbook con `xlsx` e confronta celle e nome del foglio (AC13).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: con due operatori, la riga 4 del foglio è "Totale" con le somme.
- **review_mode**: cli
- **complexity**: low

### T7a: Sezione export solo admin

- **depends_on**: [T4]
- **location**: `src/app/dashboard/_components/export/AdminExportSection.tsx`, `AdminDataSection.tsx`, `src/app/dashboard/page.tsx` + `_test/`
- **description**: contenitore della sezione nel ramo admin di `DataSection`; `ExportDialog` esce da `page.tsx`, quindi nessun comando di export per gli operatori (AC6, AC20).
- **validation**: test: con un operatore la dashboard non mostra comando di export né sezione; con un admin sì.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: renderizzata con un utente operatore, la dashboard non mostra né il comando di export né la sezione.
- **review_mode**: cli
- **complexity**: medium

### T7b: Periodo, avviso e indicatori

- **depends_on**: [T7a, T1]
- **location**: `src/app/dashboard/_components/export/ExportPeriod.tsx`, `ExportKpis.tsx` + `_test/`
- **description**: selettore del periodo coi limiti di T1, avviso "Dati completi solo dal 15/09/2026" (AC11b); una sola richiesta a `export.callStats` per il periodo, condivisa da indicatori, grafici e file (AC19); quattro indicatori coi totali (AC16).
- **validation**: test: giorni fuori limite non selezionabili; avviso col periodo prima del 15/09/2026; indicatori uguali alla riga dei totali.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: scelto un periodo che inizia il 2026-09-10, compare "Dati completi solo dal 15/09/2026".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

### T7c: Grafici per operatore

- **depends_on**: [T7b]
- **location**: `src/app/dashboard/_components/export/ExportCharts.tsx` + `_test/`
- **description**: barre impilate risposte/non risposte per operatore (AC17) e classifica della quota appuntamenti/risposte con l'ordinamento di T2 (AC18), con Tremor.
- **validation**: test: serie del grafico e ordine della classifica dai dati; 0% per un operatore senza risposte; controllo nel browser.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: un operatore con 0 risposte compare in classifica con 0%, dopo quelli con una quota maggiore.
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

### T7d: Download e periodo vuoto

- **depends_on**: [T7b, T6]
- **location**: `src/app/dashboard/_components/export/ExportDownload.tsx` + `_test/`
- **description**: pulsante che genera il file con `buildCallStatsWorkbook` sugli stessi dati mostrati (AC13, AC19); periodo senza chiamate → "Nessuna chiamata nel periodo" e nessun file (AC14).
- **validation**: test: il download passa a `buildCallStatsWorkbook` i dati in pagina e il nome di `callStatsFileName`; periodo vuoto senza download.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: con un periodo senza chiamate compare "Nessuna chiamata nel periodo" e il pulsante di download non genera file.
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

### T8: Rimozione del vecchio export

- **depends_on**: [T7a, T7d]
- **location**: `src/app/dashboard/_components/ExportDialog.tsx`; `src/app/_context/ExportWorker.tsx`; il provider in `src/app/dashboard/layout.tsx` e `useHandleExportWorkerStates` in `src/app/_components/DashboardLayout.tsx` (con il `vi.mock` in `src/app/_components/_test/DashboardLayout.test.tsx`); `src/lib/workers/export/**` (compreso `service/utils.ts`, che importa `ClosedCall`); `src/app/api/export/[export]/**`; `packages/server/src/services/export/calls.ts`; `export.getTasksmessages`; `createExportUploadUrl` in `packages/server/src/api/routers/supabase/route.ts` e i suoi casi in `storage.db.test.ts`; `useExportStore` se non ha altri usi
- **description**: cancella file e import morti. Restano `src/app/api/export/importError`, `src/app/api/export/download` se lo usa l'import, il cron `delete-export` e la sua pulizia dello storage (D7).
- **validation**: nessun import (non testo) di `ExportDialog`, `ExportWorker`, `@/lib/workers/export`, `services/export/calls`, `getTasksmessages`, `createExportUploadUrl` (`grep -rn "from .*<nome>"`); i commenti che li citano si aggiornano; gate completi verdi (AC15). Prima di cancellare un file, cercarne gli import: un uso fuori da questa lista ferma il task (regola di stop).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: il test di route di `fetchCall` è rimosso insieme alla rotta; nessun test esistente su altro codice cambia asserzioni.
- **review_mode**: cli
- **complexity**: low

## 7. Grafo e onde

```
T0 ─────────────────────────────── (PR A)
T1 ┐
T2 ┼─> T3 ─┬─> T4 ─> T7a ─> T7b ─┬─> T7c        (PR B: T1–T5; PR C: T6, T7a–d)
   │       └─> T5                └─> T7d ─> T8  (PR D: T8)
   └─> T6 ──────────────────────────────┘
```

- Onda 1: T0, T1, T2, T6 (file diversi, in parallelo).
- Onda 2: T3.
- Onda 3: T4, T5.
- Onda 4: T7a.
- Onda 5: T7b.
- Onda 6: T7c, T7d.
- Onda 7: T8.

## 8. Strategia di test

- Dominio puro (T1, T2, T6): vitest unitari, nessun database.
- Servizio e procedura (T3, T4): `*.db.test.ts` con `migrateUpTo`, factory, `createTestCaller`; si passa dalla procedura o dal servizio, mai dagli interni di Effect.
- UI (T7a–T7d): test dei componenti con jsdom e controllo nel browser.
- Prestazioni (T5): test `pg` opzionale, fuori dalla CI.
- Copertura dei criteri: AC1 #57 (test del selettore e dei filtri); AC1b T0; AC2, AC2b, AC3 #61 (`changeState.db.test.ts`; AC2b da verificare e, se manca, test aggiunto in T0); AC4 #61 (`priority.db.test.ts`); AC5 #61 (`canSetCallback` deriva da `callStates`); AC6 T7a; AC7–AC8 T4; AC9–AC12 T2+T3; AC11b T1+T7b; AC13 T6+T7d; AC14 T7d; AC15 T8; AC16 T7b; AC17–AC18 T7c; AC19 T7b+T7d; AC20 T7a; AC21 T5; AC22 T3.

## 9. Rischi

| Rischio | Mitigazione |
|---|---|
| #57/#61 restano draft a lungo e la catena B–D accumula conflitti con `dev` | Merge di `dev` nella base a ogni PR; nessun rebase dei branch condivisi |
| La regola di chiamata cambia dopo la conferma delle 4 domande (D3) | Un solo modulo (T2) e test scritti a mano: cambia un insieme di stati |
| Bordi di Roma diversi fra UI e server | Stessa funzione (T1) nei due lati e test sui cambi d'ora |
| La misura di T5 dipende dalla macchina | Soglia con margine; se serve, indice parziale additivo |
| L'indice di D6 è un `CREATE INDEX` senza `CONCURRENTLY` (le migrazioni girano in transazione) e blocca le scritture su `task_event_log` mentre si crea | La tabella tiene al massimo 3 mesi; misurare il tempo su staging prima del deploy; se troppo lungo, crearlo a mano con `CONCURRENTLY` fuori dalla migrazione |

## 10. Domande aperte

- Le 4 domande della spec (D3): in attesa della conferma di Leonardo; il piano segue i default.

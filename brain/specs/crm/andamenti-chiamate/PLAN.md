---
domain: crm
type: plan
links:
  - "[[specs/crm/andamenti-chiamate/SPEC]]"
  - "[[specs/crm/home-admin/SPEC]]"
  - "[[specs/crm/home-admin/PLAN]]"
  - "[[specs/crm/pagina-analisi/SPEC]]"
  - "[[specs/crm/pagina-analisi/PLAN]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[chore/migrazione-effect]]"
created: 2026-11-10
updated: 2026-11-10
---

# Plan: Andamenti delle chiamate in home e «Oggi» in Analisi

**Spec:** [[specs/crm/andamenti-chiamate/SPEC]], 2026-11-10, draft, AC1–AC27. Le domande aperte sono chiuse.
**Status:** Complete. Review [[specs/crm/andamenti-chiamate/REPORT]] SHIP al giro 2.
**Generato:** 2026-11-10 con `create-plan`.
- **Grill:** una domanda a Omar: prima delle 08 le classifiche dell'admin mostrano quelle di ieri 11–19 (D1). AC24 è aggiornato. Il resto si chiude leggendo il codice (§4). Ogni decisione tecnica ha il suo contesto, così Omar la rivede col piano.
- **Motion:** `design-engineer` non gira: AC12 vieta animazioni al cambio di periodo, e Analisi ha già `isAnimationActive={false}` (D13 di pagina-analisi).
- **Schema:** nessuna migrazione, quindi nessun advisor dati.

**Baseline:** `claude/home-spec-dopo-wave` a `fe9d34c9` (home dell'admin), non ancora in `dev`.
**Chi:** Claude con `implement-spec`, supervisionato (`execution.delegation: supervised`). Il piano prevede una PR verso `dev`; la unisce Claude su richiesta di Omar, solo con i gate verdi.
**Backlog:** nessun tracker collegato. I campi `backlog_*` dei task sono `n/a`, come nei piani precedenti.

---

## 1. Situazione iniziale

- **Finestra di Analisi:** solo giorni. `DayRange {from,to}` di Roma, estremi inclusi (`packages/domain/src/analytics/window.ts`):
  - `PRESETS` sono `7d`, `30d`, `90d`, `ytd`, `12m`;
  - `GROUPS` sono `auto`, `day`, `week`, `month`;
  - in automatico si raggruppa per giorno fino a 14 giorni, per settimana fino a 120;
  - `comparisonOf` su un giorno solo dà il giorno prima, o lo stesso giorno di un anno prima.

  Le barre sono costruite da `bucketsOf`, `sumDays` e `shiftOf` in `buckets.ts`, che iterano sui giorni. Nessun conto è per ora.
- **Server di Analisi:**
  - `analysisRange` (`services/analytics/range.ts`) valida `{from,to,compare}` contro l'oggi del `Clock`;
  - `callsByOperator` (`services/analytics/calls.ts`) è `callStats(periodBounds(range))` sulla finestra e sul confronto. Restituisce le righe della finestra e solo i totali del confronto (`calls`, `answered`, `appointments`, dove `noAnswer = calls - answered`);
  - `myCallSeries` conta per giorno con `romeDayOf` (`shared/sql.ts`) e `isCallIn`, solo per l'operatore che chiede;
  - il finanziato è per giorno di `data_liquidazione` (`series.ts`).
- **Contratto** (`packages/contract/src/analytics.ts`):
  - `AnalysisQuery {from, to, compare}`;
  - `CallsByOperator {window, comparison, rows, comparisonTotals}`;
  - `MyCallSeries {window, comparison, days, comparisonDays}`.
- **Web, Analisi** (`apps/web/src/routes/dashboard/analisi/`):
  - `useAnalisi` legge lo stato con `readState` di `_lib/urlState.ts`: `range` parte da `30d`, `compare` da `initialComparison`, `group` da `auto`. `PeriodSelect` ha `PRESET_LABELS`;
  - lo stato di un grafico (`_lib/results.ts`) è `ready`, `empty` o `kpiOnly`, e l'azione di uno stato vuoto è `widen`;
  - le classifiche sono in `_lib/rankings.ts`: `MAX_BARS = 8`, `adminCallsResult` e `adminAppointmentsResult`. La serie dell'operatore è in `_lib/trends.ts`: `myCallsResult` e `readyOrSingle` («Un solo intervallo»);
  - gli export sono in `_lib/export.ts`: `exportHeader`, `fileName` (`mito_<slug>_<from>_<to>`), `allFileName`, CSV, xlsx, TSV, più «Esporta tutto»;
  - i grafici usano recharts 3.10.1 con `accessibilityLayer={false}`, così il grafico non è un tab stop (pagina-analisi AC34). Lì i dati da tastiera sono nella tabella.
- **Web, home dell'admin:**
  - `AdminHome.tsx` monta in fondo `CallsSection` (`home/_components/export/`): `AdminExportSection`, `ExportPeriod`, `ExportKpis`, `ExportCharts`, `ExportDownload`, che importa in modo pigro `@mito/client/export/callStatsWorkbook`. I dati vengono da `useCallStats` di `api/export.ts`, con il suo errore inline;
  - le altre parti usano `AdminPart` (`home/_components/AdminPart.tsx`, `_lib/part.ts`, `useRetryPart`) e le chiavi `adminHomeKeys` di `api/home.ts` (D6 e D7 di home-admin).
- **Test e falsi:**
  - `apps/web/src/test/analisi.ts` (`fakeAnalisi`), i falsi della home e `renderWithApi`;
  - sul server, `http/_test/analytics.db.test.ts`, `analisi.db.test.ts`, `services/analytics/_test/*`;
  - per i tempi, `services/home/_test/home.perf.pg.test.ts`, che gira con `PERF=1`.
- **Seed:** `src/server/db/seeds/local/generate/homeDay.ts` (`shapeOperatorDay`) dà a due operatori le chiamate di oggi.
- **Next.js** continua a usare `callStatsWorkbook` e il suo export. Il pacchetto `@mito/client` e l'endpoint `GET /export/call-stats` restano.

## 2. Problema

In fondo alla home dell'admin c'è un export per operatore su date scelte a mano, e manca l'andamento del team nel tempo. Analisi non ha «Oggi», non conta per ora e non ha i totali e la riga «Totale» del file dell'export. Il codice di finestre, barre e confronti è tutto per giorni.

## 3. Forma della soluzione

- **Dominio:**
  - un modulo puro per l'orario lavorativo calcola le ore di «Oggi» e le ore di confronto da un istante (D2);
  - in `window.ts`: `today` diventa un periodo e `hour` un raggruppamento, con le loro regole (D3).
- **Server:**
  - con `range=today`, le due letture delle chiamate di Analisi contano sulle ore di «Oggi» decise dal `Clock` del server (D4, D5);
  - un endpoint `AdminOnly` della home dà l'andamento del team per giorno o per ora (D6);
  - il conto per ora sta in un solo aiutante, usato da Analisi e dalla home (D5).
- **Web, home:** una sezione nuova su `AdminPart` con quattro periodi, due grafici a barre verticali e i collegamenti ad Analisi. `CallsSection` e il suo albero escono (AC1, AC17).
- **Web, Analisi:** i totali e la riga «Totale», poi «Oggi» su tutti i grafici, con i suoi stati prima delle 08 e i suoi file.

## 4. Decision ledger

### Di Omar

- **D1. Prima delle 08 le classifiche dell'admin mostrano ieri 11–19.**
  - *Problema:* AC24 dava ai grafici nel tempo la serie di confronto delle ore di ieri. Le classifiche però non hanno serie, e prima delle 08 le loro barre di oggi sono tutte vuote.
  - *Scelta:* col confronto «Periodo precedente», barre, tabella, quattro totali e file sono quelli delle ore 11–19 di ieri, con la nota di AC24 e senza variazione.
  - *Perché:* è risposta di Omar in questo piano, e AC24 è aggiornato.

### Grill: domande chiuse leggendo il codice

- **Il confronto «Periodo precedente» su un giorno solo dà ieri?** Sì: `comparisonOf` su una finestra di un giorno dà il giorno prima, e «Stesso periodo, anno prima» lo stesso giorno un anno prima. Fa eccezione il 29 febbraio, che `comparisonOf` porta al 28. Con «Oggi» quel caso si toglie in `analysisRange`, e il confronto diventa `null` per tutti i grafici, finanziato compreso (D4, AC20).
- **Il server sa già contare le «Non risposte» del confronto (AC14)?** Sì: `noAnswer = calls - answered`, come in `callDaysOf`. Il contratto non cambia per AC14.
- **«Chi conta» della home coincide con `callsByOperator`?** Sì, se la serie del team usa `isCallIn` senza filtro sull'operatore, come `callStats`. Un test lo lega (T4).
- **Quale parte della home riusare per AC12?** `AdminPart`. La sezione di oggi ha un errore suo, e uscirà con lei.

### Tecniche (questo piano; Omar le rivede col piano)

- **D2. L'orario lavorativo è un modulo puro di dominio.**
  - *Problema:* le ore di «Oggi», l'ora in corso, le ore di confronto e i loro nomi servono al server (per contare), alla home e ad Analisi (per i nomi e i file). Se li calcolano tre parti diverse, i numeri si separano.
  - *Scelta:* `packages/domain/src/analytics/hours.ts` con:
    - `WORK_HOURS = { start: 8, end: 19 }` e `MAX_TODAY_HOURS = 8`;
    - `HourSlot = { start: Date, end: Date, inProgress: boolean }`;
    - `todayHours(now)`, che segue la tabella delle Definizioni;
    - `comparisonHours(slots, compare, now)`:
      - con «Periodo precedente», ogni ora meno un giorno, e l'ora in corso fino agli stessi minuti;
      - con «Stesso periodo, anno prima», lo stesso giorno un anno prima, e `null` il 29 febbraio;
      - prima delle 08 con «Periodo precedente», le ore 11–19 di ieri, tutte intere (AC24, D1);
    - `hourLabel(slot)` («15:00–15:20», con «(in corso)» dove serve, AC7);
    - `hoursSpan(slots)` («08:00–15:20», AC4 e AC25).

    Le ore si calcolano sull'ora di Roma, come `romeDayBounds`. Nessun cambio d'ora cade fra le 08 e le 19, ma i test coprono comunque il 29 marzo e il 25 ottobre.
  - *Perché:* una sola regola, e testabile a tabella.
- **D3. `today` e `hour` entrano in `window.ts`.**
  - *Problema:* URL, menu, raggruppamenti, confronti iniziali e allargamenti leggono queste liste.
  - *Scelta:*
    - `PRESETS = ["today", "7d", …]`, con «Oggi» primo nel menu (AC18);
    - `presetRange("today", today)` è `{today, today}`;
    - `initialComparison("today")` è `previous` (AC20);
    - `widenAction("today")` è `7d` (AC24);
    - `GROUPS` e `Bucketing` hanno `hour`;
    - `allowedGroups`, `effectiveGroup` e `resolveGroup` prendono anche il periodo. Con `today` danno solo `hour`; negli altri casi danno le regole di oggi, senza `hour` (AC19). Tutti i chiamanti del web si aggiornano, compreso `exportContext.ts:55`, così l'intestazione dei file scrive «per ora» (D10);
    - le mappe di etichette esaustive del web prendono le voci nuove nello stesso task: `PeriodSelect.tsx:13`, `GroupSelect.tsx:15` ed `export.ts:37`;
    - `bucketsOf` non cambia: le ore non passano di lì, e le loro barre vengono dalle `HourSlot` del server.
  - *Perché:* `readState` mette già a posto i valori non validi (pagina-analisi AC14). Basta dargli le regole nuove.
- **D4. `range=today` nella query di Analisi, con le ore decise dal server.**
  - *Problema:* la finestra di Analisi è fatta di giorni. Il browser e il server possono avere orologi diversi, e l'ora in corso la deve decidere uno solo.
  - *Scelta:* `AnalysisQuery` ha `range: Schema.optional(Schema.Literal("today"))`. Con `today`:
    - il server ignora `from` e `to`. Il web li manda comunque uguali al suo oggi, perché lo schema li chiede;
    - `analysisRange` dà come finestra l'oggi del `Clock`, `{oggi, oggi}`, a ogni endpoint con finestra: finanziato, sedi e chiamate. Il web manda `range=today` a tutti;
    - il confronto è `comparisonOf`, salvo «Stesso periodo, anno prima» il 29 febbraio, che dà `null` (AC20);
    - `hours` sono `todayHours(now)` e `comparisonHours` le ore di D2;
    - le due letture delle chiamate contano sulle ore, dalla prima `start` all'ultima `end`;
    - il finanziato conta il giorno intero (AC22), e «Contatti con esito» non ha finestra.

    Nel web, nomi dei file e intestazioni prendono la finestra dalla risposta, non dall'oggi del browser (D10).

    Le risposte delle chiamate hanno in più:
    - `hours: NullOr(Array(HourWindow))` e `comparisonHours: NullOr(Array(HourWindow))`, dove `HourWindow = {start, end, inProgress}`;
    - in `CallsByOperator`, `comparisonRows: NullOr(Array(OperatorCallsRow))`, valorizzato solo con `today`. Serve a D1.
  - *Perché:* è come D11 di home-admin: l'ora la dice il server, e i nomi nel web si scrivono dalla risposta.
- **D5. Un solo aiutante conta per ora.**
  - *Problema:* home e Analisi devono avere gli stessi numeri per ora (AC9).
  - *Scelta:* `callsByHour(slots, operatorId?)` in `services/analytics/calls.ts`:
    - una query con `isCallIn({start: slots[0].start, end: last.end}, registryAt)`;
    - un gruppo per `romeHourOf(createdAt)`, cioè `to_char(… AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD HH24')` in `shared/sql.ts`;
    - restituisce una riga per slot, zeri compresi.

    Lo usano `myCallSeries` (con l'operatore), l'andamento della home (senza) e le ore di confronto. `callDaysOf` prende l'operatore come facoltativo, per la serie del team per giorno.
  - *Perché:* è AC26 in un posto solo, e la chiamata delle 15:59:59 non può finire in due ore diverse.
- **D6. `getCallTrend`: `GET /home/call-trend?period=today|7d|30d|90d`, `AdminOnly`, nel gruppo `home`, con `unexpectedAs500` in fondo al handler (L3 di `migrazione-effect`).**
  - *Problema:* la home non ha confronto (OQ7), ha periodi fissi, e AC12 vuole una parte che carica da sola.
  - *Scelta:*
    - la risposta è `{ period, window: DayRange, days: Array(CallDay), hours: NullOr(Array(CallHour)) }`;
    - per i giorni, una riga per ogni giorno con chiamate, di chiunque: `callDaysOf` senza operatore sulla finestra `presetRange(period)`;
    - per «Oggi», `callsByHour(todayHours(now))`;
    - le settimane le fa il web con `bucketsOf` e `sumDays`, come Analisi. Così 30 e 90 giorni hanno gli stessi intervalli dei collegamenti di AC10.
  - *Perché:* nessuna logica nuova di raggruppamento, e AC9 si prova contro `callsByOperator`.
- **D7. Le barre della home con recharts e lo strato di accessibilità acceso.**
  - *Problema:* AC7 vuole ogni intervallo raggiungibile da tastiera, e la home non ha una tabella. Analisi lo spegne (pagina-analisi AC34) perché la superficie diventa un tab stop «application» senza nome né anello.
  - *Scelta:*
    - `accessibilityLayer` acceso, senza gestori nostri: le frecce spostano la barra attiva e il tooltip la segue;
    - la superficie ha un nome («Tasso di risposta, 7 giorni») e un anello `focus-visible` del design system;
    - `isAnimationActive={false}`;
    - un intervallo senza valore è `null`, e recharts lo lascia vuoto (AC6).

    Il task che disegna verifica prima, sul recharts installato, nome, anello e tooltip al fuoco. Se uno dei tre manca, il task si ferma e si riferisce a Omar. L'alternativa è una barra HTML per intervallo, con il tabindex che si sposta.
  - *Perché:* tiene il comportamento della libreria, senza codice sopra (regola di progetto).
- **D8. Una sezione nuova sulla parte dell'admin, con la sua lettura.**
  - *Scelta:*
    - `CallTrend` in `home/_components/trend/`, dentro `AdminPart`;
    - la lettura `useCallTrend(period)` sta in `api/home.ts`, con `adminHomeKeys.callTrend(period)` e le opzioni delle altre parti (D6 di home-admin);
    - il periodo è `useState("7d")`, non si ricorda e non va nell'indirizzo (OQ3, OQ4);
    - lo scheletro ha l'altezza dei due grafici (AC12);
    - con dati tenuti, un cambio di periodo mostra lo scheletro della nuova lettura (`placeholderData` assente), così non si vedono numeri di un altro periodo.
  - *Perché:* è lo stesso modello di AC30 di home-admin.
- **D9. «Totale» si calcola nel web.**
  - *Problema:* AC13–AC16 sono somme delle righe che il server dà già tutte.
  - *Scelta:* `totalsRow(rows)` in `_lib/rankings.ts` usa `totalsOf` di `@mito/domain/export/calls`. Si aggiunge in fondo alle righe di `Table` dopo l'ordine del server (più chiamate prima): `DataTable` non riordina, quindi la riga resta l'ultima. CSV, TSV, xlsx e foglio di «Esporta tutto» la scrivono così come sono, e il grafico usa solo le righe degli operatori. Le variazioni (AC14) vengono da `comparisonTotals` e da `noAnswer = calls - answered`.
  - *Perché:* nessun campo nuovo, e la somma di una colonna è la stessa cosa nella tabella e nel file.
- **D10. I nomi dei file e le intestazioni con «Oggi».**
  - *Scelta:*
    - `fileName` e `allFileName` scrivono una data sola quando `range` è `today` (AC25);
    - `exportHeader` scrive nella riga «Finestra»:
      - «Oggi, 08:00–15:20» per i grafici delle chiamate, da `hoursSpan` della risposta;
      - «Oggi, tutto il giorno» per il finanziato;
    - nella riga «Confronto» scrive le ore di confronto, o il giorno.
- **D12. I falsi hanno un orologio.**
  - *Problema:* oggi `fakeAnalisi` (`apps/web/src/test/analisi.ts:160`) ricava tutto da `from` e `to`. I casi delle 07:15 e delle 15:20 di AC24 hanno bisogno di ore.
  - *Scelta:* `fakeAnalisi({ now })`. Con `range=today`:
    - calcola `hours` e `comparisonHours` con `todayHours(now)` e `comparisonHours` di D2;
    - dà righe, `comparisonRows` e serie per ora dalle sue righe di default, distribuite sulle ore;
    - la finestra della risposta è il giorno di `now`.

    Lo stesso vale per il falso della home (`now` per `getCallTrend`). Il `now` di default è un istante fisso, il 10/11/2026 alle 15:20 a Roma. La pagina non legge l'oggi del browser per le ore (D4), quindi i test non fermano l'orologio del browser.
- **D11. Pulizia.** Escono `home/_components/export/` con i suoi test e `useCallStats` col suo test. `api/export.ts` resta solo se ha altri usi. L'endpoint `GET /export/call-stats` e `@mito/client/export/callStatsWorkbook` restano per Next e vanno nel debito tecnico (Technical Notes della spec).

### Assunzioni

- Le chiamate del seed di oggi non hanno ore lavorative piene per tutto il team. T13 aggiunge chiamate di oggi e di ieri sparse fra le 07 e le 20, così si vedono le ore, le ore fuori orario e il caso prima delle 08.
- Nel browser, il caso prima delle 08 si prova con il `Clock` dei test, non con l'ora vera. La prova in T16 avviene all'ora in cui gira.
- `callsByHour` su un giorno e la serie del team su 90 giorni restano sotto 2 s ai volumi di riferimento. Se T15 misura di più, si riferisce a Omar: un indice è una migrazione, e non entra da solo.

### Ancora aperte

Nessuna.

## 5. Assunzioni e vincoli

- Lavoro nuovo solo in `apps/web` e in `HttpApi`/Effect: Next e tRPC restano come sono.
- Effect 4: `Effect.fn` per le funzioni esportate, errori `Schema.TaggedError`, test con `@effect/vitest`, `it.effect` e `TestClock.setTime`.
- I test del web usano `renderWithApi` coi falsi, senza mock di moduli o di `fetch`.
- Nessuna migrazione.

## 6. Findings dal codice

Sono quelli del §1, letti nel codice il 2026-11-10, più questo: in `callDaysOf`, il filtro sull'operatore è nella `where`, quindi renderlo facoltativo cambia poco codice.

## 7. Ricerca esterna

recharts 3.10.1 è installato. Lo strato di accessibilità acceso rende la superficie un tab stop, con `tabindex=0` e `role="application"` (pagina-analisi PLAN, log di T15). Nome, anello e tooltip al fuoco si confermano sul codice installato all'inizio di T7 (D7).

## 8. Grafo delle dipendenze

```
G0 ─ T1 ─ T2 ─┬─ T3 ─ T4 ─┬─ T5 ─ T6 ─ T7 ─ T8 ─────────┐
              │           ├─ T13 ─────────────────────┤
              ├─ T9 ──────┼──────┐                    │
              └─ T10 ─────┴─ T14 ┴─ T11 ─┬─ T12 ──────┼─ T16 ─ T17
                  (T3, T9, T10, T14 ─ T11)└─ T15 ─────┘
                                (T4 ─ T15)
```

| Onda | Task |
|---|---|
| 1 | G0 |
| 2 | T1 |
| 3 | T2 |
| 4 | T3, T9, T10 |
| 5 | T4, T14 |
| 6 | T5, T11, T13 |
| 7 | T6, T12, T15 |
| 8 | T7 |
| 9 | T8 |
| 10 | T16 |
| 11 | T17 |

I `depends_on` dei task sono la fonte: il disegno li riassume. Nessuna onda ha due task che scrivono lo stesso file. Alcuni task sono in sequenza proprio per questo:
- T1 tocca le mappe di etichette di `PeriodSelect`, `GroupSelect` ed `export.ts` (D3), quindi T9 e T10 vengono dopo;
- T2 e T3 cambiano i costruttori dei test `rankings.test.ts` e `trends.test.ts`, e T10 tocca `rankings.test.ts`, quindi viene dopo T2;
- T2, T3 e T4 scrivono `services/analytics/calls.ts` e i falsi;
- T10, T14 e T11 scrivono `_lib/export.ts`.

## 9. Task

### G0: Piano approvato
- **depends_on**: []
- **location**: `brain/specs/crm/andamenti-chiamate/{SPEC,PLAN}.md`
- **description**: Omar approva spec e piano. `implement-spec` porta la spec a `status: approved`, unisce `dev` nel branch se ha commit in più e controlla le migrazioni.
- **validation**: frontmatter `approved`; merge senza conflitti.
- **status**: Complete
- **log**: 2026-11-10: spec `approved`; `origin/dev` senza commit in più, nessun merge né migrazione.
- **files edited/created**: `SPEC.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

### T1: L'orario lavorativo e i periodi nel dominio (Definizioni, AC18, AC19, AC20, AC26, AC27, D2, D3)
- **depends_on**: [G0]
- **location**: `packages/domain/src/analytics/hours.ts` (nuovo), `window.ts`, test in `packages/domain/src/analytics/_test/{hours,window}.test.ts`; nel web le etichette di `analisi/_components/{PeriodSelect,GroupSelect}.tsx` ed `analisi/_lib/export.ts:37`, e i chiamanti di `allowedGroups`, `effectiveGroup` e `resolveGroup` (`exportContext.ts:55` compreso)
- **description**:
  - `hours.ts` di D2;
  - `today` e `hour` in `window.ts`, e il periodo nei tre aiutanti dei raggruppamenti (D3);
  - nel web solo le etichette e i chiamanti, senza comportamento nuovo: il menu e «Raggruppa per» li cambia T9.
- **validation**: `pnpm run test --run packages/domain/src/analytics`, `pnpm exec tsc --noEmit`, `pnpm --filter @mito/web typecheck`, `pnpm web:test`. Casi:
  - le sette righe della tabella delle Definizioni, più le 23:59;
  - AC26 alle 15:59:59 e alle 16:00:00;
  - il 29 marzo e il 25 ottobre;
  - il 29 febbraio con l'anno prima, che dà `null`;
  - prima delle 08: con `previous` le ore 11–19 di ieri, con `last-year` nessuna ora;
  - l'ora in corso confrontata fino agli stessi minuti;
  - con `today` i gruppi ammessi sono solo `hour`, e `resolveGroup` dà `hour`;
  - i test esistenti di `window.ts` restano con le stesse asserzioni.
- **status**: Complete
- **log**: 2026-11-10: worker sonnet, rivisto. `romeAt` nuovo in `contact/time.ts`; `resolveGroup` con due overload (senza periodo dà `DayBucketing`); `bucketsOf` rifiuta `hour` a runtime perché `buckets.test.ts` tipizza `group` come `Bucketing`. Il test del menu di `window.more.test.tsx` ha «Oggi» in testa (AC18). Restano senza periodo `GroupSelect.tsx:36`, `trends.ts:100`, `exportContext.ts:55`: li passa T9/T11. Dominio 160 test verdi, typecheck del web verde.
- **files edited/created**: `packages/domain/src/analytics/{hours,window,buckets}.ts`, `_test/{hours,window}.test.ts`, `packages/domain/src/contact/time.ts`, `apps/web/src/routes/dashboard/analisi/_components/{PeriodSelect,GroupSelect}.tsx`, `_lib/{export,urlState}.ts`, `_test/window.more.test.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `todayHours` alle 16:00:00 del 10/11/2026 a Roma dà 09–10, …, 15–16 intere e 16:00–16:00 in corso.
- **review_mode**: cli
- **complexity**: medium

### T2: «Oggi» nella classifica delle chiamate (AC18, AC20, AC21 admin, AC27, D1, D4, D5)
- **depends_on**: [T1]
- **location**: `packages/contract/src/analytics.ts`, `packages/server/src/services/analytics/{range,calls}.ts`, `packages/server/src/shared/sql.ts`, `packages/server/src/http/analytics.ts`, `apps/web/src/test/analisi.ts` (`fakeAnalisi({ now })`, D12), i costruttori di `analisi/_lib/_test/rankings.test.ts:109`, test in `http/_test/analisi.db.test.ts`, `services/analytics/_test/`
- **description**:
  - `range` facoltativo in `AnalysisQuery`, e `HourWindow` (D4);
  - `analysisRange` con `today` dà la finestra del server, il confronto senza il 29 febbraio, `hours` e `comparisonHours` (D4);
  - `romeHourOf` e `callsByHour` (D5);
  - `callsByOperator` con le ore: `callStats` sul tratto delle ore, i totali e le righe del confronto;
  - prima delle 08, la finestra non ha ore. Le righe di oggi sono vuote, e quelle del confronto sono le ore 11–19 di ieri (D1).
- **validation**: test del servizio e HTTP con `it.effect` e `TestClock.setTime`. Casi:
  - alle 15:20 una chiamata delle 07:50, una delle 08:00 e una delle 15:10 di oggi: contano le ultime due (AC27);
  - le ore 15:00–15:20 di ieri si confrontano fino alle 15:20 (AC20);
  - alle 07:15 con `previous`, `rows` è vuoto, e `comparisonRows` e i totali del confronto sono quelli di ieri 11–19;
  - senza `range` la risposta è uguale a prima, con `hours: null`;
  - con `range=today`, `from` e `to` di un altro giorno non contano: la finestra è l'oggi del server;
  - il 29/02/2028 con l'anno prima: `comparison` e `comparisonHours` sono `null`, anche per `GET /analytics/financed-series`;
  - permessi uguali a prima.
- **status**: Complete
- **log**: 2026-11-10: worker opus, rivisto. `analysisRange` con `today` salta la validazione di from/to e dà finestra, confronto (nullo il 29/02 con l'anno prima), `hours` e `comparisonHours`. `callsByOperator` con le ore conta `callStats` sul tratto delle ore e del confronto, con `comparisonRows`. `callsByHour` esportato per T3/T4. Fuori lista: `services/export/_test/callsRegistry.db.test.ts` riceve `hours: null` negli input, senza asserzioni cambiate. Validazione rifatta: 76 test del server verdi, tsc e typecheck del web verdi.
- **files edited/created**: `packages/contract/src/analytics.ts`, `packages/server/src/services/analytics/{range,calls}.ts`, `packages/server/src/shared/sql.ts`, `apps/web/src/test/analisi.ts`, `analisi/_lib/_test/rankings.test.ts`, `http/_test/analisiOggi.db.test.ts` (nuovo), `services/analytics/_test/callsByHour.db.test.ts` (nuovo), `services/export/_test/callsRegistry.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `GET /analytics/calls-by-operator?range=today&compare=previous` alle 15:20 restituisce in `rows` le chiamate dalle 08:00 e non quella delle 07:50, e `hours` va da 08:00 a 15:20.
- **review_mode**: cli
- **complexity**: high

### T3: «Oggi» nella serie dell'operatore (AC21 operatore, AC26, D4, D5)
- **depends_on**: [T2]
- **location**: `packages/contract/src/analytics.ts` (`CallHour`, `hours` e `comparisonHours` in `MyCallSeries`), `services/analytics/calls.ts`, `http/analytics.ts`, `apps/web/src/test/analisi.ts` (serie per ora di `fakeAnalisi`), i costruttori di `analisi/_lib/_test/trends.test.ts:170`, test accanto
- **description**:
  - `myCallSeries` con `today` dà una riga per ora di «Oggi» e una per ora di confronto, zeri compresi, coi conti di `callsByHour` ristretti all'operatore;
  - `days` e `comparisonDays` sono vuoti.
- **validation**: test del servizio. Casi:
  - 8 ore con l'ultima in corso;
  - una chiamata alle 15:59:59 e una alle 16:00:00 cadono in due ore;
  - le chiamate di un altro operatore non contano;
  - una chiamata delle 07:50 e una delle 19:05 non sono in nessuna ora (AC27);
  - prima delle 08 con `previous`, `hours` è vuoto e `comparisonHours` sono le 8 ore di ieri;
  - senza `range` la risposta è uguale a prima.
- **status**: Complete
- **log**: 2026-11-10: worker sonnet, rivisto. `CallHour` nel contratto; `myCallSeries` con le ore usa `callsByHour` sull'operatore, `days` vuoti. `fakeAnalisi` ha `myCallHours`. 82 test del server verdi.
- **files edited/created**: `packages/contract/src/analytics.ts`, `services/analytics/calls.ts`, `apps/web/src/test/analisi.ts`, `analisi/_lib/_test/trends.test.ts`, `http/_test/analisiOggi.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `GET /analytics/my-call-series?range=today` da operatore alle 10:30 restituisce tre ore (08–09, 09–10, 10:00–10:30 in corso) con le sue chiamate di ognuna.
- **review_mode**: cli
- **complexity**: medium

### T4: L'andamento del team per la home (AC2, AC5 dati, AC9, AC26, AC27, D6)
- **depends_on**: [T3]
- **location**: `packages/contract/src/home.ts`, `packages/server/src/services/home/callTrend.ts` (nuovo), `services/analytics/calls.ts` (`callDaysOf` con operatore facoltativo), `packages/server/src/http/home.ts`, `apps/web/src/test/api.tsx` e i falsi della home, test in `services/home/_test/callTrend.db.test.ts`, `http/_test/home.db.test.ts`
- **description**: `GET /home/call-trend` di D6, `AdminOnly`.
- **validation**: test del servizio e HTTP. Casi:
  - con 7, 30 e 90 giorni, le somme di `days` sono uguali ai totali di `callsByOperator` per la stessa finestra, con le chiamate di un admin e di un utente disattivato (AC9, Chi conta);
  - con `today`, le somme di `hours` sono uguali alla classifica con `range=today` (AC9);
  - le chiamate fuori orario contano nei giorni e non nelle ore (AC27);
  - `OPERATORE` 403, senza sessione 401 (AC2).
- **status**: Complete
- **log**: 2026-11-10: worker sonnet, rivisto. `getCallTrend` per i giorni usa `callDaysOf` senza operatore, per «Oggi» `callsByHour`. Il test lega le somme a `getCallsByOperator` a 7, 30, 90 giorni e Oggi, con admin e disattivati. Fuori lista: i falsi esaustivi `apps/web/src/test/{lavoro.ts,api.tsx}` servono `getCallTrend` come non servito; `DayRange` e `CallDay` esportati dal contratto.
- **files edited/created**: `packages/contract/src/{home,analytics}.ts`, `packages/server/src/services/home/callTrend.ts` (nuovo), `services/analytics/calls.ts`, `packages/server/src/http/home.ts`, `http/_test/callTrend.db.test.ts` (nuovo), `apps/web/src/test/{adminHome,lavoro}.ts`, `apps/web/src/test/api.tsx`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `GET /home/call-trend?period=7d` da admin, con chiamate di due operatori in due giorni, dà due righe in `days` la cui somma è uguale ai totali di `GET /analytics/calls-by-operator` sugli stessi 7 giorni.
- **review_mode**: cli
- **complexity**: medium

### T5: Dati della home e falso (AC12, D8)
- **depends_on**: [T4]
- **location**: `apps/web/src/api/home.ts`, `apps/web/src/api/_test/adminHome.test.tsx`, falsi della home in `apps/web/src/test/`
- **description**: `adminHomeKeys.callTrend(period)` e `useCallTrend(period)`, con le opzioni della home (D6 di home-admin) e senza `placeholderData`. Il falso dà un andamento per ogni periodo.
- **validation**: test dell'API. Casi:
  - un cambio di periodo legge la chiave nuova;
  - `useRetryPart` rilegge solo questa;
  - la fine di un import rilegge la home come prima.
- **status**: Complete
- **log**: 2026-11-10: worker haiku, rivisto. `adminHomeKeys.callTrend(period)`, `useCallTrend` con le opzioni delle parti, senza `placeholderData`; `CallTrendPeriod` esportato. Test di «Riprova» e di `useRefreshAdminHome`. 59 test dell'API verdi.
- **files edited/created**: `apps/web/src/api/home.ts`, `apps/web/src/api/_test/callTrend.test.tsx` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `useCallTrend("today")` sul falso restituisce le ore del falso, e un `useCallTrend("30d")` montato dopo legge un'altra chiave.
- **review_mode**: cli
- **complexity**: low

### T6: Le barre dell'andamento, pure (AC4, AC5, AC6, AC7 testi, AC8, AC10, AC11, D6)
- **depends_on**: [T5]
- **location**: `apps/web/src/routes/dashboard/home/_lib/callTrend.ts` (nuovo), test in `home/_lib/_test/callTrend.test.ts`
- **description**:
  - `trendBars(response)` dà gli intervalli:
    - ore da `hours`, con `hourLabel`;
    - giorni per 7 giorni;
    - settimane per 30 e 90 giorni, con `bucketsOf` e `sumDays` (`group` `week`), e i giorni senza chiamate compresi;
  - ogni intervallo ha i due tassi, `null` senza chiamate o senza risposte;
  - `periodRate` dà il tasso del periodo dalla somma degli intervalli (AC8);
  - `trendHref(period, chart)` dà la tabella di AC10;
  - `trendEmpty(response)` vale «Nessuna chiamata nel periodo», o «La giornata di lavoro inizia alle 8» quando con «Oggi» non ci sono ore (AC11);
  - `todayLabel(hours)` dà «Oggi, 08:00–15:20» (AC4).
- **validation**: test a tabella. Casi:
  - 30 giorni il 10/11/2026 danno 5 settimane tagliate ai bordi, come Analisi con `group=week`;
  - uno 0% con chiamate è un valore, un intervallo senza chiamate è `null`;
  - i nomi di AC7, compresi «(in corso)» e la settimana tagliata;
  - i quattro indirizzi di AC10, per `calls` e `appointments`;
  - «Vedi ieri» porta `range=today&group=hour&compare=previous&chart=calls`.
- **status**: Complete
- **log**: 2026-11-10: worker sonnet, rivisto. `trendBars` usa `bucketsOf` (giorno a 7, settimana a 30/90) e `hourLabel`; le settimane tagliate dicono «(parziale)» nel nome lungo (AC7). Il 4/11/2026 è mercoledì: «Mer 4 nov». 104 test della home verdi.
- **files edited/created**: `apps/web/src/routes/dashboard/home/_lib/callTrend.ts` (nuovo), `_lib/_test/callTrend.test.ts` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `trendBars` su 30 giorni con chiamate solo il 3/11 dà 5 settimane, una sola con un valore, e le altre `null`.
- **review_mode**: cli
- **complexity**: medium

### T7: La sezione «Andamento delle chiamate» (AC2, AC3–AC8, AC10–AC12, D7, D8)
- **depends_on**: [T6]
- **location**: `apps/web/src/routes/dashboard/home/_components/trend/{CallTrend,TrendChart}.tsx` (nuovi), `AdminHome.tsx`, test in `home/_components/trend/_test/`, `home/_test/AdminHome.test.tsx`
- **description**:
  - prima di tutto, su recharts 3.10.1 si verificano le tre condizioni di D7: nome, anello e tooltip al fuoco. Se una manca, il task si ferma e si riferisce;
  - `CallTrend` dentro `AdminPart`:
    - titolo «Andamento delle chiamate»;
    - `ToggleGroup` con i quattro periodi, che si apre su «7 giorni»;
    - accanto, l'etichetta di «Oggi»;
    - due `TrendChart` a barre verticali, ognuno col tasso del periodo sopra, il tooltip e il collegamento «Dettaglio in Analisi»;
    - gli stati vuoti, con «Vedi ieri»;
  - `AdminHome` monta `CallTrend` al posto di `CallsSection`, e la sezione resta solo per l'admin.
- **validation**: test del web con `renderWithApi`. Casi:
  - un `OPERATORE` non vede la sezione;
  - si apre su 7 giorni, e dopo «30 giorni» e uno smontaggio si riapre su 7;
  - «Oggi» scrive le ore;
  - un vuoto nel grafico per un intervallo senza chiamate;
  - i collegamenti;
  - gli stati vuoti, compreso prima delle 08, con i collegamenti di AC10 ancora presenti;
  - scheletro ed errore con «Riprova» che rilegge solo la sezione;
  - nessuna animazione: `isAnimationActive` falso su ogni serie;
  - ogni grafico ha un nome accessibile, e il fuoco con le frecce mostra il tooltip dell'intervallo.
- **status**: Complete
- **log**: Worker (inherit) + revisione e controllo nel browser di Claude. home 24 file / 296 test, typecheck e web:lint verdi. Il RED passa senza modifiche. Browser su mito_local (backend riavviato per l'endpoint nuovo): 7 giorni con 7 barre e i due tassi, anello visibile al fuoco da tastiera, tooltip al fuoco e frecce che lo spostano, scheletro alla stessa altezza al cambio periodo, «Oggi» con 8 ore 09:00–16:00 e «Oggi, 09:00–16:22», link range=today&group=hour&chart=calls/appointments. Deviazioni: filterNull={false} per il tooltip dei buchi, minPointSize 2 px per lo 0%, nei test i titoli ripetuti si leggono col primo match.
- **files edited/created**: apps/web/src/routes/dashboard/home/_components/trend/{CallTrend,TrendChart}.tsx, trend/_test/callTrend.test.tsx, home/AdminHome.tsx, home/_test/{AdminHome,contactSheet,today}.test.tsx, apps/web/src/test/adminHome.ts, apps/web/src/api/home.ts (commento)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: La home dell'admin sul falso mostra «Andamento delle chiamate» con «7 giorni» premuto e, sopra «Tasso di risposta», il tasso del periodo con i suoi due numeri.
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: high

### T8: Via l'export dalla home (AC1, AC17, D11)
- **depends_on**: [T7]
- **location**: `apps/web/src/routes/dashboard/home/_components/export/` (rimossa), `apps/web/src/api/export.ts`, `apps/web/src/api/_test/*`, `brain/tech-debt/crm/andamenti-chiamate.md` (nuovo)
- **description**:
  - si tolgono la cartella `export/` coi suoi test e `useCallStats` col suo test;
  - nessun import di `callStatsWorkbook` resta in `apps/web`;
  - l'endpoint e il pacchetto client restano per Next e vanno nel debito tecnico.
- **validation**:
  - `rg "callStatsWorkbook|useCallStats|CallsSection" apps/web` è vuoto;
  - `pnpm web:lint`, `pnpm web:test`, `pnpm --filter @mito/web typecheck`.
- **status**: Complete
- **log**: Claude, inline (rimozione piccola). Tolti home/_components/export/ (6 componenti e export.test.tsx) e api/export.ts (useCallStats, senza test suo). rg di callStatsWorkbook|useCallStats|CallsSection in apps/web vuoto. Restano endpoint, workbook del client e falsi del gruppo export per Next: brain/tech-debt/crm/andamenti-chiamate.md. typecheck, web:lint verdi; web 178 file / 2.594 test verdi.
- **files edited/created**: rimossi apps/web/src/routes/dashboard/home/_components/export/**, apps/web/src/api/export.ts; nuovo brain/tech-debt/crm/andamenti-chiamate.md
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a (rimozione: il test della home di T7 prova che «Chiamate per operatore» non c'è)
- **review_mode**: cli
- **complexity**: low

### T9: «Oggi» nell'indirizzo e nei controlli di Analisi (AC18, AC19, AC20, D3, D4)
- **depends_on**: [T1, T2]
- **location**: `apps/web/src/routes/dashboard/analisi/_lib/urlState.ts`, `_components/{PeriodSelect,GroupSelect,useAnalisi}.ts(x)`, `apps/web/src/api/analytics.ts`, test in `analisi/_lib/_test/`, `analisi/_test/window.test.tsx`
- **description**:
  - `readState` accetta `range=today`: con `today` porta `group` a `hour`, e con un altro periodo toglie `hour`;
  - «Oggi» è primo nel menu;
  - «Raggruppa per» offre solo «per ora» con «Oggi»;
  - `useAnalisi` manda `range=today`, con `{oggi, oggi}`, a ogni lettura con finestra (D4).
- **validation**: test puri e della pagina. Casi:
  - `range=today&group=day` diventa `group=hour`;
  - `range=7d&group=hour` diventa `auto`;
  - il confronto iniziale con «Oggi» è «Periodo precedente»;
  - il menu e «Raggruppa per».
- **status**: Complete
- **log**: 2026-11-10: worker sonnet, rivisto. `readState` non cambiava: T1 bastava. `useAnalisi` aggiunge `range: today` alla query comune; `GroupSelect` riceve il periodo e mostra «Per ora» solo con «Oggi». Fuori lista: `AnalisiPage.tsx` passa il periodo.
- **files edited/created**: `analisi/_components/{useAnalisi.ts,GroupSelect.tsx}`, `AnalisiPage.tsx`, `_lib/_test/urlState.test.ts`, `_test/oggi.test.tsx` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `readState("?range=today&group=day", …)` restituisce `range: "today"`, `group: "hour"`, `compare: "previous"`.
- **review_mode**: cli
- **complexity**: medium

### T10: Totali e riga «Totale» di «Risposte per operatore» (AC13–AC17, D9)
- **depends_on**: [T2]
- **location**: `apps/web/src/routes/dashboard/analisi/_lib/{rankings,results,export}.ts`, `_components/{DataTable,DataSection}.tsx`, un componente per i quattro totali, test accanto
- **description**:
  - per l'ADMIN, quattro totali sopra «Risposte per operatore», con la variazione quando c'è un confronto;
  - la riga «Totale» in fondo alla tabella, in CSV, xlsx, «Copia» e «Esporta tutto» (D9);
  - l'OPERATORE non cambia.
- **validation**: test puri e della pagina. Casi:
  - i totali sono uguali alle somme delle colonne;
  - «Risposta (%)» del totale è il tasso delle somme;
  - con due operatori in un ordine qualsiasi del falso la riga resta l'ultima;
  - la riga non è una barra;
  - le variazioni ci sono con un confronto e non con «Nessuno»;
  - CSV, TSV, il foglio xlsx del grafico e il suo foglio in «Esporta tutto» finiscono con «Totale»;
  - per l'OPERATORE niente totali.
- **status**: Complete
- **log**: 2026-11-10: worker sonnet, rivisto. `ChartResult.totals` e `Table.totalRow`; i quattro totali in `ChartPanel` solo a grafico pronto. Due asserzioni di `rankings.test.ts` aggiornate da Claude: la tabella ora finisce con «Totale» (AC15). Validazione d'onda: 411 test di Analisi verdi, typecheck, lint e tsc verdi.
- **files edited/created**: `analisi/_lib/{rankings,results}.ts`, `_components/{ChartPanel,DataTable}.tsx`, `_lib/_test/{totals.test.ts,rankings.test.ts}`, `_test/totals.test.tsx` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Il CSV di «Risposte per operatore» con due operatori finisce con la riga `Totale` con le somme e il tasso calcolato dalle somme.
- **review_mode**: cli
- **complexity**: medium

### T11: I grafici delle chiamate con «Oggi» (AC20, AC21, AC23, AC24, AC25 chiamate, D1, D10)
- **depends_on**: [T3, T9, T10, T14]
- **location**: `apps/web/src/routes/dashboard/analisi/_lib/{rankings,trends,results,export,calls}.ts`, `_components/charts/*`, test accanto e in `analisi/_test/`
- **description**:
  - le classifiche dell'admin usano le righe della risposta. Prima delle 08 col confronto «Periodo precedente» usano `comparisonRows`, con la nota, e i totali sono senza variazione (D1);
  - la serie dell'operatore è per ora, e una sola ora è «Un solo intervallo» con «Mostra 7 giorni»;
  - prima delle 08, la serie mostra il confronto senza barre di oggi, e la tabella mostra le ore di ieri;
  - con «Nessuno» o con l'anno prima c'è lo stato vuoto con «Vedi ieri», che cambia solo il confronto (AC24);
  - le altre azioni da «Oggi» portano a «Allarga a 7 giorni»;
  - nomi dei file e intestazioni di D10, con le ore della risposta.
- **validation**: test della pagina con `fakeAnalisi({ now })` (D12). Casi:
  - alle 15:20 le classifiche;
  - la serie con 8 ore e l'ultima in corso;
  - alle 07:15 i tre stati di AC24, admin e operatore;
  - «Vedi ieri» cambia solo `compare`;
  - i nomi dei file `mito_risposte-per-operatore_2026-11-10.csv` e `mito_analisi_2026-11-10.xlsx`;
  - l'intestazione «Oggi, 08:00–15:20» e il raggruppamento «per ora»;
  - export disabilitati senza tabella.
- **status**: Complete
- **log**: Worker (inherit) + revisione di Claude. RED oggiCalls passato senza modifiche; 12 casi in più e callsToday.test.ts (13). Prima delle 08: nota sopra il grafico (lead), righe di confronto per le classifiche, stato vuoto «Vedi ieri» che cambia solo il confronto. Header «Oggi, 08:00–15:20», nomi file con una data. Analisi 21 file / 239 test, typecheck e web:lint verdi.
- **files edited/created**: apps/web/src/routes/dashboard/analisi/{AnalisiPage.tsx,_components/{ChartPanel,DataSection,ExportAllButton,IndicatorTab}.tsx,_components/{useAnalisi,exportContext}.ts,_components/charts/{DrawnChart,OperatorCallsChart}.tsx,_lib/{results,calls,rankings,trends,export}.ts,_lib/_test/callsToday.test.ts,_test/oggiCalls.test.tsx}, apps/web/src/test/analisi.ts
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Analisi da admin con `range=today` alle 07:15, sul falso, mostra in «Risposte per operatore» le barre di ieri 11–19 con la nota «La giornata di lavoro inizia alle 8: vedi le ore di ieri».
- **review_mode**: cli
- **complexity**: high

### T12: Controllo dei grafici nel tempo con «Oggi» e i file (AC21, AC25)
- **depends_on**: [T11]
- **location**: `apps/web/src/routes/dashboard/analisi/_test/`
- **description**: test di «Esporta tutto» con «Oggi»: un foglio per grafico, quelli delle chiamate con le ore e quelli del finanziato con «Oggi, tutto il giorno»; confronto per ora fino agli stessi minuti nella tabella.
- **validation**: `pnpm web:test`.
- **status**: Complete
- **log**: Worker haiku, rivisto. 3 test di controllo verdi al primo giro (la funzione è di T11): «Oggi, tutto il giorno» nel finanziato e «Oggi, 08:00–15:20» nelle chiamate, sei fogli e mito_analisi_2026-11-10.xlsx, confronto con le ore solo per le chiamate. Analisi 22 file / 242 test.
- **files edited/created**: apps/web/src/routes/dashboard/analisi/_test/oggiExportAll.test.tsx
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: «Esporta tutto» con «Oggi» scrive nell'intestazione di «Finanziato totale» «Oggi, tutto il giorno» e in quella di «Risposte per operatore» «Oggi, 08:00–15:20».
- **review_mode**: cli
- **complexity**: low

### T13: Le ore nel seed locale
- **depends_on**: [T4]
- **location**: `src/server/db/seeds/local/generate/homeDay.ts`, `src/server/db/seeds/local/_test/homeDay.test.ts`
- **description**:
  - chiamate di oggi e di ieri del team sparse fra le 07 e le 20, con risposte e appuntamenti, rispetto al giorno del seed;
  - i numeri di `FULL_DAY` e `TYPICAL_DAY` non cambiano: le chiamate nuove sono di altri operatori.
- **validation**: un caso nuovo in `homeDay.test.ts`; poi `pnpm seed:local` e `pnpm seed:local:verify` su `mito_local`, e una lettura di `GET /home/call-trend?period=today` con più ore con valori e la chiamata fuori orario esclusa.
- **status**: Complete
- **log**: 2026-11-10: worker haiku fermo sul conflitto con AC5 del seeder (ogni ora del log a mezzogiorno). Omar ha scelto le ore vere per le chiamate del team di D e D-1. Claude ha applicato la patch del worker (`addTeamCalls`, deterministico) e ha esentato quelle chiamate, e la chiusura del contatto che chiudono, dal controllo di mezzogiorno in `contacts.test.ts`; nota in AC5 di seeder-locale. Seed: 389 test verdi; `seed:local`, `seed:local:cron` e `seed:local:verify` passati su `mito_local`, chiamate di oggi in ogni ora 07–20. Lettura dell'endpoint rinviata a T16 (serve la sessione).
- **files edited/created**: `src/server/db/seeds/local/generate/homeDay.ts`, `generate.ts`, `_test/{homeDay,contacts}.test.ts`, `brain/specs/crm/seeder-locale/SPEC.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Il seed genera per oggi chiamate in almeno 6 ore diverse fra le 08 e le 19, più una alle 07 e una alle 19.
- **review_mode**: cli
- **complexity**: low

### T14: Il finanziato con «Oggi» (AC22, AC25 finanziato)
- **depends_on**: [T9, T10]
- **location**: `apps/web/src/routes/dashboard/analisi/_lib/{trends,export}.ts`, test accanto
- **description**:
  - con «Oggi», «Finanziato totale» e «Finanziato medio per pratica» sono «solo numero», col motivo «Le pratiche hanno solo il giorno di liquidazione»;
  - «Finanziato per sede» conta il giorno;
  - il confronto è ieri o un anno prima;
  - «Contatti con esito» resta «Adesso»;
  - prima delle 08, il finanziato non cambia.
- **validation**: test puri e della pagina sui quattro grafici, compreso il 29 febbraio con l'anno prima, che non ha confronto («—»).
- **status**: Complete
- **log**: 2026-11-10: worker haiku, rivisto. `dayOnlyStatus` con «Solo il giorno» e il motivo di AC22. Il worker si è fermato su `widen`, che non aveva il caso 7 giorni: Claude l'ha aggiunto in `_lib/results.ts` (correzione di una riga). 213 test di Analisi verdi.
- **files edited/created**: `analisi/_lib/{trends,results}.ts`, `_lib/_test/financedToday.test.ts` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Con `range=today`, «Finanziato totale» è «solo numero» con il motivo «Le pratiche hanno solo il giorno di liquidazione» e la variazione rispetto a ieri.
- **review_mode**: cli
- **complexity**: low

### T15: Tempi ai volumi di riferimento (Constraints)
- **depends_on**: [T4, T11]
- **location**: `packages/server/src/services/home/_test/callTrend.perf.pg.test.ts` (nuovo, sul modello di `home.perf.pg.test.ts`, che resta com'è)
- **description**:
  - la fixture è quella dei Constraints: 15 operatori, 8 admin, 60.000 chiamate nei 90 giorni prima di oggi, e 400 chiamate di oggi sparse fra le 08:00 e le 15:20;
  - il `Clock` è fermo al 10/11/2026 alle 15:20 a Roma, così le ore di «Oggi» hanno chiamate a qualunque ora giri il test;
  - si misurano `getCallTrend` per i quattro periodi, e `callsByOperator` e `myCallSeries` con `range=today`.
- **validation**: `PERF=1 pnpm test:pg`, con `expect(ms).toBeLessThan(2000)` per ognuno. I tempi vanno in `IMPLEMENTATION-NOTES.md`.
- **status**: Complete
- **log**: Worker haiku, rivisto e rieseguito da Claude. Fixture dei Constraints (15 operatori, 8 admin, 60.000 chiamate in 90 giorni, 400 di oggi), Clock al 10/11/2026 15:20. Mediane: call-trend today 2 ms, 7d 5 ms, 30d 12 ms, 90d 27 ms; callsByOperator e myCallSeries di oggi 2–3 ms. Nessun indice. Il file da solo passa; il giro completo di test:pg ha timeout dell'hook DROP DATABASE su più file, vedi note.
- **files edited/created**: packages/server/src/services/home/_test/callTrend.perf.pg.test.ts
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: `call-trend` a 90 giorni sulla fixture sta sotto 2 s.
- **review_mode**: cli
- **complexity**: low

### T16: Controllo nel browser (AC3–AC8, AC10–AC12, AC13, AC15, AC18, AC19, Constraints accessibilità)
- **depends_on**: [T8, T12, T13, T14, T15]
- **location**: nessun file. `pnpm dev` su `mito_local` col seed di T13.
- **description**:
  - la home dell'admin a 1024, 1440 e 1920, e a 375 senza scorrimento della pagina;
  - i quattro periodi, l'etichetta di «Oggi», i vuoti, i tooltip al passaggio e da tastiera, anello e nome dei grafici;
  - i collegamenti che aprono Analisi con gli stessi totali;
  - scheletro senza salto ed errore con «Riprova», con la rete bloccata;
  - Analisi con «Oggi»: menu, «Raggruppa per», totali, riga «Totale», file scaricati.
- **validation**: nessun difetto aperto. Le misure vanno in `IMPLEMENTATION-NOTES.md`.
- **status**: Complete
- **log**: Claude nel browser interno su mito_local col seed di T13 (backend riavviato). Home: 1024 (barra laterale chiusa e aperta), 1440, 1920 senza scorrimento né trabocco; 375 senza scorrimento della pagina, ma con due difetti del telefono (vedi debito tecnico). Quattro periodi, «Oggi, 09:00–16:22», nome dei grafici, anello e tooltip da tastiera con le frecce, scheletro alla stessa altezza, 90 giorni a settimane (14 barre). I collegamenti aprono Analisi con gli stessi totali (90 giorni 5.596/4.030/1.922; Oggi 245/218/193). Analisi con «Oggi»: primo nel menu, group=hour, «Per ora», «Solo il giorno» del finanziato, riga «Totale». Errore con la rete bloccata e file scaricati non provati nel browser: li coprono i test di T7, T11 e T12.
- **files edited/created**: nessuno
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: browser
- **assigned_skills**: agent-browser
- **complexity**: medium

### T17: Le spec superate
- **depends_on**: [T16]
- **location**: `brain/specs/crm/{home-admin,export-chiamate,pagina-analisi}/SPEC.md`
- **description**: accanto ai criteri elencati nelle Technical Notes della spec, una nota «Superato da» o «Integrato da» [[specs/crm/andamenti-chiamate/SPEC]], senza riscriverli.
- **validation**: ogni criterio elencato ha la nota.
- **status**: Complete
- **log**: Claude. Note «Superato da» o «Integrato da» accanto a home-admin AC1, AC3, AC36; export-chiamate AC12–AC14, AC16–AC19 (per apps/web); pagina-analisi AC9–AC11, AC13–AC15, AC19, AC30, AC32. Nessun criterio riscritto.
- **files edited/created**: brain/specs/crm/{home-admin,export-chiamate,pagina-analisi}/SPEC.md
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

## 10. Copertura dei criteri

| Criterio | Task |
|---|---|
| AC1 | T7, T8 |
| AC2 | T4, T7 |
| AC3, AC4 | T6, T7, T16 |
| AC5 | T4, T6, T7 |
| AC6 | T6, T7 |
| AC7 | T6, T7, T16 |
| AC8 | T6, T7 |
| AC9 | T4 |
| AC10 | T6, T7, T16 |
| AC11 | T6, T7 |
| AC12 | T5, T7, T16 |
| AC13–AC16 | T10, T16 |
| AC17 | T8, T10 |
| AC18 | T1, T2, T9 |
| AC19 | T1, T9 |
| AC20 | T1, T2, T9, T11 |
| AC21 | T2, T3, T11 |
| AC22 | T14 |
| AC23 | T11 |
| AC24 | T1, T2, T3, T11 |
| AC25 | T11, T12, T14 |
| AC26 | T1, T2, T3 |
| AC27 | T1, T2, T4 |
| Constraints: tempi | T15 |
| Constraints: accessibilità | T7, T16 |
| Technical Notes: spec superate | T17 |

## 11. Strategia di test

- **Dominio** (T1): test a tabella, con istanti di Roma.
- **Servizi e HTTP** (T2–T4): `*.db.test.ts` con le factory, `it.effect`, `TestClock.setTime` su istanti fissi.
- **Puri del web** (T6, T9–T11, T14): stati, nomi, indirizzi e file.
- **Pagine** (T7, T10–T12): `renderWithApi` coi falsi; l'ora del falso decide le ore, non quella del browser.
- **Tempi** (T15): `PERF=1`.
- **Browser** (T7 sul suo pezzo, T16): layout, tastiera e file veri.

## 12. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Home e Analisi danno numeri diversi | Stesse funzioni (D5, D6), test di uguaglianza (T4) |
| `range` rompe le risposte di oggi di Analisi | Casi «senza `range` uguale a prima» in T2 e T3 |
| I test di «Oggi» dipendono dall'ora in cui girano | `Clock` e falsi fermi su istanti fissi (D12, T15) |
| Lo strato di accessibilità di recharts non dà nome, anello o tooltip | Verifica prima di T7; ci si ferma e si riferisce (D7) |
| Orologio del browser diverso dal server | Le ore vengono dalla risposta (D4) |
| Il cambio d'ora sposta le ore | Test del 29 marzo e del 25 ottobre (T1) |
| La serie del team su 90 giorni è lenta | Misura in T15; un indice solo con Omar |
| Togliere l'export rompe Next | Il pacchetto client e l'endpoint restano (D11) |

## 13. Gate di validazione

1. **Dopo l'onda 2 e dopo l'onda 5:** `pnpm exec tsc --noEmit`, `pnpm --filter @mito/web typecheck`, `pnpm run test --run`.
2. **Dopo l'onda 9:** `pnpm web:lint`, `pnpm web:test`, `pnpm web:build`, più i gate della root, `pnpm api:build` e `pnpm api:smoke`.
3. **T16** senza difetti aperti.
4. **`adversarial-review`**, perché `review.mode` è `total`, con il passaggio UI. Le BLOCKER si risolvono prima di finalizzare. Poi la PR verso `dev`.

## 14. Domande non risolte

Nessuna.

## 15. Verifica del piano

| Giro | Verdetto | Trovati | Correzioni principali |
|---|---|---|---|
| 1 | DO NOT SHIP | 4 MAJOR, 6 MINOR, 1 NIT | etichette e chiamanti del web in T1, col typecheck del web nel suo gate; costruttori dei test in T2 e T3; T13 dopo T4, con gli script veri del seed; un test dei tempi nuovo con `Clock` fermo, fixture dei Constraints e soglia (T15); `fakeAnalisi({ now })` (D12); niente `pinned` (D9); xlsx e «Esporta tutto» in T10; il raggruppamento «per ora» nell'intestazione; il 29 febbraio senza confronto anche per il finanziato (D4); T10 dopo T2 e T14 dopo T10; casi di AC27 e AC11; nome dell'endpoint e `unexpectedAs500` (D6) |

**Dopo il giro 1:** le correzioni sono nel piano. Erano tutte modifiche al piano, senza decisioni nuove sul prodotto, quindi nessun secondo giro di `adversarial-verifier`.

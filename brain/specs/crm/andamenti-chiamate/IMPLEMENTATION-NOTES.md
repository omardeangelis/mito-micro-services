---
domain: crm
type: implementation-notes
spec: andamenti-chiamate
links:
  - "[[specs/crm/andamenti-chiamate/SPEC]]"
  - "[[specs/crm/andamenti-chiamate/PLAN]]"
  - "[[specs/crm/andamenti-chiamate/REPORT]]"
ingested: false
last_ingested: null
created: 2026-11-10
updated: 2026-11-10
---

# Implementation Notes

## Execution Mode

- Mode: parallel, con le onde del §8 del piano. Le onde con un solo task corrono in sequenza.
- Delegation: supervised (`execution.delegation`). Claude scrive i test rossi e rivede ogni task.
- Escalations: nessuna.

## Deviations From the Plan

- G0: `origin/dev` non ha commit in più del branch, quindi nessun merge e nessuna migrazione da controllare.

## Surprises and Decisions

- T13: il seed locale teneva ogni ora del log a mezzogiorno (AC5 di seeder-locale). Domanda a Omar, che ha scelto le ore vere per le chiamate del team di oggi e di ieri. In locale, prima delle 19, le chiamate seminate dopo l'ora corrente sono «nel futuro» della giornata.
- D7 controllato sul recharts 3.10.1 installato: con `accessibilityLayer` la superficie ha `tabindex=0`, accetta `title` e attributi, e i tasti freccia muovono il tooltip (`keyboardEventsMiddleware`). L'anello si dà con un selettore CSS sul contenitore.

- `widen` di Analisi non aveva il caso «Allarga a 7 giorni»: l'ha aggiunto Claude durante T14, perché `widenAction("today")` dà 7 giorni (AC24).
- Il gate dopo l'onda 5 ha due rossi attesi nella home dell'admin (`AdminHome.test.tsx` «una GET per lettura», `contactSheet.test.tsx` «le quattro parti rileggono»): il falso conta già `getCallTrend`, la pagina lo legge da T7. Li sistema T7.
- `@mito/domain/utils/romeClock` ha già `romeWallToInstant`: `romeAt` di T1 va confrontato nel passaggio di `simplify`.

- T11: con «Oggi» `bucketsFor` resta sui giorni (solo il finanziato lo usa, e `bucketsOf` rifiuta `hour`); i file del finanziato con «Oggi» non hanno la riga «Raggruppamento», perché «per ora» sarebbe falso. Titolo dello stato vuoto prima delle 08: «Nessuna ora di oggi»; «Finestra» prima delle 08: «Oggi, prima delle 08:00». Il falso di Analisi risponde col giorno di `now` anche per finanziato e sedi con `range=today`.

- T7: `filterNull={false}` sul tooltip, così un buco dice «nessuna chiamata»; `minPointSize` 2 px per lo 0%. Nei test della home i titoli «Tasso di risposta» e «Tasso di appuntamento» compaiono due volte (striscia e grafici) e si leggono col primo.
- T8 fatto da Claude: rimozione piccola. I falsi del gruppo `export` restano, perché il contratto ha ancora il gruppo.
- T16: il backend locale andava riavviato per servire l'endpoint nuovo (404 prima).

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| Gate onda 2 (T1) | verde | dominio 160 test, `tsc`, typecheck del web |
| Gate onda 5 | verde salvo i rossi attesi | `tsc` e typecheck del web verdi; root 5.572 verdi, 1 rosso (rosso di T13); web 2.540 verdi, 4 rossi (rossi di T5 e T11, più i due della home sopra) |
| T15 tempi (`PERF=1`, mediana di 3) | verde | call-trend today 2 ms, 7d 5 ms, 30d 12 ms, 90d 27 ms; callsByOperator 3 ms e myCallSeries 2 ms con «Oggi». Budget 2.000 ms |
| Gate onda 9 | verde | `tsc` root; root 372 file / 5.573 test; web 178 file / 2.594 test; `web:lint`, `web:build`, `api:build`, `api:smoke` |
| T16 browser | verde salvo il telefono | home a 1024 (barra chiusa e aperta), 1440, 1920 senza trabocco; a 375 due difetti del telefono nel debito tecnico; totali uguali ad Analisi (90 giorni 5.596/4.030/1.922, Oggi 245/218/193) |

## Simplify

Quattro revisori (riuso, semplificazione, efficienza, altitudine) sul diff non committato. Applicato da Claude:

- `romeAt` (`contact/time.ts`) passa da `romeWallToInstant`, e il seed importa quello invece di averne una copia.
- `todayRange` prende il confronto del giorno da `comparisonHours` (null con «Nessuno» e col 29 febbraio): la regola del 29 febbraio non è più ripetuta nel server.
- `bucketsOf` prende `DayBucketing`: niente `throw` a runtime per `hour`.
- `CallTrendPeriod` è uno schema del contratto, usato dalla risposta, dalla query, dal server e dal web.
- `overHours` in `services/analytics/calls.ts` sostituisce i due `Effect.all` copiati.
- `CallHour` di Analisi viene dal contratto; `hoursSpan` e `comparisonHours` accettano liste `readonly` (via le copie); `trendHref` senza un ternario inutile.

Saltato, con il motivo:

- Una lettura in più di `calls_registry` con «Oggi» e confronto: il percorso dei giorni fa lo stesso, e costa meno di un millisecondo.
- Il «prima delle 08» dedotto da `hours: []` in cinque punti del web, le coppie `hours`/`days` nel contratto, e i controlli di `range === "today"` sparsi: cambiano il contratto o il modello di Analisi, fuori dalla misura di questo passaggio. Proposti come miglioramento.
- I falsi del gruppo `export` nei test del web: restano finché il contratto ha il gruppo (debito tecnico).
- `rateOf` della home contro `ratio` di Analisi, la didascalia «X su Y», i parametri opzionali di `fileName` e `effectiveGroup`: guadagno piccolo, tocca test che non servono.

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1–AC8 | Met | Sezione della home, periodi, grafici, tooltip da tastiera (T9–T11, T16) |
| AC9 | Met | Ore di Roma e confini semiaperti (T1–T3) |
| AC10–AC11 | Met | Collegamenti ad Analisi per i quattro periodi, anche nei vuoti e prima delle 08 |
| AC12 | Met | Scheletro alto quanto il pannello, righe che crescono quando vanno a capo, nessun movimento sui periodi, pulse con la variante ridotta (correzioni dopo la review) |
| AC13–AC17 | Met | Totali, riga «Totale», export di «Risposte per operatore» |
| AC18 | Met | Con «Oggi» Analisi non rilegge al ritorno sulla scheda (decisione di Omar dopo la review: `refetchOnWindowFocus` spento per `range=today`) |
| AC19 | Met | Con «Oggi» solo «Per ora»; le altre voci restano disabilitate |
| AC20 | Met | Il 29 febbraio con l'anno prima: «—» nella colonna e nella variazione, «Stesso periodo, anno prima: —» nell'export (correzione dopo la review, `leapDay.test.ts`) |
| AC21–AC24 | Met | Stati di «Oggi», prima delle 08 con «Vedi ieri» |
| AC25 | Met | Export vecchio fuori da `apps/web` (T8) |
| AC26–AC27 | Met | Server: conto orario, stessa definizione di chiamata dell'export |
| Constraints: tempi | Met | Mediane fino a 28 ms contro 2.000 ms (T15) |
| Constraints: accessibilità | Met | Nomi, anelli e contrasto; voci dei gruppi di bottoni a 24 px nel componente condiviso (decisione di Omar: niente debito tecnico nuovo), anche «Ordina per» della home |

## Out of Scope Observations

- `PERF=1 pnpm test:pg` completo: l'`afterAll` di `src/test/pg.setup.ts` (DROP DATABASE) va in timeout su più file (copyCheck, read.perf, localDb), non solo su quello nuovo. Sembra contesa fra i file pg in parallelo; il file di T15 da solo passa.

- Il falso di Analisi, con `range=today`, dà alla serie del finanziato i giorni di ottobre senza filtrarli: i test di T12 leggono solo le intestazioni, quindi non ne sono toccati.

- Prima delle 08 con «Periodo precedente», se ieri 11–19 nessuno ha chiamato, le classifiche dell'admin cadono su «Nessuna chiamata nella finestra», che nomina la finestra di oggi. Caso raro; potrebbe avere un testo suo.
- Prima delle 08 la legenda di «Risposte per operatore» dell'operatore elenca ancora «Con risposta» e «Senza risposta», senza barre di oggi.

## Review

`adversarial-review` (caso B): DO NOT SHIP al giro 1 con cinque MAJOR, SHIP al giro 2 dopo le correzioni ([[specs/crm/andamenti-chiamate/REPORT]]). Le correzioni:

- AC20: `leapDayGap`, `LEAP_DAY_DELTA` e `withGap` in `_lib/results.ts`, usati da `trends.ts`, `rankings.ts` ed `export.ts`; `_lib/_test/leapDay.test.ts` sostituisce il test del 29 febbraio che usava `compare: "none"`.
- `CallTrend.tsx`: `minHeight` al posto di `height` su testa, riga del tasso e pannello; gruppo dei periodi con `flex-wrap`; `transition-none` sulle voci; `motion-reduce:animate-none` sullo scheletro. Il test dello scheletro ora confronta `minHeight` (stesso significato: alto quanto il pannello con le righe su una riga).

## Remaining Work

Nessuna. Le due decisioni dopo la review sono applicate: «Oggi» in Analisi non rilegge al ritorno sulla scheda; la voce `sm` di `toggle-group.tsx` è alta 24 px.

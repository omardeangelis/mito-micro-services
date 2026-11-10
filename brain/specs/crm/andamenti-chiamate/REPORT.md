---
domain: crm
type: review
scope: spec
spec: andamenti-chiamate
review_target: spec implementation
base_ref: fe9d34c9
head_ref: working tree non committato di claude/home-spec-dopo-wave
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/andamenti-chiamate/RUBRIC]]"
  - "[[specs/crm/andamenti-chiamate/SPEC]]"
  - "[[specs/crm/andamenti-chiamate/PLAN]]"
  - "[[specs/crm/andamenti-chiamate/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-11-10
updated: 2026-11-10
---

# Review Report: Andamenti delle chiamate

## Verdict

**SHIP** · impact: critical · giro 2

Al giro 1 tre passaggi su nove tornavano DO NOT SHIP con cinque MAJOR, nessun BLOCKER: il «—» del 29 febbraio (AC20, v2), le righe della sezione della home che traboccavano quando andavano a capo e il gruppo dei periodi fuori dalla scheda (v8), due movimenti attorno ai grafici (v9). Corretti tutti e cinque; al giro 2 un verificatore a contesto pulito li dà risolti, con i gate verdi. Dopo il giro 2 Omar ha deciso i due MINOR aperti, ora corretti: «Oggi» in Analisi non rilegge al ritorno sulla scheda, e le voci dei gruppi di bottoni sono alte 24 px. Restano i MINOR e i NIT sotto.

## Giro 2 (2026-11-10)

Un `adversarial-verifier` (Sonnet) sui soli cinque MAJOR, contro AC12, AC20, pagina-analisi AC11, il `CLAUDE.md` della radice e la convenzione del movimento ridotto.

| Finding del giro 1 | Correzione | Evidenza | Esito |
|--------------------|------------|----------|-------|
| AC20, il 29 febbraio | `leapDayGap`, `LEAP_DAY_DELTA` e `withGap` in `analisi/_lib/results.ts`; applicati in `trends.ts` (finanziato, media, chiamate e appuntamenti dell'operatore) e in `rankings.ts` (chiamate dell'admin coi quattro totali, appuntamenti); `comparisonLabel` di `export.ts` dà «Stesso periodo, anno prima: —» | `_lib/_test/leapDay.test.ts`, 6 test con `compare: "last-year"`: colonna del confronto con celle vuote, variazione «—» con la nota, «Nessuno» invariato con `compare: "none"`; il test vacuo di `financedToday.test.ts` è uscito | RESOLVED |
| Righe che traboccano | `ChartHead`, riga del tasso e pannello con `minHeight` al posto di `height`; il titolo va a capo con `flex-wrap` | Scheletro alto quanto il pannello con ogni riga su una riga (`callTrend.test.tsx`, ora su `minHeight`); nel browser a 520 px col testo a 1,25×: righe che crescono, 0 sovrapposizioni, 5 px fra il tasso e il grafico | RESOLVED |
| Gruppo dei periodi fuori dalla scheda | `max-w-full flex-wrap` sul gruppo | Nel browser a 520 px: le voci vanno a capo dentro la scheda, nessuno scorrimento orizzontale | RESOLVED |
| Transizione sulla voce scelta | `transition-none` su `ToggleGroupItem` in `CallTrend.tsx`; `components/ui/toggle.tsx` invariato | Sonda `cn()`: twMerge toglie `transition-[color,box-shadow]`; nel browser `transitionProperty: none` | RESOLVED |
| Pulse senza variante ridotta | `motion-reduce:animate-none` sullo scheletro | Sonda `cn()`: le due classi restano | RESOLVED |

Corretti anche i due NIT di v3 e v6: l'import inutile di `CallTrend` in `api/home.ts` e il commento del contratto, ora sopra `CallTrend`.

Gate dopo le correzioni: `tsc` della radice 0; `web:lint` 0 senza avvisi; web 179 file, 2.599 test; radice 5.573 test; `web:build`, `api:build`, `api:smoke` verdi. Il verificatore ha rieseguito i test di Analisi e della home (38 file, 472 test) e `web:lint`.

Dopo il giro 2, su decisione di Omar:

- AC18: `useAnalysis` di `apps/web/src/api/analytics.ts` spegne `refetchOnWindowFocus` quando la query ha `range=today`, come la home; gli altri periodi rileggono come prima. Due test in `api/_test/analisi.test.tsx`, il primo visto fallire prima della correzione.
- Bersagli: in `components/ui/toggle-group.tsx` la voce `sm` è alta 24 px come `default` (WCAG 2.5.8, voci a contatto). Cambia anche «Ordina per» di «Dettaglio giornaliero»; nel browser i due gruppi misurano 30 px, voci 24 px, dentro la scheda.

Nuovi NIT del giro 2: `ChartHead` ha `gap-x-3` senza `gap-y`, quindi il collegamento andato a capo sta attaccato al titolo; nessun test fissa il 29 febbraio sul tasso di appuntamento dell'operatore e sulla classifica degli appuntamenti dell'admin (coperti nel codice).

## Coverage

- Rubric passes run: 9/9. v1, v2, v5 sul modello più forte (Opus); v3, v4, v6, v7, v8 su Sonnet; v9 su Haiku.
- Passes skipped or failed: nessuno.
- UI pass: ran su http://localhost:5175/dashboard (sezione «Andamento delle chiamate») e su `/dashboard/analisi?chart=calls&range=today` e `?chart=financed&range=today`, in Chromium headless (agent-browser 0.27.1). Parzialmente `DEGRADED`: niente axe (contrasto calcolato nella pagina); gli stati di errore, vuoto e prima delle 08 non si sono raggiunti dal vivo (i mock di `network route` non intercettavano) e sono giudicati dal codice; Mobile Safari non provato.

## Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR, risolto al giro 2 | v2 — ore di Roma e finestre | `apps/web/src/routes/dashboard/analisi/_lib/trends.ts:112, 226, 301, 546, 605`; `_lib/results.ts:158`; test `_lib/_test/financedToday.test.ts:86-101` | AC20: il 29 febbraio, con «Oggi» e «Stesso periodo, anno prima», il server dà `comparison: null` (corretto), ma il web lo legge come «nessun confronto»: toglie la colonna del confronto e la variazione è vuota, invece di «—» come pagina-analisi AC11. Il test intitolato al 29 febbraio usa `compare: "none"` e non prova il caso. | Con `range=today`, `compare=last-year` e confronto null: colonna del confronto con «—» e variazione di tipo «none»; un test con `compare: "last-year"`. Oppure Omar accetta il comportamento. | no |
| MAJOR, risolto al giro 2 | v8 — UI | `apps/web/src/routes/dashboard/home/_components/trend/CallTrend.tsx` (`ChartHead` a `HEAD_REM` 1,5 rem, riga del tasso a `RATE_REM` 1,25 rem) | Le righe hanno l'altezza fissa: quando titolo, collegamento o tasso vanno a capo traboccano, e la riga del tasso copre il «100%» del grafico. Con il testo a 1,25× (root 20 px) a 1010–1060 px di finestra (pannello 298–316 px): testa +9 px, tasso +23 px. Con il testo normale da ~570 px in giù. | Righe che crescono col contenuto (`min-height`) con lo scheletro allineato; oppure titolo su una riga e tasso troncato; oppure il passaggio a due colonne più tardi. | no |
| MAJOR, risolto al giro 2 | v8 — UI | `CallTrend.tsx`, gruppo dei periodi (`[role=radiogroup]`) | Il gruppo (298,9 px) non va a capo ed esce dalla scheda da ~564 px di finestra in giù (da ~700 px col testo a 1,25×), sopra i ~420 px del rinvio del layout del telefono. «90 giorni» resta tagliato. | `flex-wrap` sul gruppo, o l'intestazione in colonna sotto ~700 px. | no |
| MAJOR, risolto al giro 2 | v9 — motion | `CallTrend.tsx:222` (`ToggleGroupItem`), da `apps/web/src/components/ui/toggle.tsx:9` | La voce scelta dei periodi anima ombra e colore del testo in 150 ms (`transition-[color,box-shadow]`), mentre sfondo e bordo scattano: un controllo usato decine di volte al giorno va istantaneo. | `transition-none` sulla voce in `CallTrend.tsx`, senza toccare il componente condiviso. | no |
| MAJOR, risolto al giro 2 | v9 — motion | `CallTrend.tsx:169-172` (`TrendSkeleton`), da `apps/web/src/components/ui/skeleton.tsx:7` | `animate-pulse` senza la variante per il movimento ridotto, contro la convenzione di `brain/chore/motion-stack.md:26` (come in `analisi/_components/ChartState.tsx:55-56`). | `motion-reduce:animate-none` sullo scheletro. | no |
| MINOR, corretto | v5 — stati di «Oggi» | `apps/web/src/api/analytics.ts:47-57`, `api/queryClient.ts` | AC18 «la pagina non si rilegge da sola»: con `range=today` Analisi rilegge al ritorno sulla scheda (`refetchOnWindowFocus` di default), e dopo un'ora nuova la finestra si sposta; la home lo spegne (OQ8), Analisi no. Comportamento di Analisi già esistente. | `refetchOnWindowFocus: false` per le letture con `range=today` e un test; oppure Omar conferma che il ritorno sulla scheda non è «da sola». | sì |
| MINOR, corretto | v8 — UI | `apps/web/src/components/ui/toggle-group.tsx:12` (`size="sm"`, `h-5`) | Le voci dei periodi sono alte 20 px, senza spazio fra loro: sotto i 24 px di WCAG 2.5.8. Componente condiviso, primo uso nella home. | `h-6` per `sm`, o una riga nel Project bar che accetti l'eccezione. | sì |
| MINOR | v8 — UI | `TrendChart.tsx` | I valori delle barre arrivano solo dal tooltip visibile al fuoco: niente `aria-live`, nessuna prova con un lettore di schermo. | Default: accettato per AC7 così com'è scritto (puntatore e fuoco). | sì |
| MINOR | v1 — autorizzazione | `apps/web/src/routes/dashboard/home/_test/AdminHome.test.tsx:103-116` | Il test dell'operatore non controlla `getCallTrend: 0` né l'assenza della regione. Coperto in parte da `trend/_test/callTrend.test.tsx:106-111` (`callTrendReads` vuoto per l'OPERATORE). | `getCallTrend: 0` e `queryByRole("region", …)` nulla. | no |
| MINOR | v6 — totali ed export | `apps/web/src/routes/dashboard/analisi/_test/oggiExportAll.test.tsx` | Nessun test della pagina controlla la riga «Totale» nel foglio «Risposte per operatore» di «Esporta tutto» (stessa tabella di CSV e xlsx, provata in `totals.test.ts:96`). | Un'asserzione sull'ultima riga del foglio. | no |
| MINOR | v4 — prestazioni | `packages/server/src/services/home/_test/callTrend.perf.pg.test.ts` | La fixture ha solo righe `call`: il ramo `state_change` di `isCallIn` non si misura. Tempi 70× sotto la soglia. | Aggiungere righe non di chiamata alla fixture. | sì |
| NIT | v6 | `apps/web/src/api/home.ts:10` | `web:lint` avvisa `'CallTrend' is defined but never used`. Corretto al giro 2. | Togliere l'import. | no |
| NIT | v3 | `packages/contract/src/home.ts` | Il commento «Andamento delle chiamate» sta sopra `CallTrendPeriod`; `CallTrend` resta senza commento. Corretto al giro 2. | Spostare il commento. | no |
| NIT | v3 | `packages/contract/src/analytics.ts` | `hours`, `comparisonHours`, `comparisonRows` sono `NullOr` obbligatori: un client nuovo su un server vecchio non decodifica. Irrilevante col rilascio del backend prima. | Nessuna. | no |
| NIT | v5 | `_components/useAnalisi.ts:217-219` | Dopo mezzanotte il primo nuovo render cambia la chiave e rilegge «Oggi». | Nessuna. | no |
| NIT | v5 | `_components/GroupSelect.tsx:54-64` | Con «Oggi» il menu elenca disabilitati anche gli altri raggruppamenti; AC19 dice «offre solo per ora». Stesso schema di pagina-analisi AC13. | Nessuna, o nasconderli. | no |
| NIT | v5 | `GroupSelect`, grafici del finanziato | Con «Oggi» il finanziato mostra «Per ora» mentre il grafico è del giorno (l'export lo gestisce). | Nessuna. | no |
| NIT | v2 | `packages/domain/src/analytics/_test/hours.test.ts` | `spans()` ha un parametro `offset` morto. | Toglierlo. | no |
| NIT | v4 | `callTrend.perf.pg.test.ts` | Mediana di 3 a cache calda. | Nessuna. | no |
| NIT | v7 | `home/_lib/callTrend.ts`, `api/home.ts` | Settimana tagliata «(parziale)»; `useRefreshAdminHome` invalida ogni periodo in cache al ritorno sulla pagina. Entrambi conformi. | Nessuna. | no |
| NIT | v9 | `ui/skeleton.tsx:7` | Il pulse è `ease-in-out` su un ciclo perpetuo. | Solo se il pulse resta. | no |

## What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — autorizzazione | `getCallTrend` con `AdminOnly` nel contratto e nel server; test db di `NotAdmin` e `Unauthorized` (19 verdi). `myCallSeries` filtra `actor.operatorId` sulle ore e sul confronto, con test che scoprirebbero una fuga (`analisiOggi.db.test.ts:314`, `:441`). Dati dell'admin letti solo per ADMIN e disegnati solo per `adminCalls`; negativo dell'operatore in `totals.test.tsx`. |
| v2 — ore di Roma | Sonda di `todayHours`/`comparisonHours` ogni 37 s su nove giorni (cambi d'ora, 29/02/2028, 10/11/2026) sotto cinque fusi del processo: 21.015 istanti per fuso, 0 differenze. Confini semiaperti (15:59:59.999 / 16:00:00 provati), chiamate fuori orario escluse solo da «Oggi», giorni invariati, `now` solo dal `Clock` del server, stessa definizione di chiamata dell'export, AC8/AC9. 734 + 361 test verdi. |
| v3 — contratto e convenzioni | `range` decodifica stretto; i percorsi senza «Oggi» invariati; nessun cambiamento in `src/server/api`, `src/app`, `services/export/callStats.ts`; `Effect.fn`, `Effect.fn.Return`, `unexpectedAs500`; niente import di Next o `@/`; SQL parametrizzato; seed puro. `tsc` 0, 616 test mirati verdi. |
| v4 — prestazioni | Le espressioni di Roma solo in SELECT/GROUP BY, il filtro su `created_at` usa l'indice. Mediane: trend today 3 ms, 7d 4, 30d 11, 90d 28; `callsByOperator` 4, `myCallSeries` 3. Fixture dei Constraints, totali asseriti. |
| v5 — stati di «Oggi» | AC18–AC24 nel codice e nei test della pagina: ordine del menu, `range=today`, raggruppamento normalizzato nei due sensi, confronto iniziale, ore, «Un solo intervallo» alle 08:00:00, finanziato «Solo il giorno», prima delle 08 con «Vedi ieri» che cambia solo il confronto, righe di ieri per l'admin senza variazione, «Allarga a 7 giorni». 242/242. |
| v6 — totali ed export | AC13–AC17 e AC25: totali dalle stesse righe della tabella, nessuna variazione senza confronto, «Totale» ultima e non barra, stesse righe in CSV/TSV/xlsx, export vecchio sparito senza import pendenti, nomi e intestazioni dei file. `web:lint` 0, `tsc` 0. |
| v7 — sezione della home | AC1, AC3–AC8, AC10–AC12: ordine e periodo iniziale non ricordato, intervalli, null contro 0%, tooltip da tastiera, collegamenti per i quattro periodi, vuoti coi collegamenti, query propria con «Riprova» solo sua. 284 test verdi. |
| v8 — UI | A 1280 px pulita: anelli che racchiudono il bersaglio, contrasto (minimo 3,26:1 per il riempimento delle barre), tooltip con nome, tasso e due conteggi, ordine di Tab, scheletro alto quanto il contenuto (329 px in ogni periodo). Analisi: striscia dei totali come lista di definizioni, «Totale» ultima riga, finanziato «Solo il giorno». |
| v9 — motion | Barre, tooltip e cursore di recharts senza animazione; nessuna transizione nel passaggio scheletro → dati; i grafici di Analisi non aggiungono movimento. |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Autorizzazione | SHIP | Endpoint e serie dell'operatore chiusi; resta un'asserzione mancante nel test della home. |
| v2 | Ore di Roma e finestre | DO NOT SHIP → SHIP al giro 2 | Tutto corretto tranne il «—» del 29 febbraio (AC20), con un test vacuo; corretto e provato. |
| v3 | Contratto e convenzioni | SHIP | Additivo, compatibile, convenzioni rispettate; due NIT. |
| v4 | Prestazioni | SHIP | 28 ms al massimo contro 2 s, indice usato. |
| v5 | Stati di «Oggi» in Analisi | SHIP | AC18–AC24 rispettati; il ritorno sulla scheda rilegge (MINOR). |
| v6 | Totali, «Totale», export | SHIP | AC13–AC17 e AC25 rispettati; un test di pagina in meno. |
| v7 | Sezione della home | SHIP | Nessuno scostamento dalla spec. |
| v8 | UI | DO NOT SHIP → SHIP al giro 2 | Righe ad altezza fissa che traboccano quando vanno a capo; gruppo dei periodi che esce dalla scheda sopra il rinvio del telefono. |
| v9 | Motion | DO NOT SHIP → SHIP al giro 2 | Transizione sulla voce scelta dei periodi e pulse senza variante ridotta. |

## Human Review Checklist

1. Fatto al giro 2. Dopo ogni modifica successiva, rieseguire i gate del `CLAUDE.md` della radice: `pnpm web:lint`, `pnpm web:test`, `pnpm web:build`, `pnpm exec tsc --noEmit`, `pnpm run test --run`, `pnpm api:build`, `pnpm api:smoke`. Buono: tutti verdi, e `web:lint` senza l'avviso di `CallTrend`.
2. Da OPERATORE su `/dashboard`: nessuna sezione «Andamento delle chiamate», e `GET /api/v1/home/call-trend?period=7d` risponde 403. Su Analisi con `range=today` l'operatore vede solo le sue ore, senza totali né «Totale».
3. Su `mito_local`, a un orario dopo le 08: la home con «Oggi» mostra al massimo 8 ore, l'ultima «(in corso)», e i suoi totali sono quelli di Analisi con «Oggi». Il collegamento a 90 giorni apre Analisi con gli stessi totali.
4. Confini d'ora e ora legale: rieseguire `pnpm run test --run packages/domain/src/analytics packages/server/src/http/_test/analisiOggi packages/server/src/services/analytics` e controllare che passino i casi 15:59:59/16:00:00, 07:59:59, 19:00 e i giorni del cambio d'ora.
5. 29 febbraio: dopo la correzione, un test con `compare: "last-year"` mostra «—» nella colonna del confronto con «Oggi».
6. La home a 1024, 1440 e 1920 px e col testo del browser al 125%: titolo, collegamento e riga del tasso non coprono il grafico, e il gruppo dei periodi resta nella scheda.
7. In `apps/web` nessun download di `chiamate_<dal>_<al>.xlsx`; nella dashboard di Next l'export «Chiamate per operatore» scarica ancora il file.
8. `PERF=1` sul solo `callTrend.perf.pg.test.ts`: tutti i tempi sotto 2.000 ms.
9. Fatto: Omar ha deciso che «Oggi» in Analisi non rilegge al ritorno sulla scheda (AC18), e che le voci dei gruppi di bottoni vanno a 24 px nel componente condiviso. Controllo: Analisi con «Oggi», cambiare scheda e tornare: nessuna nuova lettura; «Periodo» e «Ordina per» della home con voci alte 24 px.

## Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1 | Met | v7, v6 |
| AC2 | Met | v1 |
| AC3–AC8 | Met | v7; AC7 da tastiera anche in v8 |
| AC9 | Met | v2 |
| AC10–AC11 | Met | v7 |
| AC12 | Met (giro 2) | Grafici senza animazione, voce dei periodi istantanea, pulse con la variante ridotta (v9); scheletro alto quanto il pannello, righe che crescono quando vanno a capo (v8) |
| AC13–AC17 | Met | v6, v1 |
| AC18 | Met | v5; dopo il giro 2 «Oggi» non rilegge al ritorno sulla scheda (`refetchOnWindowFocus` spento solo per `range=today`, test in `api/_test/analisi.test.tsx`) |
| AC19 | Met | v5 (le altre voci restano, disabilitate) |
| AC20 | Met (giro 2) | «—» nella colonna e nella variazione il 29 febbraio con l'anno prima, `leapDay.test.ts` |
| AC21–AC24 | Met | v5 |
| AC25 | Met | v6 |
| AC26–AC27 | Met | v2 |
| Constraints: tempi | Met | v4 |
| Constraints: accessibilità | Met | v8: nomi, anelli e contrasto; dopo il giro 2 voci dei periodi a 24 px (misurate nel browser) |

## Notes for docs-maintenance

- Durable findings to fold into `brain/tech-debt/crm/andamenti-chiamate.md`: i valori delle barre solo dal tooltip, la fixture delle prestazioni con sole righe `call`.
- Domain pages that should backlink this review: le pagine del dominio crm sulla home dell'admin e su Analisi, quando `docs-maintenance` ingerisce la spec.

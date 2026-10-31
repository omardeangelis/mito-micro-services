---
domain: crm
type: implementation-notes
spec: pagina-analisi
links:
  - "[[specs/crm/pagina-analisi/SPEC]]"
  - "[[specs/crm/pagina-analisi/PLAN]]"
ingested: false
last_ingested: null
created: 2026-10-30
updated: 2026-10-30
---

# Implementation Notes: Pagina Analisi

## Summary

- **Fatto:** la pagina `/dashboard/analisi` di `apps/web` con sei grafici per l'ADMIN e cinque per l'OPERATORE, una sola finestra di dati con il confronto, l'export di ogni grafico e «Esporta tutto», gli stati di ogni grafico. Sotto ci sono:
  - le regole di calendario nel dominio;
  - quattro endpoint `HttpApi` (`getFinancedSeries`, `getBranchTotals`, `getCallsByOperator`, `getMyCallSeries`);
  - il registro conservato 25 mesi, con il job di pulizia negli scheduler (in pausa);
  - il seed locale che segue la conservazione.
- **Il prototipo è cancellato:** `apps/web/src/prototypes/analisi/`, la sua rotta di sviluppo in `router.tsx`, `apps/web/prototypes/scenario.css` e la voce `web-prototype` di `.claude/launch.json`.
- **Revisione:** cinque giri. Dopo il terzo e il quarto, due decisioni di Omar su AC19: le classifiche degli operatori mostrano i primi 8, e le note stanno dentro il riquadro del grafico (§ AC19 e le classifiche, § Le note dentro il riquadro). Il quinto giro ha portato anche la legenda nel riquadro; il sesto dice SHIP (§ Revisione indipendente, giri 5 e 6).
- **Gate verdi** sull'albero finale (§ Sanity Checks). Niente è committato.

## Execution Mode

- **Modo:** `parallel`, a wave come nel §10 del piano. Le wave da un solo task (6–10) girano come wave da uno.
- **Delega:** `supervised` (`brain.config.json`). Il supervisore scrive il test rosso di ogni task, lo affida a un worker del livello della sua `complexity` (`low` → haiku, `medium` → sonnet, `high` → il modello del supervisore) e rivede diff e validazione prima di chiuderlo.
- **Escalation:** nessuna scala formale. Il supervisore ha corretto a mano tre risultati invece di rimandarli: T1 (aiutanti dei giorni), T11 (confronto dalla query), T15 (`ChartContainer` riscritto, annullato). T17 ha avuto un secondo giro per il test di AC23. Le correzioni delle revisioni le ha scritte il supervisore, ognuna con il suo test rosso.

## Deviations From the Plan

- **G0, branch:** si lavora sul branch del worktree, `claude/analysis-page-charts-alignment-97c602`, nato da `dev` a `632b7b12` (uguale a `origin/dev` al via), invece di `claude/pagina-analisi` (D1). Rinominare il branch del worktree dell'app non serve: la PR parte da questo.
- **G0, commit:** nessun commit durante l'esecuzione; il prototipo non entra in un commit, perché T19 lo cancella prima della PR. Si committa solo quando Omar lo chiede.

## Surprises and Decisions

- **Giorni senza zod (T1).** `window.ts` serve anche al browser, e `export/period.ts` porta zod. `isDay`, `addDays`, `addMonths` e `noonOf` stanno ora in `packages/domain/src/utils/calendarDays.ts`, che `period.ts` importa. Nello stesso passaggio `isDay` non lancia più su un giorno con la forma giusta ma inesistente («2026-13-45»): prima `toISOString` dava RangeError, anche dentro il refine di `exportPeriodInput`.
- **`bucketsOf` prende anche `compare` (T2).** Su «Gli ultimi 12 mesi» il periodo precedente ha le stesse date dell'anno prima, ma AC11 lo sposta in giorni e non in mesi: dalle sole date non si distingue.
- **Prova di carico delle chiamate (T7, D15):** 12,1 ms e 9,3 ms di mediana su 100.000 righe in 25 mesi, contro un limite di 500 ms. Nessun indice e nessuna migrazione.
- **Il confronto degli intervalli viene dalla query (T11).** Il worker lo ricavava dalle date della risposta; su 12 mesi che attraversano un 29 febbraio le due regole danno le stesse date ma spostamenti diversi. Ora vale il `compare` della query, che è nella sua chiave.
- **Formule nei file (T13).** Un nome di sede o di operatore che comincia con `=`, `+`, `-` o `@` va nel CSV e negli appunti con un `'` davanti: i nomi vengono dagli import.
- **`tabindex="-1"` di recharts (T15).** Il test del supervisore vietava ogni `tabindex` nel grafico, ma recharts 3.10.1 mette `tabindex="-1"` sui suoi layer e sul tooltip: non sono punti di sosta del Tab, quindi il test ora cerca i soli punti di sosta. Il worker aveva riscritto `ChartContainer` per far disegnare i grafici in jsdom: modifica annullata, il helper dei test usa il `ResizeObserver` finto dei test della home.
- **Test di AC23 deterministico (T17).** Cambiava il ruolo di `/me` dopo il primo disegno, in corsa con la rilettura della guardia; il worker di T17 l'aveva aggirato smontando il `Popover` del calendario. Ora `/me` dice ADMIN alla prima lettura e OPERATORE dalle successive, e il calendario torna al `Popover` del design system (AC8).
- **Un test in più dei 3 mesi (T3).** Anche `src/app/api/cron/cleanupTaskEventLog/_test/cleanupTaskEventLog.db.test.ts` fissava i 3 mesi, sulla route di Next: aggiornato come gli altri sei, con il confine al millisecondo.

## Passaggio di `simplify` (prima della revisione)

Quattro revisori (riuso, semplificazione, efficienza, livello) e tre worker su file separati. Dopo: `web:test` 1.639, `web:lint` e `web:build` verdi, `tsc` 0, 1.396 test di server e dominio verdi, pagina riprovata nel browser.

**Applicato:**
- **Server:**
  - `financed()` e `inComparison()` di `financed.ts` sono usati dalla serie, così la regola «finanziata» è una sola;
  - `withComparison` in `range.ts` sostituisce quattro copie di «finestra e confronto in parallelo»;
  - `romeDayOf` va in `shared/sql.ts`;
  - via l'alias `instantsOf`.
- **Dominio:** `parseDay`, `firstOfMonth`, `lastOfMonth`, `monthsBetween` e `isWholeMonths` stanno in `calendarDays.ts`, al posto delle copie in `window.ts` e `buckets.ts`.
- **Librerie della pagina:**
  - KPI, note e stati delle chiamate sono comuni in `_lib/calls.ts`; `rankings.ts` non importa più da `trends.ts`;
  - una sola `isExportable`;
  - via `widen` di `urlState.ts`, che non aveva chiamanti;
  - le righe si indicizzano una volta per risposta e gli intervalli si calcolano una volta per risposta;
  - un solo `useAnalysis` per i cinque hook.
- **Export:** la protezione dalle formule copre anche le righe d'intestazione («Dati di» è un nome), ma solo i valori di testo: un numero negativo resta un numero.
- **Componenti:**
  - il `useMemo` delle viste dipendeva dai risultati di `useQuery`, che sono proxy nuovi a ogni disegno: ogni disegno ricostruiva i sei risultati e passava a recharts dati nuovi. Ora dipende da `data` ed `error`;
  - `window` e `comparison` del risultato e `page` del pannello sono obbligatori; `stateOf` ha una tabella per grafico;
  - «Copia» usa `useCopyToClipboard`;
  - la media query della striscia ha la sottoscrizione fuori dal componente;
  - `PanelBoundary` manda l'eccezione a Sentry.
- **Grafici:** `PointTooltip`, `RankingChart`, `ComparisonLine`, `paint` e `separated` stanno in `charts/parts.tsx`, e una tabella `BY_SHAPE` prende il posto di tre `switch`.

**Saltato, con il motivo:**
- **Toast della sessione con un `id` al posto di `toastErrors: "session"`:** i grafici non mostrerebbero più il toast di `Unauthorized`.
- **`NotAdmin` gestito nel `QueryCache` di tutta l'app:** cambierebbe il comportamento delle altre pagine.
- **La sottoquery dei clienti dell'operatore in comune con la home:** le regole dell'admin sono diverse di proposito (D9), e la modifica toccherebbe la home.
- **`isCallIn` in un modulo neutro:** due file da spostare, per poco guadagno.
- **I `Number()` attorno ai valori SQL già convertiti:** dipende da cosa restituisce il driver di prod.
- **Il formattatore di `DD/MM/YYYY` e quello dell'ora di Roma condivisi con la home e l'import:** codice fuori dal diff.
- **`isDay` di `contact/listInput.ts`:** fuori dal diff.

## Per Omar: il job di pulizia nello staging che esiste già (T8, D17)

`setup-staging.sh` ora crea il job, ma rilanciarlo fallirebbe sul service account, che esiste già. Per lo staging di oggi bastano questi due comandi, da lanciare insieme, perché il job nasce acceso fino alla pausa:

```bash
gcloud scheduler jobs create http mito-crm-staging-cleanup-task-event-log --project=mito-crm --location=europe-west3 --schedule="17 1 * * *" --time-zone=Etc/UTC --uri=https://mito-crm-staging-869830994359.europe-west3.run.app/internal/cron/cleanup-task-event-log --http-method=POST --oidc-service-account-email=mito-crm-scheduler-staging@mito-crm.iam.gserviceaccount.com --oidc-token-audience=https://mito-crm-staging-869830994359.europe-west3.run.app --attempt-deadline=30m --max-retry-attempts=0
```

```bash
gcloud scheduler jobs pause mito-crm-staging-cleanup-task-event-log --project=mito-crm --location=europe-west3
```

In prod il job si crea nella finestra di R10, come dice [[chore/migrazione-gcp]].

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| `pnpm exec tsc --noEmit` | verde | |
| `pnpm run test --run` | verde | dopo il giro 2: 335 file, 4.854 test, 120 saltati (i `.pg` e i `PERF`) |
| `pnpm test:pg --run` (Postgres locale) | verde | 21 file, 114 test, 4 prove di carico saltate senza `PERF` |
| `PERF=1 pnpm test:pg packages/server/src/services/analytics` | verde | mediane 12,1 ms e 9,3 ms (T7) |
| `pnpm build` con i segnaposto della CI | verde | |
| `pnpm api:build`, `pnpm api:smoke` | verde | |
| `pnpm web:test` | verde | dopo il giro 2: 111 file, 1.683 test. Un test di Contatti (`ContactsList.test.tsx`, «il numero di righe porta con sé la ricerca»), che questo lavoro non tocca, è fallito una volta sotto il carico di tre suite in parallelo; da solo passa due volte su due. Dopo il giro 3 (il punto di rottura) rigirati i 182 test della pagina e `web:lint` |
| `pnpm web:lint` | verde | 0 errori, 1 avviso già presente in `components/ui/use-toast.ts` |
| `pnpm web:build` | verde | `xlsx` nel suo chunk, caricato al clic (D12) |
| `next lint` | non eseguibile qui | il worktree sta dentro il repo: ESLint trova anche il `.eslintrc.cjs` del repo principale e si ferma su `prettier`. Al suo posto `eslint --no-eslintrc -c .eslintrc.cjs src`, verde. In CI il problema non c'è |
| Browser, ADMIN, 1440 / 1920 / 1280 / 1279 / 1024 / 768 px | verde | nessuno scorrimento laterale della pagina; colonna di 320 px da 1280 e striscia sotto, con `aria-orientation` che segue; schede alte uguali (74 px) e titoli alla stessa altezza; scheda scelta visibile nella striscia; grafico entro l'area dopo ogni ridimensionamento |
| Browser, AC37 | verde | barra interna di 3 px, 8,41:1 su `bg-primary-soft` |
| Browser, AC38 | verde | area del grafico di 738 px a 1024 con la barra aperta; al 125% del testo nulla esce dal pannello; da 1280 la tabella a sette colonne dell'OPERATORE non scorre (672 px di 672) |
| Browser, AC35 | verde | 90 giorni per giorno: 91 righe, regione alta 480 px, intestazione ferma a 1 px dal bordo dopo lo scorrimento |
| Browser, AC41 calendario | verde | a 768 px il calendario sta a 109 e 194 px dai bordi; Esc lo chiude, rimette il focus sul pulsante e non cambia l'indirizzo |
| Browser, AC34 | verde | nel pannello delle sedi il Tab va dal titolo direttamente a «CSV» |
| Browser, AC40 | verde | segmenti impilati con tratto di 2 px nel colore `card` |
| Browser, download | verde | senza salvare file: il clic del link intercettato. Excel `mito_risposte-per-operatore_2026-10-01_2026-10-30.xlsx` (22 KB, intestazione zip), CSV con BOM, «Esporta tutto» `mito_analisi_2026-10-01_2026-10-30.xlsx` (39 KB) |
| Browser, OPERATORE | verde | 5 schede, `?chart=branches` apre «Finanziato totale», «Numeri dei clienti assegnati a te», le sue chiamate nel tempo con «Le tue chiamate» e «Dati delle chiamate completi dal 15/09/2026» |
| Browser, 280 px | verde, con un limite | il documento non scorre di lato; con la barra laterale aperta restano ~40 px al contenuto: è il layout sotto i 768 px, rinviato per tutta l'app |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1 | soddisfatto | `DashboardLayout.test.tsx`; browser, ADMIN e OPERATORE (T14) |
| AC2 | soddisfatto | `AnalisiPage(.more).test.tsx`; numero e unità interi in ogni scheda, misurati a 1024–1440 px con radice a 16 e 20 px (giri 1–3). Un badge accorcia il titolo nella striscia: in tech debt |
| AC3 | soddisfatto | sei schede per l'ADMIN, cinque per l'OPERATORE; `_lib/_test/{trends,rankings}` (T11, T12, T14) |
| AC4 | soddisfatto | prime 7 più «Altre» da 9 sedi, «Senza sede»; primi 8 operatori con la nota; `rankings.test.ts`, `analisi.db.test.ts` (T6, T12, T15, giro 4) |
| AC5 | soddisfatto | stesso insieme per totale, medio e sedi; somma per sede uguale al totale in `analisi.db.test.ts` (T5, T6) |
| AC6 | soddisfatto | clienti assegnati all'OPERATORE, «Numeri dei clienti assegnati a te» (T5, T11, T14) |
| AC7 | soddisfatto | badge «Adesso» con il tooltip da un pulsante, «Finestra: Adesso» nel file (T12, T13, T14) |
| AC8 | soddisfatto | ogni serie e il tooltip con `isAnimationActive={false}`, test che fallisce su una serie animata; pulsazioni con «riduci movimento» e ferme offline (giro 1 e 2) |
| AC9 | soddisfatto | `window.test.ts` con gli esempi del 30/10/2026, 1–366 giorni, niente giorni futuri (T1, T10, T17) |
| AC10 | soddisfatto | tre confronti, mesi interi, anno prima su un 29 febbraio (T1, T5, T17) |
| AC11 | soddisfatto | `buckets.test.ts` con ogni esempio della spec (T2, T11) |
| AC12 | soddisfatto | variazione in % o in punti, note «—»; la nota compare solo quando manca il confronto (giro 1) |
| AC13 | soddisfatto | soglie automatiche e scelte a mano con il ritorno ad «automatico» (T1, T10, T17) |
| AC14 | soddisfatto | `urlState.test.ts` e pagina con `replace`; casi relativi alla data sul `TestClock` (giro 1) |
| AC15 | soddisfatto | «Allarga a …» cambia solo le date (T1, T16). La lettera accorcia una finestra personalizzata più lunga di 30 giorni: in [[tech-debt/crm/pagina-analisi]], da chiedere a Omar |
| AC16 | soddisfatto, da confermare sui dati | `LOG_RETENTION_MONTHS = 25`, job dello scheduler in pausa; il taglio va provato su una copia dei dati prima di accendere il job (checklist di [[specs/crm/pagina-analisi/REPORT]]) |
| AC17 | soddisfatto | export delle chiamate in `apps/web` e in Next dal più tardo tra 15/09/2026 e il giorno dopo 25 mesi prima (T3) |
| AC18 | soddisfatto | `getMyCallSeries` prende l'operatore solo dalla sessione; grafici nel tempo con «Le tue chiamate» (T4, T7, T11) |
| AC19 | soddisfatto | cinque stati per grafico, `states(.more).test.tsx` (T16); la riga del numero e il riquadro del grafico, classifiche e note comprese, sono alti quanto lo scheletro (giri 2, 4 e 5); nel browser «Dati del grafico» non si muove dal controllo «Periodo» |
| AC20 | soddisfatto | testo e «Riprova», riquadro che resta (T16) |
| AC21 | soddisfatto | gli altri grafici restano; l'error boundary del pannello manda a Sentry. Un'eccezione nei costruttori dei risultati arriverebbe alla pagina d'errore: nessun dato decodificato la provoca oggi, in tech debt |
| AC22 | soddisfatto | avviso offline, ogni scheletro lo indica e smette di pulsare (giro 2) |
| AC23 | soddisfatto | `useRoleChangeGuard`, test deterministico (T17). Ciclo di richieste se `/me` resta su ADMIN: in tech debt |
| AC24 | soddisfatto | «—» in numero, scheda, tabella e file (T11, T13, T16) |
| AC25 | soddisfatto | sotto 15 risposte barra neutra in fondo con la nota (T12); oltre l'ottavo operatore solo la colonna «Campione piccolo» (giro 4) |
| AC26 | soddisfatto | `useStableQuery` e scheletri durante il caricamento, mai i numeri vecchi (T9, T16) |
| AC27 | soddisfatto | CSV con `;`, virgola decimale e BOM; download intercettato nel browser (T13, T18) |
| AC28 | soddisfatto | `xlsx` caricato al clic, nel suo chunk; numeri arrotondati come la tabella (giro 1) |
| AC29 | soddisfatto | TSV con le intestazioni e i due toast; formule e virgolette protette (giro 1) |
| AC30 | soddisfatto | blocco d'intestazione e nomi dei file (T13) |
| AC31 | soddisfatto | niente tabella e pulsanti disabilitati con il motivo (T18) |
| AC32 | soddisfatto | «Esporta tutto N/6» e i toast parziale e di errore; file di 39 KB nel browser (T13, T18) |
| AC33 | soddisfatto, con un limite | nessuno scorrimento laterale da 280 a 1920 px; a 280 px con la barra laterale aperta restano ~40 px al contenuto: layout del telefono rinviato per tutta l'app |
| AC34 | soddisfatto | nessun punto di sosta nel grafico, test e browser (T15, T19) |
| AC35 | soddisfatto | regione con il focus visibile, 480 px, intestazione ferma (T18, T19) |
| AC36 | soddisfatto | lista di schede con frecce, Home e End; frecce secondo l'orientamento (giro 1), modificatori lasciati al browser (giro 2), stesso punto di rottura del CSS anche con il testo del browser ingrandito (giro 3) |
| AC37 | soddisfatto | barra interna di 3 px, 8,41:1 (T19) |
| AC38 | soddisfatto | colonna da 1280 px, striscia sotto; al 125% del testo nulla esce (giro 1) |
| AC39 | soddisfatto | striscia allineata, scheda scelta visibile (T19, e giro 3 con il testo del browser a 20 px) |
| AC40 | soddisfatto | tratto di 2 px nel colore `card` (T15, T19) |
| AC41 | soddisfatto | correzioni puntuali del prototipo, verificate una per una nel browser (T19) |
| AC42 | soddisfatto in jsdom e nel browser | percorso da tastiera provato; VoiceOver, NVDA e Safari a mano, nella checklist di [[specs/crm/pagina-analisi/REPORT]] |

## Revisione indipendente (giro 1, [[specs/crm/pagina-analisi/REPORT]])

DO NOT SHIP, con 3 BLOCKER e 4 MAJOR. Tutti corretti, poi secondo giro sui cinque aspetti respinti.
- **Il seed locale seguiva ancora i 3 mesi (BLOCKER, v2).** Qui avevo scritto che i suoi test restavano verdi, ed era falso: i test `.pg` girano solo con `TEST_DATABASE_URL`, e io avevo lanciato i test della root senza. Ora il seed prende il taglio da `LOG_RETENTION_MONTHS`, scrive righe più vecchie di 25 mesi e ha uno storico di 31 mesi. `pnpm test:pg` sul Postgres locale passa: 114 test, più 4 prove di carico, verdi con `PERF=1`. Ho aggiornato anche tre righe di [[specs/crm/seeder-locale/SPEC]] (AC26, AC27, AC30) che dicevano 3 mesi: è una modifica a un'altra spec, da confermare con Omar.
- **Un test sull'orologio reale (BLOCKER, v6).** I casi di AC14 relativi alla data passavano da `toWebHandler`, che non vede il `TestClock`, e dal 2026-10-31 la CI sarebbe diventata rossa. Ora passano dal client con il `TestClock`; provati con la data finta al 2026-10-31 e al 2027-03-01. Aggiunti i casi mancanti indicati da v6.
- **Pulsazioni senza «riduci movimento» (BLOCKER, v11):** `motion-reduce:animate-none` sugli scheletri della scheda e del pannello, e la scheda smette di pulsare anche offline. Il test di AC8 cercava elementi `<animate>`, che recharts 3 non disegna mai: ora legge ogni serie e controlla `isAnimationActive={false}`; provato che fallisce con una serie animata.
- **Formula incollata dagli appunti (MAJOR, v4).** Un nome come `"=1+1"` passava la protezione nel TSV. Ora i valori con le virgolette vanno tra virgolette, tabulazioni e a capo diventano spazi prima del controllo, e il controllo copre anche tabulazione, CR e spazi iniziali. Nei test c'è un parser nel giro.
- **Numero delle chiamate ripetuto (MAJOR, v8 e v10).** Diceva «1.196 1.196 chiamate»; ora la didascalia ha solo unità e quota, e un test fissa l'esempio di AC2. La didascalia della scheda va a capo su due righe, con le schede alte uguali.
- **AC38 al 125% del testo (MAJOR, v10).** Celle più strette e intestazioni che vanno a capo. Misurato nel browser a 1280 px con la radice a 20 px: tabella dell'ADMIN 578 px su 578, quella a sette colonne dell'OPERATORE 578 su 578.
- **Il test di AC8 (MAJOR, v11):** come sopra.
- **Minori corretti:**
  - la nota di AC12 compariva quando a non avere dati era la finestra;
  - le frecce ora seguono l'orientamento delle schede;
  - l'Excel tiene i numeri arrotondati come la tabella;
  - nell'intestazione della coda c'è «Finestra: Adesso»;
  - `isDay` rifiuta gli anni prima del 1000;
  - nuovi test: anni bisestili, «L'anno in corso» per mese contro l'anno prima, il toast della sessione davvero unico (con chiavi diverse) e riarmato;
  - il test dei 366/367 giorni ha 20 s di timeout: andava oltre i 5 s sotto il carico della suite intera.
- **Minori e NIT lasciati:** stanno in [[tech-debt/crm/pagina-analisi]], ciascuno con il suo rimedio.

## Revisione indipendente (giro 2)

Cinque passaggi sugli aspetti respinti: v2, v4, v6 e v11 SHIP, v8 DO NOT SHIP con due MAJOR. Tutto corretto, poi un terzo giro di v8 su quei due, sulle schede e sui tasti.
- **La scheda del tasso dell'OPERATORE era ancora tagliata (MAJOR, v8).** Sotto i 1280 px «10,7% 9 appuntamenti su 84 risposte» prendeva tre righe in uno spazio di due. Ora ogni scheda riserva tre righe accanto all'andamento in miniatura, con numero e unità insieme come in AC2. Misurato nel browser a 1024 px, ADMIN e OPERATORE, radice a 16 e 20 px, finestra di 12 mesi: nulla tagliato, schede tutte alte uguali (114 px e 142 px). Una prima prova metteva l'unità su una riga sua: niente tagli, ma «1.196» e «chiamate · 94%» finivano separati, contro AC2.
- **La nota di AC12 spostava il grafico di 18 px (MAJOR, v8).** Stava sotto il numero, dove lo scheletro non la prevede (AC19). Ora sta con le note sotto il grafico; la riga del numero è alta 50 px, come lo scheletro. Un test fissa dove sta.
- **Minori corretti:**
  - offline smettono di pulsare anche le barre del numero; un test fissa «riduci movimento» su ogni scheletro e l'arresto offline (v11). Lo stesso test ha mostrato che i test offline lasciavano offline il client delle query per il test dopo: ora un `afterEach` torna online;
  - le regole delle virgolette del CSV e il CR da solo negli appunti hanno un test con SheetJS: i quattro mutanti sopravvissuti di v4 ora falliscono;
  - il test di AC26 del seed fissa i 6 mesi come letterale, e la decisione di [[specs/crm/seeder-locale/SPEC]] ha la sua riga (v2);
  - due casi del server: oggi e gli estremi della finestra subito dopo la mezzanotte di Roma, per il finanziato e per le chiamate dell'operatore, e il confronto dell'OPERATORE solo sui suoi clienti; i mutanti M13, M16, M19 e M20 di v6 ora falliscono;
  - le frecce con Alt, Ctrl, Meta o Shift restano al browser (v8).
- **Lasciati, in [[tech-debt/crm/pagina-analisi]]:** il registro del seed più vecchio degli operatori (v2); `sheetName` senza test, oggi irraggiungibile (v4). Gli altri NIT di v8 (la variazione dei conteggi con la finestra vuota, la cella «Campione piccolo» con 0 risposte, il motivo ripetuto nello stato vuoto) seguono la lettera della spec o sono già in tech debt.

## Revisione indipendente (giro 3)

v8, DO NOT SHIP. Conferma le due correzioni del giro 2 e trova due MAJOR nuovi.
- **Punto di rottura in px contro `xl` in rem (corretto).** La colonna degli indicatori si decideva con `(min-width: 1280px)`, il layout con `xl:` di Tailwind (80rem, che segue il carattere predefinito del browser). Con il testo di Chrome a 20 px, tra 1280 e 1599 px la striscia aveva i tasti e l'`aria-orientation` della colonna, e la scheda scelta restava fuori vista. Ora `(min-width: 80rem)`; il finto `matchMedia` dei test risponde «colonna» solo a quella query, e con la vecchia il test è rosso.
- **Le classifiche crescono oltre lo scheletro:** decisione di Omar, § AC19 e le classifiche.
- **Minori, in [[tech-debt/crm/pagina-analisi]]:** il titolo accorciato da un badge nella striscia; la nota di AC12, ora sotto il grafico, lontana dal «—» su una classifica lunga.

## AC19 e le classifiche: deciso da Omar

**Il problema.** Le classifiche degli operatori («Risposte per operatore», «Tasso di appuntamento») erano alte 40 px per riga, con un minimo di 320 px. Con i 27 operatori del seed arrivavano a 1.080 px, contro uno scheletro di 320: all'arrivo dei dati «Dati del grafico» scendeva di circa 760 px. «Finanziato per sede» no: AC4 la ferma già a 8 barre.

**La decisione (2026-10-30).** Omar sceglie di mostrare nel grafico i primi 8 operatori, nell'ordine della tabella. Le barre restano orizzontali, per i nomi, e non c'è una barra «Altri». Con più di 8 operatori, sotto il grafico compare la nota «Il grafico mostra i primi 8 operatori su N: la tabella e il file li elencano tutti.»; la tabella e il file non cambiano. Scartate l'altezza dell'ultimo risultato (il salto restava alla prima apertura) e lo scorrimento dentro il grafico (contro AC34). La spec cambia in AC4, AC19 e AC25, con una riga nel Decision Log.

**Il codice.**
- In `rankings.ts` il limite `MAX_BARS = 8` vale per le sedi e per gli operatori, e la nota viene da `firstBarsNote`.
- Ogni grafico riempie l'area del pannello, alta come lo scheletro (`h-80`). Sono spariti `barsHeight` di `parts.tsx` e `sizesItself` di `DrawnChart.tsx`.
- Test rossi prima del codice: tre in `rankings.test.ts` (primi 8 per chiamate, primi 8 per tasso, nessuna nota fino a 8) e uno in `states.more.test.tsx` (con 12 operatori l'area ha l'altezza dello scheletro, la nota sta dopo il grafico, l'ultimo operatore sta nella tabella).
- **Nel browser** (ADMIN, seed, 12 mesi): le tre classifiche sono alte 320 px, con 8 barre e 27 righe in tabella. La mia prova del passaggio da 12 mesi a 90 giorni diceva «Dati del grafico» fermo a 655 px: era sbagliata, perché cambiava l'indirizzo senza passare dal controllo e non vedeva lo scheletro. Il giro 4 l'ha smentita (§ Revisione, giro 4).

## Revisione indipendente (giro 4)

Un passaggio sulla modifica delle classifiche, DO NOT SHIP. Il grafico fa quello che la decisione chiede: 8 barre in 320 px, etichette e valori dentro a 1024 e 1440 px e con il testo a 20 px; la tabella e il file elencano tutti gli operatori.
- **La nota sotto uno stato vuoto (MAJOR, corretto).** Con una finestra che finisce prima del 15/09/2026 il grafico è vuoto, ma il server dà comunque 27 righe, e la pagina scriveva «Il grafico mostra i primi 8 operatori su 27…» sotto nessun grafico. Ora la nota dei primi 8 e quella del campione piccolo ci sono solo quando le barre si disegnano (`barNotes`); test con il grafico vuoto.
- **Le note spostano «Dati del grafico» (MAJOR):** decisione di Omar, § Le note dentro il riquadro.
- **Test che passavano con qualunque ordine (MINOR, corretti).** Nel vecchio esempio l'ordine di ingresso, quello dei nomi e le due classifiche coincidevano. Il nuovo esempio li fa diversi tutti e quattro, con un campione piccolo dal tasso più alto, che va in fondo e fuori dalle barre ma resta nella nota. Il test della pagina controlla anche che la classifica riempia l'area senza un'altezza sua. Quattro mutanti che prima sopravvivevano ora falliscono: barre dall'ordine di ingresso, per il tasso nell'ordine sbagliato, la nota sotto lo stato vuoto, l'altezza per riga.
- **PLAN e note non aggiornati (MINOR, corretti):** T13 e lo stato del piano; la mia prova del browser, smentita.
- **Lasciati:** l'ordine delle note non è fissato da un test; un nome tagliato arriva a 0 px dal bordo sinistro del grafico, com'era già prima.

## Le note dentro il riquadro (AC19): deciso da Omar

**Il problema.** Lo scheletro non ha note, e quante ne arriveranno non si sa prima dei dati. Sotto il riquadro di 320 px, ogni nota spingeva giù «Dati del grafico» di una riga quando il caricamento finiva: 32 px con una nota, 72 px con tre (giro 4).

**La decisione (2026-10-30).** Omar sceglie la strada consigliata: le note stanno dentro il riquadro, sotto il grafico, e il grafico si accorcia di quanto servono. Scartate le note dopo la tabella (lontane dal grafico) e uno spostamento ammesso da AC19. La spec cambia in AC19, con una riga nel Decision Log.

**Il codice.** In `ChartPanel.tsx` il riquadro `chart-area` è una colonna alta quanto lo scheletro (`h-80`, `h-72` per «Contatti con esito»). Dentro stanno il grafico, o lo stato vuoto, in `min-h-0 flex-1`, e le note in `shrink-0`. I due test delle note in `states.more.test.tsx` vogliono ora la nota dentro il riquadro, e prima del codice erano rossi.

**Nel browser** (ADMIN, seed), questa volta dal controllo «Periodo», con un campionatore a ogni fotogramma:
- da 12 mesi a 30 giorni su «Risposte per operatore», «Dati del grafico» resta a 583 px nel risultato, nello scheletro e nel risultato nuovo;
- «Tasso di appuntamento» con tre note: riquadro 320 px, grafico 252, note 56, 8 barre, nessun testo fuori dal grafico;
- lo stato vuoto (finestra prima del 15/09/2026) ha solo la nota dei dati completi, dentro il riquadro;
- «Finanziato totale» senza note usa tutti i 320 px.

## Revisione indipendente (giro 5)

Un passaggio sulle note nel riquadro, DO NOT SHIP. Da 900 px in su, e a 1024 px con il carattere a 20 px, nulla si muoveva: prima apertura dei sei grafici, finestra dal controllo «Periodo», i due cambi di confronto, il cambio di scheda.
- **La legenda spostava la riga del numero a 768 px (MAJOR, corretto).** Nella riga del numero la legenda andava a capo sotto il numero quando il pannello era stretto (482 px a 768): la riga diventava 82 px contro i 50 dello scheletro, e «Dati del grafico» scendeva di 32 px (65 px con il carattere a 20 px). La cosa c'era già prima, ma AC19 non ha limiti di larghezza. Ora la legenda è la prima riga del riquadro, in `shrink-0`, e la riga del numero ha solo il numero. Misurato a 768 px, con il carattere a 16 e 20 px: riga del numero 50 e 62 px, riquadro 320 e 400 px, come lo scheletro. La legenda delle chiamate dell'ADMIN sta su una riga; quella dell'OPERATORE con il confronto, a 20 px, va su due righe dentro il riquadro, e non sposta nulla.
- **I test non fissavano la colonna (MINOR, corretto).** Togliere `flex flex-col`, `flex-1`, `min-h-0` o `shrink-0` lasciava la suite verde, con il grafico a 0 px nel browser. Il test della classifica ora fissa le tre righe del riquadro e le loro classi; prima del codice era rosso.
- **Lasciati, in [[tech-debt/crm/pagina-analisi]]:** sotto i 400 px di pannello (telefono con la barra aperta, layout rinviato) il grafico può ridursi a nulla e le note uscire dal riquadro; la nota del campione piccolo quando nessuna barra disegnata è piccola; l'ordine delle note diverso tra pagina e file; l'intestazione che a capo diverso sposta la pagina al clic di «Periodo» o «Confronto».

## Revisione indipendente (giro 6)

Un passaggio sulla legenda nel riquadro, **SHIP**. Con lo scheletro forzato davvero (risposte ritardate di 1,2–1,5 s), 66 prime aperture: 768, 1024 e 1440 px, carattere a 16 e 20 px, i sei grafici dell'ADMIN e i cinque dell'OPERATORE. «Dati del grafico» non si è mai mosso, salvo 0,1 px di arrotondamento. Lo stesso per gli stati vuoto e «solo numero» e per i cambi nella pagina. Ordine di lettura, Tab e `empty:hidden` a posto. I minori, corretti dopo il giro:
- **Un mezzo ritorno indietro passava i test.** Una legenda anche nella riga del numero riportava il salto (+32 px) con la suite verde. Ora il test vuole la riga del numero senza legenda, e la riga della legenda con `empty:hidden` e senza `hidden`. Due test nuovi: un disegno che lancia lascia solo il riquadro d'errore, senza legenda né note; un grafico vuoto non ha legenda.
- **La legenda sopra il riquadro d'errore del disegno.** Legenda, grafico e note stanno ora dentro `PanelBoundary`, e l'errore li sostituisce tutti. Questo chiude anche il debito delle note sulle barre rimaste con l'errore.
- **La legenda a capo si allineava a sinistra:** ora `justify-end` anche sulla lista.
- **Una frase sbagliata in queste note** (la legenda su una riga anche per l'OPERATORE a 20 px), i commenti sulla legenda «accanto al numero», e AC2 che separava la legenda dal riquadro: corretti.

## Out of Scope Observations

- **La barra laterale chiusa** non ha nomi accessibili sui link, e il markup è `<a><li>`. Lo schema vale per tutte le voci e non nasce qui (v10, in [[tech-debt/crm/pagina-analisi]]).

## Remaining Work

- La checklist umana di [[specs/crm/pagina-analisi/REPORT]]: conservazione provata su una copia dei dati, job dello staging, 403 nello staging, Safari, VoiceOver e NVDA a mano, contratto del dominio all'ingest.
- La conferma della modifica a [[specs/crm/seeder-locale/SPEC]] (AC26, AC27, AC30 e la riga della decisione).

## Steering

| Date | Feedback | Changes |
|------|----------|---------|
| 2026-10-30 | Omar lancia `/implement-spec` sul piano: vale come approvazione di spec e piano (G0). | Spec `approved`, piano «In corso». |
| 2026-10-30 | Omar sceglie i primi 8 operatori nelle classifiche, con il resto nella tabella e nel file (AC19). | AC4, AC19, AC25 e il Decision Log della spec; `MAX_BARS` per sedi e operatori, nota sotto il grafico; via l'altezza per riga. |
| 2026-10-30 | Omar sceglie le note dentro il riquadro del grafico (AC19). | AC19 e il Decision Log della spec; in `ChartPanel.tsx` grafico e note nella stessa colonna alta quanto lo scheletro. |
| 2026-10-30 | Quinto giro: la legenda va a capo a 768 px e sposta la pagina (AC19). | La legenda in cima al riquadro del grafico, AC19 e il Decision Log aggiornati. |
| 2026-10-30 | Sesto giro: SHIP, con quattro minori. | Legenda, grafico e note dentro `PanelBoundary`; legenda allineata a destra anche a capo; test del mezzo ritorno indietro; spec `implemented`. |

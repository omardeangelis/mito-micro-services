---
domain: crm
type: implementation-notes
spec: assegnazione-wave
links:
  - "[[specs/crm/assegnazione-wave/SPEC]]"
ingested: false
last_ingested: null
created: 2026-11-04
updated: 2026-11-04
---

# Implementation Notes: Import e assegnazione della Wave

## Summary

- Spec e piano approvati da Omar il 2026-11-04 («implementa la spec dell'import della wave»), compresa A2 (`NotFound` per un `OPERATORE`, come le altre pagine solo admin).

## Execution Mode

- Mode: parallel, con le onde del §8 del piano.
- Delegation: supervised. Ogni task va a un worker sul tier della sua `complexity` (low → haiku, medium → sonnet, high → modello dell'orchestratore).
- Escalations: nessuna.

## Deviations From the Plan

- Dopo T21: il collegamento «Import» del percorso e quelli dello storico hanno `inline-flex min-h-6` (lo storico con `-my-1`, così la riga non cresce); le opzioni del passo 2 della riassegnazione hanno l'etichetta `min-h-7`, la nota come secondo `<label>` della stessa radio e un'area di 24×24 attorno al cerchio; i testi delle schermate di fine leggono la Wave aggiornata, così dopo una «Proroga» la frase della Wave scaduta e il pulsante spariscono.
- `activeContactIndex.db.test.ts` fissa l'elenco degli indici di `task` per notare quelli nuovi: aggiunto `task_operator_id_active_idx` (D3), il cambio voluto.
- Dopo la revisione (REPORT.md), con un test rosso prima di ogni correzione di comportamento:
  - **server:** `Effect.fn` per `timeLeft`, `waveParts`, `waveTeam`, `storedResult`, `recordOperation`; spareggio dei nomi per id utente in `split.ts`, `assign.ts`, `move.ts`; la proroga scrive solo sopra la scadenza letta (`UPDATE … WHERE deadline = <prima>`); `move` rifiuta un ricevente che è anche fra chi cede; test `pg` del lock degli utenti in `assign` e `move` (`holdUserDisabling` in `src/test/pg.ts`) e dell'ordine dei clienti con `NOWAIT`; test `db` di AC13, degli omonimi, della ridivisione «Ritmo», di `noAnswer`, dei conflitti e dell'ordine della scrittura;
  - **web:** «Prima era» dopo un esito incerto dice la scadenza di prima del primo tentativo se il server risponde una ripetizione, quella sostituita se scrive davvero; un ref sincrono blocca il secondo clic nello stesso task; `assign` e `move` invalidano anche contatti, clienti e analisi, `setDeadline` i contatti; classi letterali per i pallini della legenda; collegamento dello storico a blocco con i puntini e l'anello interno; «Chi ha il da fare» e «Da chi» spareggiano per id utente (`byName` di `preview.ts`); `scope="rowgroup"` sulle righe di gruppo;
  - **contratto:** tolto un `any` da `contract/_test/wave.test.ts` (ESLint su `packages`, che la CI controlla).
- Il test RED di ogni task lo scrive il worker come primo passo, dal `tdd_target` del piano, e lo deve mostrare rosso prima del codice; l'orchestratore controlla che il test sia quello del `tdd_target` e che non sia stato indebolito. Motivo: 20 task di codice in un solo run.

## Surprises and Decisions

- T5, D5 («un'istantanea coerente»): `readWave` legge la run, le parti e il team con istruzioni separate in READ COMMITTED, perché `transaction` di `effect/db.ts` ha l'isolamento fisso. Una scrittura concorrente può far differire di poco i numeri fra le schede di una stessa risposta. Accettato: `assign` e `move` ricontrollano tutto sotto i lock e rispondono `NumbersChanged` con una rilettura (AC16). Una lettura REPEATABLE READ read-only è un miglioramento possibile, non un requisito.
- T5, letture delle Definizioni: «Contattato il» è `task.closed_at` del contatto attivo; «chiamata registrata» è una riga `isCallIn` sul cliente, da sempre; un admin «ha contatti attivi» con qualunque contatto attivo, non solo Da chiamare e Non risponde; «ha chiamato negli ultimi 30 giorni» comprende oggi; «Importata <quando>» è `import_run.started_at`.
- T7, D11, per `docs-maintenance` (regola dei lock): `assign` e `move` bloccano per prima la riga `import_run` della Wave `FOR KEY SHARE`, così la Wave esiste per tutta la scrittura senza fermare una proroga; poi gli utenti in ordine di `users.id` (`FOR KEY SHARE OF users`), i clienti in ordine di id `FOR UPDATE`, i loro contatti attivi in ordine di id. Il commento della regola in `packages/server/src/effect/db.ts` lo dice; `regola-dei-lock.md` va aggiornata all'ingest.
- T7, tempo: 5.000 clienti assegnati a 15 persone, 500 dei quali con un contatto attivo senza operatore, in una Wave di 9.000 su 39.000 clienti: 621 ms, sotto i 60 s di D17.
- T7: una quota non valida (negativa, non intera, un ricevente ripetuto) è `NumbersChanged`, l'unico errore che il contratto di `assign` dichiara oltre a `RequestIdConflict` e `WaveNotFound`. Il controllo del team vale anche per un ricevente con quota 0.
- T8, tempo: 5.000 contatti spostati da 3 persone a 12, in una Wave di 9.000 su 39.000 clienti: 303 ms (nessun saltato, quindi senza la ridivisione).
- T8: un ricevente che è anche fra chi cede è `NumbersChanged` («receiver is a giver»), senza scritture. Prima della revisione era accettato e i suoi contatti contavano fra gli spostati senza muoversi; la pagina toglie già chi cede da «A chi» (AC25).
- T5, tempo: lettura di una Wave di 9.000 clienti (più 30.000 altri, 15 operatori, ~78k contatti, 60k chiamate) su Postgres locale, mediana 67 ms.

- G0: `origin/dev` non aveva commit nuovi rispetto al branch, nessuna unione necessaria.
- T2, D14: la regex SQL della ricostruzione imita `Number()` di JavaScript sui primi 4 caratteri (con `-` già diventato `_`): esponenti come «1e10», spazi ai lati come « 123», segni, `.5`, letterali hex, binari e ottali di 4 caratteri, stringa vuota. «1e10» e « 123» quindi non prendono `MMYY_`, come in `parseFileName`. Possibile differenza solo su spazi Unicode esotici (`\s` di Postgres contro `trim()`), trascurabile per nomi di file. Confrontata con `Number()` su 14 stringhe in node, non in Postgres.
- T2: `kind` di `wave_operation` è un enum Postgres (`wave_operation_kind`), come gli altri enum dello schema.
- T3: gli id dei clienti creati e aggiornati escono da `applyImportWithIds`; `applyImport` tiene il suo ritorno (solo i conteggi), su cui si appoggiano le asserzioni esistenti.
- Revisione, `assign`: nessun test tiene il lock di un contatto attivo, quindi togliere il `FOR UPDATE` dei contatti (`assign.ts`) non rompe nulla. È equivalente sotto la regola dei lock: ogni scrittura su un contatto di un cliente avviene in una transazione che ha già bloccato il cliente (`assertCustomerLockedOnWrite` lo controlla sui 19 scrittori), e `assign` blocca quei clienti prima dei contatti. Il lock dei contatti resta come difesa.
- Revisione, ricostruzione di D14: entra nella traccia anche un import Standard con lo stesso nome di file nello stesso mese, o una seconda Wave con lo stesso nome nello stesso mese. Un nome di file ripetuto nello stesso mese è improbabile; annotato, non corretto.
- T9: la scadenza più vicina è una sottoquery correlata, calcolata solo per i Da chiamare e Non risponde senza priorità manuale; Drizzle non ha `leftJoin` laterale.

## Controllo nel browser (T21)

Il 2026-11-04 su `mito_local` (migrato e popolato con le Wave di T20), API sulla porta 4010 (la 4000 era di un altro progetto) e `apps/web` su 5173, con il login rapido degli account del seed. Schermate nello scratchpad della sessione, non nel repo.

- **AC34:** nessuno scorrimento orizzontale e nessun testo fuori colonna a 1024, 1280, 1536, 1920 px e a 1280 con fattore 1,25, su tutte le schermate (primo passo di 1004, 1003 e 1000, «Assegna», fine, panoramica di 1004 e 1002, avviso di 1001, i tre passi della riassegnazione e la fine, storico). Sotto i 24 px: il collegamento «Import» del percorso (39×17), le opzioni di «Quali contatti» e «Quanti contatti» (etichetta alta 19 px, la nota non sceglieva l'opzione), i collegamenti dello storico (17 px). Corretti dopo il controllo (vedi Deviations).
- **AC13 del piano (T13):** l'anello sta sopra le colonne fino a 1279 px, accanto da 1280.
- **AC31:** il fuoco va sul titolo a ogni passo e sulla schermata di fine; «Vai alla Wave» sul nome; `.dashabord-container` torna a 0 a ogni cambio di passo, anche da 77 e 200.
- **T14:** l'anello del fuoco della riga resta intero quando la lista di «A chi» scorre da tastiera.
- **AC35:** nessuna transizione sul contenuto dei passi; restano lo `pulse` dello scheletro e le transizioni di opacità di 0,15 s dei `Button` del design system.
- **T11:** tutti i calendari in italiano con il lunedì: flusso, «Proroga», `RangePicker`, vetrina. Pulsante `xs` 24 px, `icon-xs` 24×24.
- **AC1:** un `OPERATORE` su `/dashboard/import/1002` vede «Pagina non trovata».
- **AC36:** visti «1 scelto» e «1 da fare»; gli altri singolari non si raggiungono con il seed e restano coperti dai test di `_lib/text.ts`.
- **T9, `EXPLAIN ANALYZE`** della lista Contatti per priorità (`LIMIT 50`, 8.009 contatti attivi, 1.010 righe di traccia): senza la chiave della scadenza 6,7–7,6 ms; con la chiave 27–55 ms, perché il costo stimato della sottoquery (143.462) supera `jit_above_cost` e Postgres compila con JIT (~16 ms); con `jit=off` 8,7 ms. La sottoquery usa `import_run_customer_customer_id_idx`. Da controllare l'impostazione `jit` del Postgres di produzione.
- Dopo il controllo `mito_local` non è più quello del seed (assegnati 50 clienti di 1004, spostati 24 contatti e prorogata 1001): `pnpm seed:local` lo riporta allo stato iniziale.

### Controlli a mano per Omar (NVDA e VoiceOver, sulla pagina vera)

1. Dopo «Avanti», dopo la schermata di fine e dopo «Riassegna…» si sente il titolo che prende il fuoco (AC31).
2. Cambiata la divisione e spuntate tre persone in fretta, il riepilogo è letto una volta per cambio, senza accodarsi (AC14).
3. Su una Wave scaduta l'avviso è letto all'apertura (AC21).
4. Il toast di fine import dura 10 s: «Assegna» si raggiunge con F8 in quel tempo (AC2).

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| `pnpm web:test` | 2011 passati | dopo le correzioni della revisione |
| `pnpm web:lint`, `pnpm web:build` | verdi | solo l'avviso solito del chunk sopra i 500 kB |
| `pnpm exec tsc --noEmit` | pulito | |
| `pnpm run test --run` | 5385 passati, 137 saltati | i saltati sono `*.pg.test.ts` e perf senza `TEST_DATABASE_URL` |
| `pnpm test:pg` su `services/import` e `services/contact` | 27 passati, 4 saltati | Postgres locale sulla 54329; perf con `PERF=1` |
| `pnpm build` con i segnaposto del gate Build | verde | worktree senza `.env` |
| `pnpm api:build`, `pnpm api:smoke` | verdi | |
| `next lint` | non eseguibile qui | conflitto del plugin prettier fra il worktree e il checkout padre; `eslint --no-eslintrc -c .eslintrc.cjs` su `packages/server`, `domain`, `contract` e `src/test`: pulito dopo aver tolto un `any` da `contract/_test/wave.test.ts` (resta un avviso preesistente in `analytics/contactProgress.ts`) |
| Browser (T21) | vedi sopra | |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1 | Met | «Pagina non trovata» per un `OPERATORE` (A2, approvata); rifiuti dei 5 endpoint × 4 chiamanti testati |
| AC2 | Met | Toast e storico qui; i pulsanti di home-admin arrivano con la sua implementazione (D1); `?per` accettato |
| AC3–AC9, AC38 | Met | AC5: pallini della legenda corretti dopo la revisione |
| AC10–AC15 | Met | AC13: pareggio per id testato; AC15: doppio clic nello stesso task bloccato |
| AC16 | Met | Ogni riga con il suo messaggio e lo stato del pulsante |
| AC17–AC19, AC21 | Met | AC19: spareggio per id utente |
| AC20 | Met | «Prima era» giusto anche dopo un esito incerto |
| AC22–AC27 | Met | AC23: spareggio per id utente |
| AC28 | Met | Costo con `jit` acceso: tech debt |
| AC29 | Met | In prod la ricostruzione non trova Wave passate: tech debt |
| AC31–AC33, AC35, AC36 | Met | Lettura con NVDA e VoiceOver da fare a mano |
| AC34 | Met | Collegamento dello storico corretto dopo la revisione, non rimisurato nel browser |
| AC37 | Met | Prototipo e route tolti |

## Out of Scope Observations

- Home: la sezione «Chiamate per operatore» usa campi data nativi (Dal/Al), non il calendario del design system; `TimeFrameSelector` è una scelta 30/90/365 giorni senza calendario. Fuori da questa spec.
- Vetrina `/_dev/ui`: interruttori 34×20 e caselle con etichette da 16 px. Fuori da AC34, che vale per la pagina della Wave.
- Storico degli import a 1024 px: le colonne numeriche scorrono dentro il contenitore della tabella (nessuno scorrimento della pagina).

- In questo worktree, annidato nel checkout principale, `next lint` e `eslint` falliscono con «Plugin "prettier" was conflicted between ".eslintrc.cjs" and "../../../.eslintrc.cjs"»: ESLint carica anche la configurazione del checkout padre. I worker hanno controllato i loro file con `eslint --no-eslintrc -c .eslintrc.cjs`. La CI gira in un checkout non annidato.
- Revisione (N4, preesistente): «Proroga» nell'avviso e nelle schermate di fine esiste solo finché la Wave è scaduta. Se una proroga dall'esito incerto era stata salvata, la rilettura riapre la Wave e il popover sparisce con il messaggio di AC20; resta la scadenza nuova nell'intestazione.
- Revisione (N3): dopo un esito incerto si rilegge solo la Wave; se la scrittura era avvenuta, contatti, clienti e analisi si aggiornano alla prossima apertura.
- T14, improvement candidate: una persona attiva che non ha mai chiamato ha ritmo 0, quindi ogni «Al giorno» sopra 0 è in ambra «sopra il ritmo». È la lettera di AC12, ma può fare rumore.
- T14, improvement candidate: «<nome> è inattivo da <N> giorni.» (AC14) è al maschile anche per le operatrici; un testo che non assume il genere («inattività da <N> giorni») lo eviterebbe.

## Remaining Work

- Omar: i quattro controlli con NVDA e VoiceOver (sopra).
- Omar: `SHOW jit;` sul Postgres di staging e di prod (tech debt).
- Le Wave passate in prod non hanno `import_run`, la ricostruzione non le trova: Omar ha deciso il 2026-11-04 di non ricostruirle, si parte dalla prossima Wave (tech debt).
- Al rilascio: niente import durante il deploy, o ricostruzione rieseguita dopo (tech debt).

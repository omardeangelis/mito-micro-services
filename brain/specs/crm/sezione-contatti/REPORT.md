---
domain: crm
type: review
scope: spec
spec: sezione-contatti
review_target: "branch contatti/pr1-creazione-sicura — PR1 (T1.1–T1.7)"
base_ref: 88b01718b6e9deafef1913cef489268a16518312
head_ref: 87ff79e077763b5a443b689a663a4e30987622a3
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/sezione-contatti/RUBRIC]]"
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/sezione-contatti/PLAN]]"
  - "[[specs/crm/sezione-contatti/FLOW]]"
  - "[[specs/crm/sezione-contatti/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-09-25
updated: 2026-09-25
---

# Review Report: Sezione Contatti — PR1 "Percorsi di creazione sicuri"

## Verdict

**SHIP** · impact: critical · dopo le correzioni di `87ff79e`, rieseguendo v1, v2 e v3 (vedi "Seconda verifica"). La checklist umana resta obbligatoria.

Prima verifica, su `09de3e8`: **DO NOT SHIP**. Obiezione bloccante (v3, confermata sul codice): nella massiva, nel caso "alert confermato" ("Risolvi alert" spuntato), dopo PR1 la task più recente per `updated_at` è la vecchia, ormai inattiva; prima era la nuova. "Assegna Clienti" (`customer.bulkUpdateCustomers`, codice invariato) sceglie proprio la task con `updated_at` più recente, attiva o no, e quindi dopo la massiva si comporta diversamente da oggi. È un cambio di comportamento della massiva non documentato, contro i non-goal della SPEC.

## Coverage

- Passaggi eseguiti: 7/7. v1, v2, v3, v4 e v6 su Opus; v5 e v7 su Sonnet.
- Passaggi saltati o falliti: nessuno.
- v3 ha confrontato il codice della base, copiato alla lettera, con quello nuovo sugli stessi dati PGlite: 479 confronti uguali, 12 diversi, tutti spiegati nei finding. v1 ha scritto sonde di tipo e di runtime. Tutte le prove stanno nella scratchpad della sessione, fuori dal repo; il working tree non è stato toccato.
- Tutti e sette hanno eseguito i gate in locale: lint e `tsc` puliti, 67/67 test verdi. v7 ha eseguito anche `pnpm build` con l'env di CI: verde.

## Seconda verifica (dopo le correzioni)

Il commit `87ff79e` corregge F1 e F2, porta F3 nel runbook G2 e nei rischi di PLAN.md, riformula il commento di F4 e registra F5 nel tech-debt. Poi sono stati rieseguiti i tre passaggi toccati dalle correzioni, con le stesse charter ristrette al commit, su Opus:

| Pass | Verdict | Esito |
|------|---------|-------|
| v3 — parità della massiva | SHIP | F1 risolto. Nel caso "alert confermato" la nuova task è sempre in cima, qualunque sia la risoluzione o lo sfasamento degli orologi: 25/25 senza latenza, 12/12 con 2 ms per query, con l'orologio dell'app avanti o indietro di 5 s. Negli altri casi, in `createTask` e nel cron l'ordine resta quello della base. Righe identiche alla base in 4 scenari × 5 esecuzioni. Il test di regressione fallisce 60/60 senza la correzione e passa 300/300 con. |
| v1 — atomicità | SHIP | F2 risolto: fuori da `transaction()`, o con un cliente che non viene da `lockCustomer`, `replaceActiveContact` non compila; ciascun `@ts-expect-error` fallisce se si toglie la sua protezione (mutazioni). Con errori iniettati nel caso "alert confermato" e in `createTask` il DB resta com'era. |
| v2 — lock | SHIP | Lo spostamento dell'UPDATE e la sottoquery non introducono deadlock, aggiornamenti persi o un secondo contatto attivo fra i percorsi di PR1. La sottoquery usa un parametro e gestisce il NULL. |

Gate: lint e `tsc` puliti, 69/69 test verdi, `pnpm build` verde con l'env di CI.

Rilievi nuovi, nessuno sopra MINOR:

| # | Severity | Da | Problema | Stato |
|---|----------|----|----------|-------|
| R1 | MINOR | v3 | Il test di regressione di F1 prende l'annullamento completo della correzione, non una metà sola: con il solo riordino annullato passa 96/100, con il solo `statement_timestamp()` 57/100. La prima asserzione passa anche senza correzione, per il `.where(undefined)` di "Assegna Clienti". | Da decidere: un failpoint che rallenta l'insert. |
| R2 | MINOR | v3 | Sui dati sporchi due ordini cambiano rispetto alla base (da T1.5/T1.6, non da F1): pareggio in cima nel caso "esito senza alert" con due task attive; nel cron su un alert agganciato a una task inattiva va in cima la task prima attiva. | Documentato in IMPLEMENTATION-NOTES. |
| R3 | MINOR | v2 | La nuova task è più recente di quelle scritte prima dell'insert, non di quelle scritte dopo da mutation che non bloccano il cliente (`updateTask`, `updateTaskFromDashboard`, `createAlert`). Probabilità bassa; lo stesso esito arriva già da F3. | Commento di `replaceActiveContact` corretto. |
| R4 | MINOR | v1, v2 | Il brand prova che il cliente è stato bloccato, non che il lock sia della stessa transazione: un `LockedCustomer` riusato in un'altra `transaction`, o copiato con lo spread cambiando `id`, compila. Nessun chiamante lo fa. | Commento di `LockedCustomer`, note e tech-debt corretti; resta una regola di review. |
| R5 | MINOR | v2 | F12 ancora aperto: la regola dei lock in `lockCustomer` e in PLAN.md §13 non corrisponde al codice. | Da decidere. |
| R6 | NIT | v2 | Su dati sporchi, un deadlock (40P01) fra la massiva e l'"Assegna Clienti" col `.where(undefined)`: Postgres ne annulla una, senza dati rotti. | Sparisce con PR2. |
| R7 | NIT | v2 | La massiva azzera `alert_id` senza la condizione `alert_id = A` (stessa classe di F13). | Da decidere con F13. |
| R8 | NIT | v1 | Un `Tx` fornito a mano compila e riproduce una scrittura a metà; nessun codice lo fa. Togliere solo `yield* Tx` lascia verdi i test (lo protegge il tipo). | — |
| R9 | NIT | v3 | Con l'orologio dell'app avanti rispetto al DB la nuova task va in cima anche dove la base avrebbe messo la vecchia (è l'intento). Una scansione di `task` in più per cliente nel caso "alert confermato": ~16 ms su 200.000 task senza indice, 0,2 ms con l'indice di PR2. | Documentato in IMPLEMENTATION-NOTES. |

## Findings

Prima verifica, su `09de3e8`. F1–F5 sono chiusi o registrati dalla seconda verifica (sopra).

I casi della massiva sono indicati per contenuto, perché la guida operatori e il codice li numerano in modo diverso (v3, NIT).

| # | Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|---|----------|--------------------|----------|---------|-------------------------|----------|
| F1 | BLOCKER | v3 — parità della massiva | `src/server/api/routers/task/POST/index.ts:192-215`, `src/server/services/contact/activeContact.ts:51-63`; effetto in `src/server/api/routers/customer/PUT/index.ts:109-131` | **Cosa succede.** Nel caso "alert confermato" la base aggiornava la vecchia task e poi, con un comando separato, inseriva la nuova, che risultava quindi la più recente. Ora tutto gira in una transazione: l'insert prende `CURRENT_TIMESTAMP`, che vale l'inizio della transazione, mentre le due update sulla vecchia task prendono `new Date()` (`$onUpdate`) dopo. Così la vecchia task, inattiva, diventa la più recente.<br>**Perché conta.** "Assegna Clienti" prende la task con `updated_at` più recente fra tutte quelle del cliente e la riassegna solo se è `chiamare`. Dopo PR1:<br>• non sposta più il nuovo contatto attivo, e cambia l'operatore a cui l'export attribuisce quella riga;<br>• se nessun cliente selezionato ha in cima una task `chiamare`, finisce nel `.where(undefined)` preesistente (vedi "Fuori perimetro"), che riassegna tutte le task della tabella.<br>**Casi non toccati.** Il cron e gli altri casi della massiva lasciavano già la vecchia task in cima nella base (insert prima, update dopo). | Nel caso "alert confermato" la nuova task deve restare la più recente per `updated_at`. Per esempio: azzerare `alertId` della vecchia task prima di `replaceActiveContact`, e dare alla nuova un istante successivo alle scritture sulla vecchia (`clock_timestamp()` o un valore esplicito). Serve anche un test di regressione su quale task è più recente dopo questo caso. Poi rieseguire v3. | no |
| F2 | MAJOR | v1 — atomicità; v2 — lock | `src/server/services/contact/activeContact.ts:22-32`, `src/server/effect/db.ts:132-135`, `IMPLEMENTATION-NOTES.md:40` | `replaceActiveContact` ha tipo `Effect<…, DbError, Db>`, cioè non richiede `Tx`. Inoltre `LockedCustomer` è un tipo strutturale: qualsiasi `{ id, operatorId }` lo soddisfa.<br>v1 ha verificato con tsc e a runtime che la funzione gira anche fuori da una transazione e senza lock. Fuori da una transazione, UPDATE e INSERT vanno in commit separati: con un errore restano scritture a metà (AC39); con due richieste insieme restano due contatti attivi (AC71).<br>La nota "Il tipo impone 'prima il lock'" è falsa. Oggi tutti e tre i chiamanti sono corretti, ma PR3 ne aggiunge altri. | Aggiungere `yield* Tx` come primo passo, così il tipo diventa `Db \| Tx`. Dare a `LockedCustomer` un brand privato, così che solo `lockCustomer` possa produrlo. Correggere la nota. | no |
| F3 | MAJOR | v2 — lock | `src/server/api/routers/task/PUT/index.ts:28-37, 76-86`; `src/app/dashboard/customers/_components/CustomerColumns.tsx:564,583`; `src/app/dashboard/customers/_actions/taskStatusAction.ts:50-56` | **Preesistente, fuori dal diff.** `updateTask` e `updateTaskFromDashboard` scrivono `isActive: true` (e `operatorId`) presi dal client, senza lock. Una riga vecchia rimasta nella lista può quindi riattivare un contatto già sostituito dal cron, dalla massiva o da una riapertura.<br>Oggi questo crea duplicati. Dopo l'indice unico di PR2 diventa un errore 23505, cioè un 500 in lista; e se arriva fra l'UPDATE e l'INSERT di `replaceActiveContact` fa fallire anche cron, massiva o `createTask`. Lo chiude PR3, ma la finestra fra PR2 e PR3 non è nel piano (§13). | Aggiungere il rischio al runbook G2 e alla tabella dei rischi di PR2. | sì |
| F4 | MAJOR | v7 — CI e harness | `src/test/db.ts:79` | Il commento dice che la sessione del DB Supabase è in UTC, come se fosse verificato. Sul DB di sviluppo è `Europe/Rome`; su prod nessuno l'ha controllato. Le logiche future sulle date si appoggerebbero a un'assunzione non verificata. | Riformulare il commento come assunzione da verificare in G1; decidere il fuso dei test dopo G1. | no |
| F5 | MAJOR | v7 — CI e harness (anche v2) | `src/server/effect/db.ts` (`lockCustomer`) | Nessun test esercita il lock: se si togliesse `.for("update")`, i 67 test resterebbero verdi. PGlite ha una sola connessione. Il piano ha accettato il limite (D4), ma non lo dichiara da nessuna parte. | Registrarlo in `brain/tech-debt/crm/sezione-contatti.md`. | sì |
| F6 | MINOR | v4 — parità del cron; v6 — errori | `src/server/services/contact/processDueAlerts.ts:62`, `src/server/effect/db.ts:149` | **Prima:** un alert aperto su una task con `customer_id` NULL, o con un cliente che non esiste più, veniva risolto a metà una volta sola e fermava il ciclo.<br>**Ora:** fallisce con `CustomerMissing` a ogni esecuzione, per sempre. Il job diventa rosso ogni notte, arriva un evento Sentry per notte e in G1 `failed: 0` non si può ottenere.<br>La deviazione è documentata, ma la ricorrenza no, e nessun test copre il ramo "giorno precedente". | Prima di G1, una query in sola lettura su prod. Includere questi alert nella pulizia di PR2 (AC70). Annotare la ricorrenza fra le deviazioni. Aggiungere il test. | da decidere |
| F7 | MINOR | v4 — parità del cron; v3 — massiva | `src/server/services/contact/activeContact.ts:34-57` | Il followup del cron, e i casi della massiva che creano un contatto, ora disattivano tutte le task attive del cliente. È ciò che chiede AC71, ma fino alla pulizia di PR2 cambia i risultati sui dati sporchi:<br>• una task attiva con un suo alert aperto diventa inattiva, e l'alert sparisce da `getCustomersWithActiveAlerts`;<br>• "Assegna Clienti" può scegliere un'altra riga;<br>• se due alert dello stesso cliente scadono lo stesso giorno, resta un solo followup.<br>Questo effetto non è fra le deviazioni documentate. | Documentarlo. Includere nella pulizia di PR2 gli alert aperti su task inattive. Tenere breve la finestra fra PR1 e PR2. | sì |
| F8 | MINOR | v4 — parità del cron (anche v2) | `src/app/api/cron/alert/route.ts:12` (`maxDuration = 60`), `src/server/services/contact/activeContact.ts` | Ogni alert ora costa più giri al DB: 8 invece di 5 per quelli di oggi, 6 invece di 3 per quelli dei giorni prima. In più fa due scansioni di `task`, che non ha un indice su `customer_id`, tenendo il lock del cliente.<br>Il rischio di timeout non è stato misurato. Se il cron va in timeout, gli alert non elaborati il giorno dopo cadono nel ramo "giorno precedente" e non generano il followup. | In G1 misurare durata e numero di alert. Se il margine è stretto, nel cron saltare la query di `previous`, che lì non si usa. | da decidere |
| F9 | MINOR | v1 — atomicità | `src/server/effect/db.ts:67-71` | Se una query dentro la transazione viene interrotta (per esempio da un timeout) e poi fallisce, `tx.failed` non si accende. Il COMMIT della transazione abortita diventa un rollback silenzioso, ma l'esito riportato è un successo (sonda P3b). Serve però un pattern che il docstring vieta e che nessun codice usa. | Registrare il fallimento sulla promise stessa, che resta valida anche dopo l'interruzione. | da decidere |
| F10 | MINOR | v1 — atomicità | `src/server/effect/db.ts:106-123` | Se si interrompe la fiber del chiamante, l'esito dice "interrotto" ma la transazione fa commit (sonda P4). L'atomicità regge, ma l'esito riportato è sbagliato: per esempio `forEachIsolated` conterebbe come fallito un alert già scritto. Oggi nessun bordo interrompe. | Propagare l'interruzione al programma interno, oppure documentare il divieto di timeout e race attorno a `transaction`. | da decidere |
| F11 | MINOR | v1, v5, v6 — test mancanti | `src/server/effect/_test/db.db.test.ts`, `src/server/api/routers/task/_test/createTask.db.test.ts`, `src/app/api/cron/alert/_test/alert.db.test.ts` | Mancano test per:<br>• un COMMIT fallito che diventa `DbError`;<br>• un'interruzione che fa rollback;<br>• l'atomicità di `createTask` dall'inizio alla fine, con un fallimento sul log;<br>• `runTrpc` che non segnala a `ErrorReporter` e non logga i BAD_REQUEST;<br>• lo status 200 quando fallisce l'intera esecuzione del cron;<br>• la regola di uscita di `alert.js`. | Aggiungere questi test. | da decidere |
| F12 | MINOR | v2 — lock | `src/server/effect/db.ts:137-143`, `PLAN.md:325` | La regola documentata ("tutti gli scrittori: clienti → task → alert") non corrisponde al codice. Il cron blocca clienti → alert → task, e gli altri scrittori non prendono il lock del cliente. Oggi non ci sono deadlock, ma per un'altra ragione: solo le transazioni di PR1 hanno più di un comando. Il rischio arriva in PR3, se `resolveAlerts` finisce in una `transaction` senza `lockCustomer`. | Riformulare la regola: "prima il cliente, poi solo le righe di quel cliente; ogni `transaction` che tocca task o alert chiama per prima `lockCustomer`". | no |
| F13 | MINOR | v2 — lock | `src/server/services/contact/processDueAlerts.ts:115` | Il cron azzera `alert_id` della task senza condizione (logica copiata dalla base). Se nel frattempo `createAlert` ha agganciato un nuovo alert alla stessa task, quell'alert resta aperto e scollegato. | Aggiungere la condizione `WHERE id = T AND alert_id = A`. | da decidere |
| F14 | MINOR | v2 — lock | `src/server/api/routers/task/DELETE/index.ts:39-55`, `src/server/api/routers/task/POST/index.ts:210-215` | **Preesistente.** `resolveAlerts`, e l'update dell'alert nella massiva, non hanno né la guardia `is_resolved = false` né il lock. Se corrono accanto al cron o alla massiva, un alert può essere risolto due volte: `resolved_by` viene sovrascritto e si scrive un secondo `alert_resolved`. | Chiuderlo in PR3. | sì |
| F15 | MINOR | v2 — lock | `createTask` (`src/server/api/routers/task/POST/index.ts`) | **Comportamento nuovo.** Una riapertura da una pagina caricata prima sostituisce in silenzio un contatto più recente, per esempio il followup del cron. Prima nasceva un duplicato visibile. AC71 regge; la guardia "contatto superato" arriva in PR3 (AC67). | Scriverlo nella descrizione della PR. | sì |
| F16 | MINOR | v3 — massiva | `src/server/api/routers/task/POST/index.ts:113-120` | Quando due task attive hanno lo stesso `updated_at`, la scelta cambia. La base ordinava in JS al millisecondo e, a parità, seguiva l'ordine fisico delle righe; ora l'ordine è in SQL al microsecondo, poi `id DESC`. Succede solo con duplicati legacy. È documentato. | Una query in sola lettura su prod: clienti con almeno 2 task attive e lo stesso millisecondo. | da decidere |
| F17 | MINOR | v3 — massiva | `src/server/api/routers/task/_test/bulkHandleTask.db.test.ts` | Nessun test fissa l'ordine per `updated_at` né i pareggi, e mancano i casi 3 e 4 con lo stesso stato o lo stesso operatore, dove le righe di log non si scrivono. | Aggiungere questi test. | da decidere |
| F18 | MINOR | v6 — errori | `.github/workflows/update-alert.yml` | **Preesistente.** Il workflow di sviluppo esegue `update:alert:dev`, che chiama `localhost:3000` dal runner di GitHub: fallisce sempre, qualunque cosa faccia il cron. G1 usa `update-alert prod.yml`, che invece è corretto. | Follow-up. | sì |

**NIT**, facoltativi:
- v1: se il ROLLBACK stesso fallisce, l'errore si perde senza traccia (`db.ts:126`).
- v2: il livello di isolamento non è fissato (`db.ts:108`). Con REPEATABLE READ, AC71 non reggerebbe. Passare `{ isolationLevel: "read committed" }`, oppure controllare `default_transaction_isolation` su prod in G1.
- v2: non sono impostati né `lock_timeout` né `idle_in_transaction_session_timeout`.
- v2: `deleteTasks`, che non ha chiamanti, può andare in deadlock con il cron.
- v3: un id cliente ripetuto nell'input (possibile solo via API) ora produce meno righe di log. È ciò che chiede AC71.
- v3: un cliente inesistente ora dà BAD_REQUEST invece di 500. È documentato.
- v3: la numerazione dei casi nei commenti e nei test non segue quella della guida operatori.
- v4: il conteggio `skipped` (guardia `is_resolved = false`) non ha test.
- v4: i test del fuso girano solo in UTC.
- v5: il messaggio mostra "Cliente non trovato: null".
- v6: i tagged error non hanno un `message`, e i log "tRPC procedure failed" e "Item failed" non dicono quale procedura o quale alert.
- v6: non c'è un tetto alle segnalazioni per esecuzione del cron.
- v6: se una causa contiene un errore previsto e un difetto insieme, il difetto non viene loggato. Oggi è solo teorico.

### Fuori perimetro, preesistente (da trattare a parte)

- **`customer.bulkUpdateCustomers` ("Assegna Clienti") può riassegnare tutte le task della tabella** (v3, confermato sul codice). In `src/server/api/routers/customer/PUT/index.ts:125-131`, se `taskIds` è vuoto, `.where(undefined)` genera un `UPDATE` senza `WHERE`. Basta che nessun cliente selezionato abbia in cima una task `chiamare`. Il bug non è in `brain/` e il piano (A7, T3.8) prevede di non toccarne la logica. F1 lo rende più facile da innescare, ma il bug esiste già in produzione.

## What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — atomicità (AC39) | Rollback con un errore tipizzato, un difetto o un'interruzione interna: test del repo più la sonda P1. COMMIT fallito → `DbError` 23505 senza righe (sonda P2). La guardia su un `DbError` recuperato e quella sulle transazioni annidate funzionano (test). Tutte le scritture di `createTask`, `assignCustomer` e `processAlert` passano da `query` su `tx.client`: nessun uso di `ctx.db` o di `@/server/db`. `lockCustomer` richiede `Tx` a livello di tipo. |
| v2 — lock (AC71) | `lockCustomer` è il primo comando delle uniche tre `transaction` di `src/`. Fra i percorsi di PR1 non ci sono deadlock, aggiornamenti persi o doppie risoluzioni dell'alert: ogni transazione tiene il lock di un solo cliente, la massiva gira con `concurrency: 1`, il cron è sequenziale, e c'è la guardia `is_resolved = false` con `RETURNING`. `FOR UPDATE` è la forza giusta, perché entra in conflitto con il `FOR KEY SHARE` delle FK. Con PR1 l'indice unico di PR2 non fallisce sui percorsi di PR1 fra loro. |
| v3 — massiva (AC72) | Casi 1, 2, 3 e 4 senza alert confermato: uguali alla base su `task`, `alert`, `customers` e sulle righe di log (numero, ordine, azione, taskId, stati, operatori, attore, `source`). L'export chiamate conta righe `task` e non legge `task_event_log`. L'ordine di richiesta è mantenuto. Con un fallimento a metà si ferma come prima, ma senza lasciare il cliente fallito a metà. `bulkCreateTask` è rimossa e non ha più chiamanti. Le asserzioni di T1.3 sono invariate. |
| v4 — cron (AC72) | `formatDate`, `isDueToday` e la mezzanotte sono identici: 80.096 coppie di date confrontate con i fusi UTC, Europe/Rome e America/New_York, zero differenze. `innerJoin` dà le stesse righe e lo stesso piano di `leftJoin`. I campi del followup e le righe di log sono uguali. Un alert fallito non ferma gli altri. Le risposte JSON sono compatibili e danno sempre 200. Le asserzioni di T1.2 sono invariate. |
| v5 — `createTask` (T1.7) | Sostituisce il contatto attivo invece di duplicarlo. Nessuna scrittura su `customers` o `alert`, come nella base. `fromState` usa lo stesso ordinamento di `getActiveTask`. Input invariato. I due chiamanti dell'interfaccia sono compatibili: il secondo `updateTaskFromDashboard` diventa un no-op idempotente. Un cliente assente o sconosciuto dà BAD_REQUEST senza scritture; nella base lasciava una task orfana attiva. |
| v6 — errori e Sentry (P9) | Ogni errore arriva a Sentry una sola volta, verificato sul codice delle librerie installate: Sentry 8.20 `trpcMiddleware` e `dropExpectedTrpcErrors`, tRPC 10.45.2, effect 3.22.2. I BAD_REQUEST non diventano issue. Nel cron c'è una segnalazione per ogni alert fallito e una per un fallimento totale, con risposta 200 e il body di prima. `logError` finisce in `console.error`. Nei payload di Sentry e nei log non entra il `detail` di Postgres. L'exit code di `alert.js` è corretto in tutti i casi. |
| v7 — CI e harness | Lint, `tsc`, 67/67 test e `pnpm build` con l'env di CI: tutti verdi. `ci.yml` è invariato. I mock globali non toccano i test jsdom esistenti. Nessun modulo `server-only` raggiunge il client. `@electric-sql/pglite` è allineato al lockfile (`--frozen-lockfile --offline`: aggiornato). `PUSHED_SCHEMA` corrisponde al tech-debt documentato. `resetDb` e i failpoint sono solidi. |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Atomicità del wrapper di transazione (AC39) | SHIP | Nessun percorso attuale lascia scritture a metà. Seconda verifica: F2 chiuso. |
| v2 | Concorrenza, lock, un solo contatto attivo (AC71) | SHIP | AC71 regge a livello di codice sui percorsi di PR1. F3 è nel runbook G2. Seconda verifica: nessun rischio nuovo dalle correzioni. |
| v3 | Parità della massiva (AC72) | SHIP (seconda verifica) | Prima verifica DO NOT SHIP per F1; dopo `87ff79e` la nuova task resta in cima come nella base. |
| v4 | Parità del cron alert (AC72) | SHIP | I risultati sono uguali per gli alert che vanno a buon fine. F6, F7 e F8 vanno documentati o misurati in G1. |
| v5 | `createTask` e i chiamanti dell'interfaccia | SHIP | Il cambio voluto è corretto, senza effetti collaterali. Manca solo un test (F11). |
| v6 | Errori ai bordi e osservabilità (P9) | SHIP | Ogni errore arriva una volta sola, nessun dato personale oltre agli id, l'exit code è corretto. Mancano dei test (F11). |
| v7 | Gate CI e solidità dell'harness | SHIP | I quattro gate sono verdi in locale. F4 e F5 riguardano la fedeltà dell'harness, non i gate. |

## Human Review Checklist

Da completare in ordine, da una persona, prima del merge verso `dev`.

1. ~~**Correggere F1** nel codice di PR1, con un test di regressione. Poi rieseguire il solo verificatore v3; anche v1 e v2 se la correzione tocca `activeContact.ts` o `db.ts`. Va bene quando v3 dà SHIP.~~ Fatto: `87ff79e`, v1, v2 e v3 SHIP.
2. ~~**Decidere F2** (una riga)~~ (fatto), e per ogni MAJOR e MINOR scegliere se entra in PR1 o va in `brain/tech-debt/crm/sezione-contatti.md`. I finding marcati "sì" nella colonna Durable? vanno nel tech-debt.
3. **Gate locali**, tutti con exit 0:
   - `SKIP_ENV_VALIDATION=true pnpm exec next lint`
   - `pnpm exec tsc --noEmit`
   - `pnpm run test --run`
   - `SKIP_ENV_VALIDATION=true NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_KEY=… pnpm build`
4. **Smoke solo sul DB di sviluppo.** Mai uno script con `NODE_ENV=production`. `pnpm update:alert:dev` risolverebbe gli 814 alert scaduti presenti sul DB di sviluppo: serve un ok esplicito prima di lanciarlo.
5. **PR verso `dev`** con la CI verde (Lint, Test, Build). Nella descrizione: il runbook G1, e i comportamenti nuovi F7 e F15.
6. **Prima di G1, query in sola lettura su prod**, lanciate da Omar:
   - `SHOW TIME ZONE` (F4);
   - `SHOW default_transaction_isolation` (NIT di v2);
   - alert aperti su task con `customer_id` NULL o con un cliente inesistente (F6);
   - numero di alert scaduti e dimensione di `task` (F8);
   - clienti con almeno 2 task attive, e quanti hanno lo stesso millisecondo (F7, F16).
7. **G1, dopo il deploy in produzione.** Omar lancia `update-alert prod.yml` con `workflow_dispatch`. Va bene se:
   - il job è verde;
   - il JSON nel log di GitHub Actions ha `failed: 0` e `found = processed + skipped + failed`;
   - la durata sta sotto i 60 s;
   - nei log Vercel di `/api/cron/alert` non ci sono errori inattesi;
   - su Sentry prod c'è un evento per ogni alert fallito e nessun doppione.
8. **PR1 deve essere in produzione prima dell'indice unico di PR2.** Aggiungere F3 al runbook G2.
9. **Nessuno script con `NODE_ENV=production`** eseguito da un agente, in nessun passo.

## Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC39: il cambio avviene per intero o per niente (percorsi di creazione di PR1) | Met | v1. La garanzia per i chiamanti futuri dipende da F2. |
| AC71: un solo contatto attivo, parte codice, percorsi di PR1 | Met, con riserva | v2 e v5. Il tipo non impone il lock (F2). `updateTask` può riattivare un contatto sostituito (F3, preesistente, chiuso in PR3). |
| AC72: cron alert con gli stessi risultati; un fallimento non ferma gli altri | Met | v4 e v6. Deviazioni da documentare: F6, F7. Rischio di timeout: F8. |
| AC72: quattro casi della massiva con gli stessi risultati | Met (seconda verifica) | Prima verifica Unmet per F1. Dopo `87ff79e` righe e task in cima uguali alla base in tutti e quattro i casi (v3). Sui dati sporchi cambia l'ordine in cima (R2), fuori da AC72. |
| Non-goal: comportamento della massiva invariato | Met (seconda verifica) | Come sopra. |
| Non-goal: l'export chiamate conta come oggi | Met, con riserva | Le righe prodotte dalla massiva sono identiche (v3). Dopo F1, un successivo "Assegna Clienti" attribuisce la nuova riga a un altro operatore rispetto a oggi. |
| Non-goal: comportamento del cron invariato | Met | v4. L'unico cambio è la disattivazione di tutte le task attive (F7), consentita da AC71 e AC72. |
| D9, P8, P9 (Effect, errori, Sentry una volta sola) | Met | v1, v6. |
| FLOW: "Errore di rete o del server (AC39)" | Met lato server | Il messaggio e la disabilitazione del controllo nell'interfaccia arrivano in PR3. |
| Gate CI | Met in locale | v7. La CI sulla PR non è ancora partita. |

## Notes for docs-maintenance

- Finding durevoli da portare in `brain/tech-debt/crm/sezione-contatti.md`: F3 (già nel runbook G2 e nei rischi), F5 (già registrato), F7, F14, F15, F18, R4, e il `.where(undefined)` di `bulkUpdateCustomers`. Aggiungere quelli "da decidere" che non entrano in PR1.
- Pagine di dominio che dovrebbero rimandare a questa review: n/a, perché `brain/domains/` è vuoto.

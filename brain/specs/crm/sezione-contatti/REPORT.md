---
domain: crm
type: review
scope: spec
spec: sezione-contatti
review_target: "branch claude/pr6-resolution-e7198b — PR6: T6.1–T6.10 senza la migrazione di T6.9 (do-not-ship al primo giro: 0 BLOCKER e 2 MAJOR aperti), round in fondo; round di PR1, PR2, PR3, PR4, PR5a e PR5b più sopra"
base_ref: 434b0474868eaa862c9c0e30d79d5163bd116ca8
head_ref: 6d6566d7ce6e5bdf9dea832ebf97ea23c217fe53
verdict: do-not-ship
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
updated: 2026-10-21
---

# Review Report: Sezione Contatti — PR1 "Percorsi di creazione sicuri"

## Verdict

**SHIP** · impact: critical · dopo le correzioni di `87ff79e`, rieseguendo v1, v2 e v3 (vedi "Seconda verifica"), e dopo la terza verifica su "Assegna Clienti" e i minor urgenti (v4 SHIP). Il cron a tempo, aggiunto dopo lo smoke, non è passato da un verificatore: lo coprono test e mutazioni (vedi "Smoke"). La checklist umana resta obbligatoria.

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

## Terza verifica (minor urgenti e "Assegna Clienti")

Piano validato in chat il 2026-09-25: correggere "Assegna Clienti" in questo branch e i minor urgenti. Commit `7145af5` ("Assegna Clienti"), `710548c` (F12, F13, isolamento, test di F6, F11 e R1), più le correzioni successive (test da v4, `createTask`). Due passaggi nuovi su Opus, con charter ristrette ai commit:

| Pass | Verdict | Esito |
|------|---------|-------|
| v4 — cron e `transaction` | SHIP | F13 dà righe identiche alla base in 4 stati di dati (anche sporchi), due esecuzioni ciascuno; diverge solo nella corsa con `createAlert`, dove ora l'alert agganciato non resta orfano. `read committed` esce come comando senza parametri, valido con `prepare: false` e col pooler in transaction mode; il test lo prende se tolto. Ogni test nuovo fallisce se si toglie il comportamento che nomina (9 mutazioni). La regola dei lock vale per tutte e tre le `transaction` del repo. |
| vA — "Assegna Clienti" e strumenti di test | interrotto | Il verificatore si è fermato prima del report (stallo). Risultati parziali sul test di F1 con `slowWritesTo`: correzione verde 30/30; ciascuna metà annullata presa 10/10; variante con solo `statement_timestamp()` non presa (0/10), come atteso: protegge dallo sfasamento degli orologi, che PGlite non può simulare. La sua scansione dei `WHERE` che possono diventare indefiniti ha trovato lo stesso schema negli update dell'import (fuori perimetro, segnalato come attività separata). |

Rilievi nuovi:

| # | Severity | Da | Problema | Stato |
|---|----------|----|----------|-------|
| R10 | MAJOR | orchestratore, dopo la seconda verifica | `createTask`: con T1.7 la vecchia task viene disattivata nella stessa transazione e risulta più recente della nuova; nella base in cima c'era la nuova. "Assegna Clienti" non spostava più il contatto riaperto. La seconda verifica di v3 dava l'ordine di `createTask` come invariato: non lo era. | Corretto (`mostRecent: true`), test rosso 5/5 prima e verde 20/20 dopo. |
| R11 | MINOR | v4 | Il livello di isolamento costa un giro al DB in più per transazione, cioè per alert; con `prepare: false` ogni comando con parametri ne costa due. Un alert di un giorno precedente fa circa 11 giri, uno di oggi circa 15. Misurato nello smoke: circa 7 giri ad alert, uno per comando, non 11; circa 2,3 volte la base. Chiuso con il cron a tempo. |
| R12 | MINOR | v4 | I test del cron restavano verdi con l'azzeramento incondizionato di `alert_id` spostato prima della guardia `is_resolved` (M10). | Corretto: test "skipped" nel ramo "giorno precedente"; la mutazione ora fallisce. |
| R13 | MINOR | v4 | La deviazione di F13 e il cambio di isolamento non erano documentati; in più, nella corsa con `createAlert` l'alert agganciato scatta in un'esecuzione successiva con followup e log (una riga in più nell'export rispetto alla base). | Documentato in IMPLEMENTATION-NOTES. |
| R14 | NIT | v4 | `alert.test.ts` non controllava la stampa della risposta nei casi di fallimento. | Corretto. |
| R15 | NIT | v4 | In `update-alert prod.yml` il messaggio Telegram parte solo se il job è verde: con la nuova regola di uscita un'esecuzione con alert falliti non manda messaggi. | Nel runbook G1. |
| R16 | NIT | v4 | `afterNextWriteTo` esegue la scrittura "concorrente" dentro la transazione del cron: i test non esercitano la visibilità di READ COMMITTED. | Già nel tech-debt (F5). |

## Smoke su sviluppo e cron a tempo

Smoke di T1.8 sul DB di sviluppo il 2026-09-25, con ok in chat; mai prod. Il server locale gira in `TZ=UTC`: su un server in `Europe/Rome` il limite delle date del cron cade un giorno prima (preesistente, nel tech-debt).

- **Percorsi:** riapertura, massiva nei 4 casi e "Assegna Clienti" senza regressioni; dopo ogni passo un solo contatto attivo.
- **Cron, 815 alert scaduti** (814 di giorni precedenti, 1 di oggi):
  - 808 risolti dall'operatore di sistema e un followup con i campi giusti;
  - log coerente: 808 `alert_resolved` e 1 `state_change`;
  - clienti con più task attive: 7 prima e 7 dopo.
- **8 fallimenti per `ECONNRESET`** dopo blocchi di circa 16 minuti della connessione, isolati come previsto da AC72: la risposta diceva `failed: 8` e gli altri alert sono andati avanti. Uno (alert 4100) era già scritto quando la connessione è caduta: contato fra i falliti, risolto davvero. I 7 rimasti sono aperti per il prossimo run.
- **Durata:** 799 alert in 172 s di lavoro, circa 0,2 s ad alert con 30 ms di latenza. Sono circa 7 giri, uno per comando (R11 ne stimava 11). La base faceva 3 comandi: per alert il cron è circa 2,3 volte più lento.

Con `maxDuration = 60` il cron si sarebbe fermato a metà con un arretrato di qualche centinaio di alert, o con la funzione Vercel lontana dal DB (circa 70 alert per chiamata se la region è `iad1`). In quel caso gli alert di oggi potevano restare fuori e il giorno dopo venire solo chiusi, senza followup. Deciso in chat il 2026-09-26: batch in PR1.

- `processDueAlerts` prende prima gli alert di oggi e dopo `budgetMs` (40 s dalla route) non ne prende di nuovi, ma prende sempre il primo. Gli altri li conta in `remaining`.
- `alert.js` richiama finché `remaining` è 0, al massimo 20 volte, ed esce con 1 se una chiamata ha alert falliti o se dopo 20 chiamate non ha finito.
- Dopo, deciso in chat il 2026-09-26 (un followup non va mai perso): `alert.js` ripete dopo 10 s una chiamata che non arriva in fondo, cioè un 504 per il limite di tempo di Vercel, un altro 5xx, un errore di rete o un'esecuzione fallita per intero. Un 4xx esce subito. Non è passato dai verificatori.
- Test: il servizio con tempo esaurito (una chiamata elabora un alert, la seconda l'altro), l'ordine (quello di oggi prima di uno di un giorno precedente creato prima), `remaining` nella risposta della route, e le regole di `alert.js`, compresa la ripetizione dopo una chiamata che non arriva in fondo. Ogni test nuovo è rosso senza il comportamento che nomina: le due mutazioni di `alert.js` (accumulo dei falliti, tetto delle chiamate) falliscono.

## Findings

Prima verifica, su `09de3e8`. F1–F5 sono chiusi o registrati dalla seconda verifica (sopra).

Dopo la terza verifica e lo smoke: F6 ha il test e entra nella pulizia di PR2; F8 è misurato e chiuso dal cron a tempo; F11 è coperto per il cron e `alert.js`, il resto è nel tech-debt; F12 e F13 sono corretti.

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
| F18 | MINOR | v6 — errori | `.github/workflows/update-alert.yml` | **Preesistente.** Il workflow di sviluppo esegue `update:alert:dev`, che chiama `localhost:3000` dal runner di GitHub: ~~fallisce sempre, qualunque cosa faccia il cron. G1 usa `update-alert prod.yml`, che invece è corretto.~~ *Superato il 2026-10-09: per il codice fallirebbe sempre, ma nessuno degli 8 workflow dei cron risulta mai eseguito (`gh run list`, 0 run). Vale per tutti i workflow di sviluppo, non solo per questo. Quelli di prod, compreso `update-alert prod.yml`, chiamavano `mito-deutsche.vercel.app`, che non risulta fra gli alias del team Vercel (tech-debt, "I workflow dei cron chiamavano indirizzi che non risultano del team").* | Follow-up. | sì |

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
3. ~~**Gate locali**, tutti con exit 0~~ (fatto, dopo il cron a tempo: 87/87 test):
   - `SKIP_ENV_VALIDATION=true pnpm exec next lint`
   - `pnpm exec tsc --noEmit`
   - `pnpm run test --run`
   - `SKIP_ENV_VALIDATION=true NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_KEY=… pnpm build`
4. ~~**Smoke solo sul DB di sviluppo.** Mai uno script con `NODE_ENV=production`. `pnpm update:alert:dev` risolverebbe gli 814 alert scaduti presenti sul DB di sviluppo: serve un ok esplicito prima di lanciarlo.~~ Fatto con l'ok in chat (vedi "Smoke").
5. **PR verso `dev`** con la CI verde (Lint, Test, Build). Nella descrizione: il runbook G1, e i comportamenti nuovi F7 e F15.
6. **Prima di G1, query in sola lettura su prod**, lanciate da Omar:
   - `SHOW TIME ZONE` (F4);
   - `SHOW default_transaction_isolation` (NIT di v2);
   - alert aperti su task con `customer_id` NULL o con un cliente inesistente (F6);
   - numero di alert scaduti e dimensione di `task` (F8): secondo Omar il cron su prod gira già ogni giorno, quindi ci si aspetta un numero vicino a zero;
   - clienti con almeno 2 task attive, e quanti hanno lo stesso millisecondo (F7, F16).
7. **G1, dopo il deploy in produzione.** Omar lancia `update-alert prod.yml` con `workflow_dispatch`. Va bene se:
   - il job è verde (il messaggio Telegram parte solo in quel caso, R15);
   - nel log di GitHub Actions c'è un JSON per ogni chiamata arrivata in fondo, ciascuno con `failed: 0` e `found = processed + skipped + failed + remaining`, e l'ultimo ha `remaining: 0`; una riga `Request to /api/cron/alert failed` è una chiamata ripetuta dopo 10 s, da capire con i log Vercel;
   - nei log Vercel ogni chiamata dura meno di 60 s;
   - nei log Vercel di `/api/cron/alert` non ci sono errori inattesi;
   - su Sentry prod c'è un evento per ogni alert fallito e nessun doppione.
8. **PR1 deve essere in produzione prima dell'indice unico di PR2.** Aggiungere F3 al runbook G2.
9. **Nessuno script con `NODE_ENV=production`** eseguito da un agente, in nessun passo.

## Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC39: il cambio avviene per intero o per niente (percorsi di creazione di PR1) | Met | v1. La garanzia per i chiamanti futuri dipende da F2. |
| AC71: un solo contatto attivo, parte codice, percorsi di PR1 | Met, con riserva | v2 e v5. Il tipo non impone il lock (F2). `updateTask` può riattivare un contatto sostituito (F3, preesistente, chiuso in PR3). |
| AC72: cron alert con gli stessi risultati; un fallimento non ferma gli altri | Met | v4 e v6, e lo smoke (8 fallimenti isolati). Deviazioni documentate: F6, F7. Rischio di timeout (F8): chiuso dal cron a tempo. |
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

---

## [Round: 2026-09-29] PR2 — "Pulizia e vincolo DB"

Round aggiunto: il report di PR1 sopra resta com'è. Rubric: round PR2 di [[specs/crm/sezione-contatti/RUBRIC]].

- **Target:** branch `contatti/pr2-vincolo-db` (PR verso `dev`), T2.1, T2.2, T2.3, T2.5, T2.6, T2.7; T2.4 è il runbook G2 in PLAN.md.
- **Compared:** `3ebd720` (merge base con `origin/dev`) → `4b5ef3a`.

### Verdict

**SHIP** · impact: critical, dopo le correzioni e le verifiche successive (sotto). Nessun BLOCKER aperto. La SQL delle migrazioni è quella provata sul DB di sviluppo. La checklist umana (runbook G2) resta obbligatoria.

Prima verifica, su `4b5ef3a`: **DO NOT SHIP**.

Obiezione bloccante più forte (v9, confermata): oggi niente impedisce che lo `schedule` di T2.6 parta su prod prima della migrazione.
- Il ramo di default è `main` e il workflow Update Alerts PROD è attivo.
- La PR di PR2 va su `dev`, e il runbook lega al runbook solo il merge `dev` → `main` della sessione G2. Qualunque promozione `dev` → `main` fatta prima (il deploy di PR1 in G1, un hotfix, PR4 "quando serve") porterebbe lo `schedule` su `main` con il workflow attivo.
- Alle 02:17 UTC il cron chiuderebbe gli alert scaduti prima della pulizia. L'estrazione approvata non sarebbe più valida, e il danno non si annulla.

Secondo BLOCKER (v8, confermato): in `alert.js` il flag `retryingFailed` non si azzera dopo una chiamata con `remaining > 0`. Un alert nuovo che fallisce in fondo a una chiamata successiva manda il job in rosso senza il nuovo tentativo che il piano promette.

### Verifiche successive (dopo le correzioni)

Correzioni in `d803504`, `98f04f8`, `44588ba` e `3bfdd99`. La SQL delle tre migrazioni è invariata: è quella applicata al DB di sviluppo.

| Verifica | Passaggi | Esito | Cosa è emerso | Corretto in |
|---|---|---|---|---|
| Seconda, su `d803504` | v8, v2 (modello forte), v9 (modello forte) | v8 SHIP · v2 SHIP · v9 DO NOT SHIP | BLOCKER chiusi: la guardia `ALERT_CRON_ENABLED` rende lo `schedule` inerte qualunque cosa arrivi su `main`, e `retryingFailed` si azzera. v9: due MAJOR sul runbook (dopo il COMMIT la ripresa portava a controlli che l'uso del CRM fa fallire, senza un ramo prima del passo 8; nessuna regola per confrontare (b) e (c)). v2: gli indici per Contatti vanno ricontrollati in PR5 | `98f04f8` |
| Terza, v9 su `98f04f8` | v9 (modello forte) | DO NOT SHIP | BLOCKER: il controllo del deploy di PR1 (`grep "taskIds.length > 0"`) passava anche sul codice senza guardia, cioè su quello che oggi è in prod (`ed8eb05`). MAJOR: vari controlli prima del passo 8 senza ramo, e il caso di una `ALERT_CRON_ENABLED` rimasta impostata | `44588ba` |
| Mirata, v9 su `44588ba` | v9 (modello forte) | DO NOT SHIP | Il BLOCKER è chiuso: provato con i comandi esatti, fallisce su `ed8eb05` e passa su `3ebd720`. MAJOR nuovo, che fallisce in modo sicuro: il workflow di deploy fa `commit --amend`, quindi Vercel non mostra `headSha` e la deployment va riconosciuta dall'URL | `3bfdd99` |
| Mirata, v9 su `3bfdd99` | v9 (Sonnet) | DO NOT SHIP | Confermati i comandi del deploy, `pg_settings`, il controllo delle esecuzioni pianificate, `git cat-file`, la regex di `.env` e le query di (b). Due MAJOR di precisione. Il dominio che chiamano i cron (`mito-deutsche.vercel.app`) era affermato, non verificato: il log del deploy mostra solo `mito-micro-services.vercel.app`. E la migrazione in attesa di un lock veniva riconosciuta da `client_addr`/`usename`, che con il pooler di Supabase sono uguali per app e migrazione | `f25d8d6` |
| Ristretta, su `f25d8d6` | v9 (Sonnet) | SHIP | Il dominio dei cron è un controllo esplicito con un ramo di stop. Tutti e nove i pezzi delle migrazioni, divisi come fa Drizzle, si riconoscono dal testo della query, e nessuna query dell'app ci somiglia. MINOR: una condizione di stop non verificabile, e le query del migrator su `__drizzle_migrations` non coperte | corretti nel commit successivo |
| Runbook senza via libera degli admin (2026-09-29), sul working tree dopo `b5d7662` | un verifier sul runbook (modello forte), due passate | DO NOT SHIP, poi SHIP | Prima passata, 2 MAJOR. L'avviso del passo 8 prendeva gli operatori da (b), che ha l'operatore della task prima del riallineamento (quasi sempre 1020). E gli export, ora unica traccia e lista del rollback, non avevano un controllo di completezza né un ramo di stop. MINOR: riferimenti rimasti (§13, Decision Log della SPEC, Remaining Work, questa checklist), dati personali negli export, ripresa la stessa sera. Seconda passata: SHIP, 6 NIT, corretti | il commit di questo aggiornamento |

Rilievi MINOR e NIT delle verifiche successive, tutti sul testo e corretti salvo dove indicato:
- v8: un alert che fallisce per la prima volta alla ventesima chiamata aspetta 10 s e il job va in rosso senza un altro tentativo. Accettato, come dopo un 504 alla ventesima chiamata;
- v2: `task_operator_active_idx` messo accanto a `task_priority_active_idx` in T5.1, T5.13 e nel tech-debt; ramo di correzione in avanti al passo 6; commento dello schema che rimanda a `replaceActiveContact`;
- v9: `SHOW TIME ZONE` sostituita da `pg_settings`; controllo delle esecuzioni pianificate già partite; identificazione della migrazione per connessione; regex di `.env` per tutte le forme di dotenv; §12 allineato al passo 8; rollback con SQL eseguibile; query F8 nel runbook.

### Coverage

- Passaggi eseguiti: 9/9. v1, v2, v3, v4, v5 e v9 sul modello più forte (ereditato); v6, v7 e v8 su Sonnet.
- Passaggi saltati o falliti: nessuno.
- Tutti in sola lettura: nessuna connessione a un DB, nessuno script `db:*`, `update:*` o `NODE_ENV=production`. v1 ha scritto una sonda PGlite nella scratchpad della sessione. v5 ha ricostruito lo snapshot dallo schema con l'API di drizzle-kit, in memoria. v9 ha usato `gh` in sola lettura.
- Test rieseguiti dai verificatori: i file delle migrazioni e dell'estrazione (15/15), il cron (15/15), la suite completa (111/111), `tsc` e `next lint` puliti.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v9 — ordine del rilascio | `.github/workflows/update-alert prod.yml:9-13`; PLAN.md T2.4 passo 4 | Il workflow è attivo oggi e PR2 va su `dev`: qualunque merge `dev` → `main` prima della sessione G2 arma lo `schedule` contro il DB non migrato. L'unica barriera è il "Disable workflow" del passo 4, dentro la sessione | Rendere lo `schedule` inerte finché non è abilitato in modo esplicito (guardia nel job), oppure spostarlo in una PR a sé al passo 8, oppure disattivare subito il workflow e controllarlo prima di ogni merge su `main` | no |
| BLOCKER | v8 — `alert.js` | `src/app/api/cron/scheduled/alert.js:83-99` | `retryingFailed` non si azzera quando una chiamata ha `remaining > 0`: un fallimento nuovo in fondo a una chiamata successiva esce con 1 senza il nuovo tentativo | Azzerare il flag su `remaining > 0` e aggiungere il test dell'intreccio | no |
| MAJOR | v2 — indici | PLAN.md T2.4 passi 2 e 6 | `IF NOT EXISTS` salta in silenzio se in `public` c'è una relazione qualsiasi con lo stesso nome. Il controllo del 29/09 guardava solo gli indici di `task`/`alert`, e il runbook non ricontrolla; il controllo dopo la migrazione ("duplicati = 0") passa anche senza indice | Passo 2: nessuna relazione con i cinque nomi in `pg_class`. Passo 6: `indexdef` dei cinque indici e `indisvalid`/`indisunique` dell'indice unico | no |
| MAJOR | v2 — indici | `src/server/db/schema/task.ts:90-92`; SQL `20260929062133` riga 5 | `task_priority_active_idx` (`priority DESC NULLS LAST`) non serve l'ordine di T5.1 (`priority IS NULL, priority <dir>, id <dir>`), né `ASC NULLS LAST`; nessuna query di oggi lo usa | Ridisegnarlo in PR5 sulla query vera, con l'`EXPLAIN ANALYZE` di G4 (migrazione che lo sostituisce) | sì |
| MAJOR | v9 — ordine del rilascio | PLAN.md §13 (riga "L'esecuzione notturna non parte") | Dice di riattivare il workflow se manca il messaggio Telegram, senza limitarlo a dopo G2: con PR2 su `main` e la sessione ferma prima della migrazione riarmerebbe il cron | Limitare la regola a dopo il passo 8, e dirlo nel blocco "se la sessione si ferma" | no |
| MAJOR | v9 — ordine del rilascio | PLAN.md T2.4 passi 4–5; §12 G2 | Il merge (passo 4) viene prima del confronto dell'estrazione (passo 5), e "uguale a quella approvata" non è definito: l'uso di giornata cambia (b) e (c), quindi la sessione si ferma con PR2 su `main` | Rieseguire e confrontare prima del merge; definire il confronto ((a) identica per `contatto_id`, (b) e (c) spiegabili dall'uso del giorno) | no |
| MAJOR | v9 — ordine del rilascio | PLAN.md T2.4 passo 2 | Il controllo di `drizzle.__drizzle_migrations` non dice come si fa: la tabella non ha i tag, e il migrator guarda solo `max(created_at)`. Contare le righe inganna (sviluppo ne ha 3 in più) | `SELECT max(created_at)` = `1788372880766`, nessuna riga ≥ `1790662684995`; ripeterlo prima del passo 5 e a ogni ripresa | no |
| MAJOR | v9 — ordine del rilascio | PLAN.md T2.4 passo 4 | "merge `dev` → `main`" non è limitato a PR2: con PR3 o PR4 già su `dev` la sessione porterebbe codice dell'app (PR3 senza G3) | Prima del merge, `git log --first-parent origin/main..origin/dev` mostra solo il merge di PR2 | no |
| MAJOR | v9 — ordine del rilascio (preesistente) | `src/server/services/contact/processDueAlerts.ts:41-49` | In ora legale gli alert creati dall'interfaccia (scadenza alla mezzanotte locale, 22:00 UTC) non risultano "di oggi": `isDueToday` compensa solo un'ora. Vengono chiusi senza followup. Confermato sul DB di sviluppo: 5.710 scadenze alle 22:00 UTC, 6.727 alle 23:00 UTC. Preesistente (formule invariate da PR1), ma rende falsi il passo 8 del runbook ("il followup per quelli del giorno") e T2.6 per una sessione prima del 25/10 | Fuori perimetro di PR2 (non-goal: comportamento del cron): tech-debt, runbook corretto, decisione di Omar su una PR a sé | sì |
| MAJOR | v8 — `alert.js` | `src/app/api/cron/scheduled/_test/alert.test.ts` | Riscritti due test di PR1, mentre la validation di T2.7 ne ammetteva uno solo ("gli altri test di PR1 restano invariati"). Il secondo passava per il motivo sbagliato ed è diventato più stretto, non più largo | Allineare la validation di T2.7 a ciò che è stato fatto | no |
| MINOR | v1 — pulizia | `src/server/db/migrations/_test/contattiCleanup.db.test.ts:31-100` | `createAlert` della factory aggiorna la task e `$onUpdate` riscrive `updated_at`: nel seed `GREATEST` non si distingue più da `updated_at`, e nessun test protegge l'ordine della migrazione (il commento dice il contrario) | Un cliente con duplicati senza alert, con `created_at > updated_at` sul superstite; correggere il commento | no |
| MINOR | v1 — pulizia | PLAN.md T2.4 | Il runbook non ricontrolla trigger e regole in prod, né prende un'impronta prima/dopo di `task.updated_at`/`task_event_log` come sul DB di sviluppo | Query su `pg_trigger`/`pg_rules` al passo 2; conteggio e md5 prima e dopo la migrazione | no |
| MINOR | v2 — indici | `activeContactIndex.db.test.ts:65-80` | Gli indici di prestazione sono controllati solo per nome | Asserire `indexdef` dei cinque indici | no |
| MINOR | v3 — percorsi di scrittura | PLAN.md §13 (riga F3) e T2.4 passo 9 | Con l'indice, un `23505` da F3 in `bulkHandleTask` ferma anche i clienti successivi dello stesso blocco, non solo "quel cliente" (raggiungibile solo con una chiamata tRPC diretta) | Dirlo in §13 e al passo 9: l'admin rilancia l'assegnazione | no |
| MINOR | v4 — riallineamento | PLAN.md T2.4 passo 1 | La precondizione "guardia di PR1 in prod" non ha un controllo concreto: oggi `origin/main` non contiene `7145af5` | Verificare che il deploy di produzione contenga `7145af5` | no |
| MINOR | v5 — migrator | PLAN.md T2.4 passo 5; §13 | L'attesa del lock non ha limite né procedura di interruzione; §13 nomina solo `task`, ma il lock tiene anche `alert` fino al COMMIT | Controllo di `pg_stat_activity` prima; se resta ferma, `pg_cancel_backend` (rollback); §13 con le due tabelle | no |
| MINOR | v6 — estrazione | `contatti-cleanup-preview.sql:95-110` | (c) è solo un conteggio: al passo 5 uno scambio di task a conteggi uguali non si vede. Le date mostrate dipendono dal fuso della sessione dell'editor | Dirlo nel confronto del passo 5; stesso strumento per le due esecuzioni | no |
| MINOR | v7 — test | `contattiCleanup.systemOperator.db.test.ts` | Il ramo che fallisce della guardia è provato solo su PGlite; la prova sul DB di sviluppo copre solo il ramo riuscito | Accettato: il passo 2 del runbook verifica l'operatore di sistema | no |
| MINOR | v9 — ordine del rilascio | PLAN.md T2.4 | Ripresa senza un criterio (dopo il COMMIT si riparte dal passo 6, non dal 5); punti di non ritorno non segnalati ai passi 5 e 8; passi 4 e 8 senza "(Omar, mai da un agente)"; ambiguità: "query dei duplicati" non indicata, tabella `mito-deutsche_operator`, "No alerts to process" come esito verde, job rosso al passo 8 | Correzioni al testo del runbook | no |
| NIT | v1, v2, v3, v4, v5, v6, v7 | vari | Finestre di concorrenza durante la migrazione (mitigate dall'orario); alert senza task non toccati; unicità controllata riga per riga (commento nello schema); concorrenza non testata; F3 più frequente con il cron notturno; fino a 4 task che entrano nell'export; FK di `customers.operator_id` data per scontata; `created_at` NULL in `__drizzle_migrations`; COMMIT perso per la connessione; default di `customers.id` in prod non letto; `queryReadOnly` senza un test di scrittura rifiutata; formulazione del tech-debt (riga 44) | Nessuna azione obbligatoria | — |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — pulizia | Criterio del superstite identico a `getActiveTask`, `replaceActiveContact` e alla lista Clienti, compresi pareggi e NULL; nessun `DELETE`; task senza cliente mai disattivate; il passo 2 chiude esattamente (b); guardia e rollback; nessun effetto su `updated_at`, `alert_id`, `task_event_log`; file invariato da `1261d86`, quindi lo stesso SQL provato sul DB di sviluppo |
| v2 — indici | L'indice unico parziale vincola davvero un solo attivo per cliente, anche in concorrenza; NULL distinti; con `prepare: false` il predicato è usabile; `task_customer_id_idx`, `task_operator_active_idx` e `alert_task_id_idx` servono query reali o pianificate; schema, SQL e snapshot coincidono |
| v3 — percorsi di scrittura | Chi scrive bloccando il cliente (cron, massiva, `createTask`) non può produrre `23505`; nel cron un fallimento resta nel suo alert; la riapertura scrive solo `isActive: false`; router, import, seed e script non riattivano; l'unico `23505` rimasto è F3, già accettato |
| v4 — riallineamento | Tipi e FK compatibili; nessuna task a NULL; commuta con la pulizia; nessun effetto su `updated_at` e `task_event_log`; nessun altro scrittore massivo di `task.operator_id` oltre a quello protetto dalla guardia di PR1 |
| v5 — migrator | Journal monotono, catena degli snapshot corretta e uguale allo schema; la riga tolta a mano segue il precedente e non rompe il prossimo `db:generate`; solo aggiunte; `drizzle-kit migrate` (driver `pg`, `max: 1`) applica tutte le migrazioni pendenti in una transazione, nell'ordine del journal; il blocco `DO` si divide bene |
| v6 — estrazione | CTE di ordinamento identica alla migrazione; (c) contata dopo la pulizia e provata dal test in due fasi; sola lettura; ordinamenti totali; id stabili in (a) e (b); colonne sufficienti per gli admin |
| v7 — test | Il test in due fasi riproduce il migrator di prod (una transazione); `PUSHED_SCHEMA` idempotente non nasconde differenze; i casi limite richiesti ci sono; niente dipendenze dall'ordine; la prova sul DB di sviluppo è concreta |
| v8 — `alert.js` | Termina sempre entro 20 chiamate; `exit(1)` seguito da `return`; i casi a un solo tentativo sono giusti e testati; tipi JSDoc allineati |
| v9 — ordine del rilascio | Dentro la sessione l'ordine è giusto; alle 02:17 UTC la data è la stessa in UTC, in Italia e nella sessione del DB tutto l'anno; il merge non migra niente; migrazioni atomiche; `db:migrate:prod` solo da Omar |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Migrazione di pulizia T2.2 | SHIP | L'SQL rispetta AC69, AC70 e A6; restano la debolezza del seed e i controlli del runbook (MINOR) |
| v2 | Definizione degli indici T2.3 | DO NOT SHIP | L'indice unico è corretto, ma `IF NOT EXISTS` non viene ricontrollato al rilascio, e un indice non serve la query per cui esiste |
| v3 | Indice unico e percorsi di scrittura | SHIP | Unico `23505` rimasto: F3, accettato; da documentare l'effetto sul blocco della massiva |
| v4 | Riallineamento T2.5 | SHIP | Fa esattamente ciò che dice il contratto; manca un controllo concreto della precondizione |
| v5 | Catena e migrator | SHIP | Catena coerente, una sola transazione; restano lock e controlli del runbook |
| v6 | Estrazione T2.1 | SHIP | Coincide con le migrazioni, per prova; (c) è solo un conteggio |
| v7 | Affidabilità dei test | SHIP | I test modellano il migrator di prod; il ramo che fallisce della guardia è provato solo su PGlite |
| v8 | `alert.js` (T2.7) | DO NOT SHIP | Il flag che non si azzera nega il nuovo tentativo a un fallimento nuovo |
| v9 | Ordine del rilascio | DO NOT SHIP | Lo `schedule` può arrivare su `main` prima della sessione con il workflow attivo |

### Human Review Checklist

Obbligatoria (`review_impact: critical`). Da seguire prima del merge di PR2 su `main` e prima di G2:

1. Verificare che i due BLOCKER siano chiusi e che una seconda verifica (v8, v9 e v2) li abbia confermati.
2. Eseguire i gate di `AGENTS.md` sulla testa della PR: `SKIP_ENV_VALIDATION=true pnpm exec next lint`, `pnpm exec tsc --noEmit`, `pnpm run test --run`, `pnpm build`; CI verde.
3. Prima di qualunque merge `dev` → `main` successivo al merge di PR2 su `dev` (compreso il deploy di PR1 in G1), controllare che lo `schedule` non possa partire (la guardia scelta per il BLOCKER di v9).
4. Leggere il runbook G2 (T2.4) aggiornato nella descrizione della PR e verificare che copra: controllo di `max(created_at)`, nomi degli indici liberi, trigger, `7145af5` in prod, estrazione confrontata prima del merge, merge limitato a PR2, procedura se il lock resta in attesa, controllo degli indici dopo la migrazione.
5. Decidere sull'`isDueToday` in ora legale (MAJOR preesistente): prima della sessione G2, oppure accettare che la prima esecuzione e le notti fino al 25/10 chiudano senza followup anche gli alert del giorno, e avvisarne gli operatori.
6. Dopo G2, seguire i passi 6–9 del runbook: indici presenti con la definizione giusta, estrazione vuota, cron verde, la notte dopo l'esecuzione `schedule` verde.

> **Aggiornamento del 2026-09-29, dopo questa review:** niente via libera degli admin sull'estrazione (deciso da Omar).
> - Il punto 3 è superato dall'ordine dei merge: PR2 entra in `dev` solo dopo che PR1 è su `main`. La guardia `ALERT_CRON_ENABLED` resta.
> - Nel punto 4, al posto di "estrazione confrontata prima del merge" il runbook deve coprire l'estrazione eseguita dopo il merge e subito prima della migrazione (T2.4, passo 5), con il controllo di completezza e il ramo di stop.
> - La verifica di questa modifica è in "Verifiche successive".

### Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC69 | Met (codice); in prod dopo G2 | Pulizia provata su PGlite e sul DB di sviluppo (7 duplicati → 0) |
| AC70 | Met (codice); in prod dopo G2 | 1.183 alert chiusi dal sistema sul DB di sviluppo, nessuna riga in `task_event_log` |
| AC71 (parte DB) | Met (codice); in prod dopo G2 | Indice unico parziale; da ricontrollare in prod dopo la migrazione (MAJOR di v2) |
| AC72 | Met | Cron e massiva invariati; il fallimento resta nel suo alert. L'`isDueToday` in ora legale è preesistente e uguale alla base |

### Notes for docs-maintenance

- Durable findings da portare in `tech-debt/crm/sezione-contatti.md`: `task_priority_active_idx` da ridisegnare in PR5; `isDueToday` in ora legale (alert di oggi senza followup); ramo che fallisce della guardia provato solo su PGlite.
- Domain pages che dovrebbero rimandare a questa review: nessuna (manca ancora `brain/domains/crm/`).

---

## [Round: 2026-10-15] PR3 — "Regole del contatto sul server, usate da Clienti"

Round aggiunto: i report di PR1 e PR2 sopra restano come sono. Rubric: round PR3 di [[specs/crm/sezione-contatti/RUBRIC]].

- **Target:** branch `contatti/pr3-regole-server` (PR verso `dev`), T3.1a–T3.17, gate T3.14.
- **Compared:** `d4f5d2c` (merge base con `dev`) → `ba4f388` (prima verifica) → `45ae55e` (dopo le correzioni).

### Verdict

**SHIP** · impact: critical, dopo le correzioni e le verifiche successive (sotto). Nessun BLOCKER né MAJOR aperto. La checklist umana resta obbligatoria prima del merge e del deploy (G3).

Prima verifica, su `ba4f388`: **DO NOT SHIP**. Un BLOCKER (v7), otto MAJOR (v1, v5, v6 ×5, v7). Il nucleo server regge: concorrenza (v2), regole di dominio (v3) e superficie API (v4) danno SHIP.

Obiezioni più forti:
- **v1:** `assignToYourself` controlla solo che il cliente non abbia un operatore, non chi tiene il suo contatto attivo. Su un cliente senza operatore con il contatto di un collega (dati che T2.5 lascia apposta), un operatore diventa operatore del cliente, modifica il contatto del collega (D2) e con `handover` lo passa a un terzo. È quello che P4 e A1 vietano.
- **v5:** con react-query 4 le callback passate a `mutate(…, {onSuccess, onError})` non girano se il componente si smonta prima della risposta. Chiudendo la scheda, o lasciando la riga, durante un salvataggio, un rifiuto non dà né toast né refresh (AC52).
- **v7:** `transition-colors` sulle voci del menu dello stato: l'evidenziazione che segue frecce e puntatore sfuma in 150 ms sul controllo più usato da tastiera. L'eccezione di `motion.md` copre solo apertura e chiusura.

### Verifiche successive (dopo le correzioni)

Correzioni in `1b50ace` (codice), `4fae91b` e `afb2975` (registro, note, test), `45ae55e` (indicazione "Assegna a te", priorità in sola lettura). Rilanciati i passaggi con un verdetto DO NOT SHIP: v1, v5, v6, v7. v2, v3 e v4 non rilanciati: le correzioni toccano il loro perimetro solo con test aggiunti e con il rifiuto di "Crea contatto" (v4), un payload già coperto dal contratto degli errori.

| Verifica | Passaggi | Esito | Cosa è emerso | Corretto in |
|---|---|---|---|---|
| Seconda, su `1b50ace` | v1 (modello forte) | SHIP | MAJOR chiuso: `assignToYourself` legge il contatto attivo `FOR UPDATE` dopo il lock e rifiuta quello di un collega, per ogni ruolo; provato per mutazione (2 test rossi). MINOR chiuso: `reassign` controlla `canReassign` nel servizio (mutazione: 1 test rosso). NIT: tech-debt non ancora committato; P4 del PLAN da allineare; nessun test del link nel client; in `reassign` il ruolo si controlla dopo il caricamento (nessuna scrittura, irraggiungibile da fuori) | `4fae91b` (tech-debt, P4) |
| Seconda, su `1b50ace` | v5 (Sonnet) | SHIP | MAJOR chiuso: `mutateAsync(...).then(ok, err)` in tutti e cinque i componenti; `router.refresh` gira anche dopo lo smontaggio (test con `useMutation` e `useRefreshAfterSave` veri). MINOR chiusi: focus solo se perso, ripiego dopo la "X". Restano MINOR: test dello smontaggio solo per 2 componenti su 5; un'eccezione dentro i gestori di `.then` lascerebbe l'attesa aperta (nessun caso realistico) | — |
| Seconda, su `1b50ace` | v7 (Haiku) | DO NOT SHIP | BLOCKER chiuso: voci del menu senza transizione, con test. Il MAJOR (Select e DropdownMenu nel registro) era solo nel working tree, non nel commit | `4fae91b` |
| Terza, su `4fae91b` | v7 (Haiku) | DO NOT SHIP | Registro e `motion.md` a posto. MINOR: la prova dello spinner fermo con movimento ridotto non era registrata; il `Select` della modale del passaggio di consegne non era nominato nel registro | `afb2975`: prova nel browser registrata (`animationName: none`, 0 animazioni con `reduced-motion`; `spin`, 1 senza), `Select` della modale nel registro |
| Seconda, su `1b50ace` | v6 (Sonnet, browser) | SHIP | 8 rilievi su 9 risolti per misura (dialog con messaggio lungo, contrasti 16,9:1 e 7,1:1 in hover, nome "app.to, cambia stato", motivo intero nella scheda, anello sulle voci, "Assegna a te" 84,7×36 a 7,81:1); il nono è il toast, dichiarato. MINOR: sovrapposizione stato/priorità solo sotto 484 px (prima sotto 895); priorità in sola lettura fuori dalla card sotto 548 px. NIT: `showHint` mai passato | `45ae55e` (`flex-wrap`, indicazione mostrata); sovrapposizione sotto 484 px nel tech-debt |

L'ultimo passaggio di v7 (`afb2975`) e l'indicazione "Assegna a te" (`45ae55e`) non sono stati rivisti da un verificatore. Il primo chiude una richiesta di prova, non di codice. Il secondo l'ho controllato nel browser su `zzpr3-c15` (cliente e contatto senza operatore): l'indicazione compare sotto "Non assegnato" nella scheda e nella riga di Clienti.

Correzioni oltre i rilievi, trovate durante le verifiche:
- `showHint` non era passato da nessun chiamante, quindi l'indicazione di A1 ("Non assegnato" con "Assegna a te", T3.9b) non compariva mai. Ora la passano lista e scheda;
- il `flex-wrap` della priorità in sola lettura (v6, MINOR).

### Coverage

- Passaggi eseguiti: 7/7. v1–v4 sul modello più forte (ereditato); v5 e v6 su Sonnet; v7 su Haiku.
- Passaggi saltati o falliti: nessuno.
- v6 (UI) sul server di sviluppo `next dev` (porta 3100, DB di sviluppo), avviato per la review e fermato dopo, con due utenti di sviluppo (un operatore, un admin) sui clienti di prova `zzpr3-*`. Chromium solo, tema chiaro (il tema scuro non è applicato da niente nell'app), axe non disponibile. Il probe `hit-area` su "Assegna a te" ha assegnato `zzpr3-c7` all'admin: ripristinato a "nessun operatore" sul DB di sviluppo subito dopo.
- v2 ha eseguito mutazioni (togliere `.for("update")`, le guardie di `resolveOpenAlert`, il ramo 23505) in una copia del repo nella scratchpad. Nessun altro accesso a un DB; nessuno script `db:*`, `update:*` o `NODE_ENV=production`.
- Gate rieseguiti dai verificatori: `pnpm run test --run` completo (55 file, 825 test), `tsc --noEmit` e `next lint` puliti.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v7 — movimento | `src/components/custom/contact/ContactStateSelect.tsx:93` | `transition-colors` (150 ms) sulle `RadioItem`: l'evidenziazione sfuma a ogni freccia o movimento del puntatore sul controllo più usato da tastiera | Togliere la classe; test che la classe delle voci non contenga `transition` | no |
| MAJOR | v1 — autorizzazione | `src/server/services/customer/assignment.ts:135` | `assignToYourself` accetta un cliente senza operatore anche quando il contatto attivo è di un collega: l'operatore ne ottiene la modifica (D2) e con `handover` lo sposta | Dopo `lockCustomer`, leggere il contatto attivo `FOR UPDATE` e rifiutare con `CustomerAssignmentForbidden` se il suo operatore non è null né l'attore; test con il contatto di un collega | no |
| MAJOR | v5 — mutation nel client | `CustomerTaskManager.tsx:105-140`, `CustomerAlertCreator.tsx:94-143`, `CustomerCreateContact.tsx:107-122`, `CustomerColumns.tsx:503-537`, `CustomerHandoverDialog.tsx:128-140` | Callback per chiamata di `mutate`: perse se il componente si smonta a metà salvataggio (nessun toast, nessun refresh) | `mutateAsync` con try/catch, o callback nelle opzioni di `useMutation`; test che smonta a metà salvataggio | no |
| MAJOR | v6 — UI | `CustomerTaskManager.tsx:252` (`grid-cols-4`) | Il trigger dello stato, ora fisso a 160 px, si sovrappone al selettore della priorità sotto ~895 px (17 px a 800, 113 a 320). Prima il `Select` era `w-full` | Colonne che contengono il controllo (`grid-cols-2 lg:grid-cols-4` o `auto-fit`) | no |
| MAJOR | v6 — UI | `AlertCloseConfirmDialog.tsx:79-83` | Un messaggio con una parola lunga (un URL) allarga la griglia e spinge fuori Annulla e "Cambia stato"; 30 righe portano i pulsanti sotto il viewport, senza scorrimento | `min-w-0 max-h-[40vh] overflow-y-auto [overflow-wrap:anywhere]` sul messaggio | no |
| MAJOR | v6 — UI | `AlertCloseConfirmDialog.tsx:76-81`, `CustomerHandoverDialog.tsx` (`DialogDescription`) | Descrizione `#737373` su `#ededed`: 4,05:1, sotto 4,5 (1.4.3). Porta la data dell'alert (AC36) | `text-foreground` sulle due `DialogDescription` | no |
| MAJOR | v6 — UI | `ReadOnlyReason.tsx` nella riga in hover | Motivo `#737373` sulla riga `hover:bg-gray-100`: 4,31:1 (1.4.3) | Testo più scuro (`text-neutral-600`) o pillola con sfondo bianco | no |
| MAJOR | v6 — UI | `CustomerTaskManager.tsx:213`; `CustomerColumns.tsx` | Nome accessibile del selettore: nella scheda "Stato" senza il valore visibile (2.5.3, 4.1.2); nella lista solo il valore, senza lo scopo (2.4.6) | In `ContactStateSelect`, nome che comincia dal valore e dice l'azione (`"<stato>, cambia stato"`) | no |
| MAJOR | v7 — movimento | `CustomerTaskManager.tsx:294-334`; `ui/select.tsx:78`, `ui/dropdown-menu.tsx:50,68` | Il `Select` della priorità (nuovo) e il contenuto del `DropdownMenu` condiviso animano senza variante `motion-reduce`, e la voce del registro "Lacune dei primitivi di movimento" non li nomina | Aggiungerli alla voce del tech-debt | sì (registro) |
| MINOR | v1 — autorizzazione | `src/server/services/contact/reassign.ts:54` | Il servizio non controlla `canReassign`: AC50 regge solo perché la procedura è `adminProcedure` | `ContactForbidden` se `!canReassign(actor)` nel servizio, con test | no |
| MINOR | v2 — concorrenza | `createContact.ts:90-103` | Il ripiego su 23505 non è eseguito da nessun test (togliendolo, 196 test restano verdi) | Failpoint PGlite che solleva `unique_violation` sull'insert di `task` | no |
| MINOR | v2 — concorrenza | `task/POST/index.ts:159-160, 196-202` | La conferma dell'alert nella massiva è legata al cliente, non all'alert: se un collega sostituisce l'alert nel frattempo, la massiva chiude quello nuovo. Preesistente (A7), non dichiarato | Dichiararlo in "Scrittori fuori dalla regola dei lock" | sì |
| MINOR | v3 — dominio | `setCallback.ts:74`; `processDueAlerts.ts:84,161-175` | Il server accetta una scadenza "oggi" (A4), ma il cron delle 23:47 UTC la vede il giorno dopo come "passata" e chiude senza followup. Oggi il calendario esclude oggi | Decidere: scadenza da domani sul server, oppure dichiararlo nel tech-debt e in A4 prima che un'interfaccia permetta oggi | sì |
| MINOR | v3 — dominio | test dei servizi | Rami senza assert: `reassign` con solo il contatto che cambia (la riga `operator_reassign`); `setCallback` da `caricato`/`erogata`/`non interessato`; `createContact` con `source: "list"`; `changeState` da stato NULL | Aggiungere gli assert | no |
| MINOR | v4 — contratto errori | `createContact.ts:55-57` | `ContactForbidden({assignee: null})` mostra "non è assegnato" a un cliente assegnato a un collega; raggiungibile da una pagina rimasta aperta dopo un passaggio di consegne | Nome dell'operatore del cliente nel payload | no |
| MINOR | v5 — mutation nel client | `CustomerForm.tsx:243-260` | Dopo "Assegna a te" e il passaggio di consegne il focus va al testo dell'operatore anche se l'utente l'ha spostato altrove | `focusIsLost()` o focus dentro il contenitore | no |
| MINOR | v5 — mutation nel client | `CustomerAlertCreator.tsx:72-76` | Chiuso l'alert con la "X" senza trigger (dati legacy), il focus resta sul contenitore della Sheet | Destinazione di ripiego | no |
| MINOR | v5 — mutation nel client | `src/components/custom/contact` | Nessun test automatico per gli hook e i loro consumatori | Test sui rami di `fail`/`awaitRefresh` più usati | no |
| MINOR | v6 — UI | `ReadOnlyReason.tsx:41-48` | `w-40` fisso: "Assegnato a Martina Vi…" anche nella scheda, dove c'è spazio; il nome intero solo nel `title` (AC51) | Larghezza fissa solo nella tabella | no |
| MINOR | v6 — UI | `ContactStateSelect.tsx:93` | Voce del menu con il focus: solo `bg-accent` su bianco, 1,09:1 (1.4.11) | Anello interno sulle voci | no |
| MINOR | v6 — UI | `ui/toast` (variante `destructive`) | Toast di rifiuto `#fafafa` su `#ef4444`: 3,61:1 (indicativo) | Primitivo condiviso: registro, oppure `bg-red-600` | sì |
| MINOR | v6 — UI | `CustomerForm.tsx` ("Assegna a te") | 85×20 px (sotto i 24 del progetto; regressione da `h-auto`) e `#a3a3a3` su bianco 2,52:1 | Togliere `h-auto`, `text-neutral-600` | no |
| NIT | v1, v2, v3, v4, v5, v6, v7 | vari | Rotta di import senza controllo di `operatorId` (aggiungerla alla voce di `insertCustomer`); massive senza controllo dell'operatore di destinazione; `FOR NO KEY UPDATE`; harness che prova il lock solo al momento della scrittura; commento di `AlertNotFound` (`errors.ts:35`); `changeState` ignora `{resolved}`; `input.id!` in `updateCustomerFromDashboard`; `openAlert!`/`created!`; test duplicato in `router.db.test.ts`; messaggio generico di `enforceIsAdmin`; `{alert}` ignorato dopo `onError`; finestra di doppio invio in `CustomerAlertCreator`; 3 s di attesa in `CustomerCreateContact`; spinner fermo con movimento ridotto (verificato nel passaggio nel browser); pulsante di chiusura del toast senza nome, "X" della Dialog 16×16 | Nessuna azione obbligatoria | — |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — autorizzazione | Attore sempre dalla sessione, ruolo riletto dal DB; ogni scrittura del contatto decide sulle righe bloccate; massive e `reassign` su `adminProcedure`; i rifiuti non scrivono niente (test dal router vero); nessun altro percorso cambia un operatore |
| v2 — concorrenza | Ogni scrittore blocca il cliente prima delle letture che decidono; gli id di alert mandati dal client sono confrontati dopo il lock; le due guardie di `resolveOpenAlert` provate per mutazione; nessuno stato parziale (snapshot); senza `FOR UPDATE` 19 dei 21 test della regola vanno in rosso |
| v3 — dominio | AC30–AC34, AC38, AC40–AC47, AC27, AC29, AC66, AC67: ogni regola ha un test che fallirebbe se cambiasse; fasce e "auto" (D3); giorno di Roma con i cambi d'ora |
| v4 — superficie API | Nessun chiamante rimasto delle procedure rimosse (client, action, route, cron, workflow, script, repo `mito-deutsche`); massive irraggiungibili agli operatori; `contactError` sopravvive a superjson ed è decodificato in modo esaustivo; AC73 |
| v5 — mutation nel client | Conferma guidata dal server (AC36, AC37), retry una sola volta; il controllo mostra sempre il valore salvato; toast 8000 ms; AC44 tiene aperto il modulo; nessuna attesa bloccata sui percorsi raggiungibili; focus ripristinato |
| v6 — UI | Trigger 160×40 stabili da 320 a 1920 px; spinner nella sede della freccia; anelli di focus visibili e non tagliati; destinazioni di focus programmatiche visibili; target ≥ 24 px; badge di stato con contrasto ≥ 6,49; ruoli e nomi delle dialog; focus iniziale su Annulla; testi di AC36, AC51, AC52, AC66 presenti |
| v7 — movimento | Menu dello stato senza animazione di apertura e chiusura (test); sei spinner tutti con `motion-reduce:animate-none`; nessun `transition-all`, keyframe o scroll smooth nuovo |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Autorizzazione delle scritture | DO NOT SHIP | Nucleo solido, ma `assignToYourself` apre la modifica del contatto di un collega |
| v2 | Concorrenza e atomicità | SHIP | Lock prima delle letture, atomicità provata; resta un ramo difensivo senza test |
| v3 | Regole di dominio | SHIP | Tutte le regole rispettate e coperte; la scadenza "oggi" contro il cron è latente |
| v4 | Superficie API e contratto degli errori | SHIP | Nessun chiamante rimasto; un messaggio di rifiuto sbagliato per "Crea contatto" |
| v5 | Mutation nel client | DO NOT SHIP | Toast e refresh persi se il componente si smonta a metà salvataggio |
| v6 | UI pass | DO NOT SHIP | Cinque MAJOR locali: sovrapposizione nella scheda, dialog con messaggio lungo, due contrasti, nome accessibile |
| v7 | Movimento | DO NOT SHIP | `transition-colors` sulle voci del menu; Select e DropdownMenu fuori dal registro |

### Human Review Checklist

Obbligatoria (`review_impact: critical`). Da seguire prima del merge di PR3 su `dev` e prima del deploy (G3):

1. Verificare che il BLOCKER e i MAJOR siano chiusi: tabella "Verifiche successive" (v1, v5, v6 SHIP; v7 chiuso con la prova registrata in `afb2975`).
2. Matrice dei permessi, anche con richieste fuori dall'interfaccia: un operatore cambia stato, priorità, richiamo e alert solo dei contatti suoi o dei clienti suoi (D2, A1); crea un contatto solo per i clienti suoi; "Assegna a te" solo su un cliente senza operatore e senza il contatto di un collega; `reassign` e le massive solo per gli admin.
3. Nessun client già distribuito, workflow cron o script chiama una procedura rimossa (`updateTask*`, `task.createTask`, `createAlert`, `resolveAlerts`, `deleteTasks`, `customer.updateCustomer`): grep su `src`, `.github`, `package.json` e repo `mito-deutsche`.
4. Regola dei lock: ogni scrittore nuovo blocca il cliente prima di leggere; le eccezioni dichiarate (cron, "Assegna Clienti" A7, `cleanupTaskEventLog`, la conferma della massiva legata al cliente) sono nel tech-debt.
5. Eseguire i gate di `AGENTS.md` sulla testa della PR, in un checkout senza i file env veri: `SKIP_ENV_VALIDATION=true pnpm exec next lint`, `pnpm exec tsc --noEmit`, `pnpm run test --run`, `pnpm build` con i segnaposto; CI verde.
6. Non eseguire nessuno script di produzione (`db:*:prod`, `update:*` senza `:dev`, `NODE_ENV=production`): PR3 non ha migrazioni.
7. Prima del deploy, l'annuncio agli operatori di G3 (testo in PLAN.md T3.14 e nella descrizione della PR).

### Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC27 | Met (server) | Rifiuto `CONTACT_SUPERSEDED` su ogni mutation; avviso e link sono di PR5 |
| AC29 | Met | `resolveAlert`, Storico con chi l'ha chiuso |
| AC30–AC34 | Met | Transizioni, "Contattato il", riapertura con lo stesso operatore |
| AC36 | Met | Conferma con data e messaggio; dopo le correzioni il messaggio scorre dentro la modale e la descrizione è a 16,9:1 (v6, seconda verifica) |
| AC37–AC41 | Met | Conferma guidata dal server, log, atomicità, no-op, operatore invariato |
| AC42–AC47 | Met | Fasce, "Automatica", richiamo, `operator_reassign` |
| AC48, AC50 | Met | Admin ovunque; `reassign` solo admin, anche nel servizio |
| AC49 | Met | Dopo le correzioni "Assegna a te" rifiuta il contatto di un collega (v1, seconda verifica) |
| AC51 | Met | Motivo visibile a 7,1:1 anche in hover; intero nella scheda, troncato nella lista a 160 px (PLAN §9, tech-debt) |
| AC52 | Met | Toast e refresh anche se la scheda si chiude a metà salvataggio (v5, seconda verifica); il link al contatto attivo arriva con PR5 (P5) |
| AC66, AC67 | Met | Il rifiuto per il cliente di un collega nomina il suo operatore |
| AC73 | Met | Clienti e scheda usano le stesse mutation di Contatti |

### Notes for docs-maintenance

- Durable findings, già nel tech-debt (`tech-debt/crm/sezione-contatti.md`): Select e DropdownMenu nella voce "Lacune dei primitivi di movimento"; conferma della massiva legata al cliente; scadenza "oggi" contro il cron notturno; contrasto del toast `destructive` ("Contrasto e nomi nei primitivi condivisi"); rotta di import e massive nella voce di `insertCustomer`; "La scheda cliente non regge sotto i 900 px".
- Non durevoli, corretti prima del merge: tutti gli altri BLOCKER, MAJOR e MINOR della tabella. Restano come MINOR senza voce: test dello smontaggio per `CustomerAlertCreator`, `CustomerCreateContact` e `CustomerHandoverDialog`; il ruolo controllato dopo il caricamento in `reassign`.
- Domain pages che dovrebbero rimandare a questa review: nessuna (manca ancora `brain/domains/crm/`).

---

## [Round: 2026-10-15] PR4 — "Chat con proprietario esplicito"

Round aggiunto: i report di PR1, PR2 e PR3 sopra restano come sono. Rubric: round PR4 di [[specs/crm/sezione-contatti/RUBRIC]].

- **Target:** branch `contatti/pr4-chat-cliente` (PR verso `dev`), T4.1, T4.3, T4.4, gate T4.2.
- **Compared:** `c787dd1` (`dev`) → albero di lavoro non committato (prima verifica e verifiche successive, sul branch non ancora committato).

### Verdict

**SHIP** · impact: critical, dopo le correzioni e le verifiche successive (sotto). Nessun BLOCKER né MAJOR aperto. La checklist umana resta obbligatoria prima del merge e del deploy.

Prima verifica: **DO NOT SHIP**. Nessun BLOCKER, quattro MAJOR (v1 ×2, v4, v5). Danno SHIP il perimetro di AC55/AC56 e la parità del refactor (v2), il confine delle server action (v3) e i gate (v6).

Obiezioni più forti:
- **v1:** chiusa e riaperta la chat mentre un invio è in corso, il fallimento scrive la bozza dopo il montaggio della chat nuova: il campo resta vuoto, e la prima lettera digitata sovrascrive la bozza con il solo testo nuovo. Il testo fallito si perde senza essere mai mostrato (AC76).
- **v4:** la bozza ha la chiave del solo cliente e l'uscita non la cancella: un collega che entra dopo, nella stessa finestra, la trova nel campo e può inviarla a suo nome.
- **v5:** "Nota non inviata, riprova" in `text-destructive`, `#ef4444` su bianco: 3,76:1, sotto 4,5 (1.4.3).

### Verifiche successive (dopo le correzioni)

Rilanciati i passaggi con un verdetto DO NOT SHIP: v1, v4, v5. v2, v3 e v6 restano SHIP; i loro MINOR sui test delle action sono chiusi (`_actions/_test/updateChat.test.ts`).

| Verifica | Passaggi | Esito | Cosa è emerso | Corretto con |
|---|---|---|---|---|
| Seconda | v4 (Sonnet) | SHIP | MAJOR chiuso: bozza `{ operatorId, text }`, copia di un collega ignorata e cancellata, "Esci dal gestionale" cancella tutto. MINOR: una copia salvata prima che l'operatore si carichi non ha proprietario; le copie di un collega su clienti mai riaperti restano nello storage | Residui registrati in D18 e nel tech-debt |
| Seconda | v5 (Sonnet, browser) | SHIP | Contrasto chiuso: `text-red-700`, 6,47:1. MINOR: "Commenta" scende di 28 px quando compare il messaggio | Non corretto: riservare lo spazio cambierebbe l'aspetto (vincolo del piano) |
| Seconda | v1 (modello forte) | DO NOT SHIP | Chiusi i due MAJOR della prima verifica. Due nuovi: il successo di un invio cancellava la bozza presa nel frattempo da un'altra chat; nessun test proteggeva il ripristino mentre l'operatore si carica (mutazione verde) | Contatore delle bozze adottate; test del ricaricamento, di StrictMode, dell'invio prima dell'operatore |
| Terza | v1 (modello forte) | DO NOT SHIP | Altri intrecci con lo stato diviso fra le chat: copia di un collega più invio prima dell'operatore (testo perso); bozza rinviata da una chat chiusa (testo perso o raddoppiato). v5 aveva visto il raddoppio nel browser sulla stessa build | Cambio di struttura: uno store per cliente (`unsentNote.ts`, `useSyncExternalStore`) condiviso da tutte le chat, con `sessionStorage` come copia; test per ogni intreccio |
| Quarta | v1 (modello forte) | SHIP | 21 mutanti dello store su 24 uccisi. MINOR: un campo vuoto inviato accendeva il messaggio; un'uscita durante un invio lasciava una copia senza proprietario; test mancanti (chiave della nota in attesa, campo dopo l'uscita) | Messaggio solo con testo; "generazione" incrementata dall'uscita, che rende muti gli invii partiti prima; test aggiunti, ognuno rosso per mutazione |

Le correzioni dopo la quarta verifica di v1 (campo vuoto, uscita durante un invio, test della chiave) non sono state riviste da un verificatore: le ho controllate con un test rosso prima e una mutazione dopo. Ricontrollati nel browser, sul codice finale, invio, fallimento offline, bozza dopo il ricaricamento e dopo la scheda chiusa e riaperta, rinvio.

Gate sul codice finale: `next lint` e `tsc --noEmit` puliti, 72 file e 956 test, `pnpm build` in una copia senza `.env*`.

### Coverage

- Passaggi eseguiti: 6/6. v1 e v3 sul modello più forte (ereditato); v2, v4 e v5 su Sonnet; v6 su Haiku.
- Passaggi saltati o falliti: nessuno.
- v5 (UI) sul server di sviluppo `next dev` (porta 3100, DB di sviluppo), già acceso per la passata browser di T4.2, con una sessione `agent-browser` già autenticata come operatore. Clienti di prova `zzpr3-c1` (senza chat) e `zzpr3-c2` (con note). Nessuna scrittura: il fallimento offline e l'invio trattenuto nella pagina. Chromium solo, tema chiaro (l'app non ne ha un altro); niente Safari mobile. Senza axe-core: contrasto dal probe `contrast` della skill.
- v1 ha provato le mutazioni in locale e ripristinato il file (shasum invariato); v3 ha eseguito gli schemi Zod veri in uno script nella scratchpad. Nessun accesso a un DB, nessuno script `db:*` o `NODE_ENV=production`.
- Gate rieseguiti da v6: `next lint` e `tsc --noEmit` puliti, 69 file e 923 test, `pnpm build` in tre copie senza `.env*`.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v1 — AC76 | `CustomerChat.tsx` (`handleChange`, effetto di montaggio, ramo del fallimento) | Chat riaperta durante l'invio, poi fallimento, poi una lettera: la bozza diventa la sola lettera e il testo fallito non è mai comparso | La chat aperta deve adottare la bozza scritta da un'altra istanza (testo fallito nel campo, con il messaggio), non sovrascriverla; test smonta → rimonta → fallimento → digitazione | no |
| MAJOR | v1 — AC76 | `CustomerChat.tsx` (ramo "operatore non caricato") | Mostra il messaggio ma non salva la bozza: ricaricando, il testo si perde | Salvare la bozza anche lì; assert nel test | no |
| MAJOR | v4 — dati nel browser | `CustomerChat.tsx` (`draftKey`), `LogoutFloatingButton.tsx` | Bozza legata al solo cliente e mai cancellata all'uscita: con la stessa finestra, o con la sessione scaduta, il collega successivo vede e può inviare a suo nome la nota di un altro. D18 diceva il contrario | Bozza legata all'operatore (ignorata e tolta per un altro operatore) e cancellata all'uscita; test | no |
| MAJOR | v5 — UI | `CustomerChat.tsx` (`p[role=alert]`, `text-destructive`) | 3,76:1 a 14 px regular, sotto 4,5 (1.4.3), a ogni larghezza | Rosso più scuro (`text-red-700`, 6,47:1) | no |
| MINOR | v1 — test | `_test/CustomerChat.test.tsx` | Nessun test protegge "la bozza segue il campo solo se esiste già" (mutazione `if (true)`: 23/23 verdi) né "ripristino in un effetto" (RTL non idrata) | Test "testo scritto e mai inviato: nessuna bozza al rimontaggio"; il ripristino senza idratazione divergente resta provato nel browser | no |
| MINOR | v2, v3, v6 — test | `src/components/custom/notes/_actions/` | Le action sono mock nei test: Zod, `{ ok, id }` e `revalidatePath` non sono eseguiti da nessun test | Test di `updateChatAction` con `@/trpc/server` e `next/cache` simulati | no |
| MINOR | v2 — rinfresco | `_actions/*.ts` (`revalidatePath` del cliente) | Sul dettaglio di Contatti la pagina si ridisegna solo perché Next 14.2.5 imposta `pathWasRevalidated` senza confrontare il percorso (TODO in `revalidate.js`) | T5.8 lo controlla nel browser; o un `revalidatePath` anche della rotta di Contatti quando esiste (PR5) | sì |
| MINOR | v4 — dati nel browser | `sessionStorage` | "Duplica scheda" in Chrome copia la bozza: due schede la possono inviare due volte | Una riga in D18 | no |
| NIT | v3 | `_actions/*.ts` | `customerId` accetta `""`; `chatId` accetta decimali e negativi (falliscono comunque in Postgres) | `z.string().min(1)`, `z.number().int().positive()` | no |
| NIT | v1 | `_test/CustomerChat.test.tsx` | La chiave `pending-N` non è protetta da un test (React avvisa soltanto); il test dello smontaggio non copre "testo inviato più campo" | Facoltativo | no |
| NIT | v5 — UI | `AccordionContent` (`overflow-hidden`) | L'anello di focus di campo e "Commenta" è tagliato di 4 px; preesistente, non peggiorato | Tech-debt | sì |
| NIT | v2 | `incrementLimit` | La pagina di Contatti dovrà leggere `limit` dai `searchParams` e passarlo alla chat | Una riga nel piano di PR5 (T5.8) | no |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — AC76 | Nota in attesa con chiave `pending-N`, risolta solo dall'id (mutazioni su testo e numero rosse); nessun lampeggio: Next risolve l'action prima del nuovo albero (`server-action-reducer.js:173`); doppio invio ignorato anche con due `requestSubmit` nello stesso tick; ogni fallimento (rifiuto, `{ ok: false }`, `undefined`, operatore assente) rimette il testo, toglie la nota, non chiama `updateLastEdit` né `router.refresh`; ordine del testo scritto durante l'invio; messaggio tolto e rimesso; bozza per cliente, dopo lo smontaggio, con il testo in volo, cancellata da successo e campo vuoto, tollerante allo storage bloccato |
| v2 — AC55/AC56, parità | Solo `customer.updateLastEdit` dal client; "Avvia una chat" con `chatId` nullo crea la chat del cliente; nessun id dalla rotta; nessun import rimasto; i rami pratica eliminati non erano raggiungibili da nessuna schermata a `c787dd1` (D15); niente `router.refresh`, action senza Effect; testi invariati |
| v3 — server action | Schemi Zod provati davvero: override di `chatId`, tipi sbagliati rifiutati, chiavi in più tolte; ogni scrittura e ogni `revalidatePath` dopo una procedura `operatorProcedure`; nessuna capacità in più rispetto a `/api/trpc`, il ramo pratica in meno; un `customerId` ostile aggiunge solo un tag letterale sotto `/dashboard/customers/`; contratto `{ ok, id }` corretto su ogni ramo |
| v4 — dati nel browser | Chiave per cliente, solo `sessionStorage`, niente URL, log o console col testo; scritta solo dopo un fallimento; cancellata da successo e campo vuoto; nessun passaggio fra schede, finestre o profili |
| v5 — UI | Messaggio `role=alert` subito sotto il campo, collegato da `aria-describedby` solo quando c'è; nessuna sovrapposizione da 280 a 1440 px; "Commenta" `aria-disabled`, focalizzabile, con anello visibile durante l'invio; cestino nascosto dal CSS e visibile sotto il mouse, nessuno sulla nota in attesa; AC56 "Avvia una chat"; testi e aspetto invariati |
| v6 — gate | `next lint`, `tsc --noEmit`, 923 test, `pnpm build` in copie pulite; le tre action fuori da `app/` registrate nel manifest e impacchettate; `CollassableItem` spostato identico |

### Per-concern verdicts

| Pass | Concern | Complexity / model | Verdict | Strongest objection |
|------|---------|--------------------|---------|---------------------|
| v1 | Invio, fallimento e bozza (AC76) | high / ereditato | DO NOT SHIP | Testo fallito perso riaprendo la chat durante l'invio |
| v2 | AC55/AC56 e parità del refactor | medium / Sonnet | SHIP | Rinfresco del dettaglio di Contatti appoggiato a un comportamento provvisorio di Next |
| v3 | Confine delle server action | high / ereditato | SHIP | Action senza test propri |
| v4 | Testo delle note in `sessionStorage` | medium / Sonnet | DO NOT SHIP | Bozza visibile al collega successivo nella stessa finestra |
| v5 | UI pass sulla chat | medium / Sonnet | DO NOT SHIP | Contrasto del messaggio 3,76:1 |
| v6 | Gate del progetto | low / Haiku | SHIP | Action testate solo con i mock |

### Human Review Checklist

`reviewImpact: critical`: prima del merge e del deploy.
1. **Server action.** Leggere i tre file in `src/components/custom/notes/_actions/`: ogni scrittura passa da una procedura `operatorProcedure`, e un input non valido risponde `{ ok: false }` senza scrivere.
2. **Bozza nel browser.** Con due utenti nella stessa finestra: il primo fa fallire un invio (offline) ed esce; il secondo entra e apre lo stesso cliente: il campo è vuoto.
3. **Pratiche.** Aprire una pratica con clienti: la pagina si carica con le sezioni dei clienti. Nessuna pratica aveva una chat visibile prima di PR4 (D15).
4. **Operatori.** Mandare le due righe di T4.2 prima del deploy.

### Acceptance criteria check (case B)

| Criterio | Esito | Evidenza |
|---|---|---|
| AC55 | Met | v2, v3: solo il cliente si aggiorna; nella passata browser 0 pratiche toccate |
| AC56 | Met | v2, v5: "Avvia una chat" con `chatId` nullo, poi la chat |
| AC76 | Met, nella scheda cliente | v1 (quarta), v4, v5 (seconda): testo nel campo con il messaggio, nessuna nota fantasma, bozza dopo il ricaricamento e la scheda chiusa, dell'operatore che l'ha scritta. Residui registrati in D18. Nel dettaglio di Contatti arriva con PR5 (T5.8) |

### Notes for docs-maintenance

- Durevoli: rinfresco del dettaglio di Contatti legato al comportamento di Next 14.2.5 (da chiudere in T5.8); anello di focus tagliato da `AccordionContent`; bozze senza proprietario o di un collega (tech-debt, D18).

## [Round: 2026-10-16] PR4 — T4.5 e T4.6 (dai test manuali)

Round aggiunto: i report sopra restano come sono. Rubric: round del 2026-10-16 di [[specs/crm/sezione-contatti/RUBRIC]].

- **Target:** branch `contatti/pr4-chat-cliente` (omardeangelis/mito-micro-services#18), T4.5 e T4.6.
- **Compared:** `3d76ab5` → `b5ac1a7` (T4.5, v1) e `b5ac1a7` → `f440a0d` (T4.6, v2).

### Verdict

**DO NOT SHIP** · impact: medium (stima dell'orchestratore, senza classifier). Un BLOCKER (v2) e tre MAJOR (v1 ×2, v2).

Obiezioni più forti:
- **v2:** la regione `role="status"` resta su "Nota eliminata" e nessuno la svuota: alla seconda eliminazione di fila React non cambia il DOM e il lettore di schermo non annuncia niente (AC78). Confermato leggendo il codice: `announcement` cambia solo in `CustomerChat.tsx:146`, `236`, `257`.
- **v1:** nessun test committato osserva il blocco del cliente (`createCustomerChat.ts:32`): togliendolo, tutti i test restano verdi, perché PGlite ha una sola connessione e serializza le transazioni. La garanzia "due operatori, una chat" di AC77 è provata solo leggendo il codice.

### Seconda verifica (dopo T4.7)

Correzioni in T4.7 (PLAN.md): annunci come nodi nuovi, nota in attesa chiusa se già salvata, test dell'attesa di "Avvia una chat" con la pagina sospesa, regola dei lock della chat nei test (`assertCustomerLockedOnChatWrite`). In più, su richiesta dell'utente, due problemi preesistenti: eliminazione in Effect con il cliente bloccato, e solo dell'autore o di un ADMIN (AC79, D21). Albero di lavoro non committato sopra `f440a0d`. Due verificatori su Haiku, divisi questa volta per lato: v1 server (T4.5 e l'eliminazione), v2 interfaccia (T4.6 e il cestino).

**DO NOT SHIP** su entrambi. Chiusi il BLOCKER e i tre MAJOR della prima verifica: mutanti uccisi per lock in creazione ed eliminazione, controllo dell'autore, eccezione ADMIN, annuncio senza chiave, nota in attesa, attesa del rinfresco. Nuovi MAJOR:

| Severity | Verifier | Location | Problem | Required fix / evidence | Durable? |
|----------|----------|----------|---------|-------------------------|----------|
| MAJOR | v1 — AC77 | `createCustomerChat.ts:32-39` | Spostando la lettura di `chat_id` prima di `lockCustomer` i 32 test restano verdi: il trigger prova che il lock c'è quando si scrive, non che precede la lettura | Test che fallisce con l'ordine invertito (per esempio le istruzioni SQL della transazione, `FOR UPDATE` prima della lettura), o il limite accettato e scritto | no |
| MAJOR | v1 — AC79 | `deleteCustomerMessage.ts:67-71` | Togliendo il controllo `deleted.length === 0` sotto il lock i test restano verdi; senza, una seconda eliminazione ripulirebbe la chat e potrebbe scollegare quella appena avviata da un collega | Come sopra | no |
| MAJOR | v2 — AC78 | `CustomerChat.tsx:161-177`, `296`; `CustomerChatSection.tsx:13` | Eliminata l'ultima nota, il server cancella la chat e la pagina mostra "Avvia una chat": la regione di stato e l'effetto del focus spariscono con la chat. Nessun "Nota eliminata", focus sul body (riprodotto in una copia) | Regione di stato e focus in un componente che resta (la sezione); focus su "Avvia una chat"; test col cambio a `CustomerNewChat` | no |
| MAJOR | v2 — AC78 | `CustomerChat.tsx:241-246` | Ogni cambio dell'ultima riga riporta in fondo anche chi ha scorso in su: la nota di un collega arrivata con un rinfresco, o l'eliminazione della propria ultima nota (riprodotto) | Scorrere al cambio dell'ultima riga solo per un invio proprio o se la lista è già in fondo; due test | no |
| MAJOR | v2 — AC78 | `CustomerChat.tsx:135-141` | Due eliminazioni in volo: `deletedRef` ha un posto solo e la prima non è annunciata (riprodotto). Era MINOR nella prima verifica | Eliminazioni in volo per id; test | no |
| MINOR | v1 | `chat/POST/index.ts:17-59` (preesistente) | `insertMessage` e `addOperatorToChat` scrivono senza lock; `messages.chat_id` senza chiave esterna: un invio che incrocia l'eliminazione dell'ultima nota può lasciare un messaggio senza chat (finestra stretta: `addOperatorToChat` prima fallisce per la chiave esterna) | Invio sotto `lockCustomer`, solo se `chat_id` è ancora quella chat | sì |
| MINOR | v1 | `src/server/effect/db.ts:151-165` | Il commento di `lockCustomer` parla solo di task e alert | Aggiungere la chat | no |
| MINOR | v1 | `deleteCustomerMessage.ts:67` | Il filtro su `chatId` nella cancellazione è difensivo e non protetto da test | Facoltativo | no |
| MINOR | v2 | `CustomerChat.tsx:138-173` | L'indice del focus conta le note eliminabili, il DOM solo i cestini disegnati: una nota con il nome non ancora caricato (Skeleton) sposta il focus sul campo | Salvare i cestini vicini all'avvio e usare quello ancora collegato | no |
| MINOR | v1, v2 (già nella prima verifica) | `CustomerChat.tsx:44` | `focusOnStart` resta impostato se l'operatore esce durante l'avvio | Azzerarlo allo smontaggio | no |
| MINOR | v2 (già nella prima verifica) | `_test/CustomerChat.test.tsx` | Il test del cestino da tastiera controlla le classi, non il Tab | Prova nel browser o test con `user.tab()` | no |
| NIT | v2 | `CustomerChat.tsx:177` | Warning `exhaustive-deps` su `setAnnouncement`, introdotto da T4.7 | Corretto dall'orchestratore dopo la verifica: `next lint` senza warning, 86 test di `notes` verdi | no |
| NIT | v1 | `createCustomerChat.ts:44` | `created!.id` | `Effect.dieMessage` | no |

Passato (evidenze dei verificatori): autorizzazione dall'operatore della sessione, input solo `{ id }`; FORBIDDEN e NOT_FOUND mappati in un punto; mutanti M1–M7 e M10 uccisi (lock, autore, ADMIN, chat esistente, pulizia della chat); due eliminazioni di fila annunciate; cestino solo all'autore o a un ADMIN; attesa di "Avvia una chat" fino alla pagina aggiornata, coerente con `router.refresh` di Next 14.2.5 in una transizione; `ResizeObserver` senza perdite. Gate: `tsc --noEmit` e i test di chat e `notes` verdi.

### Terza verifica (dopo i cinque MAJOR e la regola dell'autore)

Correzioni (PLAN.md, log di T4.7): `beforeNextLockOf` per l'ordine sotto il lock, con due test; `CustomerNotes` tiene la regione di stato e le eliminazioni quando la chat lascia il posto ad "Avvia una chat"; scroll solo se la lista è in fondo, l'invio riporta sempre in fondo. Poi, deciso dall'utente: un ADMIN non elimina le note degli altri (AC79 e D21 riscritti). Albero di lavoro non committato sopra `f440a0d`. Stessi due verificatori su Haiku: v1 server, v2 interfaccia, mutanti su copie nella scratchpad.

**DO NOT SHIP** (v1 DO NOT SHIP, v2 SHIP con due MAJOR di copertura). I cinque MAJOR della seconda verifica sono chiusi: ognuno ha un mutante ucciso (v1: lettura prima del lock, ricontrollo tolto, eccezione ADMIN rimessa; v2: `pinnedRef` ignorato, invio senza ritorno in fondo, eliminazioni non accodate). Le probe di v2 sul codice reale confermano lo stesso nodo di stato, "Nota eliminata" e il focus su "Avvia una chat". Nessun difetto nel codice di produzione: i nuovi MAJOR riguardano solo test che mancano.

| Severity | Verifier | Location | Problem | Required fix / evidence | Durable? |
|----------|----------|----------|---------|-------------------------|----------|
| MAJOR | v1 — AC77, AC79 | `src/server/effect/db.ts:125` | L'isolamento `read committed` di `transaction()` non è controllato da nessun test: il mutante `repeatable read` lascia verdi i 36 test, perché `beforeNextLockOf` scrive nella stessa transazione. Con `repeatable read` il secondo "Avvia una chat" darebbe un errore di serializzazione invece della chat del collega. Nota dell'orchestratore: falso positivo. Il test c'è già, `src/server/effect/_test/db.db.test.ts:132` ("gira in read committed anche se il database ha un altro livello di default"), fuori dai quattro file eseguiti dal verificatore; con il mutante `repeatable read` diventa rosso | Nessuno | no |
| MAJOR | v2 — AC78 | `CustomerChatSection.tsx:26` | Nessun test monta `CustomerChatSection`: `renderChat` mette da sé `CustomerNotes` sopra i due rami. Il mutante con la `key` legata alla presenza della chat lascia verdi gli 80 test, mentre una probe che rende la sezione vera perde il nodo di stato | Test che rende `CustomerChatSection` (con `@/trpc/server` finto) e passa dalla chat ad "Avvia una chat" | no |
| MAJOR | v2 — AC78 | `CustomerChat.tsx:118-119` | La guardia che sposta il focus solo da body o da un nodo scollegato non è coperta: senza, la suite resta verde, e chi è passato al campo durante l'eliminazione si ritrova sul cestino (probe) | Test: clic nel campo durante l'attesa, poi il focus resta nel campo | no |
| MINOR | v1 | `deleteMessage.db.test.ts:124-126` | Dopo `NOT_FOUND` le scritture del collega vanno in rollback con la transazione: il test non può controllare lo stato finale | Dirlo nel test (il commento dell'helper lo dice già) | no |
| MINOR | v1 | `src/test/failpoint.ts:193-197` | Se la query del lock cambia forma, `beforeNextLockOf` non scatta e il test fallisce con un messaggio fuorviante | In `onTestFinished`, fallire se l'helper non è scattato | no |
| MINOR | v2 | `CustomerChat.tsx:116` | "Note eliminate" (plurale) non è asserito: il mutante che lo toglie passa | Asserirlo | no |
| MINOR | v2 | `CustomerChat.tsx:121-122` | Con due eliminazioni in volo il focus segue l'ultima eliminata (`gone.at(-1)`); il mutante `gone[0]` passa | Test del focus con due eliminazioni in volo | no |
| NIT | v1 | `_actions/deleteMessage.ts:25` | `revalidatePath` usa il `customerId` del client | Effetto solo sulla cache | no |
| NIT | v2 | `CustomerChat.tsx:228-236` | Vicini senza cestino (note di colleghi): il focus va al campo | Scelta da documentare | no |
| NIT | v2 | `CustomerChat.tsx:170`, `294-299` | Nota salvata disegnata prima della risposta: per un attimo la riga "Invio…" e la nota insieme (lettura del codice) | Facoltativo | no |

Passato: i cinque MAJOR della seconda verifica; autore confrontato con l'operatore della sessione, ADMIN compreso; ordine delle cancellazioni compatibile con le chiavi esterne; spy di `beforeNextLockOf` che non passano al test successivo; regex del lock senza falsi positivi; `deletions` azzerate al cambio di cliente dalla `key`; contesto memoizzato, nessun annuncio doppio in StrictMode; classi del cestino compilate. Gate: `tsc --noEmit` e `next lint` puliti, 36 test del server e 91 di `notes` verdi.

### Quarta verifica (dopo i test della terza)

Test aggiunti dopo la terza verifica (PLAN.md, log di T4.7): sezione vera, plurale, focus con due eliminazioni, guardia del focus, `beforeNextLockOf` che fallisce se non scatta. Stessi due verificatori su Haiku; v1 ha eseguito anche `db.db.test.ts`.

**DO NOT SHIP** (v1 SHIP, v2 DO NOT SHIP con un BLOCKER). Tutti i mutanti richiesti sono uccisi: v1 lettura prima del lock, ricontrollo, eccezione ADMIN, `repeatable read`, lock in un'altra forma, più lock tolti e chat cancellata con note rimaste; v2 `key` legata alla chat, guardia del focus, `gone[0]`, scroll, `shown([])`, `focusOnStart`.

| Severity | Verifier | Location | Problem | Required fix / evidence | Durable? |
|----------|----------|----------|---------|-------------------------|----------|
| BLOCKER | v2 — AC78 | `CustomerChat.tsx:545`, `369` | L'attesa dell'eliminazione (`deleting`) è nello stato di `CustomerNote`, dentro `AccordionContent`, che Radix smonta alla chiusura. Chiudendo e riaprendo "Note" durante la richiesta il cestino torna attivo (`aria-busy="false"`, sonda), e un secondo clic manda una seconda eliminazione: se la prima è riuscita, la seconda dà NOT_FOUND e "Nota non eliminata, riprova". Nota dell'orchestratore: confermato leggendo il codice; nessun dato perso, il caso richiede di chiudere e riaprire la sezione mentre la richiesta è in volo | Tenere gli id in eliminazione in `CustomerNotes` (stato) e leggerli da lì; test "chiudi e riapri durante l'eliminazione" | no |
| MINOR | v1 | `chat/POST/index.ts:43` (preesistente) | `addOperatorToChat` scrive `chat_to_operator` senza `lockCustomer`: viola la regola di `lockRule.ts`; la chiave esterna evita dati rotti, una delle due operazioni dà 500 | Già nella seconda verifica (invio senza lock) | sì |
| MINOR | v1 | `src/test/failpoint.ts:177` | Il commento dice che il test vede quello che avrebbe scritto un collega concorrente, ma le scritture sono nella stessa transazione: i test di concorrenza passano anche in `repeatable read` (lo prende solo `db.db.test.ts:132`) | Precisare il commento, o uno scrittore su un'altra connessione | no |
| MINOR | v2 | `CustomerChatSection.tsx:26` | Senza `key={customerId}` i test restano verdi; le sonde mostrano "Nota eliminata" e la nota in invio sul cliente nuovo | Test con `rerender` su un altro cliente | no |
| MINOR | v2 | `CustomerChat.tsx:110` | Se `deleteFailed` non togliesse la nota dal registro, nessun test fallirebbe; la nota tolta poi da un collega verrebbe annunciata come eliminata | Caso nel test del fallimento | no |
| MINOR | v2 | `CustomerChat.tsx:555-560` | "Nota non eliminata, riprova" anche se la nota è già sparita (sonda) | Nessun toast se la risposta è NOT_FOUND | no |
| NIT | v1 | `createNewCustomerChat.db.test.ts` | Con il lock in un'altra forma la prima asserzione che fallisce è "expected 1000 to be 900"; il messaggio chiaro arriva dopo | — | no |
| NIT | v2 | `_test/CustomerChat.test.tsx:88`, `163` | I commenti parlano della scheda contatto, ma `CustomerChatSection` è solo nella pagina del cliente | Correggere i commenti | no |

Passato: autorizzazione dalla sessione, input solo `{ id }`; `DbError` → INTERNAL_SERVER_ERROR; nessun altro percorso cancella note o chat; StrictMode senza annunci o invii doppi (sonde); AC79 coperto. Gate: `tsc --noEmit` e `next lint` puliti, 402 test di server e `notes` verdi (v1), 94 di `notes` (v2).

### Quinta verifica (dopo il BLOCKER della quarta)

Correzioni dopo la quarta verifica (PLAN.md, log di T4.7): note in eliminazione nello stato di `CustomerNotes`; NOT_FOUND diventa `{ ok: false, gone: true }`, senza toast; test per chiudi e riapri, nota già eliminata, registro dopo un fallimento, cambio di cliente; commenti corretti. Stessi due verificatori su Haiku, mutanti su una copia nella scratchpad.

**DO NOT SHIP** (v1 SHIP, v2 DO NOT SHIP con un MAJOR, nessun BLOCKER). Il BLOCKER della quarta è chiuso: chiudendo e riaprendo "Note" l'attesa resta e un secondo clic non parte (mutante con lo stato nella nota ucciso). Mutanti: v1 16 uccisi su 17 con i test del repo (il 17°, transazione tolta, cade solo per l'helper del lock); v2 15 su 17.

| Severity | Verifier | Location | Problem | Required fix / evidence | Durable? |
|----------|----------|----------|---------|-------------------------|----------|
| MAJOR | v2 — AC78 | `CustomerChatSection.tsx:26`, `CustomerChat.tsx:101` | Le note in eliminazione stanno nel `CustomerNotes` con `key={customerId}`: aprendo un altro cliente e tornando prima della risposta, la nota ha di nuovo il cestino normale (sonda: `aria-busy="false"`). Un secondo clic manda una seconda eliminazione, che ora risponde `gone`: niente toast, nessun dato perso. Nota dell'orchestratore: lo stesso succede uscendo dalla pagina del cliente e tornando, perché ogni stato del client si perde; serve uno store per cliente fuori dal componente, come per la bozza (D18) | Note in eliminazione per cliente sopra `CustomerNotes` (store del modulo); test "elimina, cambia cliente, torna" | no |
| MAJOR | v1 — AC79 | `deleteCustomerMessage.ts:43`, `deleteMessage.db.test.ts` | Nessun test vede il rollback: togliendo la transazione cadono solo i test dell'helper del lock. Oggi il rollback funziona (sonda con `failNextUpdateOf(customers)`: INTERNAL, nota e chat intatte) | Test con un errore sull'aggiornamento del cliente durante l'eliminazione dell'ultima nota: nota, chat, `chat_to_operator` e `customers.chat_id` invariati | no |
| MINOR | v1 | `deleteMessage.test.ts:36-62` | La forma di NOT_FOUND è costruita a mano, con `@/trpc/server` simulato; manca il caso INTERNAL che rifiuta. La forma è quella vera (sonda col caller reale) | Caso INTERNAL; eventualmente il test col caller reale | no |
| MINOR | v1 | `chat/DELETE/index.ts:14-21` | Tolto lo scollegamento di `practices.chat_id`: se una pratica punta alla chat, l'eliminazione dell'ultima nota dà INTERNAL e tiene la nota. D21 lo giustifica con un controllo su dev e prod | Già in D21 | no |
| MINOR | v2 | `CustomerChat.tsx:123-128` | Con il focus su `body` (clic su uno spazio vuoto dopo il cestino) il focus va comunque al cestino dopo | Ricordare in `deleteStart` se il focus era sul cestino | no |
| MINOR | v2 | `CustomerChat.tsx:147`, `486` | `focusOnStart` resta se l'operatore esce dopo un avvio riuscito prima del rinfresco: la prossima apertura di quel cliente mette il focus nel campo (già nella prima verifica) | Azzerarlo quando `CustomerNewChat` si smonta | no |
| MINOR | v2 | `CustomerChat.tsx:221-231` | Un'eliminazione fallita dopo il passaggio a un altro cliente mostra "Nota non eliminata, riprova" sulla pagina del nuovo cliente | Toast solo se il cliente a schermo è quello dell'eliminazione | no |
| MINOR | v2 | `CustomerChat.tsx:543`, `211-212` | Nessun test protegge il `memo` di `CustomerNote` né l'ordine "precedente più vicina" (mutanti sopravvissuti) | Test con contatore dei render; test con tre note | no |
| NIT | v1 | `failpoint.ts:180`, `deleteCustomerMessage.ts` | Il commento dice "`read committed` is tested", ma il test controlla il livello impostato; "locked first" vale solo per le scritture | Riformulare | no |
| NIT | v1 | `chat/DELETE/index.ts:18-21` | `CustomerMissing` diventa NOT_FOUND e quindi `gone` (in pratica irraggiungibile) | Accettare o mapparlo a parte | no |
| NIT | v2 | `CustomerChat.test.tsx:1449`, `CustomerChat.tsx:124` | Nessun test StrictMode su invio ed eliminazione (comportamento corretto in sonda); `isConnected` senza effetto | Test; togliere la condizione | no |

Nota di v1, già registrata: dopo l'eliminazione dell'ultima nota, un collega con la chat ancora aperta può inviare una nota in una chat cancellata (`insertMessage` senza lock né controllo della chat); la nota resta invisibile. Rende raggiungibile il debito "invio senza lock".

Passato: forma dell'errore del caller reale; FORBIDDEN, INTERNAL e `DbError` rifiutano senza rinfrescare; autore senza eccezione ADMIN, lock prima dell'eliminazione, ricontrollo, pulizia dell'ultima nota, lock di "Avvia una chat" (mutanti uccisi); `gone` giusto rispetto ad AC78; chiudi e riapri; registro ripulito su successo, fallimento e nota sparita; `key` sul cliente; annunci in nodi nuovi, guardie del focus, scroll. Gate: `next lint` e `tsc --noEmit` puliti; 64 test di server e azioni (v1), 100 di `notes` (v2).

### Sesta verifica (dopo i MAJOR e i MINOR della quinta)

Correzioni dopo la quinta verifica (PLAN.md, log di T4.7): store per cliente delle note in eliminazione (`deletingNotes.ts`); focus spostato solo se è rimasto sul cestino; toast solo con la chat del cliente a schermo; `focusOnStart` azzerato all'uscita; test di rollback, INTERNAL, `memo`, precedente più vicina, StrictMode, uscita. Stessi due verificatori su Haiku, mutanti su copie nella scratchpad.

**DO NOT SHIP** (v1 SHIP, v2 DO NOT SHIP con un MAJOR, nessun BLOCKER). Mutanti: v1 20 uccisi su 21 (sopravvive solo `updatedAt` esplicito, ridondante con `$onUpdate`); v2 25 su 26.

| Severity | Verifier | Location | Problem | Required fix / evidence | Durable? |
|----------|----------|----------|---------|-------------------------|----------|
| MAJOR | v2 — AC78 | `deletingNotes.ts:50`, `CustomerChat.tsx:117-118`, test `CustomerChat.test.tsx:1014` | AC78 dice "dopo un'eliminazione il focus passa al cestino della nota accanto", senza condizioni. Il codice lo sposta solo se al clic il browser aveva dato il focus al cestino: un clic che non lo dà (Safari su macOS e iOS, alcune tecnologie assistive) lascia il focus su `body`, e il test "Safari" fissa proprio questo. Nota dell'orchestratore: la quinta verifica chiedeva di non spostare il focus da `body`; le due letture si conciliano prendendo il cestino dal clic, non da `activeElement` | Il cestino dal clic; test "Safari" rovesciato | no |
| MINOR | v2 | `CustomerChat.tsx:117-118` | Conta solo l'ultima eliminazione sparita: se quella con il focus non è l'ultima, il focus resta su `body` (sonda) | Usare l'eliminazione col focus; test | no |
| MINOR | v2 | `CustomerChat.tsx:249` | Il cestino accanto può essere di una nota ancora in eliminazione: il focus ci va, e quando sparisce anche lei finisce su `body` (sonda) | Saltare le note in eliminazione; test | no |
| MINOR | v2 | `CustomerChat.tsx:249` | Nessun test del ripiego sul campo quando non resta un cestino dell'operatore (mutante sopravvissuto; comportamento giusto in sonda) | Test con la nota di un collega e la propria | no |
| MINOR | v2 | `CustomerChat.test.tsx:719-743`, `1032-1047` | I test con due eliminazioni insieme non controllano il focus | Asserzioni sul focus | no |
| MINOR | v2 | `deleteMessage.ts:25-37` | Un errore di rete dopo il commit dà "Nota non eliminata, riprova" e la pagina resta vecchia finché non si rinfresca; un nuovo clic risponde `gone` e la toglie | Rischio accettato accanto a D18 (niente `router.refresh()` dopo un fallimento, finding 31) | no |
| MINOR | v1 | `deleteMessage.ts:43-46` | `instanceof` fra classi di `@trpc/client` e `@trpc/server`: provato nei test, non in una build di produzione | Controllo su una preview: eliminare una nota già eliminata | no |
| NIT | v1 | `deleteCustomerMessage.ts:26-31`, `89`; `lockRule.ts:94-101` | Docstring poco chiara sul perché del lock; `updatedAt` esplicito ridondante; "adding or removing" invece di insert, update, delete | Riformulare | no |
| NIT | v2 | `CustomerChat.test.tsx:1151`, `deletingNotes.ts`, `CustomerChat.tsx:224-252` | Test del cestino da tastiera solo sulle classi; store per cliente e non per operatore (svuotato all'uscita); "Nota eliminata" annunciata tornando sul cliente; fallimento silenzioso su un altro cliente | Test con `user.tab()`; il resto da accettare | no |

Passato: v1 autore senza eccezione ADMIN, lock prima di ogni scrittura, ricontrollo, pulizia dell'ultima nota, `read committed`, rollback (mutante senza transazione ucciso dal test nuovo), solo NOT_FOUND diventa `gone`. v2 store senza perdite (iscrizioni tolte, istantanee stabili), nessuna attesa bloccata, uscita che svuota, guardie del focus (clic altrove, Tab, secondo clic), toast e ritorno al cliente, `focusOnStart` col cambio vero, `memo`, StrictMode, annunci, scroll. Gate: `next lint` e `tsc --noEmit` puliti; 64 test (v1), 115 (v2).

### Coverage

- Passaggi eseguiti: 2/2, su Haiku per scelta dell'utente. Niente `review-classifier` e niente UI pass (scelta dell'utente): il comportamento nel browser è stato provato a mano prima del commit (PLAN.md, validation di T4.5 e T4.6).
- v1 ha lavorato su una copia di `b5ac1a7` nella scratchpad (`git archive`), con sonde e mutanti: chiamate parallele, blocco tolto, trigger che fa fallire `chat_to_operator` (rollback corretto), fine anticipata dell'attesa.
- v2 ha lavorato sull'albero a `f440a0d`, senza sonde nel repo; ha compilato le classi Tailwind in una build di prova.
- Gate rieseguiti: `next lint` e `tsc --noEmit` puliti; i test di `src/server/api/routers/chat` e `src/components/custom/notes` verdi (v1: 64; v2: 79 in `notes`). Nessun accesso a un DB vero, nessuno script `NODE_ENV=production`.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v2 — AC78, annunci | `CustomerChat.tsx:146` | Due eliminazioni di fila: la stessa stringa, nessun cambio nel DOM, nessun annuncio della seconda | Svuotare l'annuncio prima di impostarlo (o un nodo con chiave); test con due eliminazioni di fila | no |
| MAJOR | v1 — AC77, due operatori | `createCustomerChat.ts:32`, `createNewCustomerChat.db.test.ts` | Il mutante senza `lockCustomer` lascia verdi tutti i test: PGlite serializza le transazioni | Prova con due sessioni su un Postgres vero (o una prova documentata sul DB di sviluppo) | no |
| MAJOR | v1 — AC77, attesa fino alla chat | `CustomerChat.tsx:278`, `_test/CustomerChat.test.tsx` | Il mutante che chiude l'attesa alla risposta del server (senza aspettare il rinfresco) lascia verdi i 52 test: `router.refresh` è un `vi.fn()` | Test che controlla `aria-busy` dopo la risposta fino alla fine della transizione; `useSavingUntilRefreshed` non ha test propri | no |
| MAJOR | v2 — nota fantasma | `CustomerChat.tsx:186-191`, `259-263` | Se un rinfresco porta la nota salvata prima della risposta dell'action, l'id arriva dopo e l'effetto su `messages` non riparte; eliminando poi la nota, la riga in attesa ricompare senza cestino fino al ricaricamento | Quando arriva l'id, togliere l'elemento se `messagesRef.current` lo contiene già; test con il rinfresco prima della risposta. Nota dell'orchestratore: l'action rinfresca la pagina da sé, quindi di solito un nuovo `messages` segue l'id; serve un rinfresco arrivato da un'altra parte durante l'invio (un'eliminazione) e, dopo, nessun altro rinfresco. Plausibile, non riprodotto | no |
| MINOR | v2 — eliminazioni sovrapposte | `CustomerChat.tsx:121-132` | `deletedRef` ha un posto solo: la seconda eliminazione sovrascrive la prima, che non viene annunciata né sposta il focus | Una mappa per id; test con due eliminazioni in volo | no |
| MINOR | v2 — focus e scroll | `CustomerChat.tsx:157` | `focus()` senza `preventScroll` può spostare la lista scorsa in su | `focus({ preventScroll: true })` | no |
| MINOR | v2 — SSR | `CustomerChat.tsx:220` | `useLayoutEffect` nel render del server: avviso in sviluppo | Effetto di layout isomorfo | no |
| MINOR | v2 — test | `_test/CustomerChat.test.tsx:426-437`, `534-540` | "Carica altri" non cambia `messages`, quindi non può fallire; il test del cestino controlla le classi, non la tastiera | Rirender con note più vecchie; `user.tab()` fino al cestino ed Enter | no |
| MINOR | v2 — test | `_test/CustomerChat.test.tsx` | Mancano: focus al campo dopo l'ultima nota eliminata, `disconnect()` all'uscita, eliminazioni ripetute | Test | no |
| MINOR | v2 — accessibilità | `CustomerChat.tsx:507` | Ogni cestino si chiama "Elimina nota", senza dire quale | Data o autore nel nome, o `aria-describedby` sul testo | no |
| MINOR | v1 — focus | `CustomerChat.tsx:56`, `277` | `focusOnStart` resta impostato se l'operatore esce durante un avvio riuscito: la prossima apertura di quel cliente prende il focus | Azzerarlo quando `CustomerNewChat` si smonta senza chat | no |
| MINOR | v1 — test | `_test/CustomerChat.test.tsx` | `focusOnStart` non azzerato in `beforeEach`: il test "una chat che c'era già non prende il focus" passa per l'ordine dei test | Azzeramento per i test o flag per montaggio | no |
| MINOR | v1 — atomicità | `createNewCustomerChat.db.test.ts` | Rollback corretto (sonda con trigger), ma nessun test nel repo | Committare il test col trigger | no |
| MINOR | v1 — eliminazione dell'ultima nota | `chat/DELETE/index.ts:25-70` (preesistente) | Cancella la chat e azzera `chat_id` senza `lockCustomer`: chi avvia nello stesso momento riceve una chat poi cancellata | `lockCustomer` anche lì, o tech-debt | sì |
| NIT | v1 | `createCustomerChat.ts:44` | `created!.id` contro la regola di AGENTS.md | Errore tipizzato | no |
| NIT | v1 | deploy | Una scheda col bundle vecchio chiama l'action rimossa: solo `console.error` | Transitorio | no |
| NIT | v2 | `CustomerChat.tsx:120` | `messagesRef` scritto nel render | Scriverlo in un effetto di layout | no |
| NIT | v2 (preesistente) | `chat/DELETE/index.ts:18-27` | La procedura ignora `operatorId`: ogni operatore può eliminare ogni nota per id | Tech-debt | sì |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — T4.5 / AC77 | Seconda chiamata → stessa chat, una riga; cliente inesistente → `NOT_FOUND`, nessuna riga; `runTrpc` mappa `CustomerMissing` e `DbError` in un punto; `FOR UPDATE` e la `SELECT` dopo, in READ COMMITTED, danno al secondo la chat del primo; due chiamate parallele in PGlite → una chat; rollback con il trigger; mutanti uccisi: guardia del doppio clic, focus azzerato al fallimento, rinfresco al successo, focus consumato; nessun chiamante rimasto di `chat.createNewChat` o `createChatAction`; spinner esistente con `motion-reduce:animate-none` |
| v2 — T4.6 / AC78 | "Invio…" al posto della data e spinner su "Commenta"; doppio invio ignorato da `sendingRef`; lista in fondo all'apertura e dopo l'invio, scroll istantaneo, mai `scrollIntoView`; ordine crescente dal server; eliminazione con spinner, un clic solo, nessuna rimozione anticipata; rifiuto, `{ ok: false }` e `undefined` → toast di 8000 ms e cestino di nuovo attivo; `deleteMessageAction` con la stessa firma; classi del cestino compilate; focus al cestino dopo, poi al precedente, poi al campo; `ResizeObserver` scollegato e ricreato |

### Per-concern verdicts

| Pass | Concern | Complexity / model | Verdict | Strongest objection |
|------|---------|--------------------|---------|---------------------|
| v1 (sesta) | Server: creazione ed eliminazione (AC77, AC79) | low / Haiku | SHIP | `instanceof` non provato in una build di produzione |
| v2 (sesta) | Interfaccia: attese, cestino, annunci (AC77–AC79) | low / Haiku | DO NOT SHIP | Focus non spostato se il clic non ha dato il focus al cestino |
| v1 (quinta) | Server: creazione ed eliminazione (AC77, AC79) | low / Haiku | SHIP | Nessun test vede il rollback dell'eliminazione |
| v2 (quinta) | Interfaccia: attese, cestino, annunci (AC77–AC79) | low / Haiku | DO NOT SHIP | Attesa persa cambiando cliente e tornando durante l'eliminazione |
| v1 (quarta) | Server: creazione ed eliminazione (AC77, AC79) | low / Haiku | SHIP | `addOperatorToChat` senza lock (preesistente) |
| v2 (quarta) | Interfaccia: attese, cestino, annunci (AC77–AC79) | low / Haiku | DO NOT SHIP | Attesa dell'eliminazione persa chiudendo e riaprendo "Note" |
| v1 (terza) | Server: creazione ed eliminazione (AC77, AC79) | low / Haiku | DO NOT SHIP | Isolamento `read committed` non controllato dai test |
| v2 (terza) | Interfaccia: attese, cestino, annunci (AC77–AC79) | low / Haiku | SHIP | `CustomerChatSection` e guardia del focus senza test |
| v1 (seconda) | Server: creazione ed eliminazione (AC77, AC79) | low / Haiku | DO NOT SHIP | Ordine lock-lettura e ricontrollo sotto lock non protetti dai test |
| v2 (seconda) | Interfaccia: attese, cestino, annunci (AC77–AC79) | low / Haiku | DO NOT SHIP | Eliminata l'ultima nota, nessun annuncio e focus perso |
| v1 | "Avvia una chat" (AC77) | low / Haiku | DO NOT SHIP | Il blocco del cliente non è osservato da nessun test |
| v2 | Attesa di invio ed eliminazione, scroll (AC78) | low / Haiku | DO NOT SHIP | Seconda eliminazione di fila senza annuncio |

### Suggested manual validation

`reviewImpact: medium`, facoltativa:
1. **Due operatori.** Due browser con due operatori sullo stesso cliente senza chat, "Avvia una chat" quasi insieme: una sola chat (query sulle orfane invariata).
2. **Lettore di schermo.** VoiceOver, due note eliminate di fila: si sente "Nota eliminata" due volte (oggi la seconda no).

### Acceptance criteria check (case B)

| Criterio | Esito | Evidenza |
|---|---|---|
| AC77 | Met (quarta verifica) | Quarta verifica: ordine sotto il lock e isolamento protetti dai test. Terza verifica: ordine lock-lettura protetto da test; l'isolamento `read committed` no. v1: logica corretta e provata in sonde; il blocco e l'attesa fino al rinfresco non sono osservati dai test committati |
| AC78 | Not met (sesta verifica) | Sesta verifica: attesa sopravvive al cambio di cliente; il focus passa al cestino accanto solo se il clic gli aveva dato il focus. Quinta verifica: chiudi e riapri chiuso; cambiando cliente e tornando durante l'eliminazione l'attesa sparisce (un secondo clic risponde `gone`, senza errore). Quarta verifica: chiudendo e riaprendo "Note" durante un'eliminazione l'attesa sparisce e il cestino riparte. Terza verifica: i tre MAJOR chiusi, con probe sul codice reale; mancano i test della sezione vera e della guardia del focus. Prima verifica: seconda eliminazione di fila senza annuncio (chiuso in T4.7). Seconda verifica: ultima nota eliminata senza annuncio né focus; lista riportata in fondo dopo uno scroll in su; due eliminazioni in volo, un annuncio |
| AC79 | Met (terza verifica) | Terza verifica: solo l'autore, ADMIN compreso, mutante ucciso; ricontrollo sotto lock protetto. Seconda verifica, v1 e v2: autore o ADMIN, cestino solo a loro, 403 nel browser; il ricontrollo sotto lock non è protetto dai test |

### Notes for docs-maintenance

- Durevoli: invio di una nota senza lock e `messages.chat_id` senza chiave esterna (seconda verifica, v1). L'eliminazione senza lock e senza controllo dell'operatore è chiusa in T4.7. Gli altri finding sono da correggere prima del merge.

## [Round: 2026-10-17] PR5a — "Logica sul server e stato dell'URL"

Round aggiunto: i report sopra restano come sono. Rubric: round del 2026-10-17 di [[specs/crm/sezione-contatti/RUBRIC]].

- **Target:** branch `contatti/pr5a-lettura-server` (PR verso `dev`), modifiche non ancora committate. T5.1, T5.2, T5.3, T5.14, T5.15, T5.16.
- **Compared:** `6f28635` → albero di lavoro.

### Verdict

**SHIP** · impact: critical. La condizione umana (riconferma di Omar sull'indice della priorità) è chiusa il 2026-10-18. Prima verifica (v1–v10): 8 SHIP e 2 DO NOT SHIP (v8, v10). Dopo le correzioni, seconda verifica: v1, v8, v10 e un passaggio di regressione sulle correzioni (v11) sono SHIP.

La condizione, **chiusa il 2026-10-18** (Omar: "Togli entrambi"): **la rimozione di `task_priority_active_idx` andava riconfermata da Omar sulle misure con la query vera** (checklist, punto 1). La conferma del 2026-10-17 era sulla misura preliminare ("nessuno dei due cambia i tempi"); con la query vera quell'indice vale circa 16 ms sulla prima pagina e 116 ms alla pagina 2000, e il piano chiede di rivedere la decisione se i tempi cambiano. La migrazione e il piano la presentavano come proposta da riconfermare; ora la presentano come riconfermata, e la migrazione e il suo test non cambiano, quindi v1 non va rilanciato.

### Coverage

- **Prima verifica:** 10/10 passaggi del rubric (v1–v4 e v7 sul modello più forte, v5, v6 e v8 sul bilanciato, v9 e v10 sul veloce). Nessun passaggio saltato.
- **Seconda verifica, dopo le correzioni:** v1 (opus), v8 e v10 (sonnet), più **v11, un passaggio di regressione aggiunto dall'orchestratore** (non è nel rubric del classifier): giudica le correzioni di server e URL con mutanti su una copia, 68 provati (62 uccisi, 4 equivalenti, 2 che sopravvivono per scelta).
- **Non rilanciati dopo le correzioni:** v2, v3, v4, v5, v6, v7 e v9 (SHIP alla prima verifica, sul codice di allora). Le correzioni che toccano le loro aree le ha giudicate v11 (tetti dell'input, `canReassign`, `getCustomerAlerts`, preferenza, modulo dell'URL e `detailHref`). I mutanti della prima verifica di v3 e v4 (M38, M45, M46, `sql.raw`, limite dell'id, `trim` dopo il massimo) li ha riprovati l'orchestratore sulle correzioni: cadono tutti (1 test ciascuno).
- **UI pass:** non chartered (nessun markup, stile, ARIA o movimento).
- **Produzione:** nessun verificatore si è collegato al database di produzione né ha ripetuto la misura di T5.16. v1 ha provato la migrazione con la CLI di Drizzle su un container locale Postgres 16.
- **Scostamento dalla delega `supervised`:** i due worker di correzione hanno scritto anche i test dei loro punti, senza un RED dell'orchestratore. I test dell'ultimo giro (giorno di Roma alle 00:30, elenco degli indici di `task`) sono dell'orchestratore, provati con mutanti su una copia.

### Findings

Esiti rispetto allo stato finale. "Corretto" vuol dire corretto e rigiudicato da un verificatore o provato con un mutante dall'orchestratore.

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v10 — Effect | `task/GET/index.ts:86-88` | `getCustomerAlerts` toccato dal refactor ma lasciato su `ctx.db` | **Corretto**: `runTrpc(query(...))`. v10 (seconda): stesso SQL, stesse righe e stesso ordine, stesso corpo di errore HTTP (una riga di log in più) | no |
| MAJOR | v1 — migrazione | `20261019142325_*.sql` | `DROP INDEX` con lock `ACCESS EXCLUSIVE` nella transazione unica del migratore, senza `lock_timeout`; il runbook parlava di un altro lock | **Corretto**: `SET LOCAL lock_timeout = '5s'`, runbook riscritto (passi 0–5). v1 ha provato con la CLI su Postgres 16: dopo 5 s `55P03`, niente applicato, il retry riesce | no |
| MAJOR | v1 — migrazione (seconda) | `PLAN.md` T5.16, intestazione dell'SQL | La decisione era presentata come "decisa con Omar" ma si reggeva sul "nessun indice cambia i tempi", smentito dalla misura con la query vera | **Chiuso da Omar il 2026-10-18**: era "proposta, da riconfermare" in piano, spec, tech-debt e note; ora è riconfermata (checklist 1) | sì |
| MAJOR | v8 — richiamo | `setCallback.db.test.ts`, `time.test.ts` | Ogni test usava la mezzanotte di Roma o `now` alle 10:00Z: il confronto di istanti non cadeva | **Corretto**: istanti qualsiasi del giorno e i due giorni di 23 e 25 ore | no |
| MAJOR | v8 — richiamo (seconda) | stessi file | Con `now` alle 00:30 di Roma (il giorno UTC è ancora quello prima) il giorno UTC o il giorno locale del processo al posto di quello di Roma sopravvivevano a tutti i test | **Corretto** (orchestratore): sei `now` alle 00:30 in estate, inverno, nei due giorni del cambio d'ora e nei due successivi. Su una copia: giorno UTC di `now` 18 test rossi, giorno locale 18, UTC inline in `setCallback` 12. v8: SHIP | sì (vedi Notes) |
| MAJOR | v8 — richiamo | `SPEC.md` AC44 | AC44 ammetteva ancora "una data non passata", cioè oggi | **Corretto**: AC44 "da domani in poi", righe nel Decision Log, AC10 per D8 | no |
| MAJOR | v4 — AC23 | `getContacts.ts:187-190` | Cliente senza contatti non testato: `innerJoin` o `count()` al posto di `leftJoin` e `count(task.id)` restavano verdi | **Corretto**: test aggiunti, entrambi i mutanti cadono | no |
| MINOR | v4 — AC14 | `getContacts.ts:76-79` | Un secondo alert aperto sulla stessa task duplicava la riga (M38) | **Corretto**: test, il mutante cade | no |
| MINOR | v3 — input | `listInput.ts` | Liste senza tetto: 1.000 braccia alternate di `priorities` = 2,4 s in PGlite su 70.000 contatti | **Corretto**: 4 fasce, 8 stati, 100 operatori (`BAD_REQUEST`). v11: nessun input legittimo del modulo dell'URL è rifiutato (20.000 casi) | no |
| MINOR | v3 — input | `getContacts.ts:100`, `getContactById.ts:20`, `listInput.ts:81` | Nulla fissava i parametri legati, il limite dell'id e l'ordine `trim`/`max` | **Corretto**: apostrofo, `2147483648`, riempimento a 100; i tre mutanti cadono | no |
| MINOR | v5 — AC27 | `getContactById.ts:128` | `canReassign` valeva per un admin anche su un contatto superato, che `task.reassign` rifiuta | **Corretto**: `isActive && canReassign(actor)`. v11: 54 combinazioni uguali alla scrittura | no |
| MINOR | v5 — AC51 | `getContactById.db.test.ts` | Il cablaggio A1/D2 e l'admin su un contatto attivo non erano provati | **Corretto**: test aggiunti | no |
| MINOR | v6, v7 — URL | `searchParams.ts` | Regex `digits` e rami dell'indirizzo non fissati: 3 mutanti di `digits` e M03, M13, M15, M16, M20 sopravvivevano | **Corretto**: test sullo spazio dei parametri e su un corpus ostile. v11: i mutanti non equivalenti cadono | no |
| MINOR | v7 — P15 | `searchParams.ts:343` | `detailHref("..")` e `""` uscivano dal percorso | **Corretto**: `id: number`, intero positivo sicuro, altrimenti la lista con lo stesso stato. v11: 40.000 chiamate ostili, mai fuori da `/dashboard/contatti` | no |
| MINOR | v9 — AC5 | `updateUserPreference.ts` | Nessun limite sull'array | **Corretto**: 20 nomi da 64 caratteri; test sulle chiavi sconosciute | no |
| MINOR | v1 — runbook | `PLAN.md` T5.16 | Righe attese del passo "dopo" sbagliate, stallo sottostimato, niente controlli di stato del migratore, rollback senza limite di attesa, test cieco a un indice in più | **Corretto**: runbook riscritto, rollback in una transazione con `SET LOCAL`, nuovo test che elenca gli indici di `task` (cade con un indice in più). v1: SHIP | no |
| MINOR | v1 — merge | `PLAN.md` T5.17 | Niente impediva il merge in `dev` prima della riconferma di Omar: un `pnpm db:migrate` di un compagno applicherebbe la migrazione | **Corretto**: condizione scritta in T5.17 e nella checklist | no |
| MINOR | v10 — snapshot | `meta/20261019142325_snapshot.json:130` | Il letterale del default di `customers.id` cambia a ogni `db:generate` (`.default(nanoid())`) | **Non corretto, per precedente** (T2.3): l'SQL non lo contiene, lo snapshot sì. Voce di tech-debt aggiornata | sì |
| MINOR | v4 — AC13 | `getContacts.ts:160-163` | Un cognome stringa vuota ordina per primo, non in fondo | **Non corretto**: tech-debt, da guardare su dati di prod in PR5b | sì |
| MINOR | v3 — costi | `trpc` | Richieste in batch senza tetto, nessuno `statement_timeout` (preesistente, più grande con la nuova lista) | **Non corretto**: tech-debt | sì |
| MINOR | v9, v10 — preferenze | `updateUserPreference.ts`, `getUserPreference.ts:24` | Lettura-modifica-scrittura senza lock; senza riga in `operators` il JSON letto è `{}` e la scrittura lo sostituisce (preesistente nelle quattro procedure) | **Non corretto**: tech-debt | sì |
| NIT | v2, v10, v11 | vari | Nessun test di rifiuto per sessione assente o senza operatore; ramo `cot` senza test (500 sul corpo rifiutato); il wrapper di `getCustomerAlerts` non è fissato da un test; messaggio Postgres grezzo al client (preesistente) | Non corretti. `cot` lo prova il browser in T5.10 | sì (`cot`, messaggio grezzo) |
| NIT | v8 — fuso dei test | `vitest.config.ts:12` | `TZ: "UTC"` nell'ambiente, ma `Intl` nei worker resta nel fuso della macchina: un mutante "giorno locale" è equivalente su un computer in `Europe/Rome` | Non corretto: tech-debt | sì |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — migrazione | SQL e schema equivalenti; catena `prevId`/`when` coerente; rigenerata dalla base dà le due `DROP` più il letterale; solo i due indici cadono; rollback identico alle `indexdef` di PR2; applicata da vuoto e dallo stato prima con la CLI su Postgres 16 (exit 0, tre indici su `task`); `lock_timeout` prova su Postgres vero |
| v2 — lettura e dati | Tre letture dietro `operatorProcedure`; nessuna sessione, nessun operatore e operatore di sistema respinti; l'attore viene solo dalla sessione; le chiavi restituite elencate, nessuna email, ruolo o preferenza; la preferenza scrive solo la riga della sessione |
| v3 — input verso SQL | 36 combinazioni di ordine/verso/campo data con marcatori: il testo SQL non li contiene, stanno tutti nei parametri; `%`, `_` e `\` letterali; l'id del dettaglio non raggiunge il driver se non è valido |
| v4 — semantica della lista | Filtri in AND, fasce come il badge, giorno di Roma anche col cambio d'ora, sei colonne con `NULLS LAST` e spareggio per id, totale esatto |
| v5 — dettaglio | `CONTACT_NOT_FOUND` per ogni id non valido; `activeTaskId` uguale al payload del rifiuto in 18 combinazioni; `editability` uguale alla scrittura in 36 |
| v6 — URL | Andata e ritorno, un indirizzo per stato, default omessi, `toContactsInput` sempre accettato da `getContactsInput` (fuzz) |
| v7 — P15 | `returnHref` non esce dalla lista per costruzione; 70+ stringhe ostili e 20.000 casuali, sempre un indirizzo dell'app |
| v8 — richiamo | Regola uguale all'oracolo su 17 casi e su 404.976 coppie in tre fusi, e test verdi in sette fusi; messaggi uguali su server e client; una sola asserzione cambiata |
| v9 — preferenza | Scrive solo la sua chiave e lascia le altre; vuoto e assente distinti; parità con le gemelle |
| v10 — gate | `next lint`, `tsc --noEmit`, `pnpm run test --run` (79 file, 1339 test) e `pnpm build` in una copia pulita, exit 0; chiusura del client di `listInput.ts` e `searchParams.ts`: solo `zod` |
| v11 — regressione | 610 test dei file toccati verdi; 68 mutanti: 62 uccisi; limiti, `canReassign` (54 combinazioni), `detailHref` (40.000 chiamate), tetto degli operatori e giorni di Roma |
| Orchestratore — gate finali | Dopo l'ultimo giro: `next lint`, `tsc --noEmit`, `pnpm run test --run` (79 file, 1364 test) e `pnpm build` in una copia pulita, exit 0 |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 (seconda) | Migrazione dei due `DROP INDEX` e catena schema → SQL → snapshot | SHIP | Tutto corretto in file e prove; la riconferma di Omar (umana) è arrivata il 2026-10-18; un MINOR sul merge in `dev` è in T5.17 |
| v1 | idem | DO NOT SHIP | Mancava `lock_timeout`; runbook sul lock sbagliato |
| v2 | Autorizzazione in lettura ed esposizione dei dati (AC51) | SHIP | Solo NIT |
| v3 | Input non fidato verso SQL e costi (AC10) | SHIP | Liste senza tetto e parametri non fissati da test: corretti |
| v4 | Semantica della lista | SHIP | AC23 senza test: corretto |
| v5 | Semantica del dettaglio | SHIP | `canReassign` sul superato: corretto |
| v6 | Stato dell'URL: contratto funzionale | SHIP | Regex `digits` non fissata: corretto |
| v7 | Indirizzo di ritorno sicuro (P15) | SHIP | `detailHref` e mutanti sopravvissuti: corretti |
| v8 (seconda) | Richiamo da domani | SHIP | Giorno UTC e giorno locale ora cadono |
| v8 | idem | DO NOT SHIP | Test che non distinguevano il giorno di Roma; AC44 |
| v9 | Preferenza delle colonne | SHIP | Limite dell'input: corretto |
| v10 (seconda) | Gate e convenzioni | SHIP | BLOCKER su `getCustomerAlerts` corretto e provato uguale al vecchio |
| v10 | idem | DO NOT SHIP | BLOCKER: `getCustomerAlerts` fuori da Effect |
| v11 | Regressione delle correzioni | SHIP | Sei NIT; 62 mutanti su 68 uccisi |

### Human Review Checklist

`reviewImpact: critical`. Passi, nell'ordine:
1. ~~**Omar riconferma la rimozione di `task_priority_active_idx` sulle misure con la query vera**~~ **Fatto il 2026-10-18** (PLAN, T5.16, decisione). Con l'indice: prima pagina 62 ms contro 78, pagina 2000 216 contro 332 ms; senza, il peggio resta sotto i 500 ms di A3, e l'indice rende non-HOT gli `UPDATE` di `priority` (il cron notturno ne riscrive circa 70.000). L'indice per operatore non serve: la conferma regge. **Da sapere al merge in `dev`:** a merge fatto, un `pnpm db:migrate` sul DB di sviluppo condiviso applicherebbe la migrazione e Drizzle non la rilegge.
2. CI verde sulla PR (`next lint`, `tsc --noEmit`, `pnpm run test --run`, `pnpm build`).
3. Applicare la migrazione in prod a mano, in un momento tranquillo, con il rollback pronto: passi 0–5 di T5.16 (stato del migratore e `max(created_at)` prima e dopo, nessuna transazione lunga su `task`, gestione del `lock timeout`, tre righe su `task` dopo, `EXPLAIN` in sola lettura di prima pagina, `count` e pagina 2000). `pnpm db:migrate` sul DB di sviluppo non è stato lanciato da nessun agente.
4. Accettare l'esposizione di CF, P.IVA e telefono di tutti i clienti a ogni operatore nella lista e nel dettaglio (AC51, deciso dalla spec).
5. Prendere atto del rifiuto del richiamo per oggi (D22): da PR5a l'API lo rifiuta, la scheda cliente lo disabilitava già; la spec dice "da domani".
6. Guardare la lista ordinata per Cliente su dati veri quando PR5b la mostra (cognome vuoto, collazione): tech-debt.

### Acceptance criteria check (case B)

| Criterio | Esito | Evidenza |
|---|---|---|
| AC2, AC3 | Met lato server | v4: solo attivi di default, per priorità decrescente; `includeInactive` aggiunge i superati |
| AC5 (server) | Met lato server | v9: chiave separata da Clienti, le altre chiavi restano; limite dell'input aggiunto; la rotta `cot` la prova il browser in T5.10 |
| AC10–AC15 | Met | v4, v3: filtri in AND, D8 (ora anche in AC10), giorno di Roma, fasce come il badge, sei ordinamenti, totale esatto |
| AC16–AC18, AC25 | Met nel modulo | v6, v7, v11: parametri non validi scartati uno a uno, ritorno dal dettaglio sempre interno, `detailHref` guardato |
| AC21–AC23 | Met lato server e URL | v4: `customerFilter` con `totalContacts`, ora anche per un cliente senza contatti |
| AC26–AC28 | Met lato server | v5: `CONTACT_NOT_FOUND`, `activeTaskId`, Storico |
| AC44 (D22) | Met | v8: `setCallback` rifiuta oggi; SPEC aggiornata |
| AC51 (server) | Met lato server | v2, v5: `editability` e `canReassign` come la scrittura; PII esposti per scelta della spec |
| Constraints: migrazioni additive | Deviazione dichiarata | `DROP INDEX` dichiarato in §15 e nella spec; riconfermato da Omar il 2026-10-18 |
| A3 (prima pagina ≤ 500 ms) | Met sui dati di prod | Log di T5.16: 163 ms a caldo, 233 a freddo; dopo la `DROP` va ripetuta (checklist 3) |

### Notes for docs-maintenance

- Durevoli, già nel tech-debt (`brain/tech-debt/crm/sezione-contatti.md`): la ricerca cliente lenta a freddo; `next lint` che non parte nei worktree; le richieste senza tetto della lista; le procedure delle preferenze (lock, riga in `operators`, limite, rotta `cot`); il cognome vuoto e la collazione dell'ordine per Cliente; il fuso dei test; il letterale di `customers.id` nello snapshot. Chiuse dal lavoro: gli indici di PR2 (in attesa della riconferma e dell'applicazione) e il richiamo di oggi.
- Il test sul giorno di Roma con `now` alle 00:30 è dell'orchestratore, non di un worker.
- Backlink dalle pagine di dominio: n/a finché PR5 non è conclusa.

## [Round: 2026-10-18] PR5b — "Interfaccia"

Round aggiunto: i report sopra restano come sono. Rubric: round del 2026-10-18 di [[specs/crm/sezione-contatti/RUBRIC]].

- **Target:** branch `contatti/pr5b-interfaccia` (PR verso `dev`), modifiche non ancora committate. T5.4a–T5.12.
- **Compared:** `0daa1a3` (tip di `contatti/pr5a-lettura-server`) → albero di lavoro.

### Verdict

**DO NOT SHIP** · impact: critical · primo giro (v1–v13). 4 passaggi SHIP (v1, v2, v5, v11) e 9 DO NOT SHIP (v3, v4, v6, v7, v8, v9, v10, v12, v13). Tre BLOCKER e undici MAJOR, tutti aperti.

Le tre obiezioni bloccanti, ciascuna con una prova:

1. **v10, date in Server Component nel fuso del server.** `formatDateAsDMY` usa `getDate()`/`getMonth()` nel fuso del processo (`src/lib/utils/index.ts:76-78`) e il dettaglio è un Server Component. Su Vercel (UTC, lo dice il repo stesso) un richiamo impostato dal selettore per il 21/10 (22:00Z del 20) si legge "20/10/2026" nel dettaglio e "21/10" in lista e nel modulo. Né la macchina di sviluppo né i test lo vedono: sono a Roma e i test calcolano il valore atteso con la stessa funzione. Riga di codice riletta dall'orchestratore.
2. **v8, dopo una riapertura la lista torna vecchia.** `ContactStateControl.tsx:92-104` sostituisce l'indirizzo e salta di proposito `router.refresh()`; "Indietro" (sempre) e Esc/X (entro 30 s) mostrano la lista dalla cache di Next senza richieste: il contatto sostituito appare come riga attiva, modificabile e senza "Superato", e il nuovo manca (AC2, AC3, AC35). Provato in browser con `changeState` simulato.
3. **v9, il focus finisce su `body` da tastiera.** "Precedente" verso la pagina 1, "Successiva" verso l'ultima, "Rimuovi il filtro cliente", "Azzera filtri" e "Vai alla prima pagina" si tolgono da soli e lasciano `document.activeElement === document.body`. Regola comune di PR5b e P17. Provato in browser; il codice di `ContactPagination.tsx` riletto dall'orchestratore.

Il resto della verifica dice che l'impianto regge: Sheet mai rimontata, `CONTACT_NOT_FOUND` dentro la Sheet, una sola `push` alla chiusura, nessuna regola di autorizzazione indovinata dal client, nessun indirizzo costruito da `da`, `id`, `cliente` o `limit` esce da `/dashboard/contatti`, la regola del giorno di Roma coincide col server in 10 istanti e 5 fusi. I difetti sono nei punti di raccordo: cache del router, fuso del server, controlli che si tolgono da soli, pagine che il piano non elencava.

### Coverage

- **13/13 passaggi del rubric** hanno risposto: v1, v2, v4, v7, v8, v9 su opus; v3, v5, v6, v10, v12 su sonnet; v11 e v13 su haiku. Nessun passaggio saltato né rilanciato.
- **Browser (solo lettura, DB di sviluppo, OPERATORE Federica Lupo):** v6, v7, v8, v9 e v12 con sessioni proprie (`review-cols-pr5b`, `review-filters-pr5b`, `review-nav-pr5b`, `review-focus-pr5b`, `review-ui-pr5b`). I controlli che richiedono una scrittura (riapertura vera, richiamo, chiusura dell'alert, rifiuto del server) sono stati simulati con `route` in pagina o argomentati dal codice e dai test: v8 e v12 dichiarano le chiamate simulate, nessuna è arrivata al server. L'app stessa ha scritto due volte `pref=ct` aprendo Clienti (comportamento esistente).
- **Orchestratore:** ha riletto il codice per i tre BLOCKER e per i MAJOR di v3, v4, v7, v13; ha riprodotto in browser lo scheletro di v13 (sessione `review-synth-pr5b`, chiusa).
- **Non verificato da nessuno:** i controlli solo-admin (nessuna sessione ADMIN), la lettura di uno screen reader (NVDA/VoiceOver), il pannello Animations di DevTools, Mobile Safari/touch, il fuso reale del runtime di Vercel (preso dalle dichiarazioni del repo), `error.tsx` renderizzato in browser, una riapertura vera e una nota scritta dal contatto (AC53 nei due versi, AC54 scrivendo). Elencati nella checklist.
- **UI pass (v12):** su Chromium 149 con `agent-browser` 0.27.1, tema chiaro (l'app non ne ha altri); axe non installato, quindi contrasti e alberi letti a mano. **Pass del movimento (v13):** riferimento `design-engineering/references/review.md`, con `brain/chore/motion.md` che vince.
- **Produzione:** nessun verificatore si è collegato al database di produzione né ha lanciato uno script con `NODE_ENV=production`. Il server di sviluppo sulla porta 3100 era già acceso e non è stato toccato.
- **Albero di lavoro:** rimasto intatto: `git diff --stat 0daa1a3 -- src` dà ancora 7 file, +124/-3, ricontrollato dopo l'ultimo verificatore. I mutanti sono girati in copie fuori dal repo. I verificatori hanno scritto note nella loro memoria in `.agents/agent-memory/adversarial-verifier/` (file da lasciare fuori dai commit, come quelli già presenti).
- **Scostamento dalla delega `supervised`:** i controlli di T5.12 sono stati eseguiti dall'orchestratore (browser) e non da un worker; vedi "Claims contradicted".

### Findings

Tutti **aperti**: il giro non ha corretto niente. La colonna "Durable?" resta vuota finché le correzioni non sono fatte: un BLOCKER/MAJOR non corretto prima del merge diventa durevole per `docs-maintenance`.

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v10 — giorno italiano (AC24, AC28) | `ContactAlertSection.tsx:20,25,80`, `ContactDetailHeader.tsx:139-142`, `src/lib/utils/index.ts:76-78` | Il dettaglio (Server Component) stampa le date nel fuso del processo. `renderToString` del vero `ContactAlertSection`: scadenza `2026-10-20T22:00:00Z` → `TZ=UTC` "20/10/2026", `TZ=Europe/Rome` "21/10/2026"; Storico "26/9" contro "27/9". Su Vercel (UTC) ogni richiamo del selettore si legge un giorno prima | Formatter con `timeZone: "Europe/Rome"` per tutti i componenti nuovi di Contatti; test con stringhe scritte a mano (`2026-10-20T22:00:00Z` → `21/10/2026`) sotto `TZ=UTC`, `America/Los_Angeles`, `Europe/Rome`. I test attuali calcolano l'atteso con `formatDateAsDMY` (`ContactDetailContent.test.tsx:225,248,269`, `ContactsTable.test.tsx:350`) | — |
| BLOCKER | v8 — cronologia (AC35, AC2, AC3) | `ContactStateControl.tsx:92-104` | Dopo una riapertura, `replace` senza `router.refresh()`: "Indietro" e Esc/X entro 30 s mostrano la lista in cache. Sonda: `changeState` simulato `{taskId:76744, reopened:true}`, history length 20 invariata, Indietro con 0 richieste `_rsc`; Esc a 12 s: righe `["76743"]`. Con `reopened:false` (percorso con refresh) la lista si ricarica. La riga del contatto sostituito è attiva, modificabile e senza "Superato"; il nuovo manca; un clic riapre il vecchio | `startNavigation(() => { router.replace(href, { scroll: false }); router.refresh() })`; test che la riapertura rinfresca; prova in browser: riapri, poi Indietro/Esc → la lista mostra il contatto nuovo | — |
| BLOCKER | v9 — focus (regola comune di PR5b, P17) | `ContactPagination.tsx:56,70`, `ContactFilters.tsx:176`, `ContactsEmptyState.tsx:111,125` | Da tastiera il focus finisce su `body` quando il controllo si toglie da solo: Invio su "Precedente" da `pagina=2`, su "Successiva" verso l'ultima pagina, su "Rimuovi il filtro cliente", su "Azzera filtri", su "Vai alla prima pagina". Prova: `document.activeElement` dopo la navigazione, cinque volte. Controllo: 2→3 tiene il focus su "Successiva". Nessun test | Tenere i due link e usare `aria-disabled` agli estremi, oppure in `ContactsListShell.navigate`, a transizione finita con `focusIsLost()`, mettere il focus sulla tabella (ha già `tabIndex=-1`); focus sulla casella di ricerca prima di togliere il chip; un test da tastiera per controllo con `document.activeElement !== document.body` | — |
| MAJOR | v10 — SSR (AC7) | `ContactColumns.tsx:161` (anche `:262,:285,:294`) | La cella "Prossimo alert" formatta nel fuso del processo: server `TZ=UTC` e client `TZ=Europe/Rome` danno "Text content did not match. Server: 14/10/2026 Client: 15/10/2026" e "Hydration failed" ×6, con ritorno al rendering lato client. Controllo Roma/Roma: nessun errore. Ogni pagina con un richiamo del selettore. `now` non c'entra | Stessa correzione del BLOCKER di v10 | — |
| MAJOR | v4 — AC52 | `ContactPriorityControl.tsx:64`, `ContactAlertCloseButton.tsx:67`, `ContactOperatorControl.tsx:54` | `useContactMutationFeedback({ refresh })` senza `activeContactHref`: un rifiuto `CONTACT_SUPERSEDED` dà il toast senza "Vai al contatto attivo" (sonda: `hasAction false` ×3 con `activeTaskId: 303`; stato e richiamo invece danno `/dashboard/contatti/303?da=…`). Verificato dall'orchestratore con grep: solo tre punti lo passano. Il piano lo nomina in T5.7a e T5.7b, non in T5.7c; l'unico test dell'operatore usa `activeTaskId: null` | Passare `activeContactHref = (id) => detailHrefFromDa(id, da)` ai tre (portare `da` da `ContactDetailHeader` e da `ContactDetailContent` via `ContactAlertSection`); un test di rifiuto superato per controllo che asserisce l'href | — |
| MAJOR | v4 — AC35 | `ContactStateControl.tsx:87-105` | La riapertura che finisce dopo che l'utente ha chiuso la Sheet esegue `router.replace` (la callback di `mutateAsync` gira dopo lo smontaggio, per scelta). Sonda P4: smonta, risolvi `{taskId:202, reopened:true}` → `replace` chiamato. Esito: o la Sheet chiusa si riapre su D2 con history [L0, D1, D2] e "Indietro" sul contatto sostituito, o Next scarta la `push` della chiusura e Esc si perde. Argomentato dal sorgente di Next 14.2.5 (`app-router.js:288-292`, `action-queue.js:121-124`) e da jsdom, non in browser | Ref "montato" o confronto col percorso corrente: se il controllo non c'è più, solo `refresh` (o toast con link al nuovo contatto); test smonta → risolvi riaperto → `replace` non chiamato | — |
| MAJOR | v3 — dati personali | `ContactRowActions.tsx:41`, `ContactRowState.tsx:108`, `sentry.client.config.ts:27-31` | Il nome del cliente va in `aria-label="Azioni per …"` (fino a 500 righe a pagina) e in `altText` (Radix lo scrive in `data-radix-toast-announce-alt`). Il Replay di Sentry ha `maskAllText: true` ma `maskAttributes` di default (`title`, `placeholder`): la vera funzione `maskAttribute` dà `aria-label → Azioni per LODDO MICHELE` in chiaro. Config e attributi riletti dall'orchestratore. Solo produzione, 10% delle sessioni più ogni sessione con errore. Nel codice di base non c'è niente di simile | `aria-labelledby` sulla cella del cliente già esistente (`customerCellId`) e `altText` fisso; oppure `maskAttributes: ["title","placeholder","aria-label","data-radix-toast-announce-alt"]`; aggiornare i test `getByRole("button",{name:"Azioni per …"})` | — |
| MAJOR | v7 — AC18, AC10, P17 | `useContactFilters.ts:84-86,98-105`, `ContactColumns.tsx:88-90`, `ContactPagination.tsx:44-47,92-96`, `ContactsEmptyState.tsx:85,98` | Una ricerca o un filtro in sospeso si perde o resta solo a schermo quando un altro controllo naviga: l'hook costruisce l'indirizzo dal suo `latest`, intestazioni, paginazione e stati vuoti dallo `state` dell'indirizzo, e Next scarta la navigazione in sospeso. Browser (RSC tenute 3 s): scrivo "verdi", attendo 0,8 s, clic su "Creato" → la casella dice "verdi" con la lista non filtrata (62.998); il clic dopo su "Includi contatti precedenti" applica la ricerca di nascosto (27). Con Stato → "richiamare" e "Creato" entro 0,85 s il filtro sparisce | Una sola fonte per lo stato successivo per tutti i navigatori della lista (`navigateWith(change)` nella shell sul `latest` dell'hook); come minimo riportare la casella a `parsed.q` quando `pending` finisce senza timer; test con `pending` tenuto aperto | — |
| MAJOR | v7 — AC10, AC17, P17 | `useContactFilters.ts:42-47,118-121,140-143`, `ContactDateFilter.tsx:52-55,108-116` | Un giorno rifiutato dal server (anno a due cifre: "26" → `0026-10-01`) o un intervallo al contrario blocca ogni altro filtro e la ricerca, senza messaggio: `notApplicable(next)` guarda tutto lo stato. Browser: dopo "26" in "Dal", "Con alert" e "rossi" non arrivano né all'indirizzo né alla lista; nessun `role=alert`. Verificato nel codice dall'orchestratore. Il debito (riga 440) registra solo l'assenza di `push` | Costruire l'indirizzo con l'ultima data applicabile mentre quella digitata non lo è, tenendo a schermo quella digitata; stesso `aria-invalid` e messaggio dell'intervallo al contrario anche per il giorno rifiutato | — |
| MAJOR | v6 — AC5 | `ContactsTable.tsx:79`, `ContactColumnsMenu.tsx:38-44` | La colonna nascosta ricompare tornando dal dettaglio: `useState(() => hiddenColumns)` seminato una volta dalla prop, il salvataggio non rinfresca, e la cache del router (30 s in Next 14.2.5, nessun `staleTimes`) riusa il payload vecchio. Browser (POST simulato 200): nascondo Telefono, apro una riga, "Chiudi" → Telefono torna; dopo 36 s lo stesso giro fa una richiesta e resta nascosta | `router.refresh()` dopo la risposta OK; test di rimontaggio con la prop vecchia | — |
| MAJOR | v8 — errore | `src/app/dashboard/contatti/error.tsx:23` | "Riprova" chiama solo `reset()`: in Next 14.2 riesce a ripresentare l'errore in cache senza richieste. Browser: cookie di sessione non valido → `error.tsx`; ripristinato il cookie, due clic su Riprova → 0 richieste `_rsc`, errore resta; lo stesso con altri filtri sullo stesso percorso. `error.test.tsx:17-19` controlla solo `reset` | `startTransition(() => { router.refresh(); reset() })` e un test che Riprova rinfresca | — |
| MAJOR | v9 — focus | `ContactSheet.tsx:103-109`, `ContactNotFound.tsx:15` | Uscendo dal dettaglio senza `close()` il focus finisce su `body`: tasto Indietro del browser (lista montata, `sessionStorage` vuoto) e "Torna a Contatti" nella pagina "Contatto non trovato". Esc sulla stessa pagina arriva alla tabella. Vanifica il rimedio di P13 per la lista rimontata | Salvare il ritorno nella pulizia allo smontaggio della shell quando `closingRef` è falso; "Torna a Contatti" passa dalla shell o salva prima di navigare | — |
| MAJOR | v12 — UI (2.4.11, AA) | `ContactsTable.tsx:197`, `contatti/page.tsx` | La barra della paginazione (`sticky bottom-0 z-10`) copre per intero i controlli con il focus: a 1440×900, Tab 71 sul link "Giorcelli Gabriella" (y 844–864) sotto la barra (y 828–884); anche Tab 72. Una riga per pagina, sempre. Riprodotto due volte, stesse misure. Stesso schema in Clienti e Pratiche | `scroll-pb-16` sul `div.dashbaord-layout`: con `scroll-padding-bottom: 72px` Tab 71 sta a y 792–812 | — |
| MAJOR | v13 — movimento (P17, T5.12 controllo 1) | `CustomerChat.tsx:639` (raggiunto da `ContactNotes` sotto `(dettaglio)`) | `Skeleton` con `animate-pulse` infinito mentre `getOperatorById` non ha dati (`:582`): al primo apertura a freddo, e per sempre (con la nota nascosta) se la ricerca dell'autore fallisce. **Riprodotto dall'orchestratore** in browser su `/dashboard/contatti/76728?da=…`: ricarica a freddo → 5 `.animate-pulse` e 0 `article` subito dopo il caricamento, 0 e 5 dopo 3 s; con la richiesta `operator.getOperatorById` annullata → ancora 5 e 0 dopo 6 s. Il file non è nel change set: è la chat condivisa, ora montata sotto il dettaglio | Rendere il corpo della nota senza aspettare l'autore (il nome compare quando c'è) e nessun pulse; test in `CustomerChat.test.tsx` con la ricerca in attesa e poi rifiutata. La correzione vale anche per la scheda cliente | — |
| MINOR | v1 — link | `ContactColumns.tsx:123`, `ContactRowActions.tsx:63`, `ContactDetailHeader.tsx:78` | `/dashboard/customers/${customer.id}` senza codifica, con un id che ogni utente autenticato può scegliere (`insertCustomer` accetta `../../api/auth/signout`, `x?y=1#z`, `..`). Stesso sito, ma l'indirizzo esce da `/dashboard` o prende parametri. `ContactsEmptyState.tsx:74` invece codifica. Schema già presente in `CustomersTable.tsx:218` e `BlackList.tsx:77`, fuori dal debito | Un `customerHref(id)` con `encodeURIComponent` e `""`, `.`, `..` verso l'elenco, usato dai quattro punti; i due vecchi nel debito | — |
| MINOR | v1 — test | `ContactNotFound.tsx:15`, `ContactSupersededBanner.tsx:37`, `ContactStateControl.tsx:57,101`, `ContactCallbackForm.tsx:69`, `[id]/page.tsx:20` | I test fissano i costruttori di indirizzi, non i punti di chiamata: sostituire `returnHref(da)` con `"/dashboard/contatti?" + da`, `detailHrefFromDa` con un passaggio diretto o `parseChatLimit` con `Number(searchParams.limit)` lascia tutto verde (baseline 27 file, 427 test). Con `limit=-5` arriverebbe `.limit(-5)` alla chat | Un caso con `da` ostile per punto di chiamata e un test sul cablaggio di `page.tsx` | — |
| MINOR | v2 — test | `ContactDetailHeader.tsx:96,110,126`, `ContactDetailContent.tsx:32,34`, `ContactAlertSection.tsx:86`, `[id]/page.tsx:27` | Nessun test fissa le regole di visibilità dei controlli del dettaglio (T5.6b e T5.7c lo chiedevano): sette mutanti, e uno che toglie tutte le guardie, passano 490 test su 490. Il codice oggi è corretto (sonda con i veri controlli 6/6) e il server rifiuta comunque | La matrice della sonda (`authz-probe.test.tsx.keep`) come test, più l'asserzione di pagina che `getAllUniqueOperators` non è chiamata e `ContactNotes` c'è | — |
| MINOR | v3 — log | `src/trpc/server.ts:30-35`, `ContactsTableSection.tsx:19` | Con la `getContacts` in errore il `loggerLink` stampa `input`, quindi il testo cercato (CF, telefono) va su `stderr` (sonda: `customerQuery: 'RSSMRA80A01H501U'`). Stesso meccanismo già in Clienti | Un `logger` che omette `input`; le righe di log di Vercel con la query: non verificato | — |
| MINOR | v3 — Sentry | `searchParams.ts` (`detailHref`), `sentry.client.config.ts` | Il testo cercato esce verso Sentry negli URL (`event.request.url`, `Referer`, breadcrumb, navigazioni del Replay); `da` è un secondo vettore. Il debito nomina la cronologia del browser, non Sentry | `beforeSend`/`beforeBreadcrumb` che toglie `q` e `da`, oppure registrare Sentry nel debito che il team ha già accettato | — |
| MINOR | v4 — test | `ContactStateControl.tsx`, `ContactCallbackForm.tsx`, `ContactOperatorControl.tsx` e gli altri | Sopravvivono: nessuna ri-conferma dopo una conferma (AC37), selettore occupato per sempre dopo "Annulla", href del link al contatto attivo, doppio invio dell'operatore, `mutate(vars,{onSuccess,onError})` al posto di `mutateAsync().then` (nessun test smonta a metà), fine dell'attesa prima del refresh in tutti e cinque i controlli, guardie di visibilità | I test nominati da v4 (probe P1, P2, P5 e i mutanti `*_mutate_callbacks`, `*_err_fail_now`) | — |
| MINOR | v4 — dato | `ContactOperatorControl.tsx:69,112` | Un operatore non in `getAllUniqueOperators` (join con `users`: l'operatore di sistema non ha riga) appare "Non assegnato" (sonda `operatorId=99`). Il log del piano lo menziona, il debito no | Passare `contact.operator` e mostrarne il nome | — |
| MINOR | v5 — annuncio | `ContactsTable.tsx:89-94` | "Il contatto di X non è più nell'elenco. N contatti." parte se l'id non è nella pagina, anche quando la riga è passata a un'altra pagina per l'ordine o è stata sostituita da una riapertura (sonda: la frase con il cliente ancora in lista, nuovo id 22). Non è il caso del debito (riga 441) | Passare `result.taskId` in `rowChanged` e contare presente il contatto se uno dei due id è nelle righe, o frase diversa se il totale non è sceso | — |
| MINOR | v5 — toast | `ContactRowState.tsx:99-121`, `ContactRowActions.tsx` | Limite di un toast: riaprendo A con un filtro attivo e cambiando B entro 8 s, [Apri] sparisce (sonda PB4). Il piano rimanda a "Vedi contatti", che c'è solo nel menu di Clienti | Voce "Vedi contatti del cliente" in `ContactRowActions` (`seeContactsHref` esiste), o correggere la frase del piano | — |
| MINOR | v5 — test | `ContactRowState.test.tsx`, `ContactsTable.test.tsx` | 18 mutanti sopravvivono: bersaglio di "Vai al contatto attivo", successo dopo lo smontaggio, `stopPropagation` della cella, selettore bloccato dopo "Annulla", `aria-live`, `describedBy`, presentazione del toast (`useToast` simulato ovunque) | Le sonde PA1–PA6 e PC1–PC4 come test permanenti | — |
| MINOR | v6 — AC5 | `ContactColumnsMenu.tsx:38-44`, `route.ts:33-36` | Il salvataggio gestisce solo il rifiuto di rete: un 500/401 non dà alcun segnale (browser: colonna nascosta, nessun `console.error`, riappare al ricaricamento). Il debito (riga 311) nomina questo rischio; qui c'è un nuovo client con lo stesso comportamento | Controllare `response.ok` (e `router.refresh()` solo allora); test con `{ok:false,status:500}` | — |
| MINOR | v6 — AC3 | `ContactRowState.tsx:150-152`, test `:221` | "Superato" manca finché `useActor()` è nullo (un commit dopo il provider; per sempre senza riga in `operators`): il segno ha bisogno solo di `isActive` | Mostrare "Superato" prima del controllo sull'attore; aggiornare il test che lo fissa | — |
| MINOR | v6, v11 — test | `ContactRowState.tsx:195-199`, `ContactColumns.tsx:225`, `ContactsTableSection.tsx:39`, `CustomerColumns.tsx:420` | Senza `stopPropagation` della cella o di "Vedi contatti" i test restano verdi (514; 6/6): un clic aprirebbe anche il contatto o la scheda cliente. `vatCode ?? fiscalCode` sopravvive (l'ordine di Clienti è `fiscalCode ?? vatCode`). La riga che rende l'AC5 valido tra dispositivi non ha test | Test con selettore e menu veri dentro un `<tr onClick>`; cliente con entrambi i codici; test della sezione | — |
| MINOR | v7 — test | `useContactFilters.ts`, `ContactPagination.tsx`, `ContactColumns.tsx`, `ContactsTable.tsx` | 42 mutanti, molti sopravvivono con 99/99 verdi: timer con snapshot vecchio, reset di `qInFlight`, `aria-busy` della tabella, navigazione fuori da `startTransition`, `aria-sort`, bordo della pagina successiva, `maxLength` | Un'asserzione per mutante nominato (`results.txt`) | — |
| MINOR | v8 — test | `[id]/page.tsx:42-48`, `ContactsTableSection.tsx` | Nessun test importa i due file: una pagina che mostra "non trovato" per ogni errore passa tutta la suite; la `push` di "Vai al contatto attivo" non è fissata (mutante con `replace`: 87 verdi) | Test di pagina con `api` simulato | — |
| MINOR | v9 — annunci | `ContactSheet.tsx:84`, `announceAlert` | Dentro la Sheet ogni rifiuto è pronunciato due volte: Radix annuncia con un `role=status` `assertive` fuori dalla regione nascosta, poi ripete il nodo `role=alert` della Sheet (browser e jsdom). Il sondaggio di T5.6 guardava solo il contenitore dei toast. E `announce` con lo stesso testo due volte non cambia il DOM: la seconda riapertura nella stessa Sheet è muta | Togliere `announceAlert` o registrare il doppio come accettato; chiave a contatore per `announce` | — |
| MINOR | v9 — test | `ReadOnlyFocusFlag`, `aria-busy`, regioni sempre montate, `focusIsLost()`, `forget()` | I mutanti M14, M15, M4, M19, M20, M30, M32, M17, M33 passano la suite | Test per ciascuno | — |
| MINOR | v10 — test | `ContactCallbackForm.test.tsx:198-200`, `ContactsTable.test.tsx:88`, `ContactCallbackForm.test.tsx:67` | Il test del giorno "domani" cade con `TZ=Pacific/Kiritimati`, `Asia/Tokyo`, `Pacific/Auckland` e passa a Roma, UTC, Los Angeles; il debito (righe 328–337) copre solo i test di PR5a. Ogni `now` è alle 10:00Z: il giorno UTC di `now` e il confronto di istanti nel selettore sopravvivono | `now = 2026-10-18T22:30:00Z` (00:30 a Roma) e `2026-10-24T22:30:00Z`; fissare il fuso nel test | — |
| MINOR | v12 — UI | `ContactCallbackForm.tsx:139`, `MultiSelectFilter.tsx:79` | I popover toccano il bordo del viewport (0 px a destra a 1440, 1280, 1024, 768 e 320; Stato e Priorità 0 px a 900 px di altezza) | `collisionPadding={8}` | — |
| MINOR | v12 — UI | `DashboardLayout.tsx:160-162` | Il link "Contatti" non ha nome accessibile col menu chiuso (solo icona); lo stesso per Home, Customers e Pratiche (preesistente) | `aria-label="Contatti"` (e sugli altri) | — |
| MINOR | v12 — UI | `ui/switch.tsx`, `ui/input.tsx` (primitivi) | Contorni dei controlli nuovi sotto 3:1 (interruttore spento 1,26:1, input 1,26:1, trigger `#ededed` 1,17:1): passaggio dei primitivi, non in debito | Scurire a circa `#8a8a8a` | — |
| MINOR | v12 — UI | `components/custom/badge/priority.tsx` | All'hover l'icona di priorità passa su `#434344` (urgente 2,04:1, alta 2,78:1) per `hover:bg-primary/80` del `Badge`; anche nella Sheet | Nessuno sfondo all'hover su `PriorityBadge` | — |
| MINOR | v12 — UI | `ContactFilters.tsx:178-186`, `ContactPagination.tsx:87`, `ContactFilters.tsx:127` | Con un nome lungo il pulsante del chip scende a 16×40 (<24 px) a 768 px; con numeri a cinque cifre l'intervallo va a capo (`pagina=999`); barra dei filtri e paginazione non vanno a capo sotto ~400/450 px (menu chiuso, 320: select fuori schermo) | `shrink-0` sul pulsante; `whitespace-nowrap` sul `<p>`; `min-w-0 w-full sm:min-w-[18rem]` sull'input e riga che va a capo | — |
| MINOR | v12 — UI | `ui/sheet.tsx:74-80`, `MultiSelectFilter.tsx:79`, `ContactCallbackForm.tsx:139` | "Chiudi" della Sheet 16×16 e ultimo nell'ordine del Tab; nomi accessibili: "Campo data" e "Righe per pagina" non contengono il testo visibile, "Pagina successiva" non inizia con "Successiva"; i due popover sono `dialog` senza nome | Area di 24 px e primo nel DOM; nome `${valore}, azione` come `ContactStateSelect`; `aria-label` sui `PopoverContent` | — |
| NIT | v1, v2, v3, v4, v5, v8, v9, v11, v12, v13 | vari | Caso `da` ripetuto (`page.tsx:36` usa `da[0]`, la Sheet no); `contactIdOf` più largo sopravvive; stato della riga deciso nel client con la funzione del server (stesso contratto, ruolo dal server); `Promise.all` che per l'admin è sequenziale (`page.tsx:25-31`); `pathname.includes` che accende "Contatti" su indirizzi che non sono rotte; nidificazione `Link > li` preesistente; link del toast fuori dalla trappola del focus; primitivi condivisi non nominati in `motion.md`; righe vuote di spaziatura (padding morto delle opzioni, valori dell'intestazione 4–8 px, "Vedi contatti" senza separatore) | Non corretti | — |

### Correzioni dopo il giro (2026-10-18)

Il verdetto sopra resta **DO NOT SHIP** finché i verificatori non girano sul codice corretto. Stato dei 3 BLOCKER e degli 11 MAJOR dopo le correzioni (un test RED per ciascuno; suite intera verde: 1704 test, 109 file, sotto `TZ=UTC`, `America/Los_Angeles` e il fuso della macchina; `tsc` e ESLint puliti). Dettagli nel log di T5.13 del [[specs/crm/sezione-contatti/PLAN]].

| Finding | Esito | Come |
|---------|-------|------|
| BLOCKER v10 (date nel fuso del server) | Corretto, non rilanciato | `formatDateAsDMY` con `Europe/Rome` alla radice (anche Clienti e Pratiche); test con stringhe a mano in tre fusi |
| BLOCKER v8 (lista vecchia dopo la riapertura) | Corretto, provato in browser (`changeState` simulato) | `router.refresh()` dopo il `replace`; "Indietro" rifà la richiesta della lista |
| BLOCKER v9 (focus su `body`) | Corretto, provato in browser su "Precedente" | Recupero del focus nella shell: tabella, a navigazione finita; cinque test da tastiera |
| MAJOR v10 (idratazione) | Corretto, **da provare con il server in UTC** | Stesso formatter |
| MAJOR v4 (AC52) | Corretto | `activeContactHref` nei tre controlli, un test per controllo |
| MAJOR v4 (riapertura dopo la chiusura) | Corretto | `mounted` ref: solo `refresh` |
| MAJOR v3 (nomi in attributi) | Corretto (scelta A), provato in browser | `aria-labelledby` e `altText` fisso |
| MAJOR v7 (ricerca in sospeso) | Corretto, provato in browser | Stato unico nella shell (`navigateWith`) |
| MAJOR v7 (anno a due cifre, intervallo al contrario) | Corretto, provato in browser (anno) | `addressable` + messaggio per il giorno rifiutato |
| MAJOR v6 (colonna nascosta ricompare) | Corretto | `router.refresh()` dopo la risposta OK |
| MAJOR v8 ("Riprova") | Corretto | `refresh` + `reset` in una transizione |
| MAJOR v9 (Indietro, "Torna a Contatti") | Corretto | Il ritorno si scrive anche allo smontaggio senza `close()` |
| MAJOR v12 (barra sulla messa a fuoco) | Corretto (`scroll-padding-bottom` 64 px verificato), **posizione col focus da misurare** | `scroll-pb-16` sulla pagina di Contatti |
| MAJOR v13 (scheletro nella chat) | Corretto, provato in browser | Nota subito, autore quando c'è |

Aperti: tutti i MINOR e i NIT; il rilancio di v8, v9, v10, v4, v7, v6, v3, v12, v13; le prove che i test in jsdom non coprono (cache del router di Next, idratazione con il server in UTC, misure della barra); la checklist umana.

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — URL non fidato | 413 indirizzi di dettaglio da 59 query ostili: chiusura e "Torna a Contatti" sempre `/dashboard/contatti` con sole chiavi note, senza frammento; fuzz di 60.000 stringhe: 0 violazioni di `detailHrefFromDa`; `[id]` solo `^[1-9][0-9]*$` fino a 2147483647; `limit` stretto (`-5`, `1e9`, `0x10`, cifre a larghezza piena → `undefined`); filtri solo via `toContactsInput(parse())`; nessun HTML grezzo; `sessionStorage` letto in difesa |
| v2 — autorizzazione | Tutti i controlli del dettaglio da `editability`/`canReassign` calcolati sul server; lista degli operatori solo con `canReassign`; "Cambia operatore" mai a un operatore (sonda con i veri controlli 6/6); nessun attore nel corpo delle mutation; `?pref=cot` scrive solo la chiave dell'utente di sessione; nessuna nuova `"use server"`, rotta o accesso diretto al DB |
| v3 — dati personali (resto) | `sessionStorage` solo `{id, at}`, letta una volta, scade a 30 s; "Copia telefono" solo il numero; `error.tsx` non legge `error`; `Referrer-Policy: strict-origin-when-cross-origin`; nessun `target=_blank`; nessun prefetch di payload con dati personali (nessun `loading.tsx`) |
| v4 — controlli di scrittura | Salva con `source: "detail"`, valore salvato sempre, `confirmedAlertId`, riapertura con `replace` e `da`, "Annulla" ed Esc senza invii, `replacesAlertId`, `null` per il messaggio vuoto, etichetta della priorità dal valore salvato; i cinque controlli usano `mutateAsync().then`; 14 file, 157 test, `tsc` 0 |
| v5 — stato dalla riga | Stesse regole del dettaglio, `contactEditability` come la guardia del server; toast di successo `background` 5000 ms (real Toaster: aperto a 4800, chiuso a 5200), riapertura 8000 ms con [Apri] come `<a>`; callback non persi allo smontaggio; nodo di annuncio sempre montato; 108 test, 52 mutanti |
| v6 — righe e colonne | Ordine delle colonne misurato nel browser; CF con ripiego su P.IVA; badge in blacklist (D7); priorità NULL come la fascia più bassa; menu della riga (ordine, "Copia telefono" solo con telefono, 29 clienti senza telefono nella pagina da 100); propagazione dei clic; POST `?pref=cot` osservato; 58 test |
| v7 — filtri | Indirizzo ostile (`?stato=boh,…&dal=…&al=…`) mostra solo i filtri applicati; `q` con una `replace` e nessuna `push`; "bian" + "Con alert" entro 300 ms → una `push`; "Azzera filtri", Indietro/Avanti; tastiera del multi-select; ordinamento; pagina oltre l'ultima (`0 - 0 di 14828`); chip e AC21–AC23; nessuno scheletro nelle transizioni |
| v8 — struttura | Server Component, `noStore`, un `Promise.all`, Suspense solo attorno alla tabella; Sheet mai rimontata (stesso nodo su cambio di id e `limit`); 7 id ostili → "Contatto non trovato"; una `push` alla chiusura con Esc, fondo e X insieme; riapertura con `replace`; "Vai al contatto attivo" con `push`; chat dopo il contatto senza Suspense, "Avvia una chat", "Carica altri messaggi"; grafo del client senza moduli server (esbuild su 27 file) |
| v9 — focus (resto) | Apertura sul titolo (mouse, tastiera, link diretto); chiusura sul pulsante della riga; Esc annidato chiude solo il livello; flag di riapertura per contatti modificabili e in sola lettura; chiusura dell'alert; riga che esce; "Annulla"/Esc della modale; popover; `scroll:false`; regioni sempre montate |
| v10 — giorno italiano | `AlertCell` con `isPastDay`/`isDueOrOverdue`; selettore del richiamo uguale al server su 10 istanti × 5 fusi (0 differenze vs `Intl` Roma), compreso il cambio d'ora; filtri data senza conversione di fuso; `ContactsTable.test` verde in sei fusi |
| v11 — condivisi | `closeProps` e `describedBy` inerti per tutti gli altri consumatori; il setter dello store conserva le altre chiavi; voce "Contatti" tra Customers e Pratiche, attiva anche su `/dashboard/contatti/12`; "Vedi contatti" con `seeContactsHref`; 639 test, `tsc` 0 |
| v12 — UI | AC1, AC5 (resa), AC7 (icona e testo, 7,09:1 e 6,47:1), AC20, AC22, AC27 (14,44:1), AC51, AC52 (toast con link e selettore tornato a "richiamare"); anelli del focus visibili ovunque; contrasti ≥ 4,54:1; bersagli ≥ 28 px nei menu; Sheet senza overflow da 291 a 1440 px |
| v13 — movimento | Nessuna animazione nuova (grep sul change set); uscita della Sheet senza animazione per smontaggio; righe `transition-none` (verificato con `tailwind-merge` 2.4.0); menu dello stato e della priorità senza animazioni; quattro spinner con `motion-reduce:animate-none`; primitivi invariati; nessuno scheletro nelle navigazioni della lista |

### Claims contradicted

Affermazioni del piano o dei log che i verificatori hanno trovato false o troppo larghe. I primi due sono dei log di T5.12 scritti dall'orchestratore; gli altri del piano e del debito tecnico.

| Dove | Affermazione | Esito |
|------|--------------|-------|
| `PLAN.md` T5.12, controllo 7 e log | Esito: "Mai su `body`" dopo la prima interazione | **Contraddetta da v9** per cinque controlli della lista e per Indietro/"Torna a Contatti". I casi provati erano quelli della tabella del `design-engineer`: la prova non copriva i controlli che si tolgono da soli |
| `PLAN.md` T5.12, controllo 3 (log) e `PLAN.md:2474` | Zero `.animate-pulse` aggiunti; "la prima apertura del dettaglio non ha skeleton" | **Contraddetta da v13 e riprodotta dall'orchestratore**: con la cache fredda e le note del cliente, 5 `.animate-pulse` nella Sheet; la prova di T5.12 era a cache calda |
| `PLAN.md` T5.6 e T5.12 (controllo 9), sonda dei toast | La regione dei toast è `aria-hidden` dentro la Sheet, quindi ogni rifiuto compare una sola volta nel nodo `role=alert` | **Contraddetta da v9**: Radix annuncia con un nodo proprio fuori dalla regione nascosta; il rifiuto si sente due volte |
| `PLAN.md` T5.9 (limite di un toast) | [Apri] non è l'unica via, c'è comunque "Vedi contatti" (citazione di v5) | **Parziale (v5)**: la voce c'è solo nel menu di Clienti |
| `brain/tech-debt/crm/sezione-contatti.md:440` | Gli anni rifiutati non producono `push` (è l'unico effetto registrato) | **Incompleta (v7)**: bloccano anche ogni altro filtro e la ricerca |
| log di T5.12, controlli 5 e 6 | Nessun salto di layout, una sola navigazione alla chiusura | Confermati (v8: una sola `push`; v12: nessuno overflow) |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Input non fidato dall'URL verso indirizzi e input del server | SHIP | Nessun indirizzo esce da `/dashboard/contatti`; due MINOR (link "Apri cliente" non codificati, test ai punti di chiamata) |
| v2 | Confine di autorizzazione nella UI | SHIP | I controlli seguono i flag del server; il MINOR è che nessun test fissa le guardie del dettaglio |
| v3 | Dati personali sul client | DO NOT SHIP | MAJOR: nomi dei clienti in attributi non mascherati dal Replay di Sentry; due MINOR (log di `input`, URL verso Sentry) |
| v4 | Controlli di scrittura del dettaglio | DO NOT SHIP | MAJOR: AC52 senza link al contatto attivo in tre controlli; MAJOR: la riapertura finita dopo la chiusura naviga di nuovo nel dettaglio |
| v5 | Cambio di stato da una riga | SHIP | Tre MINOR (annuncio sbagliato, toast unico, 18 mutanti vivi); nessuno su un percorso normale |
| v6 | Righe, colonne e preferenza | DO NOT SHIP | MAJOR: la colonna nascosta ricompare tornando dal dettaglio (cache del router) |
| v7 | Filtri, ordinamento, paginazione e URL | DO NOT SHIP | Due MAJOR: la ricerca in sospeso si perde con un altro controllo; un anno a due cifre blocca tutta la barra |
| v8 | Struttura App Router e cronologia | DO NOT SHIP | BLOCKER: lista vecchia dopo una riapertura; MAJOR: "Riprova" non riprova |
| v9 | Focus e annunci | DO NOT SHIP | BLOCKER: focus su `body` da tastiera su cinque controlli; MAJOR: Indietro e "Torna a Contatti" |
| v10 | Giorno italiano su client e SSR | DO NOT SHIP | BLOCKER: date nel fuso del server nel dettaglio; MAJOR: errore di idratazione in lista |
| v11 | Modifiche condivise e punti d'ingresso | SHIP | Nessun consumatore esistente cambia; un MINOR sul `stopPropagation` di "Vedi contatti" |
| v12 | Passaggio UI | DO NOT SHIP | MAJOR: la barra della paginazione copre i controlli con il focus (2.4.11); gli altri sono MINOR |
| v13 | Passaggio di movimento | DO NOT SHIP | MAJOR: scheletro `animate-pulse` nella chat sotto il dettaglio (riprodotto); verdetto della skill: Approve |

### Human Review Checklist

`reviewImpact: critical`. Passi, nell'ordine:
1. **Correggere prima del merge i tre BLOCKER e gli undici MAJOR** (e decidere i MINOR: quelli che non si correggono vanno nel debito). Rilanciare poi almeno v8, v9, v10, v4, v7, v6, v3, v12 e v13 sul codice corretto: una correzione che sposta i focus o i formattatori tocca tutti i casi di cui sopra.
2. **CI verde sulla PR verso `dev`**: `SKIP_ENV_VALIDATION=true pnpm exec next lint`, `pnpm exec tsc --noEmit`, `pnpm run test --run`, `pnpm build` in una copia pulita (nessun `next build` con i file `.env` veri).
3. **Fuso del server**: dopo la correzione, su un'anteprima di Vercel (o con `TZ=UTC` locale sul server di sviluppo) un richiamo impostato per il 21/10 si legge 21/10 nel dettaglio, in lista e nel modulo, e la console del browser non mostra errori di idratazione. I test con stringhe scritte a mano girano sotto `TZ=UTC`, `America/Los_Angeles` e `Europe/Rome`.
4. **Percorso con tastiera e screen reader (NVDA o VoiceOver)**, una persona: aprire, chiudere (Esc, X, fondo, Indietro), riaprire, chiudere l'alert, riga che esce dalla lista, paginazione verso la prima e l'ultima pagina, rimuovere il chip, "Azzera filtri". Il focus non finisce mai su `body`; un rifiuto nella Sheet si sente una volta; "Il contatto … non è più nell'elenco" solo quando è vero.
5. **Matrice dei permessi come OPERATORE e come ADMIN** (nessun verificatore ha visto i controlli solo-admin): "Cambia operatore", la riapertura vera dal dettaglio e dalla riga, il richiamo, la chiusura dell'alert, con i rifiuti del server che riportano i controlli al valore salvato e offrono il contatto attivo.
6. **Decidere su Sentry**: nomi dei clienti in `aria-label`/`altText` (correggere o accettare per iscritto) e testo cercato in URL e `Referer` verso Sentry (scrub o voce nel debito già accettato). Il testo cercato (CF, telefono) vive nell'URL e in `da`: presa d'atto.
7. **Decidere i dati di prova `zzpr3-` nel DB di sviluppo** (rimuoverli o lasciarli) e confermare che nessuno script con `NODE_ENV=production` è stato lanciato da agenti o da te.
8. **Pannello Animations di DevTools al 100% e al 10%** e **controllo su iPhone Safari** della barra della paginazione (altezza `100vh`): restano a una persona (T5.12 controllo 1, ipotesi di v12).
9. **Testo della guida per gli operatori (T5.11)** e **testo dell'annuncio (G4b)**: restano di Omar. Prima del deploy: G4a chiuso e G2 fatto.
10. **PR5b dopo PR5a**: PR5a non è ancora in `dev`; PR5b va riallineata (o aperta) dopo il merge di PR5a.

### Acceptance criteria check (case B)

| Criterio | Esito | Evidenza |
|---|---|---|
| AC1 | Met | v11, v12: voce tra Customers e Pratiche, attiva anche sul dettaglio |
| AC2, AC3 | **Parziale** | v6, v12 i dati; v8: dopo una riapertura il contatto superato torna come riga attiva (BLOCKER) |
| AC4, AC6, AC8 | Met | v6, v12 |
| AC5 | **Unmet al ritorno dal dettaglio** | v6: la colonna nascosta ricompare per 30 s; lettura dal server e chiave separata OK |
| AC7 | **Parziale** | v10: regola e marcatore giusti; il testo della data cade nell'idratazione con il server in UTC |
| AC9, AC40 | Met | v5, v4 (minor) |
| AC10–AC17, AC19–AC23 | Met con eccezioni | v7: filtri, ordine, pagina, chip, stati vuoti in browser; AC17/AC18: la ricerca in sospeso e l'anno a due cifre (MAJOR) |
| AC18 | **Parziale** | v7: parametri non validi ignorati; i controlli mostrano un filtro non applicato nei due casi sopra |
| AC24, AC28 | **Unmet in produzione** | v10: date del dettaglio un giorno prima nel fuso UTC del server |
| AC25 | Met, con il focus al ritorno **Parziale** | v8, v9: indirizzo e stato OK; Indietro e "Torna a Contatti" lasciano il focus su `body` |
| AC26, AC27 | Met | v8, v12 |
| AC29–AC34, AC36–AC47 | Met | v4: conferma, `replace`, `replacesAlertId`, priorità, "X", operatore; test fragili (MINOR) |
| AC35 | **Unmet** | v8 (lista vecchia dopo la riapertura, BLOCKER) e v4 (riapertura dopo la chiusura, MAJOR) |
| AC44 (D22) | Met | v10: il selettore coincide con `isDueOrOverdue` su 10 istanti e 5 fusi |
| AC48–AC51 | Met | v2: nessun client indovina permessi; operatori solo se `canReassign` |
| AC52 | **Unmet per tre controlli** | v4: priorità, "X" e operatore senza il link al contatto attivo; stato, richiamo e riga sì |
| AC53–AC57 | Met | v8: chat dopo il contatto, "Avvia una chat", note in sola lettura, "Carica altri messaggi" con `da` e `limit` (scrittura non provata) |
| AC62 | Met | v11: `seeContactsHref`, `stopPropagation` (non fissato da un test) |
| P6, P13, P17 | **Parziale** | v13: nessuna animazione nuova, ma scheletro nella chat sotto il dettaglio; v9: il focus finisce su `body` |

### Notes for docs-maintenance

- Tutti i BLOCKER e MAJOR sono aperti: nessuno è ancora durevole. Quelli che non verranno corretti prima del merge lo diventano.
- Probabilmente durevoli (nello stesso schema, da registrare nel debito se non corretti): la cache del router di Next che serve la lista vecchia dopo una scrittura (v6, v8); i formattatori di data che usano il fuso del processo nei Server Component e nei client renderizzati dal server; il Replay di Sentry che maschera solo `title` e `placeholder`; i test che dipendono dal fuso della macchina; i link `/dashboard/customers/${id}` senza codifica (v1); la barra sticky che copre il focus anche in Clienti e Pratiche (v12); i bordi dei primitivi sotto 3:1 e `hover` del `Badge` di priorità.
- Backlink dalle pagine di dominio: n/a finché PR5 non è conclusa.


## [Round: 2026-10-21] PR6 — "Clienti semplificata" (senza la migrazione di T6.9)

Round aggiunto: i round di PR1, PR2, PR3, PR4, PR5a e PR5b sopra restano come sono. Questo round copre solo PR6 (`434b047` → `6d6566d`, T6.1–T6.10). **Non copre la migrazione di T6.9**, che non è ancora scritta (aspetta i conteggi dello script in produzione) e avrà un round suo, e **non copre PR5b**, che Omar ha dichiarato SHIP il 2026-10-20 (PLAN.md, T6.7).

### Verdict

**DO NOT SHIP al primo giro** · impact: critical · 0 BLOCKER, 2 MAJOR, 16 MINOR, NIT elencati sotto. Otto passaggi su dieci sono SHIP; v2 e v5 tornano DO NOT SHIP, uno per un MAJOR.

Obiezione bloccante più forte (v2, confermata sul codice dall'orchestratore): il dialogo "Assegna Clienti" manda una chiamata per cliente quando i clienti sono 30 o meno (`splitArray(ids, ceil(n/30))` passa la dimensione del blocco, non il numero di blocchi), le lancia tutte insieme con `Promise.all`, Next.js continua a eseguire quelle in coda dopo un rifiuto, e il `catch` fa solo `console.error`. Quindi "il primo errore ferma il resto" (P19) vale solo sul server dentro una chiamata, non per l'admin: dopo un errore i clienti dei blocchi successivi sono assegnati e il dialogo non dice niente. Il codice del dialogo è precedente a PR6 (T6.3 ha cambiato solo i testi) e ogni cliente resta allineato al suo contatto, ma P19 e il rischio di §13 descrivono un esito che il dialogo non produce. **Omar ha deciso il 2026-10-21 di lasciarlo nel debito (opzione A): il dialogo non si tocca in PR6.** (F1). Si riprende se la misura di "Assegna Clienti" con 100 e 500 clienti sul DB di sviluppo mostra chiamate lente (vicino ai 60 s) o se in produzione compaiono errori.

L'altro MAJOR (v5, F2) è un buco del test dello script di sola lettura: i conteggi `b`, `c` e `a2_esportabili` valgono tutti 1 nella fixture, quindi scambiarli passa. Il SQL è giusto. Si corregge nel test.

### Coverage

- Passaggi eseguiti: 10/10. v1, v2, v3, v4 e v7 su Opus; v5, v6, v8, v9 e v10 su Sonnet. Il classificatore ha chiesto dieci charter, nessuna sovrapposizione; nessun override.
- Passaggi saltati o falliti: nessuno.
- Passaggio UI (v10): eseguito su `next dev` locale (porta 3100, DB di sviluppo) avviato dall'orchestratore, con una sessione di browser già autenticata come admin (`review-ui-pr6`) e Chromium 149 headless. Superfici: Clienti, il dialogo dell'assegnazione massiva, la scheda cliente. Il server è stato fermato a fine passaggio. Nessun passaggio di movimento (P6: nessun movimento nuovo).
- Limiti dichiarati dai verificatori: v10 non ha scritto dati (le 4 chiamate `task.createContact` hanno avuto risposta da mock; i 20 POST di preferenze li fa l'app al montaggio di Clienti), ha raggiunto i passaggi di caricamento e riepilogo del dialogo scrivendo lo stato React nella pagina, non con un invio vero, e non ha potuto provare "Crea contatto" e il passaggio del focus da capo a capo né il ruolo OPERATORE (nessuna sessione propria). v2 ha provato i lock su un Postgres 17 vero in un contenitore temporaneo (poi tolto); gli altri hanno usato PGlite. Nessuno ha toccato la produzione né eseguito script con `NODE_ENV=production`; lo script SQL non è stato eseguito fuori da PGlite.
- Gate: eseguiti dall'orchestratore in una copia pulita a `197833e` (lo stesso `src/` di `6d6566d`): lint, `tsc --noEmit`, `pnpm run test --run` (125 file, 1948 test, 5 saltati), `pnpm build`, `pnpm api:build`, `pnpm api:smoke`, tutti verdi. v8 ha rilanciato `tsc`: verde.
- Prove dei verificatori sul codice: v1 23 mutanti (tutti presi); v4 sonde riga per riga contro la base e misure di `closedCalls` prima e dopo; v6 un confronto con un riferimento in JavaScript su 63 casi e 37 mutanti; v9 23 mutanti e una sonda sul ciclo di riscrittura dell'URL; v7 504 chiamate con il testo SQL osservato.

### Findings

| # | Severity | Da | Dove | Problema | Correzione / evidenza | Stato |
|---|----------|----|------|----------|-----------------------|-------|
| F1 | MAJOR | v2 | `CustomerBulkDialog.tsx:164-165,189-198`, `_actions/customerBulkUpdate.ts:53-58` | "Il primo errore ferma il resto" (P19) non vale per l'admin: il dialogo manda un blocco da `ceil(n/30)` clienti (una chiamata per cliente fino a 30), le lancia tutte con `Promise.all`, Next continua la coda dopo un rifiuto, il `catch` fa solo `console.error` e il form ricompare senza messaggio. Con Indietro durante l'invio i blocchi restanti si perdono in silenzio. Sonda jsdom: chiamate `[c-1],[c-2],[c-3]`, la seconda rifiutata, nessun "Clienti assegnati", nessun `role=alert`. | Blocchi di dimensione fissa inviati uno alla volta con `await` che si fermano al primo rifiuto; l'azione restituisce `{done, failedAt}`; messaggio "X di N clienti assegnati; si è fermata a …; riprova"; un test del dialogo con un blocco rifiutato. Vale anche per "Crea/assegna contatti" (stesso dialogo). | **Accettato da Omar (2026-10-21): resta nel debito**. Si riprende se la misura di "Assegna Clienti" con 100 e 500 clienti sul DB di sviluppo mostra chiamate lente (vicino ai 60 s) o se in produzione compaiono errori. |
| F2 | MAJOR | v5 | `_test/operatorMismatch.db.test.ts:123-130` | Nel caso misto `b`, `c` e `a2_esportabili` valgono 1: sette mutanti che li scambiano o li uguagliano passano 5/5. `b > 0` e `a2_esportabili > 0` sono le due condizioni di stop del gate. | Numeri diversi per categoria nella fixture (per esempio 2 `b`, 3 `c`, 1 `a2_esportabili`) | Aperto |
| F3 | MINOR | v5 | `operatorMismatch.db.test.ts`, SELECT 2, 4, 5, 6 | `is_active` non è fissato nelle liste: i mutanti che lo tolgono sopravvivono, nessuna riga inattiva può arrivare a quelle liste | Una riga inattiva per lista | Aperto |
| F4 | MINOR | v5 | `contatti-operator-mismatch.sql` (CTE e liste 4 e 6) | `state` NULL non ha una fixture: `state IS DISTINCT FROM 'nessuno'` sopravvive (errore per eccesso: falso stop) | Un contatto attivo con `state` NULL e `closed_at` valorizzato, atteso non esportabile | Aperto |
| F5 | MINOR | v5 | intestazione di `contatti-operator-mismatch.sql` (righe 6-38) | La regola di stop per `b` e `a2_esportabili` sta solo nei commenti dei singoli SELECT, non sul blocco dei conteggi; `c` non è detta informativa; l'intestazione chiama "(a2)" il sottoinsieme esportabile mentre la colonna `a2` è l'insieme intero; non dice chi decide né i due esiti | Una riga per conteggio sul blocco dei conteggi; rinominare "(a2)" in "(a2 esportabili)" | Aperto |
| F6 | MINOR | v2 | `brain/tech-debt/crm/sezione-contatti.md:249-258` | La voce "Assegna Clienti su molti clienti" è sbagliata in due versi: il dialogo spezza già la selezione (a 500 per pagina, al più 17 clienti a chiamata, circa 3,5 s alla stima di 0,2 s, ben sotto `maxDuration = 60`), e "il resto no" è falso a livello di dialogo (F1) | Riscrivere la voce | Aperto |
| F7 | MINOR | v3 | `_test/bulkUpdateCustomers.db.test.ts:540-545`, `PUT/index.ts:74` | Il test dell'OPERATORE asserisce solo `FORBIDDEN`, che ora esce anche dal controllo nel servizio: `adminProcedure` → `operatorProcedure` passa 133 test, e un operatore potrebbe saggiare se un cliente o un operatore esistono (nessuna scrittura) | Asserire `message: "admin-only"` o aggiungere la chiamata con lista vuota | Aperto |
| F8 | MINOR | v3 | `CustomerCreateContact.tsx:97-101` | La regola di visibilità di "Crea contatto" non ha test: sostituire `!canCreateContact(...)` con `false` lascia 16 test verdi (il test del componente fissa l'attore su ADMIN). Il server rifiuta comunque. | Due casi: un OPERATORE non del cliente non vede il pulsante; l'operatore del cliente sì | Aperto |
| F9 | MINOR | v4 | `_test/bulkUpdateCustomers.db.test.ts:337-366` | Il test di "i contatti non attivi restano" non distingue "muovi il contatto attivo" da "muovi la task più recente": la task inattiva è creata prima dell'attiva. Con la regola vecchia rimessa passano 98 test (sui dati veri la task inattiva è spesso la più recente). Lo stesso vale per il passaggio di consegne. | Creare la task inattiva dopo l'attiva e asserire `taskId: active.id` nella riga del contatto, anche per il passaggio di consegne | Aperto |
| F10 | MINOR | v6 | `GET/index.ts:292-293`, `_test/getAllCustomers.db.test.ts` | "NULL in fondo" non è fissato in ordine decrescente: togliere la chiave `IS NULL` lascia 23 test verdi | Un caso con un cognome NULL, `sortedBy: "desc"`, riga NULL ultima e gruppo ordinato per id decrescente | Aperto |
| F11 | MINOR | v6 | `getAllCustomers.db.test.ts:304-336`, `GET/index.ts:266-267` | L'ordine per `signedPractices` non è fissato: sostituirlo con `customers.id` passa 23/23, perché nella fixture l'ordine per id coincide | Creare per primo il cliente con 3 pratiche | Aperto |
| F12 | MINOR | v8 | `PLAN.md:164`, `:3322`, `:3622` | A17 nomina una sola procedura mancante sul backend vecchio (`task.getContactById`); il confronto dei router con `origin/main` ne trova tre (`task.getContacts`, `task.getContactById`, `user.updateContactTableVisibleColumns`); il ripiego "rilasciare insieme e provare la scheda" non è nel passo 2 di T6.7 né nella riga di §13. Conta solo se `BACKEND_URL` è attiva in produzione (oggi solo staging, `migrazione-gcp.md:185`) | Nominare le tre procedure e portare il ripiego nel passo 2 e in §13 | Aperto |
| F13 | MINOR | v8 | `PLAN.md:3323` | Il passo 3 ("prima il deploy, poi la migrazione") non richiede che Cloud Run giri sulla revisione nuova: con `BACKEND_URL` attiva il `bulkUpdateCustomers` vecchio rimetterebbe in disaccordo le coppie appena riallineate. Il deploy su Cloud Run è manuale | Aggiungere "Cloud Run sulla revisione nuova" alle precondizioni del passo 3 quando `BACKEND_URL` è attiva | Aperto |
| F14 | MINOR | v9 | `CustomerTableSection.tsx:80-82`, `CustomersTable.tsx:117` | Nessun test usa `order_by=name,priority&sorted_by=asc,desc`: tre mutanti sopravvivono (`split(",")`, `.some`/`.every`). L'interfaccia non produce quel link; il codice di oggi lo gestisce | Un caso per ciascuno dei due file di test | Aperto |
| F15 | MINOR | v9 | `CustomerCreateContact.tsx:34-35` | La guardia "sposta il focus solo se è perso" non ha test: toglierla lascia verdi i 3 test del componente | Un test che sposta il focus su un altro controllo prima della risposta e verifica che `activeElement` non cambi | Aperto |
| F16 | MINOR | v10 | `CustomerBulkDialog.tsx:461` (`ModeChoice`, `max-w-xl`), `ui/dialog.tsx` | Il passo di scelta della modalità, sotto 640 px di larghezza e fra 458 e 558 px di altezza, è più alto di prima per la nota di export di AC75 (+100 px) e taglia: a 320×520 il riquadro va da y −19 a 539 e la X sta a y −2. Misura: 558 px a 320 di larghezza, 518 a 360 e 375 (entra). Nessun `max-h` né scorrimento. Gli operatori usano il desktop | `max-h-[calc(100dvh-2rem)] overflow-y-auto` su `DialogContent` | Aperto |
| F17 | MINOR | v10 | `components/custom/table/TableHeaders.tsx:26` (file non toccato da PR6) | "Aggiornato", l'ordinamento di default di AC59, si vede solo per `text-blue-500` (3,68:1 su bianco, serve 4,5:1) e una freccia senza nome; `th` senza `aria-sort`. Preesistente, ma ora è lo stato iniziale di ogni apertura di Clienti | `text-blue-600`, `aria-sort`, `aria-hidden` sulla freccia | Preesistente: debito |
| F18 | MINOR | v10 | `CustomerColumns.tsx:111-125` (non toccato) | Il checkbox di riga risponde in 16×16 su un involucro di 48×48 (11% dell'area): il resto assorbe il clic con `stopPropagation` ma la riga mostra puntatore e hover. Preesistente | Un `<label>` sull'involucro, o il padding sul checkbox | Preesistente: debito |

NIT (nessuno blocca; ognuno è del verificatore indicato):
- v1: lo scrittore aggiunto in futuro è controllato solo se qualcuno ne aggiunge la chiamata nel test (D27 lo accetta); due varianti (coppia già disallineata, ramo "alert non confermato" di `bulkHandleTask`) non girano nel test della regola ma sono provate in altri file.
- v2: `customerIds` della procedura senza `.max()` (una chiamata diretta è senza limite; 9.000 clienti per chiamata superano i 60 s).
- v3: in `assignCustomers` `canReassign` viene dopo `findWorkingOperator` e il lock (non raggiungibile dalla procedura); `operatorId: z.number()` senza `.int()` (preesistente: 1.5 dà un 500 per l'admin).
- v4: titolo del test `bulkUpdateCustomers.db.test.ts:49` ancora sulla regola vecchia; i casi con più clienti controllano allineamento e conteggio ma non il contenuto delle righe.
- v5: le colonne delle liste 4, 5 e 6 diverse da `contatto_id` non sono asserite; l'intestazione non dice che "esportabile" ignora l'intervallo di `closedCalls`.
- v6: la mappatura colonna → campo degli ordinamenti espliciti è fissata solo per quattro colonne; la chiave `IS NULL` su `signedPractices` è morta e fa valutare la sottoquery due volte (173 ms contro 24–40 ms a 30.000 clienti).
- v7: nulla impedisce a `src/app/**` di importare `@/test/operatorRule` (nessun rischio: il DDL gira solo su PGlite); manca un test con un nome di colonna "da iniezione" (`1=1) OR (1:eq:x`) su `CustomerTableSection`.
- v8: A17, P18 e il finding 41 danno un solo motivo per rilasciare prima il frontend dove una sonda ne trova tre (mancano `tasks`/`priority`; un link salvato con `state` dà `column "state" does not exist`; la scheda vecchia chiama la `getActiveAlerts` tolta).
- v9: il titolo del test di AC65 dice più di quello che asserisce; i parametri rimossi restano nell'URL (ignorati); in `PopoverFilter` un operatore sconosciuto con colonna nota passa al server (è l'esposizione A15, già assegnata alla sua review).
- v10: il nome dell'operatore del riepilogo ha lo spazio finale (`getOperatorName` non fa il `trim`; 3 operatori su 22 lo hanno) e la virgola nuova lo mette prima della virgola; `PriorityBadge` ripete il testo con un'icona senza `aria-hidden`.

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — stesso operatore e un solo contatto attivo | Scrittori trovati con `grep` su `.update/.insert` di `task` e `customers` (src e api), non da un elenco; da una coppia allineata ognuno la lascia allineata. 23 mutanti, tutti presi dal test della regola, per lo più dal trigger a COMMIT dentro le transazioni dei servizi. Il secondo contatto attivo resta bloccato dall'indice univoco e da `replaceActiveContact`. "Assegna Clienti" non crea contatti e non tocca stato, priorità né alert. "Crea/assegna contatti": codice e test uguali alla base. |
| v2 — transazioni e concorrenza | Ordine dei lock (cliente, poi task) uguale in tutti gli scrittori; i tipi lo impongono (`lockActiveContact` vuole un `LockedCustomer`). Su un Postgres 17 vero: coda dietro un contatto sostituito, riapertura e chiusura, due "Assegna" in ordine opposto su 6 clienti, "Assegna" contro `bulkHandleTask`, due "Assegna a te" più un "Assegna": nessun deadlock, un solo contatto attivo, tutto allineato. Una transazione per cliente con `concurrency: 1`; un mutante con concorrenza illimitata è preso. `moveCustomerAndContact` fuori da una transazione non compila. |
| v3 — autorizzazione | Mutanti che tolgono o indeboliscono `canReassign`, `findWorkingOperator`, `canSelfAssign`, `canHandover`, `canCreateContact`: tutti presi. A16 non dà diritti di modifica oltre D2/AC50. `task.getContactById` non espone niente di più del dettaglio di Contatti, che ogni operatore apre. |
| v4 — log e conti dell'export | "Assegna Clienti" su 8 scenari scrive esattamente 13 righe `bulk` (la base ne scriveva 6, solo del cliente); `task_id` NULL sul cliente; `from` giusto anche NULL; nulla se non si muove niente; stessa transazione (failpoint). Passaggio di consegne uguale alla base in 5 varianti. L'export (`calls.ts` invariato) cambia solo come dicono AC75 e A16: l'admin passa da 10 a 11 righe (il contatto che non aveva operatore), per operatore A 9→4, B 0→7, C 1→0. |
| v5 — script di sola lettura | Solo SELECT, nessuna funzione con effetti, nessun lock che blocchi scrittori; nomi veri; categorie e "esportabile" uguali a D26, AC75, PLAN e `closedCalls` (prova differenziale su una griglia di 108 contatti: gli stessi 7 id entrano nell'export dopo il riallineamento). |
| v6 — query di `getAllCustomers` | Ordine di default, pareggio sull'id nella stessa direzione, NULL in fondo, pagine esatte e totale sullo stesso `where` senza duplicazioni: 63 casi contro un riferimento in JavaScript e 37 mutanti; il join con `operator` è su chiave primaria, `signedPractices` è esatto. |
| v7 — input verso l'SQL | I `sql.raw` attivi nel file passano da tre a uno (`GET/index.ts:354`), in un solo `where` per pagina e totale; `status` e `sqlTaskFilter` tolti; `orderBy` solo da uno `switch` chiuso (13 valori ostili, tutti sul default); la colonna di un link salvato è limitata alla mappa. Nessuna esposizione nuova né allargata. |
| v8 — contratto tRPC e gate | Nessun chiamante resta delle procedure tolte o cambiate; `tsc` pulito; regole del server rispettate; l'ordine "prima il frontend" è giusto in tutte e due le direzioni. |
| v9 — client non visivo | AC60 provato con un router con stato (nessun ciclo, un `push`, URL riscritto); elenco delle colonne ammesse su 8 colonne; Pratiche non regredisce (il test di `PopoverFilter` fallisce 7 su 8 sulla base); AC64–AC68. |
| v10 — passaggio UI | AC58, AC59, AC60, AC63, AC64, AC65, AC66, AC67, AC68 e i testi di AC75 osservati in Chromium su dati veri; colonne tolte; barra dei filtri senza Stato; link salvato con parametri tolti; carte della modalità fra 280 e 1440 px; riepilogo a 2 e 4 colonne; "Gestisci contatto" 138×36, anello a 2 px, contrasto 19,8; messaggi di "Crea contatto" (con risposte simulate). |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Stesso operatore e un solo contatto attivo | SHIP | Nessun scrittore lascia coppie separate; due NIT sulla copertura futura |
| v2 | Transazioni, lock e concorrenza | DO NOT SHIP | Il server regge; MAJOR F1 sul dialogo (il primo errore non ferma il resto e non si vede), voce di debito sbagliata |
| v3 | Autorizzazione | SHIP | Due MINOR di test (F7, F8); i controlli sono solidi |
| v4 | Log e conti dell'export | SHIP | Un MINOR di test (F9): la regola vecchia tornerebbe inosservata |
| v5 | Script SQL di sola lettura | DO NOT SHIP | SQL giusto; MAJOR F2 sul test dei conteggi, più tre MINOR di test e intestazione |
| v6 | Query di `getAllCustomers` | SHIP | Due MINOR di test (F10, F11); il codice è corretto |
| v7 | Input verso l'SQL | SHIP | Nessuna esposizione nuova; due NIT |
| v8 | Contratto tRPC e gate | SHIP | Due MINOR sul PLAN (F12, F13), che contano solo con `BACKEND_URL` attiva |
| v9 | Client non visivo | SHIP | Due MINOR di test (F14, F15) |
| v10 | Passaggio UI | SHIP | Un MINOR causato da PR6 (F16, dialogo che taglia su schermi stretti e bassi) e due preesistenti (F17, F18) |

### Human Review Checklist

`reviewImpact: critical`. Passi, nell'ordine:
1. **F1** (dialogo "Assegna Clienti"): deciso da Omar il 2026-10-21, resta nel debito (blocchi fissi in sequenza che si fermano al primo errore, messaggio all'admin e `.max()` sull'input sono il lavoro da fare se la misura con 100 e 500 clienti mostra chiamate lente o se in produzione compaiono errori). Vale anche per "Crea/assegna contatti".
2. **Script di produzione, una persona (Omar):** lanciare `contatti-operator-mismatch.sql` in sola lettura sul DB di produzione e passare i conteggi (a), (a2), (a2 esportabili), (b), (c). Se (b) o (a2 esportabili) sono maggiori di zero decide Omar per iscritto, nel log di T6.7. Poi si scrive la migrazione di T6.9 e il suo round di review.
3. **CI verde sulla PR verso `dev`** e gate in una copia pulita senza `.env*`, dopo la migrazione: `SKIP_ENV_VALIDATION=true pnpm exec next lint`, `pnpm exec tsc --noEmit`, `pnpm run test --run`, `pnpm build` con i segnaposto, `pnpm api:build`, `pnpm api:smoke`.
4. **`BACKEND_URL` in produzione:** controllare il valore nel progetto Vercel di produzione. Se è attiva: prima il frontend e poi il backend (A17), con il ripiego "rilasciare insieme e provare la scheda" (F12), e Cloud Run sulla revisione nuova prima della migrazione di T6.9 (F13).
5. **A3, una persona:** `EXPLAIN ANALYZE` della prima pagina di Clienti su volumi reali (≤ 500 ms), e la misura di "Assegna Clienti" con 100 e 500 clienti sul DB di sviluppo.
6. **Passata a mano con un ruolo OPERATORE** (nessun verificatore l'ha fatta): "Crea contatto" per l'operatore del cliente, Clienti senza colonna di selezione, "Gestisci contatto" e il ritorno alla lista; e un clic vero su "Crea contatto" e "Passaggio di consegne" sul DB di sviluppo (v10 ha usato risposte simulate).
7. **Testi del dialogo (T6.3) e dell'annuncio:** li rivede Omar al gate.
8. **Nessuno script con `NODE_ENV=production`** lanciato da agenti, e nessun `db:migrate:prod` fuori dalla sessione di rilascio, che è di Omar.

### Acceptance criteria check (case B)

| Criterio | Esito | Evidenza |
|---|---|---|
| AC58 | Met | v10: intestazioni, righe e menu Colonne senza le tre colonne né il selettore di stato |
| AC59 | Met | v10, v6: nessun filtro Stato; ordinamento di default `updatedAt` decrescente; query provata su 63 casi |
| AC60 | Met | v9, v10, v7: link salvato con parametri tolti si apre ignorandoli, un solo `push`, nessun ciclo |
| AC61 | Met | v6: pagine esatte e totale sullo stesso `where` (F10, F11 sono buchi di test) |
| AC63 | Met | v1, v10: etichette nuove; i quattro casi non cambiano (codice e test uguali alla base) |
| AC64, AC65 | Met | v9, v10, v3: riepilogo in sola lettura con "Gestisci contatto"; nessun controllo di stato, priorità o alert |
| AC66 | Met | v3, v9, v10: visibilità e controllo del server; il test di visibilità manca (F8) |
| AC67 | Met | v9, v10: "Cliente non assegnato" e "Questo cliente ha già un contatto attivo" |
| AC68 | Met | v9: nessuna modifica alle note |
| AC71 | Met | v1, v2: indice univoco, `replaceActiveContact`, 5 interleaving su Postgres vero |
| AC72 | Met | v1, v4: percorsi non toccati, codice e test uguali alla base |
| AC75 | **Met nel codice; non nel dialogo (F1); la parte di migrazione non è in questo round** | v1, v4: cliente e contatto attivo insieme, righe `bulk`, export come previsto; v2: dopo un errore il dialogo non lo dice e i blocchi successivi proseguono; il test dei contatti non attivi è debole (F9) |

### Notes for docs-maintenance

- Da correggere o accettare prima del merge: F2 (corretto) e F1 (accettato da Omar come debito, 2026-10-21). I MINOR di test (F3–F11, F14, F15) e di documentazione (F5, F6, F12, F13) si correggono in PR6 o vanno nel debito.
- Probabilmente durevoli in ogni caso: F17 e F18 (preesistenti, file non toccati) e i NIT che nessuno corregge.
- Il debito aperto da PR6 sul dialogo (F1, F6) va nella voce "Assegna Clienti su molti clienti" di `brain/tech-debt/crm/sezione-contatti.md`.
- Backlink dalle pagine di dominio: n/a finché la spec non è conclusa.

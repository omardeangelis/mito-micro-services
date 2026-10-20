---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/sezione-contatti/IMPLEMENTATION-NOTES]]"
created: 2026-09-25
updated: 2026-10-20
---

# Tech debt: Sezione Contatti

## Le migrazioni non ricostruiscono lo schema di produzione

Scoperto in T1.1–T1.2 (PR1), preesistente.

- `20240926195125_lucky_roughhouse` usa il tipo `task_status`, che nasce solo in `20260619152227_same_hemingway`: su un Postgres vuoto la prima migrazione fallisce.
- `alert.is_resolved` (`boolean DEFAULT false NOT NULL`) è negli snapshot da `20260615235953_brown_madelyne_pryor` ma in nessun file SQL. In prod c'è perché è arrivato con `db:push`; `db:generate` non lo emetterà mai.

**Effetto oggi:** nessuno in prod. Un DB nuovo creato con `pnpm db:migrate` (sviluppo, preview) non parte o non ha la colonna.

**Contromisura attuale:** l'harness di test (`src/test/db.ts`, `PUSHED_SCHEMA`) applica i due pezzi dove prod li ha ricevuti.

**Contromisura estesa in PR7 (T7.1, T7.1b, D24, 2026-10-18):** i due pezzi di `PUSHED_SCHEMA` diventano un modulo condiviso (`src/server/db/pushedSchema.ts`) e il database locale in Docker costruisce lo schema con gli stessi pezzi. Non risolve il difetto: chi lancia `pnpm db:migrate` su un database nuovo (sviluppo, preview) trova ancora la prima migrazione che fallisce.

**Da fare fuori da questa spec:** una migrazione additiva e idempotente (`ADD COLUMN IF NOT EXISTS "is_resolved"`) e, per il tipo, una nota nel README o una migrazione "baseline". Poi `PUSHED_SCHEMA` si riduce di conseguenza.

## Nessun test esercita il lock del cliente

**Livello 1 fatto il 2026-10-15 (PR3, T3.15).** `src/test/lockRule.ts` (`assertCustomerLockedOnWrite`) controlla, con un trigger di test, che ogni scrittura su task, alert e log di un cliente avvenga in una transazione che ha già bloccato il cliente (`xmax` della riga uguale alla transazione corrente). 19 scrittori coperti; senza `.for("update")` diventano tutti rossi. Resta il livello 2, due transazioni vere sullo stesso cliente su un Postgres vero: PR7.

Scoperto nella review di PR1 (F5), accettato dal piano (D4) ma non dichiarato.

- PGlite ha una sola connessione: due transazioni non possono correre insieme, quindi `lockCustomer` (`SELECT … FOR UPDATE`) non si può mettere alla prova. Togliendo `.for("update")` da `src/server/effect/db.ts` tutti i test restano verdi.
- AC71 in concorrenza (cron, massiva e `createTask` sullo stesso cliente) si regge solo sulla lettura del codice: `lockCustomer` è il primo comando di ogni `transaction` che scrive un contatto, e `replaceActiveContact` accetta solo un `LockedCustomer`, che produce solo `lockCustomer`. Che il lock sia della stessa transazione è una regola controllata in review: il tipo non lo impone.

**Effetto oggi:** una regressione sul lock passerebbe la CI. Dopo PR2 l'indice unico la farebbe emergere in prod come errore 23505, non come dato sporco.

**Da fare fuori da questa spec:** un test di concorrenza su un Postgres vero (per esempio un servizio `postgres` nel job Test di `ci.yml`), con due transazioni sullo stesso cliente.

## "Assegna Clienti" sceglie la task più recente anche se inattiva

Scoperto nella review di PR1 (F1, seconda verifica), preesistente.

- `customer.bulkUpdateCustomers` prende, per ogni cliente, la task con `updated_at` più recente fra tutte, attive o no, e la riassegna solo se è `chiamare`.
- Dopo un followup del cron la più recente è la vecchia task, ora inattiva: il nuovo contatto attivo non cambia operatore. Lo stesso dopo il caso 3 della massiva (esito senza alert). Succedeva già nella base.

**Effetto oggi:** il cliente passa al nuovo operatore, il suo contatto attivo no. La guardia sul `WHERE` indefinito (PR1) evita solo che l'update tocchi tutta la tabella. In prod l'update su tutta la tabella è successo il 28/09/2026: tutte le task a un solo operatore. Il riallineamento all'operatore del cliente è in PR2 (T2.5) ([[specs/crm/sezione-contatti/PLAN]], §9, PR2); questa logica poi lo fa divergere di nuovo.

**Da fare fuori da questa spec:** A7 lascia la logica invariata (non-goal). Un seguito può riassegnare la task attiva del cliente, con un criterio di spareggio.

**Chiusa il 2026-10-20 (PR6, T6.8a).** "Assegna Clienti" non sceglie più per recenza: `assignCustomers` blocca il cliente e sposta il suo contatto attivo in ogni stato, con le righe `operator_reassign`. Il testo che segue è la storia.

**Rientra nella spec dal 2026-10-15 (D14, AC75):** in PR6 T6.8 "Assegna Clienti" sposta il contatto attivo del cliente in ogni stato, con il servizio `handover`. Il 2026-10-15 in prod i contatti attivi con un operatore diverso da quello del cliente erano 1 su 69.783 (sola lettura). Si chiude con T6.8.

## Casi limite di `transaction` con le interruzioni

Scoperto nella review di PR1 (F9, F10).

- Una query interrotta (per esempio da un timeout) che poi fallisce non accende `tx.failed`: il COMMIT della transazione abortita diventa un rollback silenzioso e l'esito dice "successo".
- Se si interrompe la fiber del chiamante, l'esito dice "interrotto" ma la transazione fa commit: `forEachIsolated` conterebbe come fallito un alert già scritto.

**Effetto oggi:** nessuno. Il docstring di `transaction` vieta timeout e interruzioni dentro, e nessun bordo interrompe.

**Da fare fuori da questa spec:** registrare il fallimento sulla promise della query; propagare l'interruzione al programma interno, oppure tenere il divieto.

## Alert risolti due volte e `alert_id` azzerato senza condizione nella massiva

**Chiusa il 2026-10-15 (PR3).** `resolveAlerts` e `createAlert` non ci sono più (T3.13). Ogni scrittore di alert blocca il cliente prima di leggere task e alert: `resolveAlert` e `setCallback` passano da `resolveOpenAlert`, con la guardia `is_resolved = false` (T3.5b, T3.6), il cron ha la sua guardia, la massiva legge `alert_id` dopo il lock. La regola è provata da T3.15. Resta solo una differenza di forma, in "Scrittori fuori dalla regola dei lock".

Scoperto nella review di PR1 (F14, R7), preesistente.

- `resolveAlerts`, e l'update dell'alert nella massiva, non hanno né la guardia `is_resolved = false` né il lock del cliente. Accanto al cron o alla massiva un alert può essere risolto due volte: `resolved_by` sovrascritto e un secondo `alert_resolved` nel log.
- La massiva (caso "alert confermato") azzera `alert_id` della task senza la condizione `alert_id = A` che il cron ha da PR1 (F13): se `createAlert` aggancia un nuovo alert fra la lettura e l'update, il nuovo resta aperto e scollegato.

**Effetto oggi:** raro, serve una scrittura concorrente sullo stesso cliente.

**Da fare:** PR3 (guardia e servizi con `lockCustomer`, T3.2).

## Ordine e pareggi nella massiva senza test

**Chiusa il 2026-10-15 (PR3, T3.8c)** per i test: casi 3 e 4 con lo stesso stato o lo stesso operatore, senza le righe di log di ciò che non cambia. I pareggi su `updated_at` riguardavano solo i duplicati legacy, che PR2 ha eliminato (indice unico sul contatto attivo).

Scoperto nella review di PR1 (F16, F17).

- Con due task attive e lo stesso `updated_at`, la scelta cambia rispetto alla base: la base ordinava in JS al millisecondo e a parità seguiva l'ordine fisico; ora l'ordine è in SQL al microsecondo, poi `id DESC`. Succede solo con duplicati legacy.
- Nessun test fissa l'ordine per `updated_at` né i pareggi; mancano i casi 3 e 4 con lo stesso stato o lo stesso operatore, dove le righe di log non si scrivono.

**Effetto oggi:** solo sui duplicati che PR2 elimina.

**Da fare:** una query di sola lettura su prod (clienti con almeno 2 task attive nello stesso millisecondo) prima di PR2; i test mancanti in PR3.

## I workflow dei cron chiamavano indirizzi che non risultano del team

Preesistente. Il problema dei workflow di sviluppo è F18 della review di PR1; l'indirizzo di quelli di prod è venuto fuori controllando gli alias di Vercel (estratti dei comandi del 2026-10-09 in IMPLEMENTATION-NOTES). Si corregge con `chore/cron-indirizzo` (2026-10-09), quando arriva su `dev` e poi su `main`.

- **Prima:** i workflow di sviluppo, come `update-alert.yml`, eseguivano gli script `:dev`, che chiamano `localhost:3000` dal runner di GitHub: fallirebbero sempre. Nessuno degli 8 workflow dei cron risulta mai eseguito (`gh run list`, 0 run, 2026-10-09). Quelli di prod chiamavano `mito-deutsche.vercel.app`, che non risulta fra gli alias del team Vercel: chi lo serva non è verificato.
- **Ora:** ogni workflow dei cron chiama l'app in `CRON_BASE_URL`:

  - quelli di prod `https://crm.dbmito.it`, con `CRON_SECRET_KEY`;
  - quelli di sviluppo chiameranno lo staging, `https://staging-crm.dbmito.it`, con `STAGING_CRON_SECRET_KEY` e il bypass della protezione di Vercel, quando lo staging ci sarà (vedi **Resta**).

  Fuori da GitHub Actions gli script `:dev` chiamano solo il server locale.

**Resta:**

- Oggi un lancio dei workflow di prod fallirebbe: su GitHub manca `CRON_SECRET_KEY` (`gh secret list`, 2026-10-09), e gli script si fermano con "Missing CRON_SECRET_KEY" prima di chiamare l'app. Il secret si crea al passo 8 del runbook G2.
- I workflow di sviluppo funzionano solo con lo staging attivo e i suoi segreti su GitHub. La checklist è in `brain/chore/staging-vercel.md`, che arriva con `chore/staging-vercel`. Senza `STAGING_CRON_SECRET_KEY` lo script si ferma prima di chiamare. Senza `VERCEL_AUTOMATION_BYPASS_SECRET` chiama lo staging, e se il progetto protegge le sue deployment la protezione lo respinge e il job diventa rosso. Che il progetto dello staging le protegga tutte lo controllerà `deploy-staging.yaml`, che arriva con lo stesso branch.

## `CRON_SECRET_KEY` è un secret del repository

Scoperto nella review di `chore/cron-indirizzo` (2026-10-09, v4 sul runbook G2).

- Un secret del repository arriva a ogni workflow lanciato da qualunque ref: `gh workflow run --ref <branch o tag>` esegue i workflow e gli script di quel ref. Un ref con gli script di prima di `chore/cron-indirizzo` firma un token con il segreto di prod e lo manda a `mito-deutsche.vercel.app`.
- Il runbook G2 toglie quei ref prima di creare il secret (passi 1, 3 e 8). Ma un branch cancellato può tornare: con "Restore branch" su una PR chiusa, o con un `git push` da una copia locale che lo traccia ancora.

**Effetto oggi:** nessuno, il secret non c'è ancora. Dal passo 8 di G2 dipende dal fatto che nessun ref vecchio torni sul remoto.

**Da fare:** `CRON_SECRET_KEY` come secret di un environment GitHub limitato a `main`, con `environment:` sui 4 job di prod, al posto del secret del repository.

## Test mancanti sull'infrastruttura Effect

**Chiusa il 2026-10-15 (PR3, T3.16).** COMMIT fallito → `DbError` (`failAtCommit`), interruzione dentro il programma → rollback, `runTrpc` che non scrive su `console.error` per un errore tradotto. L'atomicità di `createTask` cade con la procedura (T3.13); quella delle mutation nuove è nei loro test. `runTrpc` non usa `ErrorReporter` in nessun ramo.

Scoperto nella review di PR1 (F11). La parte sul cron è coperta da PR1.

- Un COMMIT fallito che diventa `DbError`.
- Un'interruzione che fa rollback.
- L'atomicità di `createTask` dall'inizio alla fine, con un fallimento sul log.
- `runTrpc` che non segnala a `ErrorReporter` e non logga i `BAD_REQUEST`.

**Effetto oggi:** i comportamenti ci sono, ma una regressione passerebbe la CI.

**Da fare:** con PR3, che aggiunge servizi sulla stessa infrastruttura.

## Il cron alert quando la connessione al DB cade

Scoperto nello smoke di PR1 sul DB di sviluppo (2026-09-25), preesistente.

- **`postgres.js` 3.4.4 lancia un'eccezione non gestita** (`TypeError: Cannot redefine property: query`, `connection.js:403`) quando la connessione cade con `ECONNRESET`. In sviluppo Next.js l'ha solo loggata; su Vercel un'eccezione non gestita può chiudere l'invocazione. Stessa versione su `dev`.
- **Una query su una connessione morta resta appesa** finché il sistema operativo non rinuncia: nello smoke, 8 blocchi di circa 16 minuti, ciascuno finito con `ECONNRESET`. Il client non ha un timeout per query. Su Vercel una query appesa consuma i 60 s e la chiamata finisce con un 504: gli alert già chiusi restano chiusi, `alert.js` ripete la chiamata dopo 10 s e quella prende gli altri.
- **Un alert può risultare fallito anche se è stato scritto:** se la connessione cade dopo il COMMIT ma prima della risposta (alert 4100 nello smoke). È innocuo: alla chiamata successiva è già risolto e non compare più.
- **Un alert che fallisce sempre viene segnalato a ogni chiamata** della stessa esecuzione, non una volta per esecuzione (con il batch di PR1 le chiamate possono essere più di una; con T2.7 c'è al massimo un nuovo tentativo senza progressi). Dopo la pulizia di PR2 non ce ne sono: gli unici erano gli alert su task senza cliente (F6), e nessun percorso ne crea di nuovi (nota di PR2 nel PLAN).
- ~~**Un alert fallito nell'ultima chiamata resta aperto fino all'esecuzione successiva.**~~ Risolto in PR2 (T2.7): `alert.js` richiama dopo 10 s finché un nuovo tentativo chiude qualche alert.

**Effetto oggi:** nessun dato rotto; il job diventa rosso.

**Da fare fuori da questa spec:** aggiornare `postgres` e verificare l'eccezione; valutare un timeout lato client.

## Il taglio delle date del cron dipende dal fuso del server

**Risolto il 2026-10-13**, insieme a "Il cron non riconosce gli alert di oggi in ora legale": il limite è il giorno italiano di `now`, passato come `YYYY-MM-DD`, e la query taglia la scadenza con `AT TIME ZONE 'Europe/Rome'`. Non dipende più dal fuso del processo né da quello della sessione del DB. Provato in sola lettura sul DB di sviluppo, con `drizzle` e `postgres.js` come nell'app e il processo in `Europe/Rome`, `UTC`, `America/New_York` e `Asia/Tokyo`: le stesse 34 righe della query di prima. In quella prova nemmeno il limite nel formato di prima (`'YYYY-MM-DD 00:00:00'`) è stato convertito: la conversione descritta qui sotto non si è ripetuta.

Scoperto nello smoke di PR1, preesistente (uguale nella base).

- Il cron passa il limite `'YYYY-MM-DD 00:00:00'` come parametro: `postgres.js` lo converte con `new Date(...)` nel fuso del processo. Su un server in `Europe/Rome` diventa `…T22:00:00.000Z` del giorno prima, e il DB lo legge come la data del giorno prima: gli alert di oggi restano fuori.
- Su Vercel (UTC) il limite è giusto. Lo smoke è stato fatto con il server di sviluppo in `TZ=UTC`.

**Effetto oggi:** solo chi lancia il cron da un server locale non in UTC.

**Da fare:** passare il limite come data (o calcolarlo in SQL) quando si tocca di nuovo la query; insieme alla decisione sul fuso dei test (F4).

## Latenza fra le funzioni Vercel e il DB

Misurata nello smoke di PR1.

- Il cron fa 7 comandi per alert di un giorno precedente (circa 9 per uno di oggi): circa 7 giri al DB, 0,2 s ad alert con 30 ms di latenza. La base ne faceva 3.
- `vercel.json` non fissa la region delle funzioni. Se è `iad1` (Washington) mentre il DB è a Francoforte, ogni giro costa circa 90 ms: circa 70 alert per chiamata del cron, e ogni query dell'app paga lo stesso prezzo. Con `fra1` il giro scende a 1–2 ms.

**Effetto oggi:** con il batch di PR1 il cron non si ferma a metà; la latenza decide solo quante chiamate servono.

**Da fare:** controllare la region nelle impostazioni del progetto Vercel; se è lontana dal DB, spostarla su `fra1` (decisione a parte, tocca tutta l'app). Il `SET TRANSACTION ISOLATION` separato è un giro su 7: si può togliere se il default del DB è già `read committed`.

## `db:generate` cambia ogni volta il default di `customers.id`

Scoperto in T2.3 (PR2), preesistente.

- `customers.id` ha `.default(nanoid())`: il valore si calcola una volta, quando si carica lo schema. `drizzle-kit` lo vede come un default letterale diverso a ogni esecuzione e aggiunge `ALTER TABLE "mito-deutsche_customers" ALTER COLUMN "id" SET DEFAULT '<letterale>'` a ogni migrazione generata.
- Le migrazioni `20260615235953` e `20260619152227` l'hanno applicato. In `20260902181440`, in quella di T2.3 e in quella di T5.16 (`20261019142325`) la riga è stata tolta a mano; lo snapshot invece registra il nuovo letterale, quindi ogni migrazione cambia un letterale nello snapshot senza che l'SQL lo mostri.

**Effetto oggi:** nessuno sui dati, finché gli insert di `customers` passano l'id. Un insert senza id prenderebbe il letterale fisso, e il secondo fallirebbe per chiave duplicata.

**Da fare fuori da questa spec:** `$defaultFn(() => nanoid())` al posto di `.default(nanoid())`, che genera l'id in JavaScript e non tocca il DB; poi una migrazione che toglie il default letterale.

## Il cron non riconosce gli alert di oggi in ora legale

**Risolto il 2026-10-13 (deciso da Leonardo).** `processDueAlerts` confronta i giorni in `Europe/Rome`: "oggi" è il giorno italiano di `now`, e un alert è di oggi se la sua scadenza cade in quel giorno. Anche la query taglia la scadenza in `Europe/Rome`, senza appoggiarsi al fuso della sessione. `isDueToday` e `formatDate` non ci sono più. Test in `processDueAlerts.db.test.ts`: ora legale, ora solare, i due giorni del cambio (25/10/2026 e 28/03/2027), una scadenza a un'ora qualsiasi, e un'esecuzione di sera, quando in Italia è già il giorno dopo quello UTC. Passano con il processo in quattro fusi diversi; con il codice di prima, in UTC, ne fallivano quattro. Sul DB di sviluppo, il 13/10: 23 alert del giorno riconosciuti, 0 con la regola di prima su un server in UTC.

Non ripara il passato: gli alert del giorno chiusi senza followup fino al deploy restano chiusi (in prod 316 al 2026-10-11, di cui 236 su contatti attivi rimasti senza alert).

Scoperto nella review di PR2 (v9), preesistente: le formule di data sono quelle della base.

- Le scadenze scelte dall'interfaccia (date picker, `CustomerAlertCreator`) sono la mezzanotte del browser: 22:00 UTC del giorno prima in ora legale, 23:00 UTC in ora solare. Sul DB di sviluppo: 5.710 scadenze alle 22:00 UTC, 6.727 alle 23:00 UTC, 2 ad altre ore.
- La query prende l'alert il giorno giusto (`DATE(deadline)` nella sessione `Europe/Rome`), ma `isDueToday` (`src/server/services/contact/processDueAlerts.ts`) aggiunge un'ora sola alla scadenza e confronta le date in UTC. In ora legale un alert di oggi risulta "giorno precedente": viene chiuso senza followup.

**Effetto fino al deploy della correzione:** da fine marzo al 25 ottobre il cron non crea followup per gli alert creati dall'interfaccia.

~~**Da fare fuori da PR2 (decisione di Omar):** confrontare le date nel fuso `Europe/Rome`, per esempio con l'helper di A4, con un test sui due cambi d'ora. Cambia il comportamento del cron, che nella SPEC è un non-goal: serve una decisione esplicita.~~ Fatto. Il giorno italiano si calcola dentro `processDueAlerts.ts`: quando T3.1 crea `time.ts` (A4), il cron può prenderlo da lì.

## Gli indici di PR2 per Contatti non servono ancora nessuna query

Scoperto nella review di PR2 (v2, prima e seconda verifica). Riguarda `task_priority_active_idx` e `task_operator_active_idx`.

- L'indice è `priority DESC NULLS LAST WHERE is_active`. La lista Contatti (T5.1) ordina per `priority IS NULL, priority <dir>, id <dir>`, un ordine che nessun indice su `priority` da solo può servire. Anche con `priority DESC NULLS LAST` coprirebbe solo il verso decrescente. Nessuna query di oggi lo usa.
- `task_operator_active_idx` (`operator_id WHERE is_active`): le query di oggi che filtrano per operatore (export chiamate, `getTasksToExport`, contatori) non filtrano `is_active`, quindi non lo usano. In T5.1 servirebbe solo il filtro `operatorIds` sui contatti attivi, non "Solo i miei" (D8).
- Costo: gli update di `priority` e di `operator_id` non sono più HOT (poco, con 75.000 task).

**Effetto oggi:** nessuno sui risultati.

~~**Da fare:** in PR5a (T5.16). Misurare con `EXPLAIN ANALYZE` una pagina di default, una filtrata per operatore e una "Solo i miei". Poi tenere, ridisegnare o togliere i due indici, con una sola migrazione. T5.17 lo controlla.~~ Fatto in PR5a (T5.16, 2026-10-17). Misurata in prod, in sola lettura, la query vera di `getContacts`: la prima pagina di default fa 62 ms con l'indice sulla priorità e 78 ms senza (pagina 2000: 216 e 332 ms), l'indice per operatore non serve. Tolti entrambi con `20261019142325_blushing_roland_deschain.sql`, da applicare a mano in prod (A3 e G4a); il rollback è nel file. **Omar ha riconfermato il 2026-10-18** la rimozione di `task_priority_active_idx` sulle misure con la query vera (16 ms sulla prima pagina, 116 ms alla pagina 2000): la conferma del 2026-10-17 era sulla misura preliminare. Un `DROP INDEX` non è "additivo" come chiede la spec: scostamento dichiarato in §15 del PLAN e confermato da Omar. Le misure sono nel log di T5.16.

## Il ramo che fallisce della guardia di `contatti_cleanup` è provato solo su PGlite

Scoperto nella review di PR2 (v7).

- La guardia (operatore di sistema mancante con alert da chiudere) e l'annullamento delle tre migrazioni sono testati su PGlite. La prova sul DB di sviluppo copre solo il ramo riuscito.

**Effetto oggi:** nessuno. Il passo 2 del runbook G2 verifica l'operatore di sistema prima della migrazione.

## Lacune dei primitivi di movimento

Scoperto nel piano (P6, rivisto con `design-engineer` il 2026-10-15), preesistente: sono i primitivi shadcn in `src/components/ui/`, che PR3 non tocca.

- Nessuna variante `motion-reduce` su Dialog, Toast e Sheet: con `prefers-reduced-motion` le transizioni di entrata e uscita restano.
- Lo stesso per il contenuto di `Select` (`ui/select.tsx:78`) e di `DropdownMenu` (`ui/dropdown-menu.tsx:50,68`): `fade-in-0 zoom-in-95 slide-in-from-*` senza `motion-reduce`. PR3 usa il `Select` per la priorità nella scheda cliente e per l'operatore di destinazione nella modale del passaggio di consegne (review di PR3, v7).
- I menu di `DropdownMenu` e di `Select` condivisi non impostano `transform-origin` sul lato del trigger: lo `zoom-in` parte dal centro.
- L'uscita della Dialog dura quanto l'entrata (200 ms): di solito l'uscita è più breve.
- Sheet a 500 ms `ease-in-out`: lento per un pannello laterale, e la curva non è d'uscita.
- `transition-all` su Toast e su `.dashabord-container`: anima anche proprietà di layout.

**Effetto oggi:** solo sul movimento. Il selettore di stato di PR3 apre il suo menu senza animazione (eccezione in `brain/chore/motion.md`); la modale di conferma usa la Dialog com'è, e il selettore della priorità e quello del passaggio di consegne il `Select` com'è.

**Da fare fuori da questa spec:** una passata sui primitivi `ui/` con `design-engineer` (`motion-reduce:` su entrata e uscita, `origin-[--radix-dropdown-menu-content-transform-origin]`, uscita più breve, Sheet più rapida, proprietà esplicite al posto di `transition-all`).

## Scrittori fuori dalla regola dei lock

Scoperto nel piano (A11, §15), dichiarato in PR3 (T3.15).

- La regola (D12): ogni transazione che scrive task, alert o log di un cliente blocca prima il cliente con `lockCustomer`. Due scrittori ne sono fuori ("Assegna Clienti" è dentro dal 2026-10-20: T6.8a, una transazione per cliente):
  - il cron `priority` (`refreshPriorities`): ricalcola `priority` delle task attive in blocco;
  - la pulizia di `task_event_log` (`cleanupTaskEventLog`): cancella righe vecchie.
- La massiva (`task.bulkHandleTask`) e il cron degli alert prendono il lock ma chiudono l'alert con codice proprio invece di `resolveOpenAlert`: niente guardia `is_resolved = false` e niente `alert.updated_at`. Sotto il lock la guardia serve solo se una task punta a un alert già chiuso.
- La conferma dell'alert nella massiva è legata al cliente, non all'alert (`task/POST/index.ts`, `resolveAlertCustomerIds`): l'admin conferma "l'alert di questo cliente", e la massiva chiude quello che legge dopo il lock. Se un collega lo sostituisce con `setCallback` fra la modale e il salvataggio, la massiva chiude il richiamo nuovo, che l'admin non ha visto. `changeState` e `setCallback` lo evitano con `confirmedAlertId` e `replacesAlertId` (AC37, AC44). Logica invariata da A7 (review di PR3, v2).

**Effetto oggi:** `refreshPriorities` può sovrascrivere una priorità appena salvata da un operatore (l'ultima scrittura vince); La pulizia del log non tocca righe recenti. ("Assegna Clienti" in concorrenza con una mutation del contatto non può più separare cliente e contatto: T6.8a, 2026-10-20.)

**Da fare:** `refreshPriorities` con il lock per cliente, o con una condizione sul valore letto, quando PR5 ridisegna le priorità; massiva e cron su `resolveOpenAlert` (stesso comportamento più `updated_at`); la massiva riceve dalla modale gli id degli alert confermati e li confronta dopo il lock.

## "Assegna Clienti" su molti clienti: una transazione ciascuno

Scoperto in PR6 (T6.8a), conseguenza di P19.

- `assignCustomers` apre una transazione per cliente, in sequenza (come `bulkHandleTask`): per ogni cliente blocca il cliente e il contatto, scrive fino a due `UPDATE` e una riga di log, circa otto giri verso il DB. La versione di prima faceva tre query in tutto.
- Il selettore delle righe di Clienti arriva a 500 per pagina (`PER_PAGES`, `src/lib/constants/pagination.ts`): selezionando tutta la pagina la chiamata fa 500 transazioni. Alla misura dello smoke di T1.8 (circa 0,2 s a transazione con 30 ms di latenza e circa 7 giri, [[specs/crm/sezione-contatti/IMPLEMENTATION-NOTES]]) sarebbero oltre i 60 s di una funzione Vercel per qualche centinaio di clienti: è una stima, non una misura di "Assegna Clienti". Un errore a metà lascia i clienti già fatti assegnati e il resto no (P19).

**Effetto oggi:** non misurato su prod. `bulkHandleTask` ha lo stesso costo per cliente e gira in prod dal 29/09.

**Da fare fuori da questa spec:** misurare "Assegna Clienti" con 100 e 500 clienti sul DB di sviluppo; se supera il limite, spezzare la selezione in blocchi dal client, o scrivere la versione a insiemi (un `UPDATE` e un `INSERT … SELECT` per tutti i clienti, con i lock presi in ordine di id).

## Con un caricamento diretto di Clienti l'admin non vede la colonna di selezione

Scoperto nella passata browser di T6.3 (PR6, 2026-10-20), preesistente (da T3.14, PR3).

- `UserPreferenceProvider` crea lo store con `role: data?.role` e, dopo il primo render dei figli, lo aggiorna in un `useEffect`; da T3.14 il ruolo non è più nel browser. `CustomersTable` legge `role` una volta nell'inizializzatore di `useState` per la visibilità della colonna `select` (`role === "ADMIN"`): con un caricamento diretto di `/dashboard/customers` (o un ricaricamento) il ruolo è ancora `undefined`, la colonna non c'è, e con lei il pulsante "Edit" e il dialogo di assegnazione massiva.
- Arrivandoci con un clic dalla barra (la query `getUserPreference` è già in cache) la colonna c'è. In più la visibilità, non il ruolo, finisce nelle preferenze salvate: la lista nascosta salvata dal caricamento diretto contiene `select`, e `CustomersTable` lo riscrive con il ruolo a ogni caricamento, quindi non resta.

**Effetto oggi:** un admin che apre Clienti da un link diretto non può usare "Assegna Clienti" finché non passa da un'altra pagina. Non cambia con PR6.

**Da fare fuori da questa spec:** far dipendere la visibilità di `select` dal ruolo corrente (un effetto, o `columnVisibility` calcolata dal ruolo) e non dal valore del primo render.

## `customer.insertCustomer` accetta l'operatore

Scoperto nella review di PR3 (T3.13), preesistente.

- La creazione del cliente accetta `operatorId` dall'input, senza i controlli di "Passaggio di consegne" (D13) e senza riga `operator_reassign` nel log.
- Lo stesso fa la rotta di import `/api/import/create/customers` (`route.ts:13-26`): `authCheck()` accetta qualunque sessione e inserisce i clienti dal corpo JSON, `operatorId` compreso, senza validazione (review di PR3, v1).
- La massiva `bulkHandleTask` accetta qualunque `operatorId` come destinazione, l'operatore di sistema compreso; `handover`, `reassign` e, dal 2026-10-20, "Assegna Clienti" (`assignCustomers`, T6.8a) lo rifiutano con `findWorkingOperator` (review di PR3, v1).

**Effetto oggi:** basso, la creazione e l'import non spostano contatti (un cliente nuovo non ne ha); le massive sono solo per gli admin.

**Da fare fuori da questa spec:** decidere se un operatore può creare un cliente assegnato a un collega; se no, prendere l'operatore dalla sessione o richiedere un admin.

## Data del richiamo: selettore e server con regole diverse

Scoperto nel `/simplify` di PR3, preesistente (la regola del selettore è quella della base).

- Il server rifiutava una scadenza prima della mezzanotte di Roma di oggi (`isPastDay`, A4): oggi era ammesso. Dal 2026-10-17 (D22, T5.15) rifiuta anche oggi.
- Il date picker della scheda cliente (`CustomerAlertCreator`) disabilita ogni giorno la cui mezzanotte, nel fuso del browser, viene prima dell'ora attuale di Roma: oggi compreso.

- Il cron degli alert gira una volta per notte alle 23:47 UTC (00:47–01:47 in Italia) e crea il `followup` solo per gli alert con la scadenza nel giorno italiano dell'esecuzione. Un richiamo impostato per oggi dopo l'esecuzione della notte è visto la notte dopo come "di un giorno prima" e chiuso dall'operatore di sistema senza `followup`: il contatto non torna fra quelli da chiamare (review di PR3, v3).

**Effetto oggi:** da PR5a il server rifiuta anche un richiamo per oggi, quindi una chiamata diretta all'API non lo imposta più. Dalla scheda cliente non si impostava già. Con il browser in un altro fuso il confine del selettore si sposta di qualche ora.

~~**Da fare:** in PR5, quando il richiamo arriva nel dettaglio di Contatti, prima che un selettore permetta oggi: decidere se il server chiede una scadenza da domani (`DeadlineInPast` anche per oggi, A4 e T3.6 da aggiornare) oppure se il cron tratta come "di oggi" le scadenze del giorno prima che non ha ancora visto. Poi il selettore prende la regola da `src/lib/domain/contact/time.ts`.~~ Deciso (D22) e fatto lato server in PR5a (T5.15, 2026-10-17): `setCallback` rifiuta una scadenza di oggi o prima (`isDueOrOverdue`), con il messaggio "Il richiamo si imposta da domani" sul server e nel client. Il cron non cambia. **Resta:** il selettore della scheda cliente (`CustomerAlertCreator`) ha ancora la sua regola, nel fuso del browser (disabilita oggi); il form di Contatti (T5.7b) prende la regola da `time.ts`, e l'allineamento della scheda cliente va fatto allora o lasciato com'è.

## La ricerca cliente di Contatti è lenta a freddo

Scoperto nella misura di T5.16 (PR5a, 2026-10-17), fuori da A3.

- `customers` non ha un indice per `ILIKE '%testo%'`: la ricerca su cognome, nome, CF, P.IVA e telefono fa una scansione sequenziale. In prod, con la query vera: "rossi" 190 ms a caldo e 339 a freddo; il `count` di "33" 167 ms a caldo e **660** a freddo. `getContacts` aspetta righe e totale insieme, quindi la prima ricerca a freddo può superare i 500 ms.
- Un indice trigram richiede l'estensione `pg_trgm` (una migrazione che crea l'estensione e un indice GIN su cinque colonne): è una decisione a parte.

**Effetto oggi:** nessuno in prod: la lista non ha ancora chiamanti (PR5b).

**Da fare:** misurare di nuovo con la lista in uso; se la ricerca a freddo dà fastidio, valutare `pg_trgm` o limitare la ricerca a un minimo di caratteri.

## `next lint` non parte nei worktree di `.claude/worktrees/`

Scoperto in PR5a (2026-10-17), preesistente.

- Il worktree sta dentro il repo padre: ESLint risale le cartelle, trova anche il suo `.eslintrc.cjs` e si ferma con `Plugin "@typescript-eslint" was conflicted between ".eslintrc.cjs" and "../../../.eslintrc.cjs"`.
- Contromisura usata: `pnpm exec eslint --no-eslintrc -c .eslintrc.cjs src/... --ext .ts,.tsx`, con la stessa configurazione. La CI gira in un checkout pulito e non ha il problema.

**Da fare fuori da questa spec:** `root: true` in `.eslintrc.cjs`, o girare `next lint` in un worktree fuori dal repo.

## La lista di Contatti: richieste senza tetto e senza limite di tempo

Scoperto nella review di PR5a (2026-10-17).

- Una richiesta tRPC in batch porta un numero qualsiasi di chiamate `getContacts`, e ciascuna lancia tre query insieme (righe, totale, cliente) con `concurrency: "unbounded"`. Un client che manda decine di chiamate occupa le connessioni del pool (`postgres.js` con il massimo di default, 10, perché `src/server/db/index.ts` non imposta `max`) e le query più lente (la ricerca cliente a freddo arriva a 660 ms) tengono il database. Non c'è un tetto di richieste per batch (`unstable_httpBatchStreamLink` in `src/trpc/react.tsx` non imposta `maxBatchSize` e il server non limita le chiamate per richiesta) e il database non ha uno `statement_timeout` per l'app: una query che si pianta resta appesa (vedi anche "Il cron alert quando la connessione al DB cade").
- I tetti sull'input (`MAX_OPERATOR_IDS`, 4 fasce, 8 stati, 100 caratteri di ricerca, `perPage` fra i valori ammessi, pagina ≤ 10.000) limitano il costo di una query, non il numero di query.

**Effetto oggi:** nessuno: la lista non ha ancora chiamanti (PR5b). Lo possono provocare solo utenti con una sessione.

**Da fare fuori da questa spec:** `maxBatchSize` sul link di tRPC (e un tetto sul server) e uno `statement_timeout` per le query di lettura.

## Le procedure delle preferenze: gli stessi difetti in tutte e quattro

Scoperto nella review di PR5a (2026-10-17), preesistente nelle gemelle.

- Le quattro procedure di `updateUserPreference.ts` (colonne di Clienti, di pratiche e di Contatti, e `dashboardCollapsed`) leggono le preferenze, cambiano una chiave e riscrivono il JSON intero: due salvataggi vicini (due schede, o una colonna e il pannello `dashboardCollapsed`) possono cancellarsi a vicenda. Nessuna transazione, nessun lock.
- Solo la procedura di Contatti ha un limite sull'input (20 nomi, 64 caratteri ciascuno, PR5a); quelle delle colonne di Clienti e di pratiche accettano un array di stringhe di qualsiasi lunghezza e lo scrivono nel JSON dell'utente.
- `retrieveUserPrefercence` fa il `JSON.parse` di una colonna testuale senza controllarne la forma: una preferenza rovinata fa fallire ogni procedura.
- La rotta `/api/user/preferences` (chiavi `ct`, `cot`, `pt`, `ds`) non cattura l'errore della procedura: un corpo rifiutato dal limite dà un 500, non un 400. Un client che aggiorna lo stato locale senza guardare la risposta (come `CustomersTable`) mostrerebbe una scelta che il server non ha salvato. Il ramo `cot` non ha un test automatico: lo prova il browser in T5.10.

**Effetto oggi:** un salvataggio può andare perso; nessun dato di altri utenti.

**Da fare fuori da questa spec:** una sola procedura che aggiorna la chiave con `jsonb_set` (o una transazione con `FOR UPDATE`) e lo stesso limite di input per tutte.

## Il cognome vuoto e la collazione dell'ordine per Cliente

Scoperto nella review di PR5a (2026-10-17).

- L'ordine "Cliente" è `surname, name` con `NULLS LAST`: un cognome stringa vuota (non NULL) non va in fondo, passa per primo in ordine crescente. Se i dati di prod hanno cognomi vuoti, la lista crescente comincia con righe senza nome. Non misurato in prod.
- I test girano su PGlite, che ordina i testi con la collazione `C`; Postgres in produzione usa quella del database (di solito `en_US.UTF-8` o simile), che ignora maiuscole e accenti in modo diverso. L'ordine alfabetico con accenti e maiuscole non è provato dai test.

**Effetto oggi:** nessuno: la lista non ha ancora chiamanti (PR5b).

**Da fare:** in PR5b, guardare la lista ordinata per Cliente su dati di prod (o di staging); se serve, `NULLIF(surname, '')` nell'ordine e una collazione esplicita.

## I test dei giorni di Roma girano nel fuso della macchina

Scoperto nella review di PR5a (2026-10-17, v8).

- `vitest.config.ts` imposta `env: { TZ: "UTC" }`, ma `Intl` nei worker resta nel fuso della macchina (una sonda ha stampato `process.env.TZ=UTC` e `Intl.resolvedOptions().timeZone=Europe/Rome`). Un mutante che prende il giorno locale del processo, al posto di quello di Roma, è equivalente al codice giusto su un computer in `Europe/Rome` e cade solo con `TZ=` esplicito o in CI (UTC).
- I test di `setCallback` sul giorno di oggi e di domani usano ancora l'orologio vero (`Date.now()`) e possono fallire a cavallo della mezzanotte di Roma.

**Effetto oggi:** sul computer di uno sviluppatore italiano un errore del genere passerebbe i test e lo prenderebbe la CI.

**Da fare fuori da questa spec:** fissare il fuso nel setup dei test, e usare un orologio finto in tutti i test sul giorno.

## La ricerca di Clienti per "Nome" e "Telefono" va in errore

Scoperto nel passaggio browser di PR3 (T3.14, 2026-10-15), preesistente: la stessa riga c'è su `dev`.

- `customer.getAllCustomers` usa `search_by` come nome di colonna (`customers[searchBy]`). Il selettore manda `nome` e `telefono`, ma le colonne sono `name` e `phoneNumber`: `ilike` riceve `undefined` e Postgres risponde `syntax error at or near "$2"`. La pagina mostra l'errore di runtime.
- "Cognome", "Email" e "Codice Fiscale" funzionano.

**Effetto oggi:** chi cerca un cliente per nome o per telefono vede la pagina d'errore.

**Da fare fuori da questa spec:** una mappa esplicita da `search_by` alla colonna, con un test sulla procedura.

## Contrasto e nomi nei primitivi condivisi

Scoperto nel passaggio UI della review di PR3 (v6, 2026-10-15), preesistente: sono i primitivi in `src/components/ui/`, che PR3 non tocca.

- Toast `destructive`: testo `#fafafa` su `#ef4444`, circa 3,6:1 (WCAG 1.4.3 chiede 4,5). È il toast dei rifiuti di AC52.
- Il pulsante di chiusura del toast non ha un nome accessibile.
- La "X" della Dialog è 16×16 ed è l'ultima nell'ordine di tabulazione, dopo i pulsanti del footer; a 320 px il pulsante principale del footer sta sopra "Annulla".

**Effetto oggi:** il messaggio di rifiuto si legge, ma sotto la soglia di contrasto; chi usa un lettore di schermo sente un pulsante senza nome.

**Da fare fuori da questa spec:** la stessa passata sui primitivi `ui/` di "Lacune dei primitivi di movimento": `bg-red-600` o più scuro nella variante `destructive`, `aria-label="Chiudi"` sul pulsante del toast, area della "X" di almeno 24 px.

## La scheda cliente non regge sotto i 900 px

Scoperto nel passaggio UI della review di PR3 (v6, seconda verifica, 2026-10-15). In parte preesistente.

- Preesistente: sotto circa 895 px tutta la scheda cliente scorre in orizzontale (24 px di troppo a 800, 152 a 320) e a 320–375 px le etichette dell'anagrafica si sovrappongono ("Provincia"/"Sede", "Occupazione"/"Ambito"/"Provenienza"). `CustomerForm` non è cambiato in PR3.
- Da PR3: nella card "Stato del cliente" il selettore dello stato è largo 160 px fissi (PLAN §9). Con due colonne sotto `lg` non tocca la priorità da 484 px in su; sotto, si sovrappone al selettore della priorità (65 px a 320, 43 a 375) e la parte destra del trigger apre la priorità.
- Nella lista Clienti il motivo in sola lettura resta nei 160 px della colonna: "Assegnato a Martina Vi…", con il nome intero solo nel `title`, che tastiera e touch non raggiungono. Nella scheda il motivo è intero.

**Effetto oggi:** nessuno per gli operatori, che lavorano da desktop. Conta per lo zoom al 400 % su un portatile (WCAG 1.4.10) e per un uso da telefono.

**Da fare fuori da questa spec:** se la scheda deve funzionare sotto i 900 px, una passata sul suo layout (anagrafica e card), con il trigger dello stato che si restringe sotto i 484 px; nella lista, il nome intero del motivo raggiungibile senza puntatore.

## La chat delle note: eliminazione, aggiornamento del cliente e accessibilità

Notati ripianificando PR4 (PLAN §15), preesistenti: PR4 sposta la chat in `src/components/custom/notes/` ma non cambia queste parti.

- `chat.deleteMessage` è un'`operatorProcedure` che elimina qualunque messaggio: non controlla chi l'ha scritto, e l'`operatorId` che riceve dal client non serve a niente.
- Un'eliminazione fallita non mostra niente: `handleDelete` è un `onClick` async e il rifiuto resta non gestito.
- `customer.updateLastEdit` è chiamata dal client dopo l'action, in una richiesta separata, invece che nella stessa scrittura della nota: se la seconda richiesta fallisce, la nota c'è e l'ultima modifica del cliente no.
- Il cestino compare solo al passaggio del mouse (da PR4 con il CSS, `invisible group-hover:visible`, invece dello stato): da tastiera non si raggiunge e non ha un nome accessibile. Il campo della nota ha solo il placeholder, senza etichetta.

**Effetto oggi:** un operatore può eliminare, anche fuori dall'interfaccia, una nota di un collega in qualunque chat; chi usa la tastiera o un lettore di schermo non elimina le note e sente un campo senza nome.

**Da fare fuori da questa spec:** controllo dell'autore in `chat.deleteMessage` (o del ruolo), messaggio d'errore sull'eliminazione, aggiornamento del cliente nella stessa action, cestino sempre raggiungibile da tastiera con `aria-label`, etichetta del campo.

## Server action della chat fuori da Effect e procedure senza chiamanti

Da PR4 (P11, D15).

- Le server action della chat (`src/components/custom/notes/_actions/`) restano async semplici, fuori da Effect: l'unico errore previsto è la validazione dell'input, lasciata a Zod (P8, P11).
- La procedura `pratiche.updateLastEdit` non ha più chiamanti dopo D15 (`chat.createNewChat` è stata rimossa in T4.5). Le chat di pratica già nel DB restano senza interfaccia: rimuovere le procedure o riportare le note in Pratiche è una scelta di prodotto.

**Effetto oggi:** nessuno per gli operatori; codice morto sul server.

**Da fare:** decidere le chat di pratica; portare le action in Effect quando la chat si rifà.

## L'anello di focus nella chat è tagliato

Scoperto nel passaggio UI della review di PR4 (v5, 2026-10-15), preesistente: `AccordionContent` ha `overflow-hidden`, che taglia di 4 px l'anello di focus del campo della nota e di "Commenta" (resta visibile per 2 px più 2 di offset). La struttura era la stessa nella chat della pratica.

**Da fare:** padding interno nel contenuto dell'accordion della chat, o `ring-inset` sui due controlli.

## Bozze della nota non inviata senza proprietario o di un collega

Da PR4 (review, v4, 2026-10-15). La bozza di AC76 è legata all'operatore e "Esci dal gestionale" le cancella tutte (D18). Restano due casi, senza uscita dal gestionale nella stessa scheda (sessione scaduta, poi un altro accesso):

- una bozza salvata quando la query dell'operatore non si era ancora caricata ha `operatorId` nullo: chi apre quel cliente dopo la vede e la può inviare a suo nome. Serve che la query non si sia mai caricata per tutta la sessione del primo operatore;
- le bozze del primo operatore su clienti che il secondo non apre restano in `sessionStorage` finché la scheda non si chiude: mai mostrate, leggibili solo dagli strumenti del browser.

**Da fare, se serve:** non salvare la bozza senza operatore, o pulire all'accesso le bozze con un `operatorId` diverso da quello della sessione.

## Chat orfane nel DB

Da PR4 (T4.5, D19). Rilevate il 2026-10-16 con una query in sola lettura.

- In prod 19 chat non hanno né cliente né pratica; 7 contengono 13 messaggi, scritti tra dicembre 2024 e luglio 2026. Le altre 12 sono vuote. Nessuna pratica ha una chat.
- Le ha create `createNewCustomerChat` prima di T4.5, che sovrascriveva il `chat_id` del cliente: la causa è chiusa, le righe restano.
- Per le 7 con messaggi il cliente non si ricava con certezza: il collegamento è perso.

**Chiuso il 2026-10-16**, su richiesta di Omar: cancellate tutte le chat senza cliente né pratica create da più di un'ora, con i loro messaggi e le righe di `chat_to_operator`, in una transazione per DB. Staging (DB di sviluppo): 12 chat, 13 messaggi. Prod: 19 chat, 13 messaggi. Dopo: 0 chat orfane e nessun cliente con una chat mancante. Prima della cancellazione ogni riga è stata salvata in un backup JSON locale.

## Le mutation di Contatti e Clienti offline

Scoperto in T5.7a (PR5b, 2026-10-18), preesistente: viene da `useContactMutationFeedback` e dal `QueryClient` di PR3, condivisi con la cella dello stato di Clienti.

- Con il browser davvero offline (`navigator.onLine` falso) React Query v4 mette in pausa la mutation (`networkMode: "online"`, il predefinito): il selettore resta in attesa senza messaggio. Con una richiesta che cade a connessione attiva (provata abortendo `task.changeState`) tutto funziona: "Modifica non salvata, riprova", valore salvato, selettore di nuovo attivo, anche nella Sheet.
- Provato `networkMode: "always"`: la richiesta parte e fallisce, ma l'hook, dopo il toast, fa `router.refresh()`; offline questa fa una navigazione completa e il browser mostra la sua pagina d'errore. Annullato.

**Da fare fuori da questa spec (insieme a Clienti):** l'hook non deve fare `router.refresh()` per un errore che non è del contatto (rete, 500: il valore non è cambiato) e le mutation di contatto vanno con `networkMode: "always"`. Per ora il caso è rotto in entrambe le tabelle allo stesso modo.

## Piccoli debiti dell'interfaccia di Contatti (PR5b)

Registrati nel Run 6 (2026-10-18). Nessuno blocca il rilascio.

- **Il badge blacklist** (`role="img"` con "In blacklist" o "Blacklist in revisione") è scritto due volte: nella lista (`ContactColumns`) e nel dettaglio (`ContactDetailHeader`). `BlackListBadge` non ha un nome accessibile da solo (la scheda cliente e la pratica lo mostrano ancora come sola icona). Va estratto e il nome messo nel componente.
- **`PriorityBadge` è solo un'icona**, senza testo né nome: vale anche in Clienti. Il dettaglio ha almeno "Manuale"/"Automatica" accanto; la riga della lista non ha niente.
- **`DatePickerFormItem`** (condiviso con Clienti e Pratiche) dà al pulsante il nome dell'etichetta, non il valore scelto: un lettore di schermo non sente la data. "Imposta richiamo" (D22) usa `isDueOrOverdue(date, new Date())` su date a mezzanotte locale: giusto in Italia, in un fuso lontano potrebbe segnare il giorno sbagliato.
- **`ContactSheet`**: la guardia "sto già chiudendo" non si azzera: se una navigazione si bloccasse senza smontare il guscio, la Sheet non si potrebbe chiudere di nuovo.
- **Barra dei filtri:** un `?operatore=99` che non è nell'elenco mostra "Operatore, 1 selezionato" senza casella spuntata; una scelta oltre `MAX_OPERATOR_IDS` si ignora senza messaggio; i campi data fanno un `push` per ogni valore valido (un anno digitato a mano può farne qualcuno; gli anni che il server rifiuta no, e dal 2026-10-18 non bloccano più gli altri filtri: mostrano il messaggio "Usa una data tra il 2000 e il 2100"); la barra non è sticky.
- **Annuncio della riga che esce** (`ContactsTable`): se fra il salvataggio e il refresh arriva un altro aggiornamento in cui la riga c'è ancora, l'annuncio si perde; con la lista che si svuota parlano sia il nodo sr-only sia quello dello stato vuoto.
- **`RestoreRowFocus`:** con `sessionStorage` illeggibile porta il focus alla tabella a ogni montaggio della lista, anche senza un ritorno dal dettaglio (come dice il piano; caso raro).
- **`limit` della chat:** la scheda cliente accetta un `limit` enorme (`getChatMessagesById` non ha un massimo); il dettaglio no (`parseChatLimit`).
- **Lo Storico del dettaglio** non ha un tetto all'altezza dei messaggi lunghi.
- **Movimento:** il `Select` dell'operatore e i `Popover` usano i primitivi con le loro animazioni; i `Button` hanno `transition-colors` al passaggio del mouse. Rientra in "Lacune dei primitivi di movimento". Dal passaggio di movimento del 2026-10-19 (Haiku): `Switch`, `Accordion` e `Popover` non sono nell'elenco di quella voce (`Switch` senza `motion-reduce`, `Accordion` con `animate-accordion-*`); il menu delle azioni di riga, "Colonne" e i `Select` della paginazione e della data si aprono con l'animazione standard, e `motion.md` non dice se è una scelta.
- **Contrasto dei primitivi condivisi** (passaggio UI del 2026-10-19, Haiku, misurato come admin): la traccia dell'interruttore spento (`#e5e5e5` su bianco, 1,26:1), la voce a fuoco dei menu (`#f5f5f5` su bianco, 1,09:1, unico segno del focus) e la X della Sheet (16×16, e non resta in vista quando il contenuto scorre).
- **Clienti, preesistente e fuori da PR5b:** a 800 px la barra dei filtri non va a capo e metà dei filtri resta fuori dallo schermo; i selettori della barra non hanno nome accessibile; i due pulsanti con l'icona di ricerca e di filtro si chiamano "Toggle bold" e "Toggle italic" (`TableFilterSections.tsx`, `ToggleGroupDemo`).
- **Nomi uguali:** il pulsante "Azioni per" di una riga e delle sue sotto-righe ha lo stesso nome (lo stesso cliente); due contatti precedenti dello stesso giorno e operatore hanno lo stesso testo nel dettaglio.

## Dati di prova sul DB di sviluppo (PR5b)

Restano dalla passata browser del Run 6, nel prefisso `zzpr3-`: i contatti riaperti e gli alert di `zzpr3-c2`, `zzpr3-c10`, `zzpr3-c13`, `zzpr3-c20` (e la chat con una nota, "Prima nota T5.8", di `zzpr3-c20`). Per toglierli basta il prefisso `zzpr3-` sull'id del cliente.

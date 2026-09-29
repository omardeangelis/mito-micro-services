---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/sezione-contatti/IMPLEMENTATION-NOTES]]"
created: 2026-09-25
updated: 2026-09-29
---

# Tech debt: Sezione Contatti

## Le migrazioni non ricostruiscono lo schema di produzione

Scoperto in T1.1–T1.2 (PR1), preesistente.

- `20240926195125_lucky_roughhouse` usa il tipo `task_status`, che nasce solo in `20260619152227_same_hemingway`: su un Postgres vuoto la prima migrazione fallisce.
- `alert.is_resolved` (`boolean DEFAULT false NOT NULL`) è negli snapshot da `20260615235953_brown_madelyne_pryor` ma in nessun file SQL. In prod c'è perché è arrivato con `db:push`; `db:generate` non lo emetterà mai.

**Effetto oggi:** nessuno in prod. Un DB nuovo creato con `pnpm db:migrate` (sviluppo, preview) non parte o non ha la colonna.

**Contromisura attuale:** l'harness di test (`src/test/db.ts`, `PUSHED_SCHEMA`) applica i due pezzi dove prod li ha ricevuti.

**Da fare fuori da questa spec:** una migrazione additiva e idempotente (`ADD COLUMN IF NOT EXISTS "is_resolved"`) e, per il tipo, una nota nel README o una migrazione "baseline". Poi `PUSHED_SCHEMA` si riduce di conseguenza.

## Nessun test esercita il lock del cliente

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

## Casi limite di `transaction` con le interruzioni

Scoperto nella review di PR1 (F9, F10).

- Una query interrotta (per esempio da un timeout) che poi fallisce non accende `tx.failed`: il COMMIT della transazione abortita diventa un rollback silenzioso e l'esito dice "successo".
- Se si interrompe la fiber del chiamante, l'esito dice "interrotto" ma la transazione fa commit: `forEachIsolated` conterebbe come fallito un alert già scritto.

**Effetto oggi:** nessuno. Il docstring di `transaction` vieta timeout e interruzioni dentro, e nessun bordo interrompe.

**Da fare fuori da questa spec:** registrare il fallimento sulla promise della query; propagare l'interruzione al programma interno, oppure tenere il divieto.

## Alert risolti due volte e `alert_id` azzerato senza condizione nella massiva

Scoperto nella review di PR1 (F14, R7), preesistente.

- `resolveAlerts`, e l'update dell'alert nella massiva, non hanno né la guardia `is_resolved = false` né il lock del cliente. Accanto al cron o alla massiva un alert può essere risolto due volte: `resolved_by` sovrascritto e un secondo `alert_resolved` nel log.
- La massiva (caso "alert confermato") azzera `alert_id` della task senza la condizione `alert_id = A` che il cron ha da PR1 (F13): se `createAlert` aggancia un nuovo alert fra la lettura e l'update, il nuovo resta aperto e scollegato.

**Effetto oggi:** raro, serve una scrittura concorrente sullo stesso cliente.

**Da fare:** PR3 (guardia e servizi con `lockCustomer`, T3.2).

## Ordine e pareggi nella massiva senza test

Scoperto nella review di PR1 (F16, F17).

- Con due task attive e lo stesso `updated_at`, la scelta cambia rispetto alla base: la base ordinava in JS al millisecondo e a parità seguiva l'ordine fisico; ora l'ordine è in SQL al microsecondo, poi `id DESC`. Succede solo con duplicati legacy.
- Nessun test fissa l'ordine per `updated_at` né i pareggi; mancano i casi 3 e 4 con lo stesso stato o lo stesso operatore, dove le righe di log non si scrivono.

**Effetto oggi:** solo sui duplicati che PR2 elimina.

**Da fare:** una query di sola lettura su prod (clienti con almeno 2 task attive nello stesso millisecondo) prima di PR2; i test mancanti in PR3.

## Il workflow di sviluppo del cron alert fallisce sempre

Scoperto nella review di PR1 (F18), preesistente.

- `.github/workflows/update-alert.yml` esegue `update:alert:dev`, che chiama `localhost:3000` dal runner di GitHub: fallisce qualunque cosa faccia il cron. `update-alert prod.yml` invece è corretto.

**Effetto oggi:** nessuno, lo schedule è commentato. Lanciato a mano dà un falso rosso.

**Da fare fuori da questa spec:** puntarlo a un ambiente raggiungibile o toglierlo.

## Test mancanti sull'infrastruttura Effect

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
- Le migrazioni `20260615235953` e `20260619152227` l'hanno applicato. In `20260902181440` e in quella di T2.3 la riga è stata tolta a mano; lo snapshot invece registra il nuovo letterale.

**Effetto oggi:** nessuno sui dati, finché gli insert di `customers` passano l'id. Un insert senza id prenderebbe il letterale fisso, e il secondo fallirebbe per chiave duplicata.

**Da fare fuori da questa spec:** `$defaultFn(() => nanoid())` al posto di `.default(nanoid())`, che genera l'id in JavaScript e non tocca il DB; poi una migrazione che toglie il default letterale.

## Il cron non riconosce gli alert di oggi in ora legale

Scoperto nella review di PR2 (v9), preesistente: le formule di data sono quelle della base.

- Le scadenze scelte dall'interfaccia (date picker, `CustomerAlertCreator`) sono la mezzanotte del browser: 22:00 UTC del giorno prima in ora legale, 23:00 UTC in ora solare. Sul DB di sviluppo: 5.710 scadenze alle 22:00 UTC, 6.727 alle 23:00 UTC, 2 ad altre ore.
- La query prende l'alert il giorno giusto (`DATE(deadline)` nella sessione `Europe/Rome`), ma `isDueToday` (`src/server/services/contact/processDueAlerts.ts`) aggiunge un'ora sola alla scadenza e confronta le date in UTC. In ora legale un alert di oggi risulta "giorno precedente": viene chiuso senza followup.

**Effetto oggi:** da fine marzo al 25 ottobre il cron non crea followup per gli alert creati dall'interfaccia. Il runbook G2 (passo 8) lo dice agli operatori, se la sessione è in ora legale.

**Da fare fuori da PR2 (decisione di Omar):** confrontare le date nel fuso `Europe/Rome`, per esempio con l'helper di A4, con un test sui due cambi d'ora. Cambia il comportamento del cron, che nella SPEC è un non-goal: serve una decisione esplicita.

## Gli indici di PR2 per Contatti non servono ancora nessuna query

Scoperto nella review di PR2 (v2, prima e seconda verifica). Riguarda `task_priority_active_idx` e `task_operator_active_idx`.

- L'indice è `priority DESC NULLS LAST WHERE is_active`. La lista Contatti (T5.1) ordina per `priority IS NULL, priority <dir>, id <dir>`, un ordine che nessun indice su `priority` da solo può servire. Anche con `priority DESC NULLS LAST` coprirebbe solo il verso decrescente. Nessuna query di oggi lo usa.
- `task_operator_active_idx` (`operator_id WHERE is_active`): le query di oggi che filtrano per operatore (export chiamate, `getTasksToExport`, contatori) non filtrano `is_active`, quindi non lo usano. In T5.1 servirebbe solo il filtro `operatorIds` sui contatti attivi, non "Solo i miei" (D8).
- Costo: gli update di `priority` e di `operator_id` non sono più HOT (poco, con 75.000 task).

**Effetto oggi:** nessuno sui risultati.

**Da fare:** in PR5 (T5.1). Misurare con `EXPLAIN ANALYZE` una pagina di default, una filtrata per operatore e una "Solo i miei". Poi tenere, ridisegnare o togliere i due indici, con una sola migrazione. T5.13 lo controlla.

## Il ramo che fallisce della guardia di `contatti_cleanup` è provato solo su PGlite

Scoperto nella review di PR2 (v7).

- La guardia (operatore di sistema mancante con alert da chiudere) e l'annullamento delle tre migrazioni sono testati su PGlite. La prova sul DB di sviluppo copre solo il ramo riuscito.

**Effetto oggi:** nessuno. Il passo 2 del runbook G2 verifica l'operatore di sistema prima della migrazione.

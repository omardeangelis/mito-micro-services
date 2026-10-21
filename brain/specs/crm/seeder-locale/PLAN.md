---
domain: crm
type: plan
links:
  - "[[specs/crm/seeder-locale/SPEC]]"
  - "[[specs/crm/sezione-contatti/PLAN]]"
  - "[[chore/migrazione-gcp]]"
created: 2026-10-21
updated: 2026-10-21
---

# Plan: Seeder del database locale, con gli scenari dei cron

**Spec:** [[specs/crm/seeder-locale/SPEC]]
**Generato:** 2026-10-21 con `create-plan`: grill → swarm-plan (con revisione del grafo) → tdd → adversarial-verifier. Nessun codice scritto. Le correzioni delle due revisioni sono nel §16.
**Sostituisce:** T7.1c del [[specs/crm/sezione-contatti/PLAN|piano di Contatti]] (decisione 3 della spec).

---

## 1. Situazione iniziale

- **Il database locale c'è ed è vuoto.**
  - `mito_local` gira nel Postgres 15 di `docker-compose.yml`, su `127.0.0.1:54329`.
  - `db:local:reset` lo ricrea con la sessione in Europe/Rome; `db:local:migrate` applica le migrazioni.
  - Il guard è `localConnection` (`src/server/db/localDsn.ts`). Il DSN è la costante `LOCAL_DATABASE_URL` di `src/server/db/scripts/localDb.ts`.
- **I test su Postgres esistono già** (`*.pg.test.ts`, progetto `pg` di `vitest.workspace.ts`).
  - Lavorano su un database `mito_test_<casuale>` creato ed eliminato da `src/test/pg.ts`, con la sessione in UTC.
  - `src/test/pg.setup.ts` sostituisce `@/server/db` con il pool di quel database.
  - In CI girano nel job Test (`.github/workflows/ci.yml`, servizio `postgres:15` sulla porta 5432, `timeout-minutes: 10`).
- **I cron di prod sono sul backend.** `cronJobs` (`api/src/cron/jobs.ts`) compone le funzioni di servizio:
  - `refreshPriorities` e `processDueAlerts` sono Effect con `Db`;
  - `alertJob` richiama `processDueAlerts` finché `remaining = 0`, al massimo 20 volte;
  - `updatePractices`, `updateCustomerAge` e `cleanupTaskEventLog` sono funzioni async che scrivono sul `db` globale, avvolte da `step`, che trasforma un'eccezione in `CronStepFailed`.
- **I seed di oggi (`seed:db`, `seed:delete*`) non hanno guard.** La spec li toglie (AC31–AC33).

## 2. Problema

La spec chiede tre cose:
- un seeder deterministico che riempia `mito_local` con 10.000 clienti, pratiche condivise, operatori sbilanciati, Contatti in ogni stato e gli scenari dei quattro cron;
- un modo di far girare quei cron su `mito_local` con le funzioni di prod;
- una verifica che confronti l'esito con un manifesto.

Gli ostacoli tecnici sono sette:
1. **Tre servizi leggono il database dall'ambiente.** Il `db` globale legge `SUPABASE_DB_CONNECTION_STRING` e `INSTANCE_UNIX_SOCKET` all'import. Una corsa locale non deve poter arrivare a un altro database (AC28a).
2. **`server-only` blocca l'import fuori da Next.** Sotto `tsx`, l'import dei servizi e dei job fallisce.
3. **Gli id sono `GENERATED ALWAYS AS IDENTITY`** su `task`, `alert`, `operator`, `task_event_log`, `chat` e `practices.id` (da 1000), e su `messages` (da 10000). Il manifesto ha bisogno di id noti prima di scrivere.
4. **Gli esiti dipendono dal giorno D e dall'orologio**, in parte tramite `Date.now()`: `calculatePriority`, `shouldUpdate` e anche `calculateDebitoResiduo` dell'import, che la spec usa come regola di AC14.
5. **`update` sottrae i debiti in virgola mobile** (`Number(a) - Number(b)`) e salva la stringa che ne esce, per esempio `876.5699999999999`.
6. **Le righe scritte dai cron prendono l'ora del database**, non l'orologio del processo. I `created_at` hanno default `CURRENT_TIMESTAMP`.
7. **Due colonne hanno solo `$onUpdate`** (`operator.updated_at`, `products.updated_at`). In un INSERT senza valore, Drizzle ci scrive `new Date()`.

## 3. Forma della soluzione

Due PR verso `dev` (D3).

**PR A, codice di prod, piccola:**
- `updatePractices`, `updateCustomerAge` e `cleanupTaskEventLog` diventano Effect con `Db` (D1). Rotte Next e backend passano `DbLive`.
- Via i seed di oggi (AC31–AC33, tranne la riga del README sul seeder nuovo, che arriva con la PR B).

**PR B, strumenti locali, in `src/server/db/seeds/local/`.** Lì vale la regola ESLint per cui l'app non importa i seed. Moduli, dal più profondo all'esterno:

```
day.ts           giorno di Roma, mezzanotte e mezzogiorno di Roma, guard "Roma = UTC" e "oggi = D"
types.ts         Dataset (righe per tabella, id espliciti) e Manifest (scenari, corse)
importRates.ts   la regola di AC14, pura, sul calendario di Roma, dal giorno D
generate.ts      generateDataset({ n, day }) → Dataset              puro, deterministico, nessun I/O
manifest.ts      buildManifest(dataset, day) → Manifest              puro: applica le tabelle della spec
write.ts         writeDataset(client, dataset)                       una transazione: TRUNCATE + INSERT
verify.ts        verifyManifest(client, manifest, dataset) → esiti   "passato" o "fallito", per scenario
cron.ts          runLocalCrons(client, manifest, jobs, now)          cronJobs con un Db iniettato
commands/seed.ts    seedLocal   (client, now e percorso del manifesto iniettati)
commands/cron.ts    cronLocal   (idem; l'unico modulo dei comandi che importa cron.ts)
commands/verify.ts  verifyLocal (idem)
seed.cli.ts      pnpm seed:local          connessione solo a mito_local, poi seedLocal
cron.cli.ts      pnpm seed:local:cron     idem, poi cronLocal (unico entry con --conditions=react-server)
verify.cli.ts    pnpm seed:local:verify   idem, poi verifyLocal
```

- **Il manifesto è un oracolo indipendente.** `buildManifest` scrive gli esiti attesi dalle tabelle della spec, senza chiamare `calculatePriority` né il codice dei cron, che renderebbe la verifica tautologica.
- **Il generatore non legge l'orologio.** Le rate di AC14 vengono da una funzione pura del giorno D (`importRates`). Un test la confronta con `calculateDebitoResiduo` dell'import a orologio fissato (D11).
- **Il database serve solo dove serve.** Generatore e manifesto sono puri: i criteri di distribuzione (AC8–AC27, AC30) si testano in memoria a 300 e a 10.000. Il database serve per scrittura, corse e verifica.
- **Le corse riusano `cronJobs`**, cioè le stesse funzioni di prod con lo stesso ciclo di `alert`.
  - Si eseguono con `Layer.succeed(Db, drizzle(conn, { schema }))`, sotto `tsx --conditions=react-server`: con quella condizione `server-only` risolve a `empty.js`, verificato il 2026-10-21 da tre esecuzioni indipendenti.
  - Solo `commands/cron.ts`, e quindi solo `cron.cli.ts`, importa `cron.ts`. Seed e verifica non raggiungono né `server-only` né `src/server/db/index.ts`, e lo prova il test di D7. Un `import()` dinamico non basterebbe: esbuild segue anche quelli letterali.
- **La verifica controlla anche quello che nessuno scenario dice (D14).** Dopo le corse confronta il database con il dataset riga per riga:
  - ogni riga cambiata o cancellata deve essere una riga selezionata del manifesto;
  - ogni riga nuova deve essere un followup di A1 o A2 con le sue 2 righe di log, oppure la riga `alert_resolved` di un alert di A3.

  Così una regola di selezione del manifesto diversa da quella del cron non passa in silenzio.

## 4. Decision ledger (risolto)

| # | Decisione | Fonte |
|---|---|---|
| D1 | `updatePractices`, `updateCustomerAge` e `cleanupTaskEventLog` diventano `Effect<number, DbError, Db>`, con le stesse query e senza transazione. `update.db.test.ts` controlla che le pratiche già scritte restino scritte quando una fallisce. Le rotte Next li eseguono con `DbLive` tramite `runPromiseExit` e, in caso di errore, passano a Sentry `Cause.squash(exit.cause)`, cioè il `DbError`, e rispondono come oggi. **Il dato inviato a Sentry cambia, e lo accettiamo:** oggi arriva il `DrizzleQueryError`, il cui messaggio contiene SQL e parametri, quindi dati dei clienti (`driverError.ts`); dopo arriva il `DbError`, con il `PostgresError` come `cause`, come già fanno `ErrorReporter` e `src/server/effect/trpc.ts`. `cronJobs` mappa `DbError` in `CronStepFailed` con lo stesso nome di step. Il comando locale passa un `Db` su `mito_local`. L'alternativa scartata era riscrivere le variabili d'ambiente prima dell'import. | Grill, Omar 2026-10-21 |
| D2 | Tre livelli di test:<br>- generatore e manifesto puri, a 300 e a 10.000;<br>- giro completo (seed, corse, verifica) su Postgres a 300 **e a 10.000 in CI**;<br>- AC6 (meno di 3 minuti) a mano su `mito_local`, perché dipende dalla macchina. | Grill, Omar 2026-10-21 |
| D3 | Due PR verso `dev`: la A (D1 + AC31–AC33) e la B (il resto). La B si apre dopo il merge della A. TB1–TB7 possono partire prima, perché non toccano i file della A. | Grill, Omar 2026-10-21 |
| D4 | Il codice nuovo sta in `src/server/db/seeds/local/`. La regola ESLint sugli import dei seed impedisce all'app di importarlo. | Dal codice |
| D5 | Tre entry point, ognuno con il suo script:<br>- `seed:local [--customers N]` → `seed.cli.ts`, default 10.000, minimo 300;<br>- `seed:local:cron [job…]` → `cron.cli.ts`, di default i quattro in ordine, sotto `tsx --conditions=react-server`;<br>- `seed:local:verify` → `verify.cli.ts`.<br>Gli entry point si collegano e chiamano le funzioni di `commands/seed.ts`, `commands/cron.ts` e `commands/verify.ts`, che ricevono `client` e `now`. Solo `commands/cron.ts` importa `cron.ts`. I test passano da quelle funzioni. | Dal codice; revisioni |
| D6 | Il manifesto è `.local-seed/manifest.json`, **relativo alla cartella da cui si lancia il comando** (`process.cwd()`; `pnpm` lancia dalla radice del repo), ignorato da git. Contiene D, `N`, gli scenari e le corse, ognuna con job, ora, esito e contatori del job.<br>- Il manifesto si scrive sempre in modo atomico: file temporaneo, poi `rename`.<br>- `seedLocal` cancella il manifesto prima di scrivere e lo riscrive solo dopo il commit.<br>- `cronLocal` registra la corsa come "iniziata" **prima** di eseguire il job e la aggiorna con esito e contatori dopo, anche se il job fallisce. Un'interruzione a metà lascia quindi una corsa iniziata e mai chiusa, che conta come fallita.<br>- `cronLocal` rifiuta un job già tentato dopo il seed, un job che nell'ordine `priority`, `alert`, `update`, `cleanup-task-event-log` viene prima di uno già tentato, e qualsiasi corsa dopo un tentativo fallito. Saltare un job è ammesso (AC28: ognuno si può lanciare da solo); la verifica però vuole le quattro corse.<br>- `verifyLocal` rifiuta un manifesto senza le quattro corse riuscite.<br>Dopo un fallimento serve un seed nuovo, perché `update` non è idempotente e scrive pratica per pratica. | Spec, Constraints; revisioni |
| D7 | Un test costruisce i tre entry point con esbuild (`bundle`, `metafile`, `write: false`, `packages: "external"`) e controlla tre cose:<br>- nessun grafo contiene `src/lib/global/loadDbEnv.ts`;<br>- nessuno importa il pacchetto esterno `dotenv`;<br>- i grafi di seed e verifica non contengono `src/server/db/index.ts`, che legge le variabili Supabase.<br>Controllo positivo: `createSystemOperator.ts` mostra sia `loadDbEnv.ts` sia `dotenv`. ESLint non basta: `no-restricted-imports` vede solo gli import diretti. | Dal codice; revisioni |
| D8 | Gli id sono espliciti, scritti con `overridingSystemValue()` (Drizzle 0.45). I tipi delle righe usano `InferInsertModel<T, { dbColumnNames: false; override: true }>`: `$inferInsert` toglie gli id `GENERATED ALWAYS`. Dopo la scrittura, `setval(pg_get_serial_sequence('"public"."<tabella>"', 'id'), max)` per ogni tabella, con il nome fra virgolette perché contiene il trattino. Il manifesto cita le pratiche per `pratica_id`. | Dal codice; revisioni |
| D9 | Nessun backlog, come D6 di Contatti: solo questo `PLAN.md`. | Convenzione del progetto |
| D10 | Ogni riga che un cron selezionerà sta in **uno e un solo** scenario di quel cron. Il generatore non crea righe selezionate che nessuno scenario descrive. Esempi: un `richiamare` con "Contattato il" e senza alert (varrebbe 30); un `richiamare` senza "Contattato il" con un alert da domani; una pratica con `rate_pagate = 0` e la liquidazione in D. | Spec, "Scenari dei cron" |
| D11 | AC14 lo calcola `importRates(liquidazione, rateTotali, importoRata, day)`, una funzione pura che riproduce `calculateDebitoResiduo` valutato a mezzogiorno di Roma di D, con queste regole:<br>- un mese dopo la liquidazione come `setMonth(+1)` sul calendario di Roma, compreso lo sforamento: il 31 gennaio diventa il 3 marzo, non il 28 febbraio;<br>- differenza **in valore assoluto** fra quel giorno e D, in giorni interi arrotondati per eccesso; un cambio dell'ora nel mezzo aggiunge un giorno, come nell'import;<br>- `ratePagate = floor(giorni / 30)`, al massimo `rate_totali`;<br>- `debitoResiduo = (rateTotali − ratePagate) × importoRata` con 2 decimali, e `null` (con rate 0) se manca la liquidazione, `rateTotali` o `importoRata`.<br>Il generatore evita le liquidazioni a meno di un mese da D, dove il valore assoluto dà rate positive.<br>Non chiama `calculateDebitoResiduo`, che legge `Date.now()`, modifica la data che riceve e dipende dal fuso del processo. Un test le confronta su molte pratiche con `vi.setSystemTime(romeNoon(D))`, passando all'import una copia della data. | Revisioni (BLOCKER B1) |
| D12 | **Importi interi.** Ogni pratica che `update` selezionerà ha `importo_rata` e `debito_residuo` in euro interi: la sottrazione in virgola mobile del cron è esatta. La verifica confronta comunque gli importi come numeri, con tolleranza 0,005. | Revisioni (M1) |
| D13 | **Nessun conflitto fra cron sulla stessa riga.** Una riga che uno scenario dichiara invariata (P2, P8, P9, U3, U7a, U7b, U10a–c, U11, A4, A5, L2) non è selezionata da un altro cron che la scrive. Un test di TB5 compone, riga per riga, gli esiti dei quattro cron nell'ordine delle corse e segnala ogni colonna "invariata" scritta da un cron successivo. Esempio: un P8 `richiamare` con alert scaduto avrebbe `updated_at` cambiato da `alert`. | Revisioni (M2) |
| D14 | **Completezza del manifesto.** Nei giri completi (TB8 a 300, TB10 a 10.000) la verifica confronta il database dopo le corse con il dataset:<br>- ogni riga cambiata o cancellata è `selected: true` nel manifesto. Negli scenari di `alert` sono `selected: true` sia l'alert sia il contatto di A1, A2 e A3, che il cron cambia tutti e due;<br>- ogni riga nuova è uno di questi casi: un followup di A1 o A2 con le sue 2 righe di log (`alert_resolved` e `state_change`), oppure l'unica riga `alert_resolved` di un alert di A3.<br>È anche una parte di `verifyManifest`, quindi vale per `seed:local:verify`. | Revisioni (M4) |
| D15 | **Ore e tempi nei test.**<br>- I test fissano un D **nel passato** e l'orologio a mezzogiorno di Roma di D.<br>- Le righe che i cron inseriscono prendono `CURRENT_TIMESTAMP` del database, cioè la data vera: con un D futuro, `cleanup` (che usa l'orologio finto) cancellerebbe le righe di log appena scritte da `alert`.<br>- La verifica non confronta `created_at` né `updated_at` delle righe inserite o cambiate dai cron. Confronta gli `updated_at` solo dove la spec li vuole invariati.<br>- L'orologio finto ferma anche il `Clock` di Effect: il budget di 40 s di `alert` non scade, quindi le "più chiamate" di `alert` non si osservano in CI. I volumi di AC30 si controllano con i contatori dei job salvati in `manifest.runs`. | Revisioni |

## 5. Assunzioni e vincoli

- **Spec approvata** con il lancio di `create-plan` (2026-10-21). T7.1c di Contatti passa a "Sostituito" e T7.3 non lo aspetta più.
- **Regole di `AGENTS.md`.**
  - Nessuno script con `NODE_ENV=production`.
  - Nessuna chiave del database in `.env`.
  - I tre comandi non importano `loadEnv` (AC7, D7).
  - Niente `next build` locale con i file env veri.
- **I comandi non leggono `.env*`.**
  - `tsx` non li carica, e i comandi non usano `dotenv` né `loadEnv`.
  - La connessione si costruisce con `localConnection(LOCAL_DATABASE_URL, { database: "mito_local" })`, passata come opzioni a `postgres()` e mai come DSN, così `PGHOST` e simili non la cambiano.
  - **Difesa in profondità:** `writeDataset` controlla `current_database()` prima del TRUNCATE. Accetta solo `mito_local` o un nome che inizia con `mito_test_`.
- **Il generatore non legge l'orologio, né il fuso del processo.**
  - Ogni data e ogni timestamp derivano da D, nessuno da `Date.now()` o da `new Date()`.
  - Tutte le colonne di timestamp sono valorizzate, comprese quelle con solo `$onUpdate` (`operator.updated_at`, `products.updated_at`).
  - faker 8.4.1 (`@faker-js/faker`, già fra le devDependencies) si usa con `seed` fisso e mai con le sue funzioni di date relative ad "adesso".
  - Le date si costruiscono sul calendario di Roma con funzioni di `day.ts`, mai con `setMonth` o `getDate` del fuso del processo.
- **Date con il fuso giusto.**
  - Mezzogiorno di Roma per: date di liquidazione e di nascita, ultimi import, `created_at` del log (comprese le righe sul confine di L1 e L2) e `closed_at`.
  - Mezzanotte di Roma per le scadenze degli alert, come le salva l'app.
  - Nessun `last_import_update` fra 29 e 31 giorni prima di D.
  - Nessuna riga di log nel giorno D − 3 mesi (`subMonths` di date-fns, come il cron).
- **AC14 e gli scenari di `update`.** Fuori dagli scenari, rate e debito seguono `importRates` e una `Liquidata` saldata è `Chiusa`. Le righe degli scenari di `update` sono l'eccezione che la spec ammette ("Fuori dagli scenari di `update`"). Per esempio, U4 è una `Liquidata` con le rate tutte pagate.
- **Test.**
  - `vi.useFakeTimers({ toFake: ["Date"] })` e `vi.setSystemTime(romeNoon(D))`, con D fisso nel passato (D15). I timer non si falsano, così i `setTimeout` di postgres.js ed `Effect.sleep` funzionano.
  - Gli esiti attesi valgono anche con la sessione in UTC (AC1a).
  - Il dataset a 10.000 si genera una volta per file (`beforeAll`), con timeout espliciti.
- **I D difficili si coprono nei test del generatore e del manifesto:**
  - un giorno qualunque;
  - il 31 maggio 2026 (`subMonths` → 28 febbraio 2026) e il 31 maggio 2028 (→ 29 febbraio, bisestile);
  - il 1° marzo 2027 (compleanni del 29 febbraio);
  - i giorni del cambio dell'ora (29 marzo e 25 ottobre 2026);
  - un D d'inverno con D − 3 mesi d'estate.
- **Indipendenza dal fuso del processo.** Un test genera il dataset in due processi, con `TZ=UTC` e con `TZ=Europe/Rome`, e confronta l'hash.
- **Effect e strumenti locali.** `AGENTS.md` chiede che il nuovo codice server stia in servizi Effect. I moduli del seeder sono strumenti locali: non girano nell'app né nel backend e nessuna rotta li chiama. Restano async, con `client` e `now` iniettati, che è la testabilità che la regola vuole ottenere. Le corse invece passano dai servizi Effect di prod (D1).
- **CI.** Il job Test ha `timeout-minutes: 10`. TB10 misura la durata con il giro a 10.000 e alza il limite se il job supera i 7 minuti. Per misurarla bisogna fare push.

## 6. Findings dal codice

- **Gli id identity sono `GENERATED ALWAYS`.** Senza `OVERRIDING SYSTEM VALUE` un id esplicito viene rifiutato. `customers.id` è `varchar` con default `nanoid()` calcolato una volta sola, quindi va sempre valorizzato.
- **FK reali** (`migrations/20240926195125_lucky_roughhouse.sql`):
  - `customers.chat_id` → `chat`, `customers.operator_id` → `operator`;
  - `practices.chat_id` → `chat`, `practices.operator_id` → `operator`;
  - `task.customer_id`, `task.operator_id`, `task.alert_id` → `alert`;
  - `alert.resolved_by` → `operator`;
  - senza FK: `alert.task_id`, `operator.user_id`, `messages`.
  - **Ordine di scrittura:** prodotti, utenti, operatori, chat e note, clienti, pratiche, legami, alert, contatti, log.
- **Colonne di data.** `birthday_date` e `data_liquidazione` sono `timestamptz`, quindi `DATE()` ed `EXTRACT()` dipendono dalla sessione: da qui il mezzogiorno di Roma. `task.created_at`, `task.updated_at` e `task_event_log.created_at` hanno default `CURRENT_TIMESTAMP`. `task.updated_at` ha anche `$onUpdate`.
- **`refreshPriorities`:**
  - seleziona i contatti attivi con `custom_priority = false`, escluso `chiamare` a 120;
  - scrive un UPDATE per valore di priorità e per blocchi di 5.000 id, in una transazione;
  - la liquidazione dà sempre 0, per il difetto di precedenza.
- **`calculatePriority` per `richiamare`:** +20 se la scadenza dell'alert è prima di adesso, +30 se c'è `closed_at`. Valori possibili: 0, 20, 30, 50.
- **`processDueAlerts(date, { budgetMs })`:**
  - legge il giorno di Roma da `date` e richiede l'operatore di sistema;
  - A3 azzera `task.alert_id`, A1 sostituisce il contatto attivo: tutti e due cambiano `updated_at` del contatto.
- **`cronJobs.update`** calcola il giorno UTC di adesso (`utcDay`). `updatePractices` sottrae in virgola mobile (D12).
- **`calculateDebitoResiduo`** (`src/app/api/import/_utils/index.ts:91`) legge `Date.now()`, modifica la data che riceve con `setMonth` e arrotonda per eccesso i giorni frazionari. Da qui D11.
- **I test esistenti dei tre servizi** passano dalle rotte (`update.db.test.ts`, `cleanupTaskEventLog.db.test.ts`) e da `api/src/cron/_test/cron.db.test.ts`. Le rotte controllano le chiamate a `captureException`, non la forma dell'errore. `cron.db.test.ts` non ha un caso di errore per `update` né per `cleanup`.
- **`server-only`.** vitest e `api/build.mjs` lo risolvono a `empty.js`. Sotto `tsx` serve `--conditions=react-server`. Il grafo di `jobs.ts` contiene `src/server/db/index.ts`, ma dopo D1 l'unico che lo usa è `DbLive`.
- **Mock nei test.** `src/test/setup.ts` e `pg.setup.ts` simulano `@/server/db`. Un `vi.mock` nel file di test vince su quello del setup, come già in `updateCustomer.test.ts`. `src/test/pg.ts` ha un proxy `unset` da prendere come modello. `extraDatabase()` crea un database vuoto, da migrare con `migrateDatabase` di `localDb.ts`.
- **`localDb.ts`.** `appliedMigrations` conta `drizzle.__drizzle_migrations`. Ogni riga ha `hash` (sha256 del file SQL, calcolato da Drizzle: il journal non lo contiene) e `created_at`, cioè il `when` della voce del journal.
- **ESLint.** `.eslintrc.cjs` spegne `no-restricted-imports` per `src/server/db/seeds/**` e `src/server/db/scripts/**`.
- **Chi nomina i seed di oggi, fuori da `brain/`:** `package.json`, `README.md`, `.env.example`, `src/lib/global/loadDbEnv.ts`. `CLAUDE.md` è un link ad `AGENTS.md`. `getRandomCustomerRole` la usa solo `seeds/customerToPratica.ts`.

## 7. Ricerca esterna

- **Drizzle 0.45:**
  - `insert(...).overridingSystemValue()` esiste (`pg-core/query-builders/insert.d.ts:50`);
  - `$inferInsert` esclude le colonne identity `always` senza `override: true` (`operations.d.ts`);
  - in un INSERT, una colonna con `$onUpdate` e senza default riceve il valore della funzione (`pg-core/dialect.js:382`).
- **tsx 4.16:** passa le opzioni di Node, quindi `--conditions=react-server` funziona su `api/src/cron/jobs.ts`.
- **esbuild 0.28:** `build({ bundle, metafile, write: false, packages: "external" })` risolve l'alias `@/` e restituisce in `metafile.inputs` i moduli del repo e, negli `imports`, i pacchetti esterni.
- **Effect 3:** il `Clock` di default legge `Date.now()` (`internal/clock.js`).

## 8. Grafo delle dipendenze

```
PR A   TA1 ─┐
       TA2 ─┴─ TA3 (gate e merge della A)
                 │
PR B   TB1 ─ TB2 ─ TB3 ─ TB4 ─ TB5 ─ TB6 ─ TB7 ─┐
                 TA3 ───────────────────────────┴─ TB8 ─┬─ TB9  ─┬─ TB11
                                                        └─ TB10 ─┘
```

TB5 e TB6 sono in sequenza perché tutti e due toccano `types.ts`. TB6 lo usa e non lo cambia: se gli serve un campo, lo aggiunge TB5.

## 9. Task

### PR A — servizi dei cron su Effect, via i seed di oggi

#### TA1: I tre servizi dei cron prendono `Db`
- **depends_on**: []
- **location**: `src/server/services/cron/updatePractices.ts`, `updateCustomerAge.ts`, `cleanupTaskEventLog.ts`; `src/app/api/cron/update/route.ts`, `src/app/api/cron/cleanupTaskEventLog/route.ts`; `api/src/cron/jobs.ts`; `api/src/cron/_test/cron.db.test.ts`; test nuovo `src/server/services/cron/_test/cronServices.db.test.ts`
- **description**: Porta i tre servizi su Effect (D1) con `query` di `@/server/effect/db`:
  - `updatePractices(today)`, `updateCustomerAge(month, day)` e `cleanupTaskEventLog(now)`: tutti `Effect<number, DbError, Db>`;
  - stesse query, stesso `shouldUpdate` su `Date.now()`, stessi valori restituiti;
  - **nessuna transazione:** una pratica fallita lascia scritte le precedenti, come oggi.

  Chiamanti:
  - **Rotte Next:** eseguono i programmi con `Effect.runPromiseExit(... .pipe(Effect.provide(DbLive)))`. In caso di errore passano a `Sentry.captureException` `Cause.squash(exit.cause)`, cioè il `DbError` (D1), e rispondono come oggi.
  - **`cronJobs`:** in `update` e in `cleanup-task-event-log` usa i servizi direttamente e mappa `DbError` in `CronStepFailed({ step, cause })` con gli stessi nomi di step.

  Nessun altro file cambia, a parte i test.
- **validation**:
  - Restano verdi senza cambiare le asserzioni `update.db.test.ts` (compreso il caso "un errore del database su una pratica lascia aggiornate quelle già scritte"), `cleanupTaskEventLog.db.test.ts`, `cron.db.test.ts` e `cronScripts.test.ts`.
  - Nei test delle due rotte, un'asserzione nuova: con un errore del database, `captureException` riceve un `DbError` il cui `cause` è l'errore di Postgres, e nel suo messaggio non ci sono i parametri della query.
  - In `cron.db.test.ts`, un caso nuovo per `update` e uno per `cleanup`: con un errore forzato del database (`failNextUpdateOf`, o un trigger come nei test esistenti) il job fallisce con `CronStepFailed` e lo step giusto.
  - Il file nuovo ha un suo `vi.mock("@/server/db")` con un proxy che lancia a ogni query, come `unset` di `src/test/pg.ts`. Non usa `@/test/factories` né il caller di test, che importano `db`. Inserisce con `testDb` (con il cast a `DbClient`). In queste condizioni i tre servizi, eseguiti con `Layer.succeed(Db, testDb)`, aggiornano o cancellano le righe giuste.
  - Passano `next lint`, `tsc --noEmit`, `pnpm api:build` e `pnpm api:smoke`.
- **status**: Done (2026-10-21, commit `7217d93`)
- **log**: Worker sul modello dell'orchestratore, una sola passata. Revisione dell'orchestratore: diff dei tre servizi, delle rotte e di `jobs.ts`; nei test esistenti cambiano solo gli import. Suite completa con Postgres verde (141 file, 2.122 test), `next lint`, `tsc`, `api:build` e `api:smoke` verdi. In più rispetto al piano: anche `console.error` delle rotte stampa il `DbError`, quindi niente SQL con i dati dei clienti nemmeno nei log.
- **files edited/created**: `src/server/services/cron/{updatePractices,updateCustomerAge,cleanupTaskEventLog}.ts`, `src/app/api/cron/update/route.ts`, `src/app/api/cron/cleanupTaskEventLog/route.ts`, `api/src/cron/jobs.ts`, `api/src/cron/_test/cron.db.test.ts`, `src/app/api/cron/update/_test/update.db.test.ts`, `src/app/api/cron/cleanupTaskEventLog/_test/cleanupTaskEventLog.db.test.ts`, nuovo `src/server/services/cron/_test/cronServices.db.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "`cleanupTaskEventLog(now)` con un `Db` iniettato cancella le righe più vecchie di 3 mesi anche quando il `db` globale lancia a ogni query".
- **review_mode**: cli
- **complexity**: high

#### TA2: Via i seed di oggi (AC31–AC33)
- **depends_on**: []
- **location**: `package.json`, `src/server/db/seeds/*.ts` (i dieci file di AC31), `src/server/db/schema/relations/customerToPratica.ts`, `README.md`, `.env.example`, `src/lib/global/loadDbEnv.ts`, `.eslintrc.cjs`, `AGENTS.md`, `brain/chore/migration/fase-1/t2-packages-db.md`, `brain/chore/migration/fase-1-database-postgres.md`
- **description**:
  - Toglie da `package.json` `seed:db`, `seed:delete`, `seed:delete:dev` e `seed:delete:test`.
  - Cancella i dieci file di AC31 e `getRandomCustomerRole`.
  - Toglie dal README la sezione "Comandi per svuotare db e ricaricarlo". La riga sul seeder nuovo nella sezione "Database locale" arriva con TB9.
  - Toglie le citazioni dei seed tolti da `.env.example`, dal commento di `loadDbEnv.ts`, da `.eslintrc.cjs` e da `AGENTS.md` (`CLAUDE.md` è un link). Restano i pattern `**/seeds` della regola ESLint: servono al seeder nuovo (D4).
  - Aggiorna i due piani F1.T2 del brain: i seed da spostare in `packages/db` non ci sono più.
- **validation**:
  - `git grep -nE "seed:(db|delete|clear)" -- ':!brain'` non trova niente (AC33).
  - `git grep -n getRandomCustomerRole -- ':!brain'` non trova niente (AC31).
  - Fra gli script di `package.json` che svuotano o riempiono tabelle restano solo `db:local:reset`, `test:pg` e `test` (AC32; il seeder arriva con la PR B).
  - Lint, `tsc` e test verdi.
- **status**: Done (2026-10-21, commit `bff0ec3`)
- **log**: Worker haiku, una sola passata. I due `git grep` sono vuoti. Correzione dell'orchestratore: il commento e il messaggio della regola ESLint dicevano ancora che i seed caricano le credenziali; ora dicono che svuotano un database. `delete:export*` resta fra gli script: AC32 esclude i cron.
- **files edited/created**: `package.json`, i dieci file di `src/server/db/seeds/` (cancellati), `src/server/db/schema/relations/customerToPratica.ts`, `README.md`, `.env.example`, `src/lib/global/loadDbEnv.ts`, `.eslintrc.cjs`, `AGENTS.md`, `brain/chore/migration/fase-1/t2-packages-db.md`, `brain/chore/migration/fase-1-database-postgres.md`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: n/a (rimozione). Il controllo che prima fallisce e poi passa è il `git grep` della validation.
- **review_mode**: cli
- **complexity**: low

#### TA3: Gate e merge della PR A
- **depends_on**: [TA1, TA2]
- **location**: —
- **description**:
  - Apre la PR A verso `dev` con i gate di CI: Lint, Test (con i `*.pg.test.ts` eseguiti), Build, Backend build e smoke.
  - La descrizione dice che il comportamento dei cron non cambia e che i seed tolti non hanno sostituti fino alla PR B.
  - Dopo il merge, la PR B riparte da `dev`.
- **validation**: CI verde sulla testa della PR; merge in `dev`.
- **status**: In progress: [PR #55](https://github.com/omardeangelis/mito-micro-services/pull/55) aperta verso `dev` il 2026-10-21
- **log**: PR aperta dall'orchestratore (scelta di Omar sulle branch). In attesa della CI e della revisione.
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: n/a (gate)
- **review_mode**: cli
- **complexity**: low

### PR B — seeder, manifesto, corse e verifica

#### TB1: Giorno di riferimento, rate dell'import, tipi
- **depends_on**: []
- **location**: `src/server/db/seeds/local/day.ts`, `importRates.ts`, `types.ts`, `_test/day.test.ts`, `_test/importRates.test.ts`
- **description**:
  - **`day.ts`** (calendario di Roma, mai il fuso del processo):
    - `romeDay(instant)`;
    - `romeMidnight(day)` e `romeNoon(day)`, che restituiscono `Date`;
    - `addDays(day, n)`, `addMonthsDay(day, n)` e `subMonthsDay(day, n)`;
    - `assertSameRomeAndUtcDay(now)`, che lancia con il messaggio di AC4: `alert` calcola il giorno a Roma, `update` in UTC sul backend e con l'ora della macchina sulle rotte Next;
    - `assertIsToday(day, now)` per AC28b.
  - **`importRates.ts`** (D11): `importRates(liquidazione, rateTotali, importoRata, day)` restituisce `{ ratePagate, rateResidue, debitoResiduo }` con la regola delle Technical Notes della spec, valutata a mezzogiorno di Roma di D. Non modifica i suoi argomenti.
  - **`types.ts`**: definisce tutti i tipi. Dopo questo task li cambia solo TB5.
    - `Dataset`: righe per tabella, con `InferInsertModel<T, { dbColumnNames: false; override: true }>` e id espliciti (D8).
    - `Manifest`: `{ day, n, scenarios: { id, cron, rows: { table, key, selected, expected }[] }[], runs: { job, at, outcome, counters }[] }`, serializzabile in JSON.
- **validation**:
  - **`day.ts`:**
    - le 22:30 UTC del 21 ottobre 2026 sono le 00:30 del 22 a Roma e fermano `assertSameRomeAndUtcDay`;
    - mezzogiorno di Roma cade nello stesso giorno UTC anche il 29 marzo e il 25 ottobre 2026;
    - `subMonthsDay("2026-05-31", 3)` è `2026-02-28`, quello del `2028-05-31` è `2028-02-29`.
  - **`importRates`:** su almeno 1.000 combinazioni (liquidazioni nei due anni prima di D, anche il 29, 30 e 31 del mese, rate, D nei giorni difficili del §5) dà lo stesso risultato di `calculateDebitoResiduo(copia, ...)` con l'orologio a `romeNoon(D)`. Il confronto gira in un **processo figlio avviato con `TZ=Europe/Rome`**, perché vitest 1.6 usa i thread e un `TZ` impostato nel test non cambia il fuso delle `Date`. Il figlio controlla prima che l'offset di gennaio sia +60 minuti. Dopo la chiamata la data di liquidazione è invariata.
- **status**: Done (2026-10-21, commit `0a824b5`)
- **log**: Worker sonnet, una sola passata. 23 test verdi; il confronto con `calculateDebitoResiduo` in un processo figlio con `TZ=Europe/Rome` copre 10.031 combinazioni senza differenze, anche intorno ai cambi dell'ora. `server-only` non serve: l'import di `src/app/api/import/_utils` gira sotto tsx senza condizioni. `chat_to_operator` non è nel `Dataset`: il seed non lo scrive.
- **files edited/created**: `src/server/db/seeds/local/{day,importRates,types}.ts`, `_test/day.test.ts`, `_test/importRates.test.ts`, `_test/importRatesCases.ts`, `_test/importRatesChild.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "`assertSameRomeAndUtcDay` si ferma alle 00:30 di Roma del 22 ottobre 2026 (22:30 UTC del 21) e passa a mezzogiorno di Roma".
- **review_mode**: cli
- **complexity**: medium

#### TB2: Generatore, parte 1: clienti, pratiche e legami
- **depends_on**: [TB1]
- **location**: `src/server/db/seeds/local/generate.ts` (o `generate/customers.ts` e `generate/practices.ts`), `_test/generate.test.ts`
- **description**: `generateDataset({ n, day })` restituisce clienti, prodotti, pratiche e legami. Si ferma se `n` è minore di 300. Requisiti:
  - **Legami per cliente (AC8–AC10):** `floor(N/6)` clienti con 3 legami, `floor(2N/6)` con 2, gli altri con 1. Fra i `G` clienti con un legame: `floor(G/2)` Intestatari, `floor(G/4)` Coobbligati, gli altri Garanti.
  - **Composizione delle pratiche (AC11–AC12):** un solo Intestatario per pratica, al più un Coobbligato e un Garante; le combinazioni di ruoli e le composizioni di AC11 e AC12.
  - **Stati e prodotti (AC13):** ogni `State`, ogni codice di `productMap`, `is_wave` con tutti e due i valori. `products` ha una riga per prodotto.
  - **Rate (AC14):** con `importRates` al giorno D. Una `Liquidata` saldata diventa `Chiusa`, tranne le righe degli scenari di `update` (§5).
  - **Clienti (AC15–AC16):** varietà di `blacklist_status` e `source`; codice fiscale di 16 caratteri o partita IVA; `temp_id` e `unique_hash` unici; dati finti; email su `.test` o `example.com`.
  - **Righe degli scenari di `update` (U1–U11):**
    - scadenze della rata in D, D − 1 e D + 1;
    - importi in euro interi (D12);
    - liquidazioni, nascite e ultimi import a mezzogiorno di Roma, con `last_import_update` fuori dalla fascia 29–31 giorni.
  - **Volume (AC30):** a 10.000, almeno 200 pratiche selezionate da `update` e almeno 100 clienti nati nel mese e nel giorno di D.
  - **Determinismo:** solo da `n` e `day`, con faker a `seed` fisso. Ogni timestamp è valorizzato, `products.updated_at` compreso.
- **validation**: test unitari a `N` = 300 e a `N` = 10.000, con il dataset generato una volta per file:
  - conteggi esatti di AC8 e AC10 (1.666, 3.333 e 5.001; 2.500, 1.250 e 1.251);
  - AC9 e AC11–AC16;
  - le righe di U1–U11 e le soglie di `update` di AC30;
  - due chiamate danno righe uguali con l'orologio alle 01:30 e alle 23:30 di Roma dello stesso giorno (AC5);
  - l'hash del dataset è uguale in un processo con `TZ=UTC` e in uno con `TZ=Europe/Rome`;
  - `n = 299` si ferma.
- **status**: Done (2026-10-21, commit `17c905f`)
- **log**: Worker sonnet, una sola passata. 96 test del generatore (a 300, a 10.000 e a 300 con quattro D difficili), determinismo con l'orologio a due ore e con tre processi (in-process, `TZ=UTC`, `TZ=Europe/Rome`). A 10.000: 9.345 pratiche, 250 selezionate da `update`, 139 clienti nati nel giorno di D, generazione in 3,5 s. Revisione dell'orchestratore: nessuna pratica generica è selezionata da `update`; importi in euro interi. File in più rispetto al brief: `generate/links.ts`, `generate/scenarios.ts`.
- **files edited/created**: `src/server/db/seeds/local/generate.ts`, `generate/{random,links,customers,practices,scenarios}.ts`, `_test/generate.test.ts`, `_test/generateHashChild.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "`generateDataset({ n: 10_000, day })` ha esattamente 1.666 clienti con 3 legami, 3.333 con 2 e 5.001 con 1".
- **review_mode**: cli
- **complexity**: medium

#### TB3: Generatore, parte 2: utenti, operatori e assegnazione dei clienti
- **depends_on**: [TB2]
- **location**: `src/server/db/seeds/local/generate.ts` (o `generate/operators.ts`), `_test/generate.test.ts`
- **description**:
  - **Utenti (AC17):** 25 utenti `OPERATORE` e 3 `ADMIN`, ognuno con la sua riga in `operator`, più l'operatore di sistema (`user_id = 'system'`, senza utente). `operator.updated_at` è valorizzato. Le email degli utenti sono su `.test` o `example.com` (AC16).
  - **Assegnazione dei clienti.** La quota di clienti con un contatto attivo vale per tutti gli operatori ed è una costante esportata, `ACTIVE_CONTACT_SHARE` (per esempio 0,80), che TB4 usa. Su questa base i clienti si assegnano così:
    - un operatore ha il 35% dei clienti con operatore;
    - 18 operatori si dividono quote fra il 2% e l'8%;
    - un operatore non ha clienti;
    - almeno un admin ha clienti;
    - il 3% dei clienti non ha operatore.

  Il controllo di AC18 sui contatti attivi sta in TB4. Se non torna, TB4 corregge queste quote.
- **validation**: test unitari a 300 e a 10.000: AC17; le email degli utenti (AC16); le quote di assegnazione dei clienti; determinismo.
- **status**: Done (2026-10-21)
- **log**: Worker sonnet, una sola passata. 28 utenti, 29 operatori (il sistema è l'ultimo, id 1028). Quote: 3% dei clienti senza operatore; un operatore al 35%; 18 fra 2,2% e 3,8%; 5 all'1,4%; uno senza clienti; admin al 2,4%, 1,6% e 1,2%. `ACTIVE_CONTACT_SHARE` = 0,8. Due asserzioni di TB2 ristrette perché ora utenti, operatori e `customers.operatorId` sono valorizzati.
- **files edited/created**: `src/server/db/seeds/local/generate/operators.ts` (nuovo), `generate.ts`, `generate/customers.ts` (export di `slug`), `_test/operators.test.ts`, `_test/generate.test.ts`
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "il dataset ha 25 `OPERATORE`, 3 `ADMIN`, 29 righe di `operator` e una sola con `user_id = 'system'`".
- **review_mode**: cli
- **complexity**: medium

#### TB4: Generatore, parte 3: contatti, alert, note e log
- **depends_on**: [TB3]
- **location**: `src/server/db/seeds/local/generate.ts` (o `generate/contacts.ts`), `_test/generate.test.ts`
- **description**: Contatti, alert, chat e note, `task_event_log`.
  - **Contatti attivi (AC18–AC22):**
    - al massimo un contatto attivo per cliente, con lo stesso operatore del cliente (o senza);
    - AC18 sui contatti attivi;
    - almeno il 70% dei clienti con un contatto attivo e almeno il 10% senza contatti;
    - ogni `task_status` fra gli attivi, almeno 20 volte a 10.000;
    - priorità manuali 20, 60, 100 e 120.
  - **Storico e alert (AC23–AC24):**
    - contatti non attivi con esito e `closed_at`, almeno 100 a 10.000 con un operatore diverso da quello del cliente. Nessun contatto, attivo o no, è dell'operatore senza carico, che non ha né clienti né contatti (AC18);
    - contatti riaperti;
    - alert aperti solo su `richiamare` attivi, collegati nei due versi, al massimo uno per cliente;
    - alert risolti con `resolved_by` su contatti non attivi.
  - **Note e log (AC25–AC26):**
    - chat solo sui clienti, mai condivise, con 1–4 note;
    - log di ogni `action` e `source`, coerente con i contatti, negli ultimi 6 mesi, a mezzogiorno di Roma, mai nel giorno D − 3 mesi.
  - **Righe degli scenari:**
    - P1–P12, A1–A5, L1–L2, comprese le righe sul confine di AC27;
    - la priorità scritta per ogni riga selezionata da `priority` è diversa dall'esito atteso;
    - nessuna combinazione fuori dalle tabelle (D10);
    - nessun contatto attivo con `state` o `priority` vuoti: `not(and(state = 'chiamare', priority = 120))` vale NULL e il cron lo salterebbe senza dirlo;
    - precedenza fra P3 e P10: le righe di P3 hanno una priorità di seed diversa da 10 e da 120, quelle di P10 hanno 120; così ogni `non interessato` sta in uno scenario solo;
    - nessuna riga "invariata" per uno scenario e scritta da un altro cron (D13): le righe di P2 e P8 sono senza alert scaduti.
  - **Volume (AC30):** a 10.000:
    - almeno 5.001 attivi con lo stesso esito di priorità;
    - almeno 1.000 alert aperti con scadenza in D o prima;
    - almeno 1.000 righe di log più vecchie di 3 mesi.
  - **Ordine delle righe:** è quello degli id, e ogni timestamp è valorizzato.
- **validation**: test unitari a 300 e a 10.000:
  - AC18–AC26;
  - un indice in memoria prova che nessun cliente ha due contatti attivi e che ogni alert aperto è collegato nei due versi;
  - determinismo;
  - con i D difficili del §5, AC23–AC26 valgono ancora.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "ogni alert aperto del dataset appartiene al contatto attivo `richiamare` del suo cliente, collegato nei due versi, e nessun cliente ne ha due".
- **review_mode**: cli
- **complexity**: high

#### TB5: Manifesto degli esiti attesi
- **depends_on**: [TB4]
- **location**: `src/server/db/seeds/local/manifest.ts`, `types.ts` (solo se serve un campo), `_test/manifest.test.ts`
- **description**: `buildManifest(dataset, day)` applica a ogni riga le regole di selezione dei quattro cron, scritte dalla spec e non importate dal codice dei cron:
  - `priority`: attivo, `custom_priority = false`, non `chiamare` a 120;
  - `alert`: aperto, collegato nei due versi, scadenza di Roma in D o prima;
  - `update`: `DATE(liquidazione) + rate_pagate × 30 = D`; clienti nati nel mese e nel giorno di D;
  - `cleanup`: righe create prima di D − 3 mesi.

  Ogni riga va nello scenario di cui ha le caratteristiche, con `selected` ed `expected` dalle tabelle P, A, U e L della spec. Per esempio:
  - P1 → 120;
  - A1 → nuovo `followup` a 150 con lo stesso "Contattato il" e 2 righe di log;
  - U4 → `Chiusa` con le rate invariate;
  - A6 → il job `alert` riuscito, letto da `manifest.runs`.

  Per una riga toccata da più cron, `expected` è lo stato finale dopo le quattro corse in ordine (AC29). Le colonne di tempo scritte dal database non entrano in `expected` (D15).
- **validation**: test unitari a 300 e a 10.000:
  - ogni riga selezionata da un cron sta in uno e un solo scenario di quel cron (D10);
  - la composizione degli esiti dei quattro cron, riga per riga e in ordine di corsa, non scrive nessuna colonna dichiarata invariata (D13);
  - ogni caso di ogni riga delle tabelle ha almeno una riga, comprese le righe sul confine di L1 e L2 (AC27);
  - le soglie di AC30;
  - per ogni riga selezionata da `priority`, la priorità del seed è diversa da `expected`;
  - P2, P8 e P9 registrano priorità e `updated_at` del seed come attesi invariati;
  - il manifesto è serializzabile in JSON ed è uguale fra due chiamate.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "ogni contatto che `priority` selezionerà sta in esattamente uno scenario P, con una priorità di seed diversa da quella attesa".
- **review_mode**: cli
- **complexity**: high

#### TB6: Scrittura del dataset
- **depends_on**: [TB5]
- **location**: `src/server/db/seeds/local/write.ts`, `_test/write.pg.test.ts`
- **description**: `writeDataset(client, dataset)`, su un `DbClient`, in **una transazione**:
  - controlla `current_database()`: accetta solo `mito_local` o un nome che inizia con `mito_test_`;
  - imposta `lock_timeout`, così un'altra sessione aperta non lo lascia appeso;
  - svuota tutte le tabelle di `public` con `TRUNCATE ... RESTART IDENTITY CASCADE` (AC3);
  - inserisce in ordine di FK (§6) a blocchi sotto i 65.535 parametri, con `overridingSystemValue()` dove l'id è identity;
  - alla fine, `setval` di ogni sequenza oltre il massimo (D8).

  Le date passano come `Date`, quindi il fuso della sessione non conta. Un errore annulla tutto e lascia il database com'era.
- **validation**: test su Postgres a `N` = 300, con la sessione in UTC:
  - righe scritte prima del seed in altre tabelle (un utente `ADMIN`, una `session`, una riga di `cron_run`) non ci sono più (AC3);
  - le righe per tabella sono quelle del dataset;
  - `task_customer_active_uidx` e le FK non rifiutano niente;
  - due scritture con l'orologio a due ore diverse danno un dump uguale di tutte le tabelle, id e timestamp compresi (AC5);
  - un inserimento successivo senza id riceve un id oltre il massimo;
  - un dataset con una riga invalida (FK mancante) fallisce e lascia le righe di prima;
  - con un client il cui `current_database()` restituisce un altro nome (un client finto), si ferma prima del TRUNCATE. Non si crea un database con un altro nome, che sfuggirebbe alla pulizia di `extraDatabase` e al controllo "No test database left" della CI;
  - imposta un `lock_timeout` (per esempio 10 s): con una transazione aperta su una tabella, per esempio da `db:studio` o da psql, si ferma con un messaggio invece di restare appeso.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "dopo due `writeDataset` dello stesso dataset, con l'orologio a due ore diverse, il dump di tutte le tabelle è identico, `created_at` e `updated_at` compresi".
- **review_mode**: cli
- **complexity**: medium

#### TB7: Verifica
- **depends_on**: [TB6]
- **location**: `src/server/db/seeds/local/verify.ts`, `seed.ts` (`seedDatabase(client, { n, day })`: genera, scrive, restituisce dataset e manifesto), `_test/verify.pg.test.ts`
- **description**: `verifyManifest(client, manifest, dataset)` restituisce, per scenario, "passato" o "fallito" con le righe che non tornano (chiave, atteso, trovato).
  - **Confronto con `expected`:**
    - gli importi come numeri, con tolleranza 0,005 (D12);
    - nessuna colonna di tempo scritta dal database (D15).
  - **Casi particolari:**
    - A1 e A2: trova il nuovo contatto attivo del cliente e le sue 2 righe di log;
    - U3: tutte le colonne invariate;
    - L1: le righe sparite;
    - A6: da `manifest.runs`.
  - **Controllo di completezza (D14):** righe cambiate, cancellate o nuove fuori dal manifesto. Esce come scenario a sé, "completezza".
  - **Contatori dei job (AC30):** quelli di `manifest.runs` contro le soglie di volume, **solo con `n` = 10.000**, come chiede AC30.
- **validation**: test su Postgres a 300:
  - su un seed appena fatto, senza corse, gli scenari con un esito atteso diverso dal seed falliscono; quelli con esito "invariato" (P2, P8, P9, U3, U7a, U7b, U10a–c, U11, A4, A5, L2) passano;
  - scrivendo a mano 120 su ogni riga di P1, P1 passa;
  - cambiando una riga di P2, P2 fallisce e cita quella riga;
  - cambiando una riga che non è in nessuno scenario, "completezza" fallisce e la cita.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "su un seed appena fatto, P1 è fallito e cita le sue righe; dopo aver scritto 120 su quelle righe, P1 è passato".
- **review_mode**: cli
- **complexity**: high

#### TB8: Corse dei cron su un database iniettato
- **depends_on**: [TA3, TB7]
- **location**: `src/server/db/seeds/local/cron.ts`, `_test/cron.pg.test.ts`
- **description**: `runLocalCrons(client, manifest, jobs, now)`:
  - controlla AC28b con `assertIsToday(manifest.day, now)` e `assertSameRomeAndUtcDay(now)`;
  - controlla D6: niente job già tentato, ordine rispettato, nessun tentativo fallito prima;
  - esegue `cronJobs[job].run` con `Layer.succeed(Db, client)` (un client `drizzle(conn, { schema })`) e un `ErrorReporter` che stampa e conta;
  - prima di ogni job aggiunge a `manifest.runs` la corsa "iniziata", dopo la completa con esito e contatori. Passa il manifesto al chiamante in tutti e due i momenti, con una callback, così il chiamante lo salva anche se il job fallisce o il processo si interrompe (D6);
  - un job fallito ferma le corse.

  `delete-export` non è fra i job ammessi. Il modulo importa `api/src/cron/jobs.ts`.
- **validation**: test su Postgres, D fisso nel passato, orologio a mezzogiorno di Roma, sessione in UTC.
  - **Mock:** il file ha un suo `vi.mock("@/server/db")` con un proxy che lancia a ogni query.
  - **Database di destinazione:** le corse girano su un `extraDatabase()` migrato con `migrateDatabase`, con `resetDb` o un database nuovo fra un test e l'altro.
  - **AC29, AC1a, D14:** `seedDatabase(N = 300)`, poi le quattro corse in ordine, poi `verifyManifest` → tutti gli scenari passati, "completezza" compresa.
  - **AC28a, parte strutturale:** il proxy di `@/server/db` non riceve nessuna chiamata, perché ogni query lancerebbe.
  - **AC28b:** con l'orologio a D + 1, oppure alle 00:30 di Roma, `runLocalCrons` si ferma senza scrivere.
  - **D6:**
    - una seconda corsa di `update` viene rifiutata;
    - `alert` prima di `priority` viene rifiutato;
    - dopo un job fallito ogni corsa successiva viene rifiutata, e `manifest.runs` registra il fallimento. L'errore si forza su una pratica con un trigger scritto nel test sul database di destinazione: `@/test/failpoint` funziona solo su PGlite;
    - una corsa registrata come "iniziata" e mai chiusa conta come fallita.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "dopo `seedDatabase(N = 300)` e le quattro corse in ordine, `verifyManifest` dà tutti gli scenari passati, con la sessione in UTC e il `db` globale che lancia a ogni query".
- **review_mode**: cli
- **complexity**: high

#### TB9: Comandi, guard e documentazione
- **depends_on**: [TB8]
- **location**: `src/server/db/seeds/local/commands/seed.ts`, `commands/cron.ts`, `commands/verify.ts`, `seed.cli.ts`, `cron.cli.ts`, `verify.cli.ts`; `src/server/db/scripts/localDb.ts` (esporta `pendingMigrations(client)` e la funzione di connessione locale); `package.json`, `.gitignore`, `README.md` (sezione "Database locale"); `_test/commands.pg.test.ts`, `_test/connection.test.ts`, `_test/imports.test.ts`, `_test/cronCli.test.ts`
- **description**:
  - **`commands/`** contiene la logica dei comandi, un file per comando, con `client`, `now` e il percorso del manifesto iniettati. Solo `commands/cron.ts` importa `cron.ts` (D7):
    - **`seedLocal({ client, now, n, manifestPath })`:**
      - controlla `n` ≥ 300 e AC4, poi `pendingMigrations`, prima di scrivere qualsiasi cosa;
      - se ci sono migrazioni da applicare si ferma e indica `pnpm db:local:migrate` (AC2);
      - cancella il vecchio manifesto, poi scrive il dataset con D = `romeDay(now)`, poi scrive il manifesto nuovo (D6).
    - **`cronLocal({ client, now, jobs, manifestPath })`:** chiama `runLocalCrons` e salva il manifesto, in modo atomico, prima di ogni job (corsa "iniziata") e dopo (esito e contatori), come vuole D6.
    - **`verifyLocal({ client, now, manifestPath })`:**
      - controlla AC28b (oggi = D, Roma = UTC) e le quattro corse riuscite (D6);
      - rigenera il dataset da `n` e `day` del manifesto;
      - chiama `verifyManifest` e restituisce le righe da stampare e l'exit code.
  - **`pendingMigrations`** (AC2) confronta le migrazioni del repo con le righe di `drizzle.__drizzle_migrations`. Per ogni voce del journal: il `when` contro `created_at` (che torna come stringa di un `bigint`), e lo sha256 del file SQL, calcolato come fa `readMigrationFiles` di Drizzle, contro `hash`. Si ferma su una voce mancante, su una riga in più o su un valore diverso.
  - **I tre entry point** (D5) si collegano con `localConnection(LOCAL_DATABASE_URL, { database: "mito_local" })` passata come opzioni (AC1), poi chiamano il loro file di `commands/`.
  - **Script e documentazione:**
    - script in `package.json`;
    - `.local-seed/` in `.gitignore`;
    - README: il giro `db:local:up`, `db:local:reset`, `db:local:migrate`, `seed:local`, `seed:local:cron`, `seed:local:verify`, e un seed nuovo ogni giorno o dopo una corsa fallita (AC33).
- **validation**:
  - **Unitari:**
    - la funzione di connessione rifiuta un host non locale, un database diverso da `mito_local` e un DSN con query string (AC1);
    - con `PGHOST`, `PGDATABASE`, `PGPORT`, `SUPABASE_*` e `INSTANCE_UNIX_SOCKET` ostili restituisce sempre `127.0.0.1:54329/mito_local` (AC28a);
    - `--customers 299` si ferma.
  - **Su Postgres, con le funzioni di `commands/`:**
    - `seedLocal` alle 00:30 di Roma si ferma con il messaggio di AC4 e non scrive niente, nemmeno il manifesto;
    - su un database migrato fino a una migrazione precedente si ferma prima di scrivere, citando `pnpm db:local:migrate` (AC2);
    - con una riga di migrazione in più, oppure con un `created_at` diverso, si ferma;
    - `verifyLocal` a D + 1 o alle 00:30 di Roma si ferma con codice diverso da zero (AC28b);
    - con una corsa mancante si ferma (D6);
    - con uno scenario fallito esce con codice diverso da zero (AC29);
    - un `seedLocal` fallito a metà lascia il database com'era e nessun manifesto.
  - **Import (AC7, D7):** il test esbuild su `seed.cli.ts`, `cron.cli.ts` e `verify.cli.ts` passa, e il controllo positivo su `createSystemOperator.ts` lo fa fallire.
  - **AC28a, sul comando vero** (`cronCli.test.ts`):
    - il test lancia `tsx --conditions=react-server cron.cli.ts` come sottoprocesso;
    - la cartella di lavoro è temporanea e contiene `.env` e `.env.development.local` con `SUPABASE_DB_CONNECTION_STRING` verso un listener TCP del test;
    - l'ambiente punta allo stesso listener con `SUPABASE_*`, `PG*` e `INSTANCE_UNIX_SOCKET`;
    - il manifesto è di oggi e sta nella cartella temporanea, che è la `cwd` del figlio. Il figlio riceve `--tsconfig <repo>/tsconfig.json`: senza, da un'altra cartella l'alias `@/` non si risolve;
    - `INSTANCE_UNIX_SOCKET` punta a una cartella temporanea con un listener Unix su `.s.PGSQL.5432`;
    - **esito atteso:**
      - il listener TCP ostile e quello Unix non ricevono connessioni;
      - un secondo listener sulla porta 54329 ne riceve almeno una;
      - il `.local-seed/manifest.json` del repo, se esiste, ha lo stesso hash di prima.

    Il test si salta, dicendolo, quando la porta 54329 è occupata (un `mito_local` acceso) e quando il giorno di Roma e quello UTC sono diversi.
  - `next lint` e `tsc` passano.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "`seedLocal` su un database con una migrazione mancante si ferma senza scrivere e il messaggio cita `pnpm db:local:migrate`".
- **review_mode**: cli
- **complexity**: high

#### TB10: Giro completo a 10.000 in CI
- **depends_on**: [TB8]
- **location**: `src/server/db/seeds/local/_test/fullRun.pg.test.ts`, eventualmente `.github/workflows/ci.yml` (`timeout-minutes` del job Test)
- **description**:
  - Un test su Postgres fa il giro completo a `N` = 10.000 (D2): `seedDatabase`, le quattro corse con `runLocalCrons`, `verifyManifest`. Usa D fisso nel passato, orologio fissato e un timeout proprio, per esempio 300 s.
  - Controlla i volumi di AC30 dal database e da `manifest.runs`:
    - almeno 5.001 contatti selezionati da `priority` con lo stesso valore atteso nel manifesto, e quelle righe hanno davvero quel valore nel database;
    - `alert` con almeno 1.000 alert processati;
    - `update` con almeno 200 pratiche e almeno 100 clienti;
    - `cleanup` con almeno 1.000 righe cancellate.
  - Misura la durata del job Test in CI. La CI gira solo sulle PR verso `dev` e `main`, quindi la PR B va aperta in bozza. La misura definitiva si prende quando anche TB9 è sulla branch, per contare i suoi test. Se il job supera i 7 minuti, TB10 alza `timeout-minutes` e scrive la durata nel log del task.
- **validation**: il test passa in CI e risulta eseguito, non saltato; la durata del job è nel log del task.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "a `N` = 10.000, dopo le quattro corse, `verifyManifest` dà tutti gli scenari passati, `completezza` compresa".
- **review_mode**: cli
- **complexity**: medium

#### TB11: Gate e merge della PR B
- **depends_on**: [TB9, TB10]
- **location**: `brain/specs/crm/seeder-locale/IMPLEMENTATION-NOTES.md`
- **description**:
  - Gate di CI: Lint, Test con i `*.pg.test.ts` eseguiti, Build, Backend.
  - Giro a mano su `mito_local` da un Docker nuovo, con la sessione in Europe/Rome:
    - `pnpm db:local:up`, `db:local:reset`, `db:local:migrate`;
    - `seed:local` cronometrato (AC6: meno di 3 minuti; macchina, core e RAM nelle note);
    - `seed:local:cron`, poi `seed:local:verify` con tutti gli scenari passati;
    - una seconda corsa di `seed:local:cron update` rifiutata.
  - AC4 e AC28b li provano i test di TB1 e TB9: a mano basta il giro in un giorno normale.
  - Con `review.mode: total`, `implement-spec` lancia `adversarial-review` prima del merge.
- **validation**: CI verde; il giro a mano passa e i tempi sono nelle note; `REPORT.md` SHIP.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: n/a (gate)
- **review_mode**: cli
- **complexity**: low

## 10. Wave di esecuzione

| Wave | Task | Quando parte |
|---|---|---|
| 1 | TA1, TA2, TB1 | Subito |
| 2 | TA3 (PR A), TB2 | TA1 e TA2 fatti; TB1 fatto |
| 3 | TB3 | TB2 fatto |
| 4 | TB4 | TB3 fatto |
| 5 | TB5 | TB4 fatto |
| 6 | TB6 | TB5 fatto |
| 7 | TB7 | TB6 fatto |
| 8 | TB8 | TB7 fatto e PR A in `dev` (TA3) |
| 9 | TB9, TB10 | TB8 fatto (file diversi; TB10 può toccare solo `ci.yml`) |
| 10 | TB11 (PR B) | TB9 e TB10 fatti |

TA2 e TB9 toccano tutti e due `package.json` e `README.md`. La PR B riparte da `dev` dopo il merge della A, quindi le due modifiche non si incrociano.

## 11. Strategia di test (fase TDD)

- **Interfacce pubbliche testate:**
  - `importRates`, `generateDataset`, `buildManifest`, `writeDataset`, `seedDatabase`, `verifyManifest`, `runLocalCrons`;
  - le funzioni di `commands/`, la funzione di connessione, l'entry point `cron.cli.ts` come sottoprocesso.

  Nessun test su funzioni interne del generatore.
- **Un tracciante per task:** ogni task parte dal suo `tdd_target` e aggiunge un test per volta. Le soglie di AC8–AC30 entrano una alla volta in TB2–TB5.
- **Livelli (D2):**
  - **unitari, puri**, in ambiente `node` (docblock `// @vitest-environment node`, perché il default è jsdom): `day`, `importRates`, `generate`, `manifest`, connessione, import con esbuild;
  - **Postgres a 300:** scrittura, verifica, corse, comandi, guard di AC2, AC4, AC28a e AC28b;
  - **Postgres a 10.000:** giro completo (TB10);
  - **sottoprocesso:** `cron.cli.ts` con ambiente e `.env` ostili;
  - **a mano:** AC6.
- **Gli oracoli possono fallire:**
  - gli esiti attesi vengono dalle tabelle della spec;
  - la priorità di seed è diversa dall'atteso;
  - "seed appena fatto → scenari con esito diverso dal seed falliti" (TB7);
  - "completezza" prende le righe cambiate fuori dal manifesto (D14).
- **Orologio:**
  - D fisso nel passato, `vi.useFakeTimers({ toFake: ["Date"] })` e `vi.setSystemTime(romeNoon(D))`;
  - i timer non si falsano;
  - i tempi scritti dal database non si confrontano (D15).
- **Determinismo:** due ore dello stesso giorno, due fusi del processo, due scritture a ore diverse (TB2, TB6).

## 12. Gate di rilascio

| Gate | Quando | Che cosa |
|---|---|---|
| G1 | Merge PR A | CI verde; i test dei cron esistenti passano senza modifiche alle asserzioni; i casi nuovi di `CronStepFailed` passano; il `git grep` di AC33 è vuoto. |
| G2 | Merge PR B | CI verde con i `*.pg.test.ts` eseguiti, giro a 10.000 compreso; giro a mano su `mito_local` con AC6 misurato; `adversarial-review` SHIP. |

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Il refactor di TA1 cambia un comportamento dei cron di prod: una transazione che annulla le pratiche già scritte, uno step diverso nei report. L'unico cambio voluto è il dato inviato a Sentry, `DbError` invece di `DrizzleQueryError` (D1). | D1 fissa nessuna transazione, la mappatura in `CronStepFailed` e il dato per Sentry, con un'asserzione. Restano i test esistenti e se ne aggiungono per i fallimenti. `complexity: high`. La PR A è separata (D3). |
| Le rate di AC14 dipendono dall'ora o dal fuso del processo. | D11: funzione pura sul calendario di Roma, confrontata con l'import. Test su due ore e su due fusi. |
| Debiti in virgola mobile: `876.5699999999999`. | D12: importi interi sulle pratiche selezionate, confronto con tolleranza. |
| Una riga generica soddisfa per caso una regola di selezione che nessuno scenario descrive. | D10 e il test "uno e un solo scenario". |
| La regola di selezione del manifesto è diversa da quella del cron, e una riga cambiata resta fuori dalla verifica. | D14, controllo di completezza nei giri completi e in `seed:local:verify`. |
| Due cron toccano la stessa riga e un "invariato" diventa impossibile. | D13 e il test di composizione di TB5. |
| La verifica passa da sola. | Priorità di seed diversa dall'atteso; esiti presi dalla spec; il test di TB7 parte da "seed appena fatto → fallito". |
| Gli esiti dipendono dal fuso della sessione: `mito_local` è in Europe/Rome, i test in UTC. | Date a mezzogiorno di Roma, scadenze a mezzanotte di Roma. Giri completi in UTC (TB8, TB10) e a mano in Europe/Rome (TB11). |
| I tempi scritti dal database non seguono l'orologio finto. | D15: D nel passato, tempi del database esclusi dal confronto. |
| Una corsa fallita a metà, poi ripetuta, applica `update` due volte. | D6: tentativi registrati, corse rifiutate fino a un seed nuovo. |
| Un seed fallito lascia dati a metà o un manifesto vecchio. | Scrittura in una transazione; manifesto cancellato prima e scritto dopo il commit. |
| Il test di AC28a non tocca le variabili d'ambiente, perché `@/server/db` è simulato nei test. | Due prove: proxy che lancia (TB8) e sottoprocesso del comando vero con ambiente e `.env` ostili (TB9). |
| Il giro a 10.000 allunga il job Test oltre il limite. | TB10 misura e alza `timeout-minutes`. |
| `--conditions=react-server` cambia la risoluzione di un pacchetto. | Solo `cron.cli.ts` lo usa; provato su `jobs.ts`. Il giro a mano di TB11 passa dal comando vero. |
| Il manifesto sul file system non corrisponde più a `mito_local`, per un `db:local:reset` dopo il seed. | La verifica fallisce in modo visibile; il README dice di rilanciare `seed:local`. |

## 14. Tracciabilità AC → task

| AC | Task |
|---|---|
| AC1 | TB9 (connessione), con `localConnection` già testato |
| AC1a | TB6, TB7, TB8 (seed su `mito_test_*` con D scelto, sessione in UTC) |
| AC2 | TB9 |
| AC3 | TB6 |
| AC4 | TB1 (helper), TB9 (`seedLocal`) |
| AC5 | TB2–TB4 (puro, due ore, due fusi), TB6 (database, due ore) |
| AC6 | TB11 (a mano) |
| AC7 | TB9 (esbuild, D7), `next lint` |
| AC8–AC16 | TB1 (`importRates`), TB2 |
| AC17 | TB3 |
| AC18 | TB3 (assegnazione), TB4 (controllo sui contatti attivi) |
| AC19–AC26 | TB4 |
| AC27 | TB4, TB5 |
| AC28 | TA1, TB8, TB9 |
| AC28a | TA1, TB8 (proxy), TB9 (connessione e sottoprocesso) |
| AC28b | TB1, TB8, TB9 (`verifyLocal`) |
| AC29 | TB7, TB8, TB9, TB10 |
| AC30 | TB2, TB4, TB5, TB10 |
| AC31 | TA2 |
| AC32 | TA2, TB9 |
| AC33 | TA2, TB9 (README sul seeder) |

## 15. Domande aperte

Nessuna. Le domande della spec sono chiuse (2026-10-21) e quelle del piano sono D1–D3.

## 16. Esito della verifica

**2026-10-21, gate `adversarial-verifier` sulla prima stesura: DO NOT SHIP** (1 BLOCKER, 7 MAJOR, 12 MINOR). Una revisione separata del grafo (swarm-plan) ha trovato gli stessi punti e qualcuno in più. Correzioni:

| Problema | Correzione |
|---|---|
| **B1:** il generatore importava `calculateDebitoResiduo`, che legge `Date.now()`, modifica la data e dipende dal fuso del processo. | D11, `importRates` in TB1, test su due ore e due fusi in TB2. |
| **M1:** debiti in virgola mobile. | D12. |
| **M2:** P2 e P8 invariati ma toccati da `alert`. | D13, test di composizione in TB5, regola in TB4. |
| **M3:** AC5 cieco sulle colonne con solo `$onUpdate` e con l'orologio fermo. | Ogni timestamp valorizzato (§5); in TB6, due scritture a ore diverse. |
| **M4:** completezza del manifesto verificata solo con le regole del manifesto. | D14 e lo scenario "completezza" in TB7, TB8 e TB10. |
| **M5:** il test di AC28a non toccava l'ambiente. | Proxy che lancia in TB8, sottoprocesso con `.env` ostili in TB9. |
| **M6:** un solo `cli.ts` faceva cadere `seed:local` su `server-only`. | Tre entry point (D5); D7 esteso a `src/server/db/index.ts` e `dotenv`. |
| **M7:** nessun test che i comandi chiamino i guard di AC4 e AC28b. | `commands/` con `client` e `now` iniettati; test in TB9. |
| **Minori sull'ordine e sui tipi:** ordine delle FK; `$inferInsert` senza id; `setval` con i nomi fra virgolette; `types.ts` toccato in parallelo. | §6, D8, TB5 e TB6 in sequenza. |
| **Minori sull'orologio:** orologio finto contro tempi del database; "più chiamate" di `alert` non osservabile; righe di log sul confine all'ora sbagliata. | D15; contatori in `manifest.runs`; log a mezzogiorno di Roma. |
| **Minori sulle validazioni:** la validation di TB7 su U3; A6 tautologico. | TB7 riscritto; A6 da `manifest.runs`. |
| **Minori sui fallimenti:** fallimenti a metà; seed non in transazione. | D6, TB6 e TB9. |
| **Altri minori:** AC2 solo per conteggio; esenzione di AC14 e volumi di `update` assenti in TB2; AC18 diviso fra TB3 e TB4; difesa su `current_database()`; timeout dei test a 10.000. | TB9, TB2, TB3 e TB4, TB6, §5. |
| **Dalla revisione del grafo:** TA1 senza test della mappatura `DbError` → `CronStepFailed`; senza divieto di transazione; con `runPromise` che cambia l'oggetto per Sentry; proxy e mock nel file. TB10 può andare in parallelo a TB9. | TA1 riscritto; grafo aggiornato. |

**2026-10-21, seconda verifica: DO NOT SHIP** (nessun BLOCKER, 5 MAJOR, 15 MINOR). Correzioni:

| Problema | Correzione |
|---|---|
| **Un solo `commands.ts`:** seed e verifica avrebbero importato `jobs.ts` e `server-only` (contro D7). | `commands/seed.ts`, `commands/cron.ts`, `commands/verify.ts`; solo il secondo importa `cron.ts`. |
| **D14 rifiutava la riga `alert_resolved` di A3,** che la spec richiede. | D14 la ammette e marca come selezionati alert e contatti di A1–A3. |
| **D1 prometteva a Sentry "lo stesso oggetto":** falso, `Cause.squash` dà il `DbError`. | Il cambio è dichiarato e accettato (niente più SQL con i dati dei clienti a Sentry), con un'asserzione nei test delle rotte. |
| **Il confronto di `importRates` sarebbe girato nel fuso dell'host** (vitest a thread); la regola di D11 non era quella dell'import. | Confronto in un processo figlio con `TZ=Europe/Rome`; le cinque regole dell'import scritte in D11. |
| **Il test del sottoprocesso poteva scrivere una corsa fallita nel manifesto vero.** | Manifesto relativo alla `cwd`; il test usa una cartella temporanea e controlla che quello del repo non cambi. |
| **Minori sul sottoprocesso:** `--tsconfig` per il figlio, un listener Unix per `INSTANCE_UNIX_SOCKET`. | TB9. |
| **Minori sul manifesto e sui job:** `git grep` di TA2 che trovava il brain; soglie di AC30 a 300; corsa interrotta non registrata; ordine troppo rigido rispetto ad AC28; trigger su Postgres invece di `failpoint`. | TA2, TB7, D6, TB8. |
| **Minori su database e migrazioni:** database con un altro nome nei test; `lock_timeout`; hash delle migrazioni. | TB6, TB9. |
| **Minori di copertura:** operatore senza carico nello storico; email degli utenti; conteggio dei 5.001 sui selezionati; precedenza P3/P10; `state` NULL. | TB3, TB4, TB10. |
| **Altri minori:** misura della CI con la PR in bozza; esenzione da Effect per gli strumenti locali. | TB10, §5. |

Le correzioni della seconda verifica sono puntuali: la forma del piano non cambia e nessuna è un BLOCKER, quindi non serve una terza verifica.

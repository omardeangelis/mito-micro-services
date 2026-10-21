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
**Generato:** 2026-10-21 con `create-plan`: grill → swarm-plan → tdd → adversarial-verifier. Nessun codice scritto.
**Sostituisce:** T7.1c del [[specs/crm/sezione-contatti/PLAN|piano di Contatti]] (decisione 3 della spec).

---

## 1. Situazione iniziale

- **Il database locale c'è ed è vuoto.**
  - `mito_local` gira nel Postgres 15 di `docker-compose.yml`, su `127.0.0.1:54329`.
  - `db:local:reset` lo ricrea con la sessione in Europe/Rome. `db:local:migrate` applica le migrazioni.
  - Il guard è `localConnection` (`src/server/db/localDsn.ts`). Il DSN è la costante `LOCAL_DATABASE_URL` in `src/server/db/scripts/localDb.ts`.
- **I test su Postgres esistono già** (`*.pg.test.ts`, progetto `pg` di `vitest.workspace.ts`).
  - Lavorano su un database `mito_test_<casuale>` creato e poi eliminato da `src/test/pg.ts`, con la sessione in UTC.
  - `src/test/pg.setup.ts` sostituisce `@/server/db` con il pool di quel database.
  - In CI girano nel job Test (`.github/workflows/ci.yml`, servizio `postgres:15`, `timeout-minutes: 10`).
- **I cron di prod sono sul backend.** `cronJobs` in `api/src/cron/jobs.ts` compone le funzioni di servizio:
  - `refreshPriorities` e `processDueAlerts` sono Effect con `Db`;
  - `alertJob` richiama `processDueAlerts` finché `remaining = 0`, al massimo 20 volte;
  - `updatePractices`, `updateCustomerAge` e `cleanupTaskEventLog` sono funzioni async che scrivono sul `db` globale. Sono avvolte da `step`, che trasforma un'eccezione in `CronStepFailed`.
- **I seed di oggi (`seed:db`, `seed:delete*`) non hanno guard.** La spec li toglie (AC31–AC33).

## 2. Problema

La spec chiede tre cose:
- un seeder deterministico che riempia `mito_local` con 10.000 clienti, pratiche condivise, operatori sbilanciati, Contatti in ogni stato e gli scenari dei quattro cron;
- un modo di far girare quei cron su `mito_local` con le funzioni di prod;
- una verifica che confronti l'esito con un manifesto.

Gli ostacoli tecnici sono quattro:
1. **Tre servizi leggono il database dall'ambiente.** Il `db` globale legge `SUPABASE_DB_CONNECTION_STRING` e `INSTANCE_UNIX_SOCKET` all'import. Una corsa locale non deve poter arrivare a un altro database (AC28a).
2. **`server-only` blocca l'import fuori da Next.** Sotto `tsx` l'import dei servizi e dei job fallisce.
3. **Gli id sono `GENERATED ALWAYS AS IDENTITY`** (da 1000) su `task`, `alert`, `operator`, `task_event_log`, `chat`, `messages` e `practices.id`. Il manifesto ha bisogno di id noti prima di scrivere.
4. **Gli esiti dipendono dal giorno D e dall'orologio**, in parte tramite `Date.now()` (`calculatePriority`, `shouldUpdate`).

## 3. Forma della soluzione

Due PR verso `dev` (D3).

**PR A, codice di prod, piccola:**
- `updatePractices`, `updateCustomerAge` e `cleanupTaskEventLog` diventano Effect con `Db` (D1). Rotte Next e backend passano `DbLive`.
- Via i seed di oggi (AC31–AC33, tranne la riga del README sul seeder nuovo, che arriva con la PR B).

**PR B, strumenti locali, in `src/server/db/seeds/local/`.** Lì vale la regola ESLint per cui l'app non importa i seed. Moduli, dal più profondo all'esterno:

```
day.ts        giorno di Roma, mezzanotte e mezzogiorno di Roma, guard "Roma = UTC" (AC4, AC28b)
types.ts      Dataset (righe per tabella, tipi $inferInsert di Drizzle, id espliciti) e Manifest
generate.ts   generateDataset({ n, day }) → Dataset            puro, deterministico, nessun I/O
manifest.ts   buildManifest(dataset, day) → Manifest            puro: applica le tabelle della spec
write.ts      writeDataset(client, dataset)                     TRUNCATE + INSERT con id espliciti
verify.ts     verifyManifest(client, manifest) → esiti          "passato" o "fallito", per scenario
cron.ts       runLocalCrons(client, manifest, jobs)             cronJobs con un Db iniettato
cli.ts        seed:local | seed:local:cron | seed:local:verify  connessione solo a mito_local
```

- **Il manifesto è un oracolo indipendente.** `buildManifest` scrive gli esiti attesi dalle tabelle della spec, senza chiamare `calculatePriority` né il codice dei cron. Riusarli renderebbe la verifica tautologica.
- **Generatore e manifesto sono puri.** I criteri di distribuzione (AC8–AC27, AC30) si testano in memoria a 300 e a 10.000. Il database serve solo per scrittura, corse e verifica.
- **Le corse riusano `cronJobs`.** Sono le stesse funzioni di prod, con lo stesso ciclo di `alert`. Il comando le esegue con `Layer.succeed(Db, clientLocale)`, sotto `tsx --conditions=react-server` (con quella condizione `server-only` risolve a `empty.js`; verificato il 2026-10-21 importando `api/src/cron/jobs.ts`).

## 4. Decision ledger (risolto)

| # | Decisione | Fonte |
|---|---|---|
| D1 | `updatePractices`, `updateCustomerAge` e `cleanupTaskEventLog` diventano `Effect<number, DbError, Db>`. Le rotte Next (`src/app/api/cron/update`, `src/app/api/cron/cleanupTaskEventLog`) li eseguono con `DbLive`. `cronJobs` li usa direttamente e mappa `DbError` in `CronStepFailed` con lo stesso nome di step, così i report non cambiano. Il comando locale passa un `Db` su `mito_local`. L'alternativa scartata era riscrivere le variabili d'ambiente prima dell'import: con quella, la garanzia di AC28a dipenderebbe dall'elenco delle variabili. | Grill, Omar 2026-10-21 |
| D2 | Tre livelli di test:<br>- generatore e manifesto puri, testati a 300 e a 10.000;<br>- giro completo (seed, corse, verifica) su Postgres a 300 **e a 10.000 in CI**;<br>- AC6 (meno di 3 minuti) resta un controllo a mano su `mito_local`, perché dipende dalla macchina. | Grill, Omar 2026-10-21 |
| D3 | Due PR verso `dev`: la A (D1 + AC31–AC33) e la B (il resto). La B si apre dopo il merge della A. Il lavoro su TB1–TB7 può partire prima, perché non tocca i file della A. | Grill, Omar 2026-10-21 |
| D4 | Tutto il codice nuovo sta in `src/server/db/seeds/local/`. La regola ESLint sugli import dei seed impedisce all'app di importarlo. | Dal codice |
| D5 | Gli script sono:<br>- `seed:local [--customers N]`, con default 10.000 e minimo 300;<br>- `seed:local:cron [job…]`, di default i quattro in ordine;<br>- `seed:local:verify`.<br>Gli ultimi due girano con `tsx --conditions=react-server`. | Dal codice |
| D6 | Il manifesto è un file JSON ignorato da git, `.local-seed/manifest.json`. Contiene D, `N`, gli scenari e le corse fatte. `seed:local:cron` rifiuta un cron già corso dopo il seed e un ordine diverso da `priority`, `alert`, `update`, `cleanup-task-event-log`. `seed:local:verify` rifiuta un manifesto senza le quattro corse. | Dal codice: `update` non è idempotente (Constraints della spec) |
| D7 | AC7 lo prova un test che costruisce i tre entry point con esbuild (`bundle`, `metafile`, `write: false`, pacchetti esterni) e controlla che `src/lib/global/loadDbEnv.ts` non sia fra gli input. Come controllo positivo, lo stesso test trova `loadDbEnv` in `createSystemOperator.ts`. Una regola ESLint non basta: `no-restricted-imports` vede solo gli import diretti. | Dal codice |
| D8 | Gli id sono espliciti, scritti con `overridingSystemValue()` di Drizzle 0.45. Dopo la scrittura, `setval` porta ogni sequenza oltre il massimo. Il manifesto cita le pratiche per `pratica_id`. | Dal codice |
| D9 | Nessun backlog, come D6 di Contatti: solo questo `PLAN.md`. | Convenzione del progetto |
| D10 | Ogni riga che un cron selezionerà, secondo la regola di selezione della spec, sta in **uno e un solo** scenario di quel cron. Il generatore non crea righe selezionate che nessuno scenario descrive. Due esempi: un `richiamare` con "Contattato il" e senza alert (varrebbe 30), una pratica con `rate_pagate = 0` e liquidazione in D. Lo controlla un test (TB5). | Spec, "Scenari dei cron" |

## 5. Assunzioni e vincoli

- **Spec approvata** con il lancio di `create-plan` (2026-10-21). T7.1c di Contatti passa a "Sostituito" e T7.3 rimanda qui.
- **Le regole di `AGENTS.md` valgono anche qui.**
  - Nessuno script con `NODE_ENV=production`.
  - Nessuna chiave del database in `.env`.
  - I tre comandi non importano `loadEnv` (AC7, D7).
  - Niente `next build` locale con i file env veri.
- **I comandi non leggono `.env*`.** `tsx` non li carica e i comandi non chiamano `dotenv` né `loadEnv`. La connessione si costruisce con `localConnection(LOCAL_DATABASE_URL, { database: "mito_local" })` passata come opzioni a `postgres()`, mai come DSN. Così `PGHOST` e simili non la cambiano.
- **Il generatore non legge l'orologio.**
  - Ogni data e ogni timestamp derivano da D, nessuno da `Date.now()` o da `new Date()`.
  - Nessun default del database (`now()`) resta in gioco: ogni colonna con default viene valorizzata.
  - faker 8.4.1 (`@faker-js/faker`, già fra le devDependencies) viene usato con `seed` fisso e mai con le sue funzioni di date relative ad "adesso".
- **Date con il fuso giusto.**
  - Date di liquidazione e di nascita: mezzogiorno di Roma.
  - Scadenze degli alert: mezzanotte di Roma, come le salva l'app.
  - `last_import_update`: mai fra 29 e 31 giorni prima di D.
  - `task_event_log`: nessuna riga nel giorno D − 3 mesi (`subMonths` di date-fns, come il cron).
- **Test con D e orologio fissati.**
  - I test fissano D e l'orologio a mezzogiorno di Roma di D, con `vi.setSystemTime` o fake timers solo su `Date`. Il clock di default di Effect legge `Date.now()`.
  - Gli esiti attesi devono valere anche con la sessione in UTC (AC1a), quella dei test su Postgres.
- **I D difficili si coprono nei test del generatore:** un giorno qualunque, il 31 di un mese (`subMonths` arriva al 28 o al 30), il 1° marzo di un anno non bisestile (compleanni del 29 febbraio) e il giorno del cambio dell'ora.
- **CI:** il job Test ha `timeout-minutes: 10`. TB10 misura l'aggiunta del giro a 10.000 e alza il limite se il job supera i 7 minuti.

## 6. Findings dal codice

- **Gli id identity sono `GENERATED ALWAYS`, da 1000.** Senza `OVERRIDING SYSTEM VALUE` un id esplicito viene rifiutato. `customers.id` è `varchar` con default `nanoid()` calcolato una volta sola, quindi va sempre valorizzato.
- **FK fra contatto e alert.** `task.alert_id` → `alert.id` ha la FK. `alert.task_id` non ce l'ha. Ordine di scrittura: alert, poi task.
- **Altre FK.** `task.customer_id` → `customers`, `task.operator_id` → `operator`, `alert.resolved_by` → `operator`. `operator.user_id` e `messages` non hanno FK.
- **Tipi delle colonne di data.** `birthday_date` e `data_liquidazione` sono `timestamptz`, quindi `DATE()` ed `EXTRACT()` dipendono dalla sessione: da qui il mezzogiorno di Roma. `deadline`, `closed_at` e `created_at` sono `timestamptz`.
- **`refreshPriorities`** seleziona i contatti attivi con `custom_priority = false` escluso `chiamare` a 120. Scrive un UPDATE per valore di priorità e per blocchi di 5.000 id, in una transazione. Usa la data di liquidazione del cliente del primo contatto per tutti, ma per il difetto di precedenza la liquidazione dà sempre 0.
- **`calculatePriority` per `richiamare`:** +20 se la scadenza dell'alert è prima di adesso, +30 se c'è `closed_at`. I valori possibili sono 0, 20, 30 e 50.
- **`processDueAlerts(date, { budgetMs })`** legge il giorno di Roma da `date` e richiede l'operatore di sistema (`user_id = 'system'`). In `cronJobs` la data viene da `Clock`.
- **`cronJobs.update`** calcola il giorno UTC di adesso (`utcDay`).
- **I test esistenti dei tre servizi** passano dalle rotte (`update.db.test.ts`, `cleanupTaskEventLog.db.test.ts`) e da `api/src/cron/_test/cron.db.test.ts`, mai dalle funzioni dirette. Dopo D1 restano uguali. `lockRule.db.test.ts` cita `cleanupTaskEventLog` solo in un commento.
- **`server-only`:** vitest e `api/build.mjs` lo risolvono a `empty.js`. Sotto `tsx` serve `--conditions=react-server`, e con quella anche `@sentry/nextjs` si importa senza errori (verificato).
- **`localDb.ts`:**
  - `appliedMigrations` conta le righe di `drizzle.__drizzle_migrations` ed è privata;
  - AC2 confronta quel conteggio con le voci di `src/server/db/migrations/meta/_journal.json`, con una funzione esportata da `localDb.ts`;
  - `resetDb` di `src/test/pg.ts` è il modello del TRUNCATE di AC3, con `RESTART IDENTITY CASCADE` su tutte le tabelle di `public`.
- **ESLint:** `.eslintrc.cjs` spegne `no-restricted-imports` per `src/server/db/seeds/**` e `src/server/db/scripts/**` (riga 84).
- **Chi nomina i seed di oggi, fuori da `brain/`:**
  - `package.json`, `README.md`, `.env.example`, `src/lib/global/loadDbEnv.ts`;
  - `getRandomCustomerRole` (`schema/relations/customerToPratica.ts`) è usata solo da `seeds/customerToPratica.ts`.
- **`calculateDebitoResiduo`** (`src/app/api/import/_utils/index.ts`) è la regola dell'import di AC14. Il generatore la importa invece di riscriverla: gli import di quel modulo sono papaparse e tipi.

## 7. Ricerca esterna

- **Drizzle 0.45:** `insert(...).overridingSystemValue()` esiste nelle definizioni installate (`pg-core/query-builders/insert.d.ts`).
- **tsx 4.16:** passa le opzioni di Node, quindi `--conditions=react-server` funziona. Provato su `api/src/cron/jobs.ts`.
- **esbuild 0.28** (devDependency diretta): `build({ bundle, metafile, write: false })` restituisce `metafile.inputs`, cioè l'elenco dei moduli raggiunti. Legge i `paths` di `tsconfig.json` per l'alias `@/`.

## 8. Grafo delle dipendenze

```
PR A   TA1 ─┐
       TA2 ─┴─ TA3 (gate e merge della A)
                 │
PR B   TB1 ─ TB2 ─ TB3 ─ TB4 ─┬─ TB5 ─┐
                              └─ TB6 ─┴─ TB7 ─┐
                 TA3 ─────────────────────────┴─ TB8 ─ TB9 ─ TB10 ─ TB11
```

## 9. Task

### PR A — servizi dei cron su Effect, via i seed di oggi

#### TA1: I tre servizi dei cron prendono `Db`
- **depends_on**: []
- **location**: `src/server/services/cron/updatePractices.ts`, `updateCustomerAge.ts`, `cleanupTaskEventLog.ts`; `src/app/api/cron/update/route.ts`, `src/app/api/cron/cleanupTaskEventLog/route.ts`; `api/src/cron/jobs.ts`; un test nuovo `src/server/services/cron/_test/cronServices.db.test.ts`
- **description**: Porta i tre servizi su Effect (D1) con `query` di `@/server/effect/db`. I tipi diventano:
  - `updatePractices(today): Effect<number, DbError, Db>`;
  - `updateCustomerAge(month, day): Effect<number, DbError, Db>`;
  - `cleanupTaskEventLog(now): Effect<number, DbError, Db>`.

  Il comportamento resta uguale: stesse query, stesso `shouldUpdate` su `Date.now()`, stessi valori restituiti. Poi:
  - le due rotte Next eseguono i programmi con `Effect.runPromise(... .pipe(Effect.provide(DbLive)))` e restano uguali per il resto;
  - in `cronJobs`, `update` e `cleanup-task-event-log` usano i servizi direttamente e mappano `DbError` in `CronStepFailed({ step, cause })` con gli stessi nomi di step di oggi.

  Nessun altro file cambia.
- **validation**:
  - Restano verdi senza cambiare le asserzioni `update.db.test.ts`, `cleanupTaskEventLog.db.test.ts`, `api/src/cron/_test/cron.db.test.ts` e `cronScripts.test.ts`.
  - Nel test nuovo, i tre servizi eseguiti con `Layer.succeed(Db, testDb)` aggiornano o cancellano le righe del database di test anche quando `@/server/db` è un proxy che lancia un errore a ogni accesso.
  - `next lint`, `tsc --noEmit`, `pnpm api:build` e `pnpm api:smoke` passano.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "`cleanupTaskEventLog(now)` con un `Db` iniettato cancella le righe più vecchie di 3 mesi anche quando il `db` globale lancia un errore a ogni accesso".
- **review_mode**: cli
- **complexity**: high

#### TA2: Via i seed di oggi (AC31–AC33)
- **depends_on**: []
- **location**: `package.json`, `src/server/db/seeds/*.ts` (i dieci file di AC31), `src/server/db/schema/relations/customerToPratica.ts`, `README.md`, `.env.example`, `src/lib/global/loadDbEnv.ts`, `.eslintrc.cjs`, `AGENTS.md` (e `CLAUDE.md`, se è una copia e non un link), `brain/chore/migration/fase-1/t2-packages-db.md`, `brain/chore/migration/fase-1-database-postgres.md`
- **description**:
  - Toglie da `package.json` gli script `seed:db`, `seed:delete`, `seed:delete:dev` e `seed:delete:test`.
  - Cancella i dieci file di AC31 e `getRandomCustomerRole`.
  - Toglie la sezione del README "Comandi per svuotare db e ricaricarlo". La riga sul seeder nuovo nella sezione "Database locale" arriva con TB9.
  - Toglie le citazioni dei seed tolti da `.env.example`, dal commento di `loadDbEnv.ts`, da `.eslintrc.cjs` e da `AGENTS.md`. Restano i pattern `**/seeds` della regola: servono al seeder nuovo (D4).
  - Aggiorna i due piani F1.T2 del brain: i seed da spostare in `packages/db` non ci sono più (seguito nelle Technical Notes della spec).
- **validation**:
  - `git grep -nE "seed:(db|delete|clear)" -- ':!brain'` non trova niente (AC33).
  - `git grep -n getRandomCustomerRole` non trova niente (AC31).
  - Fra gli script di `package.json` che svuotano o riempiono tabelle restano solo `db:local:reset`, `test:pg` e `test` (AC32; il seeder arriva con la PR B).
  - Lint, `tsc` e test verdi.
- **status**: Planned
- **log**:
- **files edited/created**:
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
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: n/a (gate)
- **review_mode**: cli
- **complexity**: low

### PR B — seeder, manifesto, corse e verifica

#### TB1: Giorno di riferimento, tipi del dataset e del manifesto
- **depends_on**: []
- **location**: `src/server/db/seeds/local/day.ts`, `types.ts`, `_test/day.test.ts`
- **description**:
  - `day.ts` esporta:
    - `romeDay(instant)`, il giorno `YYYY-MM-DD` a Roma;
    - `romeMidnight(day)` e `romeNoon(day)`, che restituiscono `Date`;
    - `addDays(day, n)` e `subMonthsDay(day, n)` sul calendario, con `subMonths` di date-fns come il cron;
    - `assertSameRomeAndUtcDay(now)`, che lancia con il messaggio di AC4 (`alert` calcola il giorno a Roma, `update` in UTC sul backend e con l'ora della macchina sulle rotte Next);
    - `assertIsToday(day, now)` per AC28b.
  - `types.ts` definisce:
    - `Dataset`: un array di righe per tabella, con i tipi `$inferInsert` di Drizzle e gli id espliciti (D8);
    - `Manifest`: `{ day, n, scenarios: { id, cron, rows: { table, key, selected, expected } }[], runs: { job, at }[] }`, serializzabile in JSON. `expected` descrive l'esito o i valori che devono restare invariati, compreso `updated_at` dove la spec lo chiede.
- **validation**: test unitari di `day.ts`:
  - le 23:30 UTC del 21 ottobre sono il 22 a Roma e fermano `assertSameRomeAndUtcDay`;
  - mezzogiorno di Roma cade nello stesso giorno in UTC tutto l'anno, anche nei giorni del cambio dell'ora;
  - `subMonthsDay` del 31 maggio è il 28 febbraio.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "`assertSameRomeAndUtcDay` si ferma alle 00:30 di Roma del 22 ottobre (22:30 UTC del 21) e passa a mezzogiorno di Roma".
- **review_mode**: cli
- **complexity**: medium

#### TB2: Generatore, parte 1: clienti, pratiche e legami
- **depends_on**: [TB1]
- **location**: `src/server/db/seeds/local/generate.ts` (o `generate/customers.ts` e `generate/practices.ts`), `_test/generate.test.ts`
- **description**: `generateDataset({ n, day })` restituisce clienti, prodotti, pratiche e legami. Si ferma se `n` è minore di 300. Requisiti:
  - **Legami per cliente (AC8–AC10):** `floor(N/6)` clienti con 3 legami, `floor(2N/6)` con 2, gli altri con 1. Fra i `G` clienti con un legame solo: `floor(G/2)` Intestatari, `floor(G/4)` Coobbligati, gli altri Garanti.
  - **Composizione delle pratiche (AC11–AC12):** un solo Intestatario per pratica, al più un Coobbligato e un Garante; le combinazioni di ruoli e le composizioni di AC11 e AC12.
  - **Stati e prodotti (AC13):** ogni `State`, ogni codice di `productMap` e `is_wave` con tutti e due i valori. `products` ha una riga per prodotto.
  - **Rate (AC14):** rate e debito calcolati con `calculateDebitoResiduo` al giorno D. Una pratica `Liquidata` con le rate tutte pagate diventa `Chiusa`.
  - **Clienti (AC15–AC16):** varietà di `blacklist_status` e `source`; codice fiscale di 16 caratteri o partita IVA; `temp_id` e `unique_hash` unici; dati finti; email su `.test` o `example.com`.
  - **Righe degli scenari di `update`** (U1–U11): scadenze della rata in D, D − 1 e D + 1; liquidazioni e nascite a mezzogiorno di Roma; `last_import_update` fuori dalla fascia 29–31 giorni.
  - **Determinismo:** solo da `n` e `day`, con faker a `seed` fisso.
- **validation**: test unitari a `N` = 300 e a `N` = 10.000:
  - conteggi esatti di AC8 e AC10 (1.666, 3.333 e 5.001; 2.500, 1.250 e 1.251);
  - AC9, AC11–AC16;
  - le righe di U1–U11 ci sono;
  - due chiamate con lo stesso input danno righe uguali, anche con l'orologio fermato in due ore diverse dello stesso giorno (AC5);
  - `n = 299` si ferma.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "`generateDataset({ n: 10_000, day })` ha esattamente 1.666 clienti con 3 legami, 3.333 con 2 e 5.001 con 1".
- **review_mode**: cli
- **complexity**: medium

#### TB3: Generatore, parte 2: utenti, operatori e assegnazione
- **depends_on**: [TB2]
- **location**: `src/server/db/seeds/local/generate.ts` (o `generate/operators.ts`), `_test/generate.test.ts`
- **description**:
  - **Utenti (AC17):** 25 utenti `OPERATORE` e 3 `ADMIN`, ognuno con la sua riga in `operator`, più l'operatore di sistema (`user_id = 'system'`, senza utente).
  - **Clienti assegnati (AC18):**
    - un operatore ha il 30% o più dei contatti attivi;
    - almeno 15 operatori hanno un carico fra l'1% e il 10%;
    - un operatore non ha niente;
    - almeno un admin ha clienti;
    - almeno il 2% dei clienti non ha operatore.

  Il carico si misura sui contatti attivi, che arrivano con TB4: qui si assegnano i clienti con quote che, combinate con la quota di clienti con contatto attivo, rispettano le soglie. Il test definitivo di AC18 sta in TB4.
- **validation**: test unitari a 300 e a 10.000: AC17; le quote di assegnazione dei clienti; determinismo.
- **status**: Planned
- **log**:
- **files edited/created**:
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
  - **Contatti attivi (AC19–AC22):**
    - al massimo un contatto attivo per cliente, con lo stesso operatore del cliente (o senza, se il cliente non ne ha);
    - almeno il 70% dei clienti con un contatto attivo e almeno il 10% senza contatti;
    - ogni `task_status` fra gli attivi, almeno 20 volte a 10.000;
    - priorità manuali 20, 60, 100 e 120.
  - **Storico e alert (AC23–AC24):**
    - contatti non attivi con esito e `closed_at`, almeno 100 a 10.000 con un operatore diverso da quello del cliente;
    - contatti riaperti;
    - alert aperti solo su `richiamare` attivi, collegati nei due versi, e al massimo uno per cliente;
    - alert risolti con `resolved_by` su contatti non attivi.
  - **Note e log (AC25–AC26):**
    - chat solo sui clienti, mai condivise, con 1–4 note;
    - log di ogni `action` e `source`, coerente con i contatti, negli ultimi 6 mesi e mai nel giorno D − 3 mesi.
  - **Righe degli scenari:**
    - P1–P12, A1–A5, L1–L2, comprese le righe sul confine di AC27;
    - la priorità scritta per ogni riga selezionata da `priority` è diversa dall'esito atteso;
    - nessuna combinazione fuori dalle tabelle (D10).
  - **Volume (AC30):** a 10.000, almeno 5.001 attivi con lo stesso esito di priorità, almeno 1.000 alert aperti con scadenza in D o prima e almeno 1.000 righe di log più vecchie di 3 mesi.
  - **Ordine delle righe:** è quello degli id, così la scrittura è deterministica.
- **validation**: test unitari a 300 e a 10.000:
  - AC18 sui contatti attivi e AC19–AC26;
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
- **location**: `src/server/db/seeds/local/manifest.ts`, `_test/manifest.test.ts`
- **description**: `buildManifest(dataset, day)` applica a ogni riga le regole di selezione dei quattro cron, scritte dalla spec e non importate dal codice dei cron:
  - `priority`: attivo, `custom_priority = false`, non `chiamare` a 120;
  - `alert`: aperto, collegato nei due versi, scadenza di Roma in D o prima;
  - `update`: `DATE(liquidazione) + rate_pagate × 30 = D`; clienti nati nel mese e nel giorno di D;
  - `cleanup`: righe create prima di D − 3 mesi.

  Ogni riga va nello scenario di cui ha le caratteristiche, con `selected` ed `expected` presi dalle tabelle P, A, U e L della spec. Per esempio: P1 → 120; A1 → nuovo `followup` a 150 con lo stesso "Contattato il"; U4 → `Chiusa` con le rate invariate. Per i contatti toccati da più cron, `expected` è lo stato finale dopo le quattro corse in ordine (AC29: il contatto di A1 è disattivato).
- **validation**: test unitari a 300 e a 10.000:
  - ogni riga selezionata da un cron sta in uno e un solo scenario di quel cron (D10);
  - ogni caso di ogni riga delle tabelle ha almeno una riga, comprese le righe sul confine di L1 e L2 (AC27);
  - le soglie di AC30;
  - per ogni riga selezionata da `priority`, la priorità del seed è diversa da `expected`;
  - P2, P8 e P9 registrano priorità e `updated_at` del seed come attesi invariati;
  - il manifesto è serializzabile in JSON e uguale fra due chiamate.
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
- **depends_on**: [TB4]
- **location**: `src/server/db/seeds/local/write.ts`, `_test/write.pg.test.ts`
- **description**: `writeDataset(client, dataset)` scrive su un `DbClient` qualsiasi:
  - **AC3:** svuota tutte le tabelle di `public` con `TRUNCATE ... RESTART IDENTITY CASCADE`, come `resetDb`;
  - inserisce in ordine di FK: prodotti, utenti, operatori, clienti, chat e note, pratiche, legami, alert, contatti, log;
  - scrive a blocchi sotto i 65.535 parametri, con `overridingSystemValue()` dove l'id è identity;
  - alla fine, `setval` di ogni sequenza oltre il massimo.

  Non dipende dal fuso della sessione: le date passano come `Date`.
- **validation**: test su Postgres a `N` = 300, con la sessione in UTC:
  - righe di altre tabelle scritte prima del seed (un utente `ADMIN`, una `session`, una riga di `cron_run`) non ci sono più (AC3);
  - il conteggio delle righe per tabella è quello del dataset;
  - `task_customer_active_uidx` e le FK non rifiutano niente;
  - due scritture di fila danno un dump uguale di tutte le tabelle, id e timestamp compresi (AC5);
  - un inserimento successivo senza id riceve un id oltre il massimo.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "dopo due `writeDataset` dello stesso dataset su `mito_test_*`, il dump di tutte le tabelle è identico, `created_at` compreso".
- **review_mode**: cli
- **complexity**: medium

#### TB7: Verifica
- **depends_on**: [TB5, TB6]
- **location**: `src/server/db/seeds/local/verify.ts`, `seed.ts` (`seedDatabase(client, { n, day })` = genera, scrive, restituisce il manifesto), `_test/verify.pg.test.ts`
- **description**: `verifyManifest(client, manifest)` legge le righe di ogni scenario e confronta lo stato finale con `expected`. Restituisce, per scenario, "passato" o "fallito" con le righe che non tornano (chiave, atteso, trovato). Alcuni casi da coprire:
  - A1 e A2: cercare il nuovo contatto attivo del cliente;
  - A1: le 2 righe di log;
  - U3: tutte le colonne invariate;
  - L1: le righe sparite.
- **validation**: test su Postgres a 300:
  - su un seed appena fatto, senza corse, gli scenari con righe selezionate falliscono e quelli dei non selezionati passano;
  - riportando a mano su ogni riga di P1 la priorità 120, P1 passa;
  - cambiando una riga di P2, P2 fallisce e cita quella riga.
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
- **depends_on**: [TA3, TB1, TB5, TB6, TB7]
- **location**: `src/server/db/seeds/local/cron.ts`, `_test/cron.pg.test.ts`
- **description**: `runLocalCrons(client, manifest, jobs, now)`:
  - controlla AC28b con `assertIsToday(manifest.day, now)` e `assertSameRomeAndUtcDay(now)`;
  - controlla D6: niente cron già corso, ordine rispettato;
  - esegue `cronJobs[job].run` con `Layer.succeed(Db, client)` e un `ErrorReporter` che stampa e conta i fallimenti;
  - aggiunge la corsa a `manifest.runs`;
  - un job fallito ferma le corse con un errore.

  `delete-export` non è fra i job ammessi. Il modulo importa `api/src/cron/jobs.ts`.
- **validation**: test su Postgres a 300, con D e orologio a mezzogiorno di Roma di D e la sessione in UTC:
  - **AC29, AC1a:** `seedDatabase`, le quattro corse in ordine, `verifyManifest` → tutti gli scenari passati;
  - **AC28a:**
    - con `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW`, `INSTANCE_UNIX_SOCKET`, `PGHOST` e `PGDATABASE` impostate verso un altro database, le corse su un `extraDatabase()` cambiano solo quello;
    - il database di `@/server/db` (il `mito_test_*` principale) resta vuoto;
  - **AC28b:** con l'orologio a D + 1, oppure alle 00:30 di Roma, `runLocalCrons` si ferma senza scrivere;
  - **D6:** una seconda corsa di `update`, oppure `alert` prima di `priority`, viene rifiutata.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "dopo `seedDatabase(N = 300)` e le quattro corse in ordine, `verifyManifest` dà tutti gli scenari passati, con la sessione in UTC".
- **review_mode**: cli
- **complexity**: high

#### TB9: Comandi, guard e documentazione
- **depends_on**: [TB6, TB7, TB8]
- **location**: `src/server/db/seeds/local/cli.ts`, `src/server/db/scripts/localDb.ts` (esporta `pendingMigrations(client)`), `package.json`, `.gitignore`, `README.md` (sezione "Database locale"), `_test/cli.test.ts`, `_test/cli.pg.test.ts`, `_test/imports.test.ts`
- **description**: tre comandi in `package.json` (D5).
  - **`seed:local [--customers N]`:**
    - si collega con `localConnection(LOCAL_DATABASE_URL, { database: "mito_local" })` come opzioni (AC1);
    - controlla `pendingMigrations` e, se ce ne sono, si ferma indicando `pnpm db:local:migrate` (AC2);
    - controlla AC4 e `N` ≥ 300;
    - D è `romeDay(now)`;
    - scrive il manifesto in `.local-seed/manifest.json` e stampa i conteggi.
  - **`seed:local:cron [job…]` e `seed:local:verify`:** leggono il manifesto, si collegano allo stesso modo ed escono con codice diverso da zero quando qualcosa fallisce (AC29). La verifica stampa "passato" o "fallito" per scenario.
  - **Altri file:**
    - `.gitignore` aggiunge `.local-seed/`;
    - il README descrive il giro: `db:local:up`, `db:local:reset`, `db:local:migrate`, `seed:local`, `seed:local:cron`, `seed:local:verify` (AC33);
    - test di AC7 con esbuild (D7).
- **validation**:
  - **Unitari:**
    - la funzione di connessione dei comandi rifiuta un host non locale, un database diverso da `mito_local` e un DSN con query string (AC1);
    - con `PGHOST` e `PGDATABASE` ostili restituisce sempre `127.0.0.1:54329/mito_local` (AC28a);
    - `--customers 299` si ferma.
  - **Su Postgres:** un database migrato fino a una migrazione precedente fa fermare il seed prima di scrivere (AC2).
  - **Import (AC7):** il test esbuild non trova `loadDbEnv` fra gli input dei tre entry point e lo trova in `createSystemOperator.ts`.
  - **Gate:** `next lint` e `tsc` passano.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "il seed su un database con una migrazione mancante si ferma senza scrivere e il messaggio cita `pnpm db:local:migrate`".
- **review_mode**: cli
- **complexity**: high

#### TB10: Giro completo a 10.000 in CI
- **depends_on**: [TB9]
- **location**: `src/server/db/seeds/local/_test/fullRun.pg.test.ts`, eventualmente `.github/workflows/ci.yml` (`timeout-minutes` del job Test)
- **description**:
  - Un test su Postgres fa il giro completo a `N` = 10.000 (D2): `seedDatabase`, le quattro corse, `verifyManifest`. Usa D e orologio fissati e un timeout proprio, per esempio 300 s.
  - Controlla dal database i volumi di AC30: almeno 2 blocchi di `priority`, `alert` con più di una chiamata se il budget lo richiede, ≥ 200 pratiche aggiornate, ≥ 100 compleanni, ≥ 1.000 righe di log cancellate.
  - Misura la durata del job Test in CI. Se supera i 7 minuti alza `timeout-minutes` e lo scrive nel log del task.
- **validation**: il test passa in CI e il file risulta eseguito, non saltato; la durata del job è nel log del task.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a (D9)
- **tdd_target**: "a `N` = 10.000, dopo le quattro corse, `verifyManifest` dà tutti gli scenari passati".
- **review_mode**: cli
- **complexity**: medium

#### TB11: Gate e merge della PR B
- **depends_on**: [TB10]
- **location**: `brain/specs/crm/seeder-locale/IMPLEMENTATION-NOTES.md`
- **description**:
  - Gate di CI (Lint, Test con i `*.pg.test.ts` eseguiti, Build, Backend).
  - Giro a mano su `mito_local` da un Docker nuovo: `pnpm db:local:up`, `db:local:reset`, `db:local:migrate`, poi `seed:local` cronometrato (AC6: meno di 3 minuti, con macchina, core e RAM nelle note), `seed:local:cron`, `seed:local:verify` con tutti gli scenari passati.
  - AC4 lo provano i test di TB1 e TB9: a mano basta il giro in un giorno normale.
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
| 5 | TB5, TB6 | TB4 fatto |
| 6 | TB7 | TB5 e TB6 fatti |
| 7 | TB8 | TB7 fatto e PR A in `dev` (TA3) |
| 8 | TB9 | TB8 fatto |
| 9 | TB10 | TB9 fatto |
| 10 | TB11 (PR B) | TB10 fatto |

TA2 e TB9 toccano tutti e due `package.json` e `README.md`. La PR B riparte da `dev` dopo il merge della A, quindi le due modifiche non si incrociano.

## 11. Strategia di test (fase TDD)

- **Interfacce pubbliche testate:**
  - le funzioni dei moduli: `generateDataset`, `buildManifest`, `writeDataset`, `seedDatabase`, `verifyManifest`, `runLocalCrons`;
  - la funzione di connessione dei comandi;
  - i comandi stessi, solo per argomenti ed exit code.

  Nessun test su funzioni interne del generatore.
- **Un tracciante per task:** ogni task parte dal `tdd_target` e aggiunge un test per volta. Le soglie di AC8–AC30 entrano una alla volta in TB2–TB5, non tutte insieme.
- **Livelli (D2):**
  - unitari, puri, in ambiente `node` (docblock `// @vitest-environment node`, perché il default è jsdom): `day`, `generate`, `manifest`, connessione dei comandi, import con esbuild;
  - Postgres a 300: scrittura, verifica, corse, guard di AC2 e AC28a;
  - Postgres a 10.000: giro completo (TB10);
  - a mano: AC6.
- **Oracolo:** gli esiti attesi vengono dalle tabelle della spec (D10, TB5). Il test che rende il giro significativo è "seed appena fatto → scenari selezionati falliti" (TB7): dimostra che la verifica non passa da sola.
- **Orologio:** `vi.useFakeTimers({ toFake: ["Date"] })` e `vi.setSystemTime(romeNoon(D))`. Non si falsano i timer, così i `setTimeout` di postgres.js e `Effect.sleep` funzionano.

## 12. Gate di rilascio

| Gate | Quando | Che cosa |
|---|---|---|
| G1 | Merge PR A | CI verde. I test dei cron esistenti passano senza modifiche alle asserzioni. `git grep` di AC33 vuoto. |
| G2 | Merge PR B | CI verde con i `*.pg.test.ts` eseguiti, giro a 10.000 compreso. Giro a mano su `mito_local` con AC6 misurato. `adversarial-review` SHIP. |

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Il refactor di TA1 cambia un comportamento dei cron di prod: un errore diverso nei report, una rotta che non risponde più allo stesso modo. | I test esistenti restano con le stesse asserzioni. `DbError` viene mappato in `CronStepFailed` con lo stesso step. `complexity: high`. La PR A è separata e piccola (D3). |
| Una riga generica soddisfa per caso una regola di selezione che nessuno scenario descrive, e la verifica fallisce senza un difetto vero. | D10 e il test di TB5 "uno e un solo scenario". |
| La verifica passa da sola: esito atteso uguale al valore del seed, oppure oracolo derivato dal codice. | La priorità del seed è diversa dall'atteso (spec, TB5). Esiti presi dalla spec. Il test di TB7 parte da "seed appena fatto → fallito". |
| Gli esiti dipendono dal fuso della sessione: `mito_local` è in Europe/Rome, i test in UTC. | Date a mezzogiorno di Roma, scadenze a mezzanotte di Roma. Giro completo con la sessione in UTC (TB8, TB10) e a mano in Europe/Rome (TB11). |
| D difficili: il 31, il 29 febbraio, il cambio dell'ora. | Test del generatore e del manifesto con quei D (§5). |
| Il giro a 10.000 allunga il job Test oltre il limite. | TB10 misura e alza `timeout-minutes`. |
| `--conditions=react-server` cambia la risoluzione di un pacchetto. | Provato su `jobs.ts`. Il giro completo di TB11 passa dal comando vero. |
| La corsa di `alert` su 1.000 alert supera il budget di una chiamata. | È il comportamento atteso: `alertJob` richiama fino a 20 volte. TB10 lo misura. |
| Il manifesto sul file system non corrisponde più a `mito_local`, per un `db:local:reset` dopo il seed. | La verifica fallisce in modo visibile. Il README dice di rilanciare `seed:local`. |

## 14. Tracciabilità AC → task

| AC | Task |
|---|---|
| AC1 | TB9 (connessione), con `localConnection` già testato |
| AC1a | TB6, TB7, TB8 (seed su `mito_test_*` con D scelto, sessione in UTC) |
| AC2 | TB9 |
| AC3 | TB6 |
| AC4 | TB1, TB9 |
| AC5 | TB2–TB4 (puro), TB6 (database) |
| AC6 | TB11 (a mano) |
| AC7 | TB9 (esbuild, D7), `next lint` |
| AC8–AC16 | TB2 |
| AC17 | TB3 |
| AC18 | TB3, TB4 |
| AC19–AC26 | TB4 |
| AC27 | TB4, TB5 |
| AC28 | TA1, TB8, TB9 |
| AC28a | TA1, TB8, TB9 |
| AC28b | TB1, TB8, TB9 |
| AC29 | TB7, TB8, TB9, TB10 |
| AC30 | TB4, TB5, TB10 |
| AC31 | TA2 |
| AC32 | TA2, TB9 |
| AC33 | TA2, TB9 (README sul seeder) |

## 15. Domande aperte

Nessuna. Le domande della spec sono chiuse (2026-10-21) e quelle del piano sono D1–D3.

## 16. Esito della verifica

_Da compilare dopo il gate `adversarial-verifier`._

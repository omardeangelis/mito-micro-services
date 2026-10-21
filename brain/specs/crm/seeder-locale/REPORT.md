---
domain: crm
type: review
scope: spec
spec: seeder-locale
review_target: "spec implementation (PR #55 + PR #56)"
base_ref: 8729c75
head_ref: 34a5f49
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/seeder-locale/RUBRIC]]"
  - "[[specs/crm/seeder-locale/SPEC]]"
  - "[[specs/crm/seeder-locale/PLAN]]"
  - "[[specs/crm/seeder-locale/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-10-21
updated: 2026-10-21
---

# Review Report: Seeder del database locale, PR A + PR B

Si rivede il diff della PR B ([#56](https://github.com/omardeangelis/mito-micro-services/pull/56)), che parte dalla PR A ([#55](https://github.com/omardeangelis/mito-micro-services/pull/55)) e quindi la contiene. Il confronto va da `origin/dev` (`8729c75`) a `34a5f49`.

## Verdict

**SHIP** · impact: critical

Nessun BLOCKER e nessun MAJOR. Prima del merge serve la checklist umana qui sotto, perché l'impatto è critico. I verificatori hanno cercato di rompere quattro cose:
- la parità dei cron di prod;
- il dato inviato a Sentry;
- il targeting del database;
- la correttezza dell'oracolo.

Le hanno attaccate con mutazioni vere (codice alterato, ambiente ostile, righe modificate dopo il giro) e ogni mutazione rilevante è stata presa dai test o dalla verifica. Quello che resta è irrobustimento, e nessun criterio di accettazione è violato.

## Coverage

- Passaggi del rubric eseguiti: 6/6. Quattro sul modello più forte: v1 (parità dei servizi), v2 (bordi e Sentry), v3 (targeting del database), v5 (oracolo). Due sul modello intermedio: v4 (generatore) e v6 (rimozione, documentazione, gate).
- Passaggi saltati o falliti: nessuno.
- Passaggio UI: non previsto. Il cambio non ha interfaccia.
- **Dopo la review:** sulla branch B c'è un commit con un solo test in più, che chiude metà della prima MINOR di v3 e v6 (riga 1 della tabella). I verificatori hanno visto `34a5f49`, senza quel test.

## Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MINOR | v3 targeting, v6 gate | `src/server/db/seeds/local/_test/cronCli.test.ts:55-71` | L'unica prova *comportamentale* che `connectLocal()` ignori un ambiente ostile si salta da sola, con un solo `console.warn`, in due casi: quando la porta 54329 è occupata, ed è il caso normale su una macchina con `mito_local` acceso, e quando il giorno di Roma e quello UTC sono diversi, anche in CI, un'ora o due al giorno. v3 ha alterato `connectLocal` perché leggesse `SUPABASE_DB_CONNECTION_STRING`: è fallito solo `cronCli`. Il salto di v6 si spiega con il Postgres temporaneo che v4 aveva acceso sulla 54329. | **Risolta in parte dopo la review.** In `connection.test.ts` c'è un test che non si salta mai: `connectLocal().client.options` deve avere host 127.0.0.1, porta 54329, database `mito_local` e nessun `path` anche con PG\*, Supabase e `INSTANCE_UNIX_SOCKET` ostili. La stessa alterazione di v3 lo fa fallire. Resta aperto: il test del sottoprocesso può ancora saltarsi. | sì (il salto del sottoprocesso) |
| MINOR | v5 oracolo | `src/server/db/seeds/local/verify.ts:503` | Il controllo di completezza salta le righe `selected: true`, e su quelle confronta solo le colonne `expected`. Un cron che scrive anche una colonna non dichiarata su una riga che seleziona passa verde. Prove di v5: E3, lo `state` di un contatto P1 riscritto; E4, un contatto A3 riscritto in `followup` con `closedAt=null`, che la spec vuole attivo. Tutto passato. Vale anche per U3, che è coperto solo grazie a `$onUpdate` di `updatedAt`: E5b, lo stesso cambio in SQL grezzo, è passato. Rispetta D14 alla lettera. | Sulle righe selezionate confrontare tutte le colonne del dataset tranne quelle che il cron scrive. Il manifest le calcola già in `RowEffects.write`: basta salvarle come `writes`, più `updatedAt`. | sì |
| MINOR | v5 oracolo | `src/server/db/seeds/local/verify.ts:107` | La completezza legge solo le 11 tabelle del dataset. `account`, `session`, `verificationToken`, `chat_to_operator` e `cron_run` non sono mai controllate. | Il seed svuota tutto `public`, quindi basta verificare che queste tabelle siano ancora vuote, o per `cron_run` che contengano solo le corse del giro. | sì |
| MINOR | v5 oracolo | `src/server/db/seeds/local/cron.ts:162-163` | AC28b si controlla una volta, prima del ciclo, con un solo `now`. Un giro partito poco prima della mezzanotte di Roma può eseguire `alert` su D+1 e registrarla come riuscita. La verifica su D+1 rifiuta, quindi non c'è un falso "passato", ma il manifesto porta una corsa sbagliata. | Chiamare `assertIsToday` e `assertSameRomeAndUtcDay` con un `new Date()` nuovo prima di ogni job. | sì |
| MINOR | v3 targeting | `src/server/db/seeds/local/cron.ts:6` | Il grafo del CLI dei cron carica `@mito/server/effect/db` come valore, quindi `packages/db/src/index.ts`, che all'import costruisce un client postgres.js da `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW` e `INSTANCE_UNIX_SOCKET`. Oggi nessuno lo interroga, e postgres.js si collega solo alla prima query. Due test reggono questa linea: v3 ha passato `cron.ts:176` a `DbLive` e sono falliti sia `cronCli` sia `commands.pg`. AC28a resta rispettato. | Difesa in profondità: in `cron.cli.ts` sovrascrivere quelle tre variabili con un placeholder locale morto prima di un `import()` dinamico di `./commands/cron`. | sì |
| MINOR | v2 Sentry | `src/app/api/cron/update/route.ts:34`, `src/app/api/cron/cleanupTaskEventLog/route.ts:23` | `console.error("…", error)` diventa un breadcrumb dello stesso evento Sentry (integrazione Console di `@sentry/node` 8.55.2, `util.format`, 2 KB). Stampa la catena delle cause, compreso il campo `detail` del `PostgresError`, che in un errore di vincolo può contenere valori della riga. Non ci sono né SQL né parametri, che postgres.js tiene non enumerabili. Non è una regressione: prima finiva nel log lo stesso `PostgresError`, più l'SQL. È improbabile su queste tabelle, che non hanno CHECK né trigger. Il commento "without the query's data" promette un po' troppo. | Loggare `{ _tag, code, message }` invece dell'oggetto, oppure togliere `detail`/`where`/`internal_query` in `beforeSend`. | sì |
| MINOR | v4 generatore | `src/server/db/seeds/local/importRates.ts:26-33`, `generate/practices.ts:201` | La regola delle rate coincide con `calculateDebitoResiduo` solo in un processo con TZ=Europe/Rome. Con TZ=UTC, dove l'import gira su Vercel, circa lo 0,4% delle pratiche generiche fuori dagli scenari (38-40 su 9.065) differisce di una rata quando lo spostamento di un mese attraversa un cambio d'ora. D11 documenta la scelta di Roma, e nessun esito dei cron dipende da quelle righe. | Una riga nella spec, in AC14 o nelle Technical Notes: "come la calcola l'import in Europe/Rome". | sì |
| NIT | v1 parità | `packages/server/src/services/cron/updatePractices.ts:57-61` | `shouldUpdate` legge `Date.now()` e non il `Clock` di Effect. Era già così su `dev`, e il comportamento è identico. | Follow-up Effect: passare la soglia dei 30 giorni dal `Clock`. | sì |
| NIT | v1 parità | `src/app/api/cron/update/_test/update.db.test.ts:216-240` | Le SELECT di `updatePractices`/`updateCustomerAge` non hanno ORDER BY, prima come ora. Il test del fallimento parziale si basa sull'ordine di lettura dello heap. | Nessuna azione; da tenere presente se il test diventa instabile. | no |
| NIT | v2 Sentry | `update.db.test.ts:242-263`, `cleanupTaskEventLog.db.test.ts:174-193` | I test nuovi su Sentry girano su PGlite e controllano solo i `message`, non le proprietà enumerabili dell'errore di postgres.js. v2 ha verificato quel lato dal sorgente (`postgres/src/connection.js:403-408`). | Nessuna. | no |
| NIT | v2 Sentry | `apps/api/src/shims/sentry.ts` | Il backend non chiama mai `Sentry.init`, quindi `ErrorReporter` oggi non manda nulla da Cloud Run, né prima né dopo questo cambio. | Fuori scope: va nel piano GCP. | no |
| NIT | v5 oracolo | `src/server/db/seeds/local/verify.ts:86-97` | `kindsOf` dà la tolleranza degli importi a ogni colonna `PgNumeric`, quindi anche a `tasso_pratica` e `reddito`. Nessun cron le scrive. | Elenco esplicito delle colonne importo. | no |
| NIT | v4 generatore | `generate/contacts.ts`, `generate/chats.ts` | L'offset 0 è il mezzogiorno di D: un seed lanciato prima delle 12 contiene timestamp di qualche ora nel futuro. Nessun AC lo vieta e nessun cron li legge. | Nessuna. | no |
| NIT | v6 documentazione | `src/server/db/seeds/local/day.ts:151-156` | Il messaggio dice sempre "dopo le 02:00", anche d'inverno, quando il limite è l'01:00. | Testo con l'ora giusta per la stagione. | no |
| NIT | v6 documentazione | `src/lib/global/loadDbEnv.ts`, `.env.example` | Non citano `db:copy-check:dev` fra gli script che chiamano `loadEnv`. Mancava già su `dev`. | Nessuna in questo cambio. | no |

## What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 parità dei servizi | **Diff:** nei tre servizi cambiano solo `db.` → `client.`, l'avvolgimento in `query(...)` e il rientro. Predicati, colonne del `.set`, aritmetica e conteggi restituiti sono identici byte per byte.<br>**Atomicità:** nessuna transazione, una UPDATE per riga, come vuole D1. I casi di fallimento parziale c'erano già su `dev` e passano invariati.<br>**Test esistenti:** nei test dei cron cambiano solo gli import, e `src/test/**` non è toccato.<br>**Test nuovo:** `cronServices.db.test.ts` mocka `@mito/db` con un proxy che lancia ad ogni accesso. Così prova che i servizi leggono solo il `Db` iniettato.<br>**Gate:** 4 file e 48 test, `tsc` ed eslint puliti. |
| v2 bordi e Sentry | **Sentry:** a Sentry arriva il `DbError` (`Cause.squash`), con il `PostgresError` come causa. Le proprietà proprie sono solo `code` e `_tag`. SQL e parametri sono non enumerabili in postgres.js, perché `debug` non è impostato. Non c'è l'integrazione `extraErrorData`.<br>**Contratto HTTP:** status e corpi sono identici, e i chiamanti di GitHub Actions leggono solo `response.ok`.<br>**Backend:** `CronStepFailed` mantiene i nomi dei passi. `runCron` segna `failed` e risponde 500, e la regola "al massimo una corsa per giorno UTC" non è toccata.<br>**Gate:** 9 file e 173 test. |
| v3 targeting del database | **DSN:** è una costante. `localConnection` rifiuta, prima di costruire il client, host non locali, host multipli, query string e database diversi da `mito_local`. Le opzioni esplicite di postgres.js vincono sulle variabili PG\*.<br>**Prova dall'esterno:** v3 ha lanciato i tre CLI come processi figli con PG\*, Supabase, `DATABASE_URL`, `TEST_DATABASE_URL`, socket Unix e ogni variante di `.env*` ostili. Le connessioni ostili sono state 0.<br>**Grafo dei cron:** non contiene `dotenv`, `@next/env`, `@mito/env` né `loadDbEnv`.<br>**Guardie:** il guard `current_database()` gira prima della transazione con il TRUNCATE. Lo stop sulle migrazioni gira prima di ogni scrittura e nomina `pnpm db:local:migrate`.<br>**Mutazioni:** ognuna è stata presa da un test: `loadDbEnv` aggiunto, `Db` importato come valore, `DbLive` al posto del client, guard tolto. |
| v4 generatore | **Controllore indipendente:** v4 ha riscritto da zero le regole della spec. 0 violazioni su:<br>• 760 giorni con N=300;<br>• 10 giorni difficili con N=10.000;<br>• 129 valori di N.<br>**Selezione su Postgres:** l'SQL di selezione dei cron vero, eseguito su Postgres in sessioni UTC ed Europe/Rome, dà gli stessi conteggi del controllore.<br>**AC5:** hash identico con 7 fusi e locale diversi e con 3 orologi finti.<br>**AC4:** verificato ai confini esatti, anche nei giorni dei cambi d'ora.<br>**D8:** `nextval` > max(id) su tutte le 8 tabelle con identità.<br>**D10:** nessuna riga selezionata fuori dagli scenari.<br>**D12:** importi interi.<br>**AC30:** 5.911 / 1.150 / 250 / 143 / 2.519. |
| v5 oracolo e verifica | **Indipendenza:** `manifest.ts` importa solo `./day`, i tipi e `SYSTEM_OPERATOR_USER_ID`.<br>**Valori attesi:** controllati cella per cella sulle tabelle P1–P12, A1–A6, U1–U11 e L1–L2.<br>**D13:** il controllo non dipende dall'ordine, quindi è più severo del richiesto.<br>**Mutazioni:** M1 (priorità 1→0), M2 (followup lasciato a 150), E1 (riga di confine L2 cancellata), E2 (U2 saltato), E6 (log in più), E7 (scrittura con lo stesso valore su P9), E8 (cambio fuori dagli scenari), E9 (corsa di alert segnata fallita): tutte prese.<br>**Comandi:** `passato`/`fallito` ed exit 1 sono corretti. `cron.ts` esegue i `cronJobs` di prod invariati, nell'ordine di prod, con le guardie di D6. |
| v6 rimozione, documentazione, gate | **AC31:** spariscono esattamente i 10 file e i 4 script, senza importatori rimasti. Togliere `getRandomCustomerRole` non cambia lo schema e non richiede migrazioni.<br>**AC32 e AC33:** rispettati, e README, `.env.example`, `loadDbEnv.ts`, `.eslintrc.cjs` e `AGENTS.md` corrispondono al codice.<br>**Gate:** `next lint`, `tsc`, `api:build`, `api:smoke` e i test toccati sono verdi.<br>**Giro a 10.000 in CI:** gira davvero. Se manca `TEST_DATABASE_URL`, `pg.setup.ts` lancia invece di saltare.<br>**Worktree:** i 5 fallimenti locali in `packages/server` sono in file che il diff non tocca. |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Parità dei servizi dei cron di prod | SHIP | Query e aritmetica sono identiche, l'atomicità è quella di D1, le asserzioni non cambiano e il nuovo test prova che i servizi usano solo il `Db` iniettato. |
| v2 | Bordi d'errore e dato inviato a Sentry | SHIP | Il dato inviato a Sentry è più pulito di prima, il contratto HTTP è identico e `cron_run` non cambia. Il breadcrumb di `console.error` è una MINOR preesistente. |
| v3 | Targeting del database del seeder | SHIP | Nessun input sposta la destinazione e le guardie girano prima di connettersi o di scrivere. Restano robustezza dei test e difesa in profondità. |
| v4 | Generatore contro il contratto dei dati | SHIP | 0 violazioni su centinaia di dataset, e la selezione SQL reale concorda con il controllore. Resta un'assunzione di fuso documentata. |
| v5 | Oracolo e verifica | SHIP | L'oracolo è indipendente e ogni mutazione plausibile dei cron è stata presa. La completezza a livello di colonna sulle righe selezionate è da irrobustire. |
| v6 | Rimozione dei seed, documentazione, gate | SHIP | Nessun importatore rimasto né effetto sullo schema, documentazione allineata, giro a 10.000 eseguito in CI. |

## Human Review Checklist

Obbligatoria: l'impatto è critico. Va seguita prima del merge della PR A in `dev`; i punti 5–8 prima di togliere la PR B dalla bozza.

1. **Parità dei cron (PR A).** Apri il diff dei tre servizi in `packages/server/src/services/cron/`. Il risultato giusto: oltre a `client.`, `query(...)` e al rientro non cambia nulla, nessun predicato e nessuna colonna del `.set`.
2. **Dato inviato a Sentry (PR A).** In `src/app/api/cron/update/route.ts` e `cleanupTaskEventLog/route.ts` controlla che a `Sentry.captureException` e `console.error` arrivi `Cause.squash(exit.cause)`, cioè il `DbError`. Decidi se accettare la MINOR del breadcrumb, per cui `detail` di Postgres può finire in Sentry, o chiedere ora il log ridotto a `{ _tag, code, message }`.
3. **Prima notte dopo il deploy (PR A).** Dopo il merge in `dev` e il rilascio, guarda la prima esecuzione dei workflow `update` e `cleanupTaskEventLog`. Il risultato giusto: `response.ok`, nessun nuovo evento Sentry, conteggi in linea con le notti precedenti.
4. **Gate della PR A.** CI verde sulla testa della #55: Lint, Test, Build, GitGuardian.
5. **Targeting del database, a mano, con ambiente ostile (PR B).** In una shell con `mito_local` acceso (`pnpm db:local:up`, `pnpm db:local:migrate`), esporta valori finti che puntino altrove: `SUPABASE_DB_CONNECTION_STRING=postgres://x:y@db.example.com:6543/postgres`, `PGHOST=db.example.com`, `PGDATABASE=postgres`, `DATABASE_URL=…`. Lancia `pnpm seed:local --customers 300`, `pnpm seed:local:cron`, `pnpm seed:local:verify`. Il risultato giusto: tutti e tre lavorano su `mito_local` e la verifica stampa solo "passato". Con le tue credenziali vere di sviluppo in `.env.development.local` deve succedere lo stesso: i comandi non le leggono.
6. **Guard sul database sbagliato (PR B).** Su un Postgres locale crea un database con un altro nome e prova a puntarci, per esempio cambiando a mano la costante in una copia. Il risultato giusto: errore prima di connettersi, e nessuna tabella svuotata.
7. **Giro completo a 10.000 (PR B).** Su una macchina con almeno 4 core e 16 GB, con il Postgres di `docker-compose.yml`: `pnpm seed:local`, `pnpm seed:local:cron`, `pnpm seed:local:verify`. Il risultato giusto: seed sotto i 3 minuti (AC6), quattro cron riusciti, tutti "passato", exit 0. Un secondo `pnpm seed:local:cron update` deve essere rifiutato.
8. **Follow-up.** Decidi quali MINOR fare prima del merge della B e quali lasciare nel debito tecnico ([[tech-debt/crm/seeder-locale]]). Il consiglio della review: la completezza a livello di colonna sulle righe selezionate (v5) è la più utile, perché oggi un ramo A3 che riscrive il contatto passerebbe.

## Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1 | Met | v3: `localConnection` prima di connettersi; DSN costante; `connection.test.ts` |
| AC1a | Met | `seedDatabase` con il giorno D e un database `mito_test_*` solo dai test; dai CLI non è raggiungibile (v3) |
| AC2 | Met | `pendingMigrations` prima di ogni scrittura; il messaggio nomina `pnpm db:local:migrate` (v3, `commands.pg.test.ts`) |
| AC3 | Met | TRUNCATE di tutte le tabelle `public` (`write.pg.test.ts`); v4 ha verificato che `drizzle.__drizzle_migrations` resti |
| AC4 | Met | v4: confini esatti, anche nei giorni dei cambi d'ora; collegato a seed, cron e verify |
| AC5 | Met | v4: hash identico con 7 fusi e locale e con 3 orologi finti |
| AC6 | Met | Giro a mano: 16 s a 10.000 su 4 core e 15 GB. Postgres 16 invece del 15 di docker-compose, nelle note |
| AC7 | Met | `imports.test.ts` (esbuild) con controllo positivo; ESLint; v3 l'ha alterato e il test l'ha preso |
| AC8–AC13 | Met | v4: controllore indipendente, 0 violazioni |
| AC14 | Met | v4: identico a `calculateDebitoResiduo` in Europe/Rome; MINOR sul fuso, nessun effetto sui cron |
| AC15–AC26 | Met | v4: varietà, operatori e carichi, contatti, priorità, storico, alert, note e log, più la coerenza delle catene di stato |
| AC27 | Met | v4 e v5: ogni caso nominato presente a 300 e a 10.000, L1 e L2 attorno al giorno di taglio |
| AC28 | Met | v5: i `cronJobs` di prod, nell'ordine di prod, con le guardie di D6; `cron.pg.test.ts`, `fullRun.pg.test.ts` |
| AC28a | Met | v3: 0 connessioni ostili dai processi figli; nuovo test di `connectLocal` che non si salta; MINOR sul client globale inutilizzato |
| AC28b | Met | v5: D letto dal manifesto, stop se oggi non è D o se Roma e UTC differiscono; MINOR sul controllo fatto una volta sola |
| AC29 | Met | v5: ogni attesa confrontata, `passato`/`fallito`, exit 1; MINOR sulla completezza a livello di colonna |
| AC30 | Met | v4: 5.911 priorità a 1, 1.150 alert, 250 pratiche, 143 compleanni, 2.519 log vecchi |
| AC31 | Met | v6: 10 file, 4 script, `getRandomCustomerRole`; nessun importatore rimasto né migrazione |
| AC32 | Met | v6: restano solo `seed:local*`, `db:local:reset`, `test:pg`/`test`, tutti con guard |
| AC33 | Met | v6: nessuna menzione fuori da `brain/`; documentazione allineata |

## Notes for docs-maintenance

- Durable findings da portare in [[tech-debt/crm/seeder-locale]]: le 7 MINOR (il salto del test del sottoprocesso AC28a; la completezza a livello di colonna; le tabelle fuori dal dataset; AC28b per job; il client globale nel grafo dei cron; il breadcrumb Sentry di `console.error`; la nota sul fuso in AC14) e la NIT su `Clock` in `shouldUpdate`.
- Pagine di dominio che dovrebbero linkare questa review: il flusso dei cron di CRM, quando esisterà, e la pagina del database locale.

---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/seeder-locale/REPORT]]"
  - "[[specs/crm/seeder-locale/SPEC]]"
  - "[[specs/crm/seeder-locale/PLAN]]"
created: 2026-10-21
updated: 2026-10-21
---

# Tech debt: seeder del database locale

## [2026-10-21] From review [[specs/crm/seeder-locale/REPORT]]

Il cambio è uscito con verdetto SHIP. Nessuna di queste voci viola un criterio di accettazione: sono irrobustimenti dell'oracolo, dei test e della difesa in profondità.

### Oracolo e verifica

- **[FOLLOW-UP]** La completezza salta le righe `selected: true` (`src/server/db/seeds/local/verify.ts:503`).
  - Perché resta: rispetta D14 alla lettera. Un cron che scrive una colonna non dichiarata su una riga che seleziona, però, passa verde. Esempio: un ramo A3 che riscrive il contatto in `followup` invece di lasciarlo attivo. Lo stesso vale per U3, coperto oggi solo da `$onUpdate` di `updatedAt`.
  - Fix: salvare nel manifesto le colonne che ogni cron scrive (`RowEffects.write`, più `updatedAt`) e, sulle righe selezionate, confrontare tutte le altre colonne del dataset.
- **[FOLLOW-UP]** La completezza legge solo le 11 tabelle del dataset (`verify.ts:107`).
  - Fix: verificare che `account`, `session`, `verificationToken` e `chat_to_operator` siano ancora vuote, e che `cron_run` contenga solo le corse del giro.
- **[FOLLOW-UP]** AC28b si controlla una volta, prima del ciclo (`src/server/db/seeds/local/cron.ts:162-163`).
  - Fix: `assertIsToday` e `assertSameRomeAndUtcDay` con un `new Date()` nuovo prima di ogni job.

### Targeting del database

- **[FOLLOW-UP]** Il test AC28a sul sottoprocesso (`_test/cronCli.test.ts:55-71`) si salta quando la porta 54329 è occupata o quando il giorno di Roma e quello UTC sono diversi.
  - Già fatto: un test unitario di `connectLocal()` che non si salta (`_test/connection.test.ts`).
  - Fix: far scegliere al test una porta libera.
- **[FOLLOW-UP]** Il grafo di `seed:local:cron` costruisce all'import il client globale di `@mito/db` dalle variabili Supabase e Cloud Run (`cron.ts:6`, tramite `@mito/server/effect/db`). Nessuno lo interroga, e due test lo tengono fermo.
  - Fix, per difesa in profondità: in `cron.cli.ts` sovrascrivere `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW` e `INSTANCE_UNIX_SOCKET` con un placeholder locale morto prima di un `import()` dinamico di `./commands/cron`.

### Cron di prod

- **[FOLLOW-UP]** `console.error("…", error)` nelle rotte dei cron diventa un breadcrumb Sentry che contiene la catena delle cause, compreso `PostgresError.detail` (`src/app/api/cron/update/route.ts:34`, `cleanupTaskEventLog/route.ts:23`).
  - Perché resta: era già così prima del cambio, ed è improbabile su queste tabelle, che non hanno CHECK né trigger.
  - Fix: loggare `{ _tag, code, message }`, oppure togliere `detail`/`where`/`internal_query` in `beforeSend`.
- **[FOLLOW-UP, Effect]** `shouldUpdate` legge `Date.now()` e non il `Clock` (`packages/server/src/services/cron/updatePractices.ts:57-61`). Già così su `dev`.

### Spec

- **[FOLLOW-UP]** AC14 dice "quello che l'import calcolerebbe". La regola coincide con `calculateDebitoResiduo` solo in un processo Europe/Rome (D11). In UTC circa lo 0,4% delle pratiche generiche differisce di una rata.
  - Fix: una riga nella spec che fissi il fuso.

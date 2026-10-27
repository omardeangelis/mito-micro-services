---
domain: crm
type: plan
links:
  - "[[specs/crm/effect-4/SPEC]]"
  - "[[chore/roadmap-nuovo-stack]]"
  - "[[chore/migrazione-effect]]"
  - "[[chore/manutenzione-dipendenze]]"
created: 2026-10-27
updated: 2026-10-27
---

# Plan: Effect 4, vitest 5 e lo stile di Effect 4 (punto 1.1 della roadmap)

**Spec:** [[specs/crm/effect-4/SPEC]], scritta il 2026-10-27, approvata da Omar in G0 lo stesso giorno.
**Status:** In progress
**Generato:** 2026-10-27 con `create-plan`. Il flusso:
- grill (5 decisioni di Omar);
- spec;
- task graph e tdd;
- verifica del piano: DO NOT SHIP, 2 blocker, 7 major, 11 minor, 3 nit, tutti corretti (§16), con una sesta decisione di Omar.

**Baseline:** `dev` a `5adbfc1` (merge della PR #108, la C2 di better-auth), più la PR #111 (solo documenti).
**Quattro PR verso `dev`:**

| PR | Branch | Contenuto | Parte |
|---|---|---|---|
| 1 | `claude/effect-4` | Effect 3 → 4 con i soli cambi necessari, più i test che fissano i comportamenti scoperti | da G0 |
| 2 | `claude/vitest-5` | vitest 1.6 → 5, solo il runner | da G0, in parallelo alla 1 |
| 3 | `claude/effect-vitest` | i test che eseguono programmi Effect su `@effect/vitest` | dopo il merge della 1 e della 2 |
| 4 | `claude/effect-4-stile` | servizi e layer, `Schema.TaggedError` ed `Effect.fn` nel codice | dopo il merge della 3 |

**Chi:** scrive Omar. Rivede Leonardo, obbligatoriamente per la PR 1 e la PR 4, che toccano i file dell'auth.
**Strategia di contesto:** [[chore/roadmap-nuovo-stack]], punto 1.1; regole dei servizi nel §2 di [[chore/migrazione-effect]].

---

## 1. Situazione iniziale

- `effect` 3.22.2 è nel `package.json` della radice, ed è l'unica copia (`pnpm why effect`). Nessun pacchetto del workspace lo dichiara, nessuna dipendenza esterna lo usa.
- 147 file importano `effect`, tutti dalla radice `"effect"`: 99 di produzione e 48 di test o helper di test. Per pacchetto, test compresi: 122 in `packages/server`, 13 in `apps/api`, 10 in `src`, 2 in `packages/db`.
- Le API usate, contate con uno script sui 147 file (2026-10-27):
  - **`Effect`:** `gen` 130, `provide` 55, `runPromise` 39, `runPromiseExit` 34, `fail` 33, `tryPromise` 22, `catchTag` 6, `tapErrorCause` 6, `either` 4, `withClock` 7, `runtime` 2, `dieMessage` 2, `zipRight` 2, `withConfigProvider` 2, `catchAllCause` 2, `catchAll` 1, `filterOrDieMessage` 1.
  - **`Exit`:** `isSuccess`, `isFailure`, `succeed`, `isInterrupted` (1).
  - **`Layer`:** `succeed` 33, `mergeAll` 10, `merge` 9, `unwrapEffect` 2.
  - **`Cause`:** `pretty` 21, `failureOption` 12, `squash` 11, `dieOption` 1.
  - **Il resto:** `Data.TaggedError` 63; `Clock.currentTimeMillis` 19 e `ClockTypeId` 12; `Context.Tag` 11; `Either` 7; `ConfigProvider.fromMap` 2; `Config` 10; `Runtime` 2; `ManagedRuntime` 1; `Logger` 4.
- I 10 servizi (`Context.Tag`): `Db`, `Tx` (`effect/db.ts`), `ErrorReporter` (`effect/errorReporter.ts`), `ImportConfig`, `ImportQueue` (`services/import/`), `Storage` (`services/storage/storage.ts`, id `"gcs-storage-kit/Storage"`), `AuthSession` (`betterAuth/session.ts`), `CronAuth`, `CronReport` (`apps/api/src/cron/`), `ImportAuth` (`apps/api/src/import/auth.ts`).
- 61 classi `Data.TaggedError` di produzione, in 19 file.
- 74 funzioni che restituiscono un `Effect.gen` (misurate da T1; la stima era 75); prettier spesso manda `Effect.gen(` a capo.
- 49 file di test eseguono programmi Effect (`Effect.run*` o `runServer`). 11 sono "puri"; 38 leggono anche il database con le Promise di Drizzle, in 400 righe `expect(await …)`, e contengono 14 `await expect(…).resolves/rejects`.
- vitest 1.6.1 con `vitest.workspace.ts`:
  - `unit` è la configurazione della radice: jsdom, e i `*.db.test.ts` in `node` con `environmentMatchGlobs`, nel pool `threads` di default;
  - `pg` gira su Postgres vero, con un setup in più;
  - `utc` e `rome` fanno girare i test dei fusi in `forks`, con `TZ` impostato.
- La CI esegue `pnpm run test --run` (`.github/workflows/ci.yml:84`); `pnpm test:pg` usa `--project pg`.

## 2. Problema

La fase 2 della roadmap scrive gli endpoint `HttpApi` di Effect 4. Il codice server è su Effect 3: va portato a Effect 4 senza cambiare comportamento. Omar ha scelto di adottare anche lo stile di Effect 4, cioè servizi e layer, `Effect.fn`, `Schema.TaggedError` e `@effect/vitest` per tutti i test che eseguono Effect. `@effect/vitest` 4 richiede vitest 5.

## 3. Forma della soluzione

Quattro PR in serie, ognuna con un solo motivo per rompersi. Il comportamento resta quello di oggi, e lo controllano le stesse asserzioni (AC5) attraverso uno script che legge l'AST.

**PR 1 – Effect 4.** Prima lo script delle asserzioni e i test che fissano su Effect 3 i comportamenti scoperti (AC6), poi il passaggio di versione, diviso per cartella: nucleo, `packages/server`, il resto.
- **La transazione.** `Effect.runtime` + `Runtime.runPromiseExit` diventano `Effect.context<R>()` + `Effect.runPromiseExitWith(context)`. `Effect.either` diventa `Effect.result`, e il `yield*` dell'esito passa da `Effect.fromResult`. Il controllo del `DbError` recuperato diventa `Effect.flatMap((a) => tx.failed ? Effect.die(new Error(msg)) : Effect.succeed(a))`, con lo stesso messaggio. Non si usa `filterOrFail` + `orDie`: messo nella pipe del programma, trasformerebbe in *defect* anche i suoi errori tipati.
- **La coda in processo.** `Runtime.runFork` diventa `Effect.runForkWith`.
- **Il logger.** `Logger.layer([Logger.withLeveledConsole(Logger.formatLogFmt), Logger.tracerLogger])`, perché in v3 `Logger.replace` lasciava il `tracerLogger` di default.
- **La configurazione.** `storageLayer` e `importQueueChoice` leggono `Config` con un `ConfigProvider.fromEnv()` creato a ogni lettura (dentro `Effect.suspend`). In v4 il provider di default fotografa `process.env` alla prima lettura, mentre in v3 ogni lettura vedeva l'ambiente del momento (D15).
- **Le asserzioni sulla forma di `Cause` ed `Exit` di v3.** Si riscrivono in modo meccanico, solo nei punti dell'elenco chiuso del §6 (D14).
- **Il resto.** I rinomi della mappa ufficiale (SPEC, Context). I servizi passano da `Context.Tag("X")<X, S>()` a `Context.Service<X, S>()("X")` con lo **stesso** id; gli id nuovi arrivano nella PR 4.

**PR 2 – vitest 5.**
- `vitest.workspace.ts` diventa `test.projects` di `vitest.config.ts`, ed `environmentMatchGlobs` un progetto `node` per i `*.db.test.ts`.
- Si fissano ai valori di vitest 1 le opzioni il cui default è cambiato (D16):
  - `pool: "threads"` per i progetti che non sono dei fusi;
  - `fakeTimers.toFake` con i sette timer di v1;
  - l'`exclude` di v1.
- `clearMocks` resta al nuovo default `true`. Con vitest 5 `restoreAllMocks` non azzera più i `vi.fn`, e con `false` i test che contavano su quell'azzeramento fallirebbero.
- Una sonda prima e dopo verifica, per ogni file, ambiente, fuso, pool e timer finti (AC3).

**PR 3 – `@effect/vitest`, per tutti i 49 file** (D13):
- `it.effect` con `TestClock` è il caso normale.
- `it.live` quando il test dipende dal tempo reale (`now()` del database, un `sleep` vero, una fibra staccata) o osserva la console: `it.effect` fornisce una console finta.
- `expect(await X)` diventa `expect(yield* Effect.promise(() => X))`, che lo script tratta come la stessa asserzione.
- L'orologio a passi di `concurrency.pg.test.ts` resta scritto a mano (eccezione di AC8).

**PR 4 – lo stile v4 nel codice:**
- **(a) servizi e layer** con id dal percorso e layer statici;
- **(c) gli errori** in `Schema.TaggedError`;
- **(b) le funzioni** in `Effect.fn` / `Effect.fnUntraced`.

I test della PR 3 fanno da guardia. Cambiano solo nei nomi importati, mai nelle asserzioni.

**Nomi della PR 4 (D8, confermati in G0).** La regola:
- `layer` è il layer principale, e le varianti hanno un suffisso che le descrive;
- un layer è statico sulla classe quando si può definire nel file del servizio senza un import circolare;
- altrimenti è una costante esportata `<nome>Layer` nel suo modulo.

| Oggi | PR 4 | Id |
|---|---|---|
| `Db`, `DbLive` | `Db`, `Db.layer` | `@mito/server/effect/Db` |
| `Tx` | `Tx` (nessun layer: lo fornisce `transaction`) | `@mito/server/effect/Tx` |
| `ErrorReporter`, `SentryReporterLive` | `ErrorReporter`, `ErrorReporter.layer`; il mock di `src/test/setup.ts:20-33`, che oggi sostituisce `SentryReporterLive` per nome, segue il nuovo nome | `@mito/server/effect/ErrorReporter` |
| `ServerLive`, `ServerContext` | `serverLayer`, `ServerServices` (`effect/server.ts`) | – |
| `ImportConfig`, `ImportConfigLive` | `ImportConfig`, `ImportConfig.layer` | `@mito/server/services/import/ImportConfig` |
| `ImportQueue`, `importQueueCloudTasks(...)`, `importQueueInProcess(handlers)`, `importQueueDisabled` | `ImportQueue.layerCloudTasks(...)`, `ImportQueue.layerInProcess(handlers)`, `ImportQueue.layerDisabled` | `@mito/server/services/import/ImportQueue` |
| `ImportLive` (`services/import/live.ts`) | `importLayer` (importa gli handler, che usano `ImportQueue`) | – |
| `Storage`, `StorageLive`, `makeGcsStorageLayer`, `makeSupabaseStorageLayer`, `makeMemoryStorageLayer` | `Storage`, `storageLayer`, `gcsStorageLayer(config)`, `supabaseStorageLayer(config)`, `memoryStorageLayer(...)` (`gcs.ts` importa `Storage`) | `@mito/server/services/storage/Storage` |
| `AuthSession`, `authSessionOf(auth)` | `AuthSession.layerOf(auth)` | `@mito/server/betterAuth/AuthSession` |
| `CronAuth`, `cronAuth(caller, keys)`, `cronAuthDisabled` | `CronAuth.layerOidc(caller, keys)`, `CronAuth.layerDisabled` | `@mito/api/cron/CronAuth` |
| `CronReport`, `logReport`, `slackReport(...)` | `CronReport.layerLog`, `CronReport.layerSlack(...)` | `@mito/api/cron/CronReport` |
| `ImportAuth`, `importAuth(caller, keys)`, `importAuthDisabled` | `ImportAuth.layerOidc(caller, keys)`, `ImportAuth.layerDisabled` | `@mito/api/import/ImportAuth` |
| `cronLive(env)`, `importLive(env)` (`apps/api`) | `cronLayer(env)`, `importRouteLayer(env)` | – |

**Nomi di `Effect.fn` (D9):** `"<area>.<funzione>"`, dove l'area è la cartella del servizio (`contact.reassignContact`, `import.applyImport`), `db` per `effect/db.ts`, `cron` e `import` per `apps/api`. `Effect.fnUntraced` va per gli helper non esportati e per le funzioni chiamate per ogni riga o elemento di un ciclo (import, query).

## 4. Decision ledger (risolto)

| # | Decisione | Fonte |
|---|---|---|
| D1 | SPEC corta + PLAN in `brain/specs/crm/effect-4/` | Omar, 2026-10-27 |
| D2 | Comportamento invariato e stesse asserzioni in ogni PR (AC5); se un test fallisce per la semantica di v4 si corregge il codice | Roadmap 1.1, "con le stesse asserzioni" |
| D3 | Niente fase 2: né `HttpApi` né `Schema` per gli input | Roadmap |
| D4 | Revisione obbligatoria di Leonardo sulla PR 1 e sulla PR 4 | Regola 5 del §2 della roadmap: toccano i file dell'auth |
| D5 | `effect` e `@effect/vitest` a `~4.0.6` | I moduli `http-api` della fase 2 sono `@stability unstable` |
| D6 | Quattro PR: Effect 4 e vitest 5 in parallelo, poi `@effect/vitest`, poi lo stile nel codice | Omar, 2026-10-27 |
| D7 | La PR 4 adotta (a) servizi e layer, (b) `Effect.fn`, (c) `Schema.TaggedError`; la (d) è la PR 3. La PR 4 è un'eccezione approvata alla regola di `AGENTS.md` "solo il codice che la modifica tocca", e la descrizione della PR lo dice | Omar, 2026-10-27 |
| D8 | Nomi di servizi e layer come nella tabella del §3 | Omar, 2026-10-27 (G0), sulla convenzione di `LLMS.md` di Effect 4 (`layer`, suffissi per le varianti) |
| D9 | `Effect.fn("<area>.<funzione>")`; `Effect.fnUntraced` per gli helper interni e i percorsi caldi | Omar, 2026-10-27 (G0); `LLMS.md` di Effect 4: `fn` quando una traccia serve, `fnUntraced` nei percorsi caldi |
| D10 | Le funzioni libere restano funzioni libere: niente raggruppamento in servizi | Non-goal della SPEC: la forma la decide la fase 2 |
| D11 | Lo script di AC5 (`scripts/check-assertions.mjs`) entra nella PR 1 e si toglie nella PR 4 (T21). La PR 2, in parallelo, lo prende dal branch della PR 1 (`git show claude/effect-4:scripts/check-assertions.mjs`) | Serve a quattro PR in branch diversi; è uno strumento della migrazione, non del prodotto |
| D12 | Nella PR 1 gli orologi fissi dei test passano a un solo helper con l'interfaccia v4 (`services/analytics/_test/clock.ts`); nella PR 3 a `TestClock`, tranne l'orologio a passi di `concurrency.pg.test.ts` | Vanno riscritti comunque: una copia invece di sei |
| D13 | Tutti i 49 file che eseguono Effect passano a `@effect/vitest`, con `expect(await X)` → `expect(yield* Effect.promise(() => X))` | Omar, 2026-10-27, dopo la verifica del piano |
| D14 | Eccezione chiusa ad AC5 per le asserzioni che leggono la forma di `Cause` ed `Exit` di v3 (elenco nel §6) | Omar, 2026-10-27 (G0), dopo la verifica del piano (OQ2 della SPEC, chiusa) |
| D15 | `Config` letto con un `ConfigProvider.fromEnv()` creato a ogni lettura in `storageLayer` e `importQueueChoice`; nei test, `ConfigProvider.fromEnv({ env })` al posto di `fromMap` | Tiene il comportamento di v3; `fromUnknown` con un oggetto annidato dà `None` (prova della verifica) |
| D16 | vitest 5 con `pool: "threads"` (fuori dai fusi), `fakeTimers.toFake` e `exclude` di v1; `clearMocks` al default `true` | I default cambiati, misurati con prove su vitest 1.6 e 5 |

## 5. Assunzioni e vincoli

- **Nessuna migrazione del database:** nessun task tocca `packages/db/src/schema/*` o `packages/db/migrations/`.
- **Il lockfile.** La PR 1 e la PR 2 cambiano entrambe `package.json` e `pnpm-lock.yaml`. Chi arriva seconda unisce `dev`, rigenera il lockfile con `pnpm install` e non risolve a mano i conflitti del lockfile.
- **I documenti condivisi.** La PR 1 e la PR 2 aggiornano lo stesso `PLAN.md`, lo stesso `IMPLEMENTATION-NOTES.md` e il §4 e il §8 della roadmap. Ognuna scrive solo le sue sezioni: i suoi task, la sezione "PR 1" o "PR 2" delle note, la sua riga del §4. Al merge di `dev` si tengono le due parti.
- **Node.** vitest 5 vuole Node ≥ 22.12. In locale c'è 22.17.1; la CI e Vercel usano `engines.node` `22.x`, quindi l'ultima 22. `@types/node` resta alla 20: vitest 5 la dichiara come *peer* opzionale (`^22 || >=24`) e pnpm dà solo un avviso. L'aggiornamento è già nel §4 della roadmap.
- **L'ESM.** `effect` 4 è solo ESM. Next.js 14 impacchetta le dipendenze del server, `apps/api` produce un bundle ESM con i pacchetti esterni, e gli script girano con `tsx`. `pnpm build`, `pnpm api:smoke` e la prova in `pnpm dev:web` lo verificano (T8).
- **Assunzione (OQ1 della SPEC).** Se un test di AC7 fallisce per la regola nuova dei *defect*, si corregge il codice dove serve e si annota. Se la correzione non è locale, ci si ferma e si chiede.
- **Il logger.** La verifica ha provato che il logger nuovo tiene i metodi della console e il formato `chiave=valore` (`failed=1`). Restano possibili piccole differenze di forma (il livello, l'id della fibra), che nessun test e nessun allarme legge.
- **Sentry.** I *defect* che oggi nascono da `dieMessage` (`RuntimeException`) diventano `Error`: in Sentry cambia il titolo di quegli eventi, non il loro numero.

## 6. Findings dal codice

- **`transaction`** (`packages/server/src/effect/db.ts:110`) esegue il programma dentro la callback di Drizzle con `Runtime.runPromiseExit(runtime)`.
  - La verifica ha provato su 4.0.6 che `Effect.context()` + `runPromiseExitWith` porta `Clock`, servizi, logger e annotazioni dei log.
  - `committed` è un `Either` dato a `yield*`: in v4 serve `Effect.fromResult`.
- **`importQueueInProcess`** (`services/import/queue.ts:143`) fa partire i task con `Runtime.runFork(runtime)`. In v4 diventa `Effect.context` + `Effect.runForkWith`. Il tipo `Context.Tag.Service<typeof ImportQueue>` diventa `ImportQueue["Service"]`.
- **`createStorageClient`** (`services/storage/promise.ts`) usa `ManagedRuntime`. In v4 il `ManagedRuntime` non è più un `Effect`, ma `runPromiseExit` e `dispose` restano. `Cause.failureOption` diventa `Cause.findErrorOption`.
- **`ServerLive`** (`effect/server.ts`) usa `Logger.replace(Logger.defaultLogger, Logger.withLeveledConsole(Logger.logfmtLogger))`. In v4 `withLeveledConsole` e `defaultLogger` esistono ancora (sorgente di `Logger.ts` 4.0.6), mentre `logfmtLogger` diventa `formatLogFmt`.
- **La configurazione** sta in `services/import/queue.ts:178` (`importQueueChoice`), `services/storage/config.ts` e `services/storage/layer.ts`. Due test cambiano l'ambiente fra un test e l'altro, e con il provider di default di v4 fallirebbero:
  - `storage/_test/supabase.test.ts:406-440` (`GCS_BUCKET=b`, poi `""`);
  - `api/routers/import/_test/import.db.test.ts:284-300` (`vi.stubEnv("VERCEL","1")` dopo le letture delle righe 177–272).
- **`Either`:** è usato in `contact/operator.ts`, `contact/reassign.ts`, `customer/assignment.ts`, `export/files.ts`, `apps/api/src/cron/jobs.ts` e `src/app/api/export/download/route.ts`. `export/files.ts:46` e la rotta del download condividono il contratto: stanno nello stesso task (T4). In v4 `.left` diventa `.failure`, `Either.right` diventa `Result.succeed` ed `Either.left` diventa `Result.fail`.
- **Le asserzioni che leggono la forma di v3** (l'elenco chiuso di D14, che T1 completa con una ricerca su `dev`):
  - `expect(Exit.isFailure(exit) && exit.cause).toMatchObject({ error })` in `contact/_test/guard.db.test.ts:79` (e nell'helper `failure` alla riga 33, usato alle righe 105, 120 e 175), `contact/_test/reassign.db.test.ts:225`, `import/_test/apply.db.test.ts:201,233,284`, `import/_test/concurrency.pg.test.ts:319`, `import/_test/queue.test.ts:172`;
  - `cause: { _tag: "Fail", error: … }` in `apps/api/src/cron/_test/cron.db.test.ts:505,534`;
  - `exit.cause._tag === "Fail"` negli helper `failureOf` di `import/_test/run.db.test.ts:96` e `run.pg.test.ts:112`, riscritti in modo fedele: una sola ragione, di tipo `Fail`;
  - `expect(Exit.isInterrupted(exit))` in `effect/_test/db.db.test.ts:87`.
- **Gli orologi scritti a mano:**
  - `services/analytics/_test/clock.ts` e cinque test di `services/import/_test/` (`apply.db`, `history.db`, `purge.db`, `run.db`, `run.pg`): orologi fissi;
  - `concurrency.pg.test.ts:297-316`: un orologio a passi, che avanza a ogni lettura.
- **I test che osservano la console:** `effect/_test/db.db.test.ts:234-243` (`logError` → `console.error`), `effect/_test/trpc.db.test.ts:32-56` e `src/app/api/cron/alert/_test/alert.db.test.ts:269`. Nella PR 3 vanno con `it.live`.
- **Il tempo nei test della coda:**
  - `run.db.test.ts:509-534` ha una pulizia `Effect.void`, senza `sleep`, in una fibra staccata sull'orologio reale (`it.live`);
  - `queue.test.ts:162-176` aspetta davvero, con un ritardo esponenziale da 200 ms, e con `TestClock` resterebbe bloccato (`it.live`).
- **La concorrenza.** `Effect.all({ concurrency: "unbounded" })` sta in `analytics/contactProgress.ts:34`, `customer/list.ts:250` e `practice/list.ts:179`: sono letture, dove l'unico errore tipato è `DbError`.
- **`pnpm api:dev`** legge `.env.development.local`, cioè il database di sviluppo, non `mito_local`: nessun task lo usa per lanciare un cron.
- **vitest.** `windows.db.test.ts` è insieme un test dei fusi e un test del database: nei progetti `utc` e `rome` gira in `node` grazie a `environmentMatchGlobs` ereditato. Nessun test chiama `vi.mock` dentro una funzione. Ci sono 40 chiamate a `vi.useFakeTimers`.

## 7. Ricerca esterna

- **`effect` 4.0.6 su npm:**
  - `latest`, `"type": "module"`, nessuna dipendenza;
  - `prev` è 3.22.4;
  - `@effect/vitest` 4.0.6 vuole `effect ^4.0.6` e `vitest >=5 <6`.
- **Repo `Effect-TS/effect`** (`packages/effect`):
  - `MIGRATION.md`;
  - `migration/{services,cause,error-handling,runtime,layer-memoization,yieldable,fiberref}.md`;
  - `migration/v3-to-v4.md`, la mappa dei rinomi generata;
  - `LLMS.md` (stile: `Effect.fn`, `Context.Service` con `layer` statico, `Schema.TaggedError`);
  - `SCHEMA.md` (§TaggedError);
  - `ai-docs/src/09_testing/*` (`it.effect`, `it.live`, `layer`, `TestClock`).
- **vitest 5** (vitest.dev/guide/migration):
  - Vite ≥ 6.4 come dipendenza del progetto, Node ≥ 22.12;
  - i progetti in linea ereditano la radice (`extends: true` di default) e **sommano** i `setupFiles`;
  - `clearMocks` è vero di default.
- **vitest 4** (v4.vitest.dev/guide/migration): spariscono `workspace`/`defineWorkspace` (diventano `test.projects`), `environmentMatchGlobs` e `poolMatchGlobs` (diventano `projects`) e `poolOptions` (le sue opzioni passano in alto).
- **Le prove della verifica del piano** (2026-10-27), con `effect` 3.22.2 e 4.0.6, `vitest` 1.6.1 e 5.0.5, `vite` 7.3.7 e `@effect/vitest` 4.0.6 installati in cartelle di prova:
  - **`Cause` e `Exit`:** forma piatta del `Cause`, `Exit.hasInterrupts`;
  - **la configurazione:** fotografia dell'ambiente nel provider di default;
  - **i test:** `TestConsole` dentro `it.effect`;
  - **i default di vitest:** pool `forks`, `toFake`, `restoreAllMocks`;
  - **gli schemi:** `Schema.optionalKey`, `Schema.Unknown`, `Schema.Date` e `Schema.Defect()` nei costruttori.
- **`@vitejs/plugin-react`:** la 6.x vuole Vite 8. La 4.7 del repo accetta Vite fino alla 7.

## 8. Grafo delle dipendenze

```
G0 ─┬─ T1 ─ T2 ─ T3 ─┬─ T4 ─┬─ T7 ─ T8 ══ PR 1 in dev ══╗
    │                └─ T5 ─┘                          ║
    └─ T9 ─ T10 ─ T11 ══════════════ PR 2 in dev ══════╣
         (T10 usa lo script di T1)                     ║
                                                       ╚═ T12 ─┬─ T13 ─┐
                                                               ├─ T14 ─┤
                                                               ├─ T15 ─┼─ T17 ══ PR 3 in dev ══ T18 ─ T19 ─┬─ T20a ─┐
                                                               └─ T16 ─┘                                    ├─ T20b ─┼─ T21 ══ PR 4 in dev
                                                                                                            └─ T20c ─┘
```

- T6 non c'è più: dopo la verifica, i test passano al task che possiede la loro cartella (§16).
- T3 possiede il nucleo, `src/test/**` e l'orologio condiviso dei test: le validazioni di T3 usano solo file suoi.
- T4 possiede tutto `packages/server`, test compresi, più la rotta del download (`src/app/api/export/**`), che condivide il contratto `Result` con `export/files.ts`. T5 possiede `apps/api`, `packages/db`, `src/app/api/cron/**` e `src/server/db/seeds/**`, test compresi. Le cartelle di T4 e T5 sono disgiunte.
- Fino a T7 `tsc` sull'intero repo resta rosso, perciò ogni task controlla i suoi file (§11).
- T13–T16 toccano cartelle di test disgiunte, e T12 fissa gli helper e il modello.
- T19 dopo T18 e T20 dopo T19: errori, servizi e funzioni stanno spesso negli stessi file (`effect/db.ts`, `services/auth/login.ts`, `apps/api/src/cron/jobs.ts`).

## 9. Task

### PR 1 – Effect 4

#### G0: SPEC e nomi approvati
- **depends_on**: []
- **location**: `brain/specs/crm/effect-4/SPEC.md`, §3 e §4 di questo piano
- **description**: Omar porta la SPEC a `status: approved` e conferma D8 (nomi), D9 (nomi di `Effect.fn`) e D14 (eccezione di AC5 per la forma di `Cause` ed `Exit`). Nessun task parte prima.
- **validation**: frontmatter `status: approved`; D8, D9 e D14 senza "Proposta"; OQ2 della SPEC chiusa.
- **status**: Done
- **log**: 2026-10-27, Omar approva la SPEC e conferma D8, D9 e D14 (risposte a `implement-spec`).
- **files edited/created**: `SPEC.md` (status, OQ2, decision log), `PLAN.md` (D8, D9, D14, §15)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

#### T1: Lo script delle asserzioni e delle funzioni `Effect.gen`
- **depends_on**: [G0]
- **location**: nuovo `scripts/check-assertions.mjs` (D11), con il compilatore `typescript` del repo
- **description**: Uno script Node con due modi.
  1. **`assertions <base> <head> [--exceptions file]`** (AC5).
     - **Quali file:** ogni file di test toccato, rinominato (con `-M`) o cancellato fra i due ref (`**/_test/**`, `*.test.ts`, `*.test.tsx`), più `src/test/**`.
     - **Che cosa legge:** per ogni file, prima e dopo, raccoglie con l'AST ogni catena che parte da `expect(`, `expect.` o `assert.`, intera, anche su più righe, compresi gli argomenti annidati come `expect.anything()`. La stampa normalizzata ignora spazi e a capo.
     - **Le equivalenze che applica:**
       - `await X` dentro la catena è uguale a `yield* Effect.promise(() => X)` (PR 3);
       - una catena spostata fra due test dello stesso file non conta.
     - **Il confronto:** i multinsiemi per file, con le stesse ripetizioni. Esce con 1 ed elenca le catene tolte e aggiunte, a meno che il file di eccezioni (`file:riga` della catena nuova, con il motivo) le copra.
  2. **`gen-wrappers <ref>`** (AC11): elenca le funzioni (frecce, `function`, metodi) il cui corpo è una chiamata a `Effect.gen`, o la restituisce, nel codice di produzione di `packages`, `apps` e `src`.

  Poi la ricerca su `dev` che completa l'elenco di D14: `git grep -nE "cause\)\.toMatchObject|cause\._tag|_tag: \"(Fail|Die|Sequential|Parallel|Empty)\"|Exit\.isInterrupted|isFailType|isDieType" -- '**/_test/**' src/test`. L'elenco va nel file di eccezioni della PR 1.
- **validation**:
  - **`assertions`**, su un branch di prova buttato via, sei casi:
    - un `toBe(1)` cambiato in `toBe(2)` esce con 1 e lo nomina;
    - una riga dentro un `toMatchObject({ … })` su più righe cambiata esce con 1;
    - un file di test cancellato esce con 1;
    - un'indentazione cambiata esce con 0;
    - un `expect(await f())` riscritto in `expect(yield* Effect.promise(() => f()))` esce con 0;
    - una catena coperta dal file di eccezioni esce con 0.
  - **`gen-wrappers` su `dev`:** trova almeno 74 funzioni, tra cui `lockCustomer` e `query` (`effect/db.ts`).
  - **La ricerca di D14:** trova almeno i punti del §6.
- **status**: Done
- **log**: 2026-10-27, worker sonnet, review del supervisore passata al primo giro.
  - RED: `t1-harness.sh` (scratchpad, 10 casi, 11 controlli) 0/11 senza script, 11/11 con lo script.
  - `gen-wrappers origin/dev`: 74 funzioni, con `query` (`db.ts:58`) e `lockCustomer` (`db.ts:200`). La soglia di AC11 passa da 75 a 74: le forme escluse sono programmi (`run: Effect.gen(...)` in `apps/api/src/cron/jobs.ts`, `const x = Effect.gen(...)`), `Effect.gen(...).pipe(...)` e frecce il cui corpo è `transaction(Effect.gen(...))` (23), che non restituiscono direttamente un `Effect.gen`.
  - `assertions origin/dev HEAD`: exit 0. Le virgole finali prima di `)`, `]`, `}` non contano (un formatter le aggiunge o le toglie).
  - La ricerca di D14 su `dev` trova i punti del §6 e nient'altro fra le asserzioni (`IMPLEMENTATION-NOTES.md`).
- **files edited/created**: `scripts/check-assertions.mjs` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "Con una riga cambiata dentro un `toMatchObject({…})` su più righe fra `base` e `head`, lo script esce con 1 e stampa la catena prima e dopo".
- **review_mode**: cli
- **complexity**: medium

#### T2: Caratterizzazione su Effect 3 (AC6)
- **depends_on**: [T1]
- **location**: `packages/server/src/effect/_test/db.db.test.ts` (il `describe("ServerLive")` e un `describe` nuovo per `transaction`), `packages/server/src/services/storage/_test/` (`gcs.test.ts` o un file nuovo `promise.test.ts`)
- **description**: Test nuovi, scritti e verdi su `dev` (Effect 3), che restano verdi dopo T3–T5:
  1. **I log del server.** Accanto al test di `logError` già presente (riga 234): con `ServerLive`, `Effect.logWarning("a")` chiama `console.warn` ed `Effect.logInfo("a")` chiama `console.info`, ciascuno una volta, con una stringa che contiene il messaggio, e nessuno dei due chiama `console.log`.
  2. **`transaction` vede il contesto del chiamante.** Un programma dentro `transaction`:
     - legge `Clock.currentTimeMillis` uguale all'orologio fisso fornito fuori (con `fixedClock` di `analytics/_test/clock.ts`);
     - legge un servizio di prova fornito fuori con `Effect.provideService`.
  3. **Il client storage a Promise.**
     - Su un errore tipato, `createStorageClient` rifiuta con l'istanza (`instanceof StorageNotFoundError`, `_tag`).
     - Su un *defect* rifiuta con l'errore lanciato.
     - Se `gcs.test.ts` lo fissa già, si annota quale test, e non se ne aggiunge un altro.

  Per ogni test, un mutante sul codice di `dev`, senza commit, che il test uccide. Si annotano nel log:
  - il logger senza `withLeveledConsole`;
  - in `transaction`, `Runtime.runPromiseExit(Runtime.defaultRuntime as any)` al posto del runtime del chiamante;
  - in `promise.ts`, `throw exit.cause` al posto di `throw failure.value`.
- **validation**: i test nuovi verdi su `dev`; i tre mutanti uccisi; nessun file di produzione cambiato; lo script di T1 fra `dev` e il commit esce con 0, con i soli test nuovi nel file di eccezioni.
- **status**: Done
- **log**: 2026-10-27, worker sonnet; review del supervisore passata dopo una correzione banale (tolto un `afterEach(vi.restoreAllMocks)` ripetuto: il file ne ha già uno globale).
  - Test nuovi, verdi su Effect 3: in `describe("ServerLive")` `logWarning` → `console.warn` e `logInfo` → `console.info`, una volta e mai `console.log`; `describe("transaction e il contesto del chiamante")` con il `Clock` fisso e un servizio `Probe` forniti fuori; in `gcs.test.ts` "rejects with the thrown error itself when the GCS client dies". Il caso dell'errore tipato era già fissato da `gcs.test.ts:449`.
  - Mutanti uccisi: M1 (logger senza `withLeveledConsole`) → i due test nuovi e quello di `logError`; M2 (`Runtime.defaultRuntime`) → i due test del contesto, rifatto dal supervisore; M3 (`throw exit.cause`) → il test nuovo e quello della riga 449. Nessun file di produzione cambiato.
  - `db.db.test.ts` + `gcs.test.ts`: 52/52. Lo script fra `origin/dev` e il commit esce con 0 con le sole 9 catene nuove in `eccezioni-pr1.txt`.
- **files edited/created**: `packages/server/src/effect/_test/db.db.test.ts`, `packages/server/src/services/storage/_test/gcs.test.ts`, `brain/specs/crm/effect-4/eccezioni-pr1.txt` (nuovo)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "Dentro `transaction`, `Clock.currentTimeMillis` vale l'istante dell'orologio fisso fornito dal chiamante" (il mutante con `Runtime.defaultRuntime` lo fa fallire).
- **review_mode**: cli
- **complexity**: medium

#### T3: `effect` 4.0.6 e il nucleo
- **depends_on**: [T2]
- **location**: `package.json`, `pnpm-lock.yaml`; `packages/server/src/effect/**` (test compresi); `src/test/**`; `packages/server/src/services/analytics/_test/clock.ts`
- **description**:
  - `effect` a `~4.0.6` con `pnpm add -w`.
  - **`db.ts`:**
    - `Db` e `Tx` in `Context.Service` con lo stesso id;
    - `transaction` con `Effect.context<Exclude<R, Tx>>()` ed `Effect.runPromiseExitWith`;
    - `Effect.result` ed `Effect.fromResult` per `committed`;
    - `Effect.die(new Error(…))` al posto di `dieMessage`, con lo stesso messaggio;
    - il controllo del `DbError` recuperato con `Effect.flatMap` (§3), senza `orDie` nella pipe del programma.
  - **`server.ts`:** `Logger.layer([Logger.withLeveledConsole(Logger.formatLogFmt), Logger.tracerLogger])`.
  - **`trpc.ts`:** `Effect.tapCause` e `Cause.findErrorOption`.
  - **`errorReporter.ts`:** i rinomi che servono.
  - **Gli helper di test:**
    - in `src/test`, `Cause.findErrorOption`, e `Cause.findDefect` con un `Result` per `isDefect`, con la stessa risposta booleana;
    - `fixedClock` con l'interfaccia v4 del `Clock` (`currentTimeMillisUnsafe`, `currentTimeNanosUnsafe`, i tempi monotòni, `sleep`), da fornire con `Effect.provideService(Clock.Clock, …)`.
  - **I test di `effect/_test`:** `Exit.hasInterrupts` alla riga 87, come eccezione di D14.
- **validation**:
  - `tsc --noEmit` senza errori nei file del task (filtrato per percorso);
  - verdi `effect/_test/*`, compresi i test di T2;
  - lo script di T1 su questi file esce con 0, con le sole eccezioni di D14.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: Il test 2 di T2 ("`transaction` vede il `Clock` fornito fuori"), verde su Effect 4 con `Effect.context` + `runPromiseExitWith`.
- **review_mode**: cli
- **complexity**: high

#### T4: `packages/server` e la rotta del download
- **depends_on**: [T3]
- **location**: `packages/server/src/**` tranne `effect/**` (test compresi); `src/app/api/export/**` (test compresi)
- **description**: I rinomi della mappa, senza cambiare nomi o struttura.
  - **`import/`:**
    - `config.ts` e `queue.ts` in `Context.Service`, con lo stesso id;
    - in `queue.ts`, `Effect.context` + `Effect.runForkWith`, `Effect.andThen` al posto di `zipRight`, `Config.String`, `ImportQueue["Service"]`, e `importQueueChoice` con un `ConfigProvider.fromEnv()` creato a ogni lettura (D15);
    - in `live.ts`, `Effect.catch` / `catchCause` e `Layer.unwrap`;
    - in `run.ts`, `Option.fromNullishOr`;
    - in `upload.ts`, `Effect.try` con l'overload a oggetto.
  - **`storage/`:** `Storage` in `Context.Service` (stesso id); `Config` e `Layer.unwrap` in `layer.ts` e `config.ts`, con il provider creato a ogni lettura (D15); `Cause.findErrorOption` in `promise.ts`.
  - **`contact/`, `customer/`, `export/files.ts` e la rotta del download:** `Either` diventa `Result` (`.left` diventa `.failure`), ed `Effect.either` diventa `Effect.result`.
  - **`auth/users.ts`:** `dieMessage` diventa `Effect.die(new Error(…))`.
  - **`betterAuth/`:** `AuthSession` in `Context.Service` ed `Effect.tapCause`.
  - **`cron/deleteExport.ts`:** `Cause.findErrorOption`.
  - **I test della cartella:**
    - le cinque copie dell'orologio e `Clock.make` usano `fixedClock` (D12);
    - `ConfigProvider.fromEnv({ env })` al posto di `fromMap` (D15);
    - le asserzioni sulla forma di v3 elencate in D14, riscritte come dice AC5;
    - `Cause.findErrorOption` e `findDefect` negli helper.
- **validation**:
  - `tsc` senza errori in queste cartelle;
  - verdi `packages/server/**/_test` e `src/app/api/export/**/_test` (i `*.pg.test.ts` con `TEST_DATABASE_URL`), in particolare:
    - `contact/_test/lockRule.db.test.ts` e `operatorRule.db.test.ts`, che usano `transaction`;
    - `storage/_test/supabase.test.ts:406-440` e `api/routers/import/_test/import.db.test.ts:284-300` (D15);
  - `git grep -n "ClockTypeId\|Clock.make\|fromMap\|withClock\|withConfigProvider" -- packages src` non trova niente;
  - lo script di T1 esce con 0, con le sole eccezioni di D14.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`import.db.test.ts:284-300`: con `VERCEL=1` impostato dopo le letture dei test precedenti, l'import non parte e risponde `PRECONDITION_FAILED`", verde con il provider creato a ogni lettura (rosso con quello di default di v4).
- **review_mode**: cli
- **complexity**: high

#### T5: `apps/api`, `packages/db`, i cron di `src` e i seed
- **depends_on**: [T3]
- **location**: `apps/api/src/**` (test compresi), `packages/db/src/**` (test compresi), `src/app/api/cron/**` (test compresi), `src/server/db/seeds/local/cron.ts`
- **description**:
  - **`cron/`:**
    - `CronAuth` e `CronReport` in `Context.Service`, con lo stesso id;
    - in `jobs.ts`, `Effect.result` / `Result.isFailure` ed `Effect.tapCause`;
    - in `report.ts`, `Effect.catch` ed `Effect.andThen`;
    - in `routes.ts`, `Cause.findErrorOption` / `findDefect`.
  - **`import/`:** `ImportAuth` in `Context.Service`, e `Cause` in `routes.ts`.
  - **`src/app/api/cron/*`:** `Effect.tapCause`, `Cause`.
  - **`packages/db/src/migrate.ts`:** i rinomi che servono.
  - **I test della cartella:** `cron.db.test.ts:505,534` come eccezioni di D14, e gli orologi e i provider come in T4.
- **validation**:
  - `tsc` senza errori in queste cartelle;
  - verdi `apps/api/**/_test`, `packages/db/src/_test` (pg) e `src/app/api/cron/**/_test`;
  - `pnpm api:build`;
  - lo script di T1 esce con 0, con le sole eccezioni di D14.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`cron.db.test.ts:494-506`: un job di alert che fallisce esce con `AlertsFailed { failed: 1 }`", verde su Effect 4 con l'asserzione riscritta come dice D14.
- **review_mode**: cli
- **complexity**: medium

#### T7: Documenti della PR 1
- **depends_on**: [T4, T5]
- **location**: `AGENTS.md` (e `CLAUDE.md` se è un link: si controlla), `brain/chore/roadmap-nuovo-stack.md`, `brain/chore/migrazione-effect.md`
- **description**:
  - **`AGENTS.md`, sezione Effect:**
    - "`effect` 3.x" diventa "`effect` 4.x";
    - "`Context.Tag` services" diventa "`Context.Service`";
    - la regola "stesse asserzioni" cita l'eccezione di D14 per i passaggi di versione di Effect;
    - il resto resta com'è fino alla PR 4.
  - **La roadmap:**
    - nel §4 la riga di `effect` passa a "4.0.x, in `dev` con la PR …";
    - nel §8 il debito generato, oppure "nessuno" (AC13);
    - nel §7 la riga di `AGENTS.md` chiusa per Effect 4.
  - **[[chore/migrazione-effect]]:** dove cita Effect 3 come vincolo, un rimando.
- **validation**: `git grep -n "effect\` 3\|Effect 3.x\|Context.Tag" -- AGENTS.md` non trova niente; i link `[[…]]` puntano a pagine esistenti.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: solo documenti.
- **review_mode**: cli
- **complexity**: low

#### T8: Gate, prova, review e PR 1
- **depends_on**: [T7]
- **location**: –
- **description**:
  1. **AC1:** `pnpm why effect` e `git grep -nE "from ['\"](effect/|@effect/)" -- packages apps src`.
  2. **AC5:** lo script di T1 fra `dev` e `HEAD`, con le eccezioni dei test nuovi di T2 e di D14.
  3. **AC14:** i gate di CI in un worktree di scratchpad senza `.env*`, con i placeholder del gate Build e `TEST_DATABASE_URL` per i `*.pg.test.ts`.
  4. **La prova su `mito_local`** con `pnpm dev:web` e `agent-browser`, come T10.4 di `customer-effect`. Nessun errore in console né dal server su:
     - login via email (`AUTH_TEST_LOGIN`);
     - Dashboard, Clienti e il dettaglio di un cliente con le note;
     - Contatti e il dettaglio di un contatto;
     - un import di prova in processo, fino in fondo;
     - il download di un export;
     - Profilo con la tab admin.

     Il backend è provato da `pnpm api:smoke` e su staging (GA2). Il backend locale non si usa per i cron: `pnpm api:dev` legge il database di sviluppo.
  5. **Review:** `adversarial-review` caso B sulla PR 1, contro AC1, AC5, AC6, AC7, AC12 (PR 1), AC13 e AC14.
  6. **`IMPLEMENTATION-NOTES.md`**, sezione "PR 1": i punti sopra, l'elenco di D14 completo e le deviazioni.
  7. **PR verso `dev`** quando Omar la chiede, dopo il merge di `dev` nel branch, con la revisione di Leonardo (D4). Prima di GA1 si avvisa Leonardo della PR #46 (§13).
- **validation**: tutti i punti annotati; REPORT SHIP.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: è il gate, si appoggia ai test di T2–T5.
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

### PR 2 – vitest 5

#### T9: La sonda di partenza
- **depends_on**: [G0]
- **location**: scratchpad; un `setupFiles` temporaneo e una variabile `PROBE_PROJECT` per progetto, non committati
- **description**: Su vitest 1.6, con `pnpm run test --run` (più `TEST_DATABASE_URL`), un setup temporaneo scrive per ogni file di test una riga JSON in un file dello scratchpad:
  - il progetto, da `PROBE_PROJECT`;
  - l'ambiente (`typeof window`);
  - il fuso (`Intl.DateTimeFormat().resolvedOptions().timeZone`);
  - il pool (`require("node:worker_threads").isMainThread`);
  - i timer finti: dopo `vi.useFakeTimers()`, se `performance.now` e `queueMicrotask` sono finti, poi `vi.useRealTimers()`;
  - quante volte il setup gira nello stesso file (un contatore globale).

  In più il reporter JSON salva i nomi e lo stato dei test. Il risultato è la base di AC3, e va nella sezione "PR 2" di `IMPLEMENTATION-NOTES.md`.
- **validation**: la sonda copre tutti i file che la CI esegue, uno per progetto in cui girano; il reporter JSON ha lo stesso numero di test della CI.
- **status**: Done
- **log**: 2026-10-27, worker haiku; la prima esecuzione aveva 14 file non caricati (`better-auth` mancava nel worktree, rimedio `pnpm install --frozen-lockfile`), la seconda è completa. Review del supervisore passata.
  - vitest 1.6.1, `pnpm run test --run` con `TEST_DATABASE_URL` (Postgres locale): exit 0; 315 file (312 eseguiti, 3 saltati per intero: `cronCli.test.ts`, `import.perf.pg.test.ts`, `callStats.perf.pg.test.ts`); 4408 test verdi, 6 saltati.
  - Sonda: 312 righe, nessun file due volte. `unit` 263 (117 jsdom, 146 node), `pg` 21 node, `utc` 14 e `rome` 14 (8 jsdom, 6 node ciascuno).
  - `unit` e `pg` girano in thread (`isMainThread` falso) e vedono il fuso dell'host, non il `TZ: "UTC"` di `test.env`; `utc` e `rome` girano in processi figli e vedono il loro fuso.
  - Timer finti in ogni file: `setTimeout`, `setImmediate` e `Date` sì; `performance.now`, `queueMicrotask` e `process.nextTick` no.
  - File nello scratchpad della sessione (`probe/probe-v1.jsonl`, `report-v1.json`, `summary-v1.txt`); la sonda è `probe/probe.setup.ts`, da rifare in T10 con `PROBE_OUT`.
- **files edited/created**: nessuno nel repo (modifiche temporanee annullate)
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: è una misura, non un comportamento.
- **review_mode**: cli
- **complexity**: low

#### T10: vitest 5
- **depends_on**: [T9, T1]
- **location**: `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `vitest.workspace.ts` (tolto), eventualmente `src/test/setup.ts`
- **description**:
  - `vitest` a `^5.0.5` e `vite` come devDependency, alla 7.x (la più alta che `@vitejs/plugin-react` 4.7 accetta). Gli altri pacchetti si alzano solo se vitest 5 lo richiede: si annota quale e perché.
  - **I progetti** vanno in `test.projects` di `vitest.config.ts`:
    - `unit` (jsdom, senza i `*.db.test.ts`);
    - `db` (node, i `*.db.test.ts`);
    - `pg` (con il setup in più);
    - `utc` e `rome` (`forks`, con `TZ`). Ognuno fa girare `windows.db.test.ts` in `node` e `FinanceCard.dates.test.tsx` in jsdom, come oggi: con progetti separati per ambiente, oppure con il commento `// @vitest-environment node` nel file, che non è un'asserzione.
  - **I `setupFiles` ereditati** non si sommano: `extends: false` dove serve, oppure la lista intera.
  - **I default cambiati (D16):**
    - `pool: "threads"` per `unit`, `db` e `pg`, così l'`env.TZ` di `unit` resta senza effetto nei thread, come oggi;
    - `fakeTimers.toFake` con i sette timer di v1: `setTimeout`, `clearTimeout`, `setImmediate`, `clearImmediate`, `setInterval`, `clearInterval`, `Date`;
    - `exclude` con la lista di v1, scritta per intero;
    - `clearMocks` resta al default `true`, con un commento sul perché (`restoreAllMocks`).
  - **I comandi** `test`, `test:pg` (`--project pg`) e la CI restano gli stessi.
  - **Lo script di T1** si prende dal branch della PR 1 (D11).
- **validation**:
  - la sonda di T9 rifatta su vitest 5 dà le stesse righe (ambiente, fuso, pool, timer finti, un solo giro del setup), a meno dei nomi dei progetti, con la corrispondenza annotata (AC3);
  - il reporter JSON ha gli stessi test, tutti verdi, in particolare `src/app/api/cron/delete/_test/delete.test.ts` e gli altri test dei cron di `src`, che usano `vi.fn` con `restoreAllMocks`;
  - `pnpm test:pg` gira solo i `*.pg.test.ts`;
  - lo script di T1 esce con 0.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "La sonda: `windows.db.test.ts` gira in `node` con `TZ=Europe/Rome` nel progetto dei fusi di Roma, come su vitest 1".
- **review_mode**: cli
- **complexity**: high

#### T11: Documenti, gate, review e PR 2
- **depends_on**: [T10]
- **location**: `brain/chore/roadmap-nuovo-stack.md` (§4, la riga di vitest), `brain/chore/manutenzione-dipendenze.md` (W3), `AGENTS.md` (se cita `vitest.workspace.ts`), `IMPLEMENTATION-NOTES.md` (sezione "PR 2")
- **description**:
  - La riga di vitest nel §4 della roadmap e in W3.
  - Il §8 della roadmap (AC13).
  - I gate di CI (AC14) in un worktree senza `.env*`.
  - `adversarial-review` caso B sulla PR 2, contro AC2, AC3, AC5, AC12 (PR 2), AC13 e AC14.
  - Se la PR 1 è già in `dev`:
    - si unisce `dev` e si rigenera il lockfile (§5);
    - si rifà la sonda di T9 su `dev` e quella di T10 sul branch, perché la base è cambiata.
  - La PR verso `dev` quando Omar la chiede.
- **validation**: tutti i punti annotati; REPORT SHIP; la CI della PR verde.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: è il gate.
- **review_mode**: cli
- **complexity**: medium

### PR 3 – `@effect/vitest`

#### T12: `@effect/vitest`, gli helper e il modello
- **depends_on**: [T8, T11] (PR 1 e PR 2 in `dev`)
- **location**: `package.json`, `src/test/effect.ts`, `services/analytics/_test/clock.ts` (tolto o ridotto), `packages/server/src/effect/_test/*`, `AGENTS.md` (sezione Effect: come si scrive un test di Effect)
- **description**:
  - `@effect/vitest` a `~4.0.6`.
  - **`src/test/effect.ts`:**
    - `runServer` lascia il posto a `provideServer`, cioè `Effect.provide(ServerLive)`, da usare dentro `it.effect`;
    - `failureTag`, `causeTag` e `isDefect` restano.
  - **Le regole**, scritte in `AGENTS.md`:
    - `it.effect` con `TestClock` è il caso normale, e `TestClock.setTime` prende il posto di `fixedClock`;
    - `it.live` quando il test confronta il `Clock` con `now()` del database, aspetta un `sleep` reale, avvia una fibra staccata che deve girare davvero, o osserva la console (`TestConsole`);
    - `layer(...)` quando più test condividono un layer costoso;
    - `expect(await X)` diventa `expect(yield* Effect.promise(() => X))`, e gli `await` fuori dalle asserzioni (preparazione, letture di controllo) diventano `yield* Effect.promise(() => …)`;
    - un `await expect(P).resolves/rejects.M(…)` diventa l'asserzione sul valore o sull'errore ottenuto con `yield*` (`Effect.promise`, `Effect.flip`), annotata nel file di eccezioni;
    - `vi.waitFor` dentro un generatore: `yield* Effect.promise(() => vi.waitFor(…))`;
    - i test dell'interfaccia a Promise dei bordi restano `it`.
  - **I file modello:**
    - si convertono i test di `packages/server/src/effect/_test/` (`db.db`, `errorReporter`), con il `describe("ServerLive")` in `it.live`;
    - `trpc.db` è un bordo e resta `it`.
- **validation**:
  - i file convertiti verdi, con lo stesso numero di test;
  - lo script di T1 esce con 0, con le eccezioni `resolves`/`rejects` annotate;
  - `TestClock` usato almeno in un test del modello.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`db.db.test.ts`: un programma che fallisce dentro `transaction` lascia la tabella com'era e restituisce la stessa causa", come `it.effect`.
- **review_mode**: cli
- **complexity**: high

#### T13: Test di operatori, auth, utente e clienti
- **depends_on**: [T12]
- **location**: `services/operator/_test/*`, `services/auth/_test/*`, `services/user/_test/*`, `betterAuth/_test/session.db.test.ts`, `api/routers/customer/_test/{assignment.disabled,bulkUpdateCustomers}.db.test.ts`
- **description**: Conversione con le regole di T12. I più grandi sono `deactivate.db.test.ts` (32 `expect(await`), `deactivate.pg.test.ts` (37), `roles.batch.db.test.ts` (22) e `bulkUpdateCustomers.db.test.ts` (29).
- **validation**:
  - i file verdi, con lo stesso numero di test;
  - lo script di T1 esce con 0, eccezioni annotate;
  - `git grep -nE "Effect\.run(Promise|PromiseExit|Sync)\(|runServer\(" -- <file del task>` trova solo i bordi elencati.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`deactivate.db.test.ts`: un operatore disattivato perde le sessioni di `auth_session`", come `it.effect` (o `it.live` se legge `now()` del database).
- **review_mode**: cli
- **complexity**: medium

#### T14: Test di contatti, chat, export, cron e analytics
- **depends_on**: [T12]
- **location**: `services/contact/_test/*`, `services/chat/_test/*`, `services/export/_test/*`, `services/cron/_test/*`, `services/analytics/_test/*`, `src/app/api/cron/**/_test/*`
- **description**: Conversione con le regole di T12.
  - `lockRule` e `operatorRule` restano helper di test che girano programmi su ogni scrittore: si convertono dove eseguono programmi Effect, senza toccare le loro tabelle di casi.
  - `alert.db.test.ts:269` osserva la console (`it.live`).
- **validation**: come T13, sulle sue cartelle.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`guard.db.test.ts`: la scrittura di un contatto senza il lock del cliente fallisce", come `it.effect`.
- **review_mode**: cli
- **complexity**: medium

#### T15: Test di import e storage
- **depends_on**: [T12]
- **location**: `services/import/_test/*`, `services/storage/_test/*`
- **description**: Conversione con le regole di T12.
  - Gli orologi fissi diventano `TestClock.setTime`.
  - L'orologio a passi di `concurrency.pg.test.ts:297-316` resta scritto a mano (eccezione di AC8).
  - `run.db.test.ts:509-534` (fibra staccata sull'orologio reale) e `queue.test.ts:162-176` (attese reali da 200 ms in su) vanno con `it.live`.
  - `gcs.test.ts` prova anche il client a Promise: quella parte resta `it`.
- **validation**: come T13, sulle sue cartelle (i `*.pg.test.ts` con `TEST_DATABASE_URL`).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`purge.db.test.ts`: con `TestClock` dopo la scadenza, la pulizia toglie i file dell'upload".
- **review_mode**: cli
- **complexity**: medium

#### T16: Test di `apps/api`, `packages/db` e della rotta del download
- **depends_on**: [T12]
- **location**: `apps/api/src/**/_test/*`, `packages/db/src/_test/migrate.pg.test.ts`, `src/app/api/export/download/_test/*`
- **description**: Conversione con le regole di T12. I test delle rotte (Hono, Next.js) sono bordi e restano `it`. Si convertono solo le parti che eseguono un programma Effect per preparare o controllare. L'elenco dei bordi va nel log.
- **validation**: come T13, sulle sue cartelle, con i bordi elencati come eccezioni di AC8.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`migrate.pg.test.ts`: le migrazioni applicate due volte non cambiano lo schema", come `it.effect` se esegue un programma Effect, altrimenti annotato come bordo.
- **review_mode**: cli
- **complexity**: medium

#### T17: Gate, review e PR 3
- **depends_on**: [T13, T14, T15, T16]
- **location**: –
- **description**:
  1. I controlli di AC4 e AC8. Su `dev` il grep di AC8 deve trovare i 49 file: se ne trova meno, il controllo non vale.
  2. Lo script di T1 fra `dev` e `HEAD`, con le eccezioni annotate file per file (AC5).
  3. Il numero di test per file uguale a `dev`, dal reporter JSON.
  4. I gate di CI (AC14).
  5. Il §8 della roadmap (AC13).
  6. `adversarial-review` caso B sulla PR 3, contro AC4, AC5, AC8, AC12 (PR 3), AC13 e AC14.
  7. La PR verso `dev` quando Omar la chiede.
- **validation**: tutti i punti annotati; REPORT SHIP.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: è il gate.
- **review_mode**: cli
- **complexity**: medium

### PR 4 – lo stile di Effect 4 nel codice

#### T18: Servizi e layer (a)
- **depends_on**: [T17] (PR 3 in `dev`)
- **location**: i file dei 10 servizi e dei loro layer (§3), tutti i chiamanti in `packages`, `apps` e `src`, `src/test/setup.ts`, e i test che li importano
- **description**:
  - I 10 servizi prendono l'id dal percorso e i layer statici o le costanti della tabella del §3, costruiti con `Servizio.of({...})`.
  - `ServerLive` diventa `serverLayer` e `ServerContext` diventa `ServerServices`.
  - Il mock di `src/test/setup.ts:20-33` segue `ErrorReporter.layer`.
  - Nessun `*Live` resta esportato.
  - Nei test cambiano solo gli import e i nomi.
  - Se un layer statico crea un import circolare non previsto dalla tabella, diventa una costante `<nome>Layer` e si annota.
- **validation**:
  - `tsc`;
  - tutti i test verdi;
  - il controllo di AC9: `git grep -nP "export const \w+Live\b" -- packages apps src` trova 8 righe su `dev` e nessuna sul branch, e ogni `Context.Service` ha un id che inizia con `@mito/`;
  - lo script di T1 esce con 0;
  - `pnpm api:build`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`trpc.db.test.ts`: un errore tipato senza traduzione diventa `INTERNAL_SERVER_ERROR` con il messaggio originale", verde con `serverLayer`.
- **review_mode**: cli
- **complexity**: high

#### T19: Gli errori in `Schema.TaggedError` (c)
- **depends_on**: [T18]
- **location**: i 19 file con le 61 classi (`services/*/errors.ts`, `effect/db.ts`, `services/auth/login.ts`, `apps/api/src/cron/{jobs,auth,routes}.ts`, `apps/api/src/{oidc,import/routes,import/auth}.ts`, `packages/db/src/migrate.ts`, `services/export/files.ts`, `services/contact/processDueAlerts.ts`, `betterAuth/session.ts`); un test nuovo per file di errori
- **description**:
  1. **Prima, su `Data.TaggedError`:** un test per classe costruisce l'errore con i valori che il codice usa davvero. Comprende `undefined` espliciti, chiavi assenti, date e i payload annidati come `ContactErrorPayload`, con l'`alert` che porta una `Date` e i letterali di `TaskStatus`. Il test controlla `_tag`, i campi, `message` e, per `cause`, che sia la stessa istanza. Verde su `dev`.
  2. **Poi la conversione.** Ogni `Data.TaggedError("X")<{…}>` diventa `Schema.TaggedError<X>()("X", {…})`, con `Schema` importato da `"effect"`. Gli schemi seguono una tabella che il task scrive nel log, dal tipo del campo allo schema. Le scelte da verificare con le prove:
     - `optionalKey` lancia su un `undefined` esplicito: per `key?: string` che riceve `undefined` serve `Schema.optional(…)`;
     - `Schema.Unknown` lancia su una chiave assente: per `cause?: unknown` serve uno schema opzionale;
     - `Schema.Date` lancia su una data non valida: per una `Date` che può essere non valida serve uno schema che accetti ogni istanza di `Date`;
     - `Schema.Defect()` è una funzione.
  3. **Le classi senza campi** si costruiscono come oggi (`new X()`). Se v4 vuole `new X({})`, si cambiano i punti di costruzione e si annota.
  4. **`message`:** dove il campo esiste, resta il messaggio dell'errore.
  5. **I traduttori** in `TRPCError` e in risposte HTTP non cambiano.
- **validation**:
  - il controllo di AC10: `git grep -n "Data.TaggedError" -- packages apps src ':!**/_test/**'` trova le 61 classi su `dev` e nessuna sul branch;
  - i test del punto 1 verdi prima e dopo;
  - tutti i test verdi, in particolare `*/_test/errors.db.test.ts`, `trpc.db.test.ts`, `cron.db.test.ts` e `routes.db.test.ts`;
  - lo script di T1 esce con 0, con i test nuovi nel file di eccezioni.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "Un errore di `contact/errors.ts` con un `ContactErrorPayload` che porta una `Date` si costruisce senza lanciare e conserva i campi", scritto prima e verde su `Data.TaggedError`.
- **review_mode**: cli
- **complexity**: high

#### T20a: `Effect.fn` in contatti, clienti, operatori, pratiche e utente (b)
- **depends_on**: [T19]
- **location**: `packages/server/src/services/{contact,customer,operator,practice,user}/**` (non i test)
- **description**: Ogni funzione che `gen-wrappers` (T1) trova nelle sue cartelle:
  - se è esportata, diventa `Effect.fn("<area>.<nome>")(function* (…) …)` (D9);
  - se è un helper interno o chiamata in un ciclo, diventa `Effect.fnUntraced(function* (…) …)`.

  Un tipo di ritorno esplicito diventa `Effect.fn.Return<A, E, R>`, e i generics restano. Le combinazioni in `.pipe` diventano argomenti successivi di `Effect.fn`, e una funzione con overload o che usa `this` si annota e si lascia com'è. I combinatori che prendono un programma restano funzioni normali.
- **validation**:
  - `node scripts/check-assertions.mjs gen-wrappers HEAD` non trova niente nelle sue cartelle (su `dev` ne trova);
  - i test delle sue cartelle verdi;
  - lo script di T1 esce con 0.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`reassign.db.test.ts`: la riassegnazione di un contatto a un operatore disattivato fallisce con `OperatorNotFound`", verde con `Effect.fn`.
- **review_mode**: cli
- **complexity**: medium

#### T20b: `Effect.fn` in import, storage, export, chat, analytics, cron, auth e betterAuth (b)
- **depends_on**: [T19]
- **location**: `packages/server/src/services/{import,storage,export,chat,analytics,cron,auth}/**`, `packages/server/src/betterAuth/**` (non i test)
- **description**: Come T20a. Nell'import, le funzioni chiamate per ogni riga del file sono percorsi caldi e usano `Effect.fnUntraced`.
- **validation**: come T20a, sulle sue cartelle.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`apply.db.test.ts`: un file con una riga valida e una non valida applica la prima e riporta la seconda", verde con `Effect.fn`.
- **review_mode**: cli
- **complexity**: medium

#### T20c: `Effect.fn` nel nucleo, in `apps/api`, `packages/db` e `src` (b)
- **depends_on**: [T19]
- **location**: `packages/server/src/effect/**`, `apps/api/src/**`, `packages/db/src/migrate.ts`, `src/app/api/**`, `src/server/db/seeds/local/cron.ts` (non i test)
- **description**: Come T20a. `query` e `lockCustomer` di `effect/db.ts` usano `Effect.fnUntraced` (percorsi caldi), e `transaction`, `retryOnDeadlock` e `runTrpc` restano funzioni normali.
- **validation**: come T20a, sulle sue cartelle, più `pnpm api:build`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`db.db.test.ts`: `lockCustomer` fuori da una transazione è un *defect*", verde con `Effect.fnUntraced`.
- **review_mode**: cli
- **complexity**: medium

#### T21: Documenti, gate, prova, review e PR 4
- **depends_on**: [T20a, T20b, T20c]
- **location**: `AGENTS.md`, `brain/chore/migrazione-effect.md` (§2), `brain/chore/roadmap-nuovo-stack.md` (fase 3, §8), `IMPLEMENTATION-NOTES.md`, `scripts/check-assertions.mjs` (tolto)
- **description**:
  1. **`AGENTS.md`, sezione Effect:**
     - errori in `Schema.TaggedError`;
     - servizi in `Context.Service` con id dal percorso e layer statici;
     - funzioni con `Effect.fn` / `Effect.fnUntraced`.
  2. **Il §2 di [[chore/migrazione-effect]]** con le stesse regole.
  3. **La roadmap:**
     - la fase 3 non converte più gli errori, ma aggiunge solo lo status HTTP;
     - il §8 (AC13);
     - la riga 1.1 chiusa.
  4. **I controlli** di AC9, AC10 e AC11, e lo script di T1 fra `dev` e `HEAD`.
  5. **I gate di CI** (AC14).
  6. **La prova su `mito_local`** di T8.4.
  7. **Review:** `adversarial-review` caso B sulla PR 4, contro AC5, AC9, AC10, AC11, AC12 (PR 4), AC13 e AC14.
  8. **Lo script di T1** si toglie dal repo, e il suo sorgente resta in `IMPLEMENTATION-NOTES.md` (D11).
  9. **La PR verso `dev`** quando Omar la chiede, con la revisione di Leonardo (D4). La descrizione della PR dice che è un'eccezione approvata alla regola "solo il codice che la modifica tocca" (D7).
- **validation**: tutti i punti annotati; REPORT SHIP.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a: è il gate.
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

## 10. Wave di esecuzione

| Wave | Task | Quando parte |
|---|---|---|
| 0 | G0 | SPEC approvata |
| 1 | T1, T9 | G0. Branch diversi |
| 2 | T2, T10 | T1 (T10 usa anche lo script); T9 per T10 |
| 3 | T3, T11 | T2; T10 |
| 4 | T4, T5 | T3. Cartelle disgiunte |
| 5 | T7 | T4, T5 |
| 6 | T8 | T7 |
| 7 | T12 | PR 1 e PR 2 in `dev` |
| 8 | T13, T14, T15, T16 | T12. Cartelle di test disgiunte |
| 9 | T17 | T13–T16 |
| 10 | T18 | PR 3 in `dev` |
| 11 | T19 | T18 |
| 12 | T20a, T20b, T20c | T19. Cartelle disgiunte |
| 13 | T21 | T20a–c |

## 11. Strategia di test (fase TDD)

- **L'interfaccia pubblica.** Le procedure via `createTestCaller`, i servizi via i loro programmi, le rotte via HTTP, come oggi. Nessun test nuovo chiama un dettaglio interno di Effect.
- **Il rosso, in un refactor.** I test di T2 e T19 si scrivono sul codice di oggi e devono essere verdi su `dev`. Il rosso che li rende utili sono i mutanti di T2, uccisi prima del passaggio. Per ogni altro task, il `tdd_target` è un test esistente che deve restare verde con il codice nuovo. Durante il lavoro è rosso: le API tolte non compilano, la fibra non vede il contesto, il provider di default non vede l'ambiente cambiato.
- **AC5, con lo script di T1.** Nessuna asserzione cambia in nessuna PR. Le uniche eccezioni sono i test nuovi (T2, T19), l'elenco chiuso di D14 nella PR 1 e, nella PR 3, i `resolves`/`rejects` annotati. L'equivalenza `await X` = `yield* Effect.promise(() => X)` la applica lo script. Se un'asserzione va cambiata per altri motivi, ci si ferma e si chiede.
- **Lo stato verde fra un task e l'altro della PR 1.** `tsc` sull'intero repo è rosso finché T4 e T5 non sono fatti. Ogni task controlla:
  - `tsc` filtrato sui suoi file;
  - i test delle sue cartelle, che girano anche se altri file non compilano, perché vitest traspila senza controllare i tipi.

  T7 e T8 chiedono `tsc` pulito sull'intero repo.
- **Il tempo nei test della PR 3.** `it.effect` parte con `TestClock` fermo a 0 e con una console finta. Un test che legge l'ora del database (`now()`) e la confronta con il `Clock`, che aspetta davvero, o che osserva la console, usa `it.live`. Uno che fissava l'orologio usa `TestClock.setTime`.
- **Determinismo dei test di T2.** Le spie sulla console si ripristinano in `afterEach`. L'orologio fisso è un istante scelto, diverso da `Date.now()`.
- **Ogni controllo `grep` o di script** deve trovare qualcosa su `dev` prima di valere come gate (AC9, AC10, AC11, AC8).

## 12. Gate di rilascio

| Gate | Quando | Che cosa |
|---|---|---|
| G0 | Prima della wave 1 | SPEC `approved`, D8, D9 e D14 confermate |
| GA1 | Merge della PR 1 in `dev` | CI verde; AC1, AC5, AC6, AC7, AC14 annotati; mutanti di T2 uccisi; prova su `mito_local` senza errori; REPORT SHIP; approvazione di Leonardo |
| GA2 | Staging, dopo GA1 | AC15: deploy del backend verde, `/health`, un cron lanciato a mano, login e le pagine Clienti, Contatti e Dashboard con `BACKEND_URL`, un import di prova |
| GB1 | Merge della PR 2 in `dev` | CI verde; AC2, AC3 annotati con la sonda; REPORT SHIP |
| GC1 | Merge della PR 3 in `dev` | CI verde; AC4, AC5, AC8 annotati; REPORT SHIP |
| GD1 | Merge della PR 4 in `dev` | CI verde; AC5, AC9, AC10, AC11 annotati; prova su `mito_local`; REPORT SHIP; approvazione di Leonardo |
| GD2 | Staging, dopo GD1 | AC15, come GA2 |
| G3 | Prod | Nel rilascio unico della migrazione, nella sua finestra (fase 4 della roadmap) |

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| `transaction` non vede più il `Clock` o i servizi del chiamante con `Effect.context` | Test 2 di T2, scritto su Effect 3 e con un mutante ucciso; la verifica lo ha già provato su 4.0.6 |
| I log di `Effect.logWarning`/`logInfo` finiscono su `console.log`: Cloud Run e Vercel ne sbagliano la gravità | Test 1 di T2 e il test di `logError` già presente; `withLeveledConsole` e `tracerLogger` in T3 |
| Il provider di configurazione di v4 non vede un ambiente cambiato dopo la prima lettura | D15 in T4; `supabase.test.ts:406-440` e `import.db.test.ts:284-300` come guardia |
| Le asserzioni sulla forma di `Cause` di v3 cambiano senza controllo | Elenco chiuso di D14, completato dalla ricerca di T1; lo script di AST le confronta tutte, anche su più righe |
| Un errore tipato accanto a un *defect* non viene più catturato da `catchTag`/`catchIf` | I test di AC7 restano verdi; l'assunzione OQ1 della SPEC (§5) |
| Il controllo del `DbError` recuperato trasforma in *defect* gli errori del programma | `Effect.flatMap` con `Effect.die` solo se `tx.failed` (§3), non `filterOrFail` + `orDie`; i test di `db.db.test.ts` sugli errori del programma dentro `transaction` |
| `Effect.mapError` ora mappa tutti gli errori tipati di una causa, non solo il primo | Le cause con più errori tipati nascono solo dagli `Effect.all` concorrenti di `contactProgress.ts`, `customer/list.ts` e `practice/list.ts`, dove l'unico errore è `DbError` e la traduzione dà lo stesso risultato per ognuno |
| Un `Effect.provide` annidato riusa un layer già costruito, dove prima ne costruiva uno nuovo | Riusare non cambia il comportamento: `Layer.succeed` è un valore, e `storageLayer` e la coda leggono la configurazione a ogni lettura (D15) e non tengono stato fra le chiamate. I test di import e storage lo controllano |
| Effect 4 solo ESM rompe il build di Next.js o il backend | `pnpm build`, `pnpm api:build`, `pnpm api:smoke` e la prova in `pnpm dev:web` (T8) |
| PR 1 e PR 2 vanno in conflitto sul lockfile o sui documenti | §5: lockfile rigenerato, sezioni separate; T11 rifà la sonda se `dev` è cambiato |
| vitest 5 cambia l'ambiente, il fuso, il pool o i timer finti di un file senza far fallire nulla | La sonda di T9 e T10 (AC3) e i default fissati di D16 |
| `setupFiles` eseguiti due volte nei progetti che ereditano | Il contatore della sonda; `extends: false` o la lista intera |
| `it.effect` con `TestClock` o `TestConsole` cambia l'esito di un test | Le regole `it.live` di T12; il numero e l'esito dei test per file invariati (T17) |
| La riscrittura `expect(await X)` → `yield*` nasconde un'asserzione cambiata | L'equivalenza è nello script, che confronta tutto il resto della catena |
| Un costruttore di `Schema.TaggedError` lancia su un valore che oggi passava (validazione dei campi) | I test per classe di T19, scritti prima; la tabella dei tipi; le trappole note di `optionalKey`, `Unknown` e `Date` |
| `Effect.fn` aggiunge un costo per chiamata nei cicli caldi | `Effect.fnUntraced` per `query`, `lockCustomer` e le funzioni per riga dell'import (D9) |
| Un layer statico crea un import circolare | La regola del §3: costante `<nome>Layer` nel suo modulo; T18 lo annota |
| La PR #46 di Leonardo (storage su `@s-p-a-talo/gcs-storage`, bozza ferma dal 2026-10-21, in conflitto) riparte su Effect 3 | Il pacchetto esterno dovrà usare Effect 4 come dipendenza *peer*; si avvisa Leonardo prima di GA1 (T8.7) |
| La PR 4 tocca circa 120 file e diventa difficile da rivedere | Tre commit separati (T18, T19, T20) con messaggi espliciti, e lo script di AC5 nel REPORT |
| I *defect* di `dieMessage` cambiano titolo in Sentry (`RuntimeException` → `Error`) | Accettato (§5); il messaggio resta lo stesso |

## 14. Debito della migrazione

Nessun debito previsto. Ogni task finale (T8, T11, T17, T21) verifica il debito generato e lo registra nel §8 della roadmap (AC13). Un candidato da tenere d'occhio: un'eventuale correzione non locale per la regola dei *defect* (OQ1).

## 15. Domande aperte

- **D8, D9 e D14** confermate da Omar in G0 (2026-10-27); l'OQ2 della SPEC è chiusa.
- **OQ1 della SPEC** è un'assunzione (§5).

## 16. Correzioni dopo la verifica del piano (2026-10-27)

Verifica con `adversarial-verifier`: DO NOT SHIP, 2 blocker, 7 major, 11 minor, 3 nit. Ha installato `effect` 3 e 4, vitest 1.6 e 5 e `@effect/vitest` in cartelle di prova e ha provato le ipotesi. Correzioni:

| # | Rilievo | Correzione |
|---|---|---|
| B1 | Le asserzioni che leggono la forma di `Cause` di v3, ed `Exit.isInterrupted` dentro un `expect(`, non possono restare uguali nella PR 1 | D14: eccezione chiusa ad AC5, elenco nel §6 completato da T1, riscrittura meccanica in T3–T5; OQ2 della SPEC per G0 |
| B2 | 400 `expect(await …)` non possono stare in un generatore di `it.effect` | Decisione di Omar (D13): conversione di tutti i 49 file, con l'equivalenza `await X` = `yield* Effect.promise(() => X)` nello script |
| M1 | Il provider di configurazione di v4 fotografa l'ambiente: due test si romperebbero | D15 in T4; i due test in AC7 |
| M2 | T3–T6 si accavallavano (file condivisi, validazioni che dipendevano da altri task) | Task per proprietà di cartella: T3 nucleo e helper, T4 `packages/server` con la rotta del download, T5 il resto; T6 tolto |
| M3 | Lo script per righe non vedeva le asserzioni su più righe né i file cancellati | T1 con l'AST di TypeScript, più `src/test` e i file cancellati, con sei casi di prova |
| M4 | I controlli di AC9 e AC11 non potevano fallire (`git grep -E` non conosce `\w`; prettier manda `Effect.gen(` a capo) | `git grep -P` per AC9, il modo `gen-wrappers` dello script per AC11; ogni controllo deve trovare qualcosa su `dev` |
| M5 | L'elenco dei default cambiati di vitest era incompleto, e `clearMocks: false` rompeva dei test | D16: `pool: "threads"`, `toFake` ed `exclude` di v1, `clearMocks` al default; la sonda misura pool e timer finti |
| M6 | `it.effect` fornisce una console finta; tre test osservano la console | Regola `it.live` in T12, T14; §6 corretto |
| M7 | Due mutanti di T2 non potevano morire | Mutanti nuovi: `Runtime.defaultRuntime` in `transaction`, `throw exit.cause` in `promise.ts` |
| m1 | `vitest list` non esiste nella 1.6 | AC3 con la sonda e il reporter JSON |
| m2 | I campi degli errori non sono tutti semplici; trappole di `optionalKey`, `Unknown`, `Date`, `Defect()` | T19: test per classe scritti prima, tabella dei tipi, complessità alta |
| m3 | `run.db.test.ts:509-534` letto male; `queue.test.ts:162-176` aspetta davvero | `tdd_target` di T4 cambiato; `it.live` per i due in T15 |
| m4 | L'orologio a passi di `concurrency.pg.test.ts` non si esprime con `TestClock` | Eccezione con nome in AC8 e T15 |
| m5 | `filterOrFail` + `orDie` trasformerebbe in *defect* gli errori del programma; `RuntimeException` → `Error` in Sentry | `Effect.flatMap` con `Effect.die` (§3, T3); §5 |
| m6 | Un test di `ServerLive` fuori da un `*.db.test.ts` avvierebbe PGlite sotto jsdom | I test del logger vanno in `db.db.test.ts`, accanto a quello già presente |
| m7 | PR 1 e PR 2 in parallelo toccano gli stessi documenti; la sonda può invecchiare | §5 e T11 |
| m8 | Il mock di `SentryReporterLive` in `src/test/setup.ts`; `makeMemoryStorageLayer` e `importQueueCloudTasks` mancavano | Tabella del §3 e T18 |
| m9 | Il divieto di `effect/unstable/*` in AC1 non poteva fallire | AC1: solo la radice `"effect"` nella PR 1 |
| m10 | Le motivazioni del §13 su concorrenza e layer erano imprecise | §13 riscritto |
| m11 | `pnpm api:dev` usa il database di sviluppo | T8.4: `pnpm dev:web` su `mito_local`, backend con `api:smoke` e GA2 |
| n1 | `@types/node` 20 contro il *peer* opzionale di vitest 5 | §5 |
| n2 | La PR 4 va contro "solo il codice che la modifica tocca" | D7 e T21: eccezione approvata, scritta nella PR |
| n3 | GA2 non è un prerequisito di T12 | Lasciato così: la PR 3 tocca solo i test |

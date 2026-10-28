---
domain: crm
type: spec
status: approved
links:
  - "[[specs/crm/effect-4/PLAN]]"
  - "[[chore/roadmap-nuovo-stack]]"
  - "[[chore/migrazione-effect]]"
  - "[[chore/manutenzione-dipendenze]]"
created: 2026-10-27
updated: 2026-10-28
---

# Spec: Effect 4, vitest 5 e lo stile di Effect 4 (punto 1.1 della roadmap)

---

## User input

> Scriviamo il Plan per il passaggio a Effect4

Decisioni (2026-10-27), dalle domande di chiarimento:

> 1. **Dove** = "Spec + Plan": una spec breve in questa cartella, poi il piano, così l'esecuzione passa da `implement-spec` e `adversarial-review`.
> 2. **Ampiezza** = "Anche lo stile v4": non solo i cambi che Effect 4 richiede.
> 3. **PR** = "Due PR in serie": prima la versione, poi lo stile.
> 4. **Stile v4** = tutte e quattro le convenzioni: (a) servizi e layer, (b) `Effect.fn`, (c) `Schema.TaggedError`, (d) `@effect/vitest`.
> 5. **Vitest** = "4 PR": `@effect/vitest` 4 vuole vitest 5, e il repo è su vitest 1.6.1. L'aggiornamento di vitest è una PR a sé.

Dopo la verifica del piano (2026-10-27):

> 6. **Test misti** = "Tutti, riscrittura": anche i 38 file di test che leggono il database con le Promise di Drizzle passano a `@effect/vitest`. `expect(await X)` diventa `expect(yield* Effect.promise(() => X))`, e il controllo delle asserzioni tratta le due forme come la stessa.

## Context

- **Che cosa.** È il punto 1.1 di [[chore/roadmap-nuovo-stack]] (R2): il primo passo del backend verso `HttpApi`. Effect 4 è stabile (4.0.0 del 2026-10-01, 4.0.6 del 2026-10-22, `latest` su npm). Un endpoint `HttpApi` scritto su Effect 3 andrebbe riscritto.
- **Perché adesso.** La C2 di better-auth è in `dev` dalla [PR #108](https://github.com/omardeangelis/mito-micro-services/pull/108), come la roadmap chiedeva prima di 1.1. La fase 2 (`HttpApi`, l'app React che lo chiama) parte da qui.
- **Stato di `dev`** (`5adbfc1`, 2026-10-27):
  - `effect` 3.22.2 è dichiarato solo nel `package.json` della radice. Nessun'altra dipendenza lo usa (`pnpm why effect`).
  - 147 file importano `effect`: 122 in `packages/server`, 13 in `apps/api`, 10 in `src`, 2 in `packages/db`. Di questi, 48 sono test o helper di test.
  - Nessun file usa `Schema`, `@effect/*` o i moduli HTTP di Effect.
  - vitest è alla 1.6.1, con `vitest.workspace.ts` (progetti `unit`, `pg`, `utc`, `rome`) e `environmentMatchGlobs` per i `*.db.test.ts`.
- **Che cosa cambia con Effect 4** (guida `MIGRATION.md` e mappa dei rinomi `migration/v3-to-v4.md` del repo `Effect-TS/effect`):
  - **Rinomi.** `Context.Tag` → `Context.Service`, `Either` → `Result`, `Effect.either` → `Effect.result`, `catchAll` → `catch`, `catchAllCause` → `catchCause`, `tapErrorCause` → `tapCause`, `zipRight` → `andThen`, `Cause.failureOption` → `Cause.findErrorOption`, `Cause.dieOption` → `Cause.findDefect` (un `Result`), `Exit.isInterrupted` → `Exit.hasInterrupts`, `Option.fromNullable` → `Option.fromNullishOr`, `Layer.unwrapEffect` → `Layer.unwrap`, `Config.string` → `Config.String`, `ConfigProvider.fromMap` → `ConfigProvider.fromUnknown`.
  - **API tolte.**
    - `Runtime` e `Effect.runtime`: al loro posto `Effect.context` e `Effect.run*With`.
    - `Effect.withClock` e `Effect.withConfigProvider`: al loro posto `Effect.provideService`.
    - `Effect.dieMessage` e `Effect.filterOrDieMessage`.
    - `Logger.replace` e `Logger.logfmtLogger`: al loro posto `Logger.layer` e `Logger.formatLogFmt`.
    - `Clock.make` e `Clock.ClockTypeId`: in v4 un `Clock` implementa anche `currentTimeMillisUnsafe` e i tempi monotòni.
  - **`Cause` piatto.** Un `Cause` è `{ reasons: [...] }`, con le sole ragioni `Fail`, `Die` e `Interrupt`; spariscono `Sequential`, `Parallel` ed `Empty`. Le asserzioni che leggono la forma di v3 (`toMatchObject({ error })`, `cause: { _tag: "Fail", … }`, `cause._tag === "Fail"`) non possono restare uguali (AC5).
  - **La configurazione.** Il `ConfigProvider` di default fotografa `process.env` alla prima lettura e tratta `""` come assente. In v3 ogni lettura vedeva l'ambiente del momento.
  - **I *defect* con un messaggio.** `Effect.dieMessage` creava un `RuntimeException`; in v4 si scrive `Effect.die(new Error(msg))`, quindi il nome del *defect* in Sentry diventa `Error`.
  - **Il cron `priority` in Sentry.** Con un body malformato (`src/app/api/cron/priority/route.ts`) Sentry riceve `UnknownError` invece di `UnknownException`: il titolo cambia, quindi l'errore apre un gruppo nuovo. La risposta resta 200.
  - **Valori che non sono più `Effect`.** `Either` (ora `Result`) e `Option` non si possono più dare a `yield*`: servono `Effect.fromResult` ed `Effect.fromOption`.
  - **Semantica.**
    - Un errore tipato che arriva insieme a un *defect* non lo catturano più `catchTag`, `catchIf` e `orElseSucceed`.
    - Un `Effect.provide` annidato riusa i layer già costruiti dal `provide` che lo contiene.
    - `Effect.mapError` mappa tutti gli errori tipati della causa, non solo il primo.
    - Un errore tipato diventa un *defect* se intanto muore un finalizer o una fibra sorella: `Cause.findErrorOption` non lo vede più, e il bordo risponde 500 (o `INTERNAL`) invece del codice dell'errore. Oggi non succede: il codice di produzione non ha `ensuring`, `acquireRelease` né `addFinalizer`, e le `Effect.all` concorrenti falliscono solo con `DbError`. Il primo finalizer vicino a `runTrpc` o alle rotte va rivisto per questo. In auth il risultato sarebbe più severo, mai più permissivo.
  - **Pacchetto.** `effect` 4 è solo ESM (`"type": "module"`, nessun build CommonJS).
  - **Versioni.** `@effect/vitest` 4.0.6 vuole `vitest >=5 <6`. vitest 5 vuole Vite ≥ 6.4 come dipendenza del progetto e Node ≥ 22.12.
- **Chi è coinvolto.** Omar scrive. Leonardo rivede: la PR 1 e la PR 4 toccano i file dell'auth (`auth.ts`, `betterAuth/*`, `services/auth/*`, `services/operator/deactivate.ts`), anche se senza cambiare il comportamento (regola 5 del §2 della roadmap). Operatori e admin non vedono niente.

---

## Non-Goals

- **La fase 2.** Niente `HttpApi`, `HttpApiClient`, OpenAPI o rotte nuove.
- **Gli schemi di input.** Gli schemi zod di `@mito/domain` e delle procedure restano (regola 3 del §2 della roadmap). `Schema` entra solo per le classi di errore (AC10).
- **Raggruppare le funzioni in servizi.** Le funzioni libere dei servizi (`listCustomers`, `deactivateOperator`, …) restano funzioni esportate: (b) cambia come sono scritte, non dove stanno. La forma dei servizi che gli handler di `HttpApi` chiameranno si decide nella fase 2.
- **Correggere stranezze di oggi.** Le PR conservano il comportamento. Una correzione trovata strada facendo va nel §8 della roadmap e in una PR dopo.
- **Aggiornare altre dipendenze.** Next.js, tRPC, React, zod, Drizzle, `@vitejs/plugin-react`, jsdom e `@testing-library/*` restano dove sono, se vitest 5 non richiede altro (R1, R3).
- **I test che non eseguono programmi Effect.** I test delle procedure via `createTestCaller` e i test dei componenti React restano `it` o `test` di vitest. `vi.useFakeTimers` resta dove c'è.
- **`@effect/sql*`.** Drizzle resta il layer del database (`AGENTS.md`).

---

## Acceptance Criteria

### Versioni e perimetro

- **AC1**: Dopo la PR 1, `effect` è a `~4.0.6` nel `package.json` della radice ed è l'unica copia installata: `pnpm why effect` mostra solo `4.0.x`. Il codice importa solo dalla radice `"effect"`: `git grep -nE "from ['\"](effect/|@effect/)" -- packages apps src` non trova niente. Dopo la PR 3 i test importano anche `@effect/vitest` ed `effect/testing`, e nient'altro.
- **AC2**: Dopo la PR 2, `vitest` è a `^5.0.5` e `vite` è una devDependency compatibile (≥ 6.4). Non esiste più `vitest.workspace.ts`, né `environmentMatchGlobs` o `poolMatchGlobs`: i progetti stanno in `test.projects` di `vitest.config.ts`. I comandi restano quelli di oggi: `pnpm run test --run`, `pnpm test:pg` (`--project pg`) e il passo di test della CI.
- **AC3**: Dopo la PR 2, ogni file di test gira come prima: stesso ambiente (`jsdom` o `node`), stesso fuso, stesso tipo di pool (thread o processo figlio), stessi timer finti. Una sonda temporanea registra queste quattro cose per ogni file e progetto, su vitest 1.6 e su vitest 5, e i due elenchi coincidono. Il reporter JSON dà gli stessi test, per nome e per file, in tutti e due. Nei titoli di `test.each` e `describe.each` non contano le differenze di forma con cui vitest 5 stampa i valori (i testi senza apici, `0` invece di `+0`, un altro punto di troncamento; 12 file su `dev` `5adbfc1`), purché ogni test abbia un corrispondente con lo stesso stato.
- **AC4**: Dopo la PR 3, `@effect/vitest` è a `~4.0.6`, la stessa versione di `effect`.

### Comportamento invariato

- **AC5**: In ognuna delle quattro PR nessuna asserzione cambia. Il controllo è uno script che legge i file con il compilatore di TypeScript. Per ogni file di test toccato, rinominato o cancellato, e per `src/test/**`, confronta le catene `expect(…)…` e `assert.…(…)` intere, anche su più righe, prima e dopo, con le stesse ripetizioni. Sono ammesse solo queste differenze, ognuna in un elenco chiuso che lo script legge:
  - **le asserzioni dei test nuovi** (AC6, il test di T19 del piano);
  - **la forma di `Cause` ed `Exit` di v4, nella PR 1.** Sono i punti dell'elenco del piano (§6), più quelli che il suo primo task trova su `dev`. Ognuno si riscrive nel modo più vicino all'originale: `{ error }` → `{ reasons: [{ error }] }`, `cause: { _tag: "Fail", error }` → `cause: { reasons: [{ _tag: "Fail", error }] }`, `Exit.isInterrupted` → `Exit.hasInterrupts`;
  - **nella PR 3**, `await X` dentro un'asserzione diventa `yield* Effect.promise(() => X)`. Lo script tratta le due forme come la stessa. Inoltre, ognuna annotata nel file di eccezioni della PR:
    - `expect(await X)` → `expect(yield* X)` quando X, un helper o un programma dei test, diventa un `Effect` con lo stesso valore. Ne fanno parte `runServer(P)` → `P.pipe(provideServer, Effect.exit)` e una Promise concorrente che diventa `Fiber.join` di una fibra;
    - i `await expect(…).resolves/rejects…` riscritti sul valore o sull'errore letto con `yield*` (nella PR 3 uno solo: gli altri stanno nei test dei bordi, che restano a Promise);
    - le tabelle `each` passate per nome, quando la riga che le dichiara cambia solo per la stessa riscrittura.

  Se un test fallisce per una semantica nuova di Effect 4, si corregge il codice per tenere il comportamento di prima, mai il test. Prima di valere come gate, lo script deve trovare una differenza su un caso di prova per ogni tipo (riga singola, più righe, file cancellato).
- **AC6**: Prima del passaggio di versione, nella PR 1, test nuovi fissano su Effect 3 i comportamenti che oggi nessun test controlla e che Effect 4 cambia nell'implementazione. Sono verdi su `dev` e restano verdi dopo:
  - **i log del server**: con `ServerLive`, `Effect.logWarning` scrive su `console.warn` ed `Effect.logInfo` su `console.info`, e la riga contiene il messaggio. `Effect.logError` su `console.error` lo fissa già `effect/_test/db.db.test.ts:234`;
  - **`transaction` vede quello che il chiamante fornisce**: dentro `transaction`, il programma legge il `Clock` e un servizio forniti fuori;
  - **il client storage a Promise** rifiuta con l'istanza dell'errore tipato (`instanceof` e `_tag`), e con il *defect* quando non c'è un errore tipato.

  Ogni test uccide almeno un mutante sul codice di `dev`, annotato nel log del task.
- **AC7**: Restano verdi, con le asserzioni invariate (AC5), i test che fissano i comportamenti più esposti al passaggio:
  - le transazioni: rollback con la stessa causa, commit fallito come `DbError`, `DbError` recuperato come *defect*, transazione annidata come *defect*, nuovo tentativo sul deadlock, READ COMMITTED (`effect/_test/db.db.test.ts`, `services/contact/_test/*`, `services/import/_test/concurrency.pg.test.ts`);
  - la traduzione degli errori in `TRPCError` (`effect/_test/trpc.db.test.ts`, `*/_test/errors.db.test.ts`);
  - la coda dell'import in processo e su Cloud Tasks (`services/import/_test/queue.test.ts`, `run.db.test.ts`);
  - i cron e l'import del backend (`apps/api/src/cron/_test/cron.db.test.ts`, `apps/api/src/import/_test/routes.db.test.ts`);
  - l'auth: sessione, disattivati e `deactivate` (`betterAuth/_test/*`, `services/operator/_test/deactivate.*`);
  - la configurazione letta da `Config`: con un provider di prova (`services/storage/_test/config.test.ts`, `services/import/_test/queue.test.ts`) e dall'ambiente del processo, cambiato fra un test e l'altro (`services/storage/_test/supabase.test.ts:406-440`, `api/routers/import/_test/import.db.test.ts:284-300`).

### Stile di Effect 4 (PR 3 e PR 4)

- **AC8 (d)**: Dopo la PR 3, i test che eseguono un programma Effect lo fanno con `@effect/vitest`. Le regole:
  - `it.effect` con `TestClock` è il caso normale;
  - `it.live` quando il test dipende dal tempo reale (`now()` del database, un `sleep` vero, una fibra staccata) o osserva la console: `it.effect` fornisce una console finta;
  - `layer(...)` quando più test condividono un layer.

  Restano `it` i test dell'interfaccia a Promise dei bordi (`runTrpc`, il client storage a Promise, le rotte). Restano scritti a mano i due orologi a passi di `services/import/_test/`, che cambiano valore da una lettura all'altra e che `TestClock` non sa riprodurre: quello di `concurrency.pg.test.ts` e quello di `apply.db.test.ts` (la scadenza che passa fra un blocco e l'altro). Controlli:
  - `git grep -nE "Effect\.run(Promise|PromiseExit|Sync)\(|runServer\(" -- '**/_test/**' src/test` trova solo i bordi, elencati nel log (su `dev` trova 50 file);
  - `git grep -nE "currentTimeMillisUnsafe|Clock\.Clock" -- '**/_test/**'` trova solo `concurrency.pg.test.ts` e `apply.db.test.ts`;
  - il numero di test per file non cambia.
- **AC9 (a)**: Dopo la PR 4, ogni servizio è una classe `Context.Service` con un identificativo che inizia dal pacchetto e dal percorso (`"@mito/server/effect/Db"`, `"@mito/api/cron/CronAuth"`). Il layer principale è la proprietà statica `layer`, e le varianti hanno un suffisso che le descrive (`layerDisabled`, `layerInProcess`, …), costruite con `Servizio.of({...})`. Quando un layer statico creerebbe un import circolare, è una costante `<nome>Layer` nel suo modulo. Non restano costanti `*Live` esportate: `git grep -nP "export const \w+Live\b" -- packages apps src` non trova niente (su `dev` ne trova 8). I nomi sono nella tabella del §3 del piano.
- **AC10 (c)**: Dopo la PR 4, ogni classe di errore del codice di produzione è una `Schema.TaggedError`, con lo stesso `_tag`, gli stessi campi e lo stesso `message`: `git grep -n "Data.TaggedError" -- packages apps src ':!**/_test/**'` non trova niente (su `dev` trova 61 classi). Lo schema di ogni campo accetta tutti i valori che il codice di oggi passa, compresi `undefined` esplicito, chiavi assenti e date: nessun costruttore lancia dove oggi non lanciava. Un test per classe costruisce l'errore con i valori che il codice usa davvero, scritto prima e verde su `Data.TaggedError`.
- **AC11 (b)**: Dopo la PR 4, ogni funzione che restituisce direttamente un `Effect.gen` è scritta con `Effect.fn("<area>.<nome>")` se è esportata, e con `Effect.fnUntraced` se è un helper interno o un percorso caldo. `query` e `lockCustomer` di `effect/db.ts` usano `Effect.fnUntraced`, e così `readSession` e `applyMigrations`, i cui test confrontano l'`Exit` intero. Controllo: lo script di AC5, in un secondo modo, cerca con il compilatore di TypeScript le funzioni il cui corpo è, o restituisce, una chiamata a `Effect.gen`. Su `dev` ne trova almeno 73 (74 misurate da T1 il 2026-10-27, 73 su `dev` `e7ead47`; la stima di 75 contava anche programmi come `run: Effect.gen(...)`); dopo la PR 4 nessuna nel codice di produzione. I combinatori che prendono un programma (`transaction`, `retryOnDeadlock`, `runTrpc`) restano funzioni normali.

### Documenti

- **AC12**: Ogni PR aggiorna i documenti che la riguardano:
  - **PR 1:** "`effect` 3.x" → 4.x e `Context.Service` nella sezione Effect di `AGENTS.md`; la riga di `effect` nel §4 della roadmap.
  - **PR 2:** la riga di vitest nel §4 della roadmap e in [[chore/manutenzione-dipendenze]] (W3).
  - **PR 3:** come si scrivono i test di Effect nella sezione Effect di `AGENTS.md`.
  - **PR 4:** in `AGENTS.md` e nel §2 di [[chore/migrazione-effect]], `Schema.TaggedError`, servizi con `layer` statico ed `Effect.fn`; nella roadmap, la fase 3 non converte più gli errori, ma aggiunge solo lo status HTTP.
- **AC13**: Ogni PR registra nel §8 della roadmap il debito che genera, e lo annota anche nel suo task finale. Se non ne genera, lo scrive.

### Gate

- **AC14**: Ogni PR passa i gate di CI: `next lint`, `tsc --noEmit`, `pnpm db:check`, `pnpm run test --run` con i `*.pg.test.ts`, `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke`.
- **AC15**: Dopo il merge in `dev` della PR 1 e della PR 4, su staging il deploy del backend è verde e la sua revisione prende il traffico. Poi:
  - `/health` risponde;
  - un lancio a mano di un cron risponde come prima (`skipped` se è già girato quel giorno);
  - con `BACKEND_URL` acceso, il login e le pagine Clienti, Contatti e Dashboard si aprono senza errori;
  - un import di prova arriva in fondo.

---

## Constraints

- **Quattro PR verso `dev`, in quest'ordine:** PR 1 (Effect 4) e PR 2 (vitest 5) in parallelo, PR 3 (test con `@effect/vitest`) dopo tutte e due, PR 4 (stile v4 nel codice) dopo la 3. Ogni PR unisce `dev` nel suo branch prima del merge.
- **Nessuna migrazione del database.** Nessuna PR tocca `packages/db/src/schema/*` o `packages/db/migrations/`.
- **Codice server che gira in Next.js e nel backend** (`AGENTS.md`): niente `next/*` in `packages/server/**`, e il backend importa gli stessi file. Effect 4 è solo ESM: `pnpm build` e `pnpm api:smoke` lo verificano per le due strade.
- **Nessuna release in prod nel mezzo.** `dev` → `main` è fermo fino al go/no-go di S6 (roadmap, fase 4). Le PR non vanno in `main` prima di allora.

---

## Technical Notes

- **Le fonti.** `MIGRATION.md`, `migration/*.md` e `LLMS.md` del repo `Effect-TS/effect` per Effect 4.0.6. Le guide di migrazione di vitest 2, 3, 4 e 5 su vitest.dev.
- **I punti delicati della PR 1:**
  - `transaction` (`effect/db.ts`) esegue il programma dentro la callback di Drizzle con `Runtime.runPromiseExit`, e legge l'esito con `Either`;
  - `importQueueInProcess` (`services/import/queue.ts`) fa partire i task con `Runtime.runFork`;
  - `ServerLive` (`effect/server.ts`) sostituisce il logger con `Logger.replace`;
  - `createStorageClient` (`services/storage/promise.ts`) usa `ManagedRuntime`, che in v4 non è più un `Effect`.
- **Gli orologi dei test.** Sei file di test costruiscono un `Clock` a mano con `Clock.ClockTypeId` (`services/analytics/_test/clock.ts` e cinque test di `services/import/_test/`). Nella PR 1 passano a un solo helper con l'interfaccia v4; nella PR 3 a `TestClock`.
- **I `Data.TaggedError` di produzione** sono 61 classi, in 19 file. Molte non hanno campi; le altre hanno campi semplici (`string`, `number`, `string | null`, `string | undefined`, e `unknown` per `cause`). I campi `unknown` diventano `Schema.Unknown` o `Schema.Defect`, in modo che il costruttore accetti gli stessi valori di oggi (AC10).
- **I servizi** sono 10: `Db`, `Tx`, `ErrorReporter`, `ImportConfig`, `ImportQueue`, `Storage`, `AuthSession`, `CronAuth`, `CronReport`, `ImportAuth`.
- **vitest 5** (dalle guide di v2–v5 e da prove con le due versioni):
  - `vitest.workspace.ts` diventa `test.projects`, ed `environmentMatchGlobs` un progetto `node` per i `*.db.test.ts`;
  - i progetti ereditano la configurazione della radice, e i `setupFiles` ereditati si **sommano**;
  - il pool di default passa da `threads` a `forks`: con i processi figli l'`env.TZ: "UTC"` del progetto `unit` comincerebbe a valere anche in locale;
  - i timer finti, di default, fingono tutto (anche `performance` e `requestAnimationFrame`), non più solo i sette di v1;
  - `restoreAllMocks` ripristina solo le spie di `vi.spyOn`, non azzera più la storia dei `vi.fn`; `clearMocks` diventa vero di default e la azzera prima di ogni test;
  - l'`exclude` di default si riduce a `node_modules` e `.git`;
  - `vi.mock` dentro una funzione lancia (nel repo non ce ne sono);
  - `vitest list` non esiste nella 1.6.
- **`it.effect`** fornisce `TestClock`, fermo a 0 finché il test non lo sposta, e una console finta (`TestConsole`): il logger di `ServerLive` scrive lì, e le spie su `console` non vedono niente.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | Se un test di AC7 fallisce per la semantica nuova dei *defect* (`catchTag` che non cattura un errore accanto a un *defect*), dove si corregge? | PR 1 | Omar | Assunzione: nel codice, per tenere il comportamento (AC5). Si annota nel log, e se la correzione non è locale ci si ferma e si chiede |
| 2 | Le asserzioni che leggono la forma di `Cause` ed `Exit` di v3 possono cambiare? | AC5, PR 1 | Omar | **Chiusa (G0, 2026-10-27):** sì, come eccezione chiusa e riscrittura meccanica. In v4 la forma di v3 non esiste più, e nessuna correzione del codice la riporta |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| SPEC corta + PLAN in `brain/specs/crm/effect-4/` | `implement-spec` e `adversarial-review` (caso B) vogliono criteri scritti, come per `customer-effect` e `analytics-effect` (Omar, 2026-10-27) |
| Anche lo stile di Effect 4, non solo i rinomi | Omar, 2026-10-27 |
| Prima la versione, poi lo stile, in PR diverse | Diff leggibili, guasti isolabili; §2 regola 5 della roadmap, "refactor e correzioni in PR diverse" (Omar, 2026-10-27) |
| (a) servizi e layer, (b) `Effect.fn`, (c) `Schema.TaggedError`, (d) `@effect/vitest` | Omar, 2026-10-27. (c) anticipa alla fase 1 la conversione degli errori che la roadmap metteva nella fase 3 |
| vitest 5 in una PR a sé, prima dei test con `@effect/vitest` | `@effect/vitest` 4 vuole vitest 5; ogni PR ha un solo motivo per rompersi (Omar, 2026-10-27) |
| I test si convertono (PR 3) prima del codice (PR 4) | La PR 4, la più grande, si verifica con test già stabili, che non cambiano insieme a lei |
| `effect` a `~4.0.6` | I moduli che la fase 2 userà (`http-api`) sono `@stability unstable` e possono rompersi tra minor. Si sale di minor con una PR apposta |
| Revisione di Leonardo sulla PR 1 e sulla PR 4 | Toccano i file dell'auth, anche se senza cambiarne il comportamento (regola 5 del §2 della roadmap) |
| Le funzioni libere restano funzioni libere | Raggrupparle in servizi è una scelta della fase 2, quando gli handler di `HttpApi` ne fissano la forma |
| Tutti i test che eseguono Effect passano a `@effect/vitest`, anche i 38 misti | Omar, 2026-10-27, dopo la verifica del piano: lo stile v4 per intero. 400 righe `expect(await X)` diventano `expect(yield* Effect.promise(() => X))`, che il controllo di AC5 tratta come uguali |
| Eccezione chiusa ad AC5 per la forma di `Cause` ed `Exit` di v4 | Omar, 2026-10-27 (G0, OQ2): circa 15 asserzioni leggono la forma di v3, che in v4 non esiste |
| AC3 accetta la forma nuova dei titoli `each` di vitest 5 | Omar, 2026-10-27, dopo la revisione della PR 2: vitest 5 non ha un'opzione per il formato di v1, e nel repo niente legge i nomi dei test (nessuno snapshot, nessun reporter che li conservi). Rimettere gli apici a mano toccherebbe 12 file di test solo per l'etichetta |
| Il controllo di AC5 legge l'AST, non le righe | La verifica del piano ha mostrato che un confronto per righe non vede le asserzioni su più righe né i file cancellati |
| AC8 nomina anche l'orologio a passi di `apply.db.test.ts` | Supervisore, 2026-10-27, in T15: c'era già su `dev` (con `fixedClock`) e, come quello di `concurrency.pg.test.ts`, cambia valore fra una lettura e l'altra |
| AC5 ammette `expect(await X)` → `expect(yield* X)` quando X, un helper o un programma, diventa un `Effect` con lo stesso valore | Omar, 2026-10-27, dopo la revisione della PR 3 (proposta del supervisore in T13–T16): lasciare runner a Promise negli helper dei test contraddirebbe AC8. Ogni riga è nel file di eccezioni, e il confronto a coppie mostra che cambia solo `await` → `yield*` |

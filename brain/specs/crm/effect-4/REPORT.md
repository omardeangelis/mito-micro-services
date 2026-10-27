---
domain: crm
type: review
scope: spec
spec: effect-4
review_target: "branch claude/vitest-5 (PR 2 di 4)"
base_ref: origin/dev (5adbfc1)
head_ref: claude/vitest-5 (b1cd256)
verdict: do-not-ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/effect-4/RUBRIC]]"
  - "[[specs/crm/effect-4/SPEC]]"
  - "[[specs/crm/effect-4/PLAN]]"
  - "[[specs/crm/effect-4/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-10-27
updated: 2026-10-27
---

# Review Report: Effect 4, vitest 5 e lo stile di Effect 4

La spec ha quattro PR, ognuna con la sua revisione. Ogni revisione è un round qui sotto, con lo stesso round in `RUBRIC.md`.

## [Round: 2026-10-27 — PR 2, vitest 5]

### Verdict

**DO NOT SHIP** · impact: critical

L'obiezione più forte è che AC3, così come è scritto ("il reporter JSON dà gli stessi test, per nome e per file"), non è soddisfatto.
- **Cosa cambia:** su vitest 5, 296 titoli di `test.each`/`describe.each` in 12 file cambiano forma: niente virgolette, `0` invece di `+0`, un troncamento diverso.
- **Cosa resta uguale:** i test sono gli stessi, con gli stessi stati.
- **Cosa serve:** che Omar accetti la differenza correggendo AC3 nella SPEC. Ci sono poi due cose da fare sul branch: fissare `sequence.hooks` al valore di vitest 1 (o accettare la differenza in D16), e scrivere i documenti di AC12 e AC13.

Il BLOCKER di v3 sta nello script di AC5, che serve a tutte e quattro le PR. È stato corretto dopo la revisione (`ff0c648` su `claude/effect-4`, harness 19/19), e la verifica rifatta è nel checklist.

### Coverage

- **Passate eseguite:** 4/4.
  - v1 e v2 sul modello più forte;
  - v3 su haiku;
  - v4 su sonnet.
- **Passate saltate o fallite:** nessuna.
- **UI pass:** non prevista dalla rubrica, perché non cambia nessuna superficie visibile.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v3 — integrità dei test (AC5) | `scripts/check-assertions.mjs`, `normalize()` (su `claude/effect-4`, `8d80202`) | La normalizzazione toglieva spazi e `,)` anche dentro le stringhe: `toBe("a b")` → `toBe("ab")` passava | **Risolto dopo la revisione** in `ff0c648`: la chiave nasce dai token dello scanner di TypeScript, e i letterali restano intatti. Harness con i casi 11–13: 19/19 | no |
| MAJOR | v3 | stesso script | `it` → `it.skip` e `describe` → `describe.only` passavano | **Risolto** in `ff0c648`: un secondo multinsieme per file conta i marcatori (`skip`, `only`, `todo`, `fails`, `skipIf`, `runIf`, `concurrent`, `sequential`); `it.effect`/`it.live` non contano. Casi 14–16 | no |
| MAJOR | v3 | stesso script | `expectTypeOf` e `assertType` erano invisibili (`api/routers/analytics/_test/types.test.ts` ne ha 10) | **Risolto** in `ff0c648`, casi 17–18 | no |
| MAJOR | v3 | `claude/vitest-5` | Lo script non sta sul branch della PR 2 | Scelta del piano (D11): lo script entra con la PR 1 e la PR 2 lo prende dal suo branch. Non è un difetto; la descrizione della PR 2 lo deve dire | no |
| MAJOR | v1 — quali test e dove (AC3) | `brain/specs/crm/effect-4/SPEC.md:83` (AC3) | 296 titoli `each` in 12 file cambiano forma (virgolette, `+0`, troncamento). Un abbinamento uno a uno trova 4118 nomi uguali, 281 diversi solo per virgolette o `+0`, 15 solo per troncamento, nessun test spaiato. Nessuna opzione di vitest 5 riporta il formato di v1 | Decisione di Omar: correggere AC3 nella SPEC, per esempio "stessi test per file e per percorso di `describe`; i titoli `each` possono cambiare solo per virgolette, `+0` → `0` e troncamento", con i 12 file | no |
| MINOR | v2 — come gira ogni file (AC3, D16) | `vitest.config.ts`, `project()` | `sequence.hooks` passa da `parallel` (vitest 1) a `stack` (vitest 5) e nessuno lo fissa: va contro la regola del piano (§3, "si fissano ai valori di vitest 1 le opzioni il cui default è cambiato"). Con `parallel` su vitest 5 la suite non-pg dà gli stessi esiti | `sequence: { hooks: "parallel" }` in `project()`, oppure la differenza accettata in D16 con questa prova | no |
| MINOR | v2 | `PLAN.md` T10 (log), `IMPLEMENTATION-NOTES.md` | Il motivo di `clearMocks: true` conta male: con `false` falliscono 26 test in 4 file (`downloadGuards.test.ts` 19, `delete.test.ts` 4, `update.db.test.ts` 2, `cleanupTaskEventLog.db.test.ts` 1), non 7 in 3 | Correggere il log | no |
| MINOR | v2 | `vitest.config.ts`, `inTimeZone` | L'ambiente node dei `*.db.test.ts` nei progetti dei fusi ora dipende da un commento nel file (`// @vitest-environment node`). Oggi è completo, ma un futuro `*.db.test.ts` sotto `src/lib/import/**` girerebbe in jsdom senza che niente fallisca | Facoltativo: dividere i progetti dei fusi per ambiente con un glob | sì |
| MINOR | v4 — dipendenze e CI (AC2, AC13, AC14) | `package.json` `engines.node` | vitest 5.0.5 vuole Node `^22.12.0`, vite 7.3.7 `>=22.12.0`, ma `engines.node` è `"22.x"`. CI, Vercel e il Dockerfile usano l'ultima 22.x, quindi nessun gate si rompe | Annotare il minimo (22.12), o alzarlo in `engines.node` dopo aver verificato come lo legge Vercel | sì |
| MINOR | v4 | `brain/chore/roadmap-nuovo-stack.md` §4 e §8 | Il debito (AC13) e i documenti (AC12) della PR 2 non sono sul branch: aspettano la #111 in `dev` | Il commit dei documenti su `claude/vitest-5` prima del merge | no |
| MINOR | v1 | `scratchpad/probe/compare.mjs` | Le prove non legano i report a un progetto, e il confronto dei titoli "solo forma" è largo | Chiuso dalle prove indipendenti di v1: il partizionamento dal config e `vitest list --filesOnly --json` | no |
| NIT | v1, v4 | `packages/domain/src/utils/_test/dates.test.ts:4`, `romeClock.test.ts:4`, `packages/domain/src/import/_test/classify.test.ts:11`, `src/lib/import/_test/characterization.test.ts:28` | I commenti citano `vitest.workspace.ts`, che non c'è più | Nominare i progetti `utc`/`rome` di `vitest.config.ts` | no |
| NIT | v2 | sonda | La sonda misura una volta, al caricamento, con `useFakeTimers()` di default, e controlla 6 globali su 7 | Chiuso da v2: le configurazioni risolte dalle due versioni e un'esecuzione strumentata (0 implementazioni trapelate fra i test, con controllo positivo) | no |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — quali test e dove | Le stesse liste di file per progetto da tre fonti (i glob di vitest 1 su `origin/dev`, quelli di vitest 5 sul branch, il vero `vitest list`): `unit` 137, `db` 127, `pg` 23, `utc` 14, `rome` 14. Nessun file in più, in meno o eseguito due volte; `--project pg` sceglie gli stessi 23 file; `defaultExclude` è identico a `configDefaults.exclude` di vitest 1.6.1; comandi e CI invariati |
| v2 — come gira ogni file | Sonda 312/312 uguale. Configurazioni risolte: `threads` per `unit`/`db`/`pg`, `forks` per `utc`/`rome`, gli stessi 7 timer in `toFake`, `setupFiles` una volta per file, nell'ordine (con `pg.setup.ts` dopo `setup.ts`). Una sonda dei fusi con gli scarti di `Date` dà lo stesso risultato su v1 e v5. Esecuzione strumentata: 2497 `vi.fn`, 0 implementazioni o valori `once` trapelati fra un test e l'altro |
| v3 — integrità dei test | Sul branch cambiano solo i tipi di `vi.fn` in 7 file e un commento di ambiente; ogni firma è equivalente; nessuna asserzione o marcatore cambia; lo script esce con 0 senza eccezioni (anche con la versione corretta: 279 catene) |
| v4 — dipendenze e CI | `pnpm install --frozen-lockfile` coerente; `vite` 7.3.7 è la più alta compatibile con vitest 5 e `@vitejs/plugin-react` 4.7; nessun residuo di vitest 1, vite 5 o vite-node; `tsc` pulito; `api:build` ok; il progetto `pg` non lascia database `mito_test_*` |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Quali test girano e dove | SHIP | Partizione identica; resta la lettera di AC3 sui titoli `each` (MAJOR) |
| v2 | Come gira ogni file | SHIP | Le quattro proprietà di AC3 tengono; `sequence.hooks` non fissato (MINOR) |
| v3 | Integrità dei test | DO NOT SHIP | Il diff della PR passa, ma lo script di AC5 accettava cambi che deve vedere; corretto dopo in `ff0c648` |
| v4 | Dipendenze, lockfile e CI | SHIP | Cablaggio coerente; minimo di Node e documenti di AC13 da sistemare |

### Human Review Checklist

1. **AC3.** Decidi se accettare il cambio di formato dei titoli `each`. Se sì, AC3 nella SPEC va corretto con l'eccezione e i 12 file.
2. **`sequence.hooks`.** Va fissato a `parallel` in `vitest.config.ts`, oppure la differenza va accettata in D16. Poi la suite intera con `TEST_DATABASE_URL` deve restare a 4408 test verdi e 6 saltati.
3. **Lo script corretto** va riverificato da `claude/effect-4`:
   - con l'harness dello scratchpad, 19/19;
   - con `node scripts/check-assertions.mjs assertions origin/dev claude/vitest-5`, che deve uscire con 0.
4. **I documenti (AC12, AC13)** vanno su `claude/vitest-5` dopo il merge della #111 in `dev`:
   - la riga di vitest nel §4 della roadmap;
   - W3 in `manutenzione-dipendenze.md`;
   - la frase sul debito della PR 2;
   - i quattro commenti su `vitest.workspace.ts`;
   - il conteggio corretto di `clearMocks` nel log.
5. **La CI della PR** dev'essere verde, compresi il passo dei test con Postgres e il controllo che non restino database `mito_test_*`.
6. **Il merge in `dev`** solo dopo i punti 1–5.

### Acceptance criteria check

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC2 | Met | vitest ^5.0.5, vite ^7.3.7; `vitest.workspace.ts` tolto; i progetti in `test.projects`; comandi invariati |
| AC3 | Unmet (alla lettera) | Ambiente, fuso, pool e timer uguali per ogni file; gli stessi test e stati. I titoli `each` cambiano forma in 12 file: serve la correzione di AC3 |
| AC5 | Met | 0 asserzioni cambiate; lo script è stato reso più severo dopo la revisione |
| AC12 | Blocked | Aspetta la #111 in `dev` |
| AC13 | Unmet | "Nessun debito nuovo" sta solo nelle note su `claude/effect-4`; manca nella roadmap |
| AC14 | Met in locale | `tsc`, la suite con `pg`, `api:build`; lint pulito in una copia dei file. La CI della PR non è ancora partita |

### Notes for docs-maintenance

- **Durable findings** per `brain/tech-debt/crm/effect-4.md`, se restano dopo il merge:
  - l'ambiente dei `*.db.test.ts` nei progetti dei fusi, che oggi dipende da un commento;
  - il minimo di Node 22.12 contro `engines.node: "22.x"`.
- **Pagine di dominio da collegare:** nessuna (strumenti di test).

## [Round: 2026-10-27 — PR 1, Effect 4]

`base_ref` e `head_ref` del frontmatter sono quelli del round della PR 2. Questo round confronta `origin/dev` (`5adbfc1`) con `claude/effect-4` (`a9e199d`).

### Verdict

**DO NOT SHIP** · impact: critical

**L'obiezione più forte (v7) riguarda lo script di AC5,** che fa da gate a tutte e quattro le PR. Una rinomina pura di un file di test non viene confrontata (`scripts/check-assertions.mjs:333`, `if (before === after) continue`): `git mv _test/x.test.ts _test/x.ts` toglie un file intero dall'esecuzione, e lo script stampa comunque "ok".

**I cambi della PR 1 sono sani.** Sette verificatori su otto danno SHIP, e v7 conferma che:
- le riscritture D14 asseriscono esattamente quello di prima;
- gli helper e gli orologi sono equivalenti;
- i test di T2 uccidono i loro mutanti su Effect 3;
- le suite di AC7 sono verdi.

Il blocco è tutto nello script e nel suo harness.

### Coverage

- **Passate eseguite:** 8/8.
  - v1, v2, v3, v4 e v7 sul modello più forte;
  - v5, v6 e v8 su sonnet.
- **Passate saltate o fallite:** nessuna.
- **UI pass:** non prevista dalla rubrica, perché non cambia nessuna superficie visibile.
- **Gate di CI (AC14),** in un worktree senza `.env*` (`scratchpad/gate-pr1.log`):
  - install, lint, `tsc`, `db:check` verdi;
  - test con Postgres: 312 file, 4413 verdi e 6 saltati;
  - `api:build` e `api:smoke` verdi;
  - `next build` verde, rifatto con `SKIP_ENV_VALIDATION=true` come la CI. Il primo tentativo era fallito per un errore del comando, non del codice, e v8 lo ha rifatto in una copia pulita.
- **Non fatte:**
  - la prova nel browser su `mito_local` (T8.4): serve un `.env.development.local` con il database locale e le chiavi dello storage di sviluppo;
  - la prova su staging (GA2).

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v7 — integrità dei test | `scripts/check-assertions.mjs:333` | Una rinomina pura salta il confronto: un `*.test.ts` rinominato in `.tst.ts`, `.ts` o `.md` esce con 0 (0 catene) | Se il vecchio percorso è un test eseguibile e il nuovo no, trattarla come una cancellazione; casi nell'harness | no |
| MAJOR | v7 | `scripts/check-assertions.mjs:199` (`markerKey`) | La chiave dei marcatori tiene solo i nomi. Passano: `it(name, { skip: true }, fn)`, `{ fails: true }`, `ctx.skip()`, `describe.skipIf(!hasDb)` → `skipIf(true)` (28 chiamate nel repo, una in AC7), `it` → `it.each([])` | Gli argomenti di `skipIf`/`runIf`/`each`/`for` nella chiave; segnalare le opzioni del test con skip/only/todo/fails e `ctx.skip(`; casi nell'harness | no |
| MAJOR | v7 | stesso script | Le tabelle di `it.each`/`describe.each` (233 chiamate in 103 file, che la PR 3 riscrive) non si confrontano: un valore atteso cambiato nella tabella passa | Confrontare le tabelle come catene, con la stessa chiave a token | no |
| MINOR | v7 | `:145`, `:140` | `assert(cond)` senza proprietà e `ctx.expect(...)` non sono radici (`assert` di `@effect/vitest`, nella PR 3, è una funzione) | Aggiungerli | no |
| MINOR | v7 | stesso script | Togliere l'`await` davanti a `await expect(p).rejects…` passa | L'`await`/`return` genitore nella chiave delle catene `.resolves`/`.rejects` | no |
| MINOR | v7 | `:301`, `:362`, `:377` | Le eccezioni sono legate solo a `file:riga`: una seconda catena sulla stessa riga passa, e una voce inutilizzata dà solo un avviso | Legare la voce a un hash della chiave; far fallire le voci inutilizzate | no |
| MINOR | v7 | — | Un valore atteso in una costante fuori dalla catena, un'asserzione spostata in un helper non chiamato, `expect` importato da altrove: nessun confronto di catene li vede. Nella PR 1, v7 ha letto a mano i 16 file di test e nessuno di questi casi c'è | Dirlo nel gate: lo script non sostituisce la lettura del diff | no |
| MINOR | v3 — configurazione | `import.db.test.ts:284-300`, `supabase.test.ts:420-440` | I due test di D15 fanno da guardia solo se gira il file intero: da soli (`-t`, `.only`) non leggono prima la configurazione, e il mutante "mai fresco" passa. Nella suite intera lo uccidono | Un test diretto di `withCurrentEnv`: lettura, cambio di `process.env`, nuova lettura | no |
| MINOR | v4 — errori ai bordi | `src/app/api/cron/priority/route.ts:24` | Con un body malformato Sentry riceve `UnknownError` invece di `UnknownException`, con un titolo diverso, quindi un gruppo nuovo. La risposta resta 200 | Annotarlo nel Context della SPEC (i Non-Goals escludono di cambiare il codice) | sì |
| MINOR | v4, v1 | `effect.ts` di v4 (`causeElectDefects`) | Se un finalizer o una fibra sorella muore, v4 trasforma l'errore tipato in *defect*: `findErrorOption` non lo vede più (500 invece di 401/404, `INTERNAL` invece del codice). Oggi non succede: niente `ensuring`/`acquireRelease`/`addFinalizer` nel codice di produzione, e le `Effect.all` concorrenti hanno solo `DbError`. In auth il risultato sarebbe più severo, mai più permissivo | Una riga nel Context della SPEC accanto a OQ1, così il primo finalizer vicino a `runTrpc` o alle rotte viene rivisto | sì |
| NIT | v7 | `eccezioni-pr1.txt:21-23` | I marcatori anonimi fanno citare come "test nuovi" tre test esistenti di `db.db.test.ts` (294, 305, 306). I conti sono giusti (4 `it` e 1 `describe` nuovi) | Il titolo nella chiave dei marcatori, o una nota nel file | no |
| NIT | v7 | `concurrency.pg.test.ts:297` | L'orologio a passi ha ora `sleep` e i nanosecondi fissi; su v3 non li aveva. Il percorso asserito non dorme | Nessuno | no |
| NIT | v2 — transazioni | `effect/_test/db.db.test.ts` | Nessun test locale per "query fallita → `catchTag("DbError")` → errore tipato, nessuna riga" (un mutante passa il file, ma 26 test dei servizi lo uccidono) | Facoltativo: un test locale | no |
| NIT | v2, v4, v6 | `effect/db.ts:114-118,137-141`; `export/files.ts:46` | I *defect* sono `Error` invece di `RuntimeException`; `Effect.runPromise` rifiuta con il *defect* nudo invece di `FiberFailure`; `Cause.squash` di una causa di sole interruzioni cambia. Nessun codice li legge; Sentry può raggrupparli diversamente | Facoltativo: una nota | no |
| NIT | v5, v3, v8 | vari | Nessun test conta i logger (togliere `tracerLogger` passerebbe); `fixedClock` ha `sleep` istantaneo, come la versione per v3; `withCurrentEnv` in `storage/config.ts` non ha un test suo; un provider derivato da quello di default tornerebbe a fotografare l'ambiente (da annotare in TD12); 123 file importano `effect` invece di 122 | Facoltativi | no |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — auth | Prova differenziale v3/v4 su 11 cause con le catene vere (`admits`, dispatch delle rotte): uguali, tranne il caso latente sopra. Chiavi dei servizi identiche. Suite di auth, cron, import, download e profilo: 29 file, 287 test; pg 15/15; `apps/api` 43 |
| v2 — transazioni | Differenziale v3/v4 su 15 scenari (contesto e riferimenti, errori tipati, `DbError` recuperato, annidamento, COMMIT fallito, rollback, interruzioni, figli, deadlock): stesso comportamento. 7 mutanti, 6 uccisi dal file, 1 da 26 test dei servizi. AC7 89/89, servizi 547/547, pg 29/29 |
| v3 — configurazione | Identità del provider di default stabile fra `Context.empty()`, fibre, `ManagedRuntime`, layer e `runForkWith`. Differenziale v3/v4 su 2688 combinazioni dell'ambiente per la coda e 210 per lo storage: 0 differenze, nessun `inProcess` su Cloud Run o Vercel. Credenziali `Redacted` |
| v4 — errori ai bordi | 15 cause × 13 comportamenti più programmi veri: stessi codici tRPC, divisione fra errori attesi e loggati, finali dell'import, stati dei cron, tentativi, report. 11 file, 158 test |
| v5 — runtime e log | Output della console identico fra v3 e v4 (livelli, logfmt, annotazioni, span); due logger, nessun duplicato; le fibre dell'import sopravvivono a un chiamante interrotto come in v3; `fixedClock` completo |
| v6 — storage e download | Il client a Promise rifiuta con la stessa istanza dell'errore tipato o con lo stesso *defect*; chiave `gcs-storage-kit/Storage`; 404/500 della rotta invariati; 140 test |
| v7 — integrità dei test | D14 severe come prima su 8 forme di `Exit` (un'altra ragione, un *defect* accanto, un errore diverso falliscono in tutte e due le versioni). Helper e orologi equivalenti; i mutanti di T2 uccisi su Effect 3; harness 19/19; AC7 805 test non-pg e 114 pg |
| v8 — dipendenze, build, documenti | Una sola copia di `effect` 4.0.6, nessun import da sottopercorsi; i gate verdi; `next build` verde in una copia pulita; `AGENTS.md`, roadmap (§4, §7, TD12) e `migrazione-effect.md` coerenti con il codice |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Auth | SHIP | Nessun percorso di auth raggiungibile cambia esito; la differenza latente è più severa |
| v2 | Transazioni | SHIP | Stesso comportamento in 15 scenari, mutanti uccisi |
| v3 | Configurazione | SHIP | D15 fa il suo lavoro; le guardie dipendono dall'ordine dei test (MINOR) |
| v4 | Errori ai bordi | SHIP | Esiti uguali; un titolo di Sentry e una differenza latente da annotare |
| v5 | Runtime, fibre, log | SHIP | Output e fibre equivalenti |
| v6 | Storage e download | SHIP | Esiti uguali |
| v7 | Integrità dei test | DO NOT SHIP | I cambi della PR sono sani, ma lo script di AC5 lascia passare una rinomina e alcuni marcatori |
| v8 | Dipendenze, build, documenti | SHIP | AC1, AC12, AC13 e AC14 soddisfatti |

### Human Review Checklist

1. **Lo script di AC5.** Correggere il BLOCKER e i due MAJOR di v7 (rinomina, marcatori con argomenti e opzioni, tabelle di `each`), con un caso nell'harness per ognuno. Poi rifare:
   - `node scripts/check-assertions.mjs assertions origin/dev HEAD --exceptions brain/specs/crm/effect-4/eccezioni-pr1.txt`, che deve uscire con 0;
   - lo stesso confronto fra `origin/dev` e `claude/vitest-5`.
2. **Il test diretto di `withCurrentEnv`** (v3) e le due righe nel Context della SPEC (v4: il titolo di Sentry del cron `priority`; l'errore tipato che diventa *defect* con finalizer o fibre sorelle).
3. **La prova nel browser su `mito_local`** (T8.4), con un `.env.development.local` locale: login, Dashboard, Clienti, Contatti, un import in processo, il download di un export, Profilo. Nessun errore in console né dal server.
4. **Leonardo (D4)** rivede la PR 1, in particolare i file dell'auth (`betterAuth/*`, `apps/api/src/{cron,import}/auth.ts` e `routes.ts`) e la nota di v1.
5. **Prima del merge,** `dev` unito nel branch, la CI della PR verde, poi GA2 su staging.

### Acceptance criteria check

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1 | Met | Una copia di `effect` 4.0.6, solo import da `"effect"` |
| AC5 | Met per la PR 1, il gate no | Le uniche differenze sono le 41 eccezioni (T2 e D14), confermate a mano da v7; lo script ha i buchi sopra |
| AC6 | Met | I test di T2 verdi su Effect 3 e su Effect 4; mutanti uccisi |
| AC7 | Met | Tutte le suite nominate verdi, anche su Postgres |
| AC12 (PR 1) | Met | `AGENTS.md`, roadmap §4 e §7, `migrazione-effect.md` |
| AC13 | Met | TD12 nel §8 della roadmap |
| AC14 | Met in locale | I gate nel worktree pulito; la CI della PR non è ancora partita |

### Notes for docs-maintenance

- **Durable findings** per `brain/tech-debt/crm/effect-4.md`, se restano dopo il merge:
  - in v4 un errore tipato con un finalizer o una fibra sorella morta diventa *defect*;
  - il titolo di Sentry del cron `priority`.
- **Pagine di dominio da collegare:** nessuna.

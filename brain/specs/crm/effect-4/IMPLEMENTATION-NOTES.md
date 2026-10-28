# Implementation Notes

## Summary

- Run di `implement-spec` partita il 2026-10-27, dopo G0 (SPEC approvata, D8, D9 e D14 confermate da Omar).

## Execution Mode

- Mode: `parallel`, per wave (§10 del piano).
  - La PR 1 gira nel worktree della sessione, sul branch `claude/effect-4`, da `55d6fa2` (il commit di G0 sopra la PR #111).
  - I task della PR 2 vanno a worker con un worktree isolato, che creano `claude/vitest-5` da `origin/dev` (`5adbfc1`). La sessione può scrivere solo nel proprio worktree.
- Delegation: `supervised` (`brain/brain.config.json`). `low` → haiku, `medium` → sonnet, `high` → il modello del supervisore.
- Escalations: nessuna. Due cicli di correzione chiesti dalle revisioni: lo script di T1 (la prima revisione della PR 2), le correzioni di T10 (`01a042a`).

## Deviations From the Plan

- **`PLAN.md` e queste note stanno solo sul branch della PR 1**, anche per i task della PR 2. Due branch paralleli che scrivono lo stesso file andrebbero in conflitto, perciò la sezione "PR 2" di queste note la scrive il supervisore qui.
- **Il file di eccezioni di AC5 copre anche le catene tolte.** Il piano diceva "`file:riga` della catena nuova", ma una riscrittura (D14) toglie una catena e ne aggiunge un'altra. Il formato ha quindi due forme:
  - `<file>:<riga> <motivo>` per una catena aggiunta (riga nel `head`);
  - `base:<file>:<riga> <motivo>` per una catena tolta (riga nel `base`).
- **AC11: la soglia su `dev` è 74, non 75.** Lo script di T1 conta le funzioni il cui corpo è, o restituisce, un `Effect.gen`. La stima del piano contava anche:
  - programmi che non sono funzioni (`run: Effect.gen(...)` in `apps/api/src/cron/jobs.ts`, `const x = Effect.gen(...)`);
  - le frecce `(...) => transaction(Effect.gen(...))`, che restituiscono un `transaction`.

  SPEC e piano sono corretti a 74. La PR 4 porterà a zero le funzioni contate.
- **Lo script ignora le virgole finali** prima di `)`, `]` e `}`, oltre agli spazi: un formatter le aggiunge o le toglie senza cambiare l'asserzione.

## Surprises and Decisions

- **La ricerca di D14 su `dev` (`5adbfc1`)** trova esattamente i punti del §6 del piano.
  - Trova anche letture di `exit.cause` fuori dalle asserzioni: `String(exit.cause)`, `Cause.pretty`, `Cause.squash`, `Cause.failureOption` negli helper. Non sono catene di `expect`, e cambiano solo se l'API non esiste più.
  - `lockRule.db.test.ts:72,590,647` asseriscono su `Cause.pretty(exit.cause)` con `toContain`. Non sono nell'elenco di D14 e devono restare uguali: se il testo di `Cause.pretty` in v4 non contiene più la stringa, ci si ferma e si chiede.

- **Il worktree della sessione non aveva `better-auth` in `node_modules`**: era stato installato prima della PR #108. La prima sonda di T9 ha visto 14 file non caricati. Rimedio: `pnpm install --frozen-lockfile`, che non cambia il lockfile, poi la sonda rifatta.

- **I defect di `transaction` sono `Error`, non più `RuntimeException`** (T3): v3 creava una `RuntimeException` con `dieMessage`/`filterOrDieMessage`. Il messaggio è lo stesso, e i test controllano il messaggio e `isDefect`.
- **ESLint nel worktree** carica anche il `.eslintrc.cjs` della checkout principale (due `eslint-plugin-prettier`). Si controlla con `--no-eslintrc -c .eslintrc.cjs`; il gate vero è la CI.
- **Le righe del file di eccezioni si spostano** con ogni task che tocca i file di test. Il supervisore lo rigenera dopo ogni task dall'uscita dello script, con regole che ammettono solo le categorie T2 e D14 e lasciano scoperta ogni altra catena.

- **D15 vive in un helper** (`packages/server/src/shared/currentEnv.ts`): riconosce il provider di default di v4 per identità e ne crea uno nuovo a ogni esecuzione. Se una versione futura di `effect` cambiasse come il default viene esposto, il confronto smetterebbe di valere senza errori: lo coprono i due test di D15 (`import.db.test.ts:284-300`, `supabase.test.ts:406-440`).
- **OQ1, differenza latente:** in v4 un *defect* vince su `catchIf`/`catch` quando la causa ha anche un errore tipato. Nessun test la esercita, e nei programmi di oggi (`betterAuth/run.ts`) le due cose non arrivano insieme.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| RED di T1 (`t1-harness.sh` nello scratchpad, 10 casi, 11 controlli) prima dello script | 0/11 | Fallisce perché lo script non c'è |
| `t1-harness.sh` con lo script (T1) | 11/11 | Rifatto dal supervisore |
| `check-assertions.mjs gen-wrappers origin/dev` | 74 | Con `query` e `lockCustomer` |
| PR 1, `tsc --noEmit` dopo T3–T5 | 0 errori fuori da `.next/` | `.next/types` è generato da una build vecchia e ignorato da git |
| PR 1, `pnpm run test --run` con `TEST_DATABASE_URL` | 312 file, 4413 verdi, 6 saltati | I 4408 di `dev` più i 5 di T2 |
| PR 1, `check-assertions.mjs assertions origin/dev HEAD --exceptions eccezioni-pr1.txt` | exit 0, 35 eccezioni | Solo T2 e D14 |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1 | Met (PR 1) | `effect` 4.0.6, una copia, solo import da `"effect"` |
| AC2 | Met (PR 2) | vitest ^5.0.5, vite ^7.3.7, progetti in `test.projects` |
| AC3 | Met (PR 2) | Ambiente, fuso, pool e timer uguali per ogni file. I titoli di `each` cambiano forma in 12 file: AC3 corretto per accettarlo (Omar, 2026-10-27) |
| AC5 | Met per le PR 1 e 2 | Lo script corretto nella PR 3 (`a7b5d3d`): la rinomina, i marcatori con argomenti, opzioni e titolo, le tabelle di `each`, `assert`, `ctx.expect`, l'`await` dei `resolves`/`rejects`, le eccezioni con l'hash. Sul diff della PR 1 trova le stesse 41 differenze |
| AC6 | Met | Test di T2 |
| AC7 | Met | Suite nominate verdi, anche su Postgres |
| AC12 | Met per le PR 1 e 2 | PR 2: `d7674cd` su `claude/vitest-5` |
| AC13 | Met per le PR 1 (TD12) e 2 (nessun debito) | PR 2: la frase nel §8 della roadmap |
| AC14 | Met per le PR 1 e 2 | CI verde su #113 e #114 |
| AC4 | Met (PR 3, T12) | `@effect/vitest` 4.0.6 |
| AC8 | Met (PR 3) dopo le correzioni della revisione | I bordi e i due orologi a passi nel log di T17 e nel §8; `queue.test.ts` e il budget di `processDueAlerts` in `it.live` |
| AC5 (PR 3) | Met | 218 eccezioni, tutte `await` → `yield*` dello stesso valore (con `provideServer`/`Effect.exit`, `Fiber.join`, la tabella `writers`), più il test nuovo e un `.resolves`. Categoria firmata da Omar (D17) |
| AC5 (PR 4) | Met | 321 eccezioni: 8 titoli di `describe` rinominati da T18, 313 catene dei test nuovi di T19. Un test di D8 svuotato dagli span, corretto nella fixture (vedi PR 4) |
| AC9 | Met (PR 4) | 0 `*Live`; id `@mito/<pacchetto>/<percorso>/<Nome>`, letti per stringa |
| AC10 | Met (PR 4) | 0 `Data.TaggedError` (61 su `dev`); 89 test nuovi verdi prima e dopo; `DbError.message` corretto dopo la revisione |
| AC11 | Met (PR 4) | `gen-wrappers` trova solo `transaction` (73 su `dev`); `fnUntraced` esportate: `query`, `lockCustomer`, `applyMigrations`, `readSession` |
| AC12–AC14 (PR 4) | Met in locale | `AGENTS.md`, §2 di `migrazione-effect.md`, §8 della roadmap; la CI parte con la PR |
| AC15 | Non verificato | Staging, dopo il merge della #114 |

## Pre-existing Issues

- 

## Out of Scope Observations

- 

## Remaining Work

- **PR 1** (in `dev`, [#114](https://github.com/omardeangelis/mito-micro-services/pull/114)): la prova nel browser su `mito_local` e la revisione di Leonardo (D4) sui file dell'auth, rinviate; AC15 su staging.
- **PR 2:** in `dev` ([#113](https://github.com/omardeangelis/mito-micro-services/pull/113)).
- **PR 3:** in `dev` ([#116](https://github.com/omardeangelis/mito-micro-services/pull/116)).
- **PR 4** (`claude/effect-style`, da `dev` `e7ead47`): T18–T21 fatti, correzioni della revisione fatte, prova su `mito_local` verde (2026-10-28). La revisione di Leonardo non è più obbligatoria (Omar, 2026-10-28). Resta la PR verso `dev`, con D7 nella descrizione.

## PR 2 – vitest 5

- **La base di AC3 (T9, vitest 1.6.1, `dev` `5adbfc1`):** 315 file, 4408 test verdi e 6 saltati.
  - `unit`: 117 file jsdom e 146 node, in thread, con il fuso dell'host.
  - `pg`: 21 file node, in thread.
  - `utc` e `rome`: 14 file ciascuno (8 jsdom, 6 node), in processi figli con il loro fuso.
  - Timer finti: `setTimeout`, `setImmediate` e `Date`; non `performance.now`, `queueMicrotask` né `nextTick`.
  - Il setup gira una volta per file.
- **T10 (commit `b1cd256` su `claude/vitest-5`):** la sonda di vitest 5 dà le stesse righe di v1 (`differences: 0`), con la sola mappa `unit` node dei `*.db.test.ts` → `db`. Gli stessi 4408 test verdi e 6 saltati.
  - Fuori dal piano: 7 file di test cambiano solo il tipo di `vi.fn`.
  - I titoli di `test.each` cambiano formato in 12 file: nessuna opzione di vitest 5 riporta quello di v1.
- **I documenti della PR 2** (riga di vitest nel §4 della roadmap e W3) partono da righe che esistono solo nella PR #111. Si scrivono su `claude/vitest-5` dopo che la #111 è in `dev` e `dev` è unito nel branch: scritti prima, andrebbero in conflitto con la #111.
- **Debito della PR 2 (AC13):** nessuno di nuovo. L'avviso del peer `@types/node` di vitest 5 lo chiude la riga di `@types/node` già nel §4 della roadmap.

## PR 3 – @effect/vitest

- **Esecuzione:** T12 su un worker del modello più forte nel worktree della sessione; T13–T16 in parallelo su quattro worker del modello bilanciato, ognuno nel suo worktree e branch, uniti dal supervisore. Il worker di T16 aveva riportato indietro `PLAN.md` e queste note nel suo commit: nel merge sono rimasti quelli del branch.
- **Deviazioni:**
  - AC5: oltre all'equivalenza `await X` = `yield* Effect.promise(() => X)`, le eccezioni ammettono `expect(await X)` → `expect(yield* X)` quando l'helper o il programma X diventa un Effect con lo stesso valore. Senza, gli helper dei test avrebbero tenuto runner a Promise, contro AC8. Proposta dal supervisore durante T13–T16, firmata da Omar dopo la revisione (D17).
  - AC8: il secondo orologio a passi, in `apply.db.test.ts`, c'era già su `dev` e la SPEC non lo nominava.
  - `runServer` resta per una cella di una tabella `each`, che lo script confronta e che deve restituire una Promise come l'altra riga.
- **Sorprese:** `it.effect.each` passa la riga intera come un argomento solo; le scadenze lette dal `Clock` vogliono `TestClock.setTime(Date.now())`, se no `statement_timeout` riceve un valore enorme; `TestClock.setTime` fallisce sotto `it.live`; un `TestClock` è condiviso dalle fibre di un test (in `run.pg.test.ts` va riportato indietro prima di liberare il lock).

## PR 4 – lo stile di Effect 4

- **Esecuzione:** T18 e T19 in sequenza nel worktree della sessione; T20a, T20b e T20c in parallelo, ognuno nel suo worktree e branch, uniti dal supervisore in `claude/effect-style`.
- **D7:** la PR 4 converte file che nessuna modifica di prodotto tocca. È un'eccezione approvata alla regola di `AGENTS.md` "solo il codice che la modifica tocca" (Omar, 2026-10-27), e la descrizione della PR lo dice.
- **Deviazioni:**
  - `readSession` e `applyMigrations` sono esportate ma `Effect.fnUntraced`: un `Effect.fn` con traccia aggiunge un'annotazione `StackTrace` alla `Cause` del fallimento, e i loro test confrontano l'`Exit` intero.
  - Le costanti `<nome>Layer` (`serverLayer`, `storageLayer`, `cronLayer`, `importRouteLayer`) dove un layer statico farebbe un import circolare.
  - Lo script di AC5 non è copiato in queste note (D11 diceva il sorgente qui): resta nella storia di `dev`, `git show e7ead47:scripts/check-assertions.mjs`.
- **Differenze note di T19** (verificate, nessuno le legge):
  - `Schema.Struct` e `Schema.Array` copiano `alert` e `tags`: stesso contenuto, istanza diversa;
  - `_tag` è la prima chiave nello spread, in `JSON.stringify` e in `inspect`;
  - le chiavi fuori dallo schema si perdono, ma i 119 punti di costruzione passano tutti un letterale;
  - due input malformati, che nessuna fonte reale produce, ora lanciano invece di passare: un `tags` non stringa in un journal di drizzle rotto, e un errore del driver con un `message` non stringa. Il secondo è corretto (`String(...)` in `toDbError`, con un test in `db.db.test.ts`).
- **La revisione (DO NOT SHIP, 2026-10-28):** gli span di `Effect.fn` leggono `currentTimeNanos` del `Clock`, e l'orologio a passi di `apply.db.test.ts` dava lo stesso copione a millisecondi e nanosecondi. Il test "la scadenza che passa tra un blocco e l'altro annulla anche il primo" scadeva prima del primo blocco. Corretto nella fixture (scelta di Omar): i nanosecondi sono costanti, come nell'orologio di `concurrency.pg.test.ts`. Il mutante di v4 (`timeLeft` che ignora la scadenza dopo il primo blocco) ora fa fallire il test. Nessuna asserzione cambiata.

- **Prova su `mito_local` (T8.4, 2026-10-28):** `next dev` di questo worktree, che non ha file `.env*`, con le sole variabili locali (database `mito_local`, un `BETTER_AUTH_SECRET` nuovo, `AUTH_TEST_LOGIN=true`, storage placeholder); `mito_local` portato a 18 migrazioni con `db:local:migrate`. ADMIN del seed `malco.bellucci.01@mito.test`, `agent-browser`. Verde, nessun errore in console né dal server:
  - login via email: il link nel log del server, `/dashboard`;
  - Dashboard; Clienti; Contatti; Pratiche; il dettaglio di `C004592` con le sue note; il dettaglio del contatto 1006;
  - un import Standard di 2 righe (una valida, una senza importi): anteprima 1 importabile e 1 scartata, poi "Completato" con cliente, pratica e legame scritti;
  - l'export delle chiamate: `chiamate_2026-09-29_2026-10-28.xlsx`, foglio "Chiamate", 29 righe. Il file è letto dal blob nella pagina: il click di `agent-browser` non arrivava al pulsante, il click dal DOM sì;
  - Profilo con la tab Admin (Gestisci operatori);
  - l'uscita: `POST /api/auth/sign-out` 200, riga di sessione cancellata, ritorno a `/login`.
  - Senza sessione le procedure danno 401. `/dashboard` mostra il guscio vuoto invece di rimandare a `/login`: c'è anche su `dev`, perché `src/middleware.ts` non esiste (piano di `auth-better-auth`), e la PR 4 non tocca quei file.
  - A fine prova le righe dell'import sono cancellate e `mito_local` è com'era (10.000 clienti, nessun import, nessuna sessione).

## Steering

| Date | Feedback | Changes |
|------|----------|---------|
| 2026-10-27 | G0: SPEC approvata; D8, D9, D14 confermate | `SPEC.md` `approved`, OQ2 chiusa; `PLAN.md` aggiornato (commit `55d6fa2`) |
| 2026-10-27 | AC3: la forma dei titoli `each` non conta | AC3 corretto nella SPEC, con una riga nel registro delle decisioni; AC3 Met per la PR 2 |
| 2026-10-27 | "Mergiale e fai partire 3 e 4" | #113 e #114 in `dev` a CI verde, senza la prova su `mito_local` e senza la revisione di Leonardo chieste da GA1. I punti aperti della revisione della PR 1 (script, test di `withCurrentEnv`, note nella SPEC) entrano nella PR 3, prima della conversione |
| 2026-10-27 | "Accetto i nuovi AC5 rules" | Categoria `expect(await X)` → `expect(yield* X)` firmata: D17 nel piano, AC5 e la riga del registro nella SPEC; PR 3 aperta verso `dev` |
| 2026-10-28 | "Scelgo la strada a e poi fixa il resto" | Orologio di `apply.db.test.ts` con nanosecondi costanti; `DbError.message` in stringa; `AGENTS.md`, §2 di `migrazione-effect.md`, `operatore.md`, AC11 e queste note; script di AC5 tolto |
| 2026-10-28 | "La revisione non è mandatoria, puoi fare un test in locale invece?" | D4 non vale più per la PR 4; prova su `mito_local` fatta, verde (sezione PR 4) |

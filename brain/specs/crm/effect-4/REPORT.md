---
domain: crm
type: review
scope: spec
spec: effect-4
review_target: "branch claude/effect-style (PR 4 di 4)"
base_ref: origin/dev (e7ead47)
head_ref: claude/effect-style (eeb7c06)
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
updated: 2026-10-28
---

# Review Report: Effect 4, vitest 5 e lo stile di Effect 4

La spec ha quattro PR, ognuna con la sua revisione. Ogni revisione è un round qui sotto, con lo stesso round in `RUBRIC.md`.

## [Round: 2026-10-28 — PR 4, lo stile di Effect 4]

### Verdict

**DO NOT SHIP** · impact: critical

9 passate su 10 danno SHIP. Servizi, errori ed `Effect.fn` si comportano come su `dev` in tutto ciò che si vede da fuori: risposte tRPC e HTTP, eventi di Sentry, auth, transazioni, configurazione, migrazioni. L'obiezione è una sola:
- **Un test di D8 è diventato vuoto (v4).** `import.applyImport` e `import.lookupExisting` sono ora `Effect.fn` con traccia. Lo span che aprono legge `currentTimeNanos` del `Clock` all'inizio e alla fine, e l'orologio a passi di `apply.db.test.ts:770` dà la stessa sequenza a millisecondi e nanosecondi. Il test "la scadenza che passa tra un blocco e l'altro annulla anche il primo" ora scade prima di scrivere il primo blocco, cioè copre lo stesso caso del test della riga 742. Un mutante che tiene l'import parziale fallisce su `dev` e passa sul branch. Nessun gate lo vede: nessuna asserzione è cambiata.

### Coverage

- **Passate eseguite:** 10/10 (v1, v2, v3, v4, v5, v6, v8 sul modello più forte; v7, v9, v10 su sonnet).
- **Passate saltate o fallite:** nessuna.
- **UI pass:** non prevista, nessuna superficie visibile cambia.
- **Suite sotto carico:** con dieci passate in parallelo (load average ~100) molte passate hanno visto timeout degli hook; rilanciati con meno worker, i file passano. Nessun fallimento di asserzione.

### Findings

| Severity | Verifier | Location | Finding | Fix | Durable? |
|---|---|---|---|---|---|
| MAJOR | v4 | `services/import/_test/apply.db.test.ts:770-778` | Gli span di `Effect.fn` consumano le letture dell'orologio a passi (anche i metodi in nanosecondi leggono il copione): il test della scadenza fra due blocchi non scrive più il primo blocco, e un mutante che tiene l'import parziale sopravvive solo sul branch | Metodi in nanosecondi costanti nell'orologio del test (verificato: verde, uccide il mutante); oppure `applyImport`/`lookupExisting` in `Effect.fnUntraced`. Tocca un test o D9: decide Omar | no |
| MINOR | v8, v2 | `packages/server/src/effect/db.ts:46` | `DbError` con `message: Schema.String` lancia se il driver rifiuta con un `Error` il cui `message` non è una stringa (su `dev` dava `DbError`; ora un *defect*, e `tx.failed` non si segna). Nessun driver reale lo fa, ma è la lettera di AC10 | `String(cause.message)` e un caso in `db.errors.test.ts` | no |
| MINOR | v10 | `AGENTS.md:58` | La frase su `scripts/check-assertions.mjs` resta dopo che T21 toglie lo script (D11) | Toglierla nello stesso commit; il sorgente nelle note | no |
| MINOR | v10, v1 | `AGENTS.md:52`, §2 di `migrazione-effect.md`, AC11 | La precedenza fra "esportata ⇒ `Effect.fn`" e "per elemento ⇒ `fnUntraced`" non è detta; il §2 non nomina le costanti `<nome>Layer` né le eccezioni `fnUntraced`; AC11 non nomina `readSession` | Una frase in `AGENTS.md`, il §2 completo, la riga nel registro della SPEC | no |
| MINOR | v10, v9, v2 | `IMPLEMENTATION-NOTES.md` | Le differenze note di T19 (copie di `alert` e `tags`, ordine delle chiavi, i due casi di input malformato) sono solo nel log; la tabella degli AC dice ancora "AC9–AC11 non iniziati"; D7 non è nelle note | Aggiornare le note; D7 nella descrizione della PR | no |
| MINOR | v10 | `brain/domains/crm/concepts/operatore.md:60` | Dice ancora `Data.TaggedError` | Una parola | no |
| NIT | v5 | `apps/api/smoke.mjs` | Nessun test né lo smoke passa da `cronLayer` (provato a mano sul bundle: 503 e 401 come su `dev`) | Una chiamata a `/internal/cron/<job>` nello smoke | no |
| NIT | v1 | `services/auth`, `oidc.ts` | Quattro mutanti delle regole di login sopravvivono su `dev` e sul branch (`EmailTaken`, `!email`, `toLowerCase`, `algorithms`) | Test in un seguito | sì |
| NIT | v2 | `contact/errors.ts:17-26` | `payloadOf` accetta `Schema.Any` | Rifiutare `any` nel controllo | no |
| NIT | v2, v3, v9 | errori con campi | `_tag` è ora la prima chiave (`JSON.stringify`, `inspect`); `alert` e `tags` sono copie | Nessuno: nessuno li legge | no |
| NIT | v3, v4 | log | `Cause.pretty` aggiunge due righe `at <area.nome>` dentro le funzioni con traccia; Sentry riceve lo stesso evento | Nessuno (AC11) | no |
| NIT | v4 | `analytics/financed.ts:110` | `financedTotal` e `financedAverage` condividono lo span `analytics.financedOverWindows` | Facoltativo: un nome per funzione | no |
| NIT | v4 | `SPEC.md:126` | AC11 dice "almeno 74" su `dev`; oggi sono 73 | Aggiornare il numero | no |
| NIT | v8 | `effect/_test/db.db.test.ts` | Nessun test fissa il *defect* di `lockCustomer` fuori da una transazione (già su `dev`) | Un caso `it.effect` | sì |

### What passed

- **Auth (v1):** 30 mutanti sull'auth danno gli stessi test falliti su `dev` e sul branch; `cronLayer`/`importRouteLayer` in 75 combinazioni di ambiente e header e il bundle reale (cron, import, sessione con e senza cookie) rispondono byte per byte come su `dev`.
- **AC10 (v2):** 59 classi con 449 input, versione `Data` contro versione `Schema`: stessi `_tag`, `message`, `instanceof`, `cause` (stessa istanza), `Equal`/`Hash`, `Exit`; nessuno dei 119 punti di costruzione può passare un valore che il costruttore nuovo rifiuta; i test di T19 sono verdi su `Data` e falliscono su ogni mutante che restringe uno schema.
- **Bordi (v3):** 56 traduzioni tRPC, il corpo HTTP, `readContactError` nelle due forme, `runTrpc` e l'evento di Sentry identici su `dev` e sul branch.
- **AC11 (v4):** nessun lettore di `Cause` in produzione cambia esito; il logger non stampa gli span; il retry di `import.enqueue` ripete tutto il corpo come prima; tipi e generics uguali; `gen-wrappers` trova solo `transaction`; le due deviazioni `fnUntraced` servono (il mutante che le traccia rompe esattamente quei due test).
- **AC9 (v5):** id unici, letti per stringa, una copia per bundle; nessun secondo client del database, nessun import circolare; il mock di Sentry uccide tre mutanti e il reporter vero non viene mai costruito in 102 file di test.
- **Configurazione (v6):** le variabili lette al caricamento dei moduli sono le stesse su `dev` e sul branch; scelta della coda e dello storage identiche cambiando l'ambiente fra un'esecuzione e l'altra; le credenziali non compaiono negli errori.
- **AC5 (v7):** lo script passa con 321 eccezioni, tutte usate; le 8 di T18 sono solo titoli, le 313 di T19 solo nei 17 file nuovi; gli stessi 353 test nei 29 file modificati, più gli 89 nuovi.
- **Transazioni (v8):** rollback, deadlock, transazione annidata e `lockCustomer` identici su `dev` e sul branch contro Postgres; `query` e `lockCustomer` senza span.
- **Migrazioni (v9):** stesso risultato, exit code e messaggio in cinque scenari reali.
- **AC14 (v10):** `next lint`, `next build` con i placeholder, `tsc`, `db:check`, `api:build`, `api:smoke` verdi; `Schema` non arriva nei bundle del browser.

### Per-concern verdicts

| Verifier | Concern | Verdict | Note |
|---|---|---|---|
| v1 | Auth (D4) | SHIP | 30 mutanti, parità |
| v2 | Costruzione degli errori (AC10) | SHIP | `DbError.message` |
| v3 | Traduzione ai bordi | SHIP | |
| v4 | `Effect.fn` (AC11) | DO NOT SHIP | `apply.db.test.ts:770` |
| v5 | Servizi e layer (AC9) | SHIP | |
| v6 | Configurazione | SHIP | |
| v7 | Asserzioni (AC5) | SHIP | |
| v8 | Transazioni | SHIP | `DbError.message` |
| v9 | Migrazioni | SHIP | |
| v10 | Documenti e gate | SHIP | Note e `AGENTS.md` prima della PR |

### Human Review Checklist

1. **Il test di D8.** Omar sceglie fra: (a) metodi in nanosecondi costanti nell'orologio a passi di `apply.db.test.ts` (cambia la fixture di un test, nessuna asserzione); (b) `applyImport` e `lookupExisting` in `Effect.fnUntraced`, terza deviazione da D9. Poi il mutante di v4 (`timeLeft` che ignora la scadenza dopo un blocco scritto) deve fallire.
2. **`DbError.message`** con `String(cause.message)` e il suo caso di test.
3. **I documenti:** `AGENTS.md` (precedenza fra `Effect.fn` e `fnUntraced`, la frase sullo script), il §2 di `migrazione-effect.md`, `operatore.md`, le note (AC, differenze di T19, D7), il numero di AC11.
4. **Rifare** lo script di AC5 e la suite intera con `TEST_DATABASE_URL`, a macchina scarica.
5. **Togliere lo script** (D11) con il sorgente nelle note, dopo l'ultimo controllo.
6. **La prova su `mito_local`** (T8.4), che chiede un `.env.development.local` locale.
7. **Leonardo** rivede i file dell'auth (D4), poi la PR con D7 nella descrizione e la CI verde.

**Stato del checklist (2026-10-28):** 1 deciso da Omar, strada (a) (D18 nel piano): il mutante di v4 ora fa fallire il test; 2 e 3 fatti (`a922139`); 4 fatto (script `ok` con 323 eccezioni, suite intera a macchina scarica); 5 fatto; 6 e 7 aperti.

### Acceptance criteria check

| Criterion | Met / Unmet / Blocked | Notes |
|---|---|---|
| AC5 | Met alla lettera; un test svuotato | Nessuna asserzione cambiata, ma `apply.db.test.ts:770` non controlla più quello che diceva |
| AC9 | Met | 0 `*Live`, id `@mito/` |
| AC10 | Met nei fatti | `DbError.message` da correggere per la lettera |
| AC11 | Met | Solo `transaction`; due deviazioni documentate |
| AC12 | Parziale | `AGENTS.md` e §2 da completare |
| AC13 | Met | §8: nessun debito |
| AC14 | Met in locale | La CI della PR non è partita |

### Notes for docs-maintenance

- **Durable findings** per il §8 della roadmap o `brain/tech-debt/crm/effect-4.md`: i quattro mutanti dell'auth che sopravvivono già su `dev`; il *defect* di `lockCustomer` fuori transazione senza test.
- **Pagine di dominio da collegare:** `brain/domains/crm/concepts/operatore.md` (il tipo degli errori).

## [Round: 2026-10-27 — PR 3, @effect/vitest]

### Verdict

**DO NOT SHIP** · impact: critical

La conversione è sana: 9 passate su 11 danno SHIP, e i mutanti nel codice di produzione (43 di v4, 21 di v5) fanno fallire gli stessi test su `dev` e sul branch. Le due obiezioni:
- **Due test persi sul `TestClock` fermo (v6).** `queue.test.ts:223` avvia fibre staccate sotto `it.effect` e non coglie più un ritardo di pulizia invertito che su `dev` coglieva (AC8 vuole `it.live`). I due test del budget di `processDueAlerts.db.test.ts:57,85` non vedono più il tempo che passa.
- **AC5 allargato senza la firma di Omar (v11, v2).** La riga del registro delle decisioni che ammette `expect(await X)` → `expect(yield* X)` è firmata "Supervisore"; il corpo di AC5 elenca ancora solo la regola stretta, e la frase "cambia solo `await` → `yield*`" non dice delle 8 coppie con `provideServer`/`Effect.exit` e `Fiber.join`.

### Coverage

- **Passate eseguite:** 11/11 (v1, v2, v4, v5, v6 sul modello più forte; v3, v7, v8, v9, v10, v11 su sonnet).
- **Passate saltate o fallite:** nessuna.
- **UI pass:** non prevista, nessuna superficie visibile cambia.

### Findings

| Severity | Verifier | Location | Finding | Fix | Durable? |
|---|---|---|---|---|---|
| MAJOR | v6 | `services/import/_test/queue.test.ts:223` | Fibre staccate sotto `it.effect`: con `now` e `at` entrambi 0 il ritardo è 0 comunque; il mutante `now - at` al posto di `at - now` (queue.ts:148) muore su `dev`, sopravvive sul branch, muore con `it.live` | `it.live` | no |
| MAJOR | v11, v2 | `SPEC.md` (AC5 e il registro) | AC5 allargato dal supervisore: la riga non è di Omar, il corpo di AC5 non elenca la categoria nuova né le forme `provideServer`/`Fiber.join` | Conferma di Omar, poi AC5 e il piano aggiornati | no |
| MAJOR | v11 | `AGENTS.md:53` | Dice "mai un `Clock` scritto a mano" (AC8 ne tiene due) e "`it.live` se confronta il `Clock` con `now()`" (nessun test lo fa); manca la regola che morde, `TestClock.setTime(Date.now())` per le scadenze lette dal `Clock` | Riscrivere le tre frasi | no |
| MAJOR | v11 | roadmap §8 riga 208, log di T17 | "Nessun debito" non nomina le factory di `vi.mock` con `runSync` né i due orologi a passi; il log di T17 non ha la riga del debito | Completare la frase come "decisioni, non debito"; riga nel log | no |
| MAJOR | v1 | `scripts/check-assertions.mjs:213,270` | Una tabella `each` passata per nome (`it.each(cases)`) si confronta per nome: cambiare `cases` passa. Nella PR 3 l'unica toccata (`writers` di `operatorLock.pg`) è stata verificata a mano | Risolvere la dichiarazione nello stesso file; caso nell'harness. Prima della PR 4 | sì |
| MINOR | v6 | `contact/_test/processDueAlerts.db.test.ts:57,85` | Il budget non vede il tempo: il mutante `start - now` passa sul branch (su `dev` no); il confine `>` invece muore solo sul branch | `it.live`, o un caso con `TestClock` che supera il budget | no |
| MINOR | v1 | script | Una catena spostata in un test `it.fails`/`it.skip` dello stesso file passa; le rinomine fuori dai fusi utc/rome o in `dist/` passano; `.spec.*` fuori da `_test` non è controllato; `settledBy` guarda solo `resolves`/`rejects` | Titoli e modificatori del test nella chiave; leggere `vitest.config.ts` | sì |
| MINOR | v11 | `SPEC.md:118`, `PLAN.md` | Su `dev` il grep di AC8 trova 50 file, non 49; AC5 parla di 14 `resolves`/`rejects` annotati, ma ne è cambiato uno (gli altri restano bordi); le note dicono T13–T16 in corso | Aggiornare | no |
| NIT | v4, v5, v8, v2 | `session.db.test.ts:2`, `deactivate.db.test.ts:2`, `roles.batch.db.test.ts:2` | `import {} from "@effect/vitest"` vuoto | Togliere | no |
| NIT | v6 | `concurrency.pg.test.ts:328` | Il commento dice "l'unica eccezione di AC8" | "una delle due" | no |
| NIT | v5 | `deactivate.db.test.ts:742,775,1015` | `vi.spyOn(console, "error")` non zittisce più niente sotto `it.effect` | Toglierlo in una pulizia | no |
| NIT | v8 | test di analytics | `at` copiato quattro volte | Facoltativo: in un helper | no |

### What passed

- **AC4 (v10):** `@effect/vitest` 4.0.6 come `effect`, una sola copia di `effect`, i peer soddisfatti; nessun import di `@effect/vitest` fuori dai test né nei bundle.
- **AC5 (v1, v2):** lo script corretto regge 75 attacchi sui casi di AC5; le 216 eccezioni sono 105 coppie identiche a livello di token dopo le riscritture ammesse, più le 6 righe del test nuovo; ogni helper diventato un Effect restituisce lo stesso valore, con lo stesso istante e lo stesso layer.
- **AC8 (v6, v8):** gli istanti di `fixedClock` diventano gli stessi `TestClock.setTime`; i `setTime(Date.now())` servono (toglierli rompe 7 test); i test della console di `ServerLive` sono `it.live` e mordono; i due orologi a passi si comportano come prima; i bordi del grep sono quattro e sono veri bordi.
- **Parità (v3, v4):** stessi nomi e stati in ogni file, i `*.pg.test.ts` girati; 566 test su 567 fanno lo stesso numero di asserzioni (l'altro è un `vi.waitFor`).
- **Auth (v5):** 21 mutanti sulle guardie (sessioni, utenti disattivati, ruoli, lock) fanno fallire gli stessi test su `dev` e sul branch; l'ordine delle corse nei test pg è invariato.
- **Isolamento (v7):** nessuna dipendenza dall'ordine introdotta, con i file e i test rimescolati su più seed.
- **`withCurrentEnv` (v9):** il test uccide sei mutanti, compreso quello che rende l'helper un'identità.
- **AC14 (v10):** lint, `tsc`, `db:check`, la suite (4415 verdi, 6 saltati), `next build` con i placeholder, `api:build` e `api:smoke` verdi in un worktree senza `.env*`.

### Per-concern verdicts

| Verifier | Concern | Verdict | Note |
|---|---|---|---|
| v1 | Script di AC5 | SHIP | Le tabelle `each` per nome da correggere prima della PR 4 |
| v2 | Eccezioni di AC5 | SHIP | La firma di Omar sulla categoria nuova |
| v3 | Parità dei test | SHIP | |
| v4 | Fedeltà d'esecuzione | SHIP | 43 mutanti |
| v5 | Test dell'auth | SHIP | 21 mutanti |
| v6 | Tempo e console | DO NOT SHIP | `queue.test.ts:223` |
| v7 | Isolamento | SHIP | |
| v8 | Helper e codice di produzione | SHIP | |
| v9 | Test di `withCurrentEnv` | SHIP | |
| v10 | Dipendenze e gate | SHIP | |
| v11 | Documenti e contratto | DO NOT SHIP | AC5 senza firma, `AGENTS.md`, §8 |

### Human Review Checklist

1. **AC5.** Omar decide se accettare la categoria `expect(await X)` → `expect(yield* X)` (con `runServer(P)` → `P.pipe(provideServer, Effect.exit)` e Promise → `Fiber.join`). Se sì, la riga del registro porta il suo nome e il corpo di AC5 la elenca; se no, gli helper tornano a runner a Promise e AC8 resta scoperto in quei file.
2. **AC8.** `queue.test.ts:223` e i due test del budget di `processDueAlerts` in `it.live`; rifatti i mutanti di v6 (`now - at`, `start - now`).
3. **`AGENTS.md`**, il §8 della roadmap, i numeri della SPEC e le note corretti come nei findings.
4. **Lo script**: le tabelle `each` passate per nome, con un caso nell'harness, prima che la PR 4 lo usi come gate.
5. **Rifare** `node scripts/check-assertions.mjs assertions origin/dev HEAD --exceptions brain/specs/crm/effect-4/eccezioni-pr3.txt` e la suite intera con `TEST_DATABASE_URL`.
6. **La CI della PR** verde, poi il merge in `dev`.

**Stato del checklist (2026-10-27):** 1 firmato da Omar (D17 nel piano, AC5 nella SPEC); 2–5 fatti (`b4b76b4`, `59280de`, `e44d4b1`: mutanti di v6 uccisi, harness 41/41, script `ok` con 218 eccezioni, suite 4415 verdi); 6 sulla PR.

### Acceptance criteria check

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC4 | Met | `@effect/vitest` 4.0.6 |
| AC5 | Met nei fatti; da firmare | Nessuna asserzione cambia di valore; la categoria `await` → `yield*` aspetta Omar |
| AC8 | Unmet | `queue.test.ts:223` sotto `it.effect` con fibre staccate; il resto Met |
| AC12 | Unmet | `AGENTS.md` contraddice AC8 in due punti |
| AC13 | Unmet | Il §8 non è completo; manca la riga nel log di T17 |
| AC14 | Met in locale | Tutti i gate in un worktree pulito; la CI della PR non è partita |

### Notes for docs-maintenance

- **Durable findings** per `brain/tech-debt/crm/effect-4.md`, se restano dopo il merge: i buchi dello script di AC5 elencati da v1 (tabelle per nome, catene spostate in test `fails`/`skip`, rinomine nei progetti dei fusi).
- **Pagine di dominio da collegare:** nessuna (strumenti di test).

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

1. **AC3.** Decidi se accettare il cambio di formato dei titoli `each`. Se sì, AC3 nella SPEC va corretto con l'eccezione e i 12 file. *Fatto il 2026-10-27: Omar lo accetta, AC3 è corretto.*
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
| AC3 | Unmet (alla lettera) → Met dopo la correzione | Ambiente, fuso, pool e timer uguali per ogni file; gli stessi test e stati. I titoli `each` cambiano forma in 12 file: AC3 corretto il 2026-10-27 per accettarlo |
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

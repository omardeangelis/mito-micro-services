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

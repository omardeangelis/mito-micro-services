---
domain: crm
type: review
scope: spec
spec: gestione-operatori
review_target: "spec implementation, per PR (un round per PR)"
base_ref: claude/great-carson-o6qn17-pr1
head_ref: claude/great-carson-o6qn17-pr2
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/gestione-operatori/RUBRIC]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/gestione-operatori/PLAN]]"
  - "[[specs/crm/gestione-operatori/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-10-22
updated: 2026-10-22
---

# Review Report: gestione-operatori

Un round per PR. Il frontmatter riporta l'ultimo round.

## [Round: 2026-10-22 — PR 2, user e operator su Effect]

### Verdict

**SHIP** · impact: critical. Serve la revisione di Leonardo prima del merge (AC29a, checklist sotto).

### Coverage

- Rubric passes run: 4/4 (v1 e v3 sul modello più forte, v2 e v4 su quello bilanciato).
- Passes skipped or failed: nessuno.
- UI pass: not chartered (diff solo server).
- Gate di CI, eseguiti sulla testa `ac85739~1` (prima dei test aggiunti dopo la review): `next lint`, `tsc --noEmit`, `pnpm run test --run` con i `*.pg.test.ts` (162 file, 2520 test), `pnpm build`, `pnpm api:build`, `pnpm api:smoke`, tutti verdi.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MINOR | v1, v2, v3: percorso di un errore del database | `packages/server/src/effect/trpc.ts:46-51`, raggiunto da `api/trpc.ts:145-149` e dalle procedure di `operator` e `user` | Su un errore del driver il `cause` del `TRPCError` è ora un `DbError` invece del `PostgresError`: per Sentry la catena diventa `TRPCError → DbError → PostgresError`, con gruppi nuovi, e `runTrpc` scrive una riga `Effect.logError` in più. Codice, messaggio e corpo della risposta sono identici (v3 l'ha misurato con l'handler HTTP vero) | Nessuna correzione: è il comportamento di `runTrpc` già in uso da `task`, `customer`, `chat` sulla base. Da sapere al rilascio: possibili issue Sentry nuove per gli stessi errori | no |
| MINOR | v1: test | `api/_test/procedures.db.test.ts` | Nessun test copriva un ADMIN senza operatore su un `adminProcedure`, né il messaggio di `BAD_REQUEST` | **Chiuso** in `ac85739`: due casi aggiunti, verdi anche sul codice della PR 1 | no |
| MINOR | v3: test | `api/_test/driverError.db.test.ts` | Nessun test per un errore del driver in una procedura di `operator` e per il JSON rovinato di `getUserPreference` | **Chiuso** in `ac85739`: due casi aggiunti, verdi anche sul codice della PR 1. Un errore del driver dentro il middleware stesso resta senza test: per provocarlo bisogna rompere la tabella `operators` | no |
| MINOR | v4: forma di AC24 | router `operator` e `user` | AC24 scrive `runTrpc(program, operatorErrorToTrpc \| userErrorToTrpc)`, ma i servizi falliscono solo con `DbError` e `runTrpc` non accetta un mapper: `userErrorToTrpc` non esiste | Nessuna: il tipo di `runTrpc` lo impone. Annotato in `IMPLEMENTATION-NOTES.md` | no |
| MINOR | v4: copertura | `services/operator/_test/queries.db.test.ts` | `getOperatorById` e `getPublicOperator` non hanno test di servizio; li coprono i test del router | Facoltativo | no |
| NIT | v3 | `services/operator/roles.ts` | Resta l'asserzione `!` di `changes.find(...)!.role`, che non può fallire | Si toglie con la transazione della PR 4 (T4.4) | no |
| NIT | v3 | `effect/db.ts` (`toDbError`) | Un `DrizzleQueryError` senza `cause` porterebbe SQL e parametri nel messaggio, prima e dopo la PR | Rischio preesistente, il client pg imposta sempre il `cause` | no |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1: permessi | `protectedProcedure` invariato; `NotAnOperator` → `TRPCError({ code: "BAD_REQUEST" })` come prima; `adminProcedure` resta dopo il controllo dell'operatore e lo impongono i tipi (`ctx.actor` esiste solo dopo); il ruolo viene dalla stessa riga `users` (enum `notNull`), quindi non può differire dalla vecchia seconda query; i test girano davvero sul percorso nuovo (mock di `@mito/db` dentro `ServerLive`); i mutanti "senza controllo del ruolo" e "altro codice per NotAnOperator" sono presi |
| v2: parità delle procedure | I test di caratterizzazione della PR 1 hanno diff vuoto e sono verdi; stesse query, stranezze di AC26 conservate, `.returning()` tolto senza effetto osservabile, `updateOperatorsRole` sequenziale e fuori transazione, id duplicati come prima, `retrieveUserPrefercence` spostata identica |
| v3: errori | Stato HTTP e corpo identici fra vecchio e nuovo codice per errore del driver in procedura, nel middleware, JSON rovinato e `NotAnOperator`; nessun SQL né parametri; `dropExpectedTrpcErrors` classifica come prima; `contactErrorFromCause` null come prima |
| v4: convenzioni e gate | Niente `drizzle-orm` nei router `operator` fuori da `_test/`; `TRPCError` solo nei `*ErrorToTrpc` e in `effect/trpc.ts`; Drizzle solo dentro `query`; nessun Next.js in `packages/server`; `server-only` regge `api:build` e `api:smoke`; i test nuovi passano dall'interfaccia pubblica |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Parità dei middleware dei permessi | SHIP | Ogni ramo del codice vecchio ha il suo corrispondente; l'unica differenza è sul percorso di un errore del database e non cambia chi entra |
| v2 | Parità delle procedure migrate | SHIP | Nessun input con un valore di ritorno o un effetto sul database diverso |
| v3 | Parità del percorso degli errori | SHIP | Il client vede lo stesso; cambia solo la telemetria, come per ogni procedura già su `runTrpc` |
| v4 | Convenzioni e gate | SHIP | Nessun problema bloccante; due note facoltative |

### Human Review Checklist

Per Leonardo (AC29a: la PR cambia i middleware dei permessi), prima del merge in `dev`:

1. Leggere `packages/server/src/api/trpc.ts` da riga 133: `protectedProcedure` è identico, `operatorProcedure` passa da `resolveActor` (`services/auth/actor.ts`), `adminProcedure` controlla `ctx.actor.role`.
2. Confermare che `operatorErrorToTrpc` (`services/operator/errors.ts`) restituisce `BAD_REQUEST` senza messaggio né `cause`, come prima.
3. Lanciare `pnpm run test --run packages/server/src/api packages/server/src/services` e verificare che `git diff claude/great-carson-o6qn17-pr1 -- packages/server/src/api/_test packages/server/src/api/routers/*/_test` mostri solo righe aggiunte.
4. Decidere se le issue Sentry nuove per gli errori del database (finding MINOR 1) vanno annunciate al rilascio.
5. Merge in `dev` fuori da una release di cutover GCP.

### Acceptance criteria check

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC24 | Met (per la PR 2) | Router `operator` senza Drizzle fuori dai test; `getUserPreference` adapter; le `update*` non migrate. Il controllo su `user` vale dopo la P2 |
| AC25 | Met | `UNAUTHORIZED` per i disattivati arriva con la PR 4 |
| AC26 | Met | Test della PR 1 con diff vuoto, verdi |
| AC28 | Met | |
| AC29 | Met | Gate locali verdi; CI su GitHub quando si apre la PR |
| AC29a | Pending | Revisione di Leonardo |

### Notes for docs-maintenance

- Durable findings: nessuno nel debito della feature. La differenza di telemetria su `runTrpc` è comune a tutta la migrazione: va in [[chore/migrazione-effect]] §7 se si decide di correggerla.
- Domain pages that should backlink this review: nessuna ancora (`brain/domains/crm/` non esiste).

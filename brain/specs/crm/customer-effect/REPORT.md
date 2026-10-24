---
domain: crm
type: review
scope: spec
spec: customer-effect
review_target: branch claude/migrazione-customer
base_ref: bc7aa2e
head_ref: 7cb62a9
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/customer-effect/RUBRIC]]"
  - "[[specs/crm/customer-effect/SPEC]]"
  - "[[specs/crm/customer-effect/PLAN]]"
  - "[[specs/crm/customer-effect/IMPLEMENTATION-NOTES]]"
ingested: true
last_ingested: 2026-10-24
created: 2026-10-24
updated: 2026-10-24
---

# Review Report: Router `customer` su Effect (passo 2 della migrazione)

## Verdict

**SHIP** · impact: critical

Al primo giro il verdetto era **DO NOT SHIP**: due MAJOR, uno di v5 (nessun test fissava un input parziale di `updateCustomerFromDashboard`) e uno di v7 (TD8 a `[OPEN]` prima del merge, contro AC12). v7 rifatto dà SHIP. v5 rifatto ha trovato altri buchi nei test due volte: l'ordine di `getCustomerUnderReview` (MAJOR), poi righe estranee, parametri di `getAllCustomers` e `id` inesistenti (tre MAJOR). Tutti corretti con test aggiunti, verdi sul codice di `bc7aa2e`. I 42 mutanti che v5 aveva lasciato vivi nell'ultimo giro ora muoiono tutti, provati dall'orchestratore con lo script e le liste di v5. Un quarto giro di v5 non è stato fatto: è al punto 6 della checklist.

Nessun BLOCKER in nessun giro. I quattro passaggi sul codice (v1–v4) danno SHIP al primo giro, ciascuno con un confronto fra base e branch.

## Coverage

- Rubric passes run: 7/7. v1–v4 sul modello più forte, v5 e v6 su sonnet, v7 su haiku. v5 rifatto due volte e v7 una, dopo le correzioni.
- Passes skipped or failed: nessuno.
- UI pass: not chartered. Il diff non tocca codice renderizzato (AC15).

## Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v5, integrità dei test (giro 1) | `writes.db.test.ts` | `updateCustomerFromDashboard` sempre con tutti i 14 campi: il mutante che scrive `null` nelle colonne non passate sopravviveva | Corretto in `2ab01de` e `c2ed77a`: due input parziali con la riga intera. Mutanti uccisi | no |
| MAJOR | v7, documenti e debito | `brain/chore/migrazione-effect.md:143` | TD8 a `[OPEN]` prima del merge; AC12 vuole `[PREVISTO]` | Corretto in `2ab01de`: `[PREVISTO]`, diventa `[OPEN]` al merge in `dev` | no |
| MAJOR | v5 (giro 2) | `queries.db.test.ts`, `getCustomerUnderReview` | Gli id del fixture si ordinavano come gli `updatedAt`: senza `orderBy` restava verde | Corretto in `c2ed77a`: id in ordine inverso. Mutanti uccisi | no |
| MAJOR | v5 (giro 3) | `queries.db.test.ts` | `getAllPraticaByCustomer` e `getAllCustomerForPratica` senza righe estranee: togliere i filtri restava verde | Corretto in `7cb62a9` | no |
| MAJOR | v5 (giro 3) | `getAllCustomers.*.db.test.ts` | Colonne d'ordine sostituibili con `id`, direzione di default, precedenza di `onlyMe` e `operatore`, array vuoti, colonne di ricerca sbagliate | Corretto in `7cb62a9` con `getAllCustomers.params.db.test.ts` | no |
| MAJOR | v5 (giro 3) | `writes.db.test.ts`, `writes.pg.test.ts` | `handleCustomerBlackList` e `updateLastEdit` senza un caso con `id` inesistente: un errore "non trovato" aggiunto dal refactor restava verde | Corretto in `7cb62a9`, su tutti e due i driver | no |
| MINOR | v5 | `writes.pg.test.ts` | Righe con `id` controllate con `toMatchObject`; il seed lascia molte colonne `null` | Righe intere in `2ab01de`; le colonne lasciate fuori le fissa `writes.db.test.ts` | no |
| MINOR | v5 | test di priorità dei codici, transizioni di `blackListStatus`, stringhe vuote e con spazi, `vatCode` con spazi, chiavi in più nell'input | Mutanti sopravvissuti | Corretti in `c2ed77a` e `7cb62a9` | no |
| MINOR | v5 | `filterOptions.db.test.ts` | L'`ORDER BY` delle quattro liste distinte non si vede su tabelle piccole (Postgres fa `Sort` + `Unique`) | Limite accettato, in `IMPLEMENTATION-NOTES.md`; `desc` è ucciso, e il codice è identico (v2) | sì |
| MINOR | v7 | `brain/domains/crm/concepts/filtro-avanzato.md:60`, `flows/filtro-avanzato-di-clienti-e-pratiche.md:66` | Citano ancora `api/routers/utils/advancedFilters.ts` (parte di AC16) | Lo corregge `docs-maintenance`, prima del merge | no |
| MINOR | v7 | `migrazione-effect.md` §1 contro §5, riga 2 del §4, log di T10, deviazioni | Testi vecchi o imprecisi | Corretti in `2ab01de` e nel commit di questo report | no |
| NIT | v1, v2, v3 | `effect/trpc.ts` | Su un errore del database, il `cause` lato server è un `DbError` (prima l'errore del driver) e `runTrpc` scrive una riga di log. La risposta al client è identica byte per byte | Già messo in conto nel PLAN §3. Cambia solo il raggruppamento in Sentry | sì |
| NIT | v6 | `services/customer/list.ts:20-24` | `CUSTOMER_FILTER_QUERY_MAP` è un import di valore da un modulo del dominio che usa zod a runtime | Come prima del passo; da ricordare quando il dominio passerà a `Schema` (L3) | sì |
| NIT | v4 | `services/customer/list.ts:33-50` | `CustomerListQuery` è scritto a mano: un campo nuovo nello zod non è obbligato a entrare nel tipo | Lo vuole AC4. `tsc` controlla che lo zod resti assegnabile al tipo | no |

## What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1, autorizzazione e contratto | Righe `export const X = <proc>Procedure` identiche fra base e branch (7 protected, 10 operator, 1 admin). `inferRouterInputs` e `inferRouterOutputs` stampati con l'API di TypeScript sulla base e sul branch: 36 righe identiche. Forme degli errori via HTTP (`getErrorShape`) identiche. Sei mutanti su guardie e traduzione degli errori, tutti uccisi |
| v2, letture | Confronto fra base e branch su 958 casi (300 combinazioni di codici, 500 input della lista, tutti gli id, le opzioni dei filtri): SQL, parametri, righe, ordine ed errori identici, su PGlite e su Postgres. Cinque mutanti di controllo, tutti visti dal confronto |
| v3, scritture | 21 casi provati sulla base e sul branch, in-process e via HTTP, su postgres-js: codice, messaggio, stato HTTP e corpo identici; stessa `RowList`. Nessuna regola dei lock cambiata |
| v4, input non fidato | `advancedFilters.ts` rinominato al 98% (cambia solo l'import), test al 100%. Quattro mutanti (escape tolto da tutte e due le liste, filtri avanzati scollegati, `sqlFilter` passato a `sql.raw`), tutti uccisi da test che c'erano già |
| v5, integrità dei test | Verdi sul codice di `dac26d9` e sul branch. Solo `createTestCaller`; la matrice 11/7 è esatta; in CI il file `pg` non si salta. Nessuna asserzione dei test che c'erano a `bc7aa2e` è cambiata |
| v6, livelli e perimetro | I `grep` di AC4, AC5, AC6, AC13, AC14 e AC15 vuoti. Niente `next/*` nuovo in `packages/server`. `api:build` e `api:smoke` verdi in un worktree pulito |
| v7, documenti e debito | TD8 copre tutte le stranezze di AC9 e i due casi di AC10, ognuna con una correzione, ed è `[PREVISTO]`. Il conteggio di TD6 (32) è giusto. §5, §1 e la riga 2 del §4 sono aggiornati |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Autorizzazione e contratto degli adapter | SHIP | Nessuna differenza in nome, middleware, input, output, codice e messaggio di errore nelle 18 procedure |
| v2 | Equivalenza delle letture | SHIP | 958 casi identici sui due driver; solo il `cause` lato server cambia |
| v3 | Equivalenza delle scritture | SHIP | Stesse colonne, stesso `updatedAt`, stessi errori e risultati del driver, in-process e via HTTP |
| v4 | Input non fidato, SQL injection | SHIP | Spostamento esatto; ogni mutante di sicurezza ucciso da un test che c'era già |
| v5 | Integrità dei test di caratterizzazione | DO NOT SHIP nei giri 1–3; MAJOR corretti | Ogni sopravvissuto ora è ucciso (42/42 nell'ultimo giro, rifatti dall'orchestratore). Un quarto giro non è stato fatto |
| v6 | Livelli, portabilità, perimetro | SHIP | Ogni criterio verificato con i `grep` della SPEC; il bundle del backend gira |
| v7 | Documenti e debito tecnico | SHIP (giro 2) | Resta il percorso nelle due pagine del dominio, che corregge `docs-maintenance` |

## Human Review Checklist

1. **I middleware.** `git diff bc7aa2e..HEAD -- packages/server/src/api/routers/customer/{GET,PUT,POST}/index.ts | grep -E '^[-+]export const'`: le righe tolte e aggiunte hanno lo stesso middleware (7 `protectedProcedure`, 10 `operatorProcedure`, `bulkUpdateCustomers` su `adminProcedure`).
2. **Il traduttore dei filtri.** `git diff -M bc7aa2e..HEAD -- packages/server/src/shared/advancedFilters.ts packages/server/src/shared/sql.ts`: cambiano solo l'import `./index` → `./sql` e la rimozione di `lower` e `upper`.
3. **I test su Postgres in CI.** Nella CI della PR, il job Test deve mostrare `writes.pg.test.ts` e `shared/_test/advancedFilters.pg.test.ts` eseguiti, non saltati.
4. **Tutti i gate verdi**, compresi `pnpm db:check`, `pnpm build`, `pnpm api:build` e `pnpm api:smoke`.
5. **Leonardo** guarda i test di AC9 su `insertCustomer` (`writes.db.test.ts`): fissano un buco di permessi già noto (ogni utente con sessione può creare un cliente con un `operatorId`), che va corretto in una PR a parte (TD8 (e)).
6. **Facoltativo:** un quarto giro del passaggio v5, se si vuole un'altra caccia ai mutanti sopravvissuti dopo `7cb62a9`.
7. **Prima del merge:** `docs-maintenance` sulla cartella, che aggiorna i percorsi delle due pagine del dominio (AC16). Al merge, TD8 passa a `[OPEN]`.

## Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1 | Met | `grep` vuoto (v1, v6) |
| AC2 | Met | Confronti di v1, v2 e v3 |
| AC3 | Met | `TRPCError` solo in `services/customer/errors.ts` |
| AC4 | Met | `grep` vuoto; tipi del servizio o del dominio importati come `type` |
| AC5 | Met | Nessun import da `api/`; servizi con parametri espliciti |
| AC6 | Met | Nessun `server-only` in `services/customer/` |
| AC7 | Met | Righe intere per le 18 procedure e per le 4 scritture, rafforzate dopo la review |
| AC8 | Met | `procedures.db.test.ts` e `queries.db.test.ts` |
| AC9 | Met | Tutte le stranezze fissate, verdi sulla base |
| AC10 | Met | `writes.pg.test.ts`, 8 test, verde sulla base |
| AC11 | Met | Nessuna asserzione preesistente cambiata; le righe cambiate sono in test di questo branch (eccezione nominata nelle note) |
| AC12 | Met | TD8 `[PREVISTO]`, `[OPEN]` al merge |
| AC13 | Met | Utility in `shared/`, test verdi, `utils/` tolta |
| AC14 | Met | `getCustomerByFC`, `lower` e `upper` tolti |
| AC15 | Met | Solo il commento di `customerSearch.ts` |
| AC16 | Unmet in part | [[chore/migrazione-effect]] aggiornato; le due pagine del dominio aspettano `docs-maintenance` |
| AC17 | Met | Gate verdi (dettaglio in `IMPLEMENTATION-NOTES.md`) |

## Notes for docs-maintenance

- Durevoli, da portare nel debito: il limite dell'`ORDER BY` delle liste distinte nei test; il `cause` di un errore del database ora è un `DbError` (raggruppamento in Sentry); la dipendenza a runtime da zod attraverso `CUSTOMER_FILTER_QUERY_MAP`, da ricordare per L3.
- Le due pagine del dominio che citano `api/routers/utils/advancedFilters.ts` vanno portate a `packages/server/src/shared/advancedFilters.ts`.
- TD8 contiene già le stranezze; la conseguenza su Nuovo cliente (il codice fiscale doppio non viene segnalato) è nella voce (b).

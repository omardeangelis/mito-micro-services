---
domain: crm
type: implementation-notes
spec: customer-effect
links:
  - "[[specs/crm/customer-effect/SPEC]]"
  - "[[specs/crm/customer-effect/PLAN]]"
  - "[[specs/crm/customer-effect/REPORT]]"
  - "[[chore/migrazione-effect]]"
  - "[[domains/crm/flows/controllo-dei-duplicati-di-un-cliente-nuovo]]"
  - "[[domains/crm/flows/filtro-avanzato-di-clienti-e-pratiche]]"
  - "[[domains/crm/concepts/codici-del-cliente]]"
  - "[[domains/crm/concepts/filtro-avanzato]]"
  - "[[tech-debt/crm/customer-effect]]"
ingested: true
last_ingested: 2026-10-24
created: 2026-10-24
updated: 2026-10-24
---

# Implementation Notes: Router `customer` su Effect

## Summary

- Branch `claude/migrazione-customer`, da `dev` a `bc7aa2e`, non pushato. Il primo commit (`ae5f63d`) porta SPEC, PLAN e TD8 `[PREVISTO]`.
- Un commit per fase:
  - `dac26d9`: la caratterizzazione (T1–T5), prima di ogni cambio di produzione;
  - `99e363c`: T6, utility in `shared/`;
  - `4166150`: T9, `profile.ts`;
  - `bb9e777`: T7, `list.ts`;
  - `30270b7`: T8, `queries.ts`, `filterOptions.ts` e `PracticeWithoutCustomers`;
  - `838198c`: fix di lint in un test;
  - `28ee611`: note e TD8;
  - `2ab01de`, `c2ed77a`, `7cb62a9`: le correzioni della review.
- Le 18 procedure di `customer` sono adapter dei servizi di `packages/server/src/services/customer/`, a comportamento invariato. Lo provano i test di caratterizzazione, verdi sul codice di `dac26d9` e sul branch, e i confronti fra base e branch della review.
- Review avversariale: **SHIP** dopo le correzioni. Al primo giro era DO NOT SHIP, con 0 BLOCKER ([[specs/crm/customer-effect/REPORT]]).

## Execution Mode

- Mode: `parallel`, per le wave del PLAN §10.
- Delegation: `supervised`. `complexity` → tier: `low` → haiku, `medium` → sonnet. I worker della wave 1 scrivono solo i file di test e li fanno girare sul codice di `bc7aa2e`. I mutanti li applica e li fa girare l'orchestratore, uno alla volta: i worker lavorano in parallelo sullo stesso albero, e un mutante di uno romperebbe i test degli altri.
- Escalations: nessuna. Nessun worker ha avuto bisogno di una proposta di correzione. Le correzioni della review sono andate a un worker sonnet (il terzo giro) o all'orchestratore (i primi due, pochi test).

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| `customerOperator.db.test.ts` su PGlite, prima della wave 1 | 28/28 | L'harness gira sull'albero di `ae5f63d` |
| `utils/_test/advancedFilters.pg.test.ts` con `pnpm run test:pg` | 16/16 | Il Postgres di `docker-compose.yml` (127.0.0.1:54329) è su |
| `customer/_test/` su PGlite dopo la wave 1 | 181 passati, 6 saltati | I 6 saltati sono `writes.pg.test.ts`, che il progetto di default include e salta senza database |
| `writes.pg.test.ts` con `pnpm run test:pg` | 6/6 | |
| Mutanti della wave 1 sul codice inline (`scratchpad/mutate.py`, uno alla volta, file ripristinato con `git checkout`) | 40 uccisi su 41 | Il sopravvissuto è equivalente (T1, `countDistinct` → `count`) |
| `prettier --check` sui file di test nuovi | verde | |
| Test rafforzati dopo la review, sul codice di `dac26d9` (worktree di scratchpad con i test del branch) | verdi | Giro 1: 27 + 6; giro 2: 187 + 6; giro 3: 249 + 8 (PGlite + Postgres) |
| Mutanti della review: quelli sopravvissuti a v5 nei tre giri, rifatti dall'orchestratore | tutti uccisi | Giro 1: 4 (due vivi solo sul file `pg`, dove il seed ha colonne `null`; li uccide `writes.db`); giro 2: 5 su 5; giro 3: 42 su 42 (le liste e lo script di v5) |
| Gate a `7cb62a9`, nel worktree di gate | verde | `next lint`, `tsc --noEmit`, `pnpm db:check`, `pnpm run test --run` con `TEST_DATABASE_URL` (3262 passati, 2 saltati). `pnpm build`, `api:build` e `api:smoke` sono di `838198c`: dopo cambiano solo test e documenti |
| T6, T9, T7, T8: suite intera dopo ogni task | verde | 3071 test su PGlite, 95 su Postgres; `tsc --noEmit` verde |
| T10.1, `grep` di AC1, AC3, AC4, AC5, AC6, AC13, AC14 a `30270b7` | vuoti | AC3 trova solo `services/customer/errors.ts` |
| T10.1, AC11: `git diff -M dac26d9.. -- '**/_test/**'` | solo T6 e un fix di lint | Le rinomine di T6 (un import cambiato) e `expect.any(String) as string` in `writes.db.test.ts` (`838198c`) |
| T10.1, AC15: `git diff --stat bc7aa2e.. -- src/app src/components packages/db packages/domain` | solo `customerSearch.ts` | Il commento della mappa delle colonne |
| T10.2, mutanti sui servizi (`scratchpad/mutants-services.json`) | 41 uccisi su 42 | Gli stessi di T1–T5, rimappati su `queries.ts`, `filterOptions.ts`, `list.ts`, `profile.ts`, `errors.ts` e gli adapter, più `cause` aggiunto a `PracticeWithoutCustomers`. Sopravvive lo stesso equivalente |
| T10.3, gate di CI in un worktree di scratchpad senza `.env*`, a `30270b7` | rosso su lint | `next lint` (e quindi `pnpm build`) si fermava su `no-unsafe-assignment` per `expect.any(String)` in `writes.db.test.ts`. Corretto in `838198c` con `as string`, come `customerOperator.db.test.ts:549` |
| T10.3, a `838198c` | verde | `next lint`, `tsc --noEmit`, `pnpm db:check` (Migrations OK), `pnpm run test --run` con `TEST_DATABASE_URL` (3192 passati, 2 saltati), `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke` (session 200, providers 200, export 401). `psql` non c'è su questa macchina, quindi il controllo dei database `mito_test_%` rimasti non è girato |
| T10.4, prova nel browser su `mito_local` (10.000 clienti), `next dev` del worktree di gate, sessione con una riga in `session` e il cookie in `agent-browser` | verde | Clienti (ricerca per codice fiscale, filtro per sede, elenco dei file), dettaglio di un cliente con le sue pratiche, dettaglio di una pratica (`getAllCustomerForPratica`), Profilo → blacklist (`getCustomerUnderReview`), modifica anagrafica salvata (`updateCustomerFromDashboard`, riga scritta), cliente messo in blacklist (`handleCustomerBlackList`, `review`), Nuovo cliente (`getCustomersByFiscalCodeOrVatCode` + `insertCustomer`). Nessun errore dalle procedure di `customer`. Non provata qui: `updateLastEdit` dalla chat (provata dopo, riga sotto). A fine prova, il cliente creato e la riga di sessione sono stati cancellati, e C000002 è tornato com'era |
| Dopo la review, prove nel browser di agent Sonnet a contesto pulito, `next dev` a `cec18a6` su `mito_local` | verdi | Nuovo cliente, 5 casi: codice fiscale, partita IVA o NDG già presi danno "Cliente già esistente" solo sotto quel campo e nessun `insertCustomer`; due codici di clienti diversi, errore sotto tutti e due; codici tutti nuovi, cliente creato. Nuova pratica, cliente collegato: codice fiscale o partita IVA già presi, "Cliente già presente"; codici nuovi, accettato. Chat del cliente: `updateLastEdit` parte dopo l'invio e dopo la cancellazione di una nota, `updatedAt` avanza, la risposta è `[]` (il risultato grezzo di postgres-js). A fine prova il database è com'era: righe create cancellate, `updatedAt` di C000036 rimesso, sessioni cancellate |
| Gate di CI dopo correzione, simplify e test dell'ordine, worktree di scratchpad senza `.env*` | verdi | `next lint` (dopo `prettier --write` su `queries.db.test.ts` e un import tolto), `tsc --noEmit`, `db:check`, 3175 test su PGlite e 97 su Postgres a `d07a833`, `pnpm build` a `27a3a6b`, `api:build` e `api:smoke` |

## Surprises and Decisions

- **`operatore` è `null`**, non un oggetto di `null`, per un cliente senza operatore, sia in `getAllCustomers` sia in `getCustomerUnderReview`: Drizzle collassa l'oggetto annidato. I test lo fissano con `toEqual`.
- **Il messaggio del `BAD_REQUEST`** di un utente senza operatore è `"BAD_REQUEST"`: `operatorErrorToTrpc` non ne passa uno, e tRPC usa il codice.
- **Il default di `customers.id`** è la costante scritta nella migrazione. Il `nanoid()` dello schema cambia a ogni avvio del processo, quindi il test non può confrontarli: controlla solo che il secondo insert senza `id` fallisca per chiave duplicata.
- **Due `toMatchObject` su righe** sono rimasti, tutti e due su controlli secondari: la riga del primo insert senza `id` (T3) e la riga scritta da `handleCustomerBlackList` su postgres-js (T5). La riga intera di quelle scritture la fissano gli altri test di T3, con `toEqual`.

- **Il primo salvataggio nel browser non partiva** (nessun `POST`, il modale si chiudeva). La stessa prova sulla base `bc7aa2e` (porta 3006, stesso `mito_local`) salvava. Ripetuta sul branch con una sessione nuova di `agent-browser`, salvava anche lì: era lo stato della prima sessione, aperta direttamente sull'URL del modale, non il codice.
- **Nuovo cliente non segnala il codice fiscale già presente.** Il form manda sempre il "Codice Cliente (NDG)" come `tempID`, e `getCustomersByFiscalCodeOrVatCode` con un `tempID` non vuoto cerca solo per `tempID` (AC9). Così un cliente con il codice fiscale di un altro si crea senza errore. È il comportamento di `bc7aa2e`, fissato dal test di T1 "con tempID di A e codice fiscale di B cerca solo per tempID". Corretto dopo il refactor, su richiesta di Omar (Deviations).

## Deviations From the Plan

- **`$simplify` è girato dopo la review**, su richiesta di Omar, con le query lasciate come sono (AC2). Applicato: `rejectionOf` in `src/test/caller.ts` e `customerRow` in `src/test/db.ts`, al posto delle copie nei quattro file di test nuovi; i test delle quattro tendine in un `describe.each`. Scartato: un helper unico per le quattro query delle tendine (il tipo della chiave calcolata costa più della copia); lo schema zod di `getAllCustomers` come fonte del tipo `CustomerListQuery` (AC4 vieta zod nei servizi); `touchCustomer` di `contact/guard.ts` che chiama `markCustomerUpdated` (fuori dal diff); un servizio che dica al form quali codici sono già presi (oggi il form li confronta con un `trim`, e con valori salvati senza spazi in coda il risultato è lo stesso); le copie degli helper nei file di test più vecchi.
- **La ricerca per codici vale anche per Nuova pratica**: il form dei clienti collegati (`NewPraticaForm.tsx`) usa la stessa procedura e ora dice "Cliente già presente" quando uno qualunque dei codici è già preso.
- **La ricerca per codici è corretta in questa PR**, non in una a parte come chiedono la SPEC (Fuori scope) e la regola del §4 di [[chore/migrazione-effect]]: l'ha chiesto Omar il 2026-10-24, dopo la review. È un commit a sé, dopo il refactor, quindi si può spostare in una PR sua. `findCustomersByCode` trova chi ha uno qualunque dei codici passati (`tempID`, codice fiscale, partita IVA); un codice vuoto non trova nessuno. Nuovo cliente segna "Cliente già esistente" solo sui codici già presi. I test di priorità di `queries.db.test.ts` cambiano asserzione apposta: ora fissano la ricerca per tutti i codici. TD8 (b) tiene solo il `refine` che vuole codice fiscale o partita IVA.
- **TD8 resta `[PREVISTO]` nel commit della PR.** Il PLAN (T10.6 e il NIT del §16) la portava a `[OPEN]` nel commit della PR; AC12 della SPEC dice `[OPEN]` al merge in `dev`, e vince la SPEC (rilievo MAJOR di v7). Va portata a `[OPEN]` quando la PR è unita.
- **Asserzioni cambiate in test di questo branch, dopo `dac26d9`.** Non sono asserzioni preesistenti, e AC11 vale per quelle. (1) `838198c`: `expect.any(String) as string` in `writes.db.test.ts`, un cast di tipo chiesto da `next lint`, che esbuild cancella. (2) `2ab01de`, le correzioni della review (sotto), verdi sul codice di `dac26d9`: in `writes.pg.test.ts` i due `toMatchObject` sulle righe scritte da `handleCustomerBlackList` e `updateCustomerFromDashboard` diventano confronti con la riga intera, e l'input `source` di `updateCustomerFromDashboard` passa da `inbound` (uguale al seed, quindi invisibile) a `digital`; in `writes.db.test.ts` e `queries.db.test.ts` si aggiunge un test ciascuno. Nessuna asserzione dei test che c'erano a `bc7aa2e` è cambiata.
- **Correzioni dopo la review** (verdi sia su `dac26d9` sia sul branch):
  - `writes.db.test.ts`: `updateCustomerFromDashboard` con solo `name` e `source`, che fissa la riga intera (MAJOR di v5). Uccide il mutante che scrive `null` nelle colonne non passate (`email: input.email ?? null`), che prima sopravviveva a tutti i test.
  - `queries.db.test.ts`: `tempID` di A e partita IVA di B cerca solo per `tempID` (NIT di v5). Uccide `if (input.tempID && !input.vatCode)`.
  - `writes.pg.test.ts`: le righe dopo `handleCustomerBlackList` e `updateCustomerFromDashboard` con `id` sono confrontate intere, con `updatedAt` che avanza (MINOR di v5, NIT di v3). Il seed di questo file lascia `null` molte colonne, quindi un mutante che scrive `null` in una di quelle sopravvive qui: lo uccide `writes.db.test.ts`, che parte da righe senza `null`.
  - Secondo giro di v5 (verdi su `dac26d9` con 187 test su PGlite e 6 su Postgres, e sul branch):
    - `queries.db.test.ts`: gli id del fixture di `getCustomerUnderReview` vanno in ordine inverso a `updatedAt` (`a-cliente-review` più recente di `z-cliente-blacklisted`), così l'ordine viene solo da `updatedAt` (MAJOR: togliere l'`orderBy`, o ordinare per `id`, prima restava verde). Più tre casi di priorità: un `tempID` che non trova nessuno con il codice fiscale o la partita IVA di un altro dà `[]`, e un codice fiscale di soli spazi cerca per partita IVA.
    - `writes.db.test.ts`: un secondo input parziale senza `name`.
    - `writes.pg.test.ts`: il titolo del test con `id` di `updateCustomerFromDashboard` dice che le colonne lasciate fuori le fissa `writes.db.test.ts`.
    - Mutanti di quel giro, tutti uccisi: nessun `orderBy` e `orderBy(id)` in `listCustomersUnderReview`, il ricadere su codice fiscale o partita IVA quando il `tempID` non trova niente, `fiscalCode !== undefined`, `name` a `null` se manca.
  - [[chore/migrazione-effect]]: TD8 di nuovo `[PREVISTO]`; la riga 2 del §4 non dice più "Mancano test"; §1 dice che `operator` e i middleware sono nella PR 2 di gestione-operatori, ancora da unire; la voce (e) di TD8 dice che la scelta fra le due correzioni resta aperta (MINOR e NIT di v7).
  - [[tech-debt/crm/search-by-explicit-map]]: il percorso di `containsPattern` è `packages/server/src/shared/sql.ts` (NIT di v7).

## Known limits of the tests

- **L'`ORDER BY` delle quattro liste dei filtri ora si vede**, con `filterOptionsOrder.db.test.ts` (dopo la review, trovato da un agent Sonnet). Prima nessun test lo vedeva: PGlite parte con `enable_seqscan = off`, che gli fa scegliere Sort + Unique per il `DISTINCT` anche senza `orderBy`. Il test mette `enable_seqscan = on` e `enable_sort = off` (li toglie in `afterAll`) e semina 101 valori distinti in ordine sparso: il `DISTINCT` diventa un HashAggregate, e senza `orderBy` l'ordine si rompe. Togliere l'`orderBy` di una qualunque delle quattro query fa fallire solo il suo test, provato su tutte e quattro.

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1 | Met | `grep` vuoto |
| AC2 | Met | Confronti fra base e branch di v1, v2 e v3 (tipi, 958 letture, 21 scritture, errori via HTTP) |
| AC3 | Met | `TRPCError` solo in `services/customer/errors.ts` |
| AC4 | Met | `grep` vuoto |
| AC5 | Met | `grep` vuoto; parametri espliciti, nessun `actor` nei servizi delle `protectedProcedure` |
| AC6 | Met | `grep` vuoto |
| AC7 | Met | Righe intere per le 18 procedure e per le scritture; rafforzate in tre giri |
| AC8 | Met | `procedures.db.test.ts`, `queries.db.test.ts` |
| AC9 | Met | Tutte le stranezze fissate; la priorità fra i codici poi corretta (Deviations) |
| AC10 | Met | `writes.pg.test.ts`, 8 test |
| AC11 | Met | Nessuna asserzione dei test di `bc7aa2e` cambiata; le eccezioni sono in test di questo branch (Deviations) |
| AC12 | Met | TD8 `[PREVISTO]`; diventa `[OPEN]` al merge in `dev` |
| AC13 | Met | |
| AC14 | Met | |
| AC15 | Met | Solo il commento di `customerSearch.ts` |
| AC16 | Met | [[chore/migrazione-effect]] aggiornato; le due pagine del dominio citano `packages/server/src/shared/advancedFilters.ts` (`docs-maintenance` del 2026-10-24) |
| AC17 | Met | Gate verdi (sopra) |

## Pre-existing Issues

- **`export.callStats` fallisce su `mito_local`** con `invalid input value for enum task_status: "non risponde"`: la home lo chiama. Il router `export` non è toccato dal passo.
- **ESLint non gira in questo worktree.** `.claude/worktrees/<nome>` sta dentro il checkout principale, quindi ESLint carica anche il suo `.eslintrc.cjs` e si ferma con `Plugin "prettier" was conflicted`. Il gate di T10 gira in un worktree di scratchpad fuori dal repo.

## Remaining Work

- **La PR verso `dev`**, quando Omar la chiede. La descrizione deve dire che la correzione della ricerca per codici (`b033b65`) è un cambio di comportamento voluto, in un commit a sé. Prima: il merge di `dev` nel branch, con i test ripetuti se `dev` ha toccato `customer/` (PLAN §5). Nessuna migrazione nel diff.
- **Al merge:** TD8 a `[OPEN]` in [[chore/migrazione-effect]].
- **Leonardo** guarda i test di AC9 su `insertCustomer` (checklist del REPORT, punto 5).


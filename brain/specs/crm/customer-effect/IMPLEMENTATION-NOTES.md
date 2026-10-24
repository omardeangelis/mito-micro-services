---
domain: crm
type: implementation-notes
spec: customer-effect
links:
  - "[[specs/crm/customer-effect/SPEC]]"
  - "[[specs/crm/customer-effect/PLAN]]"
  - "[[chore/migrazione-effect]]"
ingested: false
last_ingested: null
created: 2026-10-24
updated: 2026-10-24
---

# Implementation Notes: Router `customer` su Effect

## Summary

- Branch `claude/migrazione-customer`, da `dev` a `bc7aa2e`. Il primo commit (`ae5f63d`) porta SPEC, PLAN e TD8 `[PREVISTO]`.

## Execution Mode

- Mode: `parallel`, per le wave del PLAN §10.
- Delegation: `supervised`. `complexity` → tier: `low` → haiku, `medium` → sonnet. I worker della wave 1 scrivono solo i file di test e li fanno girare sul codice di `bc7aa2e`. I mutanti li applica e li fa girare l'orchestratore, uno alla volta: i worker lavorano in parallelo sullo stesso albero, e un mutante di uno romperebbe i test degli altri.
- Escalations: nessuna, per ora.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| `customerOperator.db.test.ts` su PGlite, prima della wave 1 | 28/28 | L'harness gira sull'albero di `ae5f63d` |
| `utils/_test/advancedFilters.pg.test.ts` con `pnpm run test:pg` | 16/16 | Il Postgres di `docker-compose.yml` (127.0.0.1:54329) è su |
| `customer/_test/` su PGlite dopo la wave 1 | 181 passati, 6 saltati | I 6 saltati sono `writes.pg.test.ts`, che il progetto di default include e salta senza database |
| `writes.pg.test.ts` con `pnpm run test:pg` | 6/6 | |
| Mutanti della wave 1 sul codice inline (`scratchpad/mutate.py`, uno alla volta, file ripristinato con `git checkout`) | 40 uccisi su 41 | Il sopravvissuto è equivalente (T1, `countDistinct` → `count`) |
| `prettier --check` sui file di test nuovi | verde | |
| T6, T9, T7, T8: suite intera dopo ogni task | verde | 3071 test su PGlite, 95 su Postgres; `tsc --noEmit` verde |
| T10.1, `grep` di AC1, AC3, AC4, AC5, AC6, AC13, AC14 a `30270b7` | vuoti | AC3 trova solo `services/customer/errors.ts` |
| T10.1, AC11: `git diff -M dac26d9.. -- '**/_test/**'` | solo T6 e un fix di lint | Le rinomine di T6 (un import cambiato) e `expect.any(String) as string` in `writes.db.test.ts` (`838198c`) |
| T10.1, AC15: `git diff --stat bc7aa2e.. -- src/app src/components packages/db packages/domain` | solo `customerSearch.ts` | Il commento della mappa delle colonne |
| T10.2, mutanti sui servizi (`scratchpad/mutants-services.json`) | 41 uccisi su 42 | Gli stessi di T1–T5, rimappati su `queries.ts`, `filterOptions.ts`, `list.ts`, `profile.ts`, `errors.ts` e gli adapter, più `cause` aggiunto a `PracticeWithoutCustomers`. Sopravvive lo stesso equivalente |
| T10.3, gate di CI in un worktree di scratchpad senza `.env*`, a `30270b7` | rosso su lint | `next lint` (e quindi `pnpm build`) si fermava su `no-unsafe-assignment` per `expect.any(String)` in `writes.db.test.ts`. Corretto in `838198c` con `as string`, come `customerOperator.db.test.ts:549` |
| T10.3, a `838198c` | verde | `next lint`, `tsc --noEmit`, `pnpm db:check` (Migrations OK), `pnpm run test --run` con `TEST_DATABASE_URL` (3192 passati, 2 saltati), `pnpm build` con i placeholder, `pnpm api:build`, `pnpm api:smoke` (session 200, providers 200, export 401). `psql` non c'è su questa macchina, quindi il controllo dei database `mito_test_%` rimasti non è girato |
| T10.4, prova nel browser su `mito_local` (10.000 clienti), `next dev` del worktree di gate, sessione con una riga in `session` e il cookie in `agent-browser` | verde | Clienti (ricerca per codice fiscale, filtro per sede, elenco dei file), dettaglio di un cliente con le sue pratiche, dettaglio di una pratica (`getAllCustomerForPratica`), Profilo → blacklist (`getCustomerUnderReview`), modifica anagrafica salvata (`updateCustomerFromDashboard`, riga scritta), cliente messo in blacklist (`handleCustomerBlackList`, `review`), Nuovo cliente (`getCustomersByFiscalCodeOrVatCode` + `insertCustomer`). Nessun errore dalle procedure di `customer`. Non provata: `updateLastEdit` dalla chat. A fine prova, il cliente creato e la riga di sessione sono stati cancellati, e C000002 è tornato com'era |

## Surprises and Decisions

- **`operatore` è `null`**, non un oggetto di `null`, per un cliente senza operatore, sia in `getAllCustomers` sia in `getCustomerUnderReview`: Drizzle collassa l'oggetto annidato. I test lo fissano con `toEqual`.
- **Il messaggio del `BAD_REQUEST`** di un utente senza operatore è `"BAD_REQUEST"`: `operatorErrorToTrpc` non ne passa uno, e tRPC usa il codice.
- **Il default di `customers.id`** è la costante scritta nella migrazione. Il `nanoid()` dello schema cambia a ogni avvio del processo, quindi il test non può confrontarli: controlla solo che il secondo insert senza `id` fallisca per chiave duplicata.
- **Due `toMatchObject` su righe** sono rimasti, tutti e due su controlli secondari: la riga del primo insert senza `id` (T3) e la riga scritta da `handleCustomerBlackList` su postgres-js (T5). La riga intera di quelle scritture la fissano gli altri test di T3, con `toEqual`.

- **Il primo salvataggio nel browser non partiva** (nessun `POST`, il modale si chiudeva). La stessa prova sulla base `bc7aa2e` (porta 3006, stesso `mito_local`) salvava. Ripetuta sul branch con una sessione nuova di `agent-browser`, salvava anche lì: era lo stato della prima sessione, aperta direttamente sull'URL del modale, non il codice.
- **Nuovo cliente non segnala il codice fiscale già presente.** Il form manda sempre il "Codice Cliente (NDG)" come `tempID`, e `getCustomersByFiscalCodeOrVatCode` con un `tempID` non vuoto cerca solo per `tempID` (AC9). Così un cliente con il codice fiscale di un altro si crea senza errore. È il comportamento di `bc7aa2e`, fissato dal test di T1 "con tempID di A e codice fiscale di B cerca solo per tempID"; la conseguenza per l'utente è aggiunta alla voce di TD8.

## Deviations From the Plan

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

- **L'`ORDER BY` delle quattro liste dei filtri non si vede nei test.** Con poche righe Postgres fa `Sort` + `Unique` per il `DISTINCT` e restituisce le righe ordinate anche senza `orderBy`: togliere l'`orderBy` resta verde, invertirlo (`desc`) no. Servirebbe una tabella abbastanza grande da far scegliere al planner un `HashAggregate`. Il codice dell'`orderBy` è identico a quello inline (review v2, confronto fra base e branch).

## Pre-existing Issues

- **`export.callStats` fallisce su `mito_local`** con `invalid input value for enum task_status: "non risponde"`: la home lo chiama. Il router `export` non è toccato dal passo.
- **ESLint non gira in questo worktree.** `.claude/worktrees/<nome>` sta dentro il checkout principale, quindi ESLint carica anche il suo `.eslintrc.cjs` e si ferma con `Plugin "prettier" was conflicted`. Il gate di T10 gira in un worktree di scratchpad fuori dal repo.

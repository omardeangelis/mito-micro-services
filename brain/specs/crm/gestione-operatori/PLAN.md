---
domain: crm
type: plan
links:
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[chore/migrazione-effect]]"
  - "[[chore/migrazione-gcp]]"
created: 2026-10-22
updated: 2026-10-22
---

# Plan: Gestione operatori: user e operator su Effect, disattivazione da admin

**Spec:** [[specs/crm/gestione-operatori/SPEC]]
**Status:** Planned. Nessun codice scritto.
**Generato:** 2026-10-22 con `create-plan`: grill (4 decisioni) → task graph → tdd → `adversarial-verifier`. La prima verifica era DO NOT SHIP (2 blocker, 10 major); le correzioni sono nel §16. Rivisto lo stesso giorno dopo il confronto con la "Mappa servizi backend MITO" del 21/10 e la decisione sulle preferenze (§16, revisione 2).
**Strategia di contesto:** [[chore/migrazione-effect]]. Questo è il passo 1 dell'ordine dei router (§4).

---

## 1. Situazione iniziale

- **`user`** ha 5 procedure (`getUserPreference` e 4 `update*`), tutte inline. Le `update*` rifanno lo stesso read-modify-write sul testo JSON di `users.preferences`, letto con una `innerJoin` su `operators`. Test: `user/_test/contactPreference.db.test.ts` (177 righe).
- **Le preferenze di layout** passano dal server a ogni caricamento e a ogni click (SPEC, Context). Le `update*` si chiamano solo da `POST /api/user/preferences` (`DashboardLayout`, `CustomersTable`, `PraticesTable`, `ContactColumnsMenu`). `getUserPreference` serve anche a sapere `role` e `operatorId` (`UserPreferenceProvider`, `DataSection`, layout del profilo). Lo store zustand `userPreference-storage` tiene già una copia in localStorage.
- **`operator`** ha 6 procedure, tutte inline. Nessun test.
- **I middleware** `operatorProcedure` e `adminProcedure` di `packages/server/src/api/trpc.ts` fanno query Drizzle sul `db` globale.
- **Infrastruttura Effect già pronta:**
  - `effect/db.ts`: `Db`, `query`, `transaction`, `Tx`, `DbError`, `lockCustomer` e il commento della regola dei lock;
  - `effect/trpc.ts`: `runTrpc`;
  - `services/contact/operator.ts`: `findWorkingOperator`;
  - `services/contact/actor.ts`: `actorOf`;
  - `services/contact/errors.ts`: `contactErrorToTrpc`, `contactErrorCause`;
  - `@mito/domain/contact/errors`: `contactErrorCodes`.
- **Harness di test:**
  - `createTestCaller`, che scrive `ctx.session` direttamente e quindi non passa dall'adapter;
  - `factories`, `failpoint` (PGlite) e `lockRule` (PGlite, controlla che il lock sia preso);
  - `operatorRule`;
  - `src/test/pg.ts`: Postgres reale con `holdCustomerLock` e `waitUntilBlocked` per la concorrenza;
  - `packages/server/src/_test/auth.db.test.ts` e `apps/api/src/_test/auth.db.test.ts` per l'adapter e `sessionFromRequest`;
  - il mock globale del database è `@mito/db` (`src/test/setup.ts`).
- **UI:** 21 file usano `api.user.*` o `api.operator.*`. La tabella admin è `src/app/dashboard/profile/@admin/`: `OperatorTable.tsx`, che mostra il toast di successo anche quando fallisce, e il server action `updateOperatorsRole.ts`, che lancia e fa revalidate di un path che non esiste.

## 2. Problema

1. La logica di `user`, `operator` e dei middleware non è in Effect. Questo blocca L3 e anche la disattivazione, che deve agganciarsi a `resolveActor` e a `findWorkingOperator`.
2. Un admin non può rimuovere un utente. La cancellazione fisica non si può fare: lo impediscono le FK e il login Azure (SPEC, Context).
3. Il cambio di ruolo può lasciare zero admin.
4. Le assegnazioni controllano la destinazione senza lock, una volta sola per Assegna Clienti, mai per Assegna chiamate. Una disattivazione simultanea potrebbe lasciare clienti sul disattivato.

## 3. Forma della soluzione

Cinque PR in sequenza per operatori e disattivazione, più due PR indipendenti per le preferenze:

| PR | Contenuto | Comportamento |
|---|---|---|
| **PR 1: Caratterizzazione** | Solo test, sulle procedure di oggi | Nessun cambio |
| **PR 2: user e operator su Effect** | Servizi, `resolveActor`, adapter, errori. Le 4 `update*` non si toccano | **Invariato**, senza eccezioni (D13) |
| **PR 3: Migrazione** | Due colonne nullable e un valore di enum, applicati da Omar | Nessun cambio (le colonne non si leggono) |
| **PR 4: Disattivazione, backend** | Errori e codici, guard (sessione, login, liste), regola "prima gli utenti", cambio di ruolo atomico con `LastAdmin`, `deactivateOperator`, procedure | Nuovo |
| **PR 5: Disattivazione, UI** | Dialog nella tabella admin, errori del cambio di ruolo | Nuovo |
| **PR P1: Preferenze nel browser** | Cookie scritti dal client, render delle tabelle dai cookie, copia una tantum delle preferenze salvate | Nuovo: nessuna richiesta per il layout |
| **PR P2: Preferenze, rimozione lato server** | Via le 4 `update*`, la route `/api/user/preferences` e `preferences` da `getUserPreference` | Solo codice tolto |

P1 non dipende dalle altre e può partire subito. P2 parte almeno 2 settimane dopo il rilascio in prod di P1 (AC34, AC35).

**Struttura dei servizi** (`packages/server/src/services/`):

```
auth/actor.ts           resolveActor(userId): Effect<{ operator, actor: Actor }, NotAnOperator | OperatorDisabled | DbError, Db>
auth/disabled.ts        isUserDisabled({ id?, email }): per signIn e getSessionAndUser
user/current.ts         getCurrentUser(userId): la forma di getUserPreference (preferences, role, operatorId); dopo P2 solo role e operatorId
operator/queries.ts     listActiveOperators, getOperatorById, getPublicOperator(userId)
operator/profile.ts     updateOperatorInfo(operatorId, { name, surname })
operator/roles.ts       updateOperatorsRole(changes): + LastAdmin
operator/deactivate.ts  deactivationImpact(operatorId), deactivateOperator({ operatorId, toOperatorId, actor })
operator/errors.ts      NotAnOperator, OperatorDisabled, OperatorIsAdmin, CannotDeactivateSelf, LastAdmin, operatorErrorToTrpc
```

**Errori.**
- `OperatorNotFound` e `HandoverSameOperator` si riusano da `contact/errors` e `customer/errors`.
- `operatorErrorToTrpc` delega a `contactErrorToTrpc` per gli errori condivisi, quindi `OperatorNotFound` diventa `BAD_REQUEST`.
- Per i nuovi crea il `cause` con `contactErrorCause`, e i codici stanno in `contactErrorCodes`.

## 4. Decision ledger (risolto)

| # | Decisione | Fonte |
|---|---|---|
| D1 | L1 + L2 ora, L3 (trasporto) dopo, per tutto il backend | Utente, risposta 1; [[chore/migrazione-effect]] |
| D2 | Disattivazione su `users.disabled_at`, `disabled_by` | Utente, risposta 2 |
| D3 | Portafoglio verso la destinazione scelta, nella stessa transazione; per i contatti il cliente vince | Utente, risposta 3; D14 e D26 di Contatti |
| D4 | Solo `OPERATORE`; "mai l'ultimo admin" sul cambio di ruolo, "mai sé stessi" | Utente, risposta 4 |
| D5 | `actor` passato come parametro, non `Context.Tag` | Come `customer/assignment.ts`. In L3 il middleware RPC fornisce `CurrentUser` e l'handler lo passa: nessun servizio cambia |
| D6 | Caratterizzazione in una PR separata, prima del refactor | AGENTS.md: "Existing tests must stay green with unchanged assertions" |
| D7 | Migrazione in una PR sua, con il merge in `main` e applicata da Omar prima che inizi la PR 4; file congelato dopo | AC30; migrator di Drizzle; gli agenti non lanciano `db:migrate:prod` |
| D8 | Disattivati controllati in `getSessionAndUser`, più `resolveActor` e `findWorkingOperator` | SPEC D8; il backend usa lo stesso adapter (`apps/api/src/session.ts:49`) |
| D9 | Le stranezze di AC26 si conservano e vanno nei follow-up | Refactor a comportamento invariato |
| D10 | Regola dei lock "prima gli utenti, poi i clienti"; `findWorkingOperator` in `FOR KEY SHARE OF users` dentro ogni transazione | AC7, AC11; review del 2026-10-22 (M1, M3) |
| D11 | Un solo task (T4.1) è il proprietario di `operator/errors.ts` e dei codici di dominio della PR 4 | Review M10: niente modifiche parallele a uno switch esaustivo |
| D12 | Preferenze di layout in cookie del browser; P1 client, P2 rimozione lato server dopo 2 settimane; la colonna `users.preferences` resta | SPEC D9, decisione 5 dell'utente |
| D13 | PR 2 refactor puro: il cambio di ruolo atomico (AC20) va in T4.4, la correzione delle preferenze (ex AC27) non si fa | SPEC D10; proposta della Mappa del 21/10 |
| D14 | Revisione di Leonardo sulle PR 2 e 4 | SPEC AC29a; la Mappa la chiede per permessi e auth |

## 5. Assunzioni e vincoli

- Postgres 15, sia Supabase sia `docker-compose.yml` sia CI, quindi `ALTER TYPE ADD VALUE` è disponibile.
- Nessuna PR in una release di cutover GCP, né durante l'osservazione di S6.
- `api/trpc.ts` è un file caldo: tutti i router lo importano. Le PR 2 e 4 cambiano solo il corpo dei middleware, non i nomi esportati.
- Nessun pacchetto nuovo.
- **OQ2 (tutti `ADMIN` alla registrazione) si chiude prima che la PR 4 arrivi in prod.** `operator.deactivate` si può chiamare via HTTP anche senza UI.

## 6. Findings dal codice

- **`updateOperatorInfo`** restituisce l'operatore di `ctx`, cioè i valori di prima.
- **`getOperatorById({})`** fa `where(undefined)`, senza `ORDER BY`, e `id: 0` vale come "nessun id".
- **`updateOperatorsRole`** salta gli id che non trova e non usa una transazione.
- **I middleware** usano il `db` globale, non `ctx.db`.
- **`assignCustomers`** chiama `findWorkingOperator` una volta sola, fuori dalle transazioni per cliente (`assignment.ts:218`).
- **`task.bulkHandleTask`** (`task/POST/index.ts:237`) non controlla la destinazione.
- **`moveCustomerAndContact`** è privata di `assignment.ts` e non si riusa. La disattivazione scrive le sue query per insiemi.
- **`refreshPriorities`** sta fuori dalla regola dei lock e aggiorna i contatti in blocco: da qui il retry su 40P01 (AC12). Contiene anche il commento sul limite di 65.535 parametri.
- **`createUserWithOperator`** lascia `role` al default `ADMIN` (OQ2).
- **`chat.operator_id`** è NOT NULL senza FK: non si tocca.
- **L'adapter** è costruito con `pgTableCreator`, quindi non conosce `disabled_at`: l'override fa una lettura in più (SPEC, Technical Notes).
- **`seeds/local/generate/log.ts`** elenca le sorgenti del log. Va verificato che `seed:local:verify` regga il valore nuovo.

## 7. Ricerca esterna

- **Effect 4** (`effect@4.0.0-rc`, `MIGRATION.md`): `@effect/rpc` e `@effect/platform` entrano in `effect/unstable/*` (D1).
- **NextAuth v4, strategy `database`:** ogni lettura della sessione passa da `adapter.getSessionAndUser(token)`, e un `null` vale "nessuna sessione". `signIn` riceve l'utente dell'adapter se l'account è collegato, altrimenti il profilo, con l'email.
- **Postgres, lock di riga.** `FOR KEY SHARE` è in conflitto solo con `FOR UPDATE`. Il controllo di una FK prende `FOR KEY SHARE` sulla riga referenziata. Senza `OF`, `FOR UPDATE` blocca le righe di tutte le tabelle della join. In READ COMMITTED, una riga bloccata viene rivalutata dopo l'attesa: un cliente passato a un altro operatore nel frattempo esce dal `WHERE operator_id = X`.
- **Postgres:** al massimo 65.535 parametri per statement.
- **Drizzle migrator:** applica solo le voci del journal più recenti dell'ultima migrazione applicata (D7).

## 8. Grafo delle dipendenze

```
T1.1 ─┐
T1.2 ─┴─ T1.3 (PR 1) ─┬─ T2.1 ─┐
                      ├─ T2.2 ─┼─ T2.4 (PR 2) ─ T3.1 (PR 3, applicata) ─ T4.1 ─┬─ T4.2 ─┐
                      └─ T2.3 ─┘                                            ├─ T4.3 ─┼─ T4.5 ─ T4.6 ─ T4.7 (PR 4) ─ T5.1 ─ T5.2 (PR 5)
                                                                            └─ T4.4 ─┘
```

T4.5 dipende da T4.3 (la regola dei lock e `findWorkingOperator`), oltre che da T4.1.

```
TP1.1 ─ TP1.2 (PR P1) ─ [P1 in prod da 2 settimane] ─ TP2.1 ─ TP2.2 (PR P2)
```

Il ramo delle preferenze è indipendente. L'unico punto di contatto è `getUserPreference`: se la PR 2 è già in `dev`, TP2.1 toglie `preferences` dal servizio `getCurrentUser`; altrimenti dalla procedura inline.

## 9. Task

### PR 1: Caratterizzazione

#### T1.1: Test di caratterizzazione di `operator`
- **depends_on**: []
- **location**: nuovo `packages/server/src/api/routers/operator/_test/operator.db.test.ts`
- **description**: Fissa il comportamento di oggi delle 6 procedure via `createTestCaller`:
  - liste e join con il ruolo;
  - `getOperatorById` con id, con id inesistente e senza id, quest'ultimo con **un solo** operatore nel database (AC26);
  - `getUserOperator`;
  - `getUserPublicOperator` (solo id, nome, cognome);
  - `updateOperatorInfo`: scrive nome e cognome e restituisce i valori **vecchi**;
  - `updateOperatorsRole`: cambia i ruoli, salta gli id inesistenti, `FORBIDDEN` `admin-only` per un `OPERATORE`.

  Nessun codice di produzione cambia.
- **validation**: test verdi su `dev` così com'è.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`updateOperatorInfo` restituisce l'operatore con nome e cognome di prima dell'update".
- **review_mode**: cli
- **complexity**: low

#### T1.2: Test di caratterizzazione dei middleware e di `user`
- **depends_on**: []
- **location**: nuovo `packages/server/src/api/_test/procedures.db.test.ts`; `user/_test/contactPreference.db.test.ts` (solo casi nuovi, nessuna asserzione cambiata)
- **description**:
  - **Middleware:** `UNAUTHORIZED` senza sessione; `BAD_REQUEST` per un utente senza operatore su un `operatorProcedure`; `FORBIDDEN` `admin-only` per un `OPERATORE` su un `adminProcedure`.
  - **User:** `getUserPreference` restituisce `preferences`, `role` e `operatorId`; per un utente senza operatore, preferenze vuote e `role` e `operatorId` undefined (AC26).
  - **Non si caratterizzano** le 4 `update*`: la PR P2 le elimina. Resta il test che c'è già (`contactPreference.db.test.ts`), fino a P2.
- **validation**: test verdi su `dev` così com'è.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "un `OPERATORE` che chiama `operator.updateOperatorsRole` riceve `FORBIDDEN` con messaggio `admin-only`".
- **review_mode**: cli
- **complexity**: low

#### T1.3: Gate e merge della PR 1
- **depends_on**: [T1.1, T1.2]
- **location**: –
- **description**: Gate di CI (AC29), merge in `dev`.
- **validation**: CI verde; il diff contiene solo file `_test/`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

### PR 2: user e operator su Effect (L1 + L2)

#### T2.1: `resolveActor` e middleware
- **depends_on**: [T1.3]
- **location**: nuovo `packages/server/src/services/auth/actor.ts` e `_test/actor.db.test.ts`; nuovo `services/operator/errors.ts` (solo `NotAnOperator` e `operatorErrorToTrpc`); `packages/server/src/api/trpc.ts`
- **description**:
  - `resolveActor(userId)`, con la stessa query di `enforceIsActiveOperator`; l'`Actor` si costruisce con `actorOf`.
  - `enforceIsActiveOperator` lo esegue con `runTrpc`, e `NotAnOperator` diventa `BAD_REQUEST`.
  - `enforceIsAdmin` usa l'`actor` già in `ctx` invece della seconda query, e risponde `FORBIDDEN` `admin-only`.
  - `protectedProcedure` non cambia (AC25). Nomi esportati invariati.
- **validation**:
  - T1.2 resta verde senza cambiare le asserzioni.
  - Test del servizio con `Db` iniettato.
  - Nessuna query Drizzle nei middleware: `enforceIsActiveOperator` ed `enforceIsAdmin` non usano `db`. `trpc.ts` può ancora importare `drizzle-orm` per `createTRPCContext`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`resolveActor` di un utente senza riga operatore fallisce con `NotAnOperator`".
- **review_mode**: cli
- **complexity**: medium

#### T2.2: Servizi `operator` e adapter
- **depends_on**: [T1.3]
- **location**: nuovi `services/operator/{queries,profile,roles}.ts` e `_test/`; `api/routers/operator/{GET,PUT}/index.ts`
- **description**:
  - Porta le 6 procedure sui servizi (§3). Le stranezze di AC26 restano.
  - `updateOperatorsRole` resta com'è: update uno per uno, id inesistenti saltati. La transazione arriva in T4.4 (D13).
  - Usa `operatorErrorToTrpc` di T2.1. Se T2.1 non è ancora in `dev`, crea solo la propria parte del file e il merge si risolve in T2.4.
- **validation**:
  - T1.1 resta verde senza cambiare le asserzioni.
  - `git grep drizzle-orm packages/server/src/api/routers/operator` è vuoto (AC24).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`updateOperatorInfo` via servizio restituisce ancora l'operatore di prima dell'update".
- **review_mode**: cli
- **complexity**: medium

#### T2.3: `getUserPreference` su un servizio
- **depends_on**: [T1.3]
- **location**: nuovo `services/user/current.ts`, `_test/current.db.test.ts`; `api/routers/user/GET/getUserPreference.ts`
- **description**:
  - `getCurrentUser(userId)` restituisce la stessa forma di `retrieveUserPrefercence`, con la stessa `innerJoin`.
  - `getUserPreference` diventa un adapter.
  - `retrieveUserPrefercence` resta, perché le 4 `update*` lo usano ancora: la PR P2 toglie entrambi. Le `update*` non si toccano (AC24).
- **validation**:
  - `contactPreference.db.test.ts` e T1.2 restano verdi senza cambiare le asserzioni.
  - `GET/getUserPreference.ts` non importa `drizzle-orm`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`getCurrentUser` di un utente senza operatore restituisce preferenze vuote, `role` e `operatorId` undefined".
- **review_mode**: cli
- **complexity**: low

#### T2.4: Gate e merge della PR 2
- **depends_on**: [T2.1, T2.2, T2.3]
- **location**: `brain/chore/migrazione-effect.md` §5 (checklist)
- **description**:
  - Gate di CI (AC29).
  - `adversarial-review` (caso B), con il focus "comportamento invariato, senza eccezioni".
  - Revisione di Leonardo (AC29a): la PR cambia i middleware dei permessi.
  - Spunta la checklist.
  - Merge in `dev`, fuori da una release di cutover.
- **validation**: CI verde; REPORT SHIP; `git diff dev -- '*/_test/*'` sui file di T1.x mostra solo aggiunte.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

### PR 3: Migrazione

#### T3.1: Colonne e valore di enum, applicati prima del codice
- **depends_on**: [T2.4]
- **location**: `packages/db/src/schema/users.ts`, `taskEventLog.ts`; `packages/db/migrations/`; `src/test/factories.ts` (opzione `disabledAt` su `createOperator`)
- **description**:
  - Aggiunge `disabled_at` e `disabled_by` su `users` e `'deactivation'` in `taskEventSource` (SPEC, Technical Notes), poi `pnpm db:generate`.
  - Il merge va in `dev` e poi in `main`. **Omar** applica la migrazione a staging e a prod (D7). Da lì il file è congelato.
  - Nessun codice la legge.
- **validation**:
  - `pnpm db:migrate` su `mito_local` e sul database di test.
  - La suite resta verde senza altri cambi.
  - `seed:local` e `seed:local:verify` passano.
  - Nel journal la migrazione è l'ultima, e nessuna PR aperta ne genera una con una data precedente.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`createOperator({ disabledAt })` scrive un utente con `disabled_at` valorizzato".
- **review_mode**: cli
- **complexity**: low

### PR 4: Disattivazione, backend

Parte quando la migrazione è applicata a staging e prod (G3).

#### T4.1: Errori e codici di dominio
- **depends_on**: [T3.1]
- **location**: `services/operator/errors.ts`; `packages/domain/src/contact/errors.ts`; `_test/errors.db.test.ts`
- **description**: Proprietario unico di questi file nella PR 4 (D11).
  - Dichiara tutti i tag: `OperatorDisabled`, `OperatorIsAdmin`, `CannotDeactivateSelf`, `LastAdmin`.
  - Aggiunge i codici `OPERATOR_DISABLED`, `OPERATOR_IS_ADMIN`, `CANNOT_DEACTIVATE_SELF` e `LAST_ADMIN` a `contactErrorCodes`, con payload vuoti.
  - Completa `operatorErrorToTrpc`:
    - `OperatorDisabled` → `UNAUTHORIZED`;
    - `OperatorIsAdmin`, `CannotDeactivateSelf` e `LastAdmin` → `BAD_REQUEST`, con i messaggi della spec;
    - quelli condivisi passano a `contactErrorToTrpc`.
- **validation**: per ogni tag, codice, messaggio e un `cause` che `readContactError` legge sia in-process sia nella forma HTTP.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`readContactError` legge `LAST_ADMIN` dalla forma HTTP dell'errore".
- **review_mode**: cli
- **complexity**: low

#### T4.2: Guard di sessione, login, `resolveActor`, liste
- **depends_on**: [T4.1]
- **location**: nuovo `services/auth/disabled.ts`; `packages/server/src/auth.ts`; `services/auth/actor.ts`; `services/operator/queries.ts`; `packages/server/src/_test/auth.db.test.ts`; `apps/api/src/_test/auth.db.test.ts`
- **description**:
  - **Sessione (AC16):** override di `getSessionAndUser` accanto a `createUser`. Se `isUserDisabled`, restituisce `null`.
  - **Login (AC17):** `signIn` chiama `isUserDisabled` prima del ramo `isProduction`, e rifiuta per id dell'adapter o per `lower(email)`.
  - **`resolveActor`:** fallisce con `OperatorDisabled`.
  - **`listActiveOperators` (AC14):** esclude i disattivati.
- **validation**:
  - **Adapter:** con una sessione valida e l'utente poi disattivato, `authOptions.adapter.getSessionAndUser(token)` restituisce `null` (in `packages/server/src/_test/auth.db.test.ts`) e `sessionFromRequest` non restituisce sessione (in `apps/api/src/_test/auth.db.test.ts`).
  - **Caller:** un utente disattivato su un `operatorProcedure` riceve `UNAUTHORIZED`.
  - **Login:** `signIn` con `isProduction` simulato `true` restituisce `false` per un disattivato, e non c'è un utente nuovo in `users`.
  - **Liste:** `getAllUniqueOperators` non contiene il disattivato; `getOperatorById` sì.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`authOptions.adapter.getSessionAndUser` restituisce `null` per la sessione ancora valida di un utente disattivato".
- **review_mode**: cli
- **complexity**: high

#### T4.3: Regola "prima gli utenti" e destinazione controllata dentro la transazione
- **depends_on**: [T4.1]
- **location**: `services/contact/operator.ts`; `services/customer/assignment.ts` (`assignCustomers`, `handover`); `api/routers/task/POST/index.ts` (`bulkHandleTask`); `effect/db.ts` (commento della regola); `_test/` di contact e customer; nuovo `services/contact/_test/operatorLock.pg.test.ts`
- **description**:
  - `findWorkingOperator`:
    - richiede `Tx`;
    - blocca la riga utente con `FOR KEY SHARE OF users`;
    - rifiuta i disattivati (AC15).
  - In `handover`, in ogni transazione per cliente di `assignCustomers` e in `bulkHandleTask` va eseguito **prima** di `lockCustomer` (AC11).
  - Aggiorna il commento della regola in `effect/db.ts` e quello di `findWorkingOperator`, che oggi dice "no active flag".
- **validation**:
  - I test esistenti di contact, customer e task, compresi `lockRule.db.test.ts` e `operatorRule.db.test.ts`, restano verdi.
  - Casi nuovi: handover, Assegna Clienti e Assegna chiamate verso un disattivato → `OperatorNotFound`.
  - Su Postgres, un `assignCustomers` di 3 clienti con la destinazione disattivata dopo il primo: il primo è spostato, il secondo riceve `OperatorNotFound`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`task.bulkHandleTask` verso un operatore disattivato riceve `OperatorNotFound` e non crea contatti".
- **review_mode**: cli
- **complexity**: high

#### T4.4: `LastAdmin` e disattivati nel cambio di ruolo
- **depends_on**: [T4.1]
- **location**: `services/operator/roles.ts`; `_test/roles.db.test.ts`, `_test/roles.pg.test.ts`
- **description**: `updateOperatorsRole` passa in una `transaction` (AC20, cambio voluto spostato qui dalla PR 2). Dentro:
  1. lock, in ordine di id, delle righe `users` degli admin attivi e di quelle del batch (`FOR UPDATE`);
  2. un disattivato nel batch → `OperatorNotFound` (AC19);
  3. conteggio degli admin dopo il cambio, e `LastAdmin` se è 0 (AC18).
- **validation**:
  - Declassare l'unico admin, anche sé stessi, dà `LastAdmin` e non cambia nulla.
  - **Atomicità (AC20):** con `failNextUpdateOf(users)` sul secondo update del batch, il primo utente resta con il ruolo di prima.
  - Su Postgres con due connessioni: due admin che si declassano a vicenda in parallelo, uno riesce e l'altro riceve `LastAdmin`; alla fine c'è un admin.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "l'unico admin che si declassa riceve `LastAdmin` e resta `ADMIN`".
- **review_mode**: cli
- **complexity**: medium

#### T4.5: `deactivateOperator` e `deactivationImpact`
- **depends_on**: [T4.1, T4.3]
- **location**: `services/operator/deactivate.ts`; `_test/deactivate.db.test.ts`, `_test/deactivate.pg.test.ts`; `services/contact/_test/lockRule.db.test.ts`, `operatorRule.db.test.ts` (un caso ciascuno)
- **description**: In una `transaction`, con al massimo 2 ripetizioni su 40P01:
  1. Lock con `FOR UPDATE OF users`, in ordine di id, delle righe utente dell'operatore e della destinazione.
  2. Controlli, in quest'ordine:
     - l'operatore esiste, ha un utente e non è disattivato (AC5);
     - non è l'attore: si confronta `actor.operatorId` (AC4);
     - non è `ADMIN` (AC3);
     - la destinazione è valida (`findWorkingOperator`, già bloccata al passo 1) ed è diversa (AC6).
  3. Lock, in ordine di id, dei clienti con `operator_id = X` o con un contatto attivo di X, poi dei loro contatti attivi di X.
  4. Prima il log, che legge gli operatori di prima: `INSERT ... SELECT` delle righe dei clienti e dei contatti che si spostano, con il nuovo operatore calcolato come in AC8c.
  5. Poi `UPDATE ... WHERE id IN (SELECT ...)` di clienti, contatti (verso l'operatore del cliente o, se il cliente non ne ha, verso la destinazione) e pratiche.
  6. Infine `disabled_at`, `disabled_by` e `DELETE FROM session WHERE "userId" = ...`.

  `deactivationImpact` fa gli stessi conteggi senza lock.
- **validation**:
  - Un test per ognuno di AC3–AC6, AC8–AC10 e AC13, compreso AC8c con un cliente senza operatore e un contatto attivo di X.
  - **Failpoint:** `failNextInsertInto(taskEventLog)` lascia tutto com'era, utente e sessioni compresi.
  - **Regole:** caso aggiunto a `lockRule.db.test.ts` e a `operatorRule.db.test.ts`.
  - **Su Postgres reale con `holdCustomerLock` e `waitUntilBlocked`:** disattivazione contro handover sullo stesso cliente; handover verso X durante la disattivazione di X; due disattivazioni di X; X→Y insieme a Y→Z. Esiti come in AC7, nessun deadlock.
  - **Scala (AC12):** 5.000 clienti e 5.000 contatti attivi; conteggi giusti, tempo stampato.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "disattivare un operatore con un cliente e il suo contatto attivo li passa alla destinazione e scrive due righe `operator_reassign` con source `deactivation`".
- **review_mode**: cli
- **complexity**: high

#### T4.6: Procedure `deactivate`, `getDeactivationImpact`, `getOperatorsForDeactivation`
- **depends_on**: [T4.2, T4.4, T4.5]
- **location**: `api/routers/operator/{index,GET/index,PUT/index}.ts`; `operator/_test/operator.db.test.ts`
- **description**: Tre `adminProcedure` adapter, con `operatorErrorToTrpc`.
- **validation**:
  - Un test di contratto per ogni errore: codice, messaggio, `cause`.
  - `OPERATORE` → `FORBIDDEN`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`operator.deactivate` su un `ADMIN` risponde `BAD_REQUEST` con il codice `OPERATOR_IS_ADMIN`".
- **review_mode**: cli
- **complexity**: low

#### T4.7: Gate e merge della PR 4
- **depends_on**: [T4.6]
- **location**: –
- **description**:
  - Gate di CI.
  - `adversarial-review` (caso B, impatto atteso `critical`: auth, sessioni, lock).
  - Revisione di Leonardo (AC29a).
  - Merge in `dev`.
  - **Rilascio in prod solo con OQ2 chiusa** (G4).
- **validation**:
  - CI verde; REPORT SHIP.
  - Su staging, un utente di prova disattivato con `operator.deactivate` chiamato a mano viene buttato fuori al refresh e non rientra con Azure.
  - Misura della latenza in più sulla lettura della sessione.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: medium

### PR 5: Disattivazione, UI

#### T5.1: Dialog "Disattiva" e errori del cambio di ruolo
- **depends_on**: [T4.7]
- **location**: `src/app/dashboard/profile/@admin/_components/OperatorTable.tsx`, nuovo `_components/DeactivateOperatorDialog.tsx`, nuovo `_actions/deactivateOperator.ts`, `_actions/updateOperatorsRole.ts`, test in `_components/_test/`
- **description**:
  - **Azione "Disattiva":** solo sulle righe `OPERATORE` diverse dall'utente corrente, che `page.tsx` legge con `getUserOperator`. Il dialog segue AC21–AC23.
  - **I due server action:** restituiscono `{ error: code }` invece di lanciare, e fanno revalidate di `/dashboard/profile` (AC22).
  - **Cambio di ruolo:** `handleOperatorRoleChange` mostra l'errore, `LAST_ADMIN` compreso, e non più un falso successo (AC20a).
- **validation**:
  - **Test di componente:** "Conferma" disabilitato senza destinazione; un messaggio per ogni codice; nome accessibile; errore `LAST_ADMIN` nel cambio di ruolo.
  - **`agent-browser`** su `pnpm dev` con il seed locale: disattivazione di un operatore con clienti, riga sparita, toast con i conteggi, focus restituito.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "il bottone Conferma è disabilitato finché non si sceglie una destinazione".
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: medium

#### T5.2: Gate, merge e docs
- **depends_on**: [T5.1]
- **location**: `brain/specs/crm/crm-specs.md`, `brain/log.md`, `<techDebt>/crm/gestione-operatori.md`
- **description**:
  - Gate di CI e `adversarial-review` con il pass UI.
  - Merge.
  - `docs-maintenance`.
  - Follow-up in tech debt:
    - le stranezze di AC26;
    - la destinazione di `pratiche.PUT` e `customer.insertCustomer`;
    - OQ3;
    - la riattivazione dalla UI;
    - togliere la colonna `users.preferences` (dopo P2) e rinominare `getUserPreference`, che restituisce solo chi è l'utente;
    - nella spec del sostituto di NextAuth, i due comportamenti di `auth.ts` della PR 4 (SPEC, Technical Notes).
- **validation**: CI verde; REPORT SHIP; spec `implemented`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: low

### PR P1: Preferenze nel browser

#### TP1.1: Cookie delle preferenze, render dai cookie, copia una tantum
- **depends_on**: []
- **location**: `src/store/userPreferences.ts`, `src/store/context/UserPreferenceContext.tsx`; nuovo `src/lib/preferences/cookies.ts` (lettura e scrittura, client e server); `src/app/_components/DashboardLayout.tsx`; `src/app/dashboard/customers/_components/{CustomerTableSection,CustomersTable}.tsx`; `src/app/dashboard/pratiche/{page.tsx,_components/PraticesTable.tsx}`; `src/app/dashboard/contatti/_components/{ContactsTableSection,ContactColumnsMenu}.tsx`; `src/app/dashboard/profile/_components/LogoutFloatingButton.tsx`; test in `_test/` accanto
- **description**:
  - **Un modulo per i cookie** (`mito-pref-ds`, `-ct`, `-pt`, `-cot`): parse tollerante (illeggibile = assente), scrittura con `path=/`, `SameSite=Lax`, scadenza 1 anno. Lo usano lo store sul client e `cookies()` nei server component.
  - **Lo store zustand** scrive nei cookie invece che in localStorage (`persist` con uno storage sui cookie, oppure i setter che scrivono il cookie). `logout` cancella i cookie (AC33).
  - **Le 4 scritture** (`DashboardLayout`, `CustomersTable`, `PraticesTable`, `ContactColumnsMenu`) aggiornano lo store e il cookie, subito, senza `fetch` e senza `router.refresh()` (AC31).
  - **I server component** di Clienti, Pratiche e Contatti leggono i cookie per le colonne nascoste e non chiamano più `getUserPreference` (AC32). Le tabelle prendono lo stato dallo store dopo il primo render.
  - **Copia una tantum (AC34):** in `UserPreferenceProvider`, per ogni chiave senza cookie, si scrive il cookie con il valore di `getUserPreference`, che il provider legge già per `role` e `operatorId`.
- **validation**:
  - **Test di componente:** la sidebar cambia senza richieste di rete; una colonna nascosta in Clienti sparisce subito e il cookie contiene il suo id; il logout cancella i cookie.
  - **Server component:** con il cookie `mito-pref-ct` nella richiesta, la tabella Clienti esce già senza quella colonna; con un cookie illeggibile, con tutte.
  - **Copia:** senza cookie e con preferenze sul server, il provider scrive i cookie una volta; con i cookie già presenti non li sovrascrive.
  - `git grep "/api/user/preferences" src` è vuoto.
  - **`agent-browser`** su `pnpm dev`: nascondere una colonna di Contatti, aprire un contatto e tornare indietro entro 30 secondi; la colonna resta nascosta, e nella scheda Network non c'è nessuna richiesta per il layout.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "nascondere una colonna di Clienti la toglie dalla tabella e scrive il cookie senza nessuna `fetch`".
- **review_mode**: mixed
- **assigned_skills**: [agent-browser]
- **complexity**: medium

#### TP1.2: Gate e merge della PR P1
- **depends_on**: [TP1.1]
- **location**: –
- **description**: Gate di CI (AC29) e `adversarial-review` con il pass UI. Merge in `dev`, poi rilascio in prod su Vercel. Si annota la data del rilascio: da lì partono le 2 settimane di P2.
- **validation**: CI verde; REPORT SHIP; data del rilascio in prod nel log del task.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: mixed
- **complexity**: low

### PR P2: Preferenze, rimozione lato server

#### TP2.1: Via le `update*`, la route REST e `preferences`
- **depends_on**: [TP1.2, almeno 2 settimane di P1 in prod]
- **location**: `packages/server/src/api/routers/user/{index.ts,PUT/updateUserPreference.ts,GET/getUserPreference.ts,_test/contactPreference.db.test.ts}`; `services/user/current.ts` se la PR 2 è in `dev`; `src/app/api/user/preferences/`; `apps/api/src/rest.ts`; `src/store/context/UserPreferenceContext.tsx` (via la copia una tantum)
- **description**: Toglie quello che elenca AC34. `getUserPreference` (o `getCurrentUser`) restituisce solo `role` e `operatorId`. La colonna `users.preferences` resta (SPEC, Non-Goals).
- **validation**:
  - `git grep -n "updateCustomerTableVisibleColumns\|updateContactTableVisibleColumns\|updatePracticesTableVisibleColumns\|updateDashboardCollapsed\|retrieveUserPrefercence"` è vuoto.
  - `git grep drizzle-orm packages/server/src/api/routers/user` è vuoto (AC24).
  - `pnpm api:smoke` passa senza la route.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`user.getUserPreference` restituisce `role` e `operatorId` e nessun campo `preferences`".
- **review_mode**: cli
- **complexity**: low

#### TP2.2: Gate e merge della PR P2
- **depends_on**: [TP2.1]
- **location**: `brain/chore/migrazione-effect.md` §5 (checklist: route REST di `user`)
- **description**: Gate di CI; merge in `dev`; il backend con P2 va in prod solo dopo P1 (AC35).
- **validation**: CI verde.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

## 10. Wave di esecuzione

| Wave | Task | Quando parte |
|---|---|---|
| 1 | T1.1, T1.2, TP1.1 | Subito. TP1.1 tocca solo file della UI, nessun conflitto con la PR 1 |
| 2 | T1.3 (PR 1) | T1.1 e T1.2 fatti |
| 3 | T2.1, T2.2, T2.3 | PR 1 in `dev`. T2.1 crea `operator/errors.ts`, T2.2 lo usa: se finisce prima, si allinea in T2.4 |
| 4 | T2.4 (PR 2) | Wave 3 fatta, nessun cutover GCP nella stessa release |
| 5 | T3.1 (PR 3) | PR 2 in `dev`. Poi Omar applica la migrazione a staging e prod |
| 6 | T4.1 | Migrazione applicata (G3) |
| 7 | T4.2, T4.3, T4.4 | T4.1 fatto. File diversi: T4.2 auth, T4.3 contact, customer e task, T4.4 roles |
| 8 | T4.5 | T4.3 fatto |
| 9 | T4.6 → T4.7 (PR 4) | T4.2, T4.4 e T4.5 fatti |
| 10 | T5.1 → T5.2 (PR 5) | PR 4 in `dev` |
| – | TP1.2 (PR P1) | TP1.1 fatto, in qualunque momento |
| – | TP2.1 → TP2.2 (PR P2) | P1 in prod da almeno 2 settimane |

## 11. Strategia di test (fase TDD)

- **Interfacce pubbliche:**
  - procedure via `createTestCaller` (contratto e caratterizzazione);
  - servizi con `Db` iniettato (comportamento nuovo);
  - `authOptions.callbacks.signIn` e `authOptions.adapter.getSessionAndUser`;
  - `sessionFromRequest` del backend;
  - componenti React con Testing Library.

  Nessun test su funzioni interne.
- **Livelli:**
  - `*.db.test.ts` (PGlite) per la logica, i failpoint, la regola dei lock e quella dello stesso operatore;
  - `*.pg.test.ts` con due connessioni reali (`holdCustomerLock`, `waitUntilBlocked`) per concorrenza e scala (AC7, AC11, AC12, AC18). `lockRule` non vede i deadlock e non basta;
  - browser solo in T4.7, T5.1 e T5.2.
- **Un tracciante per task**, dal suo `tdd_target`.
- **Regola della PR 2:** nessuna asserzione dei test di T1.x cambia e non ci sono cambi voluti (D13). Se un test va cambiato, il refactor ha cambiato comportamento: ci si ferma e si decide. Il cambio di ruolo atomico ha il suo test in T4.4.

## 12. Gate di rilascio

| Gate | Quando | Che cosa |
|---|---|---|
| G1 | Merge PR 1 | CI verde; solo file di test |
| G2 | Merge PR 2 | CI verde; asserzioni di T1.x invariate; nessun cambio voluto; AC24 (`git grep` su `operator`) vuoto; REPORT SHIP; revisione di Leonardo |
| G3 | Prima di T4.1 | PR 3 in `main`; migrazione applicata da Omar a staging e prod; file congelato |
| G4 | Merge e rilascio PR 4 | CI verde; REPORT SHIP; revisione di Leonardo; prova su staging (T4.7); **OQ2 chiusa prima della prod** |
| G5 | Merge PR 5 | CI verde; REPORT SHIP con il pass UI; prova browser |
| GP1 | Merge PR P1 | CI verde; REPORT SHIP con il pass UI; prova browser senza richieste di layout |
| GP2 | Merge PR P2 | P1 in prod da almeno 2 settimane; CI verde; `api:smoke` senza la route |

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Il refactor dei middleware cambia un codice di errore per tutti i router | T1.2 li fissa prima; nomi esportati invariati; review dedicata in T2.4 |
| Un'assegnazione simultanea lascia un cliente sul disattivato | Regola "prima gli utenti" (D10); `findWorkingOperator` in `KEY SHARE` dentro ogni transazione; test su Postgres reale per ogni race di AC7 |
| Deadlock fra disattivazione e handover | `FOR UPDATE OF users` (non blocca `operators`, quindi niente conflitto con le FK del log); ordine utenti → clienti → contatti; test con due connessioni |
| Deadlock con il cron `priority`, fuori dalla regola | Retry su 40P01, al massimo 2 volte (AC12) |
| Un `INSERT` del log supera i 65.535 parametri | `INSERT ... SELECT` (AC9, AC12); test a 5.000 + 5.000 |
| Transazione lunga | Statement per insiemi; tempo misurato. Spezzarla in più transazioni cambierebbe AC8 e richiede una modifica della spec, non un ripiego nel codice |
| Il disattivato resta dentro con una sessione già aperta | Sessioni cancellate (AC8e); override di `getSessionAndUser` (AC16), testato sull'adapter e sul backend |
| Il login Azure ricrea l'utente | `signIn` controlla prima di `isProduction` (AC17) |
| Una migrazione di un altro branch viene saltata in prod | D7: PR della migrazione in `main` prima di applicarla, file congelato, controllo del journal in T3.1 |
| Ogni nuovo utente del tenant è `ADMIN` e può disattivare colleghi | OQ2, gate prima del rilascio in prod della PR 4 (G4) |
| Un utente perde il layout salvato sul server | Copia una tantum nei cookie in P1 (AC34); P2 dopo 2 settimane. Chi non entra in quella finestra riparte dal default: è solo layout |
| Il backend senza le `update*` va in prod prima del frontend con P1 | Ordine di rilascio (AC35); una scheda vecchia mostra comunque la scelta e scrive l'errore in console |
| Due operatori sullo stesso browser vedono il layout dell'altro | Il logout cancella i cookie (AC33); resta il caso della sessione scaduta, accettato perché riguarda solo le colonne |

## 14. Tracciabilità AC → task

| AC | Task |
|---|---|
| AC1–AC6, AC8–AC10, AC13 | T4.5, T4.6 |
| AC7, AC11 | T4.3, T4.5 |
| AC12 | T4.5 |
| AC14, AC16, AC17 | T4.2 |
| AC15 | T4.3 |
| AC18, AC19 | T4.4 |
| AC20 | T4.4 |
| AC20a, AC21–AC23 | T5.1 (codici: T4.1) |
| AC24, AC28 | T2.1, T2.2, T2.3, T4.6, TP2.1 |
| AC25 | T2.1, T4.2 |
| AC26 | T1.1, T1.2, T2.2, T2.3 |
| AC27 | sostituito da AC31–AC35 |
| AC29 | T1.3, T2.4, T3.1, T4.7, T5.2, TP1.2, TP2.2 |
| AC29a | T2.4, T4.7 |
| AC31–AC33 | TP1.1 |
| AC34 | TP1.1 (copia), TP2.1 (rimozione) |
| AC35 | TP1.2, TP2.2 |
| AC30 | T3.1, G3 |

## 15. Domande aperte

- **OQ2:** da chiudere prima del rilascio in prod della PR 4.
- **OQ3:** non blocca nulla.
- **OQ1:** chiusa con "il cliente vince".

## 16. Esito della verifica (2026-10-22)

La prima versione del piano ha avuto DO NOT SHIP dall'`adversarial-verifier`. Correzioni:

- **B1:** il log in un solo `INSERT ... VALUES` superava i 65.535 parametri a 10.000 righe. Ora è `INSERT ... SELECT`, e il test di scala ha anche 5.000 contatti attivi.
- **B2:** AC25 contraddiceva AC26 (`protectedProcedure` con `resolveActor`), e il tracciante di AC16 non poteva passare con `createTestCaller`. Ora `protectedProcedure` non cambia e il tracciante è sull'adapter e su `sessionFromRequest`.
- **M1, M3:**
  - Prima: `findWorkingOperator` senza lock e Assegna Clienti con un solo controllo. Le race lasciavano clienti sul disattivato, e c'era un rischio di deadlock con le FK del log.
  - Ora: regola "prima gli utenti" (D10), `FOR UPDATE OF users`, test con due connessioni reali al posto di `lockRule`.
- **M2:** Assegna chiamate non controllava la destinazione. Ora è in AC15 e T4.3. `insertCustomer` è nei follow-up.
- **M4:** prima la migrazione veniva applicata prima del merge. Ora ha una PR sua, va in `main` e la applica Omar (D7).
- **M5:** `OperatorNotFound` diventa `BAD_REQUEST`, come in `contactErrorToTrpc`.
- **M6:** i codici nuovi stanno in `contactErrorCodes`, e gli action restituiscono `{ error }`.
- **M7:** la disattivazione entra in `lockRule` e `operatorRule`. OQ1 è chiusa con "il cliente vince".
- **M8:** OQ2 è il gate della PR 4, non della 5.
- **M9, M10:** T4.5 dipende da T4.3; T4.1 è il proprietario unico di `errors.ts`.
- **MINOR:**
  - harness di AC27 su PGlite;
  - AC20 e il merge delle preferenze dichiarati come cambi voluti;
  - niente ripiego che violi AC8;
  - retry su 40P01;
  - path di revalidate corretto;
  - errore di `LastAdmin` mostrato in UI (AC20a);
  - caratterizzazione di `getOperatorById` con un solo operatore;
  - soglia di tempo solo in locale;
  - lettura in più sulla sessione dichiarata.
- **NIT:** mock `@mito/db`; `moveCustomerAndContact` privata; riuso di `actorOf`; tipo di `resolveActor` unico; `trpc.ts` può importare `drizzle-orm`.

### Revisione 2 (2026-10-22): confronto con la Mappa del 21/10 e preferenze

- **PR 2 refactor puro (D13).** Il cambio di ruolo atomico (AC20) passa a T4.4, dove `LastAdmin` ha comunque bisogno della transazione. La correzione delle preferenze concorrenti (ex AC27, ex T2.3) non si fa più: il suo endpoint sparisce con P2.
- **Preferenze nel browser (D12).** Nuove PR P1 e P2. Le 4 `update*` non si migrano su Effect né si caratterizzano: sarebbe lavoro su codice che va tolto.
- **Revisione di Leonardo** sulle PR 2 e 4 (D14).
- **Follow-up:** i due comportamenti di `auth.ts` della PR 4 diventano un requisito della spec del sostituto di NextAuth.

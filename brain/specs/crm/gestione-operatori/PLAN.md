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
**Strategia di contesto:** [[chore/migrazione-effect]]. Questo è il passo 1 dell'ordine dei router (§4).

---

## 1. Situazione iniziale

- **`user`** ha 5 procedure (`getUserPreference` e 4 `update*`), tutte inline. Le `update*` rifanno lo stesso read-modify-write sul testo JSON di `users.preferences`. Test: `user/_test/contactPreference.db.test.ts` (177 righe).
- **`operator`** ha 6 procedure, tutte inline: `getAllUniqueOperators`, `getOperatorById`, `getUserOperator`, `getUserPublicOperator`, `updateOperatorInfo`, `updateOperatorsRole`. Nessun test.
- **I middleware** `operatorProcedure` e `adminProcedure` di `packages/server/src/api/trpc.ts` fanno query Drizzle sul `db` globale.
- **Infrastruttura Effect già pronta:**
  - `effect/db.ts`: `Db`, `query`, `transaction`, `Tx`, `DbError`;
  - `effect/trpc.ts`: `runTrpc`;
  - `services/contact/operator.ts`: `findWorkingOperator`;
  - `services/customer/assignment.ts`: `moveCustomerAndContact`, la regola dei lock;
  - harness di test: `createTestCaller`, `factories`, `failpoint`, `lockRule`, `pg`.
- **UI:** 21 file usano `api.user.*` o `api.operator.*`. La tabella admin è `src/app/dashboard/profile/@admin/` (`OperatorTable.tsx` e il server action `updateOperatorsRole.ts`).

## 2. Problema

1. La logica di `user`, `operator` e dei middleware non è in Effect. Questo blocca L3 e anche la disattivazione, che deve agganciarsi a `resolveActor` e a `findWorkingOperator`.
2. Un admin non può rimuovere un utente. La cancellazione fisica non si può fare: lo impediscono le FK e il login Azure (SPEC, Context).
3. Il cambio di ruolo può lasciare zero admin.

## 3. Forma della soluzione

Quattro PR in sequenza. Ogni PR è piccola e si può rivedere da sola.

| PR | Contenuto | Comportamento |
|---|---|---|
| **PR 1: Caratterizzazione** | Solo test, sulle procedure di oggi | Nessun cambio |
| **PR 2: user e operator su Effect** | Servizi, `resolveActor`, adapter, errori | Invariato, salvo AC27 (preferenze non si perdono) |
| **PR 3: Disattivazione, backend** | Migrazione additiva, `deactivateOperator`, guard (sessione, login, `findWorkingOperator`, liste), `LastAdmin` | Nuovo |
| **PR 4: Disattivazione, UI** | Dialog nella tabella admin | Nuovo |

**Struttura dei servizi** (`packages/server/src/services/`):

```
auth/actor.ts           resolveActor(userId) → { operatorId, role, operator } | NotAnOperator
auth/disabled.ts        isUserDisabled({ id?, email }) per signIn e getSessionAndUser
user/preferences.ts     getPreferences(userId), updatePreferences(userId, patch)
operator/queries.ts     listActiveOperators, getOperatorById, getPublicOperator(userId)
operator/profile.ts     updateOperatorInfo(operatorId, { name, surname })
operator/roles.ts       updateOperatorsRole(changes)   + LastAdmin
operator/deactivate.ts  deactivationImpact(operatorId), deactivateOperator({ operatorId, toOperatorId, actor })
operator/errors.ts      OperatorIsAdmin, CannotDeactivateSelf, LastAdmin, operatorErrorToTrpc
```

`OperatorNotFound` e `HandoverSameOperator` si riusano da `contact/errors` e `customer/errors`. `operatorErrorToTrpc` li traduce con gli stessi codici di `customerErrorToTrpc`.

## 4. Decision ledger (risolto)

| # | Decisione | Fonte |
|---|---|---|
| D1 | L1 + L2 ora, L3 (trasporto) dopo, per tutto il backend | Utente, risposta 1; [[chore/migrazione-effect]] |
| D2 | Disattivazione su `users.disabled_at`, `disabled_by` | Utente, risposta 2 |
| D3 | Portafoglio verso la destinazione scelta, nella stessa transazione | Utente, risposta 3 |
| D4 | Solo `OPERATORE`; "mai l'ultimo admin" e "mai sé stessi" | Utente, risposta 4 |
| D5 | `actor` passato come parametro, non `Context.Tag` | Come `customer/assignment.ts`. In L3 il middleware RPC fornisce `CurrentUser` e l'handler lo passa: nessun servizio cambia |
| D6 | Caratterizzazione in una PR separata, prima del refactor | AGENTS.md: "Existing tests must stay green with unchanged assertions". Senza test non c'è niente da tenere verde |
| D7 | Migrazione additiva in PR 3, applicata a staging e prod prima del merge | AC30; Vercel e Cloud Run fanno il deploy in momenti diversi |
| D8 | Il controllo dei disattivati sta nell'override di `getSessionAndUser` | SPEC D8; il backend usa lo stesso adapter (`apps/api/src/session.ts`) |
| D9 | Le stranezze di AC26 si conservano e vanno nei follow-up | Refactor a comportamento invariato |

## 5. Assunzioni e vincoli

- Postgres 15, sia Supabase sia `docker-compose.yml`, quindi `ALTER TYPE ADD VALUE` è disponibile.
- Nessuna PR in una release di cutover GCP, né durante l'osservazione di S6.
- `api/trpc.ts` è un file caldo: tutti i router lo importano. La PR 2 cambia solo il corpo dei middleware, non i nomi esportati.
- Nessun pacchetto nuovo.

## 6. Findings dal codice

- **`updateOperatorInfo` restituisce l'operatore di `ctx`,** cioè i valori prima dell'update, e ignora il `.returning` (AC26).
- **`getOperatorById({})` senza id** fa `where(undefined)` e restituisce il primo operatore (AC26).
- **`updateOperatorsRole` salta gli id che non trova e non usa transazioni.** Il `!` su `input.find` è sicuro solo perché `operatorsToEdit` viene dagli stessi id.
- **I middleware usano il `db` globale, non `ctx.db`.** Nei test `createTestCaller` funziona perché `@/server/db` è simulato. `resolveActor` userà `Db`.
- **`findWorkingOperator`** ha già il commento "The schema has no active flag": la PR 3 lo aggiorna.
- **`createUserWithOperator`** lascia `role` al default `ADMIN` (SPEC OQ2).
- **`chat.operator_id`** è NOT NULL senza FK: la disattivazione non lo tocca.
- **`seeds/local/generate/log.ts`** elenca le sorgenti del log. Il valore nuovo `deactivation` non va nel seed. Va verificato che `seed:local:verify` non fallisca su un enum più lungo.

## 7. Ricerca esterna

- Effect 4 (`effect@4.0.0-rc`, `MIGRATION.md`): `@effect/rpc` e `@effect/platform` entrano in `effect/unstable/*`. È il motivo per rinviare L3 (D1).
- NextAuth v4, strategy `database`: ogni lettura della sessione passa da `adapter.getSessionAndUser(token)`. Un `null` vale "nessuna sessione". `signIn` riceve l'utente dell'adapter se l'account è collegato, altrimenti il profilo, con l'email.

## 8. Grafo delle dipendenze

```
T1.1 ─┐
T1.2 ─┼─ T1.3 (PR 1) ─┬─ T2.1 ─┐
      │               ├─ T2.2 ─┼─ T2.4 (PR 2) ─ T3.1 ─┬─ T3.2 ─┐
      │               └─ T2.3 ─┘                      ├─ T3.3 ─┼─ T3.5 ─ T3.6 (PR 3) ─ T4.1 ─ T4.2 (PR 4)
      │                                               └─ T3.4 ─┘
```

## 9. Task

### PR 1: Caratterizzazione

#### T1.1: Test di caratterizzazione di `operator`
- **depends_on**: []
- **location**: nuovo `packages/server/src/api/routers/operator/_test/operator.db.test.ts`
- **description**: Fissa il comportamento di oggi delle 6 procedure via `createTestCaller`:
  - liste e join con il ruolo;
  - `getOperatorById` con id, senza id e con id inesistente;
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
  - **User:** `getUserPreference` di un utente senza operatore restituisce preferenze vuote e `role` e `operatorId` undefined; le 4 `update*` scrivono la propria chiave e lasciano le altre.
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
- **location**: nuovo `packages/server/src/services/auth/actor.ts` e `_test/actor.db.test.ts`; `packages/server/src/api/trpc.ts`
- **description**:
  - `resolveActor(userId): Effect<{ operator, actor: Actor }, NotAnOperator | DbError, Db>`, con la stessa query di `enforceIsActiveOperator`.
  - `enforceIsActiveOperator` e `enforceIsAdmin` lo eseguono con `runTrpc`. `NotAnOperator` → `BAD_REQUEST`. `enforceIsAdmin` riusa l'`actor` già in `ctx`, invece della seconda query: una query in meno a ogni procedura admin.
  - Nomi esportati invariati.
- **validation**:
  - T1.2 resta verde senza cambiare le asserzioni.
  - Test del servizio con `Db` iniettato.
  - `git grep drizzle-orm packages/server/src/api/trpc.ts` resta vuoto, salvo i tipi di `ctx.db` se servono ancora.
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
- **location**: nuovi `services/operator/{queries,profile,roles,errors}.ts` e `_test/`; `api/routers/operator/{GET,PUT}/index.ts`
- **description**:
  - Porta le 6 procedure sui servizi (§3). Le stranezze di AC26 restano.
  - `updateOperatorsRole` diventa atomico, in una `transaction` (AC20). Gli id inesistenti restano saltati.
  - `operatorErrorToTrpc` è l'unico punto con `TRPCError`.
- **validation**:
  - T1.1 resta verde senza cambiare le asserzioni.
  - Un test con `failNextUpdateOf(users)` sul secondo update del batch non lascia cambiato il primo (AC20).
  - `git grep drizzle-orm packages/server/src/api/routers/operator` è vuoto (AC24).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "un batch di due cambi di ruolo con il secondo update fallito lascia il primo utente con il ruolo di prima".
- **review_mode**: cli
- **complexity**: medium

#### T2.3: Servizio preferenze e adapter `user`
- **depends_on**: [T1.3]
- **location**: nuovo `services/user/preferences.ts`, `_test/preferences.pg.test.ts`; `api/routers/user/{GET,PUT}/*`
- **description**:
  - `getPreferences(userId)` restituisce la stessa forma di `retrieveUserPrefercence`.
  - `updatePreferences(userId, patch: Partial<UserPreference>)` lavora in una `transaction`: `SELECT ... FOR UPDATE`, merge, update.
  - Le 4 procedure restano, con input zod ed export dei tipi invariati, e chiamano lo stesso servizio con la propria chiave.
  - `retrieveUserPrefercence` va tolto. Prima si controlla con `git grep` che nessun altro lo importi.
- **validation**:
  - `contactPreference.db.test.ts` e T1.2 restano verdi senza cambiare le asserzioni.
  - Test su Postgres: due `updatePreferences` simultanei di chiavi diverse, il primo fermato con `beforeNextLockOf`. Alla fine ci sono tutte e due le chiavi (AC27).
  - `git grep drizzle-orm packages/server/src/api/routers/user` è vuoto.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "due aggiornamenti simultanei di `contactTableVisibleColumns` e `dashboardCollapsed` lasciano salvate entrambe le chiavi".
- **review_mode**: cli
- **complexity**: medium

#### T2.4: Gate e merge della PR 2
- **depends_on**: [T2.1, T2.2, T2.3]
- **location**: `brain/chore/migrazione-effect.md` §5 (checklist)
- **description**:
  - Gate di CI (AC29).
  - `adversarial-review` (caso B), con il focus "comportamento invariato".
  - Spunta la checklist di [[chore/migrazione-effect]].
  - Merge in `dev`, fuori da una release di cutover.
- **validation**: CI verde; REPORT SHIP; i test di T1.x hanno lo stesso diff vuoto sulle asserzioni (`git diff dev -- '*/_test/*'` mostra solo aggiunte).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: n/a
- **review_mode**: cli
- **complexity**: low

### PR 3: Disattivazione, backend

#### T3.1: Migrazione dello schema
- **depends_on**: [T2.4]
- **location**: `packages/db/src/schema/users.ts`, `taskEventLog.ts`; `packages/db/migrations/`; `src/test/factories.ts` (opzione `disabledAt` su `createOperator`)
- **description**:
  - `disabled_at` e `disabled_by` su `users`; `'deactivation'` in `taskEventSource` (SPEC, Technical Notes).
  - `pnpm db:generate`.
  - Si applica a staging e poi a prod **prima** del merge della PR 3 (D7). Il codice di PR 2 ignora le colonne.
- **validation**:
  - `pnpm db:migrate` su `mito_local` e sul database di test.
  - La suite resta verde senza altri cambi.
  - `seed:local` e `seed:local:verify` passano.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`createOperator({ disabledAt })` scrive un utente con `disabled_at` valorizzato".
- **review_mode**: cli
- **complexity**: low

#### T3.2: Guard: sessione, login, `resolveActor`, `findWorkingOperator`, liste
- **depends_on**: [T3.1]
- **location**: nuovo `services/auth/disabled.ts`; `packages/server/src/auth.ts`; `services/auth/actor.ts`; `services/contact/operator.ts`; `services/operator/queries.ts`; test in `_test/` di ognuno; `apps/api/src/_test/` per il caso del backend
- **description**:
  - **Sessione (AC16):** override di `getSessionAndUser` accanto a `createUser`. Se l'utente ha `disabled_at`, restituisce `null`.
  - **Login (AC17):** `signIn` chiama `isUserDisabled` prima del ramo `isProduction`. Rifiuta per id dell'adapter o per `lower(email)`.
  - **`resolveActor`:** fallisce con `OperatorDisabled` → `UNAUTHORIZED`, come difesa in profondità.
  - **`findWorkingOperator` (AC15):** rifiuta i disattivati; il commento va aggiornato.
  - **`listActiveOperators` (AC14):** esclude i disattivati.
- **validation**:
  - **Sessione:** con una sessione valida e l'utente poi disattivato (`testDb.update`), `user.getUserPreference` → `UNAUTHORIZED`. Il caso va provato con il caller e nel test del backend (`sessionFromRequest` → nessuna sessione).
  - **Login:** `authOptions.callbacks.signIn` con `isProduction` simulato `true` → `false` per un disattivato, e nessun utente nuovo in `users`.
  - **Assegnazioni:** handover e Assegna Clienti verso un disattivato → `OperatorNotFound` (i test esistenti di `operatorRule` restano verdi).
  - **Liste:** `getAllUniqueOperators` non contiene il disattivato; `getOperatorById` sì.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "una sessione ancora valida di un utente disattivato riceve `UNAUTHORIZED` da `user.getUserPreference`".
- **review_mode**: cli
- **complexity**: high

#### T3.3: `LastAdmin` e disattivati nel cambio di ruolo
- **depends_on**: [T3.1]
- **location**: `services/operator/roles.ts`, `errors.ts`; `_test/roles.pg.test.ts`
- **description**: Nella transazione di T2.2:
  1. `SELECT id FROM users WHERE role='ADMIN' AND disabled_at IS NULL ORDER BY id FOR UPDATE`;
  2. lock degli utenti del batch;
  3. un disattivato nel batch → `OperatorNotFound` (AC19);
  4. conteggio degli admin dopo il cambio, e `LastAdmin` se è 0 (AC18).
- **validation**:
  - Declassare l'unico admin, anche sé stessi → `LastAdmin`, e nulla cambia.
  - Su Postgres, due admin che si declassano a vicenda in parallelo: uno riesce, l'altro `LastAdmin`; alla fine c'è un admin.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "l'unico admin che si declassa riceve `LastAdmin` e resta `ADMIN`".
- **review_mode**: cli
- **complexity**: medium

#### T3.4: `deactivateOperator` e `deactivationImpact`
- **depends_on**: [T3.1]
- **location**: `services/operator/deactivate.ts`, `errors.ts`; `_test/deactivate.db.test.ts`, `_test/deactivate.pg.test.ts`
- **description**: In una `transaction`:
  1. Lock della riga utente dell'operatore (`FOR UPDATE`) e controlli, in quest'ordine: esiste, ha un utente e non è disattivato (AC5); non è l'attore (AC4); non è `ADMIN` (AC3).
  2. `findWorkingOperator(toOperatorId)` e il controllo `HandoverSameOperator` (AC6).
  3. Lock dei clienti dell'operatore e di quelli con un suo contatto attivo, in ordine di id. Poi lock dei contatti attivi di quei clienti con `operator_id` = disattivato, in ordine di id (AC11).
  4. Tre `UPDATE ... WHERE id IN (...)`: clienti, contatti, pratiche (AC8 b–d).
  5. Un solo `INSERT` delle righe di log (AC9).
  6. `disabled_at`, `disabled_by`; `DELETE FROM session WHERE userId` (AC8 a, e).

  `deactivationImpact` fa gli stessi conteggi senza lock.

  `actor.operatorId` (AC4) si confronta con `operatorId`, non con l'utente.
- **validation**:
  - Un test per ognuno di AC3–AC6, AC8–AC10 e AC13.
  - **Failpoint (AC8):** `failNextInsertInto(taskEventLog)` lascia tutto com'era, compresi utente e sessioni.
  - **Lock rule (AC11):** `assertCustomerLockedOnWrite` o un caso nuovo nell'harness `lockRule`.
  - **Due disattivazioni simultanee (AC7):** una `OperatorNotFound`.
  - **Scala (AC12):** 5.000 clienti in meno di 10 s su `docker-compose`, in `*.pg.test.ts` con `test.timeout` esplicito.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "disattivare un operatore con un cliente e il suo contatto attivo li passa alla destinazione e scrive due righe `operator_reassign` con source `deactivation`".
- **review_mode**: cli
- **complexity**: high

#### T3.5: Procedure `deactivate`, `getDeactivationImpact`, `getOperatorsForDeactivation`
- **depends_on**: [T3.2, T3.3, T3.4]
- **location**: `api/routers/operator/{index,GET/index,PUT/index}.ts`; `services/operator/errors.ts`; `operator/_test/operator.db.test.ts`
- **description**:
  - Tre `adminProcedure` adapter.
  - Mapping in `operatorErrorToTrpc`, con codici e messaggi di AC2–AC6 e AC18, e un `cause` leggibile da `@/trpc/server` in tutte e due le forme (AGENTS.md: "Read an error of `@/trpc/server` in both shapes").
- **validation**:
  - Un test di contratto per ogni errore: codice, messaggio, `cause`.
  - `OPERATORE` → `FORBIDDEN`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: n/a
- **backlog_item_url**: n/a
- **relation_mode**: n/a
- **tdd_target**: "`operator.deactivate` su un `ADMIN` risponde `BAD_REQUEST` con il messaggio di AC3".
- **review_mode**: cli
- **complexity**: low

#### T3.6: Gate e merge della PR 3
- **depends_on**: [T3.5]
- **location**: –
- **description**:
  - Verifica che la migrazione T3.1 sia applicata a staging e prod.
  - Gate di CI.
  - `adversarial-review` (caso B): ci aspettiamo `review_impact: critical`, per auth e sessioni.
  - Merge.
- **validation**: CI verde; REPORT SHIP; su staging, un utente di prova disattivato viene buttato fuori al refresh e non rientra con Azure.
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

### PR 4: Disattivazione, UI

#### T4.1: Dialog "Disattiva" nella tabella admin
- **depends_on**: [T3.6]
- **location**: `src/app/dashboard/profile/@admin/_components/OperatorTable.tsx`, nuovo `_components/DeactivateOperatorDialog.tsx`, nuovo `_actions/deactivateOperator.ts`, test in `_components/_test/`
- **description**:
  - L'azione è solo sulle righe `OPERATORE` diverse dall'utente corrente. Per saperlo serve l'id dell'utente corrente: `getUserOperator` in `page.tsx`.
  - Il dialog mostra i dati di AC21.
  - Il server action chiama `api.operator.deactivate` e fa `revalidatePath`.
  - Gli errori vengono letti con lo stesso schema di `readContactError` (AC22).
  - Accessibilità come da AC23.
- **validation**:
  - Test di componente: "Conferma" disabilitato senza destinazione; messaggio per ogni errore; nome accessibile.
  - `agent-browser` su `pnpm dev` con il seed locale: disattivazione di un operatore con clienti, riga sparita, toast con i conteggi, focus restituito.
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

#### T4.2: Gate, merge e docs
- **depends_on**: [T4.1]
- **location**: `brain/specs/crm/crm-specs.md`, `brain/log.md`, `<techDebt>/crm/gestione-operatori.md`
- **description**:
  - Gate di CI e `adversarial-review` con il pass UI.
  - Merge.
  - `docs-maintenance` sulla cartella della spec.
  - Follow-up in tech debt: stranezze di AC26, guard della destinazione nelle pratiche, OQ2.
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

## 10. Wave di esecuzione

| Wave | Task | Quando parte |
|---|---|---|
| 1 | T1.1, T1.2 | Subito |
| 2 | T1.3 (PR 1) | T1.1 e T1.2 fatti |
| 3 | T2.1, T2.2, T2.3 | PR 1 in `dev`. File diversi. T2.1 tocca `trpc.ts`, gli altri no |
| 4 | T2.4 (PR 2) | Wave 3 fatta, nessun cutover GCP nella stessa release |
| 5 | T3.1 | PR 2 in `dev` |
| 6 | T3.2, T3.3, T3.4 | Migrazione applicata. T3.2 e T3.4 toccano tutti e due `services/operator/errors.ts`: lo crea T3.3, gli altri aggiungono |
| 7 | T3.5 → T3.6 (PR 3) | Wave 6 fatta |
| 8 | T4.1 → T4.2 (PR 4) | PR 3 in `dev` |

## 11. Strategia di test (fase TDD)

- **Interfacce pubbliche:**
  - procedure via `createTestCaller` (contratto e caratterizzazione);
  - servizi con `Db` iniettato (comportamento nuovo);
  - `authOptions.callbacks.signIn` e `authOptions.adapter.getSessionAndUser`;
  - `sessionFromRequest` del backend;
  - componenti React con Testing Library.

  Nessun test su funzioni interne.
- **Livelli:**
  - `*.db.test.ts` per la logica;
  - `*.pg.test.ts` per lock, concorrenza e scala (AC7, AC11, AC12, AC18, AC27);
  - browser solo in T3.6, T4.1 e T4.2.
- **Un tracciante per task**, dal suo `tdd_target`.
- **Regola della PR 2:** nessuna asserzione dei test di T1.x cambia. Se un test va cambiato, il refactor ha cambiato comportamento: ci si ferma e si decide.

## 12. Gate di rilascio

| Gate | Quando | Che cosa |
|---|---|---|
| G1 | Merge PR 1 | CI verde; solo file di test |
| G2 | Merge PR 2 | CI verde; asserzioni di T1.x invariate; AC24 (`git grep`) vuoto; REPORT SHIP |
| G3 | Prima del merge della PR 3 | Migrazione su staging e prod; la suite sullo schema nuovo è verde con il codice di PR 2 |
| G4 | Merge PR 3 | CI verde; REPORT SHIP; prova su staging (T3.6) |
| G5 | Merge PR 4 | CI verde; REPORT SHIP con il pass UI; prova browser |

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Il refactor dei middleware cambia un codice di errore per tutti i router | T1.2 li fissa prima; nomi esportati invariati; review dedicata in T2.4 |
| La disattivazione va in deadlock con un passaggio di consegne | Ordine dei lock di AC11; test con l'harness `lockRule` |
| Transazione lunga su un operatore con migliaia di clienti | Update per insiemi; AC12 misurato. Se supera 10 s: batch da 1.000 in transazioni separate, con il flag messo per primo (così nessuna nuova assegnazione arriva), e la procedura si può rilanciare |
| Il disattivato resta dentro con una sessione già aperta | Sessioni cancellate (AC8e) e override di `getSessionAndUser` (AC16); test su Next.js e backend |
| Il login Azure ricrea l'utente | `signIn` controlla prima di `isProduction` (AC17); test con `isProduction` simulato |
| Migrazione non applicata quando arriva il codice | G3; colonne nullable; il codice di PR 2 non le legge |
| Ogni nuovo utente del tenant è `ADMIN` e può disattivare colleghi | Fuori scope; OQ2 con una spec di sicurezza raccomandata, da decidere prima di aprire la PR 4 in prod |

## 14. Tracciabilità AC → task

| AC | Task |
|---|---|
| AC1–AC6, AC8–AC10, AC13 | T3.4, T3.5 |
| AC7, AC11, AC12 | T3.4 |
| AC14, AC15, AC16, AC17 | T3.2 |
| AC18, AC19 | T3.3 |
| AC20 | T2.2 |
| AC21–AC23 | T4.1 |
| AC24, AC28 | T2.1, T2.2, T2.3, T3.5 |
| AC25 | T2.1, T3.2 |
| AC26 | T1.1, T1.2, T2.2, T2.3 |
| AC27 | T2.3 |
| AC29 | T1.3, T2.4, T3.6, T4.2 |
| AC30 | T3.1, G3 |

## 15. Domande aperte

- OQ1, OQ2, OQ3 della spec. Nessuna blocca PR 1 e PR 2. OQ1 va chiusa prima di T3.4. OQ2 va chiusa prima del rilascio in prod della PR 4.

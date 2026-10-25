---
domain: crm
type: review-rubric
scope: spec
spec: pratiche-effect
links:
  - "[[specs/crm/pratiche-effect/REPORT]]"
  - "[[specs/crm/pratiche-effect/SPEC]]"
created: 2026-10-25
updated: 2026-10-25
---

# Review Rubric: Router `pratiche` e letture di `task` su Effect (passo 4)

## Change set under review

- **Scope:** spec implementation (caso B), [[specs/crm/pratiche-effect/SPEC]], AC1–AC15
- **Target:** branch `claude/pratiche-effect`
- **Compared:** `5b61b3f` → `d505078`
- **Files touched:** 24 file di codice e test, più i documenti di `brain/`, in un dominio: crm

## Routing rubric (review-classifier output)

```json
{
  "taskType": "refactor",
  "secondaryType": "test",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 7,
    "passes": [
      { "id": "v1", "charter": "Authorization parity pass: for each of the 20 remaining procedures of `pratiche` and `task`, check it keeps the exact middleware it had at `5b61b3f`. That means 5 `operatorProcedure` + 3 `protectedProcedure` in pratiche; 10 `operatorProcedure` + 2 `adminProcedure` (`reassign`, `bulkHandleTask`) in task. Check that `actorOperatorId` still comes only from `ctx.operator.id` and never from input. Check that the 5 removed procedures (`getPraticaByPraticaId`, `updatePratica`, `updateLastEdit`, `getTaskById`, `getTasksToExport`) and `shared/updateAt.ts` really have no caller left in `src/`, server actions, `apps/api` or `packages/`. Check that the AC9 middleware table in the new tests covers exactly the router keys after AC7: no operator gives BAD_REQUEST, a disabled operator gives UNAUTHORIZED 'Utente disattivato', an OPERATORE calling an admin procedure gives FORBIDDEN 'admin-only'. AC2, AC7, AC9 (middleware part).", "complexity": "high" },
      { "id": "v2", "charter": "bulkHandleTask move pass: check that `services/contact/bulkHandleTask.ts` keeps the base `assignCustomer` program exactly. That covers one `transaction` per customer, `concurrency: 1`, and the first failure stopping the run with earlier customers committed. It covers the lock rule ('users first, then customers': `findWorkingOperator` before `lockCustomer` in every transaction), the four assignment cases, the alert handling (`alertId` cleared, `isResolved`/`resolvedBy`), the `replaceActiveContact` `mostRecent` flag, the `task_event_log` rows, and the `customers.operatorId` write. Check that `contactErrorToTrpc` still maps `OperatorNotFound`/`CustomerMissing` to the same codes and messages at the edge. Constraint 'La regola dei lock' and AC11 (the three existing bulkHandleTask test files stay green with unchanged assertions).", "complexity": "high" },
      { "id": "v3", "charter": "Write-path parity pass on `services/practice/writes.ts` and `services/customer/profile.ts#updateCustomerContacts` against the base inline Drizzle. Check return shapes: `insertPratica` gives `rows[0]` as `{ id: praticaId }`; `connectPraticaAndCustomer` and `bulkAssignPractices` give `undefined`, including `practiceIds: []`; `updatePraticaFromDashboard` gives `{ id }[]`; `updateCustomerPreview` gives the raw driver result. Check `updatedAt` via `$onUpdate`, and that the `id!`-undefined path behaves the same on postgres-js. Check driver errors: the base path went through `driverErrorMiddleware`, the new path through `runTrpc`. Both must give the same INTERNAL_SERVER_ERROR code and driver message for duplicate key, `GENERATED ALWAYS` id, `No values to set` and the undefined parameter, with no SQL leaked and no rows changed. Check `inferRouterInputs`/`inferRouterOutputs` equality minus the 5 removed keys. AC2, AC8 (writes), AC9 (insert/update quirks), AC10.", "complexity": "high" },
      { "id": "v4", "charter": "Injection-invariant pass on the moved `getAllPratiche` (`services/practice/list.ts`): check that the program is the base `getAllPratichePage` byte for byte in behavior. Every client value reaches SQL only as a bound parameter: `q` through `containsPattern` + `ilike` on the closed `praticaSearchColumns` map; `orderBy` through the closed switch with an `updatedAt` default; `advancedFilters` through `advancedFiltersWhere` + `PRATICA_FILTER_QUERY_MAP`; `productId` through `getProductKey`. No `sql.raw` on input. `PracticeListQuery` must not widen what the zod input admits. `onlyMe` must apply only to OPERATORE. crm contract invariant 'Nessun SQL del client arriva al database dalle liste Clienti e Pratiche'.", "complexity": "medium" },
      { "id": "v5", "charter": "Read-path parity pass on `services/practice/queries.ts` and `services/contact/queries.ts`. Check `getPracticeById`: same column projection, left join to operators, `result[0]` (so `undefined` when missing, `operator: null` without an operator). Check `listRegions`: selectDistinct, `null` region included. Check `getActiveTask`: same `GREATEST(updatedAt, createdAt) DESC, id DESC LIMIT 1`, still returned as an array. Check `listCustomersWithActiveAlerts`: `[]` short-circuit without a query, same projection, joins and filters. Check `listCustomerAlerts`: same `customerAlerts` call. Response shapes must be identical through `runTrpc`. AC2, AC8 (reads), AC9 (read quirks).", "complexity": "medium" },
      { "id": "v6", "charter": "Characterization-test validity pass: check that the new `pratiche/_test/*.db.test.ts`, `*.pg.test.ts` and `task/_test/*` tests pin today's behavior with whole rows. For the 5 writes that means the written columns, `updatedAt`, the other columns unchanged and the other rows unchanged. Set-based comparisons only where the query has no order. Run them at `5b61b3f` (tests-first ordering) to confirm they are green there. Check that the `*.pg.test.ts` file actually runs in CI on postgres-js. Check that the refactor commits change no existing assertion line except the `CustomerChat.test.tsx` mock and the two `updatePratica` not-called assertions (AC7). AC8, AC9, AC10, AC11.", "complexity": "medium" },
      { "id": "v7", "charter": "Static conformance and perimeter pass: run the AC1 greps (no `@mito/db` / `ctx.db` / `drizzle-orm` / `effect/db` / `shared/updateAt` in the two routers outside `_test`; `@mito/db/schema` only for `taskStatus`/`stateEnum`). Run AC3 (`TRPCError` only in the `*errors.ts` translators), AC4 (no zod in services), AC5 (no `api/` imports from services/shared, no tRPC ctx passed in), AC6 (no `server-only` in new or modified services) and the AC7 grep. Check cross-runtime safety: no `next/*`, `next-auth` runtime or `@/` imports in `packages/server`, and `pnpm api:build` / `api:smoke` bundle the new services. Check AC13: no file touched in `src/app/`, `packages/db/`, `packages/domain/`. Check AC12/AC14: TD9 lists every AC9/AC10 quirk and the 'Nuova pratica' flow with a proposed fix and status; `migrazione-effect.md` §1/§4/§5/TD6 (32 server-only files) and the two tech-debt pages are updated.", "complexity": "low" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run v1-v7 as independent adversarial-verifier passes in parallel, case B against brain/specs/crm/pratiche-effect/SPEC.md AC1-AC15. Put v1, v2 and v3 on the strongest model (Opus), v4-v6 on a balanced model and v7 on a fast model. Add no motion-craft or UI pass: the only file under src/components is a test with lines removed. REPORT.md must end with a human checklist: (1) confirm the per-procedure middleware matrix against 5b61b3f; (2) confirm no client, server action or apps/api caller of the 5 removed procedures remains; (3) confirm the diff adds no files under packages/db/migrations (the migration-chain check is then not needed); (4) confirm CI is green on all gates, including the *.pg.test.ts suite, api:build and api:smoke; (5) confirm the merge does not land in the same release as a GCP cutover or inside the S6 two-week observation window (SPEC constraint); (6) confirm TD9 is [OPEN] at merge into dev."
}
```

## Classifier rationale

`critical` perché il passo ricabla le 20 procedure che restano di `pratiche` e `task`, dove i middleware di `api/trpc.ts` sono l'unico controllo di accesso, e ne toglie 5; e perché sposta il codice che scrive `practices`, `customers`, `customer_to_pratica`, `task`, `alert` e `task_event_log`, compreso `bulkHandleTask` con la regola dei lock del contratto crm. Il codice gira in Next.js e nel backend su Cloud Run. Lo spostamento di `getAllPratiche` ha un passo suo per l'invariante sull'SQL del client. Sette passi perché le preoccupazioni sono separate; i controlli meccanici stanno tutti in v7.

## Overrides applied

Nessuno. Il punto (6) della checklist umana si legge con D16 del PLAN: TD9 resta `[PREVISTO]` nel commit della PR e passa a `[OPEN]` dopo il merge in `dev`.

## Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Parità dei permessi, procedure tolte, tabella dei middleware | high | strongest (Opus) |
| v2 | Spostamento di `bulkHandleTask`, regola dei lock | high | strongest (Opus) |
| v3 | Parità delle scritture e degli errori del driver | high | strongest (Opus) |
| v4 | Invariante sull'SQL del client in `listPractices` | medium | balanced (Sonnet) |
| v5 | Parità delle letture | medium | balanced (Sonnet) |
| v6 | Validità dei test di caratterizzazione | medium | balanced (Sonnet) |
| v7 | Controlli statici e perimetro | low | fast (Haiku) |

## [Round: 2026-10-25] Correzioni di TD9

### Change set under review

- **Scope:** spec implementation (caso B), [[specs/crm/pratiche-effect/SPEC]]. Per i punti corretti il contratto è la voce TD9 (a)–(m) in [[chore/migrazione-effect]] §7, che supera le parti "conserva il comportamento" di AC2, AC9–AC11 e AC13 (vedi [[specs/crm/pratiche-effect/IMPLEMENTATION-NOTES]])
- **Target:** branch `claude/pratiche-effect`, [PR #83](https://github.com/omardeangelis/mito-micro-services/pull/83) verso `dev`
- **Compared:** `def7bd0` → `4ca830c` (commit `0ff83c1` codice, `4ca830c` documenti)
- **Files touched:** 27 file di codice e test, più 6 documenti di `brain/`, in un dominio: crm

### Routing rubric (review-classifier output)

```json
{
  "taskType": "security",
  "secondaryType": "bugfix",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 5,
    "passes": [
      { "id": "v1", "charter": "Authorization surface of the pratiche router: operatorProcedure everywhere (TD9 a); no caller-supplied operatorId reaches a write (TD9 d, g); createPratica calling the createCustomer service directly vs the old customer.insertCustomer procedure (checks skipped?); bulkAssignPractices gone end to end (TD9 k).", "complexity": "high" },
      { "id": "v2", "charter": "Transactional write correctness of createPracticeWithCustomers: atomicity, createCustomer and query joining the enclosing transaction, SQLSTATE mapping on PGlite and postgres-js, the 'only the holder can be missing' assumption, edge cases (duplicate related ids, related id = holder, empty list, unique violation on the link table); updateCustomerContacts and updatePracticeFromDashboard write only allowed columns. TD9 d, e, f, j, m.", "complexity": "high" },
      { "id": "v3", "charter": "Input contracts and data fidelity: createPratica pick list vs NewPraticaForm fields, productId mapping, relatedCustomers omit/extend and role restriction, { praticaId } response; required ids; the email/phone refine with undefined/null/empty string and the empty-email-to-null transform; CustomerSection hidden input keeps text ids; ORDER BY region nulls last and deadline, id. TD9 c, h, i, l.", "complexity": "medium" },
      { "id": "v4", "charter": "End-to-end error contract: new codes in @mito/domain, practiceErrorToTrpc, describeContactError; every consumer reads errors in both @/trpc/server shapes (in-process cause and HTTP data); 404 on the practice page; the right message per code in NewPraticaForm; TRPCError only in *errors.ts. TD9 b, f, m.", "complexity": "medium" },
      { "id": "v5", "charter": "Runtime boundary and test integrity: no Next.js/@/ imports in packages/server, services free of zod, every changed test assertion maps to a TD9 item and no unrelated characterization assertion was loosened, deletions leave no dangling reference, the CustomerSection test exercises public behaviour, no migration.", "complexity": "medium" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run 5 independent adversarial-verifier passes on def7bd0..HEAD: v1 and v2 on the strongest model, v3 to v5 on a balanced model. No UI or motion-craft pass. REPORT.md must end with a human checklist that includes the role/permission sign-off by Leonardo before the merge into dev."
}
```

(Charter abbreviati qui; il testo intero è quello passato ai verificatori.)

### Classifier rationale

Critico perché il giro cambia chi può chiamare le procedure di `pratiche`: da `protectedProcedure` a `operatorProcedure`, `operatorId` fuori dagli input, `bulkAssignPractices` tolta. Per il §4 di [[chore/migrazione-effect]] le PR che toccano i permessi hanno la revisione di Leonardo: la decisione della SPEC "nessuna revisione obbligatoria di Leonardo" valeva perché il middleware non cambiava, e qui cambia. Due passi sul modello più forte: i permessi e la nuova transazione, che deve comportarsi uguale su PGlite e postgres-js. Nessun passo UI: l'unico cambio di markup è il tipo dell'input nascosto in `CustomerSection.tsx`, dentro un `FormItem hidden`, che v3 controlla come dato; nessun codice di animazione.

### Overrides applied

Nessuno.

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Permessi del router, `operatorId`, `createCustomer` diretto, via `bulkAssignPractices` | high | strongest (Opus) |
| v2 | Transazione di `createPracticeWithCustomers` e mappatura degli SQLSTATE | high | strongest (Opus) |
| v3 | Contratti di input e fedeltà dei dati | medium | balanced (Sonnet) |
| v4 | Contratto degli errori fino alla UI | medium | balanced (Sonnet) |
| v5 | Confine del runtime e integrità dei test | medium | balanced (Sonnet) |

## [Round: 2026-10-25] Rilancio sulle correzioni

### Change set under review

- **Scope:** le correzioni di M1–M4 e i documenti di B1, chieste dal giro 2 (checklist, punto 3)
- **Target:** branch `claude/pratiche-effect`, [PR #83](https://github.com/omardeangelis/mito-micro-services/pull/83)
- **Compared:** `4ca830c` → `bef07ae` (commit `8d3d33c` codice, `bef07ae` documenti)
- **Files touched:** 8 file di codice e test, più i documenti di `brain/`, in un dominio: crm

### Overrides applied

Classificatore non rilanciato: Omar ha chiesto di rilanciare i passi v1, v3, v4 e v5 del giro 2 sulle correzioni. Stessi passi, stessa complessità, charter ristretti a quello che le correzioni toccano. v2 (transazione) non rilanciato: le correzioni non toccano `writes.ts`.

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | B1 nei documenti, rotta REST dell'import, clienti collegati senza operatore del chiamante, middleware invariati | high | strongest (Opus) |
| v3 | `.pick` dei clienti collegati contro il form, mutanti di M4, ordine delle regioni su Postgres, tipo `CustomerWithRole` | medium | balanced (Sonnet) |
| v4 | `CustomerMissing` → "Cliente non trovato" fino al form, in tutte e due le forme | medium | balanced (Sonnet) |
| v5 | Confine del runtime, integrità dei test, verità dei documenti, gate | medium | balanced (Sonnet) |

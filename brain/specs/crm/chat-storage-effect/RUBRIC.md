---
domain: crm
type: review-rubric
scope: spec
spec: chat-storage-effect
links:
  - "[[specs/crm/chat-storage-effect/REPORT]]"
  - "[[specs/crm/chat-storage-effect/SPEC]]"
created: 2026-10-25
updated: 2026-10-25
---

# Review Rubric: Router `chat` su Effect, PR A del passo 5

## Change set under review

- **Scope:** spec implementation (caso B), [[specs/crm/chat-storage-effect/SPEC]], i criteri della PR A: AC1–AC10, AC16 (conteggio), AC17 (a)(b)(c)(f), le parti di AC18 della PR A, AC19, AC20
- **Target:** branch `claude/chat-effect`
- **Compared:** `2b284b4` → `9d8195d`
- **Files touched:** 22 file di codice e test, più i documenti di `brain/`, in un dominio: crm

## Routing rubric (review-classifier output)

```json
{
  "taskType": "refactor",
  "secondaryType": "bugfix",
  "domainsTouched": [
    "crm"
  ],
  "adversarialVerifiers": {
    "count": 5,
    "passes": [
      {
        "id": "v1",
        "charter": "Concurrency and transactional-integrity pass on sending a note (AC5, AC6), against the crm lock rule (brain/domains/crm/concepts/regola-dei-lock.md, crm-contract invariant 'every writer of a customer locks it first'). In packages/server/src/services/chat/sendCustomerMessage.ts, verify the following. (1) The customer row lock (lockCustomer) is taken before any write to chat_to_operator, messages or chat, so the order matches createCustomerChat and deleteCustomerMessage and no deadlock with them is possible. (2) The window between the unlocked customers.chat_id lookup and lockCustomer is safe: try a customer whose chat_id is cleared or changed, a customer that is deleted, and a chat that is deleted with its last note while the send waits. Each must give ChatMissing with nothing saved, or a correct write under the right lock, never a write to the wrong chat or a write without a lock. (3) The 'orphan chat, no customer' branch writes without a lock only when no customer can point to the chat. (4) The join, insert and mark-unread run in one transaction and roll back together. (5) onConflictDoNothing on chat_to_operator is backed by a real unique or primary-key constraint, so two simultaneous sends by an operator not yet in the chat give exactly one row. Also check that the extended BEFORE INSERT trigger on messages in src/test/lockRule.ts enforces the rule it claims to. Do not judge error-message text or architecture here.",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Authorization and identity pass on the chat router and the notes server action. Verify that all 4 remaining procedures (getChatMessagesById, insertMessage, createNewCustomerChat, deleteMessage) keep exactly their middleware at 2b284b4 (operatorProcedure: BAD_REQUEST for a user who is not an operator, UNAUTHORIZED 'Utente disattivato' for a disabled operator), and that no permission was widened or narrowed (the SPEC forbids permission changes in this step). Check that the operatorId written to messages and chat_to_operator always comes from the session (ctx.operator.id) and never from client input, in both the adapter and the service. Check that the deleteMessage author-only check (NotMessageAuthor -> FORBIDDEN, not even for an admin) survives the move of the error classes into services/chat/errors.ts. Check that removing the server action's own operator lookup (api.operator.getUserOperator plus getUniqueChatOperator) does not let a caller who was rejected before now succeed, or change who can join a chat, given that insertMessage now adds the operator itself. Confirm that the removed protectedProcedure getUniqueChatOperator and addOperatorToChat have no remaining callers that relied on their weaker guard.",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Public-contract and error-translation equivalence pass (AC1 adapter shape, AC4, AC5 error path, AC7, AC8). Against base 2b284b4, verify that the inferred tRPC input and output types of the 4 procedures are unchanged (insertMessage still returns '... | undefined'), that the input defaults are unchanged (limit default 5; limit 0, -1 and non-integer behave as before) and that the response shapes are unchanged (4 keys, ascending order, total). Verify that every error path yields the same code and Italian message through the single translator chatErrorToTrpc: 'Cliente non trovato', 'Nota non trovata' (including deleteCustomerMessage's new CustomerMissing -> MessageMissing remap under the lock), 'Solo l'autore della nota può eliminarla', and the driver message for DbError now routed through runTrpc in getChatMessagesById. The only new error is NOT_FOUND 'Chat non trovata' on insertMessage. Check that errors read correctly in both shapes, in-process and over HTTP via the Cloud Run backend (apps/api, BACKEND_URL), and that updateChatAction returns the same responses. Check that the removed procedures and chat/PUT/index.ts have no callers anywhere in src/, apps/, packages/ or scripts. Check that the new runTrpc logging of DbError does not log note content (customer PII) beyond what was logged before.",
        "complexity": "high"
      },
      {
        "id": "v4",
        "charter": "Static conformance and scope-fence pass (AC1 grep, AC2, AC3, AC16, AC17 a/b/c/f, AC18 PR-A parts, AC19). Verify these mechanically. No Drizzle or TRPCError imports in non-test files under packages/server/src/api/routers/chat. TRPCError in packages/server/src/services appears only in the five errors.ts files. services/chat/* imports no zod, no api layer and no server-only, takes explicit params and never the tRPC ctx. The count of files with server-only in packages/server/src is 30, and dropping server-only from services/chat does not let those files into a client bundle (no client or src/ import of services/chat). There is no Next.js in packages/server outside auth.ts. Nothing changed in packages/db (no migration files) or packages/domain. In src/, only updateChat.ts, its test and src/test/lockRule.ts changed, and no .tsx file changed. The docs bookkeeping is in place: TD10 rows marked [PREVISTO] in brain/chore/migrazione-effect.md section 7, the L2 row of section 1, the chat checkmarks in section 5, and the assertCustomerLockedOnChatWrite comment. Do not judge runtime behavior.",
        "complexity": "low"
      },
      {
        "id": "v5",
        "charter": "Test-integrity and gate-evidence pass (AC6 'observed by', AC9, AC10, AC20). Verify that the characterization tests (procedures, queries, insertMessage, errors .db.test.ts) would pass at 2b284b4 and pin the behavior they claim: middlewares, last-limit ascending notes, total, empty or missing chat, a colleague reads and writes, error codes and messages. Verify that after the refactor no assertion changed in the AC10 set (createNewCustomerChat.db, deleteMessage.db, lockRule.db, the notes component tests, apps/api/src/_test/rest.db.test.ts) beyond the declared AC7/AC8 removals and the 3 lockRule cases that were only added. Check that the AC6 evidence actually runs: sendCustomerMessage.pg.test.ts is wrapped in describe.skipIf(!hasTestDatabase), so confirm that CI (.github/workflows/ci.yml) provides a real Postgres, otherwise the lock-wait and simultaneous-send proofs are silently skipped. Check that the failpoint tests (beforeNextLockOf, failNextInsertInto, failNextUpdateOf) would fail if the lock or the transaction were removed. Check that the CI gate order in the root AGENTS.md (next lint, tsc --noEmit, db:check, pnpm run test --run including *.pg.test.ts, pnpm build with placeholders, api:build, api:smoke) is green at HEAD.",
        "complexity": "medium"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run 5 independent adversarial-verifier passes on the diff 2b284b4..9d8195d (branch claude/chat-effect) with the SPEC.md AC excerpt for PR A. Run v1, v2 and v3 on the strongest model (Opus), v5 on a balanced model and v4 on a fast model. Emit no UI pass and no motion-craft pass: there is no rendered-UI or motion code in the change set, updateChat.ts is a server action and no .tsx changed. Tell every verifier that AC11-AC15 and AC17 d/e (the supabase router, supabaseClient, the export routes) belong to PR B, and that their absence is not a finding. Because the impact is critical, REPORT.md must end with a step-by-step human checklist before the merge into dev. The checklist must cover: the lock order and the window before the lock in sendCustomerMessage; operatorId always taken from the session; the error codes and messages unchanged in-process and over HTTP; the *.pg.test.ts files actually running in CI; no files added in packages/db/migrations (the root AGENTS.md migration-chain guard is satisfied trivially); the CI gates green."
}
```

## Classifier rationale

L'invio di una nota entra nella regola dei lock del crm: prende il lock del cliente, legge il cliente prima del lock, scrive tre tabelle in una transazione e si appoggia a `onConflictDoNothing`. È concorrenza sottile, quindi ha un passo suo sul modello più forte. L'impatto è critico per due motivi: il server action non controlla più l'operatore da sé e si affida a `insertMessage`, e il contratto del router (tipi, codici, messaggi) ha due consumatori, in-process e via HTTP sul backend Cloud Run. Nessun passo su schema, segreti o CI: il diff non li tocca, e v4 lo controlla. Il passo sui test (v5) è separato da quello sui lock (v1), perché le prove di AC6 su Postgres stanno dietro `describe.skipIf(!hasTestDatabase)` e senza un Postgres in CI sparirebbero senza errore.

## Overrides applied

Nessuno. Il RUBRIC è coerente: 5 passi isolati, `critical` con `humanInLoop: true`, nessun passo UI né di motion (nessun `.tsx` cambiato, `updateChat.ts` è un server action).

## Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Concorrenza e transazione dell'invio di una nota (AC5, AC6) | high | il più forte (Opus) |
| v2 | Autorizzazione e identità: middleware, `operatorId` dalla sessione, server action | high | il più forte (Opus) |
| v3 | Equivalenza del contratto pubblico e della traduzione degli errori (AC1, AC4, AC5, AC7, AC8) | high | il più forte (Opus) |
| v4 | Conformità statica e perimetro (AC1 grep, AC2, AC3, AC16, AC17, AC18, AC19) | low | veloce (haiku) |
| v5 | Integrità dei test e prove dei gate (AC6, AC9, AC10, AC20) | medium | intermedio (sonnet) |

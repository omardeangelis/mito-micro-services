---
domain: crm
type: implementation-notes
spec: gestione-operatori
links:
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/gestione-operatori/PLAN]]"
ingested: false
last_ingested: null
created: 2026-10-22
updated: 2026-10-22
---

# Implementation Notes

## Summary

- Esecuzione avviata il 2026-10-22 con `implement-spec`. Perimetro deciso con Omar: tutte le PR tranne la P2 (bloccata dalle 2 settimane di P1 in prod), con obiettivo **staging**.

## Execution Mode

- Mode: `parallel`, per wave (§10 del piano). Le PR sono branch separati, impilati quando dipendono l'una dall'altra:
  - `claude/great-carson-o6qn17-pr1` da `origin/dev` (PR 1);
  - `claude/great-carson-o6qn17-pr2` da `-pr1`, `-pr3` da `-pr2`, `-pr4` da `-pr3`, `-pr5` da `-pr4`;
  - `claude/great-carson-o6qn17-p1` da `origin/dev` (PR P1).
  - I documenti (questo file, `PLAN.md`) restano su `claude/great-carson-o6qn17`.
- Delegation: `supervised`. Il supervisore scrive il tracciante RED di ogni task, un worker sul tier della `complexity` scrive il resto, il supervisore rivede.
- Escalations: nessuna, finora.

## Deviations From the Plan

- **Gate G3 su staging, non su prod** (Omar, 2026-10-22: "Lavoriamo per migrare tutto su staging"). La regola che conta è "migrazione applicata sull'ambiente prima del codice che la legge". La PR 4 si scrive e si prova in locale subito; arriva su staging solo dopo la PR 3 applicata su staging, e in prod solo dopo la PR 3 applicata in prod.
- **Caratterizzazione di `getUserPreference` in un file suo** (`user/_test/getUserPreference.db.test.ts`), non in `contactPreference.db.test.ts`: la PR P2 cancella quel file, e i casi di `role` e `operatorId` devono sopravvivere.

## Surprises and Decisions

- In questo container non c'è Docker: i `*.pg.test.ts` girano su un Postgres 16 installato con apt sulla porta 54329 (in CI e in prod è il 15). Le differenze fra 15 e 16 non toccano i lock di riga né `ALTER TYPE ... ADD VALUE`.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| `pnpm run test --run` su `origin/dev`, con `TEST_DATABASE_URL` | 154 file, 2492 test verdi | Baseline prima di ogni modifica |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| | | |

## Remaining Work

- PR P2 (TP2.1, TP2.2): almeno 2 settimane dopo P1 in prod (AC34, AC35).

## Steering

| Date | Feedback | Changes |
|------|----------|---------|
| 2026-10-22 | "Perché PR4 e 5 sono bloccate dalla migrazione su prod? Lavoriamo per migrare tutto su staging" | G3 diventa "PR 3 applicata sull'ambiente prima della PR 4"; PR 4 e 5 entrano nel perimetro |
| 2026-10-22 | Un branch per PR | Branch impilati, elencati in Execution Mode |

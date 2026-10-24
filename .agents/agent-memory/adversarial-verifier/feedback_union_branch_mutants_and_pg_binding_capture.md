---
name: union-branch-mutants-and-pg-binding-capture
description: Per-query sql.raw mutants (one UNION branch, total only), postgres-js debug hook to capture real query text and params, NUL-byte text param gives a 500 instead of being dropped
metadata:
  type: feedback
---

- **Mutate each query separately, not only the shared `where`.** A `sql.raw` reintroduced in one branch of an identical-branch UNION survives a `NOT EXISTS` payload (the other branch restores every row; total is a separate query). Only the OR-escape payload (`1=1) OR (1=1` with a narrowing search) kills it. Run mutants for: shared where, total only, page only, each union branch.
- **Real-Postgres binding proof:** in the `vi.mock("@mito/db")` of a pg test, add `debug: (_c, q, p) => log.push({ q, p })` to the postgres-js options; print text and params of every statement. Shows `$n` placeholders on the production driver, not just PGlite's `testClient.query`.
- **"Invalid entry dropped, no error" filters:** a text value with `\u0000` passes any text validation and Postgres rejects the bound param (`invalid byte sequence for encoding "UTF8": 0x00`) as a 500. Also a non-string `value` fails zod for the whole request. Both fail closed (no execution); grade against the AC's wording, and check whether `q` already behaves the same.

**Why:** a 20-mutant battery on the filtri-sql-sicuri reform; the union-branch mutants were killed by one test only.
**How to apply:** for any list procedure with several statements, mutate each statement on its own and check which test kills it.

Related: [[injection-test-payload-and-param-binding]], [[sql-input-and-cost-probes]], [[mutant-battery-scratch-copy]]

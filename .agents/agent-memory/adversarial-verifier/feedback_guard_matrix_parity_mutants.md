---
name: guard-matrix-parity-mutants
description: Middleware-parity check for tRPC routers - static builder diff base vs head, then one guard-swap mutant per direction; know which swap a guard table cannot see
metadata:
  type: feedback
---

For "each procedure keeps its middleware" charters: (1) `git show <base>:<file> | grep -nE 'export const|Procedure'` per router file, base vs head, gives the builder per procedure in seconds; (2) `git diff --stat` on `api/trpc.ts` proves the middlewares themselves did not change; (3) run one mutant per swap direction (protected->operator, operator->protected, operator->admin, admin->operator, admin->adminSessionProcedure) on the guard table in a scratch copy with rebuilt `node_modules/@mito` links (see [[pg-lock-mutant-runs]]). A Python runner with exact (old, new) pairs plus the import edit took about 2 minutes for 12 mutants.

**Blind spot to report:** a table with rows for "no operator", "disabled operator" and "OPERATORE" but no "no session" row cannot tell `protectedProcedure` from `publicProcedure`. Also check that the admin FORBIDDEN assertion pins the message: a service with its own role check (`ContactForbidden`) answers FORBIDDEN too, and only the message `admin-only` separates them.

**Why:** the static diff alone does not prove the test table can catch a future swap; the mutants do.

**How to apply:** report the protected-vs-public gap as a NIT unless the AC asks for the no-session case.

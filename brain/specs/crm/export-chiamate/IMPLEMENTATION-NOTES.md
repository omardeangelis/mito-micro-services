---
domain: crm
type: implementation-notes
links:
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/export-chiamate/PLAN]]"
created: 2026-10-23
updated: 2026-10-23
---

# Implementation Notes

## Summary

- PR A (#61): T0, da `non risponde` non si torna a `chiamare` (AC1b), e test di AC2b. `dev` unito in #57 e #61.
- PR B (#65, `claude/export-call-stats`, impilata su #61): T1–T5. Dominio del periodo e della regola di chiamata, servizio Effect `callStats`, procedura `export.callStats` solo admin, misura di AC21.

## Execution Mode

- Mode: sequential
- Delegation: inline per T0–T5. `brain.config.json` dice `supervised`, ma le regole del progetto (Tech Lead) tengono su Opus i task di permessi, query e design; il budget di 5 sub-agent per richiesta resta per la review. Haiku è previsto per T6 e T8.
- Escalations: nessuna.

## Deviations From the Plan

- T5: nessun indice (D6 non serve): mediana 22 ms su 100.000 righe.
- `LOG_RETENTION_MONTHS` sta in `@mito/domain/export/period` e il cron `cleanupTaskEventLog` lo importa da lì, invece di avere due costanti uguali (pass `simplify`).
- `romeDay` di `@mito/domain/contact/time` ora è esportata (serve a `selectableDays`).

## Surprises and Decisions

- L'input della procedura è una funzione che costruisce lo schema zod con `now` della richiesta: un periodo fuori limite diventa `BAD_REQUEST` come ogni input non valido.
- `adminSessionProcedure` (D10) = `protectedProcedure` + `enforceIsAdmin`: un admin senza riga operatore riceve i dati, ogni non admin `FORBIDDEN`.
- La query esclude anche `from_state = to_state`, come `isCall`: il log non ne scrive oggi, ma le due definizioni restano uguali.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| `next lint` | ok | PR A e PR B |
| `tsc --noEmit` | ok | PR A e PR B |
| `pnpm run test --run` (Postgres 16) | ok | PR A: 2560 test; PR B: 2681 passati, 1 saltato (prestazioni) |
| `PERF=1 vitest --project pg` sul test di AC21 | ok | mediana 22,2 ms |
| `pnpm build` | ok | PR A e PR B |
| `pnpm api:build` | ok | PR B |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC1, AC2–AC5 | met | #57, #61 |
| AC1b, AC2b | met | T0 (#61) |
| AC7, AC8 | met | T4 (#65) |
| AC9–AC12, AC22 | met | T2, T3, T4 (#65) |
| AC11b | met lato server | T1, T4; la UI in T7b |
| AC21 | met | T5 (#65) |
| AC6, AC13–AC20 | open | PR C e D |

## Remaining Work

- PR C (T6, T7a–T7d) e PR D (T8), da unire insieme (D11).

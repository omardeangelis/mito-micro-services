---
domain: crm
type: implementation-notes
links:
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/export-chiamate/PLAN]]"
  - "[[domains/crm/flows/esito-non-risponde-e-ritorno-in-coda]]"
  - "[[domains/crm/flows/export-chiamate-per-operatore-admin]]"
  - "[[domains/crm/concepts/chiamata]]"
  - "[[domains/crm/concepts/periodo-dell-export]]"
  - "[[domains/crm/concepts/stato-del-contatto]]"
  - "[[specs/crm/export-chiamate/REPORT]]"
ingested: true
last_ingested: 2026-10-23
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
| AC11b | met | T1, T4 (#65), T7b (#66) |
| AC21 | met | T5 (#65) |
| AC6, AC13, AC14, AC16–AC20 | met | T6, T7a–T7d (#66); test dei componenti, controllo nel browser ancora da fare |
| AC15 | met | T8 (#67) |

## Review

Adversarial review su #65: SHIP dai tre pass, report in [[specs/crm/export-chiamate/REPORT]]. Correzioni in 6567319.

### PR C (#66) e PR D (#67)

- T6 e T7a–T7d inline (Opus); T8 su Haiku (regola di Leonardo del 23/10: token ottimizzati). Haiku si è fermato correttamente sulla regola di stop quando `apps/api/src/rest.ts` importava le rotte da rimuovere; approvato il perimetro allargato al backend.
- Deviazione: la sezione è un blocco proprio della dashboard (`CallsSection`, titolo "Chiamate per operatore") e non sta dentro `AdminDataSection`, perché ha un periodo suo, diverso dal timeframe di "Analisi Andamento".
- Deviazione: T6 inline invece che su Haiku (budget di sub-agent per richiesta già usato dalla review di B).
- Il test del backend "su una porta vera" usava `getMessages`; ora usa `POST /api/user/preferences`.
- Periodo di default: ultimi 30 giorni (`defaultPeriod`). `xlsx` si carica solo al click: `/dashboard` passa da 291 kB a 300 kB.
- Review di C+D: SHIP, un MAJOR (stato d'errore) corretto in 42e5972. Vedi [[specs/crm/export-chiamate/REPORT]].

### Allineamento a dev (23/10 sera)

- dev ha portato altre migrazioni (`20261022182741_colossal_lilith`): la migrazione di "non risponde" è rigenerata dopo di loro, come `20261023201234_task_status_non_risponde` (stessa SQL, `customers.id SET DEFAULT` tolto), su #57.
- dev ha spostato `adminProcedure` su `resolveActor` e introdotto la disattivazione degli utenti (gestione-operatori). `adminSessionProcedure` ora legge `users.role` e `users.disabled_at`: un admin disattivato riceve `FORBIDDEN` anche senza riga operatore (test nuovo).
- Su #67, con il vecchio export tolto, `downloadExportFile` accetta solo `error-import-<gg-mm-aaaa>.xlsx` (gli altri nomi danno 404) e `deleteExportFile` è rimossa.

## Remaining Work

- Revisione di Leonardo su #65, #66 e #67 (permessi), poi merge in ordine fino al go/no-go.
- Controllo nel browser con un login reale (admin e operatore).
- Follow-up in [[tech-debt/crm/export-chiamate]].

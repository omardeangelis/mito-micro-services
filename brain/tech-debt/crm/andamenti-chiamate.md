---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/andamenti-chiamate/SPEC]]"
  - "[[specs/crm/andamenti-chiamate/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[tech-debt/crm/export-chiamate]]"
created: 2026-11-10
updated: 2026-11-10
---

# Tech debt: andamenti delle chiamate

## [2026-11-10] Da `implement-spec`, T8

- **[FOLLOW-UP]** In `apps/web` la home dell'admin non ha più l'export «Chiamate per operatore»: `home/_components/export/` e `api/export.ts` (`useCallStats`) sono usciti (D11). Il resto serve ancora alla dashboard di Next, che non si tocca (Next è deprecato):
  - l'endpoint `GET /export/call-stats` (gruppo `export` di `@mito/contract`, handler in `packages/server/src/http/`) e la procedura tRPC che usa lo stesso servizio;
  - `@mito/client/export/callStatsWorkbook`, usato da `src/app/dashboard/_components/export/ExportDownload.tsx`;
  - i falsi del gruppo `export` in `apps/web/src/test/{home,adminHome,api}.ts(x)`, che restano perché il contratto ha ancora il gruppo.
  - Fix: si tolgono tutti insieme quando si spegne Next ([[chore/roadmap-nuovo-stack]]); in `apps/web` nessuna pagina li legge.

## [2026-11-10] Da `implement-spec`, T16 (controllo nel browser), aggiornato dopo la review

- **[FOLLOW-UP]** A 375 px la sezione «Andamento delle chiamate» della home aveva due difetti; dopo le correzioni della review ([[specs/crm/andamenti-chiamate/REPORT]], giro 2) la riga dei periodi va a capo dentro la scheda e le righe del titolo e del tasso crescono invece di coprire il grafico. Resta da guardare col layout del telefono, che Omar ha rinviato alla fine per tutta l'app React: le voci dei periodi su più righe e il collegamento attaccato al titolo quando va a capo (`ChartHead` senza `gap-y`).

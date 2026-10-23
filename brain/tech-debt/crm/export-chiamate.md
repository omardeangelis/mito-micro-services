---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/export-chiamate/REPORT]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
created: 2026-10-23
updated: 2026-10-23
---

# Tech debt: export delle chiamate

## [2026-10-23] From review [[specs/crm/export-chiamate/REPORT]]

Il cambio (PR #65) è uscito con verdetto SHIP. Queste voci non violano un criterio di accettazione.

- **[FOLLOW-UP]** Il cutoff del cleanup di `task_event_log` è in UTC (`packages/server/src/services/cron/cleanupTaskEventLog.ts`), il periodo selezionabile in giorni di Roma (`packages/domain/src/export/period.ts`).
  - Perché resta: cambiarlo cambia il comportamento del cron, fuori dallo scope della PR.
  - Effetto: se il job gira tra 00:00 e 02:00 di Roma e "3 mesi fa" cade dopo un 30 o 31 (es. 2026-05-30T23:30Z), si perde fino a un'ora del primo giorno selezionabile.
  - Fix: cutoff = `periodBounds({ from: selectableDays(now).first, to: … }).start`, oppure schedule fissato fuori da quella fascia e scritto in `apps/api/gcp/`.
- **[FOLLOW-UP]** Nessun test HTTP su Hono per `export.callStats` (FORBIDDEN senza ruolo admin, UNAUTHORIZED senza sessione). Oggi è coperto per costruzione: apps/api monta lo stesso `appRouter`.
  - Fix: un caso in `apps/api/src/_test/app.db.test.ts`.

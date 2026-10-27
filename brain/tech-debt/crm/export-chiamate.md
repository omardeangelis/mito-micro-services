---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/export-chiamate/REPORT]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
created: 2026-10-23
updated: 2026-10-27
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

## [2026-10-23] From review [[specs/crm/export-chiamate/REPORT]] (PR C+D)

- **[RISOLTO 2026-10-23, a4f73d6 in #67]** `supabase.downloadExportFile` è `protectedProcedure` e legge qualunque nome sotto `export/` (`packages/server/src/api/routers/supabase/route.ts`). Dopo la PR D serve solo per gli `error-import-*` dell'import.
  - Fix: accettare solo `error-import-<gg-mm-aaaa>.xlsx` (cambia le asserzioni di `storage.db.test.ts`, quindi va concordato).
- **[RISOLTO 2026-10-23, a4f73d6 in #67: rimossa]** `supabase.deleteExportFile` è `protectedProcedure` e non ha chiamanti: qualunque utente può svuotare `export/`.
  - Fix: rimuoverla (il cron usa `deleteExportFiles` direttamente) o passarla ad `adminSessionProcedure`.
- **[CHIUSO 2026-10-26: non si fa]** Un admin senza riga operatore non vede la sezione "Chiamate per operatore": `CallsSection` legge il ruolo da `user.getUserPreference`, che fa `innerJoin` su `operators`.
  - Fix: leggere `users.role` con una `leftJoin`, come fa `enforceIsAdmin`.
  - Perché non si fa: per la regola "ogni utente è un operatore" (decisione di Omar del 2026-10-26, [[domains/crm/concepts/operatore]]) un utente senza riga operatore è un'anomalia. Dalla [PR #101](https://github.com/omardeangelis/mito-micro-services/pull/101) `export.callStats` è `adminProcedure` e gli risponde `BAD_REQUEST`, come `getUserPreference`.
- **[CLEANUP]** `exceljs` in `package.json` non ha import. `Storage.signedUploadUrl` non ha più chiamanti dopo la rimozione di `createExportUploadUrl`.
- **[CLEANUP]** `brain/chore/migration/fase-2-backend-express.md` e `fase-3-frontend-spa.md` citano ancora le rotte `/api/export/[export]/*`, che non esistono più.


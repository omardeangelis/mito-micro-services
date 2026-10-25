---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/pratiche-effect/SPEC]]"
  - "[[specs/crm/pratiche-effect/PLAN]]"
  - "[[specs/crm/pratiche-effect/REPORT]]"
  - "[[specs/crm/pratiche-effect/IMPLEMENTATION-NOTES]]"
  - "[[chore/migrazione-effect]]"
created: 2026-10-25
updated: 2026-10-25
---

# Tech debt: router `pratiche` e letture di `task` su Effect

Le stranezze di comportamento che il refactor aveva conservato sono in TD9 di [[chore/migrazione-effect]], corrette nello stesso branch (2026-10-25). Qui va il resto del debito che il passo ha trovato o lasciato. I rilievi durevoli della review li aggiunge `docs-maintenance` quando ingerisce [[specs/crm/pratiche-effect/REPORT]].

## [2026-10-25] From implementation [[specs/crm/pratiche-effect/IMPLEMENTATION-NOTES]]

- **[RESOLVED]** La modifica di email e telefono del cliente dal dettaglio di una pratica non salvava niente — `src/app/dashboard/pratiche/[id]/_components/CustomerSection.tsx` (input nascosto dell'id)
  - Era: l'input era `type="number"` e gli id dei clienti sono testo, quindi il browser lo svuotava, il server action mandava `id: ''` e `updateCustomerPreview` aggiornava zero righe senza errore. C'era già a `5b61b3f`; trovato nella prova nel browser (T11.5).
  - Risolto: l'input è `type="hidden"`. Il test `CustomerSection.test.tsx` legge i dati del form e trova l'id del cliente; era rosso con `id: ''` prima della correzione. TD9 (h) e (i) restano: la procedura accetta ancora un `id` mancante e un input senza campi.
- **[RESOLVED]** L'assegnazione massiva delle pratiche non aveva un pulsante, ma la procedura era raggiungibile — `src/app/dashboard/pratiche/_components/PraticesTable.tsx` (riga di `BulkActionDialog` commentata)
  - Era: il dialog era commentato anche su `main`, ma `pratiche.bulkAssignPractices` (`operatorProcedure`) restava chiamabile via HTTP da ogni `OPERATORE`.
  - Risolto: l'assegnazione massiva delle pratiche non si deve poter fare (decisione dell'utente, 2026-10-25). Tolti la riga commentata, `BulkActionDialog.tsx`, `_actions/bulkUpdateAction.ts`, `store/usePracticeTableStore.ts`, la procedura `bulkAssignPractices`, il servizio `assignPractices` e i loro test. TD9 (k) non ha più oggetto.
- **[FOLLOW-UP]** I servizi del passo ricevono il chiamante in una forma diversa da quelli di `contact`: `listPractices` riceve `Pick<ResolvedOperator, "id" | "role">` e `bulkHandleTask` un `actorOperatorId`, gli altri un `actor: Actor` (regola 1 del §2 di [[chore/migrazione-effect]]) — `packages/server/src/services/practice/list.ts:49`, `packages/server/src/services/contact/bulkHandleTask.ts:199`
  - Why it persists: firme decise nel PLAN (§3, T7, T10), come nel passo 2; proposta di `simplify`.
  - Fix-or-evidence needed: allinearle a `Actor` prima di L3, insieme al middleware `CurrentUser`.

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

Le stranezze di comportamento che il refactor ha conservato sono in TD9 di [[chore/migrazione-effect]], non qui. Qui va il resto del debito che il passo ha trovato o lasciato. I rilievi durevoli della review li aggiunge `docs-maintenance` quando ingerisce [[specs/crm/pratiche-effect/REPORT]].

## [2026-10-25] From implementation [[specs/crm/pratiche-effect/IMPLEMENTATION-NOTES]]

- **[OPEN]** La modifica di email e telefono del cliente dal dettaglio di una pratica non salva niente — `src/app/dashboard/pratiche/[id]/_components/CustomerSection.tsx` (input nascosto dell'id)
  - Why it persists: c'era già a `5b61b3f`, ed è nella UI, fuori dal perimetro del passo (AC13). L'input è `type="number"` e gli id dei clienti sono testo, quindi il browser lo svuota, il server action manda `id: ''` e `updateCustomerPreview` aggiorna zero righe senza errore. Trovato nella prova nel browser (T11.5).
  - Fix-or-evidence needed: un input di testo (o l'id fuori dal form), con un test del componente che legga l'id inviato. Insieme a TD9 (h) e (i), che rendono `id` obbligatorio e vogliono almeno un campo.
- **[OPEN]** L'assegnazione massiva delle pratiche non ha un pulsante — `src/app/dashboard/pratiche/_components/PraticesTable.tsx` (riga di `BulkActionDialog` commentata)
  - Why it persists: c'era già, anche su `main`. `bulkAssignPractices` resta raggiungibile solo da `bulkUpdateAction.ts`, che nessun componente monta.
  - Fix-or-evidence needed: decidere se la funzione torna nella UI o se procedura e server action si tolgono; insieme a TD9 (k).
- **[FOLLOW-UP]** I servizi del passo ricevono il chiamante in una forma diversa da quelli di `contact`: `listPractices` riceve `Pick<ResolvedOperator, "id" | "role">` e `bulkHandleTask` un `actorOperatorId`, gli altri un `actor: Actor` (regola 1 del §2 di [[chore/migrazione-effect]]) — `packages/server/src/services/practice/list.ts:49`, `packages/server/src/services/contact/bulkHandleTask.ts:199`
  - Why it persists: firme decise nel PLAN (§3, T7, T10), come nel passo 2; proposta di `simplify`.
  - Fix-or-evidence needed: allinearle a `Actor` prima di L3, insieme al middleware `CurrentUser`.

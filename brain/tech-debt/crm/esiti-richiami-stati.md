---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/esiti-richiami-stati/SPEC]]"
  - "[[specs/crm/esiti-richiami-stati/IMPLEMENTATION-NOTES]]"
  - "[[chore/roadmap-nuovo-stack]]"
created: 2026-11-02
updated: 2026-11-02
---

# Tech debt: esiti, richiami e stati del contatto

Il debito che resta per lo spegnimento di Next.js (valori vecchi del tipo, funzioni del dominio, procedure tRPC) è TD13 di [[chore/roadmap-nuovo-stack]]. Qui c'è quello che l'implementazione ha trovato fuori dalle sue AC, e che resta.

## [2026-11-02] Da `implement-spec`

- **[FOLLOW-UP]** I test del server girano su un driver che accetta una `Date` come parametro di un `sql\`\`` scritto a mano, il driver reale no: `getContacts` rispondeva 500 su ogni lista e solo la prova nel browser l'ha visto (corretto in `1c120714`, con `toISOString()::timestamptz`). Un altro `sql\`\`` con una `Date` passerebbe i test allo stesso modo.
  - Fix: una regola ESLint o un test che fa girare le query della lista e del dettaglio su `test:pg` (driver reale).
- **[FOLLOW-UP]** Con `TestClock` l'orologio è fermo, quindi nessun test vede due letture del `Clock` diverse nella stessa azione. Così una chiamata e la chiusura del suo alert avevano istanti diversi di qualche millisecondo, e lo Storico le mostrava nell'ordine sbagliato (corretto in `1c120714`: `resolveOpenAlert` prende `at`). Nessun test lo protegge.
  - Fix: un test con un `Clock` scritto a mano che avanza a ogni lettura, come in `services/import/_test/`.
- **[FOLLOW-UP]** La cella dello stato della lista e il dettaglio ripetono lo stesso scheletro di invio, conferma e rifiuto di «Registra chiamata» (`ContactRowState.tsx`, `ContactCallSection.tsx`). La cella ha due `AlertCloseConfirmDialog`, e dopo una chiamata la riga si ricarica due volte.
  - Fix: un hook comune per la registrazione con la conferma.
- **[FOLLOW-UP]** La query delle chiamate del dettaglio (`getContactById`) legge tutte le righe del registro del cliente, senza limite.
- **[FOLLOW-UP]** Il seed tiene il collegamento `task.alert_id` sugli alert chiusi dei contatti passati, che `resolveOpenAlert` stacca: il dato del seed differisce da quello reale in questo punto.

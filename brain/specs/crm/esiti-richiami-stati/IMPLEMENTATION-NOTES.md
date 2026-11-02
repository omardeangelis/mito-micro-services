---
domain: crm
type: implementation-notes
spec: esiti-richiami-stati
links:
  - "[[specs/crm/esiti-richiami-stati/SPEC]]"
ingested: false
last_ingested: null
created: 2026-11-02
updated: 2026-11-02
---

# Implementation Notes

## Summary

- In corso, branch `claude/esiti-richiami-stati` da `dev` dopo la PR #147.

## Execution Mode

- Mode: `parallel`, per onde come in PLAN §8 (dentro un'onda nessun file è toccato da due task).
- Delegation: `supervised`. Tier dal campo `complexity`: low → haiku, medium → sonnet, high → modello dell'orchestratore. L'orchestratore scrive il test RED o lo fa scrivere al worker come primo passo con l'output rosso riportato, e rivede ogni diff.
- Escalations: nessuna finora.

## Deviations From the Plan

- Il worker scrive il test RED come primo passo e ne riporta l'output rosso; il supervisore lo controlla nella revisione invece di scriverlo lui (per contenere il contesto dell'orchestratore su 20 task).
- D2 non vale fra T2 e T19 per `src/server/db/seeds/local/_test/contacts.test.ts` (progetto unit): controlla che il seed scriva ogni azione del registro, e `call` arriva nel seed con T19. Rosso noto, 8 casi.
- T2 ha toccato 6 test di migrazioni vecchie (tabelle legacy in `src/test/legacy.ts`, `ALTER` nel `beforeAll` di `bulkHandleTask.legacy`): leggevano o scrivevano con lo schema attuale su un database fermo a un tag vecchio. Asserzioni invariate.

## Surprises and Decisions

- Prova nel browser (2026-11-02, operatore del seed, mito_local dell'altro worktree con il seed nuovo, `seed:local:verify` tutto passato): Non risponde, Richiamare, «Togli il richiamo» con Appuntamento e il selettore ridotto funzionano nel dettaglio senza ricaricare.
- Trovati nel browser e corretti dal supervisore: (1) `getContacts` passava una `Date` dentro `sql\`\`` e il driver reale rispondeva 500 su ogni lista (i test, su un altro driver, la accettavano): ora `toISOString()::timestamptz`, come `import/apply.ts`. (2) La chiusura dell'alert fatta da una chiamata aveva `resolved_at` 17 ms dopo la chiamata, e lo Storico metteva la chiusura sopra la chiamata (AC16): `resolveOpenAlert` prende `at`, e `registerCall` passa il suo `now`. Nessuno dei due si riproduce nei test con `TestClock` o col driver dei test.

- `db:local:up` di questo worktree non parte: la porta 54329 è del container di un altro worktree (`pr5-plan-analysis-checks-6c543e`), su cui T2 ha applicato le due migrazioni nuove (solo aggiunte). Le prove nel browser e la prova di carico pg vanno fatte con un database di questo worktree.
- T10: lo schema dei filtri accetta ancora i valori vecchi, che il server mappa sul nuovo stato (`followup`/`nessuno` → Da chiamare, `erogata` → Pratica caricata), perché `packages/client` e Next lo usano (D18). Restringerlo è debito per quando Next si spegne.
- T3: l'assegnazione massiva non scrive più `alert_resolved` se il contatto punta a un alert già chiuso (prima sì). Caso limite, accettato.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|

## Remaining Work


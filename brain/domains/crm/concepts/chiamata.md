---
domain: crm
type: concept
status: implemented
ingested: true
last_ingested: 2026-10-23
links:
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/export-chiamate/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/export-chiamate/REPORT]]"
  - "[[tech-debt/crm/export-chiamate]]"
  - "[[domains/crm/flows/export-chiamate-per-operatore-admin]]"
  - "[[domains/crm/flows/esito-non-risponde-e-ritorno-in-coda]]"
  - "[[domains/crm/concepts/stato-del-contatto]]"
created: 2026-10-23
updated: 2026-10-23
---

# Chiamata

## Definition

**Chiamata effettuata**: un cambio di stato fatto da un operatore, a mano (lista o dettaglio del contatto), da uno stato "da chiamare" (`chiamare`, `followup`, `non risponde`) o da `richiamare`, verso un esito (`app.to`, `caricato`, `erogata`, `non interessato`, `richiamare`) o verso `non risponde`. Conta per l'operatore che ha fatto il cambio, nel giorno in cui l'ha fatto; ogni cambio conta una volta. Si conta dal registro dei cambi di stato (`task_event_log`), non da "Contattato il".

## Attributes

| Termine | Regola |
|---|---|
| Chiamata effettuata | cambio manuale come sopra |
| Non risposta | chiamata il cui stato di arrivo è `non risponde` |
| Risposta | chiamata che non è una non risposta: **risposte = chiamate − non risposte** |
| Appuntamento fissato | chiamata con arrivo `app.to`; è anche una risposta |
| Quota di appuntamenti | appuntamenti / risposte, 0 senza risposte (classifica) |

Non sono chiamate (AC10): un cambio tra due esiti (es. `app.to` → `caricato`), da un esito a `chiamare`, un'azione massiva o del sistema, e un cambio con stato di partenza uguale a quello di arrivo. Da `richiamare` ad `app.to` è chiamata e appuntamento.

## Related flows

- [[domains/crm/flows/export-chiamate-per-operatore-admin]]
- [[domains/crm/flows/esito-non-risponde-e-ritorno-in-coda]]

## [Source: SPEC + IMPLEMENTATION-NOTES]

- Codice: `packages/domain/src/export/calls.ts` (`isCall`, `callFromStates`, `callToStates`, `sortByCalls`, `rankByAppointmentRate`, `totalsOf`); conteggio SQL in `packages/server/src/services/export/callStats.ts` (azione `state_change`, sorgente `detail` o `list`).
- La query esclude anche `from_state = to_state`, come `isCall`.
- Open question 1 della spec (la richiamata conta come chiamata): applicato il default, sì. Open question 4: un admin con riga operatore compare come gli altri.

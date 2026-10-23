---
domain: crm
type: concept
status: implemented
ingested: true
last_ingested: 2026-10-23
links:
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/export-chiamate/IMPLEMENTATION-NOTES]]"
  - "[[domains/crm/flows/esito-non-risponde-e-ritorno-in-coda]]"
  - "[[domains/crm/concepts/chiamata]]"
created: 2026-10-23
updated: 2026-10-23
---

# Stato del contatto (solo `non risponde`)

> [!warning] Sintesi parziale
> Questa pagina descrive soltanto lo stato `non risponde` e le transizioni che la spec export-chiamate fissa. Gli altri stati e le loro regole non sono ancora sintetizzati.

## Definition

`non risponde` è uno stato "da chiamare" (in coda) che l'operatore imposta a mano quando il cliente non risponde. Esiste per contare le non risposte: `richiamare` significa già "il cliente ha chiesto di essere richiamato".

## Attributes

| Aspetto | Regola |
|---|---|
| Entrata | da ogni stato da cui oggi si sceglie un esito (AC1) |
| Uscita | a ogni esito e a `nessuno`; mai a `chiamare` né `followup` (AC1b) |
| Contattato il | non valorizzato da `chiamare`/`followup`; invariato da `richiamare`; alla chiusura prende la data del cambio (AC2, AC2b, AC3) |
| Coda | resta attivo e assegnato allo stesso operatore; priorità 100 senza priorità personalizzata, sotto `chiamare` (120) (AC2, AC4) |
| Richiamo | "Imposta richiamo" non disponibile (AC5) |

## Related flows

- [[domains/crm/flows/esito-non-risponde-e-ritorno-in-coda]]

## [Source: SPEC + IMPLEMENTATION-NOTES]

- Codice: `packages/domain/src/contact/status.ts` (`callStates`, `isAllowedChange`, `selectableStates`). L'enum richiede una migrazione (PR #57, #61).

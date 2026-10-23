---
domain: crm
type: index
links:
  - "[[domains/crm/crm-contract]]"
  - "[[domains/crm/flows/esito-non-risponde-e-ritorno-in-coda]]"
  - "[[domains/crm/flows/export-chiamate-per-operatore-admin]]"
  - "[[domains/crm/concepts/chiamata]]"
  - "[[domains/crm/concepts/periodo-dell-export]]"
  - "[[domains/crm/concepts/stato-del-contatto]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
created: 2026-10-23
updated: 2026-10-23
---

# Dominio CRM

> [!warning] Sintesi parziale
> Per ora il dominio contiene solo ciò che stabilisce la spec [[specs/crm/export-chiamate/SPEC|export-chiamate]]. Le altre spec del dominio (vedi [[specs/crm/crm-specs|crm-specs]]) non sono ancora ingerite.

- Contratto: [[domains/crm/crm-contract]]

## Flussi

- [[domains/crm/flows/esito-non-risponde-e-ritorno-in-coda]] — l'operatore segna "non risponde" e il contatto resta in coda
- [[domains/crm/flows/export-chiamate-per-operatore-admin]] — l'admin sceglie un periodo e vede i numeri per operatore, grafici e file Excel

## Concetti

- [[domains/crm/concepts/chiamata]] — che cosa conta come chiamata effettuata, risposta, non risposta, appuntamento
- [[domains/crm/concepts/periodo-dell-export]] — giorni di Roma, ultimi 3 mesi, dati completi dal 15/09/2026
- [[domains/crm/concepts/stato-del-contatto]] — solo lo stato `non risponde` e le sue transizioni

## Decisioni

_nessuna ancora_ (`decisions/`). Il Decision Log della spec è in [[specs/crm/export-chiamate/SPEC]].

## Debito tecnico

- [[tech-debt/crm/export-chiamate]]

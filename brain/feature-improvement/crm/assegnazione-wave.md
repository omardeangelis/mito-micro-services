---
domain: crm
type: feature-improvement
spec: assegnazione-wave
links:
  - "[[specs/crm/assegnazione-wave/SPEC]]"
  - "[[personas]]"
created: 2026-11-03
updated: 2026-11-03
---

# Feature improvement: Import e assegnazione della Wave

Evolutive della funzionalità di [[specs/crm/assegnazione-wave/SPEC]].

## Scadenza dei clienti presa da «data_scadenza» del file
- **Status:** open
- **Proposed:** 2026-11-03, da Omar durante `create-spec` della spec di import e assegnazione della Wave, come evolutiva futura
- **Observed:** il formato Wave ha la colonna obbligatoria «data_scadenza» (`packages/domain/src/import/formats.ts:89`, tipata in `packages/domain/src/import/convert/rows.ts:91`). Serve solo a riconoscere il formato: `convert/wave.ts` non la legge e non viene salvata da nessuna parte. Nel file vero (`Wave-load.xlsx`, 388 righe) ha lo stesso valore su tutte le righe, nel formato `27FEB2024`. La spec propone sempre oggi + 30 e l'Admin la conferma a mano (AC6)
- **Improvement:** l'import legge «data_scadenza» e assegna da solo una scadenza a ogni cliente della Wave, invece di una scadenza unica scelta dall'Admin per tutta la Wave. Prima va chiarito cosa significa la data per la banca (per Omar potrebbe riguardare la pratica, non la chiamata) e quale scadenza vale per un cliente presente in più Wave aperte
- **Why it matters:** l'Admin non deve scegliere né confermare la scadenza a ogni import. L'Operatore chiama ogni cliente entro la data che arriva dalla banca, e la coda di Da chiamare segue quella data
- **Size:** medium
- **Spec:** none

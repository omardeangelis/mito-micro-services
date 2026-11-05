---
domain: crm
type: review-rubric
scope: spec
spec: home-operatore
links:
  - "[[specs/crm/home-operatore/REPORT]]"
created: 2026-11-05
updated: 2026-11-05
---

# Review Rubric: Home dell'operatore

## Change set under review

- **Scope:** spec implementation
- **Target:** working tree del branch `claude/home-spec-dopo-wave`, non committato
- **Compared:** `origin/dev` → working tree
- **Files touched:** 94 fuori da `brain/`, dominio crm

## Routing rubric (review-classifier output)

- `taskType`: feature; `secondaryType`: refactor
- `taskComplexity`: high; `reviewImpact`: critical; `humanInLoop`: true
- Cinque passi:

| Id | Charter | Complessità |
|---|---|---|
| v1 | Auth, identità e isolamento fra utenti: login rapido, gruppo `home`, dati personali | high |
| v2 | Esattezza delle letture server e del contratto | high |
| v3 | Macchina a stati client della registrazione | high |
| v4 | Innesto nella vista esistente e regressioni sui consumatori condivisi, overlay AC53 | medium |
| v5 | UI pass su `/dashboard` e `/dashboard/lavoro` | medium |

## Motivazione

Impatto critico: il cambiamento tocca `devLogin.ts`, ed espone telefoni e messaggi dei clienti su quattro endpoint nuovi, con un isolamento che vale anche per gli ADMIN. Nessun passo motion-craft: nessuna animazione nuova. Il seed è solo dati di sviluppo. La spec non ha `STATES.md`, e `brain/chore/ui-review.md` non c'è.

## Overrides

Nessuno.

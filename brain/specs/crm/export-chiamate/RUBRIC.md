---
domain: crm
type: review-rubric
scope: spec
spec: export-chiamate
links: ["[[export-chiamate/REPORT]]"]
created: 2026-10-23
updated: 2026-10-23
---
# Review Rubric: export-chiamate T1–T5 (callStats lato server)

## Change set under review
- **Scope:** implementazione della spec (case B): AC7, AC8, AC9–AC12, AC11b lato server, AC21, AC22
- **Target:** branch `claude/export-call-stats` (PR #65)
- **Compared:** `origin/claude/export-non-risponde-in-coda` → `origin/claude/export-call-stats`
- **Files touched:** 14 (+816/−3), un solo dominio: crm

## Routing rubric (review-classifier)
- taskType `feature`, secondaryType `security`; reviewImpact `critical`; humanInLoop `true`
- 3 adversarial-verifier, budget del progetto (massimo 3 pass, concern accorpati)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Auth: `adminSessionProcedure` e `export.callStats` rifiutano un non-admin anche senza riga operatore con FORBIDDEN (AC7) e una richiesta senza sessione con UNAUTHORIZED (AC8); `adminProcedure` invariato; la risposta contiene solo totali per operatore (AC22) | high | strongest |
| v2 | Conteggio (AC9/AC10), answered = calls − noAnswer, ordinamento e totali (AC12), confini Roma con DST (AC11), validazione del periodo e fine mese (AC11b), costante della retention nel cron di cleanup invariata | high | strongest |
| v3 | Performance (AC21) e indici; regole di `packages/server` (niente Next.js, `server-only` nel bundle Hono); convenzioni Effect; gates CI; factory `createTaskEvent` | medium | balanced |

## Classifier rationale
Il change set introduce un procedure admin che non richiede la riga operatore e restituisce dati aggregati degli operatori: tocca auth e la superficie PII, quindi `critical`. La SPEC vieta il merge autonomo delle PR sui permessi: il report si chiude con una checklist per Leonardo.

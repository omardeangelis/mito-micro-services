---
domain: crm
type: review-rubric
scope: spec
spec: import-pratiche
links:
  - "[[specs/crm/import-pratiche/REPORT]]"
created: 2026-10-25
updated: 2026-10-25
---

# Review Rubric: import-pratiche, PR A–G

## Change set under review

- **Scope:** spec implementation
- **Target:** la catena #77 (A) → #78 (B) → #85 (E, con C #81) → #88 (F) → #89 (G), più #82 (D) da `dev`
- **Compared:** `2b284b4` (merge-base con `origin/dev`) → `origin/claude/import-cleanup` (`bb956d6`); D: `origin/dev...origin/claude/import-coda`
- **Files touched:** 150 + 2, in `crm` (import): dominio (`packages/domain/src/import`), schema e migrazione (`packages/db`), servizi e procedure (`packages/server/src/services/import`, `routers/import`), backend (`apps/api/src/import`, `oidc.ts`, `rest.ts`), UI (`src/lib/import`, `src/app/dashboard/import`, `src/app/_context/ImportStatus.tsx`, `src/trpc/links.ts`), rimozione del vecchio import, script della coda (`apps/api/gcp`)

## Routing rubric (inline)

```json
{
  "taskType": "feature",
  "secondaryType": "security",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 4,
    "passes": [
      { "id": "v1", "charter": "Permessi, sicurezza e dati personali: solo admin (AC1–AC3), rimozione di rotte e procedure vecchie (AC4), OIDC delle rotte interne e della coda, nessun valore delle righe in log, console, storico o motivi (AC31), migrazione solo additiva", "complexity": "critical" },
      { "id": "v2", "charter": "Correttezza delle scritture e concorrenza: tutto o niente, lock ordinati, retry, un import alla volta, consegna ripetuta, scadenza e pulizia, numeri del riepilogo (AC19–AC24, AC27, AC29, AC30, AC34–AC39)", "complexity": "high" },
      { "id": "v3", "charter": "Regole del dominio e parità con l'import di oggi: formati, classificazione, motivi, raggruppamento, piano, date di Roma, testi in italiano (AC5–AC13, AC32, AC33, AC38, AC40)", "complexity": "medium" },
      { "id": "v4", "charter": "UI pass (DEGRADED, solo codice) e client: worker, anteprima, report errori, invio a parti, pagina, storico, avviso di fine, tastiera e lettori di schermo (AC5–AC8, AC14–AC18, AC21, AC26, AC28, AC40, AC41)", "complexity": "medium" }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "4 verifier in parallelo; poi REPORT con la checklist per Leonardo"
}
```

## Classifier rationale

Rubric scritta inline, senza il `review-classifier`, come per l'export: il change set è noto e il dominio è uno, e il budget del progetto è di 5 sub-agent per richiesta. L'impatto è critical perché la catena tocca permessi (procedure solo admin, rotte interne con OIDC), una migrazione, dati personali dei clienti e la configurazione del deploy. Quattro pass perché le aree non si sovrappongono: sicurezza, scrittura nel database, regole pure del dominio, client.

## Overrides applied

- Nessun classifier (vedi sopra).
- Il pass UI è insieme al client: un quinto verifier supererebbe il budget. È `DEGRADED`: nel container la pagina non si serve, perché servono il login Azure e un `.env` che qui non ci sono.

## Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Permessi, sicurezza, dati personali | critical | strongest |
| v2 | Scritture e concorrenza | high | strongest |
| v3 | Regole del dominio e parità | medium | balanced |
| v4 | UI (DEGRADED) e client | medium | balanced |

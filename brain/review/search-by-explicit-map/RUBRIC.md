---
domain: crm
type: review-rubric
scope: standalone
spec: null
links:
  - "[[review/search-by-explicit-map/REPORT]]"
created: 2026-10-15
updated: 2026-10-15
---

# Review Rubric: search_by con mappa esplicita (Clienti e Pratiche)

## Change set under review

- **Scope:** standalone
- **Target:** branch `claude/pensive-noether-ccj66j` (commit `a6b816f`, `0aa3c52`)
- **Compared:** `659984fcaf525805017c1296f03a0c73d5da439f` (merge-base con `origin/dev`) → `0aa3c52`
- **Files touched:** 11 across domains: crm

## Routing rubric (review-classifier output)

```json
{
  "taskType": "bugfix",
  "secondaryType": "refactor",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 7,
    "passes": [
      { "id": "v1", "charter": "SQL construction safety: q e searchBy non entrano nel testo SQL, lookup sulla mappa solo dopo lo zod enum (niente __proto__/constructor), or(...) mai vuoto, wildcard %/_ in q (pre-esistente o nuovo). File: customer/GET/index.ts, pratiche/GET/index.ts, lib/constants/customerSearch.ts", "complexity": "medium" },
      { "id": "v2", "charter": "Mappa colonne vs schema DB: ogni colonna mappata esiste ed è testo; fiscalCode -> [fiscalCode, vatCode] come prima; default pratiche 'id' -> 'praticaId' come cambio di comportamento. File: schema/customers.ts, schema/pratiche.ts, le due mappe", "complexity": "low" },
      { "id": "v3", "charter": "Valori del selettore Clienti vs enum: ogni colonna con enableColumnFilter in CustomerColumns.tsx e il suo accessorKey è nell'enum? Per quelli fuori enum, comportamento base vs head e regressione sì/no. File: CustomerColumns.tsx, TableFilterSections.tsx, customerSearch.ts", "complexity": "medium" },
      { "id": "v4", "charter": "Chiamanti e parsing lato pagina: tutti i chiamanti di getAllCustomers/getAllPratiche, cosa arriva come searchBy con search_by assente, valido, sconosciuto, ripetuto; commenti italiani vs codice; LastUpdatedTableSection; selettore pratiche manda sempre praticaId. File: CustomerTableSection.tsx, pratiche/page.tsx, LastUpdatedTableSection.tsx, pratiche TableFilterSection.tsx", "complexity": "medium" },
      { "id": "v5", "charter": "Qualità dei test: ogni it fallirebbe sulla base? Seed che matchano una sola riga, valori dell'enum/selettore senza test, correttezza di createPractice. File: i due *.db.test.ts, test/factories.ts", "complexity": "medium" },
      { "id": "v6", "charter": "Esecuzione dei gate: tsc, next lint, test mirati, test completi, pnpm build in un git worktree senza env file con i placeholder. Mai script :prod o NODE_ENV=production", "complexity": "low" },
      { "id": "v7", "charter": "Convenzioni di progetto: regola Effect applicabile o no alle righe toccate, lingua dei commenti, residui (SearchBy<T> inutilizzato, @ts-expect-error rimossi), hunk fuori scope. File: CLAUDE.md, review.diff, lib/types/index.ts", "complexity": "low" }
    ]
  },
  "taskComplexity": "medium",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run v1-v7 as 7 independent parallel adversarial-verifier passes on haiku (user constraint). Write REPORT.md with a Human Review Checklist: manual test of every Clienti selector column, confirm pratiche default 'id' -> 'praticaId', confirm BAD_REQUEST on unknown search_by for direct tRPC callers, confirm the four gates are green."
}
```

Le charter complete (con i percorsi esatti e le domande puntuali) sono nell'output del classifier e sono passate verbatim ai verifier. Qui sono riassunte.

## Classifier rationale

`search_by` e `q` arrivano dall'URL e finiscono in condizioni SQL `ilike`: è la superficie "input non fidato / costruzione SQL", quindi l'impatto è forzato a `critical` con un umano nel loop. Ma Drizzle passa `q` come parametro e l'enum restringe `search_by`, quindi la checklist resta corta. Sette pass stretti (3-4 file ciascuno, una domanda verificabile) perché i verifier girano su un modello piccolo. Nessuna UI pass né motion pass: le righe `.tsx` toccate sono import, tipi e parsing di `search_by`. Durante la mappatura il classifier ha notato che il selettore Clienti offre anche `comune` (`CustomerColumns.tsx:252`), che l'enum non contiene: v3 è scoped per confermarlo o escluderlo.

## Overrides applied

- **Modello:** tutti i pass girano su haiku per richiesta esplicita dell'utente, invece della mappatura per complessità (v1, v3, v4, v5 sarebbero andati sul modello di fascia media). Il classifier ha disegnato i pass apposta per un modello piccolo.
- Nessun altro override: `critical ⇒ humanInLoop: true` è coerente, i pass non si sovrappongono.

## Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | SQL construction safety | medium | haiku (override) |
| v2 | Mappa colonne vs schema DB | low | haiku |
| v3 | Selettore Clienti vs enum | medium | haiku (override) |
| v4 | Chiamanti e parsing lato pagina | medium | haiku (override) |
| v5 | Qualità dei test | medium | haiku (override) |
| v6 | Esecuzione dei gate | low | haiku |
| v7 | Convenzioni di progetto | low | haiku |

## Secondo giro (head `6057e5b`)

Il classifier è stato rilanciato sul cambio dopo le correzioni (diff completo da `659984f` e diff del solo `6057e5b`), con le finding del primo giro da confermare o smentire. Il RUBRIC è rimasto nello scratchpad finché i verificatori non hanno finito.

```json
{
  "taskType": "bugfix",
  "secondaryType": "refactor",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 8,
    "passes": [
      { "id": "v1", "charter": "Gate in un git worktree senza env file: next lint, tsc, pnpm run test --run, pnpm build con i placeholder; contare i test di ricerca. Mai script NODE_ENV=production", "complexity": "low" },
      { "id": "v2", "charter": "Finding 1 e 4: ogni voce del selettore Clienti è nell'enum e mappa a una colonna testo esistente (comune compreso); commenti accurati; residui di nome/telefono", "complexity": "low" },
      { "id": "v3", "charter": "Finding 2: aggiungere un valore all'enum senza etichetta o colonna fa fallire tsc? searchByItems solo da customerSearchBy.options; @ts-expect-error e cast rimasti", "complexity": "low" },
      { "id": "v4", "charter": "Finding 3 e 6: badge e server nominano lo stesso campo con search_by assente, valido, sconosciuto, vuoto, ripetuto; Select e URL usano il valore; fallback testati tramite la stessa funzione; stessa traccia per Pratiche", "complexity": "medium" },
      { "id": "v5", "charter": "Finding 7: containsPattern fa l'escape di \\, %, _ in un passaggio; ILIKE con escape di default e parametro bound; ogni ilike su q passa da lì; search_by arriva all'SQL solo come chiave delle mappe", "complexity": "medium" },
      { "id": "v6", "charter": "Finding 5 e contratti ristretti: riferimenti a SearchBy<; chiamanti di getAllCustomers/getAllPratiche; scrittori in-app di search_by fuori dagli enum", "complexity": "low" },
      { "id": "v7", "charter": "Finding 8: ogni titolo di test è provato dalle sue asserzioni; mutazioni mentali (escape tolto, z.string(), primo elemento dell'array); seed che matchano una sola riga", "complexity": "medium" },
      { "id": "v8", "charter": "UI pass statico sul selettore e sulle etichette: nome accessibile, coerenza delle etichette, larghezze. Nessun server: claim da misurare come UNVERIFIED", "complexity": "low" }
    ]
  },
  "taskComplexity": "medium",
  "reviewImpact": "critical",
  "humanInLoop": true
}
```

Le charter complete con i percorsi e le domande puntuali sono state passate verbatim ai verificatori; qui sono riassunte.

### Overrides applied

- **Modello:** tutti i pass su haiku, per richiesta dell'utente (v4, v5, v7 sarebbero andati sul modello di fascia media).
- **UI pass:** DEGRADED, solo codice. La pagina richiede login e database, e il `.env` del checkout principale contiene valori di produzione.
- **Giri successivi:** nessun nuovo classifier. Sono stati rilanciati solo i pass con finding aperte o toccati dalle correzioni: terzo giro v1, v4, v6, v7; quarto e quinto giro v1, v4.

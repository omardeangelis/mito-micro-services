---
domain: crm
type: review-rubric
scope: spec
spec: andamenti-chiamate
links:
  - "[[specs/crm/andamenti-chiamate/REPORT]]"
created: 2026-11-10
updated: 2026-11-10
---

# Review Rubric: Andamenti delle chiamate

## Change set under review

- **Scope:** spec implementation ([[specs/crm/andamenti-chiamate/SPEC]])
- **Target:** working tree non committato del branch `claude/home-spec-dopo-wave`
- **Compared:** `fe9d34c9` → working tree
- **Files touched:** 76 (+5151 −781) in `packages/{domain,contract,server}`, `apps/web`, `src/server/db/seeds/local`; dominio crm

## Routing rubric (review-classifier output)

```json
{
  "taskType": "feature",
  "secondaryType": "refactor",
  "domainsTouched": [
    "crm"
  ],
  "adversarialVerifiers": {
    "count": 9,
    "passes": [
      {
        "id": "v1",
        "charter": "Authorization pass. Check that the new GET /home/call-trend group/endpoint sits behind AdminOnly in both packages/contract/src/home.ts and packages/server/src/http/home.ts, and that an OPERATORE gets 403 (AC2, home-admin AC2). Check that the operator's own series with range=today (my-call-series, hour by hour) returns only the actor's calls and that no team or admin-only data (the four totals, the «Totale» row, comparisonRows of other operators) reaches the operator in any response or in any rendered or exported output (AC17 last bullet, AC21, AC23). Check that the admin-only Analisi totals and «Totale» row are not shown to the operator in apps/web. Read the db tests analisiOggi.db.test.ts and callTrend.db.test.ts for missing negative cases.",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Rome-hour bucketing and window correctness, in packages/domain/src/analytics/{hours,window,buckets}.ts, packages/domain/src/contact/time.ts, packages/server/src/shared/sql.ts and services/analytics/{calls,range}.ts. Check against the Definizioni table and AC26/AC27: calls before 08:00 and from 19:00 are excluded from «Oggi» only; at most the last 8 started working hours; the hour in progress is partial; 15:59:59 and 16:00:00 boundaries; behaviour at 08:00:00, 16:00:00 and from 19:00 to midnight; DST change days in Europe/Rome; server and client agreeing on 'now'. Check the comparison (AC20): yesterday's same hours, the hour in progress compared only up to the same minutes, the year-before comparison and 29 February giving «—», and the before-08 case using the last 8 hours of yesterday, 11–19 (AC24). Check that the day/week totals for 7/30/90 days and custom dates are unchanged (AC27), that the call definition matches export/registro (Constraints, esiti-richiami-stati AC26/AC28), and the home/Analisi equality of AC9 and AC8.",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Contract and server-convention pass. Check that packages/contract/src/analytics.ts and home.ts are additive and backward-compatible: the optional `range` query decodes and rejects invalid values; the new hours/comparisonHours/comparisonRows fields are optional or always present as the schema says; old clients and the Next.js home/export (callStatsWorkbook, call-stats endpoint) still work unchanged (Non-Goals, Technical Notes). Check the Effect 4 conventions in the root CLAUDE.md: Effect.fn naming, Context.Service ids, Schema.TaggedError, unexpectedAs500, no next/* or @/ imports in packages/server; SQL built with Drizzle `sql` parameters, with no raw interpolation of untrusted input. Check that the local seed changes (src/server/db/seeds/local) respect the loadEnv/import restrictions and target only mito_local.",
        "complexity": "medium"
      },
      {
        "id": "v4",
        "charter": "Performance pass. Check that the hourly query on task_event_log (to_char(... AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD HH24')) and the call-trend service for 90 days by week stay under the 2 s threshold at the reference volume (15 operators, 8 admins, 60,000 calls in 90 days), in Constraints. Check whether the new filter expressions can still use the existing indexes or force sequential scans. Check that services/home/_test/callTrend.perf.pg.test.ts measures the worst case (90d and Oggi) at that volume and is not trivially satisfiable.",
        "complexity": "medium"
      },
      {
        "id": "v5",
        "charter": "Analisi «Oggi» state machine in apps/web (urlState.ts, trends.ts, calls.ts, useAnalisi.ts, GroupSelect, PeriodSelect, IndicatorTab, results.ts). Check AC18: «Oggi» first, range=today in the URL, no automatic reload. Check AC19 group normalization both ways: group=hour invalid outside today; range=today forces hour while range stays. Check AC20 default compare=previous. Check AC21–AC23: per-hour series, the operator's single-hour «solo numero» case, «Mostra 7 giorni». Check AC22: the financed charts count the whole day, are «solo numero» with the stated reason, and «Contatti con esito» stays «Adesso». Check AC24 before 08: the empty state with «Vedi ieri» changing only compare; the previous-compare series showing yesterday's hours with today empty and the note; the admin rankings showing yesterday 11–19 with no variation on the totals; «Allarga a 7 giorni» on the other empty states.",
        "complexity": "high"
      },
      {
        "id": "v6",
        "charter": "Analisi totals, «Totale» row and exports (rankings.ts, export.ts, exportContext.ts, DataTable, DataSection, ChartPanel, ExportAllButton). Check AC13–AC15: the four totals equal the column sums; the variation exists only with a comparison; the «Totale» row stays last under any sort, its rate is computed from the sums, and it is not a chart bar. Check AC16: the same «Totale» row in CSV, xlsx, «Copia» and the «Esporta tutto» sheet. Check AC17: chiamate_<dal>_<al>.xlsx is gone from every apps/web page (apps/web/src/api/export.ts and home export components deleted), with no dangling imports or query keys, while AC4, AC25 and the operator view stay as they were. Check AC25: file names carry today's date once, and headers read «Oggi, HH:MM–HH:MM» plus the comparison hours, or «Oggi, tutto il giorno» for financed.",
        "complexity": "medium"
      },
      {
        "id": "v7",
        "charter": "Home «Andamento delle chiamate» logic and data layer (apps/web/src/routes/dashboard/home/_lib/callTrend.ts, _components/trend/CallTrend.tsx, apps/web/src/api/home.ts, AdminHome.tsx). Check AC1: the old section is fully removed. Check AC3: the four choices in order, opening on «7 giorni», not remembered. Check AC4: the hours label. Check AC5: the intervals per period, in time order, weeks cut at the edges, no comparison. Check AC6: null vs 0% for rates. Check AC7: interval names including «(in corso)» and cut weeks. Check AC8: the period rate. Check AC10/AC11: link URLs exactly as in the table, «Vedi ieri» URL, the empty-state texts with the links kept. Check AC12: the section loads and fails on its own, «Riprova» refetches only this query, no auto-refresh. Check the apps/web data-layer conventions: one module per group with keys/queryOptions/hooks; pages use only hooks; tests use renderWithApi with in-memory handlers and no module or fetch mocks.",
        "complexity": "medium"
      },
      {
        "id": "v8",
        "charter": "UI pass: run the ui-review skill bar and probes (.agents/skills/ui-review/SKILL.md: seven classes, evidence gate, falsification pass) on the changed surfaces, live at http://localhost:5175 (admin, local DB): the home trend section (two recharts bar charts, toggle group, hours label, skeleton height equal to the content so nothing shifts, error and empty states) and Analisi with «Oggi» (totals strip, «Totale» row, before-08 note). Add the spec's UI criteria: AC7 values reachable by keyboard focus with the name, rate and two counts; charts with an accessible name (Constraints, home-admin AC49); AC10 links reachable by keyboard; target sizes, focus visibility and widths/wrapping of the toggle group and the labels.",
        "complexity": "medium"
      },
      {
        "id": "v9",
        "charter": "Motion-craft pass: against the design-engineer bar (design-engineering skill references/review.md, with the .agents/agents/design-engineer.md baseline as fallback), check AC12 'cambiare periodo non anima i grafici'. Check that isAnimationActive={false} covers every animated recharts element on both charts (bars, tooltip, cursor, any other series), and that no animation or transition remains in the skeleton-to-data swap or the toggle group.",
        "complexity": "low"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run 9 independent adversarial-verifier passes, v1–v9, in parallel. Opus for v1, v2, v5; balanced for v3, v4, v6, v7, v8; fast for v9. REPORT.md ends with a human checklist (403 for the operator on /home/call-trend, the operator seeing only their own hours, hour boundaries at 08/16/19 and on a DST day, the old chiamate_*.xlsx gone from apps/web while the Next export still works, the perf test result)."
}
```

## Classifier rationale

Impatto critico perché il cambiamento tocca l'autorizzazione: un endpoint solo per admin (`GET /home/call-trend` dietro `AdminOnly`) e una serie dell'operatore che deve restituire solo le sue chiamate (v1). L'altro rischio alto è la correttezza del conto per ora di Roma (confini, ora legale, ora in corso, confronto agli stessi minuti, 29 febbraio, prima delle 08), più l'invarianza dei totali per giorno (v2, v5 su Opus). Compatibilità del contratto con Next (v3) e soglia di 2 s (v4) hanno passaggi propri; UI (v8) e motion (v9) sono separati per regola. Nessuna migrazione, quindi nessun passaggio sullo schema; il seed locale sta in v3.

## Overrides applied

- `adversarialVerifiers.count`: il classificatore ha scritto 8 con 9 passaggi elencati, e l'ha segnalato lui stesso; corretto a 9. Nessun altro cambiamento.

## Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Authorization pass | high | strongest (inherit, Opus) |
| v2 | Rome-hour bucketing and window correctness, in packages/domain/src/analytics/{hours,window,buckets} | high | strongest (inherit, Opus) |
| v3 | Contract and server-convention pass | medium | balanced (sonnet) |
| v4 | Performance pass | medium | balanced (sonnet) |
| v5 | Analisi «Oggi» state machine in apps/web (urlState | high | strongest (inherit, Opus) |
| v6 | Analisi totals, «Totale» row and exports (rankings | medium | balanced (sonnet) |
| v7 | Home «Andamento delle chiamate» logic and data layer (apps/web/src/routes/dashboard/home/_lib/callTrend | medium | balanced (sonnet) |
| v8 | UI pass: run the ui-review skill bar and probes ( | medium | balanced (sonnet) |
| v9 | Motion-craft pass: against the design-engineer bar (design-engineering skill references/review | low | fast (haiku) |

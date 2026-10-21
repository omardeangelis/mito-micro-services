---
domain: crm
type: review-rubric
scope: spec
spec: seeder-locale
links:
  - "[[specs/crm/seeder-locale/REPORT]]"
created: 2026-10-21
updated: 2026-10-21
---

# Review Rubric: Seeder del database locale, PR A + PR B

## Change set under review

- **Scope:** spec implementation (PLAN.md §9, TA1–TA2 e TB1–TB10; TA3 e TB11 sono i gate)
- **Target:** [PR #55](https://github.com/omardeangelis/mito-micro-services/pull/55) (branch `claude/pensive-heisenberg-ckdszo`) e [PR #56](https://github.com/omardeangelis/mito-micro-services/pull/56) (branch `claude/pensive-heisenberg-ckdszo-seeder`, che parte dalla A). Si rivede il diff della B, che contiene anche la A.
- **Compared:** `8729c75` (`origin/dev`) → `34a5f49`
- **Files touched:** 72 fuori da `brain/` (+9 054 / −547; circa 5 000 righe di codice e 4 000 di test), più 9 file del brain. Domain: crm.

## Routing rubric (review-classifier output)

```json
{
  "taskType": "feature",
  "secondaryType": "refactor",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 6,
    "passes": [
      {
        "id": "v1",
        "charter": "Production cron services parity — verify packages/server/src/services/cron/updatePractices.ts, updateCustomerAge.ts and cleanupTaskEventLog.ts, now Effect programs on an injected Db, select and write exactly the same rows/columns as on base 8729c75 (predicates, arithmetic, timestamps, transaction/atomicity boundaries, ordering), still run unchanged from both the Next routes and apps/api, follow AGENTS.md Effect rules (Drizzle wrapped in Effect.tryPromise, typed DbError, no Next.js in packages/server), and that existing cron test assertions (update.db.test.ts, cleanupTaskEventLog.db.test.ts, cron.db.test.ts) are unchanged rather than loosened. Scope: service bodies and their tests only, not the edges.",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Cron error edges and Sentry payload — in src/app/api/cron/update/route.ts and src/app/api/cron/cleanupTaskEventLog/route.ts verify what reaches Sentry is the DbError and carries no SQL text, bound parameters or row data (PII), including via cause chains or extra/context fields; that the HTTP status and response body contract the GitHub Actions cron callers rely on is unchanged; and in apps/api/src/cron/jobs.ts that the DbError→CronStepFailed mapping preserves the response status and the cron_run at-most-once-per-UTC-day semantics (a failed step must not mark the day done or be swallowed).",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Database-targeting safety of the local seeder against AC1, AC2, AC7, AC28a — in src/server/db/scripts/localDb.ts, seeds/local/write.ts, commands/*, *.cli.ts and the targeting guard in seeds/local/cron.ts, prove no input (hostile shell env vars, .env* files, Supabase variables, DATABASE_URL-style overrides, the mito_test_* allowance reached from a CLI) can make any of the three commands connect to or TRUNCATE a database other than mito_local on localhost/127.0.0.1 with no query string; that the check happens before connecting; that the write.ts current_database() guard runs before the first TRUNCATE; and trace what `tsx --conditions=react-server cron.cli.ts` transitively pulls in when it imports the production cronJobs (@mito/env, the global @mito/db client, dotenv, loadDbEnv). Verify the pending-migration stop and its message, and that the ESLint no-restricted-imports group and the AC7 test still hold.",
        "complexity": "high"
      },
      {
        "id": "v4",
        "charter": "Generator conformance to the spec data contract — verify seeds/local/generate.ts, generate/* and day.ts produce data satisfying AC8–AC27 (distribution side), AC30 volumes at 10,000, and AC5 determinism (same seed gives byte-identical output; no Math.random, Date.now or iteration-order leaks); the AC4 Rome-day vs UTC-day stop; D8 explicit ids with overridingSystemValue and setval on quoted table names; D10 every row a cron will select belongs to exactly one scenario with no stray selected rows; D12 integer amounts. Scope: generation only, not the manifest or verify.",
        "complexity": "medium"
      },
      {
        "id": "v5",
        "charter": "Oracle independence and verdict correctness — verify manifest.ts derives expected cron outcomes from the SPEC scenario tables (P1–P12, A1–A6, U1–U11, L1–L2) without reusing generator or production-cron logic, so the oracle cannot agree with a bug by construction; that D13 holds (no column declared unchanged is written by a later cron in run order); that verify.ts compares every manifest expectation, applies the 0.005 tolerance only to amounts, prints passato/fallito and exits non-zero on any mismatch (AC29); and that the local cron runner seeds/local/cron.ts invokes the unmodified production cronJobs in production order with the AC28/AC28b day checks. Excludes the DB-targeting guard (v3).",
        "complexity": "high"
      },
      {
        "id": "v6",
        "charter": "Legacy removal, docs and gates — verify AC31–AC33: the 10 legacy seed files, the 4 package.json scripts and getRandomCustomerRole are gone with no dangling importers anywhere (src, packages, apps/api, scripts, workflows); the getRandomCustomerRole removal in packages/db changes no schema and needs no migration; README, .env.example, loadDbEnv.ts comments and AGENTS.md wording are accurate to the code; the new package.json scripts and .gitignore entry; the gate order still passes (next lint, tsc --noEmit, pnpm run test --run, build, api:build/api:smoke); tests sit in _test/ and go through public interfaces; and whether the D2/TB10 full run at 10,000 is actually wired into CI given no .github workflow appears in the change set.",
        "complexity": "medium"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run 6 independent adversarial-verifier passes in parallel, each given only its charter, the relevant diff slice (code.diff / code-nontest.diff), root AGENTS.md, and the SPEC AC subset plus PLAN decisions it names; bind v1, v2, v3 and v5 to the strongest model (Opus) and v4, v6 to a balanced model. Require the review to emit a mandatory human checklist covering cron behavior parity, the Sentry payload, and DB-targeting safety (including a manual hostile-env check) before PR A or PR B merges to dev."
}
```

## Classifier rationale

L'impatto è critico per tre ragioni:
- la PR A cambia codice che gira ogni notte in prod, sia sulle rotte Vercel sia su Cloud Run, e `AGENTS.md` vuole lo stesso comportamento con le asserzioni dei test invariate;
- le rotte cambiano il dato inviato a Sentry, dove i parametri SQL possono contenere dati personali;
- il seeder svuota tutte le tabelle `public` del database su cui gira, e il rischio principale che `AGENTS.md` nomina è raggiungere sviluppo o prod tramite file env, `loadEnv` o `.env`.

Il classificatore ha separato due coppie di passaggi:
- i servizi (v1) dai bordi (v2): una regressione di comportamento e una fuga di dati personali sono guasti diversi;
- il generatore (v4) dall'indipendenza dell'oracolo (v5): un oracolo che condivide logica con il generatore o con i cron passerebbe per costruzione.

v3 copre anche il caricamento di `cronJobs` sotto `--conditions=react-server`. Non c'è UI né codice di animazione, quindi nessun passaggio UI o motion.

## Overrides applied

Nessuno. Il RUBRIC rispetta le regole:
- `reviewImpact: critical` con `humanInLoop: true`;
- i passaggi non si sovrappongono: il guard sul database sta solo in v3, ed è escluso da v5;
- le superfici sensibili, cioè il codice dei cron di prod, il dato inviato a Sentry e il targeting del database, sono tutte in passaggi `high`.

Una nota per v6: il giro a 10.000 non richiede di cambiare un workflow. `fullRun.pg.test.ts` è un `*.pg.test.ts` e il job Test di `ci.yml` lo esegue già, come mostrano i log della CI sulla PR #56.

## Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Parità dei servizi dei cron di prod | high | strongest (inherit) |
| v2 | Bordi d'errore dei cron e dato inviato a Sentry | high | strongest (inherit) |
| v3 | Targeting del database del seeder (AC1, AC2, AC7, AC28a) | high | strongest (inherit) |
| v4 | Generatore contro il contratto dei dati (AC5, AC8–AC27, AC30, D8, D10, D12) | medium | balanced (sonnet) |
| v5 | Indipendenza dell'oracolo e correttezza della verifica (D13, AC28, AC28b, AC29) | high | strongest (inherit) |
| v6 | Rimozione dei seed, documentazione e gate (AC31–AC33) | medium | balanced (sonnet) |

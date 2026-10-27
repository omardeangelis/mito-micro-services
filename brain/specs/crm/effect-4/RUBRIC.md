---
domain: crm
type: review-rubric
scope: spec
spec: effect-4
links:
  - "[[specs/crm/effect-4/REPORT]]"
created: 2026-10-27
updated: 2026-10-27
---

# Review Rubric: Effect 4, vitest 5 e lo stile di Effect 4

La spec ha quattro PR, ognuna con la sua revisione. Ogni revisione è un round qui sotto, con lo stesso round in `REPORT.md`.

## [Round: 2026-10-27 — PR 2, vitest 5]

### Change set under review

- **Scope:** spec implementation, PR 2 di 4 (T10 del piano)
- **Target:** branch `claude/vitest-5`
- **Compared:** `origin/dev` (`5adbfc1`) → `claude/vitest-5` (`b1cd256`)
- **Files touched:** 12 (`package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `vitest.workspace.ts` tolto, 8 file di test), dominio `crm` (strumenti di test)
- **Contratto:** AC2, AC3, AC5, AC13, AC14. AC12 (documenti della PR 2) è rinviato finché la PR #111 non è in `dev`.

### Routing rubric (review-classifier output)

```json
{
  "taskType": "dependency",
  "secondaryType": "config",
  "domainsTouched": ["crm"],
  "adversarialVerifiers": {
    "count": 4,
    "passes": [
      {
        "id": "v1",
        "charter": "Test discovery and project-partition equivalence (AC2, AC3 'same tests'). Verify the vitest 5 `test.projects` config (unit, db, pg, utc, rome) collects exactly the same set of test files and test names as the vitest 1 config + deleted vitest.workspace.ts — no file dropped, added, or double-run — including: include/exclude globs, the hand-restored `defaultExclude` replacing vitest 1 `configDefaults.exclude`, the new separate `db` project replacing the old `unit` environmentMatchGlobs split for `*.db.test.ts`, pg/timeZone files excluded from unit/db, and `--project pg` still selecting exactly the pg files so `pnpm test:pg` and the CI test step behave identically. Critically weigh the evidence files (report-v1.json vs report-v5.json, compare-v1-v5.txt) — do they cover every project, and is the comparison by file+test name, not just counts. Scope: which tests run where; not how they run.",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Per-file runtime-semantics equivalence (AC3 'run as before'). For every project verify each test file keeps the same environment (jsdom/node), effective time zone, pool kind (threads vs forks), fake-timer set, and mock lifecycle as on vitest 1 — including: pinned `pool: threads` and the TZ-in-threads behavior (a known tech-debt hotspot: Intl keeps the host zone in worker threads), `pool: forks` + `env.TZ` for utc/rome, the `// @vitest-environment node` docblock on windows.db.test.ts in utc/rome and whether any other timeZoneTests file that was node via the old environmentMatchGlobs lacks one, the pinned `fakeTimers.toFake` list vs vitest 1 default, `clearMocks: true` as the substitute for vitest 1 restoreAllMocks/mockReset semantics (over/under-reset risk), setupFiles order including pg.setup.ts, and vitest 5 module-runner changes affecting vi.mock/vi.hoisted hoisting vs vite-node. Stress-test the temporary probe methodology (probe-v1.jsonl/probe-v5.jsonl): what it actually measured per file+project and what it could miss. Scope: how tests run; not which tests are collected.",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Test-content integrity (AC5). Verify that the only test-file changes are the `vi.fn` generic-type rewrites (tuple-args → function-signature form) in 7 files and the one environment docblock; that each rewritten signature is equivalent to the old one (arity, optional params such as TimeFrameSelector's optional options, return type); that no assertion, test, skip/only marker changed; and run `node scripts/check-assertions.mjs assertions origin/dev claude/vitest-5`, judging whether the script would actually detect the changes it is meant to catch.",
        "complexity": "low"
      },
      {
        "id": "v4",
        "charter": "Dependency, lockfile and CI-gate wiring (AC2 vite version, AC13, AC14). Verify package.json/pnpm-lock.yaml consistency and that vite 7.3.7 as a root devDependency is required and compatible; peer compatibility of @vitejs/plugin-react, jsdom 24, @types/node, and vite 7's Node engine with Node 22; that no stale vitest 1/vite-node/vite 5 consumer remains in another workspace package, script, turbo task, tsconfig include, ESLint config or `.github/workflows/ci.yml` reference to vitest.workspace.ts; that `tsc --noEmit` and `next lint` accept the new vitest.config.ts types (TestProjectInlineConfiguration); that `next build` and `apps/api` bundling are unaffected; that the CI test step's leftover `mito_test_*` database check still holds under the pg project's pool; and that the PR records the migration debt it generates (or states none).",
        "complexity": "medium"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run v1–v4 as 4 independent adversarial-verifier passes in parallel: strongest model (Opus) for v1 and v2, balanced for v4, fast for v3. Give each the diff/stat/lock-highlights from scratchpad/review-pr2/; give v1 and v2 the probe/report evidence in scratchpad/probe/; give v2 the TZ-in-worker-threads tech-debt note (brain/tech-debt/crm/sezione-contatti.md). AC12 (docs) out of scope. REPORT.md must end with a human checklist: re-run check-assertions, diff per-project file/test lists from the two JSON reports, spot-check windows.db.test.ts env/TZ/pool in utc and rome, confirm CI green including the pg step and mito_test_* cleanup, confirm the AC13 debt record — before merge into dev."
}
```

### Classifier rationale

Nessun codice di produzione cambia, ma la PR sostituisce il meccanismo dietro il gate dei test della CI (configurazione di build/CI, una superficie sensibile): da qui `critical` con una persona nel giro. Il guasto da temere è silenzioso: test tolti, spostati di ambiente, fuso o pool, o azzerati in modo diverso restano verdi e indeboliscono ogni gate dopo. Perciò "quali file finiscono in quale progetto" (v1) e "come gira ogni file" (v2) sono due passate separate sul modello più forte, che devono mettere in dubbio le prove della sonda. Il fuso nei thread è già un punto fragile (`brain/tech-debt/crm/sezione-contatti.md`).

### Overrides applied

Nessuno.

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Quali test girano e dove (AC2, AC3) | high | il più forte (ereditato) |
| v2 | Come gira ogni file: ambiente, fuso, pool, timer, mock (AC3) | high | il più forte (ereditato) |
| v3 | Integrità dei file di test (AC5) | low | veloce (haiku) |
| v4 | Dipendenze, lockfile e gate di CI (AC2, AC13, AC14) | medium | bilanciato (sonnet) |

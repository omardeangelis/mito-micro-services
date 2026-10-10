---
domain: platform
type: review-rubric
scope: standalone
spec: null
links:
  - "[[review/cron-base-url/REPORT]]"
created: 2026-10-09
updated: 2026-10-09
---

# Review Rubric: indirizzo dei cron da `CRON_BASE_URL`


## Sesto giro (2026-10-09)

### Change set under review

- **Scope:** standalone
- **Target:** branch `chore/cron-indirizzo`, sei commit: i cinque del quinto giro e le correzioni del sesto (`19671c5`).
- **Compared:** `2aaf3a8` (`origin/dev`) → `19671c5`. Delta dal quinto giro, `5e3fd5d..19671c5`:
  - i commenti di `cronRequest.js` (niente più protezione dei progetti, errore di `Headers` per CR, LF e NUL) e "più" in `cleanupTaskEventLog.js`;
  - nomi dei job e degli step copiati in sei workflow dei cron;
  - `PLAN.md` (runbook G2: commit annotato al passo 4, ramo del 401, branch locali e tag, `gh secret list` al passo 8), `IMPLEMENTATION-NOTES.md`, `brain/tech-debt/crm/sezione-contatti.md` (voce riscritta, voce nuova sul secret del repository), F18 nel `REPORT.md` della spec.

### Routing

Stesso RUBRIC del secondo giro. Si rilanciano v6, che aveva bocciato, v4, per le MINOR del runbook corrette, e v3, perché i workflow cambiano per la prima volta dal secondo giro (nomi dei job e degli step). v1, v2 e v5 non si rilanciano: il codice cambia solo nei commenti.

| Pass | Perché si rilancia | Complexity | Model |
|------|--------------------|------------|-------|
| v3 | Area cambiata: id dei job e nomi degli step in sei workflow | high | Opus (eredita) |
| v4 | Area cambiata: passi 1, 3, 4, 5 e 8 | high | Opus (eredita) |
| v6 | Bocciato (2 MAJOR) | low | Haiku |

## Quinto giro (2026-10-09)

### Change set under review

- **Scope:** standalone
- **Target:** branch `chore/cron-indirizzo`, cinque commit: i quattro del quarto giro e le correzioni del quinto (`5e3fd5d`).
- **Compared:** `2aaf3a8` (`origin/dev`) → `5e3fd5d`. Delta dal quarto giro, `9ca8f83..5e3fd5d`:
  - i commenti di `cronRequest.js`, il controllo sui nomi `localhost` con più punti finali, due intestazioni;
  - i test: l'URL chiamato da ogni script, più indirizzi rifiutati;
  - `PLAN.md` (runbook G2), `IMPLEMENTATION-NOTES.md`, `brain/tech-debt/crm/sezione-contatti.md`, F18 nel `REPORT.md` della spec, il commento di `update-alert prod.yml`.

### Routing

Stesso RUBRIC del secondo giro. Si rilanciano v6, che aveva bocciato, e v4, perché il runbook cambia in più passi. v1 non si rilancia: il codice cambia solo nella regex dei nomi `localhost`, e i test nuovi sono quelli che aveva chiesto.

| Pass | Perché si rilancia | Complexity | Model |
|------|--------------------|------------|-------|
| v4 | Area cambiata: giro sui branch al passo 3, conteggio prima della migrazione, branch dello staging dopo G2, `.env` con dotenv, passo 8 | high | Opus (eredita) |
| v6 | Bocciato (2 MAJOR) | low | Haiku |

## Quarto giro (2026-10-09)

### Change set under review

- **Scope:** standalone
- **Target:** branch `chore/cron-indirizzo`, quattro commit: i tre del terzo giro e le correzioni del quarto (`9ca8f83`).
- **Compared:** `2aaf3a8` (`origin/dev`) → `9ca8f83`. Delta dal terzo giro, `cc58070..9ca8f83`:
  - `cronRequest.js` e i due test;
  - il commento di `update-alert prod.yml`;
  - `AGENTS.md`, `PLAN.md`, `IMPLEMENTATION-NOTES.md`, `brain/tech-debt/crm/sezione-contatti.md`.

### Routing

Stesso RUBRIC del secondo giro, come al terzo. Si rilanciano v6, che aveva bocciato, v1, perché il codice della scelta dell'indirizzo è cambiato, e v4, per le MINOR del runbook corrette. v2, v3 e v5 non si rilanciano: i loro test hanno solo casi in più, e il workflow cambia solo in un commento.

| Pass | Perché si rilancia | Complexity | Model |
|------|--------------------|------------|-------|
| v1 | Area cambiata: niente IP né `localhost` in una chiamata remota, test del `.env` su tutti gli script | high | Opus (eredita) |
| v4 | Area cambiata: branch vecchi, nuovo deploy, passo 8, query prima del passo 5 | high | Opus (eredita) |
| v6 | Bocciato (BLOCKER, MAJOR) | low | Haiku |

## Terzo giro (2026-10-09)

### Change set under review

- **Scope:** standalone
- **Target:** branch `chore/cron-indirizzo`, tre commit: i due del secondo giro e le correzioni del terzo (`cc58070`). Sempre da unire in `dev` prima della sessione G2.
- **Compared:** `2aaf3a8` (`origin/dev`) → `cc58070`. Delta dal secondo giro, `df8fcaa..cc58070`, 8 file:
  - `cronRequest.js`, `alert.js` e i due test in `src/app/api/cron/scheduled/`;
  - `AGENTS.md`;
  - `PLAN.md`, `IMPLEMENTATION-NOTES.md`, `brain/tech-debt/crm/sezione-contatti.md`.

### Routing

Nessuna nuova classificazione: il change set è quello del secondo giro, con le correzioni dei suoi finding, e vale il suo RUBRIC (sotto). Il proprietario ha chiesto di rilanciare i revisori. Si rilanciano i pass del RUBRIC che avevano bocciato o la cui area è cambiata. Ogni revisore riceve il suo charter, aggiornato al codice di oggi, e le obiezioni del secondo giro da ricontrollare, senza esiti né autori.

| Pass | Perché si rilancia | Complexity | Model |
|------|--------------------|------------|-------|
| v1 | Area cambiata: `NODE_ENV` e `GITHUB_ACTIONS` letti prima di `.env`, solo l'origine, URL obbligatorio in GitHub Actions | high | Opus (eredita) |
| v2 | Area cambiata: bypass validato, `redirect: "manual"` | high | Opus (eredita) |
| v3 | Non rilanciato: i workflow non cambiano da `df8fcaa` | — | — |
| v4 | Bocciato (2 MAJOR) | high | Opus (eredita) |
| v5 | Area cambiata: `alert.js` e i test | medium | Sonnet |
| v6 | Bocciato (BLOCKER) | low | Haiku |

## Secondo giro (2026-10-09)

### Change set under review

- **Scope:** standalone
- **Target:** branch `chore/cron-indirizzo`, due commit: quello del primo giro, ribasato, e le correzioni. Da unire in `dev` **prima** della sessione G2: il passo 8 lancia il cron alert di prod con questi script
- **Compared:** `2aaf3a8933b61ca1b273e886c85be0289af09b8e` (`origin/dev`) → `df8fcaa`
- **Files touched:** 20, nei domini platform e crm:
  - script cron e test in `src/app/api/cron/scheduled/`;
  - gli otto workflow dei cron;
  - `AGENTS.md`;
  - runbook G2 in `brain/specs/crm/sezione-contatti/PLAN.md`, `IMPLEMENTATION-NOTES.md`, `brain/tech-debt/crm/sezione-contatti.md`

### Routing rubric (review-classifier output)

```json
{
  "taskType": "config",
  "secondaryType": "bugfix",
  "domainsTouched": [
    "platform",
    "crm"
  ],
  "adversarialVerifiers": {
    "count": 6,
    "passes": [
      {
        "id": "v1",
        "charter": "Target selection only: verify that cronBaseUrl() in src/app/api/cron/scheduled/cronRequest.js, and where each of the five scripts calls it (alert.js, delete.js, update.js, priority.js, cleanupTaskEventLog.js), fails closed. A non-:dev (NODE_ENV=production) run without a valid https CRON_BASE_URL, or a local :dev run with a remote CRON_BASE_URL outside GitHub Actions, must exit 1 before any fetch. Check the normalization (trim, trailing slashes, the localhost/127.0.0.1 exception, non-https rejection) and that the value it returns is the URL actually called. Do not review request headers, workflows or docs.",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Credential exposure on the outbound request only: verify that cronRequestInit() in cronRequest.js attaches the cron JWT bearer and the x-vercel-protection-bypass header correctly (bypass only when VERCEL_AUTOMATION_BYPASS_SECRET is non-empty), that redirect: 'error' stops credentials from being forwarded to another host, and that no secret, token or bypass value is written to logs or error output (including the 'Cron target' log line). Also check the JWT claims and expiry the scripts sign against what the route-side authCheck (src/app/api/_utils/auth.ts, unchanged) expects. Do not review URL selection, workflows or docs.",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "GitHub Actions secret scoping and environment pairing only, across the 8 cron workflows in .github/workflows/. Each prod workflow must pair secrets.CRON_SECRET_KEY + https://crm.dbmito.it + the non-:dev script with no bypass secret. Each non-prod workflow must pair secrets.STAGING_CRON_SECRET_KEY + https://staging-crm.dbmito.it + VERCEL_AUTOMATION_BYPASS_SECRET + the matching :dev script. Secrets must be set only on the script step, nothing may still depend on the removed job-level CRON_SECRET_KEY, and triggers, schedules and the ALERT_CRON_ENABLED guard must be unchanged. Do not review the JS scripts or the runbook.",
        "complexity": "high"
      },
      {
        "id": "v4",
        "charter": "G2 production runbook only (brain/specs/crm/sezione-contatti/PLAN.md, the changed steps 1, 2, 4, 8 and T2.6). Check that the irreversible sequence is ordered correctly: Vercel CRON_SECRET_KEY Production-only before the step-4 merge, deploy finished before the GitHub secret is created at step 8, the GIA_SU_MAIN redeploy branch. Check that every stop condition and grep or gh command is read-only where claimed and actually detects what it says it detects at head df8fcaa, that the widened merge-diff expectation matches this branch's file set, and that the authCheck empty-token precondition can be checked, since auth.ts is not changed in this diff. Do not review the code itself.",
        "complexity": "high"
      },
      {
        "id": "v5",
        "charter": "Behavior parity and test validity only: verify that the five scripts keep their pre-change exit-code and retry semantics apart from the base-URL and request changes (alert.js MAX_CALLS/retry loop, the !response.ok -> exit 1 path in the others). Verify that the existing alert.test.ts assertions are unchanged, and that the new tests in alert.test.ts and cronScripts.test.ts run the scripts through their public entry point and isolate env from the CI runner (GITHUB_ACTIONS=true) and the shell. Confirm the CI gates hold: next lint, tsc --noEmit, pnpm run test --run, build.",
        "complexity": "medium"
      },
      {
        "id": "v6",
        "charter": "Descriptive docs accuracy only: verify that the new AGENTS.md cron bullet, the rewritten brain/tech-debt/crm/sezione-contatti.md entry and the IMPLEMENTATION-NOTES.md 'Dominio e segreto dei cron di prod' note describe the head code and workflows accurately, record no secret values, and reference files that exist on the branch (e.g. brain/chore/staging-vercel.md). Do not review the PLAN.md runbook steps.",
        "complexity": "low"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run v1-v6 as independent adversarial-verifier passes in parallel on the diff 2aaf3a8..df8fcaa, using the read-only checkout at .../scratchpad/wt-cron2. Bind v1-v4 to the strongest model (Opus), v5 to a balanced model and v6 to a fast model. Merge the findings into a mandatory human checklist that must be completed before chore/cron-indirizzo merges into dev, and in any case before the G2 session. The checklist must include the out-of-repo facts no verifier can confirm: CRON_SECRET_KEY set Production-only on Vercel with a value different from staging; STAGING_CRON_SECRET_KEY and VERCEL_AUTOMATION_BYPASS_SECRET present as GitHub secrets; crm.dbmito.it aliasing the current production deployment; and whether the authCheck empty-token fix is on the code G2 will deploy."
}
```

### Rationale

Impatto critico perché il cambio tocca quattro aree sensibili insieme:

- come il JWT dei cron e il segreto di bypass di Vercel escono dal runner;
- come i segreti entrano nella CI;
- i workflow che cancellano lo storage e chiudono gli alert;
- il runbook G2, una sessione di produzione irreversibile.

Un pass per area (destinazione, credenziali, workflow, runbook), perché un errore in una qualunque può mandare un token valido di prod all'app sbagliata. Parità e test a complessità media, documenti descrittivi bassa. `brain/domains/` è vuoto: nessun contratto di dominio.

### Overrides applied

- Nessuno. Il classificatore ha già impostato impatto `critical` e `humanInLoop: true`.

### Plan for Stage 2

| Pass | Charter | Complexity | Model |
|------|---------|------------|-------|
| v1 | Scelta dell'indirizzo, che si chiude in caso di errore | high | Opus (eredita) |
| v2 | Credenziali sulla richiesta in uscita | high | Opus (eredita) |
| v3 | Segreti e abbinamenti nei workflow | high | Opus (eredita) |
| v4 | Runbook G2 | high | Opus (eredita) |
| v5 | Parità di comportamento e test | medium | Sonnet |
| v6 | Documenti descrittivi | low | Haiku |

## Primo giro (2026-10-09)

### Change set under review

- **Scope:** standalone
- **Target:** branch `chore/cron-indirizzo` (un commit, da unire in `dev` dopo la sessione G2 di PR2)
- **Compared:** `2aaf3a8933b61ca1b273e886c85be0289af09b8e` (`origin/dev`) → `dc4468d`
- **Files touched:** 16 (script cron in `src/app/api/cron/scheduled/`, otto workflow schedulati, runbook G2 in `brain/specs/crm/sezione-contatti/PLAN.md`) across domains: platform, crm

### Routing rubric (review-classifier output)

```json
{
  "taskType": "bugfix",
  "secondaryType": "config",
  "domainsTouched": ["platform", "crm"],
  "adversarialVerifiers": {
    "count": 6,
    "passes": [
      {
        "id": "v1",
        "charter": "Host resolution in the code only. Check cronBaseUrl() in src/app/api/cron/scheduled/cronRequest.js and how alert.js, update.js, delete.js, priority.js and cleanupTaskEventLog.js call it. Points to verify: CRON_BASE_URL takes precedence over NODE_ENV. A missing or empty value fails closed and exits non-zero before any request goes out. The trailing-slash normalization holds. dotenv.config() loading a local .env can set CRON_BASE_URL and send a ':dev' script to a remote or production host. No code reference to mito-deutsche.vercel.app remains. Out of scope: the URL values in the workflows (v3) and credentials (v2).",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Credential scoping and leakage only. Check which secret reaches which host. The four non-production workflows use STAGING_CRON_SECRET_KEY and the four production workflows keep CRON_SECRET_KEY, with no crossover. cronHeaders() adds x-vercel-protection-bypass only when VERCEL_AUTOMATION_BYPASS_SECRET is set, and no production workflow sets it. No script logs a token, bypass secret or header (error paths, console output). The signed JWT still meets the unchanged authCheck contract in src/app/api/_utils/auth.ts. Verify this by reading only: never print or echo secret values.",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Deployment target and data blast radius only. Check that https://crm.dbmito.it in the four '* prod' workflows is the Current production deployment of this Vercel project. Check that https://mito-micro-services-staging.vercel.app in the four non-production workflows is a staging deployment backed by a non-production database, with its own CRON_SECRET_KEY, so no non-production run can change production alerts, customers/practices, storage, priorities or the task_event_log. Use the repo evidence (brain/chore/migration*, REPORT.md, PLAN.md). Anything that can only be confirmed in Vercel or GitHub goes on the human checklist as an explicit item.",
        "complexity": "high"
      },
      {
        "id": "v4",
        "charter": "Workflow configuration structure only, for the eight .github/workflows files. Check YAML validity, including the file names with spaces. Each prod/non-prod pair should be symmetric apart from the intended env differences. Check which pnpm script each workflow runs (update:* vs ':dev') against its intended environment. The schedules, the commented-out non-prod schedules and the ALERT_CRON_ENABLED gate on 'update-alert prod.yml' must be unchanged. The Telegram step must not be affected. Out of scope: secret mapping (v2) and URL targets (v3).",
        "complexity": "medium"
      },
      {
        "id": "v5",
        "charter": "Refactor parity and tests only. The five scripts should behave exactly as before apart from the target and the optional bypass header: request method, path, Content-Type and Authorization format, response handling, alert.js's retry loop, and exit codes on route failure. Judge whether the new alert.test.ts cases test through the script's public interface without weakening existing assertions. Flag that update/delete/priority/cleanupTaskEventLog have no tests for their new failure mode. Confirm the AGENTS.md gates pass (next lint with SKIP_ENV_VALIDATION, tsc --noEmit, 'pnpm run test --run', build with placeholders). Assess whether the AGENTS.md Effect-on-refactor rule applies to these plain Node edge scripts.",
        "complexity": "medium"
      },
      {
        "id": "v6",
        "charter": "Runbook and knowledge-base accuracy only. Check that the edited step in brain/specs/crm/sezione-contatti/PLAN.md (Italian) matches the code and workflows: its stop conditions are correct and its commands (gh secret list, vercel env ls) list names without printing secret values. Check whether brain/tech-debt/crm/sezione-contatti.md entry F18 ('Il workflow di sviluppo del cron alert fallisce sempre') is now outdated and should be updated. Check whether the root AGENTS.md wording, which ties 'NODE_ENV=production' cron scripts to production, is still accurate now that the target comes from CRON_BASE_URL.",
        "complexity": "medium"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run the 6 adversarial-verifier passes in parallel against the diff and the head checkout. Use the strongest model (Opus) for v1-v3 and a balanced model for v4-v6. Tell every verifier: do not trigger any workflow, do not run any update:*, delete:export or clean:task-event-log script (including the ':dev' ones, because a local .env may set CRON_BASE_URL), and never print secret values. Merge the findings into a critical report that ends with a mandatory step-by-step human checklist. The checklist must include the items only Vercel or GitHub can confirm: crm.dbmito.it is attached to the Current production deployment; the staging alias exists, sits behind Deployment Protection and is backed by non-production data; STAGING_CRON_SECRET_KEY on GitHub matches CRON_SECRET_KEY on the staging deployment in Vercel; VERCEL_AUTOMATION_BYPASS_SECRET is set on GitHub; CRON_SECRET_KEY exists with the same value on GitHub and on Vercel Production. Block the merge until a human signs off on that checklist."
}
```

### Classifier rationale

Impatto `critical` con persona nel giro perché la diff tocca tre superfici che forzano l'escalation: segreti (un nuovo token per lo staging e il segreto di bypass della protezione Vercel), configurazione CI (tutti e otto i workflow schedulati) e la scelta della deployment che riceve chiamate che modificano dati di produzione. Lo spostamento del bersaglio da `NODE_ENV` a `CRON_BASE_URL` fa sì che la regola di `AGENTS.md` sugli script `NODE_ENV=production` non decida più da sola dove arriva uno script: per questo v1 copre la risoluzione nel codice (compreso dotenv che legge un `.env` locale), v3 il legame con la deployment e il database fuori dal repo, v6 se `AGENTS.md` lo descrive ancora bene. Sei verifiche sono sopra la media per 425 righe, ma ognuna corrisponde a una superficie di rischio diversa.

### Overrides applied

Nessuno.

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Risoluzione dell'host nel codice | high | strongest (Opus) |
| v2 | Segreti: a chi arrivano e se finiscono nei log | high | strongest (Opus) |
| v3 | Deployment bersaglio e dati toccati | high | strongest (Opus) |
| v4 | Struttura dei workflow | medium | balanced (Sonnet) |
| v5 | Parità del refactor e test | medium | balanced (Sonnet) |
| v6 | Runbook e base di conoscenza | medium | balanced (Sonnet) |

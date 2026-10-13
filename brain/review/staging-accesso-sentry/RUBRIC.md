---
domain: platform
type: review-rubric
scope: standalone
spec: null
links:
  - "[[review/staging-accesso-sentry/REPORT]]"
created: 2026-10-09
updated: 2026-10-09
---

# Review Rubric: staging su Vercel, accesso fuori produzione, Sentry solo in prod


## Sesto giro (2026-10-09)

### Change set under review

- **Scope:** standalone
- **Target:** i tre branch, ribasati su `chore/cron-indirizzo` (`19671c5`): `chore/accesso-fuori-prod` (`df3591f`) → `chore/staging-vercel` (`39bcae3`) → `chore/env-prod-locale` (`d6e9d91`).
- **Compared:** `19671c5` → `d6e9d91`. Delta dal quinto giro, due commit:
  - `39bcae3` su `chore/staging-vercel`: `next.config.js` scrive sempre un valore di `NEXT_PUBLIC_VERCEL_ENV` e `NEXT_PUBLIC_APP_ENV` nei bundle (`"none"` quando manca) e controlla `VERCEL_ENV` ovunque; test nuovo di `next.config.js`; il caso dello staging in `auth.test.ts`; nei workflow il token fuori da `vercel build` e dagli argomenti, la lista dei domini e `customEnvironmentId` nel controllo dello staging, `APP_ENV` Secret, l'alias controllato dall'API, `rm -rf .vercel` in prod, `mktemp -d` e trap; `brain/chore/staging-vercel.md` (rimedi, login Azure in prod, percorsi Supabase, protezione di prod, "Limiti noti");
  - `d6e9d91` su `chore/env-prod-locale`: `loadEnv` si ferma su un `NODE_ENV` sconosciuto, regola ESLint sui seed e sugli script del DB, esenzione ristretta, test di `next.config.js` con il file `.env.production.local` simulato, `AGENTS.md`, `.env.example`, quattro piani di migrazione.

### Routing

Stesso RUBRIC del secondo giro. Si rilanciano gli stessi cinque pass del quinto giro, perché la loro area cambia in questi due commit. v1, v2, v7 e v9 non si rilanciano: il login e Sentry dipendono solo da `isProduction`, che dà le stesse risposte (lo prova il test nuovo), e i gate li rifanno v3, v4 e v6.

| Pass | Perché si rilancia | Complexity | Model |
|------|--------------------|------------|-------|
| v3 | Area cambiata: valore sempre scritto nei bundle, controllo di `VERCEL_ENV`, test di `next.config.js` | high | Opus (eredita) |
| v4 | Area cambiata: `NODE_ENV` in `loadEnv`, regola ESLint, testi | high | Opus (eredita) |
| v5 | Area cambiata: cartella temporanea, trap, token del controllo dei dati | high | Opus (eredita) |
| v6 | Area cambiata: token, domini, alias, `rm -rf .vercel` in prod | high | Opus (eredita) |
| v8 | Area cambiata: checklist | medium | Sonnet |

## Quinto giro (2026-10-09)

### Change set under review

- **Scope:** standalone
- **Target:** i tre branch impilati, ribasati su `5e3fd5d`: `chore/accesso-fuori-prod` (`3ec2875`) → `chore/staging-vercel` (`1437623`) → `chore/env-prod-locale` (`dd0eea0`).
- **Compared:** `5e3fd5d` → `dd0eea0`. Delta dal quarto giro, fuori dai file dei cron:
  - lo staging diventa una deployment di Production del suo progetto (`--prod`), separata dalla produzione da `APP_ENV=staging`: `src/env.js`, `next.config.js`, i tre test sul segnale di produzione;
  - `deploy-staging.yaml` (pull di Production, controlli del dominio, dati) e `deploy-production.yaml` (messaggi, `APP_ENV`, `concurrency`, timeout);
  - `brain/chore/staging-vercel.md`, `.env.example`;
  - `loadEnv` passa a `src/lib/global/loadDbEnv.ts`, con la regola ESLint su quel modulo.

### Routing

Stesso RUBRIC del secondo giro. Il proprietario cambia di nuovo il disegno durante il quarto giro: lo staging si pubblica con `--prod` nel suo progetto, e `NODE_ENV=development` su Vercel non ha effetto, quindi lo segna `APP_ENV=staging`. Il segnale di produzione cambia per la prima volta dal terzo giro: si rilancia v3. Si rilanciano v5, v6 e v8, la cui area è riscritta, e v4 per lo spostamento di `loadEnv`.

| Pass | Perché si rilancia | Complexity | Model |
|------|--------------------|------------|-------|
| v3 | Area cambiata: `isProduction` richiede `APP_ENV` diverso da `staging`; guardie in `next.config.js` | high | Opus (eredita) |
| v4 | Area cambiata: `loadDbEnv.ts` e la regola ESLint | high | Opus (eredita) |
| v5 | Area riscritta: il controllo dei dati legge Production dei due progetti | high | Opus (eredita) |
| v6 | Area riscritta: deploy `--prod`, controlli del dominio, workflow di prod | high | Opus (eredita) |
| v8 | Bocciato (MAJOR), checklist riscritta | medium | Sonnet |

## Quarto giro (2026-10-09)

### Change set under review

- **Scope:** standalone
- **Target:** i tre branch impilati, ribasati su `9ca8f83`: `chore/accesso-fuori-prod` (`a736c80`) → `chore/staging-vercel` (`41d8d80`) → `chore/env-prod-locale` (`1c88682`).
- **Compared:** `9ca8f83` → `1c88682`. Delta dal terzo giro, fuori dai file dei cron:
  - lo staging passa al progetto Vercel `staging-mito-micro-services`: `deploy-staging.yaml` e `brain/chore/staging-vercel.md` riscritti;
  - la regola ESLint, `.env.example`, `next.config.js`, `src/lib/global/env.ts`, `AGENTS.md`.

### Routing

Stesso RUBRIC del secondo giro. Il change set cambia disegno: lo staging non è più una Preview del progetto di produzione, ma un progetto Vercel suo, in Preview e con "All Deployments", come deciso dal proprietario durante il terzo giro. Le aree di v5, v6 e v8 sono quindi riscritte. Si rilanciano quei tre e v4, che aveva bocciato; i charter descrivono il disegno nuovo.

| Pass | Perché si rilancia | Complexity | Model |
|------|--------------------|------------|-------|
| v4 | Bocciato (MAJOR ESLint) | high | Opus (eredita) |
| v5 | Area riscritta: Production dal progetto di prod, ref in posizione | high | Opus (eredita) |
| v6 | Area riscritta: controllo del progetto di staging | high | Opus (eredita) |
| v8 | Bocciato (2 MAJOR), checklist riscritta | medium | Sonnet |

## Terzo giro (2026-10-09)

### Change set under review

- **Scope:** standalone
- **Target:** i tre branch impilati, ribasati sulla nuova testa dei cron: `chore/accesso-fuori-prod` (`2364ff2`) → `chore/staging-vercel` (`6377b61`) → `chore/env-prod-locale` (`88ebd8b`). Un commit di correzioni per branch.
- **Compared:** `cc58070` (`chore/cron-indirizzo`) → `88ebd8b`. Delta dal secondo giro, fuori dai file dei cron:
  - `users.ts` e `auth.db.test.ts`;
  - `next.config.js`, i due workflow di deploy;
  - `src/lib/global/env.ts` e il suo test, `.eslintrc.cjs`, `.env.example`, `AGENTS.md`;
  - `brain/chore/staging-vercel.md`.

### Routing

Nessuna nuova classificazione: il change set è quello del secondo giro, con le correzioni dei suoi finding, e vale il suo RUBRIC (sotto). Il proprietario ha chiesto di rilanciare i revisori. Si rilanciano i pass del RUBRIC che avevano bocciato o la cui area è cambiata. Ogni revisore riceve il suo charter, aggiornato al codice di oggi, e le obiezioni del secondo giro da ricontrollare, senza esiti né autori.

Il proprietario ha deciso due cose, passate ai revisori come fatti:

- `staging-crm.dbmito.it` è il dominio dello staging;
- il `.env` locale tiene i valori di prod, come ripiego degli altri file. Va controllato invece che il file di prod abbia le variabili fondamentali.

| Pass | Perché si rilancia | Complexity | Model |
|------|--------------------|------------|-------|
| v1 | Area cambiata: `lower()` su tutti e due i lati, test nuovo | high | Opus (eredita) |
| v2 | Non rilanciato: creazione degli utenti invariata | — | — |
| v3 | Area cambiata: guardia su `NEXT_PUBLIC_VERCEL_ENV`, `SKIP_ENV_VALIDATION` nei workflow | high | Opus (eredita) |
| v4 | Bocciato (BLOCKER) | high | Opus (eredita) |
| v5 | Bocciato (BLOCKER) | high | Opus (eredita) |
| v6 | Bocciato (BLOCKER) | high | Opus (eredita) |
| v7 | Non rilanciato: Sentry invariato | — | — |
| v8 | Bocciato (2 MAJOR) | medium | Sonnet |
| v9 | Non rilanciato: i quattro gate li rilancia l'orchestratore su ogni branch | — | — |

## Secondo giro (2026-10-09)

### Change set under review

- **Scope:** standalone
- **Target:** tre branch impilati, `chore/accesso-fuori-prod` → `chore/staging-vercel` → `chore/env-prod-locale`, ora sopra `chore/cron-indirizzo`. Ognuno ha il commit del primo giro, ribasato, e le correzioni. Da unire in `dev` dopo la sessione G2
- **Compared:** `df8fcaa` (`chore/cron-indirizzo`) → `602fa33`
- **Files touched:** 29, dominio platform:
  - login e creazione utente (`src/server/auth.ts`, `src/server/services/auth/users.ts`);
  - segnale di produzione e schema env (`src/env.js`, `next.config.js`);
  - Sentry (`src/lib/utils/sentry.ts`, le tre configurazioni);
  - workflow di deploy e `vercel.json`;
  - `loadEnv` ed ESLint;
  - `.env.example`, `AGENTS.md`, `brain/chore/staging-vercel.md`

### Routing rubric (review-classifier output)

```json
{
  "taskType": "config",
  "secondaryType": "security",
  "domainsTouched": [
    "platform"
  ],
  "adversarialVerifiers": {
    "count": 9,
    "passes": [
      {
        "id": "v1",
        "charter": "Sign-in gating. Check which NextAuth providers each environment gets and the signIn callback in src/server/auth.ts. Production should offer only Azure AD, with no filter. Outside production, the only users who get in should be DB users whose email matches exactly (matchUserEmail returning exact, other-case or none, with no wildcard matching) plus the AUTH_ALLOWED_EMAILS addresses (parsed with trim and lowercase). This must hold for both Azure and the email/SendGrid link. If the DB fails, access is denied and no driver details leak. Scope: providers, allowedEmails, signIn, matchUserEmail, src/server/_test/auth.test.ts and auth.db.test.ts.",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "User provisioning. The NextAuth adapter's createUser override (createUserWithOperator in src/server/services/auth/users.ts) should insert the user and its operator in one transaction, so both rows land or neither does. It should write only the provider's fields: no image and no role override, so the ADMIN role the DB sets by default applies only to users who passed sign-in. Also check that deleting the unauthenticated POST /api/operator/create leaves no caller and no other path that creates users or operators outside NextAuth.",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "How the app decides it is production at runtime. isProduction in src/env.js, read from the NEXT_PUBLIC_VERCEL_ENV that next.config.js injects through env, must give the same answer in the client, server, edge and instrumentation bundles. It must be false locally and on preview. The env schema's new conditional rules (Azure and Sentry vars required only in production; DISCORD_*, NEXT_PUBLIC_BASE_URL, CUSTOM_ACCESS and PREVIEW_DB removed; SUPABASE_MITO_PSW added) must not break a production build, and must not let one start without its required vars.",
        "complexity": "high"
      },
      {
        "id": "v4",
        "charter": "Keeping the local production credentials out of the app. With NODE_ENV=production, loadEnv (src/lib/global/env.ts) should load .env.prod.local with override, and stop if that file is missing or .env.production.local still exists. Removing loadEnv from src/server/db/index.ts, src/server/client/supabase.ts and the five cron routes, and dropping the PREVIEW_DB fallback, must leave those modules reading only the env that Next.js or Vercel provides. The ESLint no-restricted-imports rule and its overrides must allow loadEnv only in drizzle.config.ts and the DB scripts and seeds.",
        "complexity": "high"
      },
      {
        "id": "v5",
        "charter": "Keeping staging data apart from production in CI. The 'Check staging has its own database and storage' step in .github/workflows/deploy-staging.yaml must fail whenever one of the five Supabase vars is missing in Preview (the anon key is exempt only from the presence check) or equals its Production value. It must compare exact lines without printing any value to the log, and delete the pulled production env file before the build.",
        "complexity": "high"
      },
      {
        "id": "v6",
        "charter": "Release pipeline. Check that next.config.js fails a Vercel build without a valid VERCEL_ENV, and check the new 'Check the build is production' step in deploy-production.yaml. In deploy-staging.yaml check the trigger (push to dev), concurrency, permissions, the step that rewrites the commit author, the preview pull with --git-branch=dev, the build and deploy --prebuilt, and the alias to staging-crm.dbmito.it. Check that vercel.json turns off all Git deployments. The result must be that main reaches production only through its workflow and dev reaches only the staging domain, never a production domain.",
        "complexity": "high"
      },
      {
        "id": "v7",
        "charter": "Sentry gating. sentryDsn and sentryInitOptions (src/lib/utils/sentry.ts) and the three sentry.*.config.ts files must send no events outside production, including through the edge SDK's fallback to SENTRY_DSN. Production events must keep the environment 'production'. The Sentry options in next.config.js must turn off source maps, release creation, plugin telemetry and the /monitoring tunnel route outside production, and keep them all in production.",
        "complexity": "medium"
      },
      {
        "id": "v8",
        "charter": "Accuracy of the manual checklist and docs. brain/chore/staging-vercel.md, .env.example and the DB-scripts paragraph of AGENTS.md must match the code: every variable name and environment (Production, Preview, dev branch override) must match src/env.js and the workflows. The pre-merge steps must be complete and in an order that keeps the first push to dev away from production data and production domains: system env vars exposed, Preview values taken from development, domain bound to the dev branch, Entra redirect URIs, protection bypass. The post-deploy checks must cover each intended behavior.",
        "complexity": "medium"
      },
      {
        "id": "v9",
        "charter": "Project conventions and gates. The new auth code (runAuth, users.ts) must follow the AGENTS.md Effect rules: Drizzle only through query/transaction, expected failures typed instead of thrown or died, and Effect run only at the NextAuth edge. Tests must go through public interfaces (authOptions, the adapter, the Sentry configs, loadEnv). The four CI gates (next lint, tsc --noEmit, pnpm run test --run, pnpm build with SKIP_ENV_VALIDATION and placeholder Supabase vars) must pass at head 602fa33.",
        "complexity": "low"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run the 9 adversarial-verifier passes in parallel on df8fcaa..602fa33, using the read-only checkout wt-staging2. Use the strongest model (Opus) for v1-v6, a balanced model for v7-v8 and a fast model for v9. Merge the findings into one report that ends with a mandatory human checklist: (1) fix or accept each blocking finding; (2) complete the 'Prima del merge su dev' steps in brain/chore/staging-vercel.md, checking variables by name only; (3) merge the stacked branches into dev only after the G2 production session, because the merge deploys staging at once; (4) confirm the post-push staging checks and the post-production-deploy checks. Do not merge and do not run any NODE_ENV=production script without a human."
}
```

### Rationale

Impatto critico perché il cambio tocca quattro aree che `AGENTS.md` tratta come sensibili:

- autenticazione (filtro sul login, provider, ruolo ADMIN di default);
- segreti (il file delle credenziali di prod, l'env di Vercel);
- telemetria (Sentry);
- configurazione di rilascio (workflow, `vercel.json`, `next.config.js`).

Il merge su `dev` fa subito il deploy dello staging, quindi i passi manuali vanno fatti prima, da una persona. Nove pass:

- il login separato dalla creazione degli utenti;
- la decisione "produzione" separata dalla pipeline che la imposta;
- le credenziali locali separate dal controllo in CI sui dati dello staging.

Il controllo in CI è l'unica barriera automatica fra staging e dati di prod: per questo va a Opus.

### Overrides applied

- Nessuno.

### Plan for Stage 2

| Pass | Charter | Complexity | Model |
|------|---------|------------|-------|
| v1 | Filtro sul login | high | Opus (eredita) |
| v2 | Creazione di utente e operatore | high | Opus (eredita) |
| v3 | Segnale di produzione e schema env | high | Opus (eredita) |
| v4 | Credenziali di prod in locale | high | Opus (eredita) |
| v5 | Dati dello staging separati da prod in CI | high | Opus (eredita) |
| v6 | Pipeline di rilascio | high | Opus (eredita) |
| v7 | Sentry solo in prod | medium | Sonnet |
| v8 | Checklist e documenti | medium | Sonnet |
| v9 | Convenzioni e gate | low | Haiku |

## Primo giro (2026-10-09)

### Change set under review

- **Scope:** standalone
- **Target:** branch `chore/accesso-fuori-prod` → `chore/staging-vercel` → `chore/env-prod-locale` (tre commit in pila, da unire in `dev` dopo la sessione G2 di PR2)
- **Compared:** `2aaf3a8933b61ca1b273e886c85be0289af09b8e` (`origin/dev`) → `e424fca`
- **Files touched:** 27 (auth, schema env, Sentry, workflow di deploy, `vercel.json`, loader `.env.prod.local`, `AGENTS.md`, `brain/chore/staging-vercel.md`) across domains: platform

### Routing rubric (review-classifier output)

```json
{
  "taskType": "config",
  "secondaryType": "security",
  "domainsTouched": ["platform"],
  "adversarialVerifiers": {
    "count": 7,
    "passes": [
      {
        "id": "v1",
        "charter": "Authorization gating at sign-in. Assume the isProduction flag is correct (v3 checks that). Verify the provider list and the signIn callback in src/server/auth.ts. Production must offer only Azure AD with no filter. Outside production, sign-in must be limited to DB users (case-insensitive lookup through isExistingUser) plus the AUTH_ALLOWED_EMAILS set (trim/lowercase parsing). Check that the email magic link is gated so it can never be offered in production, that the console-printed link is limited to `next dev` (NODE_ENV=development), and that signIn fails closed (null email, DB lookup error, empty or malformed allowlist). Removing Discord must leave no provider or sign-in path behind. Owns src/server/_test/auth.test.ts and auth.db.test.ts sign-in cases.",
        "complexity": "high"
      },
      {
        "id": "v2",
        "charter": "Account provisioning in the NextAuth adapter. Verify that createUser -> createUserWithOperator (src/server/services/auth/users.ts) writes the users row and the operators row atomically in one DB transaction. It must still honor the NextAuth AdapterUser contract: generated id, emailVerified, image nulled, returned shape, and the mito-deutsche_ table prefix that the other DrizzleAdapter methods still use. Verify that the runAuth bridge follows the AGENTS.md Effect rules (typed errors, Effect.gen, runPromiseExit at the edge, Drizzle via query/transaction). Verify that the unauthenticated POST /api/operator/create route is fully removed with no remaining callers. Owns the createUser case in auth.db.test.ts.",
        "complexity": "high"
      },
      {
        "id": "v3",
        "charter": "Production signal and env schema. Verify how VERCEL_ENV becomes the build-time NEXT_PUBLIC_VERCEL_ENV (next.config.js `env` block). Check that every consumer (src/env.js, auth.ts, lib/utils/sentry.ts) derives 'production' the same way on server, client and edge bundles, and stays safe when the value is missing or unexpected. Verify the conditional requiredness in src/env.js (Azure, Sentry vars required only in production; SendGrid and AUTH_ALLOWED_EMAILS optional; SUPABASE_MITO_PSW added). Check that no secret moves into the client schema. Check that the removed vars (DISCORD_*, CUSTOM_ACCESS, NEXT_PUBLIC_BASE_URL, PREVIEW_DB*) have no remaining references, including WorkerImportDialog.tsx. Check that the CI build with SKIP_ENV_VALIDATION and placeholders still passes.",
        "complexity": "high"
      },
      {
        "id": "v4",
        "charter": "Production credential isolation (the critical path named in root AGENTS.md). Verify that loadEnv (src/lib/global/env.ts) maps NODE_ENV=production to .env.prod.local and otherwise to .env.<NODE_ENV>.local. Verify that no module Next.js bundles still calls loadEnv or otherwise reads the prod credential file: db/index.ts, client/supabase.ts and the five cron route handlers had it removed; scan for any remaining call sites. Check that every NODE_ENV=production script in package.json still gets the right credentials or fails safe, never silently using the wrong DB: drizzle.config.ts, createSystemOperator.ts, seeds, src/app/api/cron/scheduled/*.js. Check that dropping the PREVIEW_DB fallback in db/index.ts cannot point any runtime at production. Owns src/lib/global/_test/env.test.ts.",
        "complexity": "high"
      },
      {
        "id": "v5",
        "charter": "Telemetry/PII containment in Sentry. Verify that outside production the client, server and edge Sentry.init get no DSN, using the shared sentryDsn in src/lib/utils/sentry.ts. Check that importing @/env is safe in the edge and client configs. Check that removing the `environment` tag does not degrade production event attribution. Verify that the Sentry webpack plugin options in next.config.js are valid for the installed @sentry/nextjs version and that, outside production, they disable source-map upload, release create/finalize and plugin telemetry while still uploading in production. Owns src/lib/utils/_test/sentry.test.ts.",
        "complexity": "medium"
      },
      {
        "id": "v6",
        "charter": "Release machinery. Verify .github/workflows/deploy-staging.yaml: trigger, concurrency, and `vercel pull --environment=preview --git-branch=dev` selecting Preview (never Production) env vars. Check that `vercel build`/`deploy --prebuilt` produces a preview deployment with VERCEL_ENV=preview, that the alias step targets mito-micro-services-staging.vercel.app with correct output capture, and that no token or secret leaks into logs. Note the commit-amend author override and the absence of a CI gate before deploy. Verify that vercel.json `git.deploymentEnabled: false` disables every Git-triggered deploy without breaking the unchanged deploy-production.yaml path, which must still build with VERCEL_ENV=production. Also check that Vercel crons and Deployment Protection still work.",
        "complexity": "high"
      },
      {
        "id": "v7",
        "charter": "Documentation and operator-checklist fidelity. Check that the root AGENTS.md rule edit, .env.example and brain/chore/staging-vercel.md match the code exactly: variable names, which ones are required per environment, the 'do not set on Preview' list (NEXT_PUBLIC_SENTRY_DSN, SENTRY_AUTH_TOKEN, NEXTAUTH_URL, NODE_ENV), the dev-DB-only instruction for Preview, the Entra redirect URI path, and the list of removed variables. Check that no real secret values appear and that no step would make staging reach production data.",
        "complexity": "low"
      }
    ]
  },
  "taskComplexity": "high",
  "reviewImpact": "critical",
  "humanInLoop": true,
  "nextStep": "Run v1-v7 as independent adversarial-verifier passes in parallel against base 2aaf3a8..head e424fca, reading context from the wt-staging checkout. Use the strongest model (Opus) for v1, v2, v3, v4 and v6, a balanced model for v5 and a fast model for v7. Consolidate the results into a standalone report under brain/review/<slug>/ and attach a mandatory human checklist. It must cover: Vercel Preview env vars set from dev values only; Entra redirect URI added; confirming the production build has NEXT_PUBLIC_VERCEL_ENV=production inlined (Azure-only, Sentry active); the first dev push deploying and aliasing correctly; no NODE_ENV=production script run during review. Do not merge into dev before the pending production migration session."
}
```

### Classifier rationale

Impatto `critical` con persona nel giro perché la diff tocca quattro superfici sensibili insieme: il filtro sul login e la creazione degli utenti (compresa la rimozione della route non autenticata `/api/operator/create`), la catena delle credenziali di produzione che l'`AGENTS.md` di root tratta come regola (`.env.prod.local`, mai `NODE_ENV=production`), la telemetria Sentry, che può portare dati personali, e il rilascio (nuovo workflow di staging e `vercel.json` che spegne i deploy da Git per tutti i branch). Il segnale di produzione (`VERCEL_ENV` inlinato come `NEXT_PUBLIC_VERCEL_ENV`) ha una verifica sua (v3), perché auth, validazione env e Sentry dipendono tutti da lui. Non ci sono contratti di dominio in `brain/domains/`, quindi il rischio viene da `AGENTS.md` e dalle categorie generiche.

### Overrides applied

Nessuno.

### Verification plan (derived)

| Pass | Charter | Complexity | Model tier |
|------|---------|------------|------------|
| v1 | Filtro sul login (provider e callback `signIn`) | high | strongest (Opus) |
| v2 | Creazione utente e operatore nell'adapter | high | strongest (Opus) |
| v3 | Segnale di produzione e schema env | high | strongest (Opus) |
| v4 | Isolamento delle credenziali di produzione | high | strongest (Opus) |
| v5 | Sentry fuori produzione | medium | balanced (Sonnet) |
| v6 | Workflow di deploy staging e `vercel.json` | high | strongest (Opus) |
| v7 | Documentazione e checklist operativa | low | fast (Haiku) |

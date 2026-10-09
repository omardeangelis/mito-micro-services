---
domain: platform
type: review
scope: standalone
spec: null
review_target: branch chore/accesso-fuori-prod → chore/staging-vercel → chore/env-prod-locale
base_ref: 19671c5
head_ref: d6e9d91
verdict: do-not-ship
review_impact: critical
human_in_loop: true
links:
  - "[[review/staging-accesso-sentry/RUBRIC]]"
ingested: false
last_ingested: null
created: 2026-10-09
updated: 2026-10-09
---

# Review Report: staging su Vercel, accesso fuori produzione, Sentry solo in prod

## Verdict (sesto giro)

**DO NOT SHIP** · impact: critical

v3, v4, v5 e v6 danno SHIP. v8 (checklist) boccia con una MAJOR, nel testo: nessuno ha trovato un difetto di sicurezza.

**La MAJOR.** Il controllo "`https://staging-crm.dbmito.it/monitoring` risponde 404" (`staging-vercel.md:116`) non può fallire. La route del tunnel di Sentry risponde solo con `?o=<cifre>&p=<cifre>` (`withSentryConfig.js:123-167`). Anche la produzione risponde 404 a una GET su `/monitoring`, e v8 l'ha verificato in sola lettura su `crm.dbmito.it`. Uno staging costruito per errore come produzione passerebbe il controllo.

**Cosa si chiude in questo giro.**
- **La decisione sulla produzione è una costante fissata al build.** `next.config.js` scrive sempre un valore nei bundle (`"none"` quando manca). Nelle tre build con i segnaposto, `isProduction` del server diventa `!1`, `!0` e `!1`, e nessun bundle legge più i segnali mentre gira (v3).
- **`next.config.js` ha un test.** Prende ogni caso e ogni stop, e fa fallire i mutanti che il quinto giro aveva lasciato passare (v3).
- **Il token non passa più al build.** Il controllo dello staging si ferma su ogni dominio in più e su `customEnvironmentId`, e l'alias si verifica con l'API (v6, 38 scenari).
- **`loadEnv` si ferma su ogni `NODE_ENV` sconosciuto** prima di leggere un file (v4).
- **La cartella temporanea del controllo dei dati resta vuota** anche con i segnali di annullamento del runner (v5, CLI 61.0.0 vera).

**Condizione.** Questi branch stanno sopra `chore/cron-indirizzo` (`19671c5`), che al sesto giro ha ancora DO NOT SHIP per due MAJOR nei testi. Arrivano su `dev` dopo quel branch e dopo G2.

## Coverage

- Pass rilanciati, con le obiezioni del quinto giro:
  - v3, v4, v5 e v6 con Opus (eredita);
  - v8 con Sonnet.
- Non rilanciati:
  - v1 (login) e v7 (Sentry): dipendono solo da `isProduction`, che dà le stesse risposte. Lo prova il test nuovo, e v3 ha fatto fallire `auth.test.ts`, `auth.db.test.ts` e `sentry.test.ts` con un mutante che ignora `APP_ENV`.
  - v2 (creazione degli utenti): invariata dal secondo giro.
  - v9 (convenzioni e gate): i gate li hanno rifatti v3, v4, v6 e v8, tutti verdi: `next lint`, `tsc`, 27 file e 242 test, build con i segnaposto.
- Evidenze:
  - v5 e v6 hanno usato la CLI 61.0.0 vera contro un'API finta, e bash 5.2 senza rete;
  - v6 e v8 hanno letto l'OpenAPI e le docs di Vercel e Supabase di oggi;
  - v8 ha fatto GET di sola lettura su `crm.dbmito.it` e su `o1.ingest.sentry.io`.
- v5 ha lasciato il suo harness in `scratchpad/av7/`.

## Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v8 — checklist | `staging-vercel.md:116` | "`/monitoring` risponde 404" vale anche in produzione: la riscrittura del tunnel prende solo `?o=…&p=…`. Il controllo non distingue uno staging costruito come produzione. | Togliere la voce: restano il log del build e `sentry-example-api`. Oppure una POST a `/monitoring?o=1&p=1`, che in prod passa a Sentry e nello staging dà 404. | no |
| MINOR | v8 — checklist | `staging-vercel.md:100`, `:111` | Un DB che non si connette rompe prima il login: il callback `signIn` interroga il DB (`auth.ts:128-137`) e lancia "Sign-in failed". Il rimedio sta sotto "Dati di sviluppo", che richiede di essere entrati. | Nella voce del login: errore o "Sign-in failed" → Logs del progetto di staging → errore di connessione → stringa del pooler, passo 4. | no |
| MINOR | v8 — checklist | `staging-vercel.md:98` | "Undo Rollback" non è nella pagina Deployments: è nell'Overview del progetto, sul riquadro della produzione, o `vercel promote`. Manca l'altra causa: "Auto-assign Custom Production Domains" spento, con la deployment "Staged". | Correggere il percorso e aggiungere la seconda causa (Promote, o riaccendere l'opzione). | no |
| MINOR | v6, v8 — "Limiti noti" | `staging-vercel.md:186` | "Un environment … oppure la protezione dei due branch" non limita il token: un push su qualunque altro branch può far girare un workflow che legge i secret del repository. Servono tutte e due le cose, e un token di Vercel non si limita a un progetto. | "e" al posto di "oppure": secret negli environment, limitati a `main` e `dev` protetti. Dire che il token vale per tutto il team. | sì |
| MINOR | v6 — pipeline | `deploy-production.yaml:63-66`, `deploy-staging.yaml:205-208`, `staging-vercel.md:186` | Togliere il token dal build non isola. Il codice del build gira sullo stesso runner e può raggiungere gli step successivi, che hanno il token: con `NODE_OPTIONS` in `$GITHUB_ENV`, sovrascrivendo `vercel` in `PNPM_HOME`, o con un `vercel.ts` che `deploy` esegue. I commenti fanno pensare a un confine. | Build in un job senza secret e deploy da un secondo job che non installa né esegue il codice. Oppure scrivere che è una difesa in più, non un isolamento. | sì |
| MINOR | v8 — "Limiti noti" | `staging-vercel.md:190` | postgres.js sul pooler in transaction mode: il rischio per Supabase è il pipelining, che può bloccare le query o restituire righe sbagliate. `max: 1` è solo la taglia del pool. | Nominare il pipelining e le righe scambiate. | sì |
| MINOR | v8 — checklist | `staging-vercel.md:141` | `/dashboard/profile?firstTime=true` compare anche per un utente esistente senza riga in `operator`, o senza nome e cognome (`DashboardInitialPage.tsx:11-16`). Non dice come distinguerli, né di cancellare l'utente creato su un DB sbagliato. | Cercare l'utente in `mito-deutsche_user` del DB collegato; se è appena nato, cancellarlo. | no |
| MINOR | v3 — segnale di produzione | `src/env.js:13-16` | Nessun test fissa l'ordine: prima il valore del build, poi la variabile di runtime. Due mutanti che leggono prima `APP_ENV` o `VERCEL_ENV` passano tutti i test (33/33), e il primo riporterebbe la divergenza fra server e client. La head è giusta. | Casi con `NEXT_PUBLIC_APP_ENV: "none"` e `APP_ENV: "staging"` → `true`, e con `NEXT_PUBLIC_VERCEL_ENV: "none"` e `VERCEL_ENV: "production"` → `false`. | no |
| MINOR | v4 — credenziali locali | `.eslintrc.cjs:63`; commenti `:47-52`, `AGENTS.md:26` | `**/db/scripts/**` non prende gli import relativi da dentro `src/server/db` che non passano da `db/` (`./scripts/createSystemOperator`, `../scripts/…`, `../../scripts/…`). I commenti dicono che li prende tutti. | `import/no-restricted-paths`, che risolve il file vero (plugin e resolver TS già installati), con le eccezioni dei seed, degli script, dei loro helper di test e del test di `loadEnv`. Oppure un pattern `**/createSystemOperator*`. Allineare i due commenti. | no |
| NIT | v3, v4, v5, v6, v8 | vari | v3: `"none"` negli enum senza test (CI salta la validazione); due stop presi solo in parte (`NEXT_PUBLIC_VERCEL_ENV` senza `VERCEL_ENV`, `NEXT_PUBLIC_APP_ENV: "none"` con `APP_ENV=staging`); `auth.test.ts` e `sentry.test.ts` leggono i segnali dalla shell; Sentry legge `VERCEL_ENV` per il suo environment di default (non decide niente); un Redeploy di una deployment `--prebuilt` probabilmente riusa l'output. v4: `drizzle.config.ts` importabile; passo 5 di `t3-adozione-mito-db.md` vecchio; `.env.production` e `.env.local` non controllati, `.env.production` non ignorato; il comando "su `.env`" a `:153` è quello di `.env.prod.local`; `next dev` riceve anche lui i segreti di prod di `.env`; mancano i casi `""` e `PROD` nel test. v5: stringa costruita apposta e tempo fra controllo e deploy (documentati); `env` di `vercel.json` non controllato (`jq -e 'has("env")\|not'`); Secret su PSW e KEY. v6: due `jq` che passano su risposte fuori contratto; finestra fra controllo e deploy anche per domini e protezione; `alias set` senza `--scope`; file `.env*` committati non controllati; `VERCEL_PROJECT_ID` vuoto. v8: passo 3 del caso con le maiuscole; policy "Separate Production Secret Values"; lo stop dell'alias non documentato; `NEXT_PUBLIC_SUPABASE_URL` di prod come Config; piani di migrazione vecchi (`migration_plan.md`, `fase-1-database-postgres.md`, `t6-pulizia-env.md`, `attivita-manuali-provider.md`, `t1-provisioning-postgres.md`); "eccezioni per una singola deployment", "CNAME", `.env.example:1`, un ";" di troppo, chiave `anon` deprecata. | Vedi il verificatore. | no |

## Esito delle finding del quinto giro

| Finding del quinto giro | Esito |
|-------------------------|-------|
| MINOR v3: valore scritto nei bundle solo se non vuoto | **Chiusa.** `"none"` in tutti i bundle, e `isProduction` del server è una costante. |
| MINOR v3: `next.config.js` senza test | **Chiusa.** 10 casi; i mutanti M2, M4 e quello senza `"none"` falliscono. Resta l'ordine di lettura (MINOR sopra). |
| MINOR v6: `VERCEL_TOKEN` e branch senza protezione | **Quasi chiusa.** Token fuori dagli argomenti e dal build, limite scritto in "Limiti noti". Restano il rimedio con "oppure" e il build che non isola (due MINOR sopra). |
| MINOR v6: lista dei domini, `customEnvironmentId` | **Chiusa.** |
| MINOR v4: `NODE_ENV=prod` | **Chiusa.** Ogni valore sconosciuto si ferma prima di leggere un file. |
| MINOR v8: tre rimedi dopo il deploy | **Uno chiuso** (export), **due parziali** (Current, DB: MINOR sopra). |
| MINOR v8: login Azure in prod | **Quasi chiusa.** Ora vede un DB sbagliato; la diagnosi non è univoca (MINOR sopra). |
| MINOR v8: Supabase (Connect, stringa diretta, API Keys) | **Chiusa.** Il pipelining di postgres.js manca (MINOR sopra). |
| NIT v3: test dello staging uguale alla prod; `VERCEL_ENV` controllato solo con `VERCEL`; `VERCEL_ENV=production next start` in locale | **Chiusi.** |
| NIT v4: `src/`, esenzione, `AGENTS.md`, `.env.example`, `env` esportato | **Chiusi.** Seed e script: **parziale** (MINOR sopra). Piani: quasi tutti. `.env.production`: **aperto**. |
| NIT v5: SIGTERM e `mktemp -d` | **Chiuso.** Autorità della stringa e tempo fra controllo e deploy: **documentati**, aperti. |
| NIT v6: 409 di `alias set`, `rm -rf .vercel` in prod, frasi che promettono troppo, `APP_ENV` Secret, override per alias | **Chiusi.** |
| NIT v8: caso con le maiuscole, LEFT JOIN, passo Node, frasi larghe, percorso del dominio, policy, piani | **In parte.** Restano il passo 3, la policy e alcuni piani (NIT). |

## What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v3 — segnale di produzione | Tre build con i segnaposto (CI, prod, staging): i valori sono scritti nei chunk del server, nel client, nell'edge e in `required-server-files.json`. `isProduction` del server compila a `!1`, `!0`, `!1`, e il DSN si piega allo stesso modo. Nessuna lettura dei segnali quando la funzione gira. `next.config.js` e i bundle decidono allo stesso modo; ogni stop scatta, e `"none"` non si può infilare a mano. Redeploy, Promote e Instant Rollback non cambiano la decisione, nemmeno con una variabile aggiunta dopo. |
| v4 — credenziali locali | `loadEnv` per ogni `NODE_ENV`, con le chiamate al filesystem tracciate: prod, PROD, Production, vuoto e gli altri si fermano prima di leggere. drizzle-kit 0.24.2 carica `.env` per primo, come scrivono i documenti. La guardia di `next.config.js` ferma `dev`, `build`, `start` e `lint` da ogni cartella. Regola ESLint: `loadDbEnv` e i seed presi in ogni forma, l'esenzione è di un solo file, nessun falso positivo. Gate verdi. |
| v5 — dati dello staging | CLI 61.0.0 vera contro un'API finta, 34 scenari in bash 5.2 senza rete. I due `pull` leggono i progetti giusti con il token dall'environment. Ogni configurazione sbagliata involontaria si ferma senza stampare valori né il token. `RUNNER_TEMP` è vuota dopo ogni scenario, segnali compresi. `vercel build --prod` senza token: 0 chiamate all'API, valori controllati, target production. |
| v6 — pipeline | 38 scenari per "Check the staging project": si ferma su errori HTTP, timeout, JSON illeggibile, domini in più, pagina successiva, `customEnvironmentId`. Il token non compare mai e non c'è più `--token`. Fatti della CLI 61 e dell'OpenAPI verificati: `build` senza token, `VERCEL_TOKEN` dall'environment, URL stampato da `deploy`, 409 preso per successo, `deployment.url` dell'alias. |
| v8 — checklist | Nomi, ambienti e progetti uguali al codice e ai workflow. Ogni stop elencato esiste. Ordine dei passi sicuro. SQL del caso con le maiuscole eseguito in PGlite. Conteggio della lista Clienti (LEFT JOIN), export, SSR, percorsi di Vercel e frasi su Supabase verificati nelle docs di oggi. La sezione dei cron è onesta sulla protezione di prod, che da qui non si verifica. |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Login fuori produzione | — | Non rilanciato (SHIP al terzo giro). La dipendenza da `isProduction` l'ha coperta v3. |
| v2 | Creazione degli utenti | — | Non rilanciato (SHIP al secondo giro). |
| v3 | Segnale di produzione | SHIP | La decisione è una costante del build in ogni bundle. Una MINOR sui test dell'ordine di lettura. |
| v4 | Credenziali locali | SHIP | Tutte le voci reggono. Una MINOR sulla regola ESLint degli script. |
| v5 | Dati dello staging | SHIP | Nessuna configurazione sbagliata involontaria arriva ai dati di prod. Solo NIT. |
| v6 | Pipeline | SHIP | Ogni controllo si ferma dal lato sicuro. Due MINOR su testi e isolamento del token. |
| v7 | Sentry | — | Non rilanciato (SHIP al secondo giro). |
| v8 | Checklist | DO NOT SHIP | Un controllo di Sentry che non può fallire, e cinque MINOR di testo. |
| v9 | Convenzioni e gate | — | Gate rifatti da v3, v4, v6 e v8: verdi. |

## Human Review Checklist

Ognuno dei passi dice cosa va verificato e com'è il risultato giusto. Le variabili si guardano solo per nome, mai i valori.

1. **Correggere la MAJOR di v8**, cioè il controllo di `/monitoring`, e le MINOR della checklist e dei "Limiti noti". Poi rifare v8.
2. **Decidere sulle altre MINOR prima del merge su `dev`:**
   - test dell'ordine di lettura (v3);
   - regola ESLint sugli script (v4);
   - build e deploy in due job (v6).
3. **Progetto di staging su Vercel, ambiente Production:**
   - `APP_ENV=staging` come Config;
   - via `NODE_ENV`;
   - `SUPABASE_DB_CONNECTION_STRING` del pooler, presa dal dialogo Connect, e ogni `NEXT_PUBLIC_*` come Config;
   - la chiave `anon` del progetto Supabase di sviluppo;
   - "All Deployments" con Vercel Authentication;
   - Node.js 22.x;
   - Git scollegato;
   - `staging-crm.dbmito.it` su Production come unico dominio fuori da `*.vercel.app`.
4. **Progetto di prod, prima del merge su `main`:**
   - "Enable access to System Environment Variables" acceso;
   - nessun Deploy Hook;
   - in Production le variabili richieste da `src/env.js`, con `NEXT_PUBLIC_SUPABASE_URL` come Config;
   - nessuna fra `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_VERCEL_ENV`, `SKIP_ENV_VALIDATION`, `PREVIEW_DB*` e `CUSTOM_ACCESS`.
5. **In locale, subito dopo aver preso `chore/env-prod-locale`:** rinominare `.env.production.local` in `.env.prod.local`.
6. **Token e branch:** spostare `VERCEL_TOKEN` in environment GitHub limitati a `main` e `dev`, **e** proteggere i due branch. Oppure accettare per scritto il rischio di un token del team usato da qualunque branch.
7. **Ordine dei merge:**
   - prima `chore/cron-indirizzo`, dopo le sue correzioni, su `dev`, prima di G2;
   - dopo G2 i tre branch dello staging. Il merge su `dev` fa subito il deploy dello staging; poi i controlli di `staging-vercel.md`.
8. **Mai un Redeploy dalla dashboard**, e mai `next build` o `next start` in locale con i file env veri.
9. **Gate** da `AGENTS.md`: lint, `tsc`, test, build con i segnaposto.

## Notes for docs-maintenance

- Finding durevoli da portare in `tech-debt/platform/`, se rinviate:
  - `VERCEL_TOKEN` del repository, per tutto il team, con `main` e `dev` senza protezione; il build sullo stesso runner degli step con il token (v6);
  - postgres.js sul pooler in transaction mode: pipelining e `max: 1` (v8, preesistente);
  - `linkAccount` separato da `createUser` in NextAuth (secondo giro, v2);
  - nessun indice unico su `lower(email)`;
  - gli errori del DB nel login non arrivano a Sentry (secondo giro, v9);
  - `getUserByEmail` dell'adapter fuori dal try di NextAuth.
- Domain pages that should backlink this review: n/a (standalone).

---

## Quinto giro (2026-10-09, base `5e3fd5d`, head `dd0eea0`)

### Verdict

**SHIP** · impact: critical

I cinque revisori rilanciati sul nuovo disegno danno tutti SHIP: v3, v4, v5, v6 e v8.

Il nuovo disegno funziona così:
- lo staging è una deployment di Production del progetto `staging-mito-micro-services`, fatta con `vercel deploy --prebuilt --prod`;
- dalla produzione lo separa `APP_ENV=staging`.

**Cosa hanno provato.**
- **Il segnale di produzione regge.** Due build con i segnaposto, una come prod e una come staging, scrivono nei bundle la stessa decisione che prende `next.config.js`. Nello staging `isProduction` diventa `false` già in compilazione.
- **Le guardie e i controlli si fermano su tutti i casi del charter.** Sono quelle di `next.config.js` e quelli dei due workflow.
- **`NODE_ENV` su Vercel non ha effetto.** Lo confermano i sorgenti di `@vercel/next` 15.0.2 (usato dalla CLI 61.0.0) e di Next 14.2.5.

**La MAJOR del quarto giro è chiusa.** Il passo "Check the build is production" ora stampa un `::error::` per ognuno dei suoi tre stop: v6 e v8 l'hanno eseguito. E la lista prima del merge su `main` fa accendere le variabili di sistema.

Restano solo MINOR e NIT. Le due più forti:
- **v3: in prod, server e client possono decidere in modo diverso.** Next 14.2.5 scrive un valore di `env` nei bundle solo se non è vuoto (`define-env-plugin.js:52-57`, verificato da chi orchestra). Senza `APP_ENV`, la prod legge `APP_ENV` quando la funzione gira, mentre il client ha già il suo valore fissato al build.
- **v6: il workflow non controlla che `staging-crm.dbmito.it` sia l'unico dominio di produzione del progetto di staging.**

**Condizione.** Questi branch stanno sopra `chore/cron-indirizzo` (`5e3fd5d`), che al quinto giro ha ancora DO NOT SHIP per due MAJOR nei testi. Arrivano su `dev` dopo G2 e dopo quel branch.

### Coverage

- Pass rilanciati, con le obiezioni del quarto giro:
  - v3, v4, v5 e v6 con Opus (eredita);
  - v8 con Sonnet.
- Non rilanciati:
  - v1 (login fuori produzione) e v7 (Sentry): il loro codice non cambia, e cambia solo `isProduction`, da cui dipendono. L'ha controllato v3: un mutante che ignora `APP_ENV` fa fallire 9 test (5 in `auth.db.test.ts`, 4 in `sentry.test.ts`).
  - v2 (creazione degli utenti): invariata dal secondo giro.
  - v9 (convenzioni e gate): i gate li hanno rifatti v3, v4 e v6, e sono verdi: `next lint`, `tsc`, 26 file e 227 test, build con i segnaposto.
- Evidenze:
  - v5 e v6 hanno fatto girare la CLI 61.0.0 vera contro un'API finta, con un token finto e una HOME usa e getta;
  - v6 ha letto l'OpenAPI di Vercel di oggi;
  - v8 le docs di Vercel e Supabase di oggi.
- Nota di v6: il gate dei test può aver aggiornato la cache di vitest in `node_modules/.vite/vitest`, che è condivisa.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MINOR | v3 — segnale di produzione | `next.config.js:76`; `src/env.js` | Next 14.2.5 scrive nei bundle solo i valori di `env` non vuoti. In prod, senza `APP_ENV`, `NEXT_PUBLIC_APP_ENV` non c'è. Il server legge `APP_ENV` quando la funzione gira (16 chunk server ed `edge-instrumentation.js`); il client legge il polyfill vuoto. Il caso: `APP_ENV` arriva nel progetto di prod e una deployment nasce senza un nuovo `vercel build` (Redeploy dalla dashboard, o variabile cambiata fra pull e deploy). Allora il server dice "non produzione" e il client "produzione": filtro sul login per gli utenti Azure nuovi, Sentry del server spento. La checklist vieta il Redeploy dalla dashboard. Lo staging non è toccato. | Scrivere sempre un valore non vuoto: `APP_ENV ?? "none"`, con `"none"` nell'enum, oppure `NEXT_PUBLIC_IS_PRODUCTION` calcolato in `next.config.js` e letto per primo in `src/env.js`. Chiude anche la NIT del quarto giro su `VERCEL_ENV=production next start` in locale. | no |
| MINOR | v3 — segnale di produzione | `next.config.js` | Nessun test importa `next.config.js`: i suoi quattro `throw` e la mappa `env` non sono provati. Togliendo `?? process.env.APP_ENV` (M2) o `?? process.env.VERCEL_ENV` (M4) da `src/env.js`, i 23 test restano verdi. Ma `next.config.js` usa proprio questi fallback: senza il primo, lo staging al build si crederebbe la produzione (source map, release, telemetria, tunnel di Sentry, variabili richieste). | Un test che importa `next.config.js` e `src/env.js` con solo `VERCEL_ENV` e `APP_ENV` (produzione, staging, preview, locale), e controlla `isProduction`, `config.env` e ogni `throw`. | no |
| MINOR | v6 — pipeline | `deploy-staging.yaml:186`, `deploy-production.yaml:57` | Ancora aperta. "`main` arriva in prod solo dal suo workflow" e "il dominio dello staging non serve la prod" valgono per convenzione. `main` e `dev` sono senza protezione e non ci sono environments. `VERCEL_TOKEN` è del repository e vale per tutto il team, e `--token` finisce negli argomenti del processo che esegue gli script di `pnpm install` e `next build` del branch. Con quel token `vercel alias set` può puntare un dominio su qualunque deployment. Non è scritto in `brain/` né in tech-debt. | Togliere `--token` da `vercel build`: la CLI 61, dopo il `pull`, non ne ha bisogno. Limitare il token (environment su `main` e `dev`, o protezione dei branch). Registrare il resto in tech-debt. | sì |
| MINOR | v6 — pipeline | `deploy-staging.yaml:76-87`; `staging-vercel.md` passo 6 | Il controllo prova che `staging-crm.dbmito.it` è sul progetto di staging. Non prova che sia il suo unico dominio di produzione, né che `customEnvironmentId` sia nullo (lo scenario 29 passa). Se un dominio di prod finisse su quel progetto, ogni push su `dev` lo prenderebbe. | `GET /v9/projects/$ID/domains?production=true`: fermarsi a meno che l'unico dominio fuori da `*.vercel.app` sia `$STAGING_DOMAIN` con `customEnvironmentId` nullo. Aggiungere il caso al passo 6. | no |
| MINOR | v4 — credenziali locali | `loadDbEnv.ts:25-27` | Con `NODE_ENV=prod` (e su APFS `PROD`) si carica `.env.prod.local` dal ramo non di produzione: niente guardie, niente override, e la shell vince. `NODE_ENV=Production` su APFS legge `.env.production.local`. Nessuno script lo imposta: serve un comando scritto a mano. | Ramo con le guardie quando `NODE_ENV?.toLowerCase()` è `production` o `prod`; o rifiutare ogni valore che non sia `development`, `test` o assente. | no |
| MINOR | v8 — checklist | `staging-vercel.md:96`, `:109`, `:110` | Tre controlli dopo il deploy non hanno un rimedio, o ne hanno uno sbagliato. `:96`: Production/Current senza rimedio. `:109`: niente per un DB che non si connette (la connessione diretta `db.<ref>` è solo IPv6 senza l'add-on). `:110`: un export fallito trattato come una fuga, quando la causa probabile è la chiave anon o il bucket. | Una frase di rimedio per ognuno. | no |
| MINOR | v8 — checklist | `staging-vercel.md:139` | Il login Azure in prod non può fallire per il motivo scritto ("in prod non c'è filtro"). L'utente esiste nel DB collegato, quindi entra anche se il build è in modalità non di produzione. E su un DB sbagliato NextAuth creerebbe un utente nuovo. | Chiamarlo controllo di Azure e del redirect URI. Oppure: l'utente arriva alla dashboard con il suo ruolo e i suoi dati, non a `/dashboard/profile?firstTime=true`, e il numero dei clienti è quello di prod. | no |
| MINOR | v8 — checklist | `staging-vercel.md:55`, `:57` | Mancano tre avvertenze: l'host del pooler va copiato dal dialogo Connect; postgres.js in pipeline sul pooler in transaction mode può bloccarsi, e Supabase consiglia `max: 1` (questo c'era già in `db/index.ts`); `:55` è ambigua se il file locale ha la stringa diretta. In più "Project Settings → API" non esiste più (ora è Settings → API Keys), e `anon` è una chiave legacy. | Aggiornare il percorso e aggiungere le avvertenze. | no |
| NIT | v3, v4, v5, v6, v8 | vari | v3: il caso "auth on staging" di `auth.test.ts` dà lo stesso esito della prod; `VERCEL_ENV` controllato solo con `VERCEL`. v4: `next lint` non guarda i `sentry.*.config.ts` della radice; esenzione `_test/**` troppo larga; seed e script importabili dall'app; `AGENTS.md:26` senza "or the shell"; `seed:db` non descritto; tre piani di migrazione con il vecchio comportamento; `.env.production` non ignorato; `env` esportato e mai usato. v5: stringa costruita apposta (autorità, `%`, `PG*`); tempo fra controllo e deploy; SIGTERM e cartella temporanea; Secret su PSW e KEY. v6: un 409 di `alias set` preso come successo; `deploy-production.yaml` senza `rm -rf .vercel`; commenti che promettono troppo; `APP_ENV` Secret con il messaggio sbagliato; override per alias. v8: il caso con le maiuscole non può fallire prima del clic; il conteggio dei clienti con la LEFT JOIN; il passo Node è cosmetico; frasi larghe; percorso del dominio; "Separate Production Secret Values"; piani di migrazione vecchi. | Vedi il verificatore. | no |

### Esito delle finding del quarto giro

| Finding del quarto giro | Esito |
|-------------------------|-------|
| MAJOR v8: "Check the build is production" muto senza `VERCEL_ENV`, impostazione non in lista | **Chiusa.** Eseguito da v6 e v8: file mancante o vuoto → `::error::`; voce 1 della lista prima di `main`. |
| MINOR v6: `VERCEL_TOKEN` e branch senza protezione | **Aperta** (MINOR sopra). |
| MINOR v6: Production dello staging non tenuto vuoto | **Superata** dal disegno `--prod`. Resta la lista dei domini (MINOR sopra). |
| MINOR v4: namespace e `export *` di `@/env` | **Chiusa.** `loadDbEnv.ts`, regola sul suo nome: 22 forme prese, nessuna di `@/env`. |
| MINOR v8: `::error::` e "Build Project Artifacts", rimedio del dominio, SSR, Config, storage di sviluppo, Pro Viewer, Hobby | **Chiuse.** Restano tre rimedi e il percorso Supabase (MINOR sopra). |
| NIT v6: job di prod senza `concurrency`, timeout, `permissions`; `.name`, `.verified`, `.id`; JSON illeggibile | **Chiusi.** `customEnvironmentId` resta aperto. |
| NIT v5: autorità e `%`, tempo fra controllo e deploy, SIGTERM | **Aperti.** `.vercel` già nel checkout: **chiuso** con `rm -rf .vercel`. |
| NIT v4: `sentry.*.config.ts`, `NODE_ENV=prod`, `.env.production`, `seed:db`, "or the shell" | **Aperti.** `NODE_ENV=prod` sale a MINOR. |
| NIT v3 (terzo giro): `VERCEL_ENV=production next start` in locale | **Aperto.** Stessa causa della prima MINOR. |
| MINOR v3 (terzo giro): Promote di una deployment dello staging | **Chiusa.** Lo staging ha un progetto suo; `git.deploymentEnabled: false`. |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v3 — segnale di produzione | Build A (segnaposto di CI) e build B (`VERCEL=1 VERCEL_ENV=production APP_ENV=staging`) senza errori. Nella B "production" e "staging" sono scritti nei chunk del server, nell'edge e nei chunk statici, e `isProduction` diventa `!1`. Le guardie di `next.config.js` provate con env finti, e i controlli dei due workflow con `bash -e`. Sorgenti di `@vercel/next` 15.0.2 e di Next 14.2.5 su `NODE_ENV`. Redeploy, Promote e Rollback: lo staging non diventa mai la produzione. |
| v4 — credenziali locali | `loadEnv` su file finti con dotenv 16.4.5: tre stop, override sulla shell e sul `.env`. `next lint`, `build`, `dev` e `start` si fermano con `.env.production.local`, da ogni cartella, con le maiuscole e con un symlink. 22 forme di import prese, nessuna di `@/env`. Nessun percorso vecchio rimasto. Nel `.next` non c'è `loadDbEnv`. |
| v5 — dati dello staging | CLI 61.0.0 vera contro un'API finta: i due `pull` leggono i progetti giusti, e `project.json` resta sullo staging. 43 casi in bash 5.2 senza rete: ogni configurazione sbagliata involontaria ferma il deploy, senza stampare valori. `vercel build --prod` carica proprio il file controllato. `rm -rf .vercel` toglie le chiavi piantate. |
| v6 — pipeline | 32 scenari di API finta per "Check the staging project": si ferma su 404, 403, timeout, DNS, HTML, JSON troncato, sso diverso da `all`, `link` presente, dominio con redirect, branch o non verificato. Il token non compare mai. Tre `::error::` del passo di prod su 16 file. Valori dell'OpenAPI per `verified`, `gitBranch`, `deploymentType`. |
| v8 — checklist | Nomi, ambienti e progetti uguali a `src/env.js`, `next.config.js` e ai due workflow. L'SQL del documento eseguito in PGlite sulle migrazioni vere. Login: maiuscole, AccessDenied, `OAuthAccountNotLinked` nel sorgente di next-auth 4.24.7. Percorsi ed etichette di Vercel uguali alle docs di oggi. Ordine dei passi: ogni mancanza ferma il workflow prima della build. |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Login fuori produzione | — | Non rilanciato (SHIP al terzo giro). La dipendenza da `isProduction` l'ha coperta v3. |
| v2 | Creazione degli utenti | — | Non rilanciato (SHIP al secondo giro). |
| v3 | Segnale di produzione | SHIP | Nessuna deployment creata dai workflow ha la risposta sbagliata. Due MINOR: valore sempre scritto nei bundle, test di `next.config.js`. |
| v4 | Credenziali locali | SHIP | Tutte le voci reggono. MINOR su `NODE_ENV=prod`. |
| v5 | Dati dello staging | SHIP | Nessuna configurazione sbagliata involontaria arriva ai dati di prod. Solo NIT già noti. |
| v6 | Pipeline | SHIP | Ogni percorso dentro i workflow si ferma. Due MINOR su invarianti che non controlla nessuno. |
| v7 | Sentry | — | Non rilanciato (SHIP al secondo giro). Visto da v3 e v8 sul nuovo segnale. |
| v8 | Checklist | SHIP | La MAJOR è chiusa. Tre MINOR, ognuna da una frase. |
| v9 | Convenzioni e gate | — | Gate rifatti da v3, v4 e v6: verdi. |

### Human Review Checklist

Ognuno dei passi dice cosa va verificato e com'è il risultato giusto. Le variabili si guardano solo per nome, mai i valori.

1. **Decidere sulle MINOR prima del merge su `dev`.** Le più utili:
   - il valore sempre scritto nei bundle, con un test di `next.config.js` (v3);
   - la lista dei domini di produzione del progetto di staging (v6);
   - `NODE_ENV=prod` (v4);
   - i tre rimedi e il login Azure in prod (v8).
2. **Progetto di staging su Vercel, ambiente Production:**
   - `APP_ENV=staging` come Config. Non `NEXT_PUBLIC_APP_ENV`, che il build ricava da sola;
   - via `NODE_ENV`;
   - `SUPABASE_DB_CONNECTION_STRING` (pooler, host copiato dal dialogo Connect) e ogni `NEXT_PUBLIC_*` come Config;
   - la chiave anon dal progetto Supabase di sviluppo (Settings → API Keys);
   - Deployment Protection su "All Deployments" con Vercel Authentication;
   - Node.js 22.x;
   - Git scollegato;
   - `staging-crm.dbmito.it` su Production, "Valid Configuration", e nessun altro dominio di produzione.
3. **Progetto di prod, prima del merge su `main`:**
   - "Enable access to System Environment Variables" acceso;
   - nessun Deploy Hook;
   - in Production le variabili richieste da `src/env.js`;
   - nessuna fra `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_VERCEL_ENV`, `SKIP_ENV_VALIDATION`, `PREVIEW_DB*` e `CUSTOM_ACCESS`.
4. **In locale, subito dopo aver preso `chore/env-prod-locale`:** rinominare `.env.production.local` in `.env.prod.local`. Fino ad allora `next dev`, `next build`, `next start` e `next lint` si fermano.
5. **Token e branch:** GitHub Environments o ruleset su `main` e `dev`. Oppure accettare per scritto il rischio di un token del team usato da qualunque branch.
6. **Ordine dei merge:**
   - prima `chore/cron-indirizzo`, dopo le sue correzioni, su `dev`, prima di G2;
   - dopo G2 i tre branch dello staging. Il merge su `dev` fa subito il deploy dello staging: poi i controlli di `staging-vercel.md`.
7. **Mai un Redeploy dalla dashboard, mai uno script con `NODE_ENV=production`** senza una persona, e mai `next build` o `next start` in locale con i file env veri.
8. **Gate** da `AGENTS.md`: lint, `tsc`, test, build con i segnaposto.

### Notes for docs-maintenance

- Finding durevoli da portare in `tech-debt/platform/`, se rinviate:
  - `VERCEL_TOKEN` del repository passato a `vercel build` di qualunque branch, con `main` e `dev` senza protezione (v6);
  - postgres.js sul pooler in transaction mode senza `max: 1` (v8, già nella base);
  - `linkAccount` separato da `createUser` in NextAuth (secondo giro, v2);
  - nessun indice unico su `lower(email)`;
  - gli errori del DB nel login non arrivano a Sentry (secondo giro, v9);
  - `getUserByEmail` dell'adapter fuori dal try di NextAuth.
- Domain pages that should backlink this review: n/a (standalone).

---

## Quarto giro (2026-10-09, base `9ca8f83`, head `1c88682`)

### Verdict

**DO NOT SHIP** · impact: critical

Le tre MAJOR del terzo giro sono chiuse:

- la regola ESLint prende ogni import statico di `loadEnv`, relativi brevi compresi;
- il controllo con le maiuscole dà quello che dice: v8 l'ha provato con l'`AuthHandler` vero di NextAuth;
- quasi tutti i controlli dopo il deploy dicono cosa fare se falliscono.

Tre revisori su quattro danno SHIP (v4, v5, v6). Resta una MAJOR di v8. Il passo "Check the build is production" si ferma senza messaggio se nel progetto di prod è spento "Enable access to System Environment Variables", ma la checklist dice che il suo `::error::` indica la variabile mancante. E la lista prima del merge su `main` non fa controllare quell'impostazione, che la base non chiedeva.

**Decisione del proprietario arrivata durante il giro.**

- Lo staging si pubblica come deployment di Production del progetto `staging-mito-micro-services` (`vercel --prod`), con `staging-crm.dbmito.it` su quell'ambiente e le variabili in Production.
- `NODE_ENV=development` su Vercel non ha effetto: il builder `@vercel/next` avvia `next build` con `NODE_ENV=production`, e le funzioni lo rimettono a `production` con un warning. Lo staging si distingue invece con `APP_ENV=staging`, che il proprietario ha aggiunto.
- Workflow, controlli e checklist rivisti in questo giro sono per il deploy di Preview: v3, v5, v6 e v8 vanno rifatti sul nuovo disegno.

### Coverage

- Pass rilanciati: v4, v5 e v6 con Opus (eredita), v8 con Sonnet, con le obiezioni del terzo giro.
- Non rilanciati: v1 e v2 (login e creazione degli utenti invariati), v3 (segnale di produzione invariato), v7 (Sentry invariato), v9 (i gate li rilancia chi orchestra).
- Evidenze di chi orchestra:
  - gate verdi su ogni branch: 197, 206 e 213 test, build con i segnaposto;
  - sorgente di `@vercel/next` 4.7.8 (CLI 41.6.2): `env.NODE_ENV = "production"` per la build in server mode, e i launcher sovrascrivono un `NODE_ENV` diverso ("NODE_ENV was incorrectly set…");
  - `define-env-plugin` di Next 14.2.5 scrive `process.env.NODE_ENV` come `"production"` nei bundle di `next build`.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v8 — checklist; anche v6 (NIT) | `staging-vercel.md:130`, `:116-126`; `deploy-production.yaml:38` | Il `grep -qx 'VERCEL_ENV="production"'` del passo di prod fallisce senza `::error::`. La causa è un'impostazione del progetto di prod ("Enable access to System Environment Variables"), che la lista prima del merge su `main` non fa controllare; `next.config.js` ora la richiede. | Aggiungere la voce alla lista prima del merge su `main`, e un `::error::` al `grep` come nello staging. | no |
| MINOR | v6 — pipeline | i due workflow di deploy | `VERCEL_TOKEN` è del repository, vale per tutto il team, e va a `vercel build`, che esegue il codice del branch. `main` e `dev` sono senza protezione e i job senza `environment:`. | GitHub Environments (`production` limitato a `main`, `staging` a `dev`), ruleset, o il rischio accettato per scritto in `tech-debt/`. | sì |
| MINOR | v6 — pipeline | `deploy-staging.yaml` | Nel progetto di staging il dominio è di produzione e segue ogni deployment di Production; il workflow non controlla che Production resti vuoto. | Superata dalla decisione `--prod`: il workflow pubblica proprio in Production. | no |
| MINOR | v4 — credenziali locali | `.eslintrc.cjs:56` | Il gruppo `["**/env", "**/env.*"]` prende anche `import * as x from "@/env"` e `export * from "@/env"` ("'loadEnv' from '@/env' is restricted"). Oggi nessun import così. | `loadEnv` in un modulo con un nome suo (per esempio `loadDbEnv.ts`), e la regola su quel nome. | no |
| MINOR | v8 — checklist | `staging-vercel.md:91`, `:131`, `:106`, `:133`, `:51-52`, `:105`, `:82-84` | Il primo `::error::` non c'è se manca una variabile richiesta da `src/env.js` (si ferma "Build Project Artifacts"); il controllo del dominio non ha rimedio; i controlli SSR non possono fallire per la ragione scritta (il fetch tRPC lato server non porta il cookie); solo la stringa del DB è detta Config, mentre ogni `NEXT_PUBLIC_*` finisce nel bundle; nessun controllo che lo staging usi lo storage di sviluppo; il ruolo si chiama Pro Viewer, e Hobby ammette un solo utente esterno. | Una correzione per punto, come nel rapporto di v8. | no |
| NIT | v4, v5, v6, v8 | vari | v4: `next lint` non controlla i `sentry.*.config.ts` della radice; `NODE_ENV=prod`; `.env.production` non ignorato; `seed:db` non descritto. v5: la corrispondenza del ref non è legata all'autorità e non decodifica `%`; un `.vercel` già nel checkout; tempo fra controllo e deploy; un Secret su PSW o KEY passa. v6: job di prod senza `concurrency`, `timeout-minutes` e `permissions`; il controllo del dominio non guarda `.name` e `.verified`; un JSON illeggibile dà il messaggio sbagliato; Deploy Hooks del progetto di prod. v8: rimedio di Sentry, frasi da precisare. | Vedi il verificatore. | no |

### Esito delle finding del terzo giro

| Finding del terzo giro | Esito |
|------------------------|-------|
| MAJOR v4: ESLint non prende gli import relativi brevi | **Chiuso.** Prese tutte le forme statiche, `export *` compreso. Nuova MINOR sui namespace di `@/env`. |
| MAJOR v8: il controllo con le maiuscole è contraddetto | **Chiuso.** `AuthHandler` vero su PGlite con le migrazioni: "AccessDenied", nessuna mail, conteggio 1, 0 dopo il `DELETE`. |
| MAJOR v8: controlli senza rimedio | **Quasi chiuso.** Restano `:91`, `:130` (MAJOR) e `:131`. |
| MINOR: `PREVIEW_DB*` e `CUSTOM_ACCESS` in Production | **Chiuso.** |
| MINOR: `.env.example` su drizzle-kit | **Chiuso.** Verificato nel sorgente di drizzle-kit 0.24.2. |
| MINOR: "solo dal suo workflow" è una convenzione | **Aperto** (MINOR sopra). |
| MINOR: dettagli di Vercel, Azure in prod, SSR, Sentry | **Chiusi**, tranne il nome del ruolo, il limite di Hobby, lo storage di sviluppo e la premessa dei controlli SSR. |
| MINOR: `OAuthAccountNotLinked` | **Chiuso**, provato da v8. |
| MINOR: anche `next lint` si ferma | **Chiuso**, provato da v4 e v8. |
| NIT v5: spazi, ref in minuscolo e su una riga | **Chiusi.** |
| NIT v6: `jq -e`, messaggi, timeout | **Chiusi** per lo staging. Il job di prod non ha ancora messaggio, timeout e `concurrency`. |
| NIT v4: `env.ts`, `existsSync`, `KEY: value` | **Chiusi.** `.env.production` e `NODE_ENV=prod` restano aperti. |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v4 — credenziali locali | `loadEnv` su file finti con dotenv 16.4.5: si ferma senza file, con una cartella, con `.env.production.local`, con una chiave mancante o vuota anche se la shell la dà; i valori del file vincono. `next lint`, `build`, `start` e `dev` si fermano da ogni cartella. Nel `.next` di una build non c'è `loadEnv`. 213 test, build con i segnaposto. |
| v5 — dati dello staging | CLI 61.0.0 vera, in bash 5.2 senza rete contro un'API finta, con i passi estratti dal workflow: 34 casi, più 17 file costruiti a mano. Ogni modo realistico di arrivare al DB o allo storage di prod ferma il deploy, senza stampare valori; i file si cancellano sempre. |
| v6 — pipeline | Valori di `ssoProtection.deploymentType` e forma di `link` dall'OpenAPI di Vercel; nella CLI 61.0.0 Standard è `prod_deployment_urls_and_all_previews`. Il controllo del progetto si ferma su circa 40 casi di errore, senza mai stampare il token. `vercel.json` spegne i deploy dai commit. |
| v8 — checklist | Nomi, ambienti e ordine corrispondono al codice e ai workflow. I controlli negativi del login danno quello che dicono, provati con NextAuth vero. Percorsi ed etichette di Vercel uguali alle docs di oggi. |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Login fuori produzione | — | Non rilanciato (SHIP al terzo giro). |
| v2 | Creazione degli utenti | — | Non rilanciato (SHIP al secondo giro). |
| v3 | Segnale di produzione | — | Non rilanciato (SHIP al terzo giro). Da rifare con `APP_ENV`. |
| v4 | Credenziali locali | SHIP | La MAJOR è chiusa. MINOR sui namespace di `@/env`. |
| v5 | Dati dello staging | SHIP | Nessun modo realistico di arrivare ai dati di prod. Da rifare sull'ambiente Production dello staging. |
| v6 | Pipeline | SHIP | Ogni voce del charter regge. Da rifare sul deploy `--prod`. |
| v7 | Sentry | — | Non rilanciato (SHIP al secondo giro). |
| v8 | Checklist | DO NOT SHIP | Il passo di prod si ferma senza messaggio per un'impostazione che la checklist non fa controllare. |
| v9 | Convenzioni e gate | — | Gate rilanciati da chi orchestra: verdi. |

### Human Review Checklist

Ognuno dei passi dice cosa va verificato e com'è il risultato giusto. Le variabili si guardano solo per nome, mai i valori.

1. **Riscrivere workflow, segnale di produzione e checklist** per il deploy `--prod` con `APP_ENV=staging`, correggere la MAJOR di v8, poi rifare v3, v5, v6 e v8.
2. **Progetto di staging su Vercel:**
   - variabili nell'ambiente Production;
   - `APP_ENV=staging` al posto di `NODE_ENV=development`;
   - Deployment Protection su "All Deployments" con Vercel Authentication;
   - Node.js 22.x, come `engines.node`;
   - Git scollegato;
   - `staging-crm.dbmito.it` sull'ambiente Production.
3. **Progetto di prod, prima del merge su `main`:** "Enable access to System Environment Variables" acceso. In Production, solo per nome, ci sono le variabili richieste da `src/env.js`, e non ci sono `APP_ENV`, `PREVIEW_DB*`, `CUSTOM_ACCESS`, `SKIP_ENV_VALIDATION` né `NEXT_PUBLIC_VERCEL_ENV`.
4. **In locale, subito dopo aver preso `chore/env-prod-locale`:** rinominare `.env.production.local` in `.env.prod.local`. Fino ad allora `next dev`, `next build`, `next start` e `next lint` si fermano.
5. **Token e branch:** GitHub Environments o ruleset su `main` e `dev`, oppure accettare per scritto il rischio di un token del team usato da qualunque branch.
6. **Merge su `dev` solo dopo G2**: il merge fa subito il deploy dello staging.
7. **Mai uno script con `NODE_ENV=production`** senza una persona, e mai `next build` o `next start` in locale con i file env veri.

### Notes for docs-maintenance

- Finding durevoli da portare in `tech-debt/platform/`, se rinviate:
  - `VERCEL_TOKEN` del repository passato a `vercel build` di qualunque branch (v6);
  - `linkAccount` separato da `createUser` in NextAuth (secondo giro, v2);
  - nessun indice unico su `lower(email)`;
  - gli errori del DB nel login non arrivano a Sentry (secondo giro, v9);
  - `getUserByEmail` dell'adapter fuori dal try di NextAuth.
- Domain pages that should backlink this review: n/a (standalone).

---

## Terzo giro (2026-10-09, base `cc58070`, head `88ebd8b`)

### Verdict

**DO NOT SHIP** · impact: critical

I tre BLOCKER del secondo giro sono chiusi:

- il controllo dei dati dello staging confronta i progetti Supabase, e regge anche con le variabili Sensitive (48 casi, sulla CLI 61.0.0 vera);
- il workflow controlla, a ogni deploy, che il dominio dello staging sia sul branch `dev`;
- i testi su cosa raggiunge il `.env` locale ora sono veri, e gli script di prod si fermano se `.env.prod.local` non ha da solo le due chiavi del DB.

Quattro revisori su sei danno SHIP. Restano tre problemi.

1. **La regola ESLint su `loadEnv` non prende gli import relativi brevi** (`./env`, `../env`, `../global/env`), mentre `.eslintrc.cjs` e `AGENTS.md` dicono che prende tutti gli import statici (v4, MAJOR).
2. **Un controllo negativo della checklist non può dare il risultato scritto.** Scrivere con altre maiuscole l'email di un utente del DB dovrebbe dare "Access denied", ma NextAuth porta l'email in minuscolo prima del filtro: il link arriva (v8, contraddetto; anche v1).
3. **I controlli dopo il deploy non dicono cosa fare se falliscono** (v8, MAJOR).

**Decisione del proprietario arrivata durante il giro.** Lo staging va sul progetto Vercel separato `staging-mito-micro-services` (secret `VERCEL_STAGING_PROJECT_ID`), con deployment di Preview e Deployment Protection "All Deployments". Il workflow, il controllo del dominio e la checklist rivisti qui sono per lo stesso progetto della produzione: vanno riscritti, e v5, v6 e v8 vanno rifatti sul nuovo disegno.

### Coverage

- Pass rilanciati: 6 su 9, con le obiezioni del secondo giro da ricontrollare:
  - v1, v3, v4, v5 e v6: Opus (eredita);
  - v8: Sonnet.
- Non rilanciati: v2 (creazione degli utenti invariata), v7 (Sentry invariato), v9 (i quattro gate li rilancia chi orchestra).
- Evidenze di chi orchestra:
  - gate su ogni branch: lint, `tsc`, test (171, 180, 187) e build con i segnaposto, tutti verdi;
  - nei file env locali, solo vero o falso: in sviluppo e in produzione DB e storage stanno in un solo progetto per ambiente, e i due progetti sono diversi; `.env` non ha chiavi del DB, `.env.production.local` le ha tutte e due;
  - l'ultimo deploy di prod ha usato la CLI 61.0.0;
  - `vercel project ls`: c'è il progetto `staging-mito-micro-services`, creato il 2026-10-09 alle 16:42, Node 24.x, con una sola deployment di Production, annullata;
  - docs di Vercel (2026): le variabili Development servono solo a `vercel dev` e `vercel env pull`, non alle deployment; "All Deployments" con Vercel Authentication c'è su tutti i piani.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v4 — credenziali locali; anche v8 (MINOR) | `.eslintrc.cjs:55`, `AGENTS.md:26` | `group: ["**/lib/global/env", "**/lib/global/env.*"]` prende solo i percorsi che contengono `lib/global/env`. Con la configurazione dell'head, `import { loadEnv } from "./env"` in `src/lib/global`, `"../env"` e `"../global/env"` danno 0 problemi. Il commento e `AGENTS.md` promettono di più. | `group: ["**/env", "**/env.*"]` con `importNames: ["loadEnv"]`, provato: prende le quattro forme e lascia stare `import { env } from "@/env"`. | no |
| MAJOR | v8 — checklist (CONTRADICTED); anche v1 (MINOR) | `brain/chore/staging-vercel.md:86` | "Un utente del DB scritto con altre maiuscole … Access denied": NextAuth 4.24.7 porta in minuscolo l'email digitata (`core/routes/signin.js`), quindi `Mario.Rossi@…` per un utente salvato come `mario.rossi@…` è "exact" e il link arriva. Il controllo non prova la regola che deve provare. | Un utente di prova nel DB di sviluppo salvato con le maiuscole (`Mario.Rossi@…`), login con l'indirizzo in minuscolo: "Access denied" e nessun utente nuovo; poi si cancella la riga. | no |
| MAJOR | v8 — checklist | `staging-vercel.md:79-92`, `:107-110` | I controlli dopo il deploy, quasi tutti, non dicono cosa fare se falliscono, né dove guardare (per esempio come vedere che il dominio punta alla deployment). | Una frase "se fallisce" per controllo. | no |
| MINOR | v3, v8 | `staging-vercel.md:95-103`, `:111` | La base usava `PREVIEW_DB ?? SUPABASE_DB_CONNECTION_STRING`. Se Production ha ancora `PREVIEW_DB`, il primo deploy del codice nuovo cambia il DB di prod senza avvisare. `CUSTOM_ACCESS` aggiungeva Discord ed email in prod. La ragione scritta a `:111` vale solo per `SENDGRID_*`, `DISCORD_*` e `NEXT_PUBLIC_BASE_URL`. | Prima del merge su `main`: in Production non ci sono `PREVIEW_DB`, `PREVIEW_DB_PSW` né `CUSTOM_ACCESS`, altrimenti fermarsi e decidere. Correggere la ragione. | no |
| MINOR | v4 | `.env.example:4-9` | Dice che `db:generate` e `db:studio` non leggono file, e che gli script di sviluppo leggono `.env.development.local`. drizzle-kit 0.24.2 carica prima `.env`, che vince. | Una riga: drizzle-kit carica prima `.env` e vince su questo file, quindi mai le chiavi del DB in `.env`. | no |
| MINOR | v6 | workflow, `staging-vercel.md` | "Main arriva in prod solo dal suo workflow" resta una convenzione: `main` e `dev` senza protezione, `VERCEL_TOKEN` del repository e valido per tutto il team, `vercel build --token` che esegue il codice di `dev`. Il workflow di prod non ricontrolla il dominio dello staging. | Branch protection o ruleset su `main` e `dev`. Scrivere il rischio residuo nella checklist. Il secondo punto decade con il progetto separato. | no |
| MINOR | v8 | `staging-vercel.md` | Diversi dettagli di Vercel sono vecchi o non verificati: Ignored Build Step sta in Build and Deployment; "Enable access to System Environment Variables"; Sensitive ora si chiama Secret; il ruolo minimo (Viewer) e il piano del team; le richieste di accesso come alternativa all'aggiunta al team. Poi: il controllo Azure dopo il deploy di prod può creare un ADMIN nel DB di prod; manca il controllo SSR in prod; nessun controllo che lo staging usi davvero DB e storage di sviluppo; Sentry senza un modo per provocare un errore (`/api/sentry-example-api`). | Riscrivere con il nuovo progetto di staging. | no |
| MINOR | v1 | `staging-vercel.md:32`, `:84` | Il login Azure di un utente del DB arriva in fondo solo se il suo account `azure-ad` è già collegato; altrimenti `OAuthAccountNotLinked` (si chiude in sicurezza). | Scriverlo nella checklist. | no |
| MINOR | v4, v8, v3 | `next.config.js`, docs | Anche `next lint` si ferma finché c'è `.env.production.local`, ma i documenti nominano solo build, start e dev. | Aggiungere `next lint`. | no |
| NIT | v1, v3, v4, v5, v6, v8 | vari | v5: spazi e `\n` passano come presenza per `SUPABASE_MITO_PSW` e `SUPABASE_KEY`; il ref va cercato in minuscolo e in posizione di host o di utente; i ref vanno controllati su una riga sola. v6: `jq` senza `-e` passa su JSON con un prefisso valido; messaggi; nessun `timeout-minutes`. v4: commento di `env.ts` senza la condizione; `.env.production` non ignorato; `existsSync` relativo alla cartella corrente; i `grep` non vedono la forma `KEY: value`. v3: in una build locale senza `VERCEL_ENV`, server e client possono non concordare (`VERCEL_ENV=production next start` a mano); messaggio "not set" anche per un valore sbagliato. v1: il test sui caratteri jolly non prende un `LIKE`. v8: verbi e percorsi della checklist. | Vedi il verificatore. | no |

### Esito delle finding del secondo giro

| Finding del secondo giro | Esito |
|--------------------------|-------|
| BLOCKER v5: con le variabili Sensitive il controllo dei dati passa | **Chiuso.** Si confrontano i progetti Supabase; un `[SENSITIVE]` sul valore che serve ferma il deploy. 48 casi su due shell, sul formato vero della CLI 61.0.0. |
| BLOCKER v6: nessuno controlla il branch del dominio dello staging | **Chiuso** sul disegno a un progetto (26 casi contro il contratto dell'API). **Superato** dal progetto separato. |
| BLOCKER v4: il `.env` locale ha i valori di prod | **Chiuso come decisione del proprietario:** `.env` resta il ripiego con i valori di prod. I testi ora sono veri, e `loadEnv` richiede le due chiavi in `.env.prod.local`. |
| MAJOR v5: il lato di prod si apriva da solo | **Chiuso.** Senza il progetto di prod leggibile il deploy si ferma. |
| MAJOR v8: cancellazioni in Production prima del merge su `dev` | **Chiuso.** Spostate dopo il primo deploy di prod. Correggere la ragione (MINOR sopra). |
| MAJOR v8: nessun controllo negativo | **Parziale.** Quello con Azure è giusto, quello con le maiuscole è contraddetto (MAJOR sopra). |
| MAJOR v4: la rinomina di `.env.production.local` in nessun passo | **Chiuso.** Passo "In locale", e `next.config.js` ferma build, start, dev e lint. |
| MINOR: precedenza di `NEXT_PUBLIC_VERCEL_ENV`, `SKIP_ENV_VALIDATION`, `SUPABASE_MITO_PSW` in Production, CLI non fissata, Preview senza override di `dev`, pooler e host diretto, test con le maiuscole, `lower()` in SQL | **Chiusi.** |
| MINOR: ESLint aggirabile | **Parziale.** Prende alias, `src/` e i relativi da fuori `src/lib`; non quelli brevi (MAJOR sopra). |
| MINOR: "solo dal suo workflow" è una convenzione | **Aperto** (MINOR sopra). |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — login | Prova di principio a principio con l'`AuthHandler` vero di NextAuth e PGlite, per Azure e per il link via email, alla richiesta e alla callback: nessun accesso fuori da "email esatta nel DB" o "indirizzo ammesso senza riga in altre maiuscole". In prod solo Azure, senza filtro e senza query. Un errore del DB dà un messaggio generico. 187 test. |
| v3 — segnale di produzione | Build vere di prod e di preview con valori finti: `isProduction` è la stessa costante in client, server, edge, instrumentation e `next.config.js`. 16 prove della configurazione e 15 dello schema. Le due guardie dei workflow, eseguite su file finti, si fermano con `SKIP_ENV_VALIDATION`. |
| v4 — credenziali locali | `loadEnv` si ferma senza file, senza una delle due chiavi o con una chiave vuota, anche se la shell le dà, e con `.env.production.local` presente. Build, start, dev e lint si fermano con il file vecchio. Next.js non carica mai `.env.prod.local`, e nel bundle non c'è `dotenv`. |
| v5 — dati dello staging | Letto lo scrittore dei file della CLI 61.0.0; 48 casi su bash 3.2 e 5.2: ogni modo realistico di arrivare al DB o allo storage di prod ferma il deploy. Nessun valore stampato; i file si cancellano sempre. |
| v6 — pipeline | Il contratto dell'API dei domini, dall'OpenAPI di Vercel e dal sorgente della CLI. `vercel build` mette sempre `VERCEL=1` e mai `VERCEL_ENV`, quindi la guardia vale. Il deploy `--prebuilt` rifiuta un target diverso. `vercel.json` è valido. |
| v8 — checklist | Nomi e ambienti delle variabili corrispondono a `src/env.js`. L'ordine tiene il primo push su `dev` lontano dai dati e dai domini di prod. I passi dei cron e la rinomina locale ci sono. |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Login fuori produzione | SHIP | Nessun accesso fuori regola. MINOR sul controllo negativo sbagliato della checklist. |
| v2 | Creazione degli utenti | — | Non rilanciato (SHIP al secondo giro). |
| v3 | Segnale di produzione | SHIP | Tutte e cinque le obiezioni chiuse. MINOR su `PREVIEW_DB` in Production. |
| v4 | Credenziali locali | DO NOT SHIP | La regola ESLint non prende gli import relativi brevi, contro quanto dicono i documenti. |
| v5 | Dati dello staging | SHIP | Il BLOCKER è chiuso. Da rifare sul progetto separato. |
| v6 | Pipeline | SHIP | Il BLOCKER è chiuso sul disegno a un progetto. Da rifare sul progetto separato. |
| v7 | Sentry | — | Non rilanciato (SHIP al secondo giro). |
| v8 | Checklist | DO NOT SHIP | Un controllo negativo contraddetto dal codice, e i controlli senza rimedio. |
| v9 | Convenzioni e gate | — | Gate rilanciati da chi orchestra: verdi. |

### Human Review Checklist

Ognuno dei passi dice cosa va verificato e com'è il risultato giusto. Le variabili si guardano solo per nome, mai i valori.

1. **Correggere le tre MAJOR** e riscrivere workflow e checklist per il progetto `staging-mito-micro-services`, poi rifare v4, v5, v6 e v8.
2. **Progetto di staging su Vercel:**
   - le variabili da Development vanno anche in Preview;
   - Deployment Protection su "All Deployments" con Vercel Authentication;
   - Node.js 22.x, come `engines.node`;
   - Git scollegato, o nessun build dai push;
   - il dominio `staging-crm.dbmito.it` nel progetto di staging.
3. **Production, solo nomi, prima del merge su `main`:** ci sono le variabili richieste da `src/env.js`, e non ci sono `PREVIEW_DB`, `PREVIEW_DB_PSW`, `CUSTOM_ACCESS`, `SKIP_ENV_VALIDATION` né `NEXT_PUBLIC_VERCEL_ENV`.
4. **In locale, subito dopo aver preso `chore/env-prod-locale`:** rinominare `.env.production.local` in `.env.prod.local`. Fino ad allora `next dev`, `next build`, `next start` e `next lint` si fermano.
5. **Branch protection** su `main` e `dev`, o accettare per scritto il rischio di un token del team usato da qualunque branch.
6. **Merge su `dev` solo dopo G2**: il merge fa subito il deploy dello staging.
7. **Mai uno script con `NODE_ENV=production`** senza una persona, e mai `next build` o `next start` in locale con i file env veri.

### Notes for docs-maintenance

- Finding durevoli da portare in `tech-debt/platform/`, se rinviate:
  - `linkAccount` separato da `createUser` in NextAuth (secondo giro, v2);
  - nessun indice unico su `lower(email)`;
  - gli errori del DB nel login non arrivano a Sentry (secondo giro, v9);
  - `getUserByEmail` dell'adapter fuori dal try di NextAuth.
- Domain pages that should backlink this review: n/a (standalone).

---

## Secondo giro (2026-10-09, base `df8fcaa`, head `602fa33`)

### Verdict

**DO NOT SHIP** · impact: critical

Il codice dell'app regge, e molte cose sono provate sul codice compilato o con NextAuth dal vivo:

- il filtro sul login e la creazione atomica di utente e operatore;
- il segnale di produzione, uguale in tutti i bundle;
- la guardia su `VERCEL_ENV`;
- Sentry spento fuori dalla produzione, compreso il ripiego dell'edge su `SENTRY_DSN`;
- `loadEnv`, che si ferma senza il file.

Le barriere attorno allo staging però si aprono in tre casi realistici.

1. **Il controllo sui dati dello staging non scatta con le variabili Sensitive.** Se `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW` o `SUPABASE_KEY` sono di tipo Sensitive in Preview, la CLI di Vercel scrive `NAME="[SENSITIVE]"`. Il controllo lo prende per un valore diverso da quello di prod e passa. Vale anche con i valori di prod (simulato). Lo stesso succede dal lato Production il giorno in cui quelle variabili diventano Sensitive.
2. **Il dominio dello staging non è controllato.** Il workflow fa `vercel alias set` su `staging-crm.dbmito.it` senza verificare che il dominio sia assegnato al branch `dev`. Un dominio senza branch è un dominio di produzione: è fuori dalla Deployment Protection e, al deploy successivo di `main`, passa alla produzione. Tutto questo con i workflow verdi. In più l'integrazione Git del progetto sembra scollegata, e senza quella forse il dominio non si può assegnare a `dev`.
3. **"Un build locale non arriva in produzione" è falso nel checkout di lavoro.**
   - **`.env`.** Contiene URL e chiave dello storage Supabase di **produzione**, e `NEXTAUTH_SECRET` e il secret Azure uguali a quelli di prod. Next lo carica a ogni `next build`/`next start`.
   - **`.env.production.local`.** C'è ancora, e nessun passo della checklist dice di rinominarlo.

### Coverage

- Rubric passes run: 9/9
  - v1–v6: Opus (eredita il modello della sessione)
  - v7, v8: Sonnet
  - v9: Haiku
- Passes skipped or failed: nessuno. Un primo lancio del classificatore si è fermato per un errore di rete ed è stato rilanciato.
- Note sul metodo:
  - **Confronto dei file env (v4).** v4 ha letto i file env del checkout principale solo per nome. Per alcuni valori ha controllato se erano uguali, stampando solo "uguale" o "diverso".
  - **CLI e prove.** v5 e v6 hanno letto il sorgente della CLI di Vercel (41.6.2, 61.0.0, 63.1.0) senza eseguirla. v3 e v7 hanno fatto build di prova con valori finti.
  - **Vercel non contattato.** Nessun verificatore ha chiamato Vercel.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v5 — dati dello staging; anche v6, v8 (MINOR) | `.github/workflows/deploy-staging.yaml:44-64` | La CLI 61+ scrive le variabili Sensitive che non può leggere come `NAME="[SENSITIVE]"`. La riga 52 le conta come impostate e la riga 58 le confronta con quelle di prod: sono sempre diverse. Caso simulato c07: DB e password in Preview come Sensitive, con i valori di prod, e uscita 0. Il build riceve il segnaposto, che supera `z.string()`; le funzioni a runtime leggono i valori veri. Riguarda le tre variabili non pubbliche; le `NEXT_PUBLIC_*` non possono essere Sensitive. Anche il lato Production non scatta: una riga mancante, `""` o `[SENSITIVE]` lascia passare qualunque Preview (c08, c11). E il confronto fra stringhe esatte non vede lo stesso progetto scritto in un altro modo, per esempio pooler e host diretto, o una `/` finale (c10). | Confrontare l'identificativo del progetto Supabase, che non è segreto. Si ricava dall'host di `NEXT_PUBLIC_SUPABASE_URL` in Preview e in Production, e va cercato nella stringa di connessione di Preview: deve esserci quello di Preview e non quello di prod. Fermarsi su `[SENSITIVE]`, su `""` e su una riga di prod mancante. Nella checklist: la stringa di connessione in Preview non va creata Sensitive. Ripetere il controllo anche sulla Preview senza `--git-branch`. | no |
| BLOCKER | v6 — rilascio | `.github/workflows/deploy-staging.yaml:7,73` | Nessuno controlla che `staging-crm.dbmito.it` sia un dominio del progetto assegnato al branch `dev`. `vercel alias set` (CLI 41.6.2) non guarda né i domini del progetto né `gitBranch`. Per Vercel, un dominio senza branch "viene applicato ai deploy di produzione", e la Standard Protection esclude i domini di produzione. Con il dominio aggiunto senza branch, lo staging andrebbe in rete senza protezione e il deploy successivo di `main` si prenderebbe `staging-crm.dbmito.it`, a workflow verdi. In più l'integrazione Git sembra scollegata: l'ultimo deploy di `vercel[bot]` è del 2026-06-13. Senza integrazione, assegnare il dominio a `dev` potrebbe non essere possibile. | Un controllo prima del build e dopo l'alias, che fallisce se la condizione non regge: `curl -fsS -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID/domains/$STAGING_DOMAIN?teamId=$VERCEL_ORG_ID"` con `gitBranch` uguale a `dev`. Verificare su Vercel se il repo è collegato e se il dominio si può assegnare a `dev`. | no |
| BLOCKER | v4 — credenziali in locale (CONTRADICTED); anche v3 (fuori dal mandato) | `AGENTS.md:26`, `src/lib/global/env.ts:7-9`, `.env.example:15-16` | La frase "a local `next build` or `next start` doesn't reach production" è falsa nel checkout principale. `.env` contiene `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_KEY` del progetto Supabase di **produzione**: l'identificativo è quello della stringa di connessione di prod ed è diverso da quello di sviluppo. Contiene anche `NEXTAUTH_SECRET` e `AZURE_AD_CLIENT_SECRET` uguali a quelli di prod. In modalità production Next carica `.env` e non `.env.development.local`. Così `next build && next start` seguito da `pnpm delete:export:dev`, script permesso da `AGENTS.md`, cancellerebbe `mito-storage/export/*` in produzione, e gli export andrebbero sullo storage di prod. Attenuante: dopo la rinomina, il build richiede `SUPABASE_DB_CONNECTION_STRING` oppure `SKIP_ENV_VALIDATION`. | Un passo locale nella checklist: togliere da `.env` i valori di produzione, spostandoli in `.env.prod.local` o cancellandoli, e lasciare in `.env` solo i valori di sviluppo e quelli degli script cron. Riscrivere la frase: `.env`, `.env.local` e `.env.production` non devono contenere valori di prod, perché Next li carica a ogni build. | no |
| MAJOR | v8 — checklist | `brain/chore/staging-vercel.md:51,111` | Il passo 4 fa cancellare da Production `SENDGRID_*`, `DISCORD_*`, `NEXT_PUBLIC_BASE_URL` e `CUSTOM_ACCESS` **prima** del merge su `dev`. Il codice oggi su `main` le richiede: con quei nomi assenti, il suo `src/env.js` dà "Invalid environment variables" (riprodotto). Il prossimo deploy di prod o un hotfix fallirebbero finché il codice nuovo non arriva su `main`. | Spostare il passo dopo il primo deploy di prod del codice nuovo. Dire che "non servono più" vale da lì in poi. | no |
| MAJOR | v8 — checklist | `staging-vercel.md:72-79` | I controlli dopo il primo push sono solo positivi. Nessuno verifica che il filtro respinga qualcuno, e il filtro è proprio ciò che impedisce agli account del tenant di diventare ADMIN sul DB di sviluppo. | Un account del tenant che non è nel DB né nella lista viene respinto, e non compare nessuna riga utente. Un utente salvato con altre maiuscole viene respinto. | no |
| MAJOR | v4 — credenziali in locale | `staging-vercel.md`, nessun passo | La rinomina `.env.production.local` → `.env.prod.local` è scritta solo nel messaggio di commit. Il checkout principale ha ancora quel file, con le credenziali del DB di prod, e ogni `next build` locale lo carica. Il primo a scoprirlo potrebbe essere `db:migrate:prod`, nel mezzo di una sessione di produzione. | Un passo esplicito, dopo il merge di `chore/env-prod-locale` (G2 usa ancora il nome vecchio). Facoltativo: `next.config.js` si ferma se `!process.env.VERCEL` ed esiste `.env.production.local`. | no |
| MINOR | v3 — segnale | `next.config.js:13-32`, `src/env.js:10-12` | La configurazione legge `NEXT_PUBLIC_VERCEL_ENV ?? VERCEL_ENV`, i bundle ricevono `VERCEL_ENV`. Se in un ambiente Vercel c'è una variabile `NEXT_PUBLIC_VERCEL_ENV` diversa, configurazione e bundle non sono d'accordo (provato in entrambi i sensi). | La guardia si ferma anche quando `NEXT_PUBLIC_VERCEL_ENV` è impostata e diversa da `VERCEL_ENV`. | no |
| MINOR | v3 — segnale; anche v6 (NIT) | runtime | Il valore compilato vince sempre su quello di runtime. Promuovere una deployment dello staging a produzione dalla dashboard darebbe una prod con `isProduction=false`: il login si chiude, Sentry tace e lo storage è quello di sviluppo. Nessuno se ne accorge. | Un controllo in `src/instrumentation.ts`. Scrivere "mai promuovere lo staging" nella checklist. | no |
| MINOR | v3 — segnale | `deploy-production.yaml`, `src/server/auth.ts:28-41` | `SKIP_ENV_VALIDATION` in Production lascerebbe passare un build senza Azure, e l'app partirebbe senza nessun provider. | Fermare il workflow se la variabile è nel file scaricato, oppure lanciare un errore in `auth.ts` in produzione senza Azure. | no |
| MINOR | v3 — segnale; anche v8 | Vercel Production | `SUPABASE_MITO_PSW` ora è obbligatoria ovunque. Se manca in Production, il deploy di prod fallisce (il sistema si chiude, ma è un rischio per G2). Production non è mai stata controllata. | Controllo per nome in Production: `SUPABASE_MITO_PSW`, `AZURE_AD_*` (3), `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXTAUTH_SECRET` presenti; `NEXT_PUBLIC_VERCEL_ENV` e `SKIP_ENV_VALIDATION` assenti. | no |
| MINOR | v5, v6 — rilascio | entrambi i workflow | La CLI non ha versione fissa (`pnpm add --global vercel`), mentre i controlli dipendono dal formato dei file che scrive, già cambiato fra 41.6.2 e 61. | Fissare la versione in entrambi i workflow. | no |
| MINOR | v5, v6 — rilascio | `deploy-staging.yaml:70` | A runtime le variabili sono quelle che Vercel collega alla deployment. Gli override di `dev` valgono solo se Vercel la attribuisce a `dev`, ma il controllo guarda solo la vista `--git-branch=dev`. | Controllare anche la Preview senza branch. Dopo il primo deploy, verificare che la deployment risulti del branch `dev`. Con il repo collegato, passare `--meta githubCommitRef=dev`. | no |
| MINOR | v6 — rilascio | branch e token | `main` e `dev` non sono protetti. `VERCEL_TOKEN` è un segreto del repository e `vercel build --token=…` esegue il codice di `dev`, che lo vede negli argomenti. `vercel.json` vale commit per commit: se il repo viene ricollegato, i branch senza quel file fanno il build da Git. | Proteggere i branch e mettere il token in un environment. Togliere `--token` dal build. Su Vercel impostare l'Ignored Build Step a "Don't build anything". | sì, se rinviato |
| MINOR | v4, v9; anche v8 (NIT) | `.eslintrc.cjs` | La regola ESLint guarda solo `@/lib/global/env`. Non vede l'import relativo, quello da `src/lib/global/env`, l'import dinamico né una chiamata diretta a `dotenv`. L'eccezione su `src/lib/global/**` è più larga del necessario. | `patterns` con `group: ["**/lib/global/env", "src/lib/global/env"]` (verificato su ESLint 8.57). Restringere l'eccezione a `_test/**`. | no |
| MINOR | v4 — credenziali in locale | `src/lib/global/env.ts:26-29` | `loadEnv` si ferma se non legge il file, ma non controlla che dentro ci siano le chiavi del DB. Con un file vuoto vince la shell. | Fermarsi se mancano `SUPABASE_DB_CONNECTION_STRING` o `SUPABASE_MITO_PSW`. | no |
| MINOR | v8 — checklist | `staging-vercel.md:37,64-70,78-84,102` | Sei correzioni: (1) l'opzione è in Settings → Environment Variables, "Enable access to System Environment Variables"; (2) il segreto di bypass non lo conosce solo GitHub: è una variabile di sistema in ogni deployment; (3) i controlli dopo il deploy di prod sono pochi (`staging-crm` ancora su Preview, Azure su `crm.dbmito.it`, variabili richieste); (4) "Sentry non riceve niente" non dice come verificarlo (`GET /monitoring` dà 404); (5) il controllo SSR è vago (`src/trpc/shared.ts:10`, `dashboard/profile/layout.tsx:23`); (6) per l'accesso al team non è indicato un ruolo. | Correggere il testo. | no |
| MINOR | v7 — Sentry | `next.config.js:86-100` | Nessun test copre le opzioni Sentry del build: rimetterle tutte ai valori di prod lascia verdi i 160 test. Il ripiego dell'edge è provato solo con l'SDK simulato. | Un test che importa `next.config.js` con `withSentryConfig` simulato. Un test sull'SDK edge vero, con trasporto finto. | no |
| MINOR | v1 — login | `src/server/_test/auth.db.test.ts:75-82` | Nessun test copre un utente collegato con l'email salvata con maiuscole, che deve entrare. | Una riga `Mario.Rossi@x.it` e `signIn("Mario.Rossi@x.it")` → `true`. | no |
| MINOR | v9 — convenzioni | `src/server/auth.ts:82-93, 128-137` | Quattro cose: (1) `runAuth` registra l'errore nei log ma non lo manda a Sentry con `ErrorReporter`; (2) due primi accessi contemporanei con lo stesso indirizzo possono creare due ADMIN, perché l'email non ha un indice unico; (3) in produzione non c'è il controllo sulle maiuscole, quindi un accesso Azure con l'email salvata con altre maiuscole crea un secondo ADMIN (già presente); (4) `createUser`, `linkAccount` e `createSession` sono istruzioni separate di NextAuth (v2, già presente). | `ErrorReporter` in `runAuth`. Indice unico su `lower(email)` come follow-up. Una query in sola lettura in prod per i duplicati. | sì, se rinviato |
| NIT | v1, v3, v6, v7, v8 | vari | `lower()` di SQL contro `toLowerCase()` di JS sui caratteri non ASCII. Il commento di `next.config.js:29-31` è impreciso. L'ambiente Sentry è fisso. Sette correzioni a `staging-vercel.md` (sorgente di Azure, passo 7 senza azione, primo cron su `dev`) e a `.env.example` (`db:studio:dev`; "The workflows set both"). `deploy-staging.yaml` non ha `timeout-minutes` e l'URL va validato. `.env.production` non è nel `.gitignore`. | Facoltativi. | no |

_"Durable?" = yes quando la finding non si corregge prima del ship e va portata in `tech-debt/` all'ingest._

### Esito delle finding del primo giro

| Finding del primo giro | Esito |
|------------------------|-------|
| BLOCKER: senza `VERCEL_ENV` la prod viene costruita come staging | **Chiuso.** `next.config.js` si ferma con `VERCEL` impostato e senza `VERCEL_ENV`, e i due workflow cercano `VERCEL_ENV="production"` o `"preview"` nel file scaricato (v3, v6, v7). Restano MINOR su `NEXT_PUBLIC_VERCEL_ENV` e sulla promozione dalla dashboard. |
| BLOCKER: DB dello staging affidato a Preview senza un passo obbligatorio | **Parziale.** La checklist è ora un passo prima del merge, e il workflow confronta Preview con Production, ma il confronto non scatta con le variabili Sensitive (BLOCKER sopra). |
| MAJOR: ambiente Sentry rinominato in `vercel-production` | **Chiuso.** `environment: "production"`, verificato sui bundle compilati (v7). |
| MAJOR: le maiuscole creano un secondo ADMIN | **Chiuso** fuori dalla produzione, provato con NextAuth dal vivo (v1). Restano la corsa fra due accessi e il caso in produzione (v9). |
| MAJOR: `loadEnv` non si ferma senza file | **Chiuso** (v4). Resta il controllo sulle chiavi presenti. |
| MAJOR: transazione non testata | **Chiuso.** Il test fallisce senza la transazione (v2, v9). |
| MAJOR: gli `info@` e Vercel Authentication | **Chiuso** nel documento. Resta il ruolo da dare a chi entra nel team (v8). |
| MAJOR: `NEXT_PUBLIC_SUPABASE_ANON_KEY` fuori dalla checklist | **Chiuso**: in `.env.example`, nella checklist e nel controllo del workflow. |
| MINOR: ripiego su `SENTRY_DSN`, `tunnelRoute`, test delle configurazioni Sentry | **Chiusi.** `enabled: false` ferma l'SDK edge vero (v7). Resta il test delle opzioni del build. |
| MINOR: due fonti per "produzione" | **Chiuso** per il caso normale: un solo `isProduction`. Resta il caso di un `NEXT_PUBLIC_VERCEL_ENV` impostato a mano (v3). |
| MINOR: `runAuth` senza log, campi dello spread, cattura dell'URL nel deploy, `.env.example`, ESLint | **Chiusi**, con le nuove MINOR su `ErrorReporter` e sui modi di aggirare ESLint. |
| MINOR: deploy dello staging senza test, branch vecchi, dominio senza branch | **Aperto.** Il dominio senza branch ora è un BLOCKER (v6). |
| Già presente: ogni nuovo account è ADMIN; fetch SSR su `VERCEL_URL` | **Aperti**, decisione del responsabile e verifica al primo deploy. |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — login | In produzione solo Azure, senza filtro. Fuori dalla produzione entrano solo la corrispondenza esatta col DB e la lista senza varianti di maiuscole. Prova completa con `AuthHandler` e PGlite: con un'altra maiuscola, `AccessDenied` e nessun token; con l'email esatta scritta con spazi e maiuscole, si entra come lo stesso utente; con un indirizzo della lista, un utente e un operatore. Alla callback il controllo si ripete. Un errore del DB dà "Sign-in failed", senza il messaggio del driver. 160 test. |
| v2 — creazione utente | Atomico, provato con un trigger vero. Scrive solo `id`, `name`, `email` ed `emailVerified`, con `image` nullo: un `role` passato in input viene ignorato. `signIn` gira prima di `createUser`. Nessun altro punto crea utenti. Il percorso senza autenticazione non c'è più. |
| v3 — segnale | Lo stesso valore compilato in client, server, edge e instrumentation. Falso in locale, su preview e in development. Il build di prod si ferma per ogni variabile obbligatoria mancante. La CLI rifiuta un output costruito per un altro target. |
| v4 — credenziali in locale | `loadEnv`: senza file, con `.env.production.local` presente o con una directory al suo posto si ferma. Vince sulla shell. `drizzle-kit` esce con 1 su entrambe le guardie. Nessun modulo dell'app importa `@/lib/global/env`. Next non carica mai `.env.prod.local`. |
| v5 — dati dello staging | Con variabili normali il controllo funziona: blocca quelle mancanti o uguali, compresi i valori con caratteri speciali. I due comandi di pull scrivono nello stesso formato. Gli override di `dev` arrivano nel file del build. In 15 casi nessun valore compare nei log. Il file di prod viene cancellato in ogni ramo. |
| v6 — rilascio | La guardia su `VERCEL_ENV` scatta (`VERCEL=1` la attiva sempre). I controlli con `grep` si chiudono in caso di errore. Trigger, concurrency e permessi vanno bene. Il deploy dello staging è senza `--prod` e la cattura dell'URL è corretta. `vercel.json` è valido. |
| v7 — Sentry | Nel build di preview vero, i tre runtime hanno `dsn` indefinito ed `enabled` falso. Con l'SDK edge vero: 3 invii senza `enabled`, 0 invii con. Il build di prod tiene `production`, `/monitoring`, le source map e la release. Le opzioni valgono per 8.20.0. |
| v8 — checklist | I nomi coincidono con il codice. Il set di Preview fa il build con `env.js`. Seguendo la checklist alla lettera, il primo push non arriva ai dati né al dominio di prod. Nessun segreto nei documenti. |
| v9 — convenzioni | Gate verdi: lint, `tsc`, 160 test, build. Drizzle passa da `query` e `transaction`, gli errori sono tipizzati e mappati in un punto solo, Effect gira solo al confine con NextAuth. I test passano dalle interfacce pubbliche e nessun test esistente è cambiato. |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Filtro sul login | SHIP | Regge su tutti i percorsi di NextAuth. MINOR su un test mancante. |
| v2 | Creazione utente | SHIP | Atomico e senza altri punti che creano utenti. |
| v3 | Segnale di produzione | SHIP | Un solo valore compilato. MINOR su variabili impostate a mano e sulla promozione. |
| v4 | Credenziali in locale | DO NOT SHIP | Il `.env` locale contiene lo storage di prod, e la rinomina non è in nessun passo. |
| v5 | Dati dello staging in CI | DO NOT SHIP | Il controllo passa con le variabili Sensitive. |
| v6 | Rilascio | DO NOT SHIP | Il dominio dello staging non è verificato e potrebbe diventare di produzione. |
| v7 | Sentry | SHIP | Spento davvero fuori dalla prod. MINOR sui test del build. |
| v8 | Checklist | DO NOT SHIP | Il passo 4 rompe il prossimo deploy di prod, e manca un controllo negativo sul login. |
| v9 | Convenzioni e gate | SHIP | Gate verdi e regole Effect rispettate. |

### Human Review Checklist

Ognuno dei passi dice cosa va verificato e com'è il risultato giusto. Le variabili si guardano solo per nome, mai i valori.

1. **Correggere i tre BLOCKER e le tre MAJOR**, poi rifare v4, v5, v6 e v8:
   - il confronto sui dati con l'identificativo del progetto, che si ferma su `[SENSITIVE]` o su una riga vuota;
   - il controllo del dominio con l'API di Vercel;
   - le frasi su `.env`;
   - il passo 4 spostato;
   - il controllo negativo sul login;
   - il passo di rinomina.
2. **Nel tuo checkout locale, adesso:** togliere da `.env` URL e chiave dello storage di prod, `NEXTAUTH_SECRET` e il secret Azure di prod, e lasciare solo valori di sviluppo e quelli degli script cron. Fino ad allora:
   - non lanciare `next build`/`next start` in locale;
   - non lanciare gli script `:dev` contro un server locale costruito in modalità production.
3. **Vercel → progetto → Settings → Git:**
   - verificare se il repo GitHub è collegato;
   - verificare se `staging-crm.dbmito.it` si può assegnare al branch `dev`.

   Se non si può, va scelta un'altra strada prima del merge, per esempio un progetto Vercel separato per lo staging.
4. **Vercel → Environment Variables → Production**, solo per nome:
   - devono esserci `SUPABASE_MITO_PSW`, `AZURE_AD_*` (3), `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN` e `NEXTAUTH_SECRET`;
   - non devono esserci `NEXT_PUBLIC_VERCEL_ENV` e `SKIP_ENV_VALIDATION`.

   Prima di G2: se manca `SUPABASE_MITO_PSW`, il deploy di prod del codice nuovo fallisce.
5. **Vercel → Environment Variables → Preview:** decidere il tipo delle variabili del DB in base alla correzione scelta. Con il confronto sull'identificativo del progetto, la stringa di connessione in Preview non va creata Sensitive.
6. **Utenti del DB di sviluppo:** controllare chi c'è in `mito-deutsche_user` (email e ruolo). Decidere il ruolo di default dei nuovi account, oggi ADMIN.
7. **Ordine dei merge.**
   - Dopo la sessione G2: `chore/accesso-fuori-prod` → `chore/staging-vercel` → `chore/env-prod-locale`, con i passi "Prima del merge su `dev`" della checklist già fatti.
   - Dopo l'ultimo merge, su ogni macchina: `mv .env.production.local .env.prod.local`.
8. **Dopo il primo push su `dev`:** i controlli positivi e negativi della checklist:
   - un account del tenant fuori lista viene respinto;
   - lo staging chiede il login Vercel;
   - `GET /monitoring` dà 404;
   - la deployment risulta del branch `dev`.
9. **Dopo il primo deploy di prod del codice nuovo:**
   - togliere da Production `SENDGRID_*`, `DISCORD_*`, `NEXT_PUBLIC_BASE_URL`, `CUSTOM_ACCESS` e `PREVIEW_DB*`;
   - verificare che `staging-crm.dbmito.it` sia ancora su Preview;
   - verificare che gli eventi Sentry arrivino con ambiente `production`.
10. **Mai promuovere a produzione una deployment dello staging** dalla dashboard di Vercel.
11. **Gate** da `AGENTS.md`:
    - `SKIP_ENV_VALIDATION=true pnpm exec next lint`
    - `pnpm exec tsc --noEmit`
    - `pnpm run test --run`
    - build con `SKIP_ENV_VALIDATION=true` e i segnaposto Supabase
    - nessuno script con `NODE_ENV=production` durante le verifiche.

### Notes for docs-maintenance

- Finding durevoli da portare in `tech-debt/platform/staging-accesso-sentry.md`, se rinviate:
  - branch non protetti e `VERCEL_TOKEN` a livello di repository;
  - Ignored Build Step;
  - indice unico su `lower(email)`;
  - duplicati di email in produzione;
  - `linkAccount` fuori dalla transazione;
  - errori del login non mandati a Sentry;
  - ruolo ADMIN di default;
  - fetch SSR su `VERCEL_URL`.
- Documenti da aggiornare all'ingest:
  - `brain/chore/migration/fase-2-backend-express.md` (`/api/operator/create`);
  - i documenti di migrazione già elencati nel primo giro;
  - `src/middleware/auth.ts:21`, un matcher morto.
- Domain pages that should backlink this review: n/a (standalone).

---

## Primo giro (2026-10-09, base `2aaf3a8`, head `e424fca`)

Verdetto: **DO NOT SHIP**, critical. 7 verificatori: 2 BLOCKER, 6 MAJOR. L'esito di ciascuna finding è nella tabella "Esito delle finding del primo giro"; il dettaglio originale segue.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v3 — segnale di produzione; anche v6 (BLOCKER) e v5 (MAJOR) | `next.config.js:17,71-79`, `src/env.js:6`, `src/server/auth.ts:24,55-68,118`, `src/lib/utils/sentry.ts:8-11`, `.github/workflows/deploy-production.yaml` | Login, filtro, credenziali obbligatorie e Sentry di produzione dipendono da `VERCEL_ENV` al momento del build, e nessuno lo controlla. `vercel build` imposta solo `VERCEL`; `VERCEL_ENV` arriva da `vercel pull` solo se il progetto espone le variabili di sistema. Se manca, `src/env.js` passa la validazione (provato) e la produzione si comporta come lo staging: link via email con le `SENDGRID_*` di Production (la base le chiedeva sempre, quindi probabilmente ci sono), operatori Azure nuovi bloccati, utenti del DB che entrano senza le regole del tenant (MFA, uscite), Sentry spento. Evidenza parziale contraria: il pull Preview del 2026-10-08 contiene `VERCEL_ENV`, quindi l'impostazione del progetto oggi è attiva. Resta che niente fallisce se un giorno si spegne. | `env: VERCEL_ENV: production` sullo step `vercel build --prod` di `deploy-production.yaml` (e `preview` su `deploy-staging.yaml`), oppure un controllo dopo il pull (`grep -qx 'VERCEL_ENV="production"' .vercel/.env.production.local`) o in `next.config.js`. Togliere `SENDGRID_*` da Production su Vercel e aggiungerle a "Variabili tolte". | no |
| BLOCKER | v4 — credenziali di prod; anche v6 (MAJOR) e v7 (BLOCKER) | `src/server/db/index.ts:5-8`, `.github/workflows/deploy-staging.yaml:7-10`, `brain/chore/staging-vercel.md:20-32` | Tolto il ripiego `PREVIEW_DB ?? …`, lo staging usa il DB e lo storage delle variabili Preview. Il merge su `dev` fa subito il deploy. I documenti del repo (`migration_plan.md:73`, `fase-1/t1-provisioning-postgres.md:16`) descrivono `PREVIEW_DB` come l'unico interruttore verso un DB diverso, e lo storage non è mai stato separato. Il passo che mette i valori di sviluppo è "da fare una volta", non è richiesto prima del merge e il controllo arriva dopo il primo push. Evidenza: al 2026-10-08 Preview non ha variabili dell'utente, quindi oggi il primo deploy fallirebbe la validazione, senza arrivare al DB di prod. Gli override del branch `dev` non sono verificati e nessun controllo impedisce valori sbagliati. | Rendere la configurazione Preview un passo obbligatorio prima del merge su `dev`. Verificare che `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_KEY` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`, compresi gli override di `dev`, siano del progetto di sviluppo e diversi da Production. Facoltativo: controllo sui soli nomi dopo il pull nel workflow. | no |
| MAJOR | v5 — Sentry; anche v3 | `sentry.{client,server,edge}.config.ts` | Togliendo `environment`, l'SDK usa il suo default `vercel-${VERCEL_ENV}`: gli eventi di produzione passano da `production` a `vercel-production` (verificato nei sorgenti, in una prova e nel chunk compilato). Le regole di alert, le ricerche salvate e le dashboard filtrate su `environment:production` smettono di trovare eventi senza avvisare, e lo storico delle issue si spezza. | Passare `environment: "production"` dall'helper comune nelle tre `init`, oppure verificare su Sentry che nessuna regola filtri per ambiente e accettare il cambio per iscritto. | no |
| MAJOR | v1 — login | `src/server/auth.ts:119-121`, `src/server/services/auth/users.ts:31-38` | Il filtro ammette l'email ignorando le maiuscole, ma `getUserByEmail` dell'adapter le distingue (`@auth/drizzle-adapter/lib/pg.js:62-67`) e il link via email mette tutto in minuscolo. Un utente salvato come `Mario.Rossi@x.it` passa il filtro, l'adapter non lo trova e `createUser` crea un secondo utente con ruolo ADMIN e un operatore (provato su PGlite). Su staging un OPERATORE diventa ADMIN. Il test `auth.db.test.ts:59-63` lo conta come successo. | `getUserByEmail` senza distinzione di maiuscole nell'adapter (solo fuori prod, se in prod deve restare uguale), oppure confronto esatto nel filtro. Test che passi dall'adapter. | no |
| MAJOR | v4 — credenziali di prod | `src/lib/global/env.ts:10-17` | `loadEnv` ignora l'errore di dotenv. Senza `.env.prod.local` non carica niente e non si ferma, ed è lo stato di ogni checkout subito dopo il merge, perché la rinomina è scritta solo nel messaggio di commit. `drizzle-kit` legge prima `dotenv/config`, quindi `db:push:prod` e `db:migrate:prod` usano in silenzio il DB di `.env` o della shell. `create:system-operator` va su `localhost:5432`. Intanto Next continua a leggere il vecchio `.env.production.local`. | Nel ramo production: fermarsi se `config()` dà errore e se esiste ancora `.env.production.local` ("rinominalo in `.env.prod.local`"). Mettere la rinomina nella checklist. | no |
| MAJOR | v2 — creazione utente | `src/server/_test/auth.db.test.ts:77-96` | Il test copre solo il caso riuscito. Togliendo il `transaction(...)` da `users.ts:14` il test passa ancora, ma un errore sull'operatore lascia un utente orfano (mutante provato). | Caso con `failNextInsertInto(operators)` da `@/test/failpoint`: `createUser` fallisce e `users`/`operators` restano vuoti. Asserire anche `image` ed `emailVerified` restituiti. | no |
| MAJOR | v7 — checklist | `brain/chore/staging-vercel.md:16,28,31` | Con Vercel Authentication entra nello staging solo chi è nel team Vercel. Gli indirizzi `info@`, che dovrebbero entrare col link via email, non arrivano nemmeno al login dell'app se non sono nel team. Il documento promette le due cose insieme. | Decidere come entrano gli `info@` (account nel team Vercel, o un'altra forma di accesso alla deployment protetta) e scriverlo; altrimenti togliere la promessa. | no |
| MAJOR | v7 — checklist | `src/lib/workers/export/service/saveExport.ts:6` | Il codice legge `NEXT_PUBLIC_SUPABASE_ANON_KEY` con ripiego `?? ""`, ma la variabile non è in `src/env.js`, `.env.example` o nella lista Preview. Un valore di prod ereditato resterebbe senza controllo. | Aggiungerla alla lista dello storage di sviluppo e a `.env.example`, oppure validarla in `env.js`. | no |
| MINOR | v7 — checklist; anche v5 | `brain/chore/staging-vercel.md:29`, `sentry.edge.config.ts` | La lista "da non impostare" non dice di cancellare i valori già presenti e non nomina `SENTRY_DSN`. v7 la dava MAJOR. v5 mostra che `SENTRY_DSN` lo legge solo l'SDK edge (`@sentry/vercel-edge` `sdk.js:33-35`), e la configurazione edge oggi non gira. `NEXTAUTH_URL` su Vercel viene ignorato (`detect-origin.js`). | Passo "cancellare se presenti" per `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `NEXTAUTH_URL`, `NODE_ENV`, `PREVIEW_DB*`. Nelle tre `init`: `enabled: sentryDsn !== undefined`. | no |
| MINOR | v5 — Sentry | `next.config.js:87` | `tunnelRoute: "/monitoring"` è attivo anche fuori dalla produzione: sullo staging e in locale fa da relay verso qualunque org o progetto Sentry. I dati dell'app non ci passano. | `tunnelRoute: isProduction ? "/monitoring" : undefined`. | no |
| MINOR | v5 — Sentry | `src/lib/utils/_test/sentry.test.ts` | Il test non carica le tre configurazioni né `next.config.js`: con `dsn: process.env.NEXT_PUBLIC_SENTRY_DSN` nel client resta verde. | Mock di `@sentry/nextjs`, importare le configurazioni con `preview` e `production` e asserire il `dsn` passato a `init`. | no |
| MINOR | v3 — segnale; anche v5 (NIT) | `src/env.js:6` e `src/server/auth.ts:24`, `src/lib/utils/sentry.ts:9` | Due fonti per "produzione": `VERCEL_ENV` letto a runtime (mai inlinato) e `NEXT_PUBLIC_VERCEL_ENV` inlinato al build. Divergono, per esempio, se si promuove una Preview a Production. | Calcolarlo una volta ed esportare un solo `isProduction`. | no |
| MINOR | v3 — schema env | `vitest.config.ts:12`, `src/server/_test/auth.test.ts:39-40` | `SKIP_ENV_VALIDATION` è attivo in tutti i test, quindi l'obbligatorietà condizionale non è mai provata. Il test di prod usa una combinazione di variabili impossibile in un build vero. | Test che importa `src/env.js` con la validazione attiva per produzione, preview e locale. | no |
| MINOR | v1 — login | `src/server/_test/auth*.test.ts` | Mancano i test per: errore del DB, lista vuota o malformata, email con caratteri jolly, link nel terminale solo con `next dev`, staging senza SendGrid. Il codice si comporta bene (provato), ma le regressioni passerebbero. | Aggiungere quei casi. | no |
| MINOR | v2 — creazione utente; anche v1 (NIT) | `src/server/auth.ts:78-82` | `runAuth` non registra né ripulisce gli errori. Sul percorso `signIn` un `DbError` non viene loggato e il messaggio del driver finisce nell'URL di redirect di NextAuth (solo fuori prod). | `Effect.tapErrorCause` con `logError` e un `Error` generico rilanciato. | no |
| MINOR | v2 — creazione utente | `src/server/services/auth/users.ts:19` | `{ ...user, … }` inserisce qualunque colonna di `users`, compresi `role` e `preferences`. Oggi non succede, perché i provider danno solo nome, email e immagine. | Elencare i campi a mano. | no |
| MINOR | v4 — credenziali di prod | `src/lib/global/_test/env.test.ts:13-23`, `AGENTS.md:26`, `.env.example:6-8` | Il test controlla solo la mappa dei nomi: non si accorgerebbe di un `loadEnv()` rimesso in un modulo di Next. Per `drizzle-kit`, `.env` e la shell vincono su `.env.prod.local` (precedenza già esistente), ma la documentazione ora dice il contrario. | Regola ESLint `no-restricted-imports` su `@/lib/global/env` con le eccezioni degli script; `override: true` o documentare la precedenza. | no |
| MINOR | v6 — rilascio | `.github/workflows/deploy-staging.yaml:40` | `echo "url=$(vercel deploy …)"` nasconde un deploy fallito: lo step esce con 0 (riprodotto) e l'errore compare solo all'alias. | `url="$(vercel deploy …)"` su una riga a sé, poi `echo`. | no |
| MINOR | v6 — rilascio | `.github/workflows/deploy-staging.yaml:7-10, 26-30` | Ogni push su `dev` va in deploy senza i test (`ci.yml` gira solo sulle PR). L'amend del commit dà alla deployment uno SHA che su GitHub non esiste e contiene un'email personale: aggira il controllo di Vercel sull'autore (questione di piano e termini). Lo schema è copiato dalla produzione. | Protezione del branch `dev` con i check obbligatori, oppure test prima del deploy. `--meta` con `github.sha`; verificare il piano Vercel. | sì, se rinviato |
| MINOR | v6 — rilascio | `vercel.json`, Vercel → Domains | I branch nati prima di questo cambio hanno ancora `{"dev": false}` e fanno deploy da Git finché non vengono ribasati. Un dominio di staging aggiunto in Project → Domains senza branch diventa un dominio di produzione: segue i deploy di `main` ed esce dalla Deployment Protection. | Ribasare o chiudere i branch vecchi. Assegnare il dominio di staging al branch `dev`. Verificare che `crm.dbmito.it` sia servito dalla deployment CLI. | no |
| MINOR | v7 — documenti | `.env.example:1-9, 20-39`; `brain/chore/staging-vercel.md:22,27`; `brain/chore/migration/attivita-manuali-provider.md:73` | Il file si contraddice: l'intestazione vuole gli stessi nomi in Production e Preview, i commenti dicono SendGrid mai in prod e `NEXTAUTH_URL` solo in locale. Mancano `TELEGRAM_*`. Gli script senza `NODE_ENV` leggono `.env.undefined.local`. Solo `db:*:prod` e `create:system-operator` leggono `.env.prod.local`: i cron usano `.env`. Per Azure il checklist dice "non da prod" e poi "la stessa app di prod". Il piano di migrazione prevede Preview → Railway. | Allineare i testi; segnare il piano di migrazione come superato per Preview. | no |
| MINOR | v7, v6 — documenti | `.env.example:25`, `brain/chore/staging-vercel.md:26,31`, `deploy-staging.yaml:5,28` | Caselle reali in un file che dice "mai valori reali". L'header di bypass per i cron dipende dal branch `chore/cron-indirizzo`. Il commento del workflow dà per registrata la callback Azure che la checklist elenca ancora da fare. | Valori finti in `.env.example`; rimando al branch dei cron; correggere il commento. | no |
| NIT | v7 — documenti (CONTRADICTED come MAJOR) | `src/env.js:28-30` | v7 vedeva un contrasto sull'URL base di NextAuth. `detect-origin.js` dà ragione a `.env.example`: su Vercel l'host è quello della richiesta. Il commento di `env.js` (boilerplate T3, già presente) è fuorviante. | Correggere il commento. Al primo deploy: login Azure dal dominio di staging. | no |
| NIT | v1, v2, v3, v4 | `src/server/auth.ts:147-153`, `brain/chore/migration/*`, `brain/specs/crm/sezione-contatti/PLAN.md:634` | Commento con Discord rimasto. La lista consente l'ingresso anche con Azure, non solo col link (facoltativo: limitarla al provider `email`). Documenti di migrazione che descrivono ancora `/api/operator/create`, le variabili tolte e `.env.production.local`. | Pulizia, o follow-up per `docs-maintenance`. | no |
| NIT | v6 — rilascio | `.github/workflows/deploy-staging.yaml:17-20,32,35` | `--git-branch=dev` senza `--meta`; pnpm `9` invece di `9.9.0`; `vercel` senza versione; nessun blocco `permissions`. Rilanciare un run vecchio riporta l'alias indietro. Copiato dalla produzione. | Facoltativo. | no |
| MINOR (già presente, fuori dalla diff) | v2; anche v1 | `src/server/db/migrations/20240926195125_lucky_roughhouse.sql:135`, `src/server/db/schema/users.ts:26` | Ogni nuovo account nasce ADMIN, per default del DB. Ora che l'operatore viene sempre creato, ogni primo accesso diventa un amministratore pieno: in prod tutto il tenant Azure, in staging la lista e chiunque si sia mai registrato sul DB di sviluppo. | Decisione del responsabile: ruolo di default e verifica degli utenti nel DB di sviluppo. | sì |
| NIT (già presente) | v6 | `src/trpc/shared.ts:10` | Le fetch SSR usano `VERCEL_URL`, che con la Standard Protection è protetto. | Da verificare al primo deploy dello staging. | sì |

_"Durable?" = yes quando la finding non si corregge prima del ship e va portata in `tech-debt/` all'ingest._

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — login | In prod solo Azure (`auth.ts:28-44`), senza filtro (`auth.ts:118`). `signIn` gira prima dell'invio del link (`next-auth core/routes/signin.js:88-112`) e di nuovo alla callback. La lista viene letta bene. Ricerca parametrizzata, senza caratteri jolly. Email nulla o vuota rifiutata. Un errore del DB blocca l'accesso (provato). Link nel terminale solo con `next dev`. Discord tolto del tutto. Un solo handler, che usa le callback. Test 7/7, lint, `tsc`. |
| v2 — creazione utente | Atomicità provata: con un errore forzato su ciascuno dei due insert non resta nessuna riga. Id v4 generato dall'app. `emailVerified` mantenuto, `image` a null. Stesse tabelle `mito-deutsche_`, che gli altri metodi dell'adapter trovano. Regole Effect rispettate. Route `/api/operator/create` rimossa, nessun chiamante rimasto. Tutti e 4 i punti che creano utenti creano anche l'operatore. 125 test. |
| v3 — segnale e schema env | Inlining corretto in client, server ed edge (`define-env-plugin`). Valori inattesi rifiutati dall'enum. Obbligatorietà condizionale verificata con valori finti. Nessun segreto nel bundle client. Nessun riferimento alle variabili tolte. `WorkerImportDialog` usa `window.location.origin`. Build come in CI con exit 0. |
| v4 — credenziali di prod | `production` → `.env.prod.local`. `@next/env` 14.2.5 non lo carica mai (provato). Nessun `loadEnv` nei moduli di Next. Ogni contesto continua ad avere le sue variabili. I cron non usano credenziali del DB. `tsc`, 125 test. |
| v5 — Sentry | Nel chunk compilato il DSN arriva solo con `production`. Il server ignora `SENTRY_DSN`. Le opzioni del plugin sono valide per 8.20.0: provate con production, preview e senza valore. `bundler-plugin-core` 2.20.1 salta upload, release e telemetria. Nessun altro invio a Sentry. |
| v6 — rilascio | Trigger e concurrency giusti. Pull, build e deploy tutti su Preview. Alias e cattura dell'URL funzionano quando il deploy riesce. Nessun segreto nei log. `deploy-production.yaml`, `ci.yml` e `package.json` identici alla base. `crons: []` invariato. La Standard Protection copre preview e alias non di produzione. |
| v7 — documenti | Tutti i nomi esistono in `env.js`. L'obbligatorietà per ambiente corrisponde. Percorso Entra `/api/auth/callback/azure-ad`. Alias coerente. Nessun valore segreto. La modifica ad `AGENTS.md` è esatta. |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Filtro sul login | SHIP | Nessuno entra se non deve. MAJOR sull'account ADMIN duplicato per le maiuscole. |
| v2 | Creazione utente e operatore | SHIP | Atomico e compatibile. MAJOR sul test che non lo protegge. |
| v3 | Segnale di produzione e schema env | DO NOT SHIP | Se `VERCEL_ENV` manca al build di prod, nessun controllo lo blocca e la produzione diventa staging. |
| v4 | Credenziali di prod | DO NOT SHIP | DB dello staging affidato a Preview senza un passo obbligatorio; `loadEnv` non si ferma senza file. |
| v5 | Sentry | DO NOT SHIP | L'ambiente di prod viene rinominato; il segnale di prod non ha guardia. |
| v6 | Rilascio | DO NOT SHIP | `VERCEL_ENV` mai impostato nei workflow; Preview forse con valori di prod. |
| v7 | Documenti e checklist | DO NOT SHIP | La checklist non garantisce il DB di sviluppo; contraddizioni sull'accesso. |

### Human Review Checklist

Ognuno dei passi 2–9 dice cosa va verificato e com'è il risultato giusto. Le variabili si guardano solo per nome, mai i valori.

1. **Correggere i due BLOCKER e le MAJOR del codice**, poi rifare la review:
   - guardia su `VERCEL_ENV`;
   - `environment` di Sentry;
   - maiuscole nel filtro di login;
   - `loadEnv` che si ferma;
   - test della transazione;
   - checklist Preview obbligatoria.
2. **Vercel → Settings → Environment Variables → Production.** Togliere `SENDGRID_*`, `DISCORD_*`, `NEXT_PUBLIC_BASE_URL`, `CUSTOM_ACCESS` e `PREVIEW_DB*`, se ci sono.
3. **Vercel → Settings → General.** "Automatically expose System Environment Variables" è attiva.
   - Al primo deploy di prod dopo il merge, il log del controllo deve mostrare `VERCEL_ENV="production"`.
4. **Vercel → Environment Variables → Preview, prima del merge su `dev`**, compresi gli override del branch `dev`.
   - `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_KEY` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` sono del progetto di sviluppo e diversi da Production.
   - `NEXTAUTH_SECRET` è nuovo.
   - `AUTH_ALLOWED_EMAILS` è impostato.
   - `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `NEXTAUTH_URL`, `NODE_ENV` e `PREVIEW_DB*` sono assenti.
5. **Accesso degli `info@`.** Decidere come superano Vercel Authentication (membri del team o altro) e scriverlo in `staging-vercel.md`.
6. **Sentry → progetto javascript-nextjs.**
   - Nessuna regola di alert o ricerca salvata filtra `environment:production`, oppure si rimette `environment: "production"` nel codice.
   - Dopo il primo deploy di prod, gli eventi arrivano con l'ambiente atteso.
7. **Utenti del DB di sviluppo.** Controllare chi c'è in `mito-deutsche_user` (email e ruoli): tutti entreranno nello staging, con ruolo ADMIN se creato per default.
8. **Microsoft Entra.**
   - Redirect URI della produzione e dello staging registrati (`/api/auth/callback/azure-ad`).
   - Al primo deploy dello staging, il login Azure dal suo dominio arriva in fondo.
9. **Dominio di staging.** Se è un dominio del progetto, in Project → Domains è assegnato al branch `dev`, non a Production. Dopo il primo push su `dev`:
   - il workflow è verde;
   - l'alias punta a una deployment Preview;
   - la Deployment Protection chiede il login Vercel;
   - Sentry non riceve niente.
10. **Ordine dei merge.**
    - Dopo la sessione G2 di PR2.
    - Poi `chore/accesso-fuori-prod` → `chore/staging-vercel` → `chore/env-prod-locale`.
    - Subito dopo l'ultimo, su ogni macchina: `mv .env.production.local .env.prod.local`. Prima della rinomina non lanciare `next build` o `next start` in locale con quel file presente.
11. **Gate** da `AGENTS.md`:
    - `SKIP_ENV_VALIDATION=true pnpm exec next lint`
    - `pnpm exec tsc --noEmit`
    - `pnpm run test --run`
    - build con `SKIP_ENV_VALIDATION=true` e i segnaposto Supabase
    - nessuno script con `NODE_ENV=production` durante le verifiche.

### Notes for docs-maintenance

- Finding durevoli da portare in `tech-debt/platform/staging-accesso-sentry.md`:
  - ruolo ADMIN di default per ogni nuovo account;
  - fetch SSR su `VERCEL_URL` con la protezione attiva;
  - deploy dello staging senza test e amend dell'autore, se rinviati.
- Documenti da aggiornare all'ingest:
  - `brain/chore/migration/fase-2-backend-express.md` (`/api/operator/create`);
  - `brain/chore/migration_plan.md:32,73`;
  - `brain/chore/migration/attivita-manuali-provider.md:73`;
  - `brain/chore/migration/fase-0/t2-spostamento-web-legacy.md:44`;
  - `fase-0/t4`, `fase-1-*` e `fase-3-frontend-spa.md:40` (variabili tolte);
  - `brain/specs/crm/sezione-contatti/PLAN.md:634` (`.env.production.local`).
- Domain pages that should backlink this review: n/a (standalone).

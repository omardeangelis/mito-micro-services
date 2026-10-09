---
domain: platform
type: review
scope: standalone
spec: null
review_target: branch chore/cron-indirizzo
base_ref: 2aaf3a8933b61ca1b273e886c85be0289af09b8e
head_ref: 19671c5
verdict: do-not-ship
review_impact: critical
human_in_loop: true
links:
  - "[[review/cron-base-url/RUBRIC]]"
ingested: false
last_ingested: null
created: 2026-10-09
updated: 2026-10-09
---

# Review Report: indirizzo dei cron da `CRON_BASE_URL`

## Verdict (sesto giro)

**DO NOT SHIP** · impact: critical

Le due MAJOR del quinto giro sono chiuse.

- `cronRequest.js` non dice più come sono protetti i due progetti Vercel. Il tech-debt ne parla al condizionale, e dice che `deploy-staging.yaml` arriva con `chore/staging-vercel`.
- Il titolo della voce di tech-debt e F18 non danno più l'indirizzo per "sbagliato". Dicono che non risulta fra gli alias del team e che nessuna run c'è mai stata.

v3 (workflow) e v4 (runbook G2) danno SHIP. v6 (documenti) boccia ancora, con due MAJOR nuove, tutte e due nella voce di tech-debt aggiunta in questo giro:

1. **Il titolo è al presente.** "`CRON_SECRET_KEY` è un secret del repository" dice che il secret c'è già. La stessa voce (`:104`) e `gh secret list` dicono che non esiste ancora.
2. **Tre premesse di sicurezza sono senza fonte:**
   - un secret del repository arriva ai workflow lanciati da qualunque ref (`:101`);
   - un branch cancellato torna con "Restore branch" su una PR chiusa (`:102`);
   - `x-vercel-protection-bypass` è il bypass della Deployment Protection (`cronRequest.js:70-71`, `:91`).

   Probabilmente sono vere, ma i testi non citano le docs di GitHub e di Vercel.

Il codice e i workflow reggono. Gli 8 workflow mandano ognuno il segreto giusto all'indirizzo giusto: v3 li ha fatti girare con un `fetch` finto. Le prove di v6 sulla scelta dell'indirizzo, su `.env` e la shell, sul redirect e sull'errore di `Headers` (tre versioni di Node) danno quello che dicono i testi. Ogni comando citato nelle note si riproduce.

## Coverage

- Pass rilanciati:
  - v3 con Opus (eredita): i workflow cambiano per la prima volta dal secondo giro;
  - v4 con Opus (eredita);
  - v6 con Haiku.

  Tutti hanno ricevuto le obiezioni del quinto giro.
- Non rilanciati:
  - v1, v2 e v5: il codice cambia solo nei commenti.
- Evidenze di chi orchestra, su `19671c5`:
  - lint e `tsc` verdi;
  - 22 file di test, 197 test;
  - i branch sopra hanno gli stessi gate verdi.
- Evidenze di v3:
  - parsing di base e head degli 8 file;
  - `fetch` finto con l'env di ogni step;
  - `gh api` sugli environments: `Production` esiste, senza regole sui branch e senza secret.
- Evidenze di v4:
  - clone che simula i merge di G2;
  - i giri sui ref veri, in bash e zsh;
  - one-off dotenv su file finti;
  - `alert.js` della head con `fetch` finto, per i 401 JSON e HTML.
- Evidenze di v6:
  - una copia `git archive`, con `fetch` finto e un env pulito;
  - server di redirect su 127.0.0.1;
  - i comandi `vercel` e `gh` rieseguiti in sola lettura.

## Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v6 — documenti | tech-debt `sezione-contatti.md:97` | Il titolo "`CRON_SECRET_KEY` è un secret del repository" è al presente. Lo stesso testo (`:104`, "il secret non c'è ancora") e `gh secret list` dicono che non esiste. | Titolo al futuro: "Quando si crea, `CRON_SECRET_KEY` sarà un secret del repository". | no |
| MAJOR | v6 — documenti (UNSUPPORTED) | tech-debt `:101`, `:102`; `cronRequest.js:70-71`, `:91` | Tre premesse di una voce di sicurezza sono senza fonte: lo scope di un secret del repository, "Restore branch", l'header di bypass di Vercel. | Citare le docs di GitHub (secret ed environment, ripristino di un branch) e quella di Vercel su "Protection Bypass for Automation", oppure segnarle come non verificate. | no |
| MINOR | v4 — runbook G2 | `PLAN.md:633`, `:702` | Un rilancio di una run vecchia ("Re-run") riusa il commit di quella run, ma legge i secret di oggi. Una run `workflow_dispatch` di prima di `chore/cron-indirizzo`, rilanciata dopo il passo 8, manderebbe il token a `mito-deutsche.vercel.app`. Il passo 2 accetta proprio queste run, e i giri guardano solo branch e tag. Oggi le run dei 4 workflow di prod sono 0. | Al passo 8, prima di `gh secret set`: elencare le run dei 4 workflow di prod e cancellare con `gh run delete` quelle su un commit che non contiene il merge di `chore/cron-indirizzo`. Aggiungerlo al tech-debt. | sì |
| MINOR | v4 — runbook G2 | `PLAN.md:701` | Se `main` va avanti al passo 8, dopo la migrazione non si riparte. Il controllo vuole il commit annotato al passo 4, e si può riannotare solo il commit vuoto: un commit di correzione non passa mai. | Dopo `git log <annotato>..origin/main`, rifare sul commit nuovo i controlli del codice dei passi 1 e 4 e i due giri, annotarlo e aspettare il suo deploy. | no |
| MINOR | v4 — runbook G2 | `PLAN.md:703`, `:708`, `:714` | Uno stop dopo `gh secret set` lascia il secret attivo. Capita con il 401 HTML, con la run rossa o con una rigenerazione fallita. Alla ripresa, `gh secret list` manda al passo 3 come se l'avesse creato qualcun altro. | A ogni stop dopo `gh secret set`: `gh secret delete CRON_SECRET_KEY`, e annotarlo. Alla ripresa, un valore rigenerato dopo il merge richiede un nuovo deploy come al passo 4, con ora e commit nuovi. | no |
| MINOR | v6 — documenti | `IMPLEMENTATION-NOTES.md:147` | "`engines.node` prevale sull'impostazione del progetto" è vero, ma senza fonte. "Created At 16:42:24" è l'ora locale (CEST, cioè le 14:42 UTC); le altre ore della sezione sono in UTC. | Citare la doc di Vercel sulla versione di Node. Scrivere "16:42:24 CEST (14:42 UTC)". | no |
| MINOR | v6 — documenti | `cronRequest.js:79-80` | Il NUL non arriva mai al controllo. `spawn` lo rifiuta nell'env, e `process.env` tronca al NUL: un `.env` con `abc\0def` dà `abc`, e l'header parte con il valore troncato. | Dire che un NUL non arriva allo script. | no |
| NIT | v3, v4, v6 | vari | v3: secret del repository e `Production` senza regola sui branch (la correzione in tech-debt deve aggiungerla, non basta `environment:`); `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_KEY` a livello di workflow, mai letti; i secret di Telegram scritti dentro `run:`; `t5-ci-workflows.md:27-31` vecchio; `AGENTS.md:27` nomina `clean:task-event-log`, che nessun workflow lancia. v4: un ramo per gli altri status (307/308, 403); la protezione di `crm.dbmito.it` si può vedere prima, con una GET senza token; `PLAN.md:657` vecchio; `date -u` in italiano contro lo `startedAt` ISO; il giro locale su una HEAD staccata; al passo 4 non si rifanno i `grep` di `authCheck`; `.env.production.local` già rinominato al momento di G2. v6: `[::1]` chiamato "remoto"; "aggiorno" in `update.js:1`; prima frase di F18 non segnata come "Prima:"; frase di `PLAN.md:824`; "fallirebbero" senza "per il codice"; "il runbook toglie" invece di "chiede di cancellare"; provenienza della voce di tech-debt; riassunto di `AGENTS.md:27`; `PLAN.md:821`. | Vedi il verificatore. | no |

## Esito delle finding del quinto giro

| Finding del quinto giro | Esito |
|-------------------------|-------|
| MAJOR v6: protezione dei progetti senza fonte, con `deploy-staging.yaml` che manca | **Chiusa.** Resta senza fonte l'header di bypass (MAJOR sopra). |
| MAJOR v6: indirizzo "sbagliato", "fallisce sempre" | **Chiusa.** |
| MINOR v4: commit del passo 8 su un `origin/main` che si muove | **Chiusa.** Annotato al passo 4 e usato ai passi 5 e 8. Manca la strada per ripartire (MINOR sopra). |
| MINOR v4: ramo del 401 | **Chiusa.** JSON della route e HTML della protezione separati; secondo 401 con rigenerazione. Resta il secret attivo dopo uno stop (MINOR sopra). |
| MINOR v4: secret del repository, copie locali, branch che tornano | **Chiusa come tracciata.** Voce di tech-debt, giro locale, `git branch -D`. Le run rilanciate sono una via nuova (MINOR sopra). |
| MINOR v6: "Non risulta nessun token" dalle sole run di GitHub; commento di `Headers`; F18 non barrata; workflow di prod che oggi fallirebbero | **Chiuse.** Resta il NUL (MINOR sopra). |
| NIT v4: conclusioni del passo 5, tag, `DOTENV_KEY`, comando dei branch dello staging, `gh secret list` al passo 8, ore, "sei branch" | **Chiusi.** Restano il formato dell'ora e una parentesi. |
| NIT v6: due voci su una riga, Node 24.x, `SUPABASE_*` assenti, "output", wording di `cronRequest.js`, nomi copiati, "piu" | **Chiusi.** F18 nomina ancora solo `update-alert.yml` nella colonna Location (NIT). |
| NIT v3 (secondo giro): nomi di job e step copiati | **Chiusa.** |

## What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v3 — workflow | Ogni workflow di prod manda `CRON_SECRET_KEY` a `https://crm.dbmito.it` senza bypass; ogni workflow di sviluppo manda `STAGING_CRON_SECRET_KEY` e il bypass a `https://staging-crm.dbmito.it`. Provato con il `fetch` finto e l'env di ogni step. Con i secret vuoti tutti e 8 escono con "Missing CRON_SECRET_KEY" senza chiamare. `on`, `schedule` e la guardia `ALERT_CRON_ENABLED` sono uguali alla base. I nomi nuovi corrispondono a quello che fa ogni job, e nessun comando del runbook dipende dai nomi vecchi. |
| v4 — runbook G2 | I `grep` di `authCheck` sul fix, su `main`, su `dev` e sulla head. Il clone dei merge di G2: puliti, nessun indirizzo vecchio, il journal finisce con `contatti_operator_realign`. I giri su branch remoti, locali e tag, in bash e zsh. Il controllo dei branch dello staging su `dev` e su ogni branch. I passi 5 e 8 legati al commit annotato. L'uscita di `alert.js` su un 401 è quella che il runbook dice di cercare. |
| v6 — documenti | Ogni frase di `AGENTS.md:27` riprodotta. Le regole, il redirect e il controllo del bypass di `cronRequest.js`. L'errore di `Headers` per CR, LF e NUL su Node 22.17.1, 22.22.0 e 24.14.1. Rieseguiti `vercel alias ls` (2 pagine, 29 righe), `project ls`, `project inspect`, `gh secret list`, `gh variable list`, `gh run list` sugli 8 workflow: uguali a quanto scritto. Nessun valore segreto nei testi. |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Scelta dell'indirizzo | — | Non rilanciato (SHIP al quarto giro). |
| v2 | Credenziali in uscita | — | Non rilanciato (SHIP al terzo giro). |
| v3 | Segreti nei workflow | SHIP | Abbinamenti giusti in tutti e 8; nomi nuovi senza dipendenze rotte. |
| v4 | Runbook G2 | SHIP | Tutte le obiezioni chiuse. Tre MINOR nuove, che si fermano dal lato sicuro o oggi non possono capitare. |
| v5 | Parità e test | — | Non rilanciato (SHIP al terzo giro). |
| v6 | Documenti | DO NOT SHIP | Le due MAJOR vecchie chiuse; due nuove nella voce di tech-debt aggiunta in questo giro. |

## Human Review Checklist

Ognuno dei passi dice cosa va verificato e com'è il risultato giusto. I segreti si guardano solo per nome, mai i valori.

1. **Correggere le due MAJOR di v6:**
   - il titolo della voce di tech-debt al futuro;
   - le fonti delle tre premesse.

   Poi rifare v6.
2. **Le MINOR del runbook prima della sera di G2:**
   - le run vecchie dei workflow di prod, al passo 8;
   - la strada per ripartire se `main` va avanti;
   - `gh secret delete` a ogni stop dopo `gh secret set`.
3. **Portare `fix/auth-check-token-vuoto` su `main` prima di G2**, con una PR e il deploy di prod. Poi unire `main` in `dev` e cancellare il branch, remoto e locale.
4. **Branch vecchi**, prima di creare `CRON_SECRET_KEY` su GitHub: cancellare quelli che chiamano ancora `mito-deutsche.vercel.app`.
   - Remoti: `aling-with-previous-repo`, `chore/ci-pipeline`, `chore/sentry-error-reporting`, `fix/import-update-where`.
   - Locali: `contatti/pr1-creazione-sicura`, `contatti/pr2-vincolo-db`.
5. **Segreto di prod:**
   - `CRON_SECRET_KEY` su Vercel, solo Production, Sensitive, prima del merge del passo 4;
   - il valore nel password manager;
   - su GitHub si crea solo al passo 8.
6. **Protezione del progetto di prod:** in Settings → Deployment Protection, `crm.dbmito.it` deve restare fuori, perché i cron di prod non mandano il bypass. Da qui non si vede.
7. **Merge di `chore/cron-indirizzo` in `dev` prima di G2**, come merge commit, senza i branch dello staging.
8. **G2 secondo il runbook.**
9. **Telegram:** creare `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` su GitHub, oppure accettare che il messaggio non arrivi.
10. **Gate** da `AGENTS.md`: lint, `tsc`, test, build con i segnaposto.

## Notes for docs-maintenance

- Finding durevoli da portare in `tech-debt/`, se rinviate:
  - `CRON_SECRET_KEY` come secret del repository (già nel tech-debt della spec). La correzione richiede un environment **con** una regola sui branch: quello `Production` esistente non ne ha (v3).
  - Il rilancio di run vecchie dopo il passo 8 (v4).
- Al merge: l'`AGENTS.md` di `602fa33` dice ancora che "in the shell" un valore non manda gli script in produzione. Tenere la frase della head.
- Domain pages that should backlink this review: n/a (standalone).

---

## Quinto giro (2026-10-09, head `5e3fd5d`)

### Verdict

**DO NOT SHIP** · impact: critical

Le due MAJOR del quarto giro sono chiuse.

- La nota non dà più per avvenuta l'esposizione del segreto. Ora dice che nessuno degli 8 workflow dei cron ha mai girato (`gh run list`: 0 run per ognuno, riverificato da v6).
- Il commento di `cronRequest.js` sull'errore di `Headers` ora va nella direzione giusta.

Il revisore del runbook G2 (v4) dà SHIP. Resta bocciato il revisore dei documenti (v6), con due MAJOR, tutte e due nei testi.

1. **La protezione dei due progetti Vercel è scritta come un fatto, senza fonte, e cita un file che in questo branch non c'è.** `cronRequest.js:70-72` e tech-debt `sezione-contatti.md:92` dicono che lo staging protegge tutte le deployment ("deploy-staging.yaml si ferma se non è così") e che la prod ha la Standard Protection. Ma `deploy-staging.yaml` non c'è a `5e3fd5d`: è su `chore/staging-vercel`, che arriva su `dev` dopo G2. E `vercel project inspect` non mostra la protezione.
2. **Un'inferenza è scritta come un fatto.** Il titolo della voce di tech-debt (`:81`, "I workflow dei cron chiamavano l'app sbagliata") e F18 nel `REPORT.md` della spec (`:132`, "chiamava un indirizzo sbagliato… fallisce sempre") lo affermano. Ma `vercel alias ls` mostra solo che `mito-deutsche.vercel.app` non è del team, e il corpo della stessa voce dice "chi lo serva non è verificato".

Il codice regge. Le 16 prove sulla scelta dell'indirizzo, le 5 sul segreto dello staging e le 2 sul segreto di prod mancante danno quello che dicono i testi, e ogni fatto citato dai comandi si riproduce.

### Coverage

- Pass rilanciati:
  - v4 con Opus (eredita);
  - v6 con Haiku;
  - tutti e due con le obiezioni del quarto giro.
- Non rilanciati:
  - v1: il codice cambia solo nella regex dei nomi `localhost`, e i test nuovi sono quelli che aveva chiesto;
  - v2, v3 e v5: la loro area non cambia dal terzo giro.
- Evidenze di chi orchestra: gate verdi su `5e3fd5d` e sui branch sopra.
- Evidenze di v6 in `scratchpad/r5docs/`:
  - le due pagine di `vercel alias ls`;
  - `project ls`;
  - i due `project inspect`;
  - `gh run list` per ognuno degli 8 workflow;
  - le prove.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v6 — documenti (UNSUPPORTED) | `cronRequest.js:70-72`; tech-debt `sezione-contatti.md:92` | La protezione dei due progetti è scritta come un fatto. `deploy-staging.yaml`, che la farebbe valere per lo staging, non c'è a `5e3fd5d`. `vercel project inspect` dei due progetti non ha nessun campo sulla protezione. | Dire che `deploy-staging.yaml` arriva con `chore/staging-vercel`, o togliere il riferimento. Per la prod: "riferita dal proprietario il 2026-10-08", o togliere la frase. | no |
| MAJOR | v6 — documenti (inferenza come fatto) | tech-debt `sezione-contatti.md:81`; spec `REPORT.md:132` (F18) | "chiamavano l'app sbagliata", "un indirizzo sbagliato", "fallisce sempre". Le prove dicono solo che il nome non è del team, e nessuna run c'è mai stata. | Titolo: "…un indirizzo che non risulta del team". F18 al condizionale: "per il codice fallirebbe; mai eseguito". | no |
| MINOR | v4 — runbook G2 | `PLAN.md:700`, passo 4 | Il passo 8 confronta il `headSha` del deploy con `origin/main`, che si muove. Il passo 4 non annota il commit. Un push su `main` fra i passi 4 e 8 passerebbe il controllo, e il cron girerebbe su codice che la sessione non ha visto. | Annotare `git rev-parse HEAD` al passo 4, accanto agli export. Al passo 8 chiedere `headSha` = commit annotato = `origin/main`; se no fermarsi e guardare `git log <annotato>..origin/main`. | no |
| MINOR | v4 — runbook G2 | `PLAN.md:703`, `:638` | Il ramo del 401 chiede di rimettere "il valore di Vercel". Il valore è Sensitive e non si rilegge. Mancano: cosa fare al secondo 401, dove conservare il valore rigenerato al passo 3, come distinguere il 401 della protezione (HTML) da quello della route (`{"error":"Unauthorized"}`). | Al secondo 401: nuovo valore su Vercel (Production, Sensitive), conservato, `date -u`, redeploy come al passo 4, di nuovo il controllo del passo 8, poi `gh secret set`. Dire quale corpo cercare nel log. | no |
| MINOR | v4 — runbook G2 | `PLAN.md:613` | Il segreto resta del repository. La frase sulle copie locali non ha un comando. Un branch vecchio può tornare: "Restore branch" su GitHub, oppure `git push` da `contatti/pr2-vincolo-db` con `push.autoSetupRemote=true`. Non c'è nessuna voce in tech-debt. | `CRON_SECRET_KEY` nell'environment `Production` già esistente, limitato a `main`, con `environment: Production` sui 4 job di prod. Registrarlo in tech-debt. | sì |
| MINOR | v6 — documenti | `IMPLEMENTATION-NOTES.md:149` | "Non risulta quindi nessun token…" si basa solo sulle run di GitHub. Anche un `pnpm update:alert` locale con il codice della base avrebbe mandato il token. | "Nelle run di GitHub: 0; le esecuzioni locali non sono verificabili da qui". | no |
| MINOR | v6 — documenti | `cronRequest.js:81-82` | "Unlike the error of an invalid header, which prints the value": vale per CR, LF e NUL. Per `\x01` e DEL l'errore (`fetch failed`) non stampa il valore. | Nominare CR, LF e NUL, o togliere il confronto. | no |
| MINOR | v6 — documenti | spec `REPORT.md:132` | In F18 resta, non barrata, "G1 usa update-alert prod.yml, che invece è corretto.". | Barrarla, come le altre frasi superate. | no |
| MINOR | v6 — documenti | tech-debt `sezione-contatti.md:86-92` | "Ora" e "Resta" non dicono che oggi i 4 workflow di prod falliscono. Su GitHub manca `CRON_SECRET_KEY`, quindi gli script escono con "Missing CRON_SECRET_KEY" prima di ogni chiamata (prove P1/P2). | Aggiungerlo a "Resta". | no |
| NIT | v4, v6 | vari | v4: il controllo del deploy al passo 5 prende solo `failure`; il giro non guarda i tag; `DOTENV_KEY` manca dal `grep`; i branch dello staging senza un comando che li cerchi; al passo 8 manca `gh secret list` prima di `gh secret set`; formulazione dell'ora; "sei branch" ormai sono 4. v6: due voci unite su una riga in `IMPLEMENTATION-NOTES.md:149`; Node 24.x dello staging senza confronto con `engines`; `SUPABASE_*` assenti non elencati; "output" che sono estratti; commenti di `cronRequest.js:6-8` meno precisi di `AGENTS.md`; nomi di step e job copiati; "piu" in `cleanupTaskEventLog.js:1`; F18 nomina solo `update-alert.yml`. | Vedi il verificatore. | no |

### Esito delle finding del quarto giro

| Finding del quarto giro | Esito |
|-------------------------|-------|
| MAJOR v6: esposizione del segreto data per avvenuta | **Chiusa.** Resta il limite delle run solo GitHub (MINOR). |
| MAJOR v6: commento sull'errore di `Headers` contraddetto | **Chiusa** nella direzione. Resta che generalizza troppo (MINOR). |
| MINOR v1: URL chiamato da ogni script | **Corretto** con i due casi chiesti; non ricontrollato (v1 non rilanciato). |
| MINOR v4: giro al passo 3, `fix/auth-check-token-vuoto` | **Chiusa.** |
| MINOR v4: conteggio degli alert prima della migrazione | **Chiusa.** Ora è subito prima di `SELECT now()` e del migrate. |
| MINOR v4: branch dello staging dopo G2 | **Chiusa.** Manca un comando che li cerchi (NIT). |
| MINOR v4: segreto del repository | **Parziale** (MINOR sopra). |
| MINOR v6: protezione senza fonte | **Aperta**, ora MAJOR: cita un file che non c'è in questo branch. |
| MINOR v6: controllo del 2026-10-08, data da `project inspect`, pagine di `alias ls`, "Ora chiamano", "never goes to this machine", run a mano verde | **Chiuse.** |
| MINOR v6: "fallivano sempre"; F18 | **Parziali.** Il tech-debt è al condizionale, F18 no (MAJOR e MINOR sopra). |
| NIT v4 | **Chiusi**, tranne il ramo del 401 (MINOR) e il controllo del deploy prima della migrazione, debole (NIT). |
| NIT v6 | **Chiusi**, tranne i nomi di step e job copiati e i `SUPABASE_*` non elencati. |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v4 — runbook G2 | Giro sui branch in bash e zsh su ref veri. Clone che simula fix su `main`, `main` in `dev`, cron in `dev`, `dev` in `main`: `diff --stat` di 32 file, il journal finisce con `20260929062408_contatti_operator_realign`, il giro dopo il merge non stampa niente. Comandi di `authCheck` sul fix, su `main`, su `dev` e sulla head. One-off dotenv 16.4.5 su file finti, con lo stesso ordine di drizzle-kit 0.24.2. `startedAt` in UTC. Run 36579491916 ↔ `crm.dbmito.it`. |
| v6 — documenti | Prove C1–C16: `AGENTS.md:27` vale frase per frase. Rieseguiti `vercel alias ls` (2 pagine, 29 righe), `project ls`, `project inspect` dei due progetti, `gh secret list`, `gh variable list`, `gh run list` sugli 8 workflow: identici a quanto scritto. `redirect: "manual"`: un 307 locale fa uscire con 1, e il server di destinazione riceve 0 richieste. Intestazioni dei 5 script giuste. Nessun valore segreto nei testi. |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Scelta dell'indirizzo | — | Non rilanciato (SHIP al quarto giro). |
| v2 | Credenziali in uscita | — | Non rilanciato (SHIP al terzo giro). |
| v3 | Segreti nei workflow | — | Non rilanciato (SHIP al secondo giro). |
| v4 | Runbook G2 | SHIP | Ogni passo irreversibile ha un controllo che si ferma su uno stato sbagliato. Tre MINOR da sistemare prima della sera di G2. |
| v5 | Parità e test | — | Non rilanciato (SHIP al terzo giro). |
| v6 | Documenti | DO NOT SHIP | Due fatti scritti senza prove: la protezione dei progetti, con un file che manca, e l'indirizzo "sbagliato". |

### Human Review Checklist

Ognuno dei passi dice cosa va verificato e com'è il risultato giusto. I segreti si guardano solo per nome, mai i valori.

1. **Correggere le due MAJOR e le MINOR dei testi di v6**, poi rifare v6.
2. **Le MINOR del runbook prima della sera di G2:**
   - commit annotato al passo 4 e confrontato al passo 8;
   - ramo del 401 completo;
   - segreto nell'environment `Production` limitato a `main`, oppure registrato in tech-debt.
3. **Portare `fix/auth-check-token-vuoto` su `main` prima di G2**, con una PR e il deploy di prod, poi unire `main` in `dev` e cancellare il branch, remoto e locale.
4. **Branch vecchi:** cancellare, remoti e locali, quelli che chiamano ancora `mito-deutsche.vercel.app`, prima di creare `CRON_SECRET_KEY` su GitHub.
5. **Segreto di prod:**
   - `CRON_SECRET_KEY` su Vercel, solo Production, Sensitive, prima del merge del passo 4;
   - il valore in un password manager;
   - su GitHub si crea solo al passo 8.
6. **Merge di `chore/cron-indirizzo` in `dev` prima di G2**, come merge commit e senza i branch dello staging, che arrivano dopo G2.
7. **G2 secondo il runbook.**
8. **Telegram:** creare `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` su GitHub, oppure accettare che il messaggio non arrivi.
9. **Gate** da `AGENTS.md`: lint, `tsc`, test, build con i segnaposto.
10. **Mai eseguire gli script cron in locale** con `CRON_BASE_URL` o `GITHUB_ACTIONS` impostati, nella shell o nel `.env`.

### Notes for docs-maintenance

- Finding durevole da portare in `tech-debt/`, se rinviata: `CRON_SECRET_KEY` come segreto del repository, che un `workflow_dispatch` da qualunque ref riceve, e un branch vecchio che può tornare (v4).
- Al merge: l'`AGENTS.md` di `602fa33` dice ancora che "in the shell" un valore non manda gli script in produzione. Tenere la frase della head (v6).
- Domain pages that should backlink this review: n/a (standalone).

---

## Quarto giro (2026-10-09, head `9ca8f83`)

### Verdict

**DO NOT SHIP** · impact: critical

Il BLOCKER e la MAJOR del terzo giro sono chiusi:

- la frase di `AGENTS.md` sul `.env` ora è vera, e v1 e v6 l'hanno provata con gli script veri;
- le righe di `vercel alias ls`, `vercel project ls` e `gh secret list` scritte nella nota sono identiche a quelle che v6 ha ottenuto rieseguendo i comandi.

Due revisori su tre danno SHIP. Restano due MAJOR di v6, tutte e due nei testi.

1. **La nota dà per avvenuta un'esposizione del segreto** (`IMPLEMENTATION-NOTES.md:149`): "i cron di prod l'hanno usato per firmare token mandati a `mito-deutsche.vercel.app`". Ma nessuno degli 8 workflow dei cron ha mai girato su GitHub: `gh run list` dà 0 run per ognuno.
2. **Il commento di `cronRequest.js:80-81` dice il contrario di quello che succede.** L'errore di `Headers` stampa il valore dell'header (`Headers.append: "…" is an invalid header value.`), ed è proprio per questo che c'è il controllo.

### Coverage

- Pass rilanciati: v1 e v4 con Opus (eredita), v6 con Haiku, con le obiezioni del terzo giro.
- Non rilanciati: v2, v3 e v5, perché quello che controllano non è cambiato dal terzo giro (intestazioni della richiesta, segreti dei workflow, parità); i test aggiunti li ha visti v1.
- Evidenze di chi orchestra:
  - gate verdi su `chore/cron-indirizzo` (184 test) e sui branch sopra;
  - v6 ha lanciato per sbaglio `vercel api …`: la CLI 41.6.2 non ha quel comando, l'ha preso per un deploy ed è fallita sugli argomenti. `vercel ls` dei due progetti non mostra nessuna nuova deployment, e non c'è nessuna cartella `.vercel`.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v6 — documenti (UNSUPPORTED) | `IMPLEMENTATION-NOTES.md:149` | Dà per avvenuto che `CRON_SECRET_KEY` abbia firmato token mandati a `mito-deutsche.vercel.app`. `gh run list` sugli 8 workflow dei cron: 0 run. | Scrivere il fatto: nessuna run nella storia visibile (2026-10-09); il codice della base avrebbe mandato il token lì, se una run ci fosse stata. La rotazione resta. | no |
| MAJOR | v6 — documenti (CONTRADICTED) | `cronRequest.js:80-81` | "The error doesn't print the value, as an invalid header would": `new Headers({x: "ab\ncd-…"})` e `fetch` lanciano un errore che contiene il valore. | "Unlike the Headers error, which prints the value, this one doesn't." | no |
| MINOR | v1 — scelta dell'indirizzo | `_test/cronScripts.test.ts` | Nessun test lega l'URL chiamato da `delete`, `update`, `priority` e `cleanupTaskEventLog` al valore di `cronBaseUrl()`: i mutanti `${process.env.CRON_BASE_URL}/api/cron/…` in `delete.js:24` e `priority.js:24` restano verdi (l'host resta giusto, il percorso no). | Nel `describe.each`: `" https://staging.example/// "` → `https://staging.example/api/cron/<route>`, e `CRON_BASE_URL=""` con `:dev` → `http://localhost:3000/api/cron/<route>`. | no |
| MINOR | v4 — runbook G2 | `PLAN.md:637`, passo 1 | Il passo 3 non ripete il giro sui branch vecchi. `fix/auth-check-token-vuoto` ha i 5 script vecchi, va spinto per la sua PR, e il runbook non dice di cancellarlo. | Il giro, con `git fetch --prune`, anche al passo 3; al passo 1 nominare `fix/auth-check-token-vuoto` fra i branch da cancellare dopo il merge. | no |
| MINOR | v4 — runbook G2 | `PLAN.md:658-664` | Il controllo degli alert chiusi dal sistema viene prima di estrazione, export e conteggi: fino a `db:migrate:prod` un utente collegato può ancora lanciare il cron. | Ripetere il conteggio subito prima di `SELECT now()` e `db:migrate:prod`, o al passo 6 con `updated_at < '<ora della migrazione>'` → 0. | no |
| MINOR | v4 — runbook G2 | T2.4 | Non dice quando arrivano su `dev` i branch dello staging, che stanno sopra questo. Se `chore/env-prod-locale` arriva prima di G2, il controllo dotenv su `.env.production.local` (`:653`), la frase su drizzle-kit (`:652`) e il `diff --stat` (`:642`) sono sbagliati: fermano la sessione. | Scrivere che arrivano su `dev` dopo G2, o aggiornare il passo 4 dentro `chore/env-prod-locale`. | no |
| MINOR | v4 — runbook G2 | dopo il passo 8 | Il segreto è del repository, quindi un `workflow_dispatch` da qualunque ref lo riceve. In locale ci sono i 7 branch vecchi con upstream e `push.autoSetupRemote=true`; l'environment `Production` di GitHub esiste già, senza regole sui branch. | `CRON_SECRET_KEY` come segreto dell'environment `Production`, limitato a `main`, con `environment: Production` sui quattro job di prod; o cancellare anche i branch locali. | sì |
| MINOR | v6 — documenti | `cronRequest.js:69-73`, tech-debt `:92` | La protezione dei due progetti (All Deployments sullo staging, Standard in prod) non ha una fonte; la CLI in sola lettura non la mostra. | Scrivere dove e quando è stata letta, o che la riferisce il proprietario. | no |
| MINOR | v6 — documenti | tech-debt `:83`, `:85`, `:86-88`; `IMPLEMENTATION-NOTES.md:142-147`; `REPORT.md:132`; `cronRequest.js:51-53`; `update-alert prod.yml:16-20` | Il controllo "del 2026-10-08" non è registrato; "fallivano sempre" senza nessuna run; "Ora chiamano lo staging" prima che il dominio esista; `vercel alias ls` ha 2 pagine; la data di creazione viene da `vercel project inspect`; F18 dice ancora che il workflow di prod è giusto; "never goes to this machine" promette più di un controllo sulla sintassi; la variabile si imposta solo dopo una run a mano verde. | Una correzione per frase, come nel rapporto di v6. | no |
| NIT | v1, v4, v6 | vari | v1: nomi del loopback come `localhost..`, `localhost.localdomain`, `ip6-localhost`; rifiuti che nessun test fissa (IP pubblici, `#x`, password). v4: `startedAt` e UTC al passo 8, "valore conservato al passo 1", una frase del passo 8 contro il passo 3, `.env` ancora con `grep` e `DOTENV_CONFIG_*`, un `#` in mezzo al valore, `cat-file` senza virgolette, `grep -v HEAD`, ordine del paragrafo `GIA_SU_MAIN`, un controllo del deploy prima della migrazione. v6: segreti assenti non elencati, nomi di step e job copiati, intestazioni di `priority.js` e `alert.js`. | Vedi il verificatore. | no |

### Esito delle finding del terzo giro

| Finding del terzo giro | Esito |
|------------------------|-------|
| BLOCKER v6: la frase di `AGENTS.md` sul `.env` | **Chiuso.** v1 l'ha provata sui 5 script con un `.env` finto, v6 su 33 casi attraverso `package.json`. |
| MAJOR v6: `vercel alias ls` e `vercel project ls` senza output | **Chiuso.** Righe identiche alla riesecuzione. Restano la paginazione e la fonte della data (MINOR). |
| MINOR v1: loopback con due soli nomi | **Chiuso.** `127.0.0.2`, `[::1]`, `[::ffff:127.0.0.1]`, `0.0.0.0`, `0`, `localhost.` e `foo.localhost` escono con 1. |
| MINOR v4: branch vecchi, nuovo deploy, passo 8, query prima del passo 5 | **Chiusi.** Restano il passo 3 e la finestra prima della migrazione (MINOR). |
| MINOR v5: un'asserzione mancante | **Corretto**, non ricontrollato (v5 non rilanciato). |
| MINOR v6: "fuori da questo progetto", `gh secret list` vecchio, F18, protezione senza fonte | Chiusi i primi due. F18 **parziale** (`REPORT.md:132`). La protezione resta **aperta**. |
| NIT: ASCII senza spazi, "Corretto da", `updated`, "ogni workflow", `.env` provato solo su `alert.js` | **Chiusi.** `#`, `?` e `@` vuoti restano accettati di proposito. |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — scelta dell'indirizzo | Circa 80 valori in 4 modi di avvio; i 5 script veri con `env -i`, un `.env` finto e un `fetch` finto; 10 mutanti. Il `.env` non fa mai chiamare un'app remota a uno script `:dev`; in remoto nessun IP e nessun nome `localhost`; ogni valore sbagliato esce con 1 prima del `fetch`. 88 test. |
| v4 — runbook G2 | Sessione simulata in un clone (fix su `main`, cron su `dev`, `main` in `dev`, `dev` in `main`): storia, file e journal come previsto. Il one-off dotenv dà lo stesso esito di `dotenv.config` su 11 file finti. Il giro sui branch stampa i sei nominati. La run 36579491916 porta a `ij7n4pv4o`, la deployment di prod di oggi. |
| v6 — documenti | 35 prove con gli script veri attraverso `package.json`: `AGENTS.md:27` vale caso per caso. Riesecuzione di `vercel alias ls`, `vercel project ls`, `gh secret list` e `gh variable list`: identici a quanto scritto. Nessun valore nei testi. |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Scelta dell'indirizzo | SHIP | Tutte le obiezioni chiuse. MINOR su un test per script. |
| v2 | Credenziali in uscita | — | Non rilanciato (SHIP al terzo giro). |
| v3 | Segreti nei workflow | — | Non rilanciato (SHIP al secondo giro). |
| v4 | Runbook G2 | SHIP | Nessun controllo passa per sbaglio. MINOR da sistemare prima della sera di G2. |
| v5 | Parità e test | — | Non rilanciato (SHIP al terzo giro). |
| v6 | Documenti | DO NOT SHIP | Un'esposizione del segreto data per avvenuta senza prove, e un commento di sicurezza che dice il contrario del comportamento. |

### Human Review Checklist

Ognuno dei passi dice cosa va verificato e com'è il risultato giusto. I segreti si guardano solo per nome, mai i valori.

1. **Correggere le due MAJOR e le MINOR dei testi di v6**, poi rifare v6.
2. **Le MINOR del runbook prima della sera di G2:** il giro sui branch anche al passo 3, il conteggio degli alert subito prima di `db:migrate:prod`, e scritto che i branch dello staging arrivano su `dev` dopo G2.
3. **Portare `fix/auth-check-token-vuoto` su `main` prima di G2**, con una PR e il deploy di prod, poi unire `main` in `dev` e cancellare il branch: ha i 5 script vecchi. Si verifica con i due `grep` del passo 1, mai con una richiesta a `crm.dbmito.it`.
4. **Branch vecchi:** cancellare o aggiornare quelli remoti che chiamano ancora `mito-deutsche.vercel.app` prima di creare `CRON_SECRET_KEY` su GitHub, e cancellare anche quelli locali.
5. **Segreto di prod.** `CRON_SECRET_KEY` su Vercel, solo Production, Secret, prima del merge del passo 4. Su GitHub si crea solo al passo 8; meglio come segreto dell'environment `Production` limitato a `main`.
6. **Merge di `chore/cron-indirizzo` in `dev` prima della sessione G2**, come merge commit e senza gli altri branch dello staging.
7. **G2 secondo il runbook**, compresa la query sugli alert chiusi dal sistema.
8. **Telegram:** creare `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` su GitHub, oppure accettare che il messaggio non arrivi.
9. **Gate** da `AGENTS.md`: lint, `tsc`, test, build con i segnaposto.
10. **Mai eseguire gli script cron in locale** con `CRON_BASE_URL` o `GITHUB_ACTIONS` impostati, nella shell o nel `.env`.

### Notes for docs-maintenance

- Finding durevole da portare in `tech-debt/`, se rinviata: `CRON_SECRET_KEY` come segreto del repository, che un `workflow_dispatch` da qualunque ref riceve (v4).
- Domain pages that should backlink this review: n/a (standalone).

---

## Terzo giro (2026-10-09, head `cc58070`)

### Verdict

**DO NOT SHIP** · impact: critical

Quattro revisori su cinque danno SHIP. Il BLOCKER del secondo giro è chiuso: un `.env` non manda più gli script `:dev` a un'app remota, e i test lo provano. Sono chiuse anche le due MAJOR del runbook G2, sulla correzione di `authCheck` e sul controllo "il cron è già girato?".

Resta bocciato il revisore dei documenti, per due motivi.

1. **La nuova frase di `AGENTS.md` dice troppo.** Dice che `.env` non può mandare gli script cron a un'altra app. Per gli script senza `:dev` non è vero: lì `CRON_BASE_URL` può venire anche dal `.env` e sceglie l'host che riceve il token di prod. È stato riprodotto con un `fetch` finto. Lo stesso eccesso c'è nel commento di `cronRequest.js`.
2. **I fatti su Vercel in `IMPLEMENTATION-NOTES.md` non hanno l'output dietro.** `vercel alias ls` e `vercel project ls` sono citati senza le righe che li provano.

### Coverage

- Pass rilanciati: 5 su 6, con le obiezioni del secondo giro da ricontrollare:
  - v1, v2 e v4: Opus (eredita);
  - v5: Sonnet;
  - v6: Haiku.
- v3 (segreti nei workflow) non è rilanciato: i workflow non cambiano da `df8fcaa`.
- v1 ha visto `wt-cron3` cambiare mentre lavorava (verso le 17:10 v5 vi faceva test di mutazione), quindi ha usato un export `git archive` di `cc58070`. Alla fine `wt-cron3` era pulito su `cc58070`.
- Evidenze di chi orchestra:
  - su `cc58070` lint, `tsc`, 158 test e build sono verdi;
  - `gh secret list` (solo nomi) ha anche `VERCEL_STAGING_PROJECT_ID`, creato il 2026-10-09 alle 14:45.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v6 — documenti (CONTRADICTED) | `AGENTS.md:27`, `src/app/api/cron/scheduled/cronRequest.js:6-7` | "so `.env` can't send them to another app" vale solo per gli script `:dev`. Gli script senza `:dev` leggono `CRON_BASE_URL` dopo `dotenv.config()`, e in modalità remota controllano solo https, origine e host non locale. Con `CRON_BASE_URL=https://attacker.example` nel `.env`, `NODE_ENV=production node update.js` manda il Bearer e il bypass a quell'host (riprodotto con `fetch` finto, senza rete). | Riscrivere la frase e il commento: il `.env` non rende remoto uno script `:dev`, mentre per gli script senza `:dev` l'host https è `CRON_BASE_URL`, da qualunque posto venga, `.env` compreso. | no |
| MAJOR | v6 — documenti | `brain/specs/crm/sezione-contatti/IMPLEMENTATION-NOTES.md:139-144` | Gli output di `vercel alias ls` e `vercel project ls` non sono registrati: "crm.dbmito.it è un alias della stessa deployment" e "mito-deutsche.vercel.app non è fra gli alias" non si possono ricontrollare. | Riportare data, scope e righe dell'output (host e id delle deployment, nessun token), oppure scriverli come osservazioni del 2026-10-08 non riproducibili dal repo. | no |
| MINOR | v1 — indirizzo | `cronRequest.js:48-52` | In modalità remota il controllo del loopback è una lista di due nomi. Con `NODE_ENV=production` o in GitHub Actions passano `https://[::1]`, `https://127.0.0.2`, `https://[::ffff:127.0.0.1]`, `https://0.0.0.0`, `https://localhost.` e `https://foo.localhost`: il token di prod andrebbe alla macchina locale. | In modalità remota rifiutare ogni IP letterale e `localhost` o `*.localhost`, anche con il punto finale; aggiungerli ai casi rifiutati nei test. | no |
| MINOR | v4 — runbook | `PLAN.md:611`, `:696` | Dopo il passo 8, sei branch remoti, più `origin/main` e `origin/dev` fino al merge, hanno ancora workflow di prod che chiamano `mito-deutsche.vercel.app` con `secrets.CRON_SECRET_KEY`. Un `gh workflow run --ref <branch vecchio>` firmerebbe un token di prod per un host fuori dal progetto. | Prima del passo 8, il `git grep` di `mito-deutsche.vercel.app` sui branch remoti deve essere vuoto; cancellare o aggiornare i branch vecchi. In alternativa, un secret dell'environment `Production` limitato a `main`. | no |
| MINOR | v4 — runbook | `PLAN.md:644-645`, `:695` | Il nuovo deploy del ramo `GIA_SU_MAIN` rilancia l'esecuzione del passo 1, che può essere di un commit più vecchio. Il commit vuoto viene prima di `git checkout main && git pull`, quindi può finire su un altro branch. Al passo 8 una riesecuzione ha lo stesso `databaseId` e lo stesso `headSha` di quella vecchia, e manca `git fetch` prima di `git rev-parse origin/main`. | Rilanciare l'esecuzione del passo 3 dopo aver controllato che il suo `headSha` sia `origin/main`, oppure fare sempre il commit vuoto, dopo il checkout di `main`. Al passo 8 chiedere `attempt` o `startedAt` successivi alla variabile, e fare `git fetch` prima. | no |
| MINOR | v4 — runbook | `PLAN.md:605`, `:628-630` | `authCheck` fa passare qualunque sessione NextAuth. Fra il passo 3 e il passo 5 un utente collegato può lanciare il cron con una GET, e nessun controllo lo vede. | Ripetere la query `resolved_by` del passo 2 subito prima dell'impronta del passo 5, e scrivere che anche una sessione lancia il cron. | no |
| MINOR | v5 — test | `src/app/api/cron/scheduled/_test/alert.test.ts:336` | Il test del bypass non valido non fissa "esce subito". Il mutante che rimette `cronRequestInit` dentro il `try` della rete passa 62/62, e in Node riprova per più di 25 s. | Aggiungere `expect(pause).not.toHaveBeenCalled()` ed `expect(exit).toHaveBeenCalledTimes(1)`. | no |
| MINOR | v6 — documenti | `brain/tech-debt/crm/sezione-contatti.md:83-85`, `IMPLEMENTATION-NOTES.md:141-143`, `cronRequest.js:64-65` | "Un indirizzo fuori da questo progetto" è una deduzione. La lista dei secret è vecchia: c'è anche `VERCEL_STAGING_PROJECT_ID`. F18 copre solo il fallimento su `localhost:3000`, non l'indirizzo di prod. "Production isn't" (protetta) non ha fonte. | "Non risulta fra gli alias del team; chi lo serva non è verificato". Lista dei secret aggiornata e datata. Attribuzione separata. Citare la Standard Protection, che lascia fuori i domini di produzione. | no |
| NIT | v1, v2, v4, v5, v6 | vari | v1: `#`, `?` e `@` vuoti accettati, ma l'origine chiamata è sempre giusta; il test del `.env` c'è solo per `alert.js`. v2: nessun test controlla che token, segreto e bypass restino fuori dai log nei casi normali. v4: il `grep` del file di prod sbaglia con chiavi doppie o con la forma `KEY: value`; il merge di `main` in `dev` potrebbe essere già su `main`; il passo 3 dovrebbe ruotare anche il valore su Vercel; un `git show` fallito fa passare il `grep -c`; il commento di `update-alert prod.yml` dice ancora "funziona sempre". v5: `.trim()` e la rimozione di più `/` finali non hanno un test che li distingua; negli altri quattro script il token non si verifica con `jwt.verify`; il blocco Telegram commentato è stato tolto. v6: "Printable ASCII" esclude anche lo spazio; "Corretto da" è prematuro; `updated:` di `IMPLEMENTATION-NOTES.md`; "ogni workflow" sono solo quelli dei cron. | Vedi il verificatore. | no |

### Esito delle finding del secondo giro

| Finding del secondo giro | Esito |
|--------------------------|-------|
| BLOCKER: un `.env` con `GITHUB_ACTIONS=true` manda gli script `:dev` a un'app remota | **Chiuso nel codice.** `NODE_ENV` e `GITHUB_ACTIONS` si leggono prima del `.env`. v1 e v5 lo provano anche con il vero `dotenv`, e la versione di `df8fcaa` fallisce 16 test su 62. **La frase nuova di `AGENTS.md` però dice troppo** (BLOCKER sopra). |
| MAJOR: `authCheck` non verificabile | **Chiuso.** Comandi con risultato atteso e stop, verificati su `origin/main`, `origin/dev`, `cc58070` e sul branch della correzione. |
| MAJOR: lo stop "già girato" ha dei buchi | **Chiuso.** Query sul DB confrontata con lo schema, `-L 1000`, ogni stato di esecuzione coperto. Restano le NIT. |
| MINOR v1: `localhost` con `NODE_ENV=production`; path, query e credenziali nell'URL; URL vuoto in GitHub Actions; `NODE_ENV` vuoto permissivo | **Chiusi.** Restano gli alias del loopback (MINOR sopra). |
| MINOR v2: bypass con a capo stampato; bypass di soli spazi; credenziali stampate | **Chiusi.** Resta la NIT sui test che controllano i log. |
| MINOR v5: tentativi ripetuti dopo un redirect | **Chiuso** con `redirect: "manual"`: un 3xx esce subito con 1. |
| MINOR v4: passi 3 e 8, ramo `GIA_SU_MAIN`, test senza segreto, Telegram | **Chiusi o quasi.** Restano quelli in tabella sopra. |
| MINOR v4/v3: branch vecchi che dopo il passo 8 firmano token per un altro host | **Aperto** (MINOR sopra). |
| MINOR v6: segreti dello staging, link, "un'altra app", variabili di Vercel senza comando | **Chiusi**, tranne la deduzione sull'host (MINOR sopra). |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — indirizzo | Su circa 65 forme di URL e combinazioni di shell e `.env`, nessun `.env` allarga il bersaglio. Per una chiamata remota servono `NODE_ENV=production` o GitHub Actions all'avvio, più un `CRON_BASE_URL` https. Altrove valgono solo `localhost` e `127.0.0.1`, con `http://localhost:3000` di default. Path, query, frammento e credenziali sono rifiutati prima di ogni `fetch`, e l'origine stampata è quella chiamata. |
| v2 — credenziali | Il bypass viene tolto dagli spazi, mandato una volta sola e rifiutato senza stamparlo se non è ASCII stampabile. Prove con 301, 302 e 307 verso un'altra origine: il secondo server non riceve niente e ogni script esce con 1 dopo una chiamata. In nessun caso, sui 5 script, token, segreto o bypass finiscono nei log. Il JWT è accettato sia da `authCheck` di `main` sia da quello corretto. |
| v4 — runbook | L'ordine regge: correzione deployata, variabile su Vercel prima del merge, secret GitHub solo dopo un deploy controllato, `schedule` con la guardia. Merge simulato in un clone usa e getta, per `DA_FARE` e per `GIA_SU_MAIN`. Lo stop senza segreto è provato con il vero script. Il commit vuoto rilancia il deploy su un checkout a profondità 1. |
| v5 — parità e test | Base e head escono con gli stessi codici per 200, 401, 500 ed errore di rete. Le sole differenze sono quelle volute (3xx e richiesta che non si costruisce: uscita subito). I test passano 62/62 con `NODE_ENV` e `GITHUB_ACTIONS` impostati in vari modi nella shell e in ordine casuale. Nessuna asserzione della base è stata tolta. Lint, `tsc`, 158 test e build sono verdi. |
| v6 — documenti | Le regole descritte in `AGENTS.md` per i `:dev` e per GitHub Actions corrispondono al codice, in 19 casi riprodotti. I segreti del tech-debt sono separati correttamente. Nessun valore segreto nei documenti. |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Scelta dell'indirizzo | SHIP | Il BLOCKER è chiuso e la versione vecchia viene ancora presa dai test. MINOR sugli alias del loopback. |
| v2 | Credenziali in uscita | SHIP | Nessuna esposizione. NIT sui test dei log. |
| v3 | Segreti nei workflow | — | Non rilanciato: workflow invariati (SHIP al secondo giro). |
| v4 | Runbook G2 | SHIP | Le due MAJOR sono chiuse. Restano MINOR economiche da sistemare prima della sera di G2. |
| v5 | Parità e test | SHIP | Parità provata. MINOR su un'asserzione mancante. |
| v6 | Documenti | DO NOT SHIP | La frase di `AGENTS.md` è contraddetta per gli script senza `:dev`, e i fatti di Vercel non hanno l'output. |

### Human Review Checklist

Ognuno dei passi dice cosa va verificato e com'è il risultato giusto. I segreti si guardano solo per nome, mai i valori.

1. **Correggere il BLOCKER e la MAJOR di v6**, poi rifare v6:
   - la frase di `AGENTS.md` e il commento di `cronRequest.js`;
   - le righe di `vercel alias ls` e `vercel project ls` in `IMPLEMENTATION-NOTES.md`.
2. **Le MINOR del runbook prima della sera di G2:** branch vecchi, nuovo deploy, passo 8, query ripetuta prima del passo 5.
3. **Portare `fix/auth-check-token-vuoto` su `main` prima di G2**, con una PR e il deploy di prod, poi unire `main` in `dev`. Si verifica con i due `grep` del passo 1, mai con una richiesta a `crm.dbmito.it`.
4. **Branch vecchi:** cancellare o aggiornare i branch remoti che chiamano ancora `mito-deutsche.vercel.app`, prima di creare `CRON_SECRET_KEY` su GitHub.
5. **Segreto di prod.** `CRON_SECRET_KEY` su Vercel, solo Production, Sensitive (ora "Secret"), prima del merge del passo 4. Su GitHub si crea solo al passo 8.
6. **Merge di `chore/cron-indirizzo` in `dev` prima della sessione G2**, come merge commit e senza gli altri branch dello staging.
7. **G2 secondo il runbook**, compresa la query sugli alert chiusi dal sistema al passo 2.
8. **Telegram:** creare `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` su GitHub, oppure accettare che il messaggio non arrivi.
9. **Gate** da `AGENTS.md`: lint, `tsc`, test, build con i segnaposto.
10. **Mai eseguire gli script cron in locale** con `CRON_BASE_URL` o `GITHUB_ACTIONS` impostati, nella shell o nel `.env`.

### Notes for docs-maintenance

- Finding durevoli da portare in `tech-debt/platform/cron-base-url.md`, se rinviate:
  - i segreti Supabase nell'`env` in testa ai workflow;
  - i segreti Telegram mancanti;
  - i branch remoti con i workflow vecchi.
- Documenti da aggiornare all'ingest: `brain/chore/migration/fase-0/t5-ci-workflows.md:31`.
- Domain pages that should backlink this review: n/a (standalone).

---

## Secondo giro (2026-10-09, head `df8fcaa`)

### Verdict

**DO NOT SHIP** · impact: critical

Le correzioni del primo giro reggono quasi tutte:

- i segreti sono abbinati bene ai workflow e arrivano solo allo step dello script;
- in produzione non va nessun bypass;
- il redirect non porta via le credenziali;
- gli script si fermano prima di chiamare se manca l'indirizzo o il segreto;
- il runbook G2 controlla `dev` prima del merge e `main` dopo;
- i test coprono la precedenza su `NODE_ENV` e gli altri quattro script.

Restano tre problemi.

1. **`AGENTS.md` promette una cosa falsa.** Dice che un valore in `.env` o nella shell non può mandare gli script `:dev` in produzione. L'unico controllo però è `GITHUB_ACTIONS === "true"`, letto dopo `dotenv.config()`, quindi basta mettere `GITHUB_ACTIONS=true` nello stesso `.env` (riprodotto).
2. **Il runbook chiede di verificare la correzione di `authCheck` in produzione, ma non dice come.** Una prova dal vivo su `crm.dbmito.it` lancerebbe davvero il cron alert, oppure passerebbe per errore.
3. **Il controllo "il cron è già girato?" del passo 2 non vede tutti i casi.** Gli sfuggono le esecuzioni rosse o annullate, quelle oltre le ultime 20 e le chiamate fatte fuori dai workflow.

### Coverage

- Rubric passes run: 6/6
  - v1, v2, v3, v4: Opus (eredita il modello della sessione)
  - v5: Sonnet
  - v6: Haiku
- Passes skipped or failed: nessuno. Un primo lancio del classificatore si è fermato per un errore di rete ed è stato rilanciato.
- Evidenze raccolte da chi orchestra, fuori dai verificatori:
  - `vercel alias ls` (team `spatalos-projects`, 2026-10-09): `crm.dbmito.it` è un alias della stessa deployment di `mito-micro-services.vercel.app`, la produzione del progetto secondo `vercel project ls`;
  - `gh secret list` (solo nomi): `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`;
  - `gh variable list`: vuoto;
  - `origin/main` è `75a92e3` (PR1). PR2 è solo su `dev`.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v6 — documenti (CONTRADICTED); anche v1 (NIT) | `AGENTS.md:27`, `src/app/api/cron/scheduled/cronRequest.js:38-41` | La frase "a value in `.env` or in the shell can't send them to production" è falsa. L'unico controllo è `GITHUB_ACTIONS === "true"`, letto dopo `dotenv.config()`. Con un `.env` che contiene `GITHUB_ACTIONS=true` e `CRON_BASE_URL=https://crm.dbmito.it`, `NODE_ENV=development node update.js` chiama `https://crm.dbmito.it/api/cron/update` (riprodotto con `fetch` finto). Lo stesso vale per `act`. Nessun test copre `:dev` con GitHub Actions e un host remoto. | Leggere `GITHUB_ACTIONS` all'avvio di `cronRequest.js`: l'import statico viene valutato prima del `dotenv.config()` dello script, quindi il `.env` non conta più (v1). Riscrivere la frase di `AGENTS.md` con la condizione vera: lo decide l'ambiente del processo, che la shell può ancora impostare. Aggiungere un test. | no |
| MAJOR | v4 — runbook G2 | `brain/specs/crm/sezione-contatti/PLAN.md:603` | La precondizione su `authCheck` non si può verificare. Non ha comando, risultato atteso né "se no, fermarsi". Non dice come la correzione arriva in produzione: è sul branch locale `fix/auth-check-token-vuoto`, da `main`. Provarla su `crm.dbmito.it` è sbagliato in tutti e due i casi: con `Bearer  x` il cron alert gira davvero e chiude gli alert prima della pulizia; con `Bearer` e due spazi l'header viene accorciato a `Bearer` e risponde 401 anche con la falla. | `git show "<headSha>:src/app/api/_utils/auth.ts" \| grep -nF 'if (!token \|\| !secret) return unauthorized()'` deve trovare la riga, e `grep -cF 'split(" ")[1]'` deve dare 0. Oppure `git merge-base --is-ancestor <merge della correzione> <headSha>`. Aggiungere "se no, fermarsi" e "non verificarlo con una richiesta a `crm.dbmito.it`". Scrivere che la correzione va su `main` prima della sessione. | no |
| MAJOR | v4 — runbook G2 | `PLAN.md:623` | Lo stop "il cron è già girato" non vede tutti i casi. (a) Segnala i lanci a mano solo se `success`: anche uno rosso, annullato o in corso può aver chiuso alert, e lo dice lo stesso runbook (`:690-691`). (b) Non ha `-L`, quindi `gh` guarda le ultime 20 esecuzioni e quelle notturne saltate spingono fuori le più vecchie. (c) Non vede le chiamate fatte fuori dai workflow. | Aggiungere al passo 2, in sola lettura, `SELECT count(*), max(updated_at) FROM "mito-deutsche_alert" WHERE resolved_by = (SELECT id FROM "mito-deutsche_operator" WHERE user_id = 'system')` → 0 prima della migrazione. `-L 1000`. Fermarsi su ogni `workflow_dispatch` che non sia `failure`; per ogni `failure`, `gh run view <id> --log \| grep -c "Missing CRON_SECRET_KEY"` deve dare almeno 1. | no |
| MINOR | v1 — indirizzo | `cronRequest.js:33-36` | L'eccezione per `localhost` vale con ogni `NODE_ENV`. Gli script senza `:dev` accettano `http://localhost`, `http://127.0.0.1` e forme equivalenti (`0x7f000001`). Arriva solo in locale. | Eccezione solo con `NODE_ENV=development`. Test con `NODE_ENV=production` e `http://localhost:3000`. | no |
| MINOR | v1 — indirizzo; anche v2 (NIT) | `cronRequest.js:18,29,46-47` | Path, query, frammento e credenziali nell'URL passano. Con `https://host#` o `https://host?x=` la chiamata va a `/`. Così `delete`, `update`, `priority` e `cleanupTaskEventLog` finiscono verdi senza aver fatto niente. Con `user:pass@` l'errore di `fetch` stampa l'URL con la password. | Rifiutare `username`, `password`, `search`, `hash` e `pathname` diverso da `/`. Restituire `url.origin`. Aggiungere i test. | no |
| MINOR | v5 — parità | `cronRequest.js:68`, `alert.js:36-41` | Con `redirect: "error"`, un redirect diventa un errore di rete. `alert.js` lo riprova 20 volte, circa 200 s prima dell'uscita 1, anche se l'errore si ripete uguale. Prima usciva subito. | `redirect: "manual"`: undici restituisce il 3xx, che va nel ramo `< 500` ed esce subito senza seguire il redirect. Aggiungere un test. | no |
| MINOR | v2 — credenziali | `cronRequest.js:60-66` | Se il segreto di bypass contiene un CR o un LF in mezzo, `new Request` lancia un errore con il valore intero, e gli script lo stampano (fino a 20 volte in `alert.js`). Succede solo se il valore è stato incollato male. | Togliere gli spazi ai bordi e rifiutare i caratteri non validi con un messaggio fisso che nomina solo la variabile. Un valore fatto di soli spazi oggi conta come impostato. | no |
| MINOR | v3 — workflow; anche v4 | segreti del repository | `CRON_SECRET_KEY`, `STAGING_CRON_SECRET_KEY` e `VERCEL_AUTOMATION_BYPASS_SECRET` sono segreti del repository, senza `environment:`. Qualunque branch può lanciare "Update Alerts PROD" con i suoi script e il segreto di prod. Il repo è pubblico e `main` non è protetto. Sei branch remoti, e `dev` fino al merge, hanno ancora i workflow di prod che chiamano `mito-deutsche.vercel.app`: dopo il passo 8 un lancio a mano manderebbe a un'altra app un token firmato col segreto di prod. Non è una regressione. | Creare `CRON_SECRET_KEY` nell'environment GitHub `Production` (esiste già, senza regole) con policy di branch `main` e `environment: Production` nei quattro job di prod. Nel runbook: `gh secret set CRON_SECRET_KEY --env Production`. Oppure cancellare o aggiornare quei branch prima del passo 8. | no |
| MINOR | v4 — runbook | `PLAN.md:597-606, 627` | Al passo 3 il ricontrollo di `gh secret list`, della variabile su Vercel e di `authCheck` è solo implicito. Se il segreto c'è già, il runbook non dice cosa fare. | Una voce a parte al passo 1. Al passo 3 `gh secret list` esplicito, con "se c'è: `gh secret delete CRON_SECRET_KEY`, capire chi l'ha creato, controllare le esecuzioni". | no |
| MINOR | v4 — runbook | `PLAN.md:683` | Il controllo del deploy al passo 8 non è legato al merge del passo 4: manca `headSha`, manca lo stop per un deploy fallito o in corso, manca il controllo della "Current". `gh run rerun` funziona solo entro 30 giorni dal run, e il deploy parte solo con un push. | `--json headSha,status,conclusion` con `headSha` uguale a `git rev-parse origin/main`. "Fallito o in corso: non creare il secret". Fare il redeploy di `GIA_SU_MAIN` al passo 4, prima della migrazione, con un ripiego su Redeploy da Vercel. Scrivere il caso "`GIA_SU_MAIN` senza `chore/cron-indirizzo`". | no |
| MINOR | v4 — runbook | `PLAN.md:605` | "Finché manca, un lancio a mano si ferma prima di chiamare l'app" è vero (provato su `df8fcaa` e su `origin/main`), ma nessun test lo protegge: entrambi i file di test impostano il segreto. | Un test per script con `CRON_SECRET_KEY=""`: uscita 1 e nessuna `fetch`. | no |
| MINOR | v3 — workflow | gli 8 workflow, `env:` in testa (righe 4-6) | `NEXT_PUBLIC_SUPABASE_URL[_PROD]` e `SUPABASE_KEY[_PROD]` arrivano a tutti gli step, compreso `pnpm install`. Gli script non li leggono e i segreti oggi non esistono. Era già così. | Togliere le due righe, oppure segnarlo in tech-debt. | sì, se rinviato |
| MINOR | v6 — documenti | `brain/tech-debt/crm/sezione-contatti.md:83-92`, `IMPLEMENTATION-NOTES.md:138-144` | Sei frasi da correggere: (1) "senza i segreti lo script si ferma" è falso per il bypass, perché senza bypass lo script chiama lo staging e fallisce sulla protezione; (2) `brain/chore/staging-vercel.md` arriva solo con un branch successivo; (3) il nome del branch `chore/cron-indirizzo` sparisce dopo il merge; (4) "un'altra app" è una deduzione, perché l'output dice solo "non è un alias del team"; (5) "assente anche fra le variabili Production di Vercel" non cita il comando; (6) non si dice se `CRON_SECRET_KEY` sia mai esistito. Se è esistito, è stato mandato a `mito-deutsche.vercel.app` e va ruotato. | Correggere le frasi. Citare gli SHA (`d8ffadb`, `df8fcaa`). Annotare il rimando "in arrivo con `chore/staging-vercel`". Aggiungere una riga sulla rotazione. | no |
| NIT | v5 — test | `_test/alert.test.ts`, `_test/cronScripts.test.ts` | 4 mutanti su 52 sopravvivono: l'https saltato con GitHub Actions, `includes("localhost")`, `127.0.0.1` tolto, `.trim()` tolto. `NODE_ENV` non è fissato nei `beforeEach`: con `vitest` lanciato a mano e `NODE_ENV=development` falliscono 28 test su 38. Il gate non è toccato. | Aggiungere i quattro casi e `vi.stubEnv("NODE_ENV", "test")`. | no |
| NIT | v1 — indirizzo | `cronRequest.js:19-24, 38` | In GitHub Actions, un `:dev` senza `CRON_BASE_URL` ripiega su `localhost` del runner, e `alert.js` riprova 20 volte. Il controllo sull'host remoto vale solo con `NODE_ENV` esattamente `development`. | In GitHub Actions un indirizzo mancante è un errore. | no |
| NIT | v2 — credenziali | test | Nessun test controlla che l'output non contenga il token o il bypass. Gli altri quattro script controllano solo il prefisso `Bearer`. | Un test con risposta 401 e `fetch` rifiutata. | no |
| NIT | v4 — runbook | `PLAN.md:601-605, 630, 683, 797-798` | Manca "se manca, fermarsi" in tre voci. Il merge di `chore/cron-indirizzo` deve essere un merge commit, perché uno squash fa scattare lo stop (lato sicuro). In T2.6, "Dal 2026-10-09 tutti chiamano `CRON_BASE_URL`" vale solo per i ref che hanno il branch, e "il lancio a mano funziona sempre" contraddice `:605`. Su Vercel, segnare la variabile come Sensitive. | Correggere il testo. | no |
| NIT | v3, v4 — fuori dal mandato | workflow, passo 9 | `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` non sono segreti del repository e `curl -s` esce con 0: il "messaggio Telegram è arrivato" del passo 9 non arriverà mai. Lo step Telegram mette i segreti dentro lo script invece di usare le variabili. `brain/chore/migration/fase-0/t5-ci-workflows.md:31` non è più aggiornato. | Creare i segreti Telegram o togliere quel controllo dal passo 9. | sì, se rinviato |

_"Durable?" = yes quando la finding non si corregge prima del ship e va portata in `tech-debt/` all'ingest._

### Esito delle finding del primo giro

| Finding del primo giro | Esito |
|------------------------|-------|
| BLOCKER: i lanci non prod diventano reali e il bersaglio dei dati dipende da Preview | **Spostato sullo staging.** Lo staging si ferma se DB o storage coincidono con quelli di prod (`chore/staging-vercel`). La review dello staging però trova che quel controllo non scatta con le variabili Sensitive. La checklist crea i segreti dei cron solo dopo un primo deploy dello staging riuscito. |
| `:dev` e `CRON_BASE_URL` da un `.env` locale | **Parziale.** Ora serve anche `GITHUB_ACTIONS=true`, ma si mette nello stesso `.env` (BLOCKER sopra). |
| Lo stop di G2 controlla `main` prima del merge | **Chiuso.** I `grep` distinguono `df8fcaa` da `2aaf3a8` (v4). |
| Il lancio a mano di prod diventa reale prima di G2 | **Chiuso.** Il segreto su GitHub si crea al passo 8, e senza segreto ogni script di prod si ferma prima della `fetch`, sia sull'head sia su `main` (v4). |
| Alias `*.vercel.app` di proprietà non provata | **Chiuso** per il nome: ora è `staging-crm.dbmito.it`. L'assegnazione al branch `dev` è nella review dello staging. |
| Il `CRON_SECRET_KEY` dello staging non è documentato | **Chiuso** in `brain/chore/staging-vercel.md` (branch successivo). |
| Nessuna prova che `crm.dbmito.it` sia del progetto | **Chiuso.** `vercel alias ls` lo mostra sulla deployment di produzione. |
| Nessun test sulla precedenza su `NODE_ENV` | **Chiuso.** Tutti i mutanti indicati muoiono (v5). |
| F18 e `PLAN.md:792` non aggiornati | **Chiuso.** Restano due frasi da correggere (v6). |
| MINOR: validazione dell'URL, test degli altri script, metodo e `Content-Type`, bypass nei test, segreti nell'`env` del workflow, "stesso valore", fonte delle osservazioni | **Chiusi**, con le nuove MINOR su path e query dell'URL e la fonte di una sola osservazione. |
| MAJOR già presente: `authCheck` con token vuoto | **Corretto** su `fix/auth-check-token-vuoto` (`ef3b5d6`, da `main`). Un verificatore separato: SHIP, 17 test, la versione vecchia ne fallisce 3. Da portare in produzione prima di G2. |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — indirizzo | Senza indirizzo, con un indirizzo vuoto o fatto di sole `/`, tutti e 5 gli script escono con 1 prima della `fetch`. Rifiutati: http remoto, `ftp`, `wss`, `file`, senza schema, non validi. Lo host controllato è sempre quello chiamato, su circa 45 input. Il confronto con `localhost` è esatto: `localhost.`, `[::1]`, `nip.io` e i trucchi con le credenziali sono rifiutati. Test 38/38. |
| v2 — credenziali | Il formato `Bearer` corrisponde ad `authCheck`. Il bypass parte solo se impostato e la prod non lo imposta mai. `redirect: "error"` è provato su 301, 302, 303, 307 e 308 fra due origini, e niente arriva alla seconda: con `follow` il bypass passerebbe. `Cron target` stampa solo l'origine. Il JWT è HS256, scade in 5 minuti e si firma nuovo a ogni chiamata, con un segreto diverso per ambiente. |
| v3 — workflow | I quattro workflow di prod e i quattro non prod sono abbinati esattamente, verificato leggendo il YAML delle due revisioni. Un solo step per file riceve i segreti dei cron. `on`, `schedule` e la guardia `ALERT_CRON_ENABLED` sono identici byte per byte. `GITHUB_ACTIONS` arriva allo script attraverso pnpm. Con un segreto mancante lo script si ferma prima della `fetch`. |
| v4 — runbook | L'ordine è giusto: variabile su Vercel prima del passo 4, deploy, poi segreto su GitHub, poi lancio. Un ordine sbagliato fallisce sul lato sicuro (401, `alert.js` esce). I `grep` distinguono le due revisioni. I file attesi al passo 4 sono esattamente i 18 di PR2 più i 17 del branch. Prima del passo 8 nessun workflow di prod, su nessun ref, può chiamare la produzione. |
| v5 — parità e test | Il ciclo di `alert.js` è identico byte per byte e nei quattro script il ramo `!response.ok` → uscita 1 è invariato. In `alert.test.ts` niente è stato tolto. 48 mutanti su 52 muoiono, compresi tutti quelli indicati. Lint, `tsc`, 134 test e il build sono verdi. |
| v6 — documenti | I workflow corrispondono a quanto scritto in tech-debt. Senza indirizzo gli script senza `:dev` si fermano. In locale il default è `localhost`. La storia della base è corretta. L'alias di `crm.dbmito.it` è stato verificato dal vivo. Nessun valore segreto nei documenti. |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Scelta dell'indirizzo | SHIP | Le due proprietà che proteggono la prod reggono. Due MINOR: `localhost` fuori da `development`, e path o query nell'URL. |
| v2 | Credenziali in uscita | SHIP | Nessuna esposizione bloccante. MINOR sul bypass malformato stampato. |
| v3 | Segreti nei workflow | SHIP | Abbinamenti esatti. MINOR sui segreti del repository invece che dell'environment. |
| v4 | Runbook G2 | DO NOT SHIP | La precondizione su `authCheck` non si può verificare. Lo stop "già girato" ha dei buchi. |
| v5 | Parità e test | SHIP | Parità provata. MINOR sui tentativi ripetuti dopo un redirect. |
| v6 | Documenti | DO NOT SHIP | La garanzia di `AGENTS.md` sul `.env` è contraddetta dal codice. |

### Human Review Checklist

Ognuno dei passi dice cosa va verificato e com'è il risultato giusto. I segreti si guardano solo per nome, mai i valori.

1. **Correggere il BLOCKER e le due MAJOR**, poi rifare v1, v4 e v6:
   - `GITHUB_ACTIONS` letto prima di `dotenv`, più il test;
   - la frase di `AGENTS.md`;
   - il controllo su `authCheck` con lo SHA;
   - lo stop "già girato", con la query sul DB.
2. **Portare `fix/auth-check-token-vuoto` su `main` prima di G2**, con una PR verso `main` e il deploy di prod. Poi unire `main` in `dev`.
   - Si verifica con il `git show <headSha>:src/app/api/_utils/auth.ts | grep` del passo 1.
   - Mai con una richiesta a `crm.dbmito.it`.
3. **E2.** Capire di chi è `mito-deutsche.vercel.app`, quale DB usa, e se `CRON_SECRET_KEY` sia mai esistito su GitHub. Se è esistito, è stato mandato a quell'app e va ruotato.
4. **Segreto di prod.** `CRON_SECRET_KEY` su Vercel, solo Production, segnato come Sensitive, prima del merge del passo 4.
   - Su GitHub, meglio nell'environment `Production` con policy di branch `main`: in quel caso, aggiungere `environment: Production` ai quattro job di prod.
   - In ogni caso, va creato solo al passo 8.
5. **Merge di `chore/cron-indirizzo` in `dev` prima della sessione G2**, come merge commit e senza gli altri branch dello staging, che vanno dopo.
6. **G2 secondo il runbook corretto**, controllando al passo 2 la query sugli alert chiusi dal sistema.
7. **Cron dello staging:** i segreti si creano solo dopo che lo staging è attivo, seguendo `brain/chore/staging-vercel.md`.
8. **Telegram:** creare `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` su GitHub, oppure togliere dal passo 9 il controllo del messaggio.
9. **Gate** da `AGENTS.md`:
   - `SKIP_ENV_VALIDATION=true pnpm exec next lint`
   - `pnpm exec tsc --noEmit`
   - `pnpm run test --run`
   - build con `SKIP_ENV_VALIDATION=true` e i segnaposto Supabase
10. **Mai eseguire gli script cron in locale** con `CRON_BASE_URL` o `GITHUB_ACTIONS` impostati, nella shell o nel `.env`.

### Notes for docs-maintenance

- Finding durevoli da portare in `tech-debt/platform/cron-base-url.md`, se rinviate:
  - i segreti Supabase nell'`env` in testa ai workflow;
  - i segreti Telegram mancanti.
- Documenti da aggiornare all'ingest: `brain/chore/migration/fase-0/t5-ci-workflows.md:31`.
- Domain pages that should backlink this review: n/a (standalone).

---

## Primo giro (2026-10-09, head `dc4468d`)

Verdetto: **DO NOT SHIP**, critical. 6 verificatori: 1 BLOCKER, 8 MAJOR, più 1 MAJOR già presente (`authCheck`). L'esito di ciascuna finding è nella tabella "Esito delle finding del primo giro"; il dettaglio originale segue.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| BLOCKER | v3 — bersaglio e dati | `.github/workflows/{update-alert,priority,delete-storage,update-customer-practices}.yml:9` | I lanci non prod oggi falliscono su `localhost` (F18, "Effetto oggi: nessuno"). Dopo il commit chiamano lo staging, e cosa toccano dipende solo dalle variabili Preview su Vercel. Lo storage non è mai stato separato: `delete/route.ts:9-12` usa `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_KEY` così come sono. Il primo "Delete Supabase Storage" di sviluppo svuoterebbe `mito-storage/export` di chi sta dietro quelle variabili. L'unica istruzione per mettere i valori di sviluppo è una casella vuota in un altro branch (`staging-vercel.md:22-29`). Evidenza di chi orchestra: al 2026-10-08 Preview non ha variabili dell'utente. Oggi il rischio non c'è (il build dello staging fallirebbe la validazione), ma niente impedisce di impostarle male. | Prima di creare `STAGING_CRON_SECRET_KEY` e `VERCEL_AUTOMATION_BYPASS_SECRET` su GitHub: verificare che DB e storage in Preview, compresi eventuali override del branch `dev`, siano del progetto di sviluppo (E3). Scriverlo come precondizione nella checklist. | no |
| MAJOR | v1 — host nel codice; anche v3, v6 | `src/app/api/cron/scheduled/cronRequest.js:10-12`, `AGENTS.md:26` | `CRON_BASE_URL` vince su `NODE_ENV`, e ogni script chiama prima `dotenv.config()`. Un `CRON_BASE_URL` in un `.env` locale o nella shell manda gli script `:dev`, compresi `delete:export:dev` e `clean:task-event-log:dev`, verso qualsiasi host, produzione inclusa (provato). Prima del commit `:dev` andava sempre su `localhost`. Nessun log mostra l'host. `AGENTS.md:26` protegge la produzione col nome dello script, quindi ora inganna. | Accettare un host non locale con `NODE_ENV=development` solo se `GITHUB_ACTIONS=true`, oppure script `:staging` e `:dev` fermo su `localhost`. In ogni caso: stampare l'host prima della prima chiamata e correggere `AGENTS.md` (gli script cron chiamano `CRON_BASE_URL`, non il DB). | no |
| MAJOR | v6 — runbook; anche v3 | `brain/specs/crm/sezione-contatti/PLAN.md:601` (passi 1 e 3) | Lo stop "se il file su `main` non ha `CRON_BASE_URL`, fermarsi" scatta a ogni esecuzione corretta: `main` riceve il file solo con il merge del passo 4. Dopo il merge nessuno lo ricontrolla. La conseguenza descritta è sbagliata: senza la variabile gli script nuovi si fermano, non chiamano mito-deutsche. | Ai passi 1 e 3 controllare `origin/dev`. Ricontrollare `origin/main` subito dopo il merge, prima della migrazione. Correggere la conseguenza. | no |
| MAJOR | v3 — bersaglio e dati | `PLAN.md:602`, `PLAN.md:620`, `PLAN.md:445` | Il passo 1 chiede di creare `CRON_SECRET_KEY` su GitHub prima della sessione. Da quel momento un lancio a mano di "Update Alerts PROD" fa girare davvero il cron alert di PR1 su prod, che `PLAN.md:445` vieta prima di PR2 (chiude alert scaduti, irreversibile). Il controllo del passo 2 guarda solo `--event schedule`. Il lancio a mano può partire da qualunque branch pushato con questo commit. | Controllare anche i run `workflow_dispatch` dalla creazione del segreto. Meglio: creare `CRON_SECRET_KEY` su GitHub durante la sessione, subito prima del passo 8, oppure in un GitHub Environment limitato a `main` con revisore. | no |
| MAJOR | v2 — segreti; anche v3 | workflow non prod `:9-10` | Il bypass, segreto di progetto che apre la Deployment Protection di tutte le deployment, e un JWT di staging vanno a `mito-micro-services-staging.vercel.app`. È un nome `*.vercel.app`, del primo che lo prende, e in questo commit nessuno lo assegna al progetto: lo fa `deploy-staging.yaml` nel branch `chore/staging-vercel`, che non è un antenato. È già successo con `mito-deutsche.vercel.app`. Mitigazione: i workflow non prod partono solo a mano. | Unire dopo `chore/staging-vercel`. Prima del primo lancio non prod: verificare che l'alias sia fra i domini del progetto, su una deployment Preview (E6). Creare i segreti solo dopo. | no |
| MAJOR | v3 — bersaglio e dati; anche v2 | `brain/chore/staging-vercel.md:22-29` (altro branch), `PLAN.md:602` | Il "`CRON_SECRET_KEY` proprio" dello staging non è documentato. La lista Preview non lo nomina, nessun passo dice di generarlo a parte, di tenere quello di prod solo in Production o come creare `VERCEL_AUTOMATION_BYPASS_SECRET`. `authCheck` accetta qualunque JWT `role: "cronjob"` firmato con la chiave, senza audience né host. Con un solo valore per Production e Preview, i token dello staging valgono anche in prod. | Passo in checklist: `openssl rand -base64 32`, poi lo stesso valore come `CRON_SECRET_KEY` solo Preview su Vercel e come `STAGING_CRON_SECRET_KEY` su GitHub, mai condiviso con Production. Passo per il bypass (Vercel → Deployment Protection → Protection Bypass for Automation → segreto GitHub). | no |
| MAJOR | v3 — bersaglio e dati | workflow prod `:9` | Nel repo non c'è prova che `crm.dbmito.it` sia di questo progetto. `brain/chore/migration/attivita-manuali-provider.md:47,57` e `fase-5-cutover.md:23` dicono che prod non ha un dominio custom. Il repo nasce come clone di un'altra app di prod (229da69). Il controllo dei domini di G2 copre solo il workflow alert. | E1 nella checklist umana, con l'esito scritto nel repo. Aggiornare i due documenti di migrazione. | no |
| MAJOR | v5 — parità e test | `src/app/api/cron/scheduled/_test/alert.test.ts:299-305` | Nessun test verifica che `CRON_BASE_URL` vinca su `NODE_ENV=development`, cioè l'unico contratto su cui si reggono i quattro workflow di staging. Invertendo i due controlli in `cronRequest.js`, 20/20 test passano lo stesso (mutante provato). | Test con `NODE_ENV=development` e `CRON_BASE_URL=https://staging.example` che si aspetta `https://staging.example/api/cron/alert`. | no |
| MAJOR | v6 — runbook; anche v1, v3 | `brain/tech-debt/crm/sezione-contatti.md:81-89`, `PLAN.md:792` | F18 dice che `update-alert.yml` chiama `localhost` e che "`update-alert prod.yml` è corretto". Dopo il commit la prima affermazione è falsa e la seconda lo era già. `PLAN.md:792` ripete "fallisce sempre". | Riscrivere o chiudere F18. Quel che resta è la dipendenza dai segreti di staging e dalla chiave di Preview. Allineare `PLAN.md:792`. | no |
| MINOR | v1 — host; anche v5 | `cronRequest.js:11` | Nessuna validazione dell'URL. `"/"` dà `""` e salta sia l'errore sia `localhost`. Uno spazio o un valore senza schema fanno fallire `fetch`, e `alert.js` lo prende per errore di rete: 20 tentativi da 10 s, circa 200 s. Viene accettato anche `http://`, quindi Bearer e bypass viaggerebbero in chiaro. | Togliere prima le barre, poi controllare il vuoto; `new URL()`; `https:` obbligatorio tranne che per `localhost`. | no |
| MINOR | v1, v5 — test | `src/app/api/cron/scheduled/{update,delete,priority,cleanupTaskEventLog}.js` | Il nuovo modo di fallire è provato solo passando da `alert.js`. Dalla lettura e dall'harness differenziale di v5 il collegamento negli altri quattro risulta corretto. | Almeno un test di chiusura per `delete.js` e `cleanupTaskEventLog.js`, che cancellano dati. Rinviabile. | sì, se rinviato |
| MINOR | v5 — test | `alert.test.ts` | Nessuna asserzione su metodo e `Content-Type`; il token è controllato solo per il prefisso. I mutanti che li cambiano passano. | Asserirli e verificare il JWT con `jsonwebtoken.verify`. | no |
| MINOR | v5 — test | `alert.test.ts:275-282` | Il caso "senza bypass" non azzera `VERCEL_AUTOMATION_BYPASS_SECRET`: con la variabile esportata nella shell la suite diventa rossa (provato). | `vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "")` in `beforeEach`. | no |
| MINOR | v2 — segreti; anche v4 (NIT) | workflow non prod `:7-10` | Segreti nell'`env` del workflow: li leggono anche le action di terzi e gli script di `pnpm install`. Lo schema esisteva già, il commit lo estende a un segreto nuovo. | Spostare `CRON_SECRET_KEY`, `CRON_BASE_URL` e `VERCEL_AUTOMATION_BYPASS_SECRET` nell'`env` dello step "Run". | no |
| MINOR | v6 — runbook; anche v3 | `PLAN.md:602` | "con lo stesso valore" non si può verificare: `gh secret list` e `vercel env ls` mostrano i nomi. `vercel env ls` potrebbe mostrare in chiaro le variabili di tipo plain (non verificato). La 401 descritta arriva solo se il valore su Vercel manca o è diverso; se manca su GitHub, lo script si ferma prima. | Dire che i comandi verificano solo l'esistenza; impostare entrambi dallo stesso valore appena generato; usare solo la colonna dei nomi (`awk '{print $1}'`) o la dashboard; correggere la descrizione. | no |
| MINOR | v6 — runbook | `PLAN.md:601-602` | Le osservazioni datate 2026-10-08 (mito-deutsche è un'altra build; `CRON_SECRET_KEY` manca) non hanno fonte nel repo. | Registrarle in `IMPLEMENTATION-NOTES.md`, con come sono state ottenute. | no |
| MINOR | v3 — bersaglio e dati | `updatePractices.ts:28-35`, `updateCustomer.ts:16-21` | Se la vecchia app su `mito-deutsche.vercel.app` usa ancora il DB di prod e qualcosa chiama ancora i suoi cron, accendere questi raddoppia `update`, che non è idempotente (`rate_pagate` +1, `age` +1). | E2 nella checklist umana. | no |
| NIT | v2 | `alert.js:22-25` | Una chiamata Telegram commentata stamperebbe token e segreto, se qualcuno la riattivasse. | Cancellarla. | no |
| NIT | v2 | `cronRequest.js:24-30`, le 5 `fetch` | L'header di bypass parte verso qualunque host. `fetch` segue i redirect e non toglie gli header custom. | Header solo per l'host di staging; `redirect: "error"`. | no |
| NIT | v4, v5, v6 | `.env.example`, `PLAN.md:601` | `.env.example` non documenta `CRON_BASE_URL`, `CRON_SECRET_KEY` e `VERCEL_AUTOMATION_BYPASS_SECRET`. Il runbook nomina solo `update-alert prod.yml`, ma anche gli altri tre workflow di prod hanno cambiato bersaglio. | Documentarli. | no |
| NIT | v4, v5 | `priority.yml`, `alert.js:76-80`, `alert.test.ts:266-271` | Spazi finali tolti; l'ordine dei controlli cambia solo il messaggio; un cast evitabile. | Facoltativo. | no |
| MAJOR (già presente, fuori dalla diff) | v2; confermato da chi orchestra | `src/app/api/_utils/auth.ts:15-43` | `Authorization: Bearer  x` (due spazi) dà `token === ""`. L'`if (token)` viene saltato e si arriva al `return null` finale, che i chiamanti leggono come "autorizzato". Sono aperte senza sessione 15 route: i 5 cron (cancellano storage e log, incrementano rate ed età), `import/**` e `export/**`. Il commit non la crea e non la peggiora, ma mette in moto i cron di prod. | Correggere a parte: chip "Fix the empty-token bypass in authCheck". Registrarla in `tech-debt/`. | sì |

_"Durable?" = yes quando la finding non si corregge prima del ship e va portata in `tech-debt/` all'ingest._

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — host nel codice | `CRON_BASE_URL` vince su `NODE_ENV`. Valore assente o vuoto fuori da `development`: errore prima di `jwt.sign` e `fetch`, uscita 1 (provato con valori finti). Barre finali tolte e percorsi uniti correttamente. Nessun riferimento a `mito-deutsche.vercel.app` nel codice. Gli script non leggono altri file env oltre a `.env`. Test 20/20, `tsc` ed `eslint` puliti. |
| v2 — segreti | I segreti non si incrociano fra prod e non prod. Il bypass parte solo se impostato e la prod non lo imposta. Nessuno script stampa token, segreti o header. Il token rispetta `authCheck`, che non cambia. Non c'è più il vecchio fallback, che mandava il token di prod a un'altra app. |
| v3 — bersaglio e dati | La prod non va mai sullo staging. Il cablaggio non prod è quello voluto. Mappa di cosa modifica ogni route. Schedule invariati (solo `update-alert prod.yml`, dietro `ALERT_CRON_ENABLED`). Confermato che prima i workflow non prod chiamavano `localhost`. Senza segreto nessuna chiamata. |
| v4 — struttura dei workflow | Gli 8 file si leggono come YAML valido. Il diff strutturale rispetto alla base contiene solo le variabili previste. Le coppie prod/non prod sono simmetriche. Script e ambiente corrispondono (prod senza `:dev`, non prod con `:dev`). Schedule, gate e Telegram invariati. `node-version-file` mantenuto. |
| v5 — parità e test | Lint, `tsc`, 116 test e build passano. Confronto fra base e head sui 5 script in 4 scenari (200, 401, 500, errore di rete): uguali tranne host e bypass. Loop e codici d'uscita invariati. Le asserzioni esistenti non sono toccate. La regola Effect non si applica a questi script di bordo. |
| v6 — runbook | I valori dei workflow corrispondono all'intento. `gh secret list` stampa solo nomi. Nessun altro documento in `brain/` indica mito-deutsche come bersaglio dei cron. L'elenco degli script di prod in `AGENTS.md` corrisponde a `package.json`. |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Host nel codice | DO NOT SHIP | Più sicuro della base nei casi normali, ma `:dev` + `CRON_BASE_URL` locale arriva in prod e `AGENTS.md` non lo dice. |
| v2 | Segreti | DO NOT SHIP | Il codice è corretto. Nessuna prova che l'alias di staging sia del progetto prima di mandargli il bypass. |
| v3 | Bersaglio e dati | DO NOT SHIP | Non è provato che i dati dello staging non siano di prod. Il lancio a mano di prod diventa reale prima di G2. Nessuna prova di proprietà di `crm.dbmito.it`. |
| v4 | Struttura dei workflow | SHIP | Diff identica all'intento, due NIT. |
| v5 | Parità e test | SHIP | Parità provata. Lacuna MAJOR nei test sulla precedenza. |
| v6 | Runbook e conoscenza | DO NOT SHIP | Lo stop di G2 controlla il branch sbagliato; F18 è falso. |

### Human Review Checklist

Ognuno dei passi 2–6 dice cosa va verificato e com'è il risultato giusto. I segreti si guardano solo per nome, mai i valori.

1. **Correggere le finding BLOCKER e MAJOR del codice e del runbook**, poi rifare la review: precedenza e test, `AGENTS.md:26`, stop di G2, F18, run `workflow_dispatch`, checklist dei segreti di staging.
2. **E1.** Vercel → progetto `mito-micro-services` → Settings → Domains.
   - `crm.dbmito.it` è Valid e assegnato a Production, senza branch e senza redirect.
   - Compare fra i domini della deployment Production corrente.
   - Annotare l'esito nel runbook.
3. **E2.** Capire di chi è `mito-deutsche.vercel.app`, quale DB e storage usa, e se qualcosa chiama ancora i suoi `/api/cron/*` (workflow del vecchio repo, cron di Vercel).
   - Se usa il DB di prod e gira ancora, va spento prima di accendere questi cron.
4. **E3.** Vercel → Settings → Environment Variables → Preview, compresi gli override del branch `dev`.
   - `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_KEY` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` puntano al progetto Supabase di sviluppo.
   - Nessuna è condivisa con Production.
5. **E4.** `CRON_SECRET_KEY` su Vercel è in due voci separate: una solo Production, una solo Preview, con valori generati separatamente.
   - Su GitHub: `CRON_SECRET_KEY` = quella di Production, `STAGING_CRON_SECRET_KEY` = quella di Preview.
   - Impostare ogni coppia dallo stesso valore appena generato. Non confrontare stampando.
6. **E5–E6.**
   - Protection Bypass for Automation attivo, con il valore in `VERCEL_AUTOMATION_BYPASS_SECRET` su GitHub.
   - `crm.dbmito.it` non protetto, altrimenti i cron di prod ricevono 401.
   - Dopo il merge di `chore/staging-vercel` e un push su `dev`, `mito-micro-services-staging.vercel.app` è un alias del progetto su una deployment Preview costruita dopo E3.
7. **Ordine.**
   - Unire `chore/cron-indirizzo` in `dev` dopo G2 e dopo `chore/staging-vercel`.
   - Creare `STAGING_CRON_SECRET_KEY` e `VERCEL_AUTOMATION_BYPASS_SECRET` su GitHub solo dopo E3, E4 ed E6.
   - Creare `CRON_SECRET_KEY` su GitHub il più tardi possibile.
8. **G2.** Fra la creazione di `CRON_SECRET_KEY` e la migrazione di PR2 nessun run riuscito, né `schedule` né `workflow_dispatch`, dei workflow di prod (`gh run list --workflow "Update Alerts PROD"`, ecc.).
9. **G3.** Decidere se i segreti di prod vanno limitati a `main` con un GitHub Environment: oggi qualunque branch può lanciare i workflow di prod.
10. **Gate locali** prima del merge (da `AGENTS.md`):
    - `SKIP_ENV_VALIDATION=true pnpm exec next lint`
    - `pnpm exec tsc --noEmit`
    - `pnpm run test --run`
    - build con `SKIP_ENV_VALIDATION=true` e i segnaposto Supabase
11. **Mai eseguire gli script cron in locale**, nemmeno `:dev`, con un `CRON_BASE_URL` impostato nella shell o in `.env`.

### Notes for docs-maintenance

- Finding durevoli da portare in `tech-debt/platform/cron-base-url.md`:
  - la falla di `authCheck` con token vuoto (finché la chip dedicata non è unita);
  - i test mancanti sugli altri quattro script, se rinviati.
- Finding da riflettere in `tech-debt/crm/sezione-contatti.md`: F18 da riscrivere o chiudere.
- Documenti da aggiornare all'ingest:
  - `brain/chore/migration/attivita-manuali-provider.md:47,57` e `brain/chore/migration/fase-5-cutover.md:23` (dominio di prod);
  - `PLAN.md:792`.
- Domain pages that should backlink this review: n/a (standalone).

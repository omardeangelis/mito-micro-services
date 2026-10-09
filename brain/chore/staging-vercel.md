---
domain: platform
title: Staging su Vercel
type: checklist-operativa
status: in_progress
last_updated: 2026-10-09
---

# Staging su Vercel

Due progetti Vercel, nel team `spatalos-projects`:

- **Produzione:** progetto `mito-micro-services`, branch `main`, dominio `crm.dbmito.it`. Lo pubblica `.github/workflows/deploy-production.yaml`.
- **Staging:** progetto `staging-mito-micro-services` (secret GitHub `VERCEL_STAGING_PROJECT_ID`), branch `dev`, dominio `staging-crm.dbmito.it`. Lo pubblica `.github/workflows/deploy-staging.yaml`.

Lo staging è una deployment di Preview del suo progetto: prende le variabili Preview di quel progetto e ha `VERCEL_ENV=preview`. I due progetti non condividono variabili, domini né protezione. `vercel.json` spegne i deploy da Git, e pubblicano solo i due workflow.

Questo documento sostituisce, per lo staging, il piano di migrazione che lo voleva su Railway (`brain/chore/migration/`).

## Come si comporta lo staging

- **Deploy:** ogni push su `dev` lancia `deploy-staging.yaml`. Il workflow fa build e deploy con la CLI nel progetto di staging, e sposta `staging-crm.dbmito.it` sulla nuova deployment. I test non girano prima: `ci.yml` gira sulle PR.
- **Controlli del workflow:** si ferma prima del build se:
  - `VERCEL_STAGING_PROJECT_ID` manca o è uguale a `VERCEL_PROJECT_ID`;
  - secondo l'API di Vercel, il progetto di staging:
    - non protegge "All Deployments" con Vercel Authentication;
    - è collegato a Git;
    - non ha il dominio `staging-crm.dbmito.it`, o il dominio fa un redirect;
  - `vercel pull` non ha scritto `VERCEL_ENV="preview"`, o fra le variabili di Preview c'è `SKIP_ENV_VALIDATION`;
  - lo staging userebbe il progetto Supabase di produzione. Il progetto si riconosce dall'host di `NEXT_PUBLIC_SUPABASE_URL` (`https://<progetto>.supabase.co`). Il workflow legge Production dal progetto di prod, e Preview dal progetto di staging, con gli override del branch `dev` e senza. Il progetto di Preview deve essere diverso da quello di Production, e `SUPABASE_DB_CONNECTION_STRING` di Preview deve avere il progetto di Preview nell'host (`db.<progetto>.supabase.co`) o nell'utente del pooler (`postgres.<progetto>`), e non quello di Production;
  - in Preview mancano `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW`, `NEXT_PUBLIC_SUPABASE_URL` o `SUPABASE_KEY`, oppure `SUPABASE_DB_CONNECTION_STRING` è di tipo Secret, e il workflow non la può leggere.

  Il workflow non stampa nessun valore. Il controllo copre il database e lo storage, e conta sul fatto che ogni ambiente li tenga in un solo progetto Supabase (vero al 2026-10-09 per sviluppo e produzione). Non guarda gli altri segreti (`NEXTAUTH_SECRET`, `AZURE_AD_CLIENT_SECRET`, `CRON_SECRET_KEY`): che siano diversi da prod lo garantiscono il punto 4 qui sotto e i passi dei cron.

  I controlli girano solo nel workflow. Una deployment fatta in un altro modo, come Redeploy dalla dashboard o `vercel` a mano, non ci passa: per questo il progetto di staging resta scollegato da Git.
- **Login:** entrano solo gli utenti già nel database, con la stessa email (anche nelle maiuscole), e gli indirizzi di `AUTH_ALLOWED_EMAILS` che nel database non ci sono. Si entra con Azure o con il link via email (SendGrid). In produzione resta solo Azure, senza filtro.
  - Con Azure, un utente del DB entra solo se il suo account `azure-ad` è già collegato nel DB di sviluppo. Altrimenti NextAuth risponde `OAuthAccountNotLinked` e non lo collega da solo; con il link via email entra comunque.
  - NextAuth porta in minuscolo l'indirizzo digitato per il link via email.
- **Sentry:** non riceve niente. Lo staging non manda eventi, non carica source map, non crea release e non apre la route `/monitoring`. Lo fa solo la deployment con `VERCEL_ENV=production`.
- **Database:** è il progetto Supabase di sviluppo, lo stesso del locale. Un DB nuovo non va bene: le migrazioni non ricostruiscono lo schema (vedi [[tech-debt/crm/sezione-contatti]]).
- **Mai "Promote to Production" né Redeploy dalla dashboard** su una deployment dello staging. È buildata come Preview: login filtrato, niente Sentry, e l'URL dello storage di sviluppo dentro il bundle. Un nuovo deploy dello staging si fa con un push su `dev`, o rilanciando l'ultimo run di `deploy-staging.yaml`.

## Prima del merge su `dev`

Il merge su `dev` fa subito il deploy. Questi passi vanno fatti prima, in quest'ordine. Le variabili si guardano solo per nome, mai i valori. Dove non è scritto altro, è il progetto `staging-mito-micro-services`.

1. [ ] **Settings → Build and Deployment → Node.js Version:** 22.x, come `engines.node` in `package.json` e il progetto di prod. Al 2026-10-09 il progetto di staging dice 24.x.
2. [ ] **Settings → Git:** nessun repository collegato. Se c'è, Disconnect. Il workflow si ferma finché è collegato, perché un deploy da Git salterebbe i suoi controlli.
3. [ ] **Settings → Environment Variables:** "Enable access to System Environment Variables" è attiva. Senza, `vercel pull` non scrive `VERCEL_ENV` e il workflow si ferma.
4. [ ] **Stessa pagina, ambiente Preview.** Oggi le variabili stanno in Development, che le deployment non usano mai: serve solo a `vercel dev` e `vercel env pull`. Aggiungere Preview a ognuna. Prima, filtrare su Preview e guardare che non ci siano già voci con valori di prod.
   - `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW`: il DB di sviluppo, da `.env.development.local`. `SUPABASE_DB_CONNECTION_STRING` va salvata come Config, non Secret: il workflow la legge per riconoscere il progetto. Le altre possono essere Secret.
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: lo storage di sviluppo, da `.env.development.local`, nello stesso progetto del DB. L'URL è nella forma `https://<progetto>.supabase.co`, senza spazi. Il workflow non controlla la chiave anon, ma l'export la usa.
   - `NEXTAUTH_SECRET`: un valore nuovo (`openssl rand -base64 32`).
   - `AUTH_ALLOWED_EMAILS`: `info@sevedemo.com,info@spatalo.tech`.
   - `AZURE_AD_CLIENT_ID`, `AZURE_AD_TENANT_ID`: l'unica eccezione, quelli dell'app di prod, perché lo staging usa la stessa app di Entra. `AZURE_AD_CLIENT_SECRET`: un client secret nuovo della stessa app, solo per lo staging (vedi [[chore/migration/attivita-manuali-provider]]).
   - `SENDGRID_USERNAME`, `SENDGRID_API_KEY`, `SENDGRID_SERVER`, `SENDGRID_PORT`: servono agli indirizzi `info@`, che entrano con il link via email.
   - Mai in Preview: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `NEXTAUTH_URL`, `NODE_ENV`, `NEXT_PUBLIC_VERCEL_ENV`, `SKIP_ENV_VALIDATION`, `PREVIEW_DB`, `PREVIEW_DB_PSW`.
   - Nessun override del branch `dev`: Preview vale per tutti i branch.
   - Production del progetto di staging resta vuota. Una deployment di Production lì fallirebbe il build, invece di partire con valori sbagliati.
   - Non lanciare `vercel env pull` nella cartella del repo senza un file di destinazione: scriverebbe un file env che Next.js carica.
5. [ ] **Settings → Deployment Protection:** Vercel Authentication su "All Deployments". Protegge anche `staging-crm.dbmito.it`, e il workflow lo controlla.
6. [ ] **Dominio di staging.**
   - Se `staging-crm.dbmito.it` è stato aggiunto al progetto di prod, toglierlo da lì: un dominio sta in un solo progetto.
   - Progetto di staging → Settings → Domains: aggiungere `staging-crm.dbmito.it`, senza redirect.
   - DNS di `dbmito.it`: `staging-crm` CNAME verso il valore che Vercel indica.
   - Nel progetto di staging è un dominio di produzione. Il workflow lo sposta a ogni deploy sulla nuova deployment di Preview, e il progetto non ha deployment di Production: Git è scollegato e Production non ha variabili.
7. [ ] **Microsoft Entra → App registrations**, l'app il cui Application (client) ID è `AZURE_AD_CLIENT_ID`, **→ Authentication → Web.** Aggiungere le redirect URI che mancano:
   - `https://crm.dbmito.it/api/auth/callback/azure-ad`;
   - `https://staging-crm.dbmito.it/api/auth/callback/azure-ad`;
   - `http://localhost:3000/api/auth/callback/azure-ad`.

   Niente wildcard. NextAuth usa come callback l'host da cui si entra: dai link `*.vercel.app` generati da Vercel il login Azure non funziona, si passa sempre dal dominio.
8. [ ] **Utenti del DB di sviluppo:** controllare chi c'è in `mito-deutsche_user` (email e ruolo). Entreranno tutti nello staging, e ogni utente nuovo nasce ADMIN, per default del DB. Chi non deve entrare va tolto dal DB di sviluppo prima del merge.
9. [ ] **Progetto di prod `mito-micro-services` → Production, solo nomi:** `NEXT_PUBLIC_SUPABASE_URL` c'è, nella forma `https://<progetto>.supabase.co`. Il workflow dello staging la legge per riconoscere il progetto di prod, e senza si ferma.

## Chi apre lo staging

Con "All Deployments", per aprire `staging-crm.dbmito.it` serve un account Vercel con accesso al progetto di staging. Poi si entra nell'app con Azure o con il link via email, per esempio con un indirizzo `info@`.

- Chi non ha accesso su Vercel non arriva al login dell'app, nemmeno con un indirizzo ammesso.
- L'accesso si dà in due modi:
  - aggiungendo la persona al team con il ruolo più basso (Viewer). Ogni membro del team vede però le impostazioni dei progetti, comprese quelle di prod;
  - approvando la sua richiesta di accesso, in Deployment Protection del progetto di staging.
- Su un piano Hobby non si aggiungono membri al team: prima di invitare qualcuno, controllare il piano in Settings → Billing del team.
- Le chiamate senza browser, come i cron, passano con l'header `x-vercel-protection-bypass` del progetto di staging.

## Dopo il primo push su `dev`

Per ogni controllo, cosa guardare e cosa fare se non passa.

- [ ] **Il workflow è verde.** Se no, il primo `::error::` del log dice quale passo qui sopra manca.
- [ ] **Progetto di staging → Deployments:** la deployment è di Preview, con branch `dev`. Se il branch è un altro o manca, la deployment gira comunque sulle variabili di Preview, che senza override sono le stesse.
- [ ] **Il dominio:** nella pagina della deployment, fra i Domains, c'è `staging-crm.dbmito.it`. Da una finestra anonima il dominio chiede il login Vercel. Se si apre senza: togliere subito il dominio dal progetto (Settings → Domains), poi controllare il passo 5.
- [ ] **Login Azure** da `staging-crm.dbmito.it`, con un indirizzo ammesso o con un utente del DB di sviluppo che ha già l'account Azure collegato: arriva in fondo. Con un errore sulla redirect URI: passo 7. Con `OAuthAccountNotLinked`: l'utente è nel DB ma senza account Azure, e può entrare con il link via email.
- [ ] **Link via email** a un indirizzo `info@`: arriva ed entra. Se non arriva, controllare i `SENDGRID_*` in Preview e il mittente su SendGrid.
- [ ] **Chi non deve entrare resta fuori:**
  - un account Azure del tenant che non è nel DB di sviluppo né in `AUTH_ALLOWED_EMAILS`: il login finisce su "Access Denied", e sul DB di sviluppo `SELECT id FROM "mito-deutsche_user" WHERE lower(email) = lower('<indirizzo>')` → 0 righe;
  - un utente del DB salvato con le maiuscole, mentre si entra con l'indirizzo in minuscolo. NextAuth porta in minuscolo l'indirizzo digitato, quindi le maiuscole vanno nel DB. Sul DB di sviluppo:
    1. `INSERT INTO "mito-deutsche_user" (id, email) VALUES ('prova-staging', 'Prova.Staging@example.com')`;
    2. link via email per `prova.staging@example.com`: "Access Denied", nessuna email;
    3. `SELECT count(*) FROM "mito-deutsche_user" WHERE lower(email) = 'prova.staging@example.com'` → 1, cioè nessun utente nuovo;
    4. `DELETE FROM "mito-deutsche_user" WHERE id = 'prova-staging'`.

  Se uno dei due entra: togliere il dominio dal progetto di staging, cancellare l'utente creato e aprire un task, perché il filtro del login non funziona.
- [ ] **Dati di sviluppo:** il numero di clienti nella lista Clienti è quello del DB di sviluppo (`SELECT count(*) FROM "mito-deutsche_customers"`). Se è quello di prod, togliere subito il dominio dal progetto di staging e ricontrollare le variabili di Preview (passo 4).
- [ ] **Le pagine che caricano dati durante il rendering sul server funzionano:** il profilo (`src/app/dashboard/profile/layout.tsx`) e "nuova pratica" nella scheda di un cliente (`src/app/dashboard/customers/[id]/connect/_components/NewPraticaForm.tsx`). Sul server le loro query chiamano `https://${VERCEL_URL}` (`src/trpc/shared.ts`), che la protezione copre. Se restano vuote o in errore, aprire un task: le chiamate lato server dovrebbero passare dal dominio della richiesta, o mandare il bypass.
- [ ] **Sentry non riceve niente:**
  - nel log di GitHub Actions del deploy, passo "Build Project Artifacts", non ci sono upload di source map né release;
  - dal browser, `https://staging-crm.dbmito.it/monitoring` risponde 404;
  - `https://staging-crm.dbmito.it/api/sentry-example-api` lancia un errore, che in Sentry non compare.

  Se Sentry riceve qualcosa, in Preview c'è una variabile di Sentry (passo 4): toglierla e rifare il deploy.

## Prima del merge su `main`

Questi branch arrivano in produzione con il merge `dev` → `main`. Prima, nel progetto di prod, Settings → Environment Variables, filtro Production, solo i nomi:

- [ ] ci sono tutte quelle che il build di produzione richiede (`src/env.js`):
  - `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW` (prima non era richiesta), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_KEY`;
  - `NEXTAUTH_SECRET`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`;
  - `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`.

  Ci sono anche `CRON_SECRET_KEY`, per i cron, e `NEXT_PUBLIC_SUPABASE_ANON_KEY`, per l'export. Il build si ferma se manca una di quelle richieste: meglio saperlo prima;
- [ ] non ci sono `SKIP_ENV_VALIDATION`, che ferma il workflow di prod, né `NEXT_PUBLIC_VERCEL_ENV`, che ferma il build se è diverso da `production`;
- [ ] non ci sono `PREVIEW_DB` né `PREVIEW_DB_PSW`. Il codice di prima li usava al posto di `SUPABASE_DB_CONNECTION_STRING` e `SUPABASE_MITO_PSW`: se ci sono, la prod oggi gira su quel DB e il primo deploy la sposterebbe. Fermarsi e decidere quale è il DB di prod;
- [ ] non c'è `CUSTOM_ACCESS`. Con il codice di prima aggiungeva in prod il login Discord e quello via email, che il codice nuovo toglie: se c'è, decidere prima chi perde l'accesso.

## Dopo il primo deploy di prod

- [ ] **Il passo "Check the build is production" è verde.** Se no, il suo `::error::` dice cosa manca nelle variabili di Production.
- [ ] **`staging-crm.dbmito.it`** è ancora sullo staging e chiede ancora il login Vercel: sta in un altro progetto, e il deploy di prod non lo tocca.
- [ ] **Login Azure da `crm.dbmito.it`** con un utente che è già nel DB di prod e non in quello di sviluppo: entra, perché in prod non c'è filtro. Non provarlo con un account nuovo, che in prod nascerebbe ADMIN. Se non entra, controllare la redirect URI di `crm.dbmito.it` (passo 7) e le variabili Azure di Production.
- [ ] **Le pagine che caricano dati sul server funzionano anche in prod**, le stesse due dello staging. La Standard Protection protegge anche l'URL generato della deployment di prod, che quelle query usano. Se no, aprire un task come per lo staging.
- [ ] **Sentry:** `https://crm.dbmito.it/api/sentry-example-api` lancia un errore, e in Sentry la sua issue ha Environment `production`. Se non arriva, controllare `NEXT_PUBLIC_SENTRY_DSN` in Production.
- [ ] **Progetto di prod → Production:** cancellare `SENDGRID_*`, `DISCORD_*` e `NEXT_PUBLIC_BASE_URL`, se presenti. Solo ora: il codice di prima li richiedeva, e un suo deploy fallirebbe senza. Il login via email in produzione non c'è. `CUSTOM_ACCESS` e `PREVIEW_DB*` si tolgono come deciso prima del merge.
- [ ] **Progetto di prod → Preview:** non serve più allo staging. Le variabili che vi sono state messe per lo staging si possono togliere.

## Cron dello staging

I quattro workflow non prod partono solo a mano e chiamano `https://staging-crm.dbmito.it`:

- `Update Alerts`;
- `Delete Supabase Storage`;
- `Update Priority`;
- `Update Customers and Pratices`.

Senza `STAGING_CRON_SECRET_KEY` si fermano prima di chiamare. Senza `VERCEL_AUTOMATION_BYPASS_SECRET` chiamano lo staging, la protezione li respinge e il job diventa rosso. I segreti si creano solo dopo un primo deploy dello staging riuscito, cioè passato da tutti i controlli del workflow, in quest'ordine:

1. [ ] **Chiave dello staging:** generarla con `openssl rand -base64 32`. Mai la stessa di prod.
2. [ ] **Progetto di staging → Settings → Environment Variables:** `CRON_SECRET_KEY` in **Preview**, con quel valore. Quella di prod sta nel progetto di prod, solo Production.

   Poi rifare il deploy dello staging (un push su `dev`, o rilanciare l'ultimo run di `deploy-staging.yaml`): una variabile nuova entra solo nelle deployment successive.
3. [ ] **GitHub → Settings → Secrets and variables → Actions:** `STAGING_CRON_SECRET_KEY` con lo stesso valore. `gh secret set STAGING_CRON_SECRET_KEY` lo legge da tastiera, senza stamparlo.
4. [ ] **Progetto di staging → Settings → Deployment Protection → Protection Bypass for Automation:** generarlo, e metterlo su GitHub in `VERCEL_AUTOMATION_BYPASS_SECRET` (`gh secret set VERCEL_AUTOMATION_BYPASS_SECRET`). Apre la protezione delle sole deployment del progetto di staging. Vercel lo mette anche fra le variabili di sistema di ogni deployment dello staging, con lo stesso nome: lo leggono il codice dell'app e chi vede le variabili del progetto.
5. [ ] **Primo lancio:** `gh workflow run "Update Alerts" --ref dev`, con gli script di `dev`.
   - Nel log compare `Cron target: https://staging-crm.dbmito.it` e il job è verde. Con un 401 o una pagina di login Vercel, ricontrollare il bypass (passo 4) e `CRON_SECRET_KEY` in Preview (passo 2).
   - `Delete Supabase Storage` cancella i file di export dello storage dello staging: lanciarlo solo dopo questo controllo.

`crm.dbmito.it` resta senza protezione, perché i cron di prod non mandano il bypass: il progetto di prod usa la Standard Protection, che lascia fuori i domini di produzione.

## Variabili tolte

`DISCORD_*`, `CUSTOM_ACCESS`, `NEXT_PUBLIC_BASE_URL` e `PREVIEW_DB*` non servono più dal primo deploy di prod con questo codice.

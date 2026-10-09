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
- **Staging:** progetto `staging-mito-micro-services`, branch `dev`, dominio `staging-crm.dbmito.it`. Lo pubblica `.github/workflows/deploy-staging.yaml`. Il secret GitHub `VERCEL_STAGING_PROJECT_ID` è il suo Project ID (Settings → General).

Lo staging è una deployment di Production del suo progetto (`vercel --prod`): prende le variabili Production di quel progetto e ha `VERCEL_ENV=production`. Lo separa dalla produzione `APP_ENV=staging`, che c'è solo nel progetto di staging: senza, l'app lo tratterebbe come la produzione, con il solo login Azure senza filtro e gli errori mandati a Sentry (`src/env.js`). `NODE_ENV` non serve a questo: Vercel lo mette sempre a `production`, nella build e nelle funzioni.

I due progetti non condividono variabili, domini né protezione. `vercel.json` spegne i deploy dai commit. Senza i controlli del workflow restano possibili un Redeploy, un Promote o un Instant Rollback dalla dashboard, `vercel` o `vercel alias set` a mano, e le chiamate all'API con un token del team: non si usano (vedi sotto e «Limiti noti»).

Questo documento sostituisce, per lo staging, il piano di migrazione che lo voleva su Railway (`brain/chore/migration/`).

## Come si comporta lo staging

- **Deploy:** ogni push su `dev` lancia `deploy-staging.yaml`. Il workflow fa build e deploy di Production con la CLI nel progetto di staging, e punta `staging-crm.dbmito.it` alla nuova deployment. I test non girano prima: `ci.yml` gira sulle PR.
- **Controlli del workflow:** si ferma prima del build se:
  - `VERCEL_STAGING_PROJECT_ID` manca, o indica il progetto di prod;
  - secondo l'API di Vercel, il progetto di staging:
    - non protegge "All Deployments" con Vercel Authentication;
    - è collegato a Git;
    - non ha il dominio `staging-crm.dbmito.it`, oppure il dominio non è verificato, fa un redirect o è legato a un branch o a un ambiente personalizzato invece che all'ambiente Production;
    - ha altri domini oltre a `staging-crm.dbmito.it` e a quelli `*.vercel.app`: una deployment di Production li prenderebbe tutti;
  - `vercel pull` non ha scritto `VERCEL_ENV="production"` e `APP_ENV="staging"` (anche quando `APP_ENV` è un Secret, che arriva come `[SENSITIVE]`), o fra le variabili c'è `SKIP_ENV_VALIDATION`. Se c'è `NODE_ENV` avvisa soltanto;
  - lo staging userebbe il progetto Supabase di produzione. Il progetto si riconosce dall'host di `NEXT_PUBLIC_SUPABASE_URL` (`https://<progetto>.supabase.co`). Il workflow legge le variabili Production del progetto di prod e quelle appena scaricate per il build dello staging. Il progetto Supabase dello staging deve essere diverso da quello di prod, e `SUPABASE_DB_CONNECTION_STRING` dello staging deve avere il progetto dello staging nell'host (`db.<progetto>.supabase.co`) o nell'utente del pooler (`postgres.<progetto>`), e non quello di prod;
  - allo staging mancano `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW`, `NEXT_PUBLIC_SUPABASE_URL` o `SUPABASE_KEY`, oppure `SUPABASE_DB_CONNECTION_STRING` è di tipo Secret, e il workflow non la può leggere.

  Il workflow non stampa nessun valore. Il controllo copre il database e lo storage, e conta sul fatto che ogni ambiente li tenga in un solo progetto Supabase (vero al 2026-10-09 per sviluppo e produzione). Non guarda gli altri segreti (`NEXTAUTH_SECRET`, `AZURE_AD_CLIENT_SECRET`, `CRON_SECRET_KEY`): che siano diversi da prod dipende dal punto 4 qui sotto e dai passi dei cron, non da un controllo.

  I controlli girano solo nel workflow. Una deployment fatta in un altro modo non ci passa: per questo il progetto di staging resta scollegato da Git, e niente Redeploy, Promote o Instant Rollback dalla dashboard né `vercel` a mano.
- **Login:** entrano solo gli utenti già nel database, con la stessa email (anche nelle maiuscole), e gli indirizzi di `AUTH_ALLOWED_EMAILS` che nel database non ci sono. Si entra con Azure o con il link via email (SendGrid). In produzione resta solo Azure, senza filtro.
  - Con Azure, un utente del DB entra solo se il suo account `azure-ad` è già collegato nel DB di sviluppo. Altrimenti NextAuth risponde `OAuthAccountNotLinked` e non lo collega da solo; con il link via email entra comunque.
  - NextAuth porta in minuscolo l'indirizzo digitato per il link via email.
- **Sentry:** non riceve niente. Lo staging non manda eventi, non carica source map, non crea release e non apre la route `/monitoring`. Lo fa solo la produzione: `VERCEL_ENV=production` senza `APP_ENV`.
- **Database:** è il progetto Supabase di sviluppo, lo stesso del locale. Un DB nuovo non va bene: le migrazioni non ricostruiscono lo schema (vedi [[tech-debt/crm/sezione-contatti]]).
- **Un nuovo deploy dello staging** si fa con un push su `dev`, o rilanciando l'ultimo run di `deploy-staging.yaml`. Mai Redeploy dalla dashboard né `vercel` a mano: rifarebbero il build senza i controlli del workflow.

## Prima del merge su `dev`

Il merge su `dev` fa subito il deploy. Questi passi vanno fatti prima, in quest'ordine. Le variabili si guardano solo per nome, mai i valori. Dove non è scritto altro, è il progetto `staging-mito-micro-services`.

1. [ ] **Settings → Build and Deployment → Node.js Version:** 22.x, come `engines.node` in `package.json` e il progetto di prod. Al 2026-10-09 il progetto di staging dice 24.x. Il build usa comunque `engines.node`, che prevale sull'impostazione: il passo allinea quello che la dashboard mostra.
2. [ ] **Settings → Git:** nessun repository collegato. Se c'è, Disconnect. La deployment fatta alla creazione del progetto era collegata a Git (ha un alias `-git-main-`). Il workflow si ferma finché è collegato, perché un deploy da Git salterebbe i suoi controlli.
3. [ ] **Settings → Environment Variables:** "Enable access to System Environment Variables" è attiva. Senza, `vercel pull` non scrive `VERCEL_ENV` e il workflow si ferma.
4. [ ] **Stessa pagina, ambiente Production.** Oggi le variabili stanno in Development, che le deployment non usano mai: serve solo a `vercel dev` e `vercel env pull`. Aggiungere Production a ognuna; Preview resta vuota. Prima, filtrare su Production e guardare che non ci siano già voci con valori di prod.
   - `APP_ENV`: `staging`. Senza, il workflow si ferma; con un altro valore si ferma il build.
   - `NODE_ENV`, se c'è (per esempio `development`): toglierla. Vercel la rimette a `production`, e il workflow avvisa.
   - `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW`: il DB di sviluppo, da `.env.development.local`. La stringa è quella del pooler di Supabase in transaction mode (porta 6543), che Supabase indica per le funzioni serverless come quelle di Vercel. Si copia dal dialogo **Connect** del progetto Supabase di sviluppo (Transaction pooler), senza ricostruire l'host a mano: dipende dalla regione. Se `.env.development.local` ha la stringa diretta (`db.<progetto>.supabase.co`, porta 5432), non va bene: senza l'add-on IPv4 di Supabase quell'host risponde solo in IPv6, e dalle funzioni di Vercel il DB non si connette.
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_KEY`: lo storage di sviluppo, da `.env.development.local`, nello stesso progetto del DB. L'URL è nella forma `https://<progetto>.supabase.co`, senza spazi.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: la chiave `anon` del progetto Supabase di sviluppo, dalla dashboard di Supabase (Settings → API Keys, fra le chiavi legacy). Al 2026-10-09 `.env.development.local` non la ha, e quella di `.env` è di prod. Il workflow non la controlla, ma l'export la usa.
   - Config o Secret: `APP_ENV`, `SUPABASE_DB_CONNECTION_STRING` e ogni `NEXT_PUBLIC_*` vanno salvate come Config. La stringa del DB la legge il workflow; le altre finiscono nel bundle al build, e `vercel pull` scrive un Secret come `[SENSITIVE]`. Un Secret già salvato non si trasforma in Config: va cancellato e ricreato. Le altre possono essere Secret. Se il team impone che le variabili di Production siano Sensitive, queste Config non si possono creare, e il workflow si ferma: la regola va tolta, almeno per questo progetto.
   - `NEXTAUTH_SECRET`: un valore nuovo (`openssl rand -base64 32`).
   - `AUTH_ALLOWED_EMAILS`: `info@sevedemo.com,info@spatalo.tech`.
   - `AZURE_AD_CLIENT_ID`, `AZURE_AD_TENANT_ID`: l'unica eccezione, quelli dell'app di prod, perché lo staging usa la stessa app di Entra. `AZURE_AD_CLIENT_SECRET`: un client secret nuovo della stessa app, solo per lo staging (vedi [[chore/migration/attivita-manuali-provider]]).
   - `SENDGRID_USERNAME`, `SENDGRID_API_KEY`, `SENDGRID_SERVER`, `SENDGRID_PORT`: servono agli indirizzi `info@`, che entrano con il link via email.
   - Mai nel progetto di staging: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `NEXTAUTH_URL`, `NEXT_PUBLIC_VERCEL_ENV`, `NEXT_PUBLIC_APP_ENV`, `SKIP_ENV_VALIDATION`, `PREVIEW_DB`, `PREVIEW_DB_PSW`.
   - Non lanciare `vercel env pull` nella cartella del repo senza un file di destinazione: scriverebbe un file env che Next.js carica.
5. [ ] **Settings → Deployment Protection:** Vercel Authentication su "All Deployments". Nel progetto di staging `staging-crm.dbmito.it` è un dominio di produzione: con la Standard Protection resterebbe aperto a tutti. Il workflow controlla l'impostazione del progetto, ma non vede i link condivisibili (Share) né le eccezioni per una singola deployment: non crearne.
6. [ ] **Dominio di staging.**
   - Se `staging-crm.dbmito.it` è stato aggiunto al progetto di prod, toglierlo da lì: un dominio sta in un solo progetto.
   - Progetto di staging → Settings → Domains (nelle docs di Vercel anche Settings → Environments → Production): `staging-crm.dbmito.it` sull'ambiente Production, senza redirect, con "Valid Configuration".
   - Nessun altro dominio nel progetto di staging, a parte quelli `*.vercel.app`, e in particolare non `crm.dbmito.it`: ogni push su `dev` lo prenderebbe. Il workflow si ferma se ce n'è uno.
   - DNS di `dbmito.it`: `staging-crm` CNAME verso il valore che Vercel indica.
   - Il workflow controlla il dominio a ogni deploy e lo punta alla nuova deployment.
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
  - aggiungendo la persona al team con il ruolo più basso (Pro Viewer, o Enterprise Viewer). Un membro del team vede però i progetti del team, compreso quello di prod, con quello che il suo ruolo mostra;
  - approvando la sua richiesta di accesso, se la pagina di login di Vercel gliela offre, in Deployment Protection del progetto di staging.
- Su un piano Hobby non si aggiungono membri al team, e le docs di Vercel ammettono un solo utente esterno per account, anche con le richieste di accesso: prima di dare accesso a qualcuno, controllare il piano in Settings → Billing del team.
- Le chiamate senza browser, come i cron, passano con l'header `x-vercel-protection-bypass` del progetto di staging.

## Dopo il primo push su `dev`

Per ogni controllo, cosa guardare e cosa fare se non passa.

- [ ] **Il workflow è verde.** Se è rosso un passo di controllo, il suo `::error::` dice quale passo qui sopra manca. Se è rosso "Build Project Artifacts", l'errore di `src/env.js` ("Invalid environment variables") elenca i nomi delle variabili che mancano (passo 4).
- [ ] **Progetto di staging → Deployments:** la deployment nuova è di Production, ed è la Current. Se è di Preview, non viene da questo workflow, che usa sempre `--prod`: capire chi l'ha creata prima di andare avanti. Se non è la Current, di solito c'è un Instant Rollback attivo: annullarlo dalla pagina Deployments, poi rilanciare il run.
- [ ] **Il dominio:** nella pagina della deployment, fra i Domains, c'è `staging-crm.dbmito.it`. Se manca, rilanciare il run: l'ultimo passo lo punta alla deployment. Da una finestra anonima il dominio chiede il login Vercel. Se si apre senza: togliere subito il dominio dal progetto (Settings → Domains), poi controllare il passo 5.
- [ ] **Login Azure** da `staging-crm.dbmito.it`, con un indirizzo ammesso o con un utente del DB di sviluppo che ha già l'account Azure collegato: arriva in fondo. Con un errore sulla redirect URI: passo 7. Con `OAuthAccountNotLinked`: l'utente è nel DB ma senza account Azure, e può entrare con il link via email.
- [ ] **Link via email** a un indirizzo `info@`: arriva ed entra. Se non arriva, controllare i `SENDGRID_*` del progetto di staging e il mittente su SendGrid.
- [ ] **Chi non deve entrare resta fuori:**
  - un account Azure del tenant che non è nel DB di sviluppo né in `AUTH_ALLOWED_EMAILS`: il login finisce su "Access Denied", e sul DB di sviluppo `SELECT id FROM "mito-deutsche_user" WHERE lower(email) = lower('<indirizzo>')` → 0 righe;
  - un utente del DB salvato con le maiuscole, mentre si entra con l'indirizzo in minuscolo. NextAuth porta in minuscolo l'indirizzo digitato, quindi le maiuscole vanno nel DB. Sul DB di sviluppo:
    1. `INSERT INTO "mito-deutsche_user" (id, email) VALUES ('prova-staging', 'Prova.Staging@example.com')`;
    2. link via email per `prova.staging@example.com`: "Access Denied", nessuna email;
    3. `SELECT count(*) FROM "mito-deutsche_user" WHERE lower(email) = 'prova.staging@example.com'` → 1: conferma che il passo 2 non ha creato un utente. È il passo 2 a dire se il filtro funziona;
    4. `DELETE FROM "mito-deutsche_user" WHERE id = 'prova-staging'`.

  Se uno dei due entra: togliere il dominio dal progetto di staging, cancellare l'utente creato e aprire un task, perché il filtro del login non funziona.
- [ ] **Dati di sviluppo:** il totale della lista Clienti è quello della stessa lista sul DB di sviluppo (in locale, con `next dev`), e non quello di `crm.dbmito.it`. Un `SELECT count(*) FROM "mito-deutsche_customers"` può dare un numero un po' diverso: la lista conta le righe della join con le task attive. Se è quello di prod, togliere subito il dominio dal progetto di staging e ricontrollare le variabili del passo 4. Se la lista non si carica e i log delle funzioni (progetto di staging → Logs) danno un errore di connessione al DB, la stringa non è quella del pooler: passo 4.
- [ ] **Storage di sviluppo:** un export dalla dashboard (`/dashboard`, Esporta) finisce nel bucket `mito-storage`, cartella `export`, del progetto Supabase di sviluppo, e non in quello di prod. Se finisce in prod, togliere il dominio dal progetto di staging e ricontrollare `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (passo 4). Se l'export fallisce e basta, non è una fuga verso prod: di solito `NEXT_PUBLIC_SUPABASE_ANON_KEY` è di un altro progetto, oppure nel progetto di sviluppo manca il bucket `mito-storage` o una sua policy. Sistemarlo prima di andare avanti.
- [ ] **Le pagine che caricano dati durante il rendering sul server mostrano i dati:** il profilo (`src/app/dashboard/profile/layout.tsx`) e "nuova pratica" nella scheda di un cliente (`src/app/dashboard/customers/[id]/connect/_components/NewPraticaForm.tsx`). Sul server le loro query chiamano `https://${VERCEL_URL}` (`src/trpc/shared.ts`) senza il cookie della sessione, quindi falliscono già oggi in ogni ambiente, e la pagina le rifà dal browser. Se i dati compaiono, va bene. Se restano vuote, aprire un task.
- [ ] **Sentry non riceve niente:**
  - nel log di GitHub Actions del deploy, passo "Build Project Artifacts", non ci sono upload di source map né release;
  - dal browser, `https://staging-crm.dbmito.it/monitoring` risponde 404;
  - `https://staging-crm.dbmito.it/api/sentry-example-api` lancia un errore, che in Sentry non compare.

  Se Sentry riceve qualcosa dallo staging, il build l'ha preso per la produzione: controllare `APP_ENV` (passo 4) e il passo "Check the build is staging" nel log, e togliere le variabili di Sentry dal progetto di staging.

## Prima del merge su `main`

Questi branch arrivano in produzione con il merge `dev` → `main`. Prima, nel progetto di prod:

- [ ] **Settings → Environment Variables:** "Enable access to System Environment Variables" è attiva. Il codice nuovo la richiede (prima no): senza, il passo "Check the build is production" si ferma.
- [ ] **Settings → Git → Deploy Hooks:** nessuno. Un hook farebbe un deploy senza il workflow.
- [ ] **Stessa pagina delle variabili, filtro Production, solo i nomi.** Ci sono tutte quelle che il build di produzione richiede (`src/env.js`):
  - `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW` (prima non era richiesta), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_KEY`;
  - `NEXTAUTH_SECRET`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`;
  - `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`.

  Ci sono anche `CRON_SECRET_KEY`, per i cron, e `NEXT_PUBLIC_SUPABASE_ANON_KEY`, per l'export. Il build si ferma se manca una di quelle richieste: meglio saperlo prima;
- [ ] non ci sono `APP_ENV` e `SKIP_ENV_VALIDATION`, che fermano il workflow di prod, né `NEXT_PUBLIC_VERCEL_ENV` e `NEXT_PUBLIC_APP_ENV`, che fermano il build se non sono uguali a `VERCEL_ENV` e `APP_ENV`;
- [ ] non ci sono `PREVIEW_DB` né `PREVIEW_DB_PSW`. Il codice di prima li usava al posto di `SUPABASE_DB_CONNECTION_STRING` e `SUPABASE_MITO_PSW`: se ci sono, la prod oggi gira su quel DB e il primo deploy la sposterebbe. Fermarsi e decidere quale è il DB di prod;
- [ ] non c'è `CUSTOM_ACCESS`. Con il codice di prima aggiungeva in prod il login Discord e quello via email, che il codice nuovo toglie: se c'è, decidere prima chi perde l'accesso.

## Dopo il primo deploy di prod

- [ ] **Il passo "Check the build is production" è verde.** Se no, il suo `::error::` dice cosa fare: accendere le variabili di sistema, o togliere `APP_ENV` o `SKIP_ENV_VALIDATION` da Production. Se è rosso "Build Project Artifacts", l'errore di `src/env.js` elenca i nomi delle variabili richieste che mancano.
- [ ] **`staging-crm.dbmito.it`** è ancora sullo staging e chiede ancora il login Vercel: sta in un altro progetto, e il deploy di prod non lo tocca. Se no, togliere il dominio dal progetto in cui si trova e rifare i passi 5 e 6.
- [ ] **Login Azure da `crm.dbmito.it`** con un utente che è già nel DB di prod e non in quello di sviluppo. Controlla Azure, la redirect URI e il DB, non il filtro: un utente del DB entra anche con il filtro acceso. Arriva alla dashboard con il suo ruolo e i suoi dati, e il totale della lista Clienti è quello di prod. Se arriva su `/dashboard/profile?firstTime=true`, NextAuth ha creato un utente nuovo: il DB non è quello di prod, e va controllato subito. Non provarlo con un account nuovo, che in prod nascerebbe ADMIN. Se non entra, controllare la redirect URI di `crm.dbmito.it` (passo 7) e le variabili Azure di Production.
- [ ] **Le pagine che caricano dati sul server mostrano i dati anche in prod**, le stesse due dello staging, che le rifà dal browser. Se no, aprire un task come per lo staging.
- [ ] **Sentry:** `https://crm.dbmito.it/api/sentry-example-api` lancia un errore, e in Sentry la sua issue ha Environment `production`. Se non arriva, controllare `NEXT_PUBLIC_SENTRY_DSN` in Production.
- [ ] **Progetto di prod → Production:** cancellare `SENDGRID_*`, `DISCORD_*` e `NEXT_PUBLIC_BASE_URL`, se presenti. Solo ora: il codice di prima li richiedeva, e un suo deploy fallirebbe senza. Il login via email in produzione non c'è. `CUSTOM_ACCESS` e `PREVIEW_DB*` si tolgono come deciso prima del merge.
- [ ] **Progetto di prod → Preview:** non serve più allo staging. Le variabili che vi sono state messe per lo staging si possono togliere.

## In locale

Con `chore/env-prod-locale` gli script del DB di prod leggono `.env.prod.local`, non più `.env.production.local`, che Next.js carica in ogni build locale. Subito dopo averlo preso:

- [ ] rinominare `.env.production.local` in `.env.prod.local`. Finché c'è il file vecchio, gli script del DB di prod e `next build`, `next start` e `next dev` si fermano;
- [ ] `.env.prod.local` ha da solo le due chiavi del DB di prod, non vuote: `grep -cE "^\s*(export\s+)?(SUPABASE_DB_CONNECTION_STRING|SUPABASE_MITO_PSW)\s*=\s*[\"']?[^\"'[:space:]]" .env.prod.local` → 2. Senza, gli script si fermano invece di prenderle da `.env` o dalla shell;
- [ ] `.env` resta il ripiego degli altri file, con i valori di prod (storage e segreti), ma senza le chiavi del DB: `grep -cE '^\s*(export\s+)?(SUPABASE_DB_CONNECTION_STRING|SUPABASE_MITO_PSW)\s*=' .env` → 0 (vero al 2026-10-09). drizzle-kit carica `.env` prima di `.env.development.local`, che non lo sovrascrive: con quelle chiavi in `.env`, `db:push` e `db:migrate` andrebbero sul DB di prod. E Next.js carica `.env` in ogni modalità, quindi `next build` e `next start` in locale usano lo storage di prod: non lanciarli con i file veri.

## Cron dello staging

I quattro workflow non prod partono solo a mano e chiamano `https://staging-crm.dbmito.it`:

- `Update Alerts`;
- `Delete Supabase Storage`;
- `Update Priority`;
- `Update Customers and Pratices`.

Senza `STAGING_CRON_SECRET_KEY` si fermano prima di chiamare. Senza `VERCEL_AUTOMATION_BYPASS_SECRET` chiamano lo staging, la protezione li respinge e il job diventa rosso. I segreti si creano solo dopo un primo deploy dello staging riuscito, cioè passato da tutti i controlli del workflow, in quest'ordine:

1. [ ] **Chiave dello staging:** generarla con `openssl rand -base64 32`. Mai la stessa di prod.
2. [ ] **Progetto di staging → Settings → Environment Variables:** `CRON_SECRET_KEY` in **Production**, con quel valore. Quella di prod sta nel progetto di prod, anche lei solo in Production.

   Poi rifare il deploy dello staging (un push su `dev`, o rilanciare l'ultimo run di `deploy-staging.yaml`): una variabile nuova entra solo nelle deployment successive.
3. [ ] **GitHub → Settings → Secrets and variables → Actions:** `STAGING_CRON_SECRET_KEY` con lo stesso valore. `gh secret set STAGING_CRON_SECRET_KEY` lo legge da tastiera, senza stamparlo.
4. [ ] **Progetto di staging → Settings → Deployment Protection → Protection Bypass for Automation:** generarlo, e metterlo su GitHub in `VERCEL_AUTOMATION_BYPASS_SECRET` (`gh secret set VERCEL_AUTOMATION_BYPASS_SECRET`). Apre la protezione delle sole deployment del progetto di staging. Vercel lo mette anche fra le variabili di sistema di ogni deployment dello staging, con lo stesso nome: lo leggono il codice dell'app e chi vede le variabili del progetto.
5. [ ] **Primo lancio:** `gh workflow run "Update Alerts" --ref dev`, con gli script di `dev`.
   - Nel log compare `Cron target: https://staging-crm.dbmito.it` e il job è verde. Con un 401 o una pagina di login Vercel, ricontrollare il bypass (passo 4) e `CRON_SECRET_KEY` del progetto di staging (passo 2).
   - `Delete Supabase Storage` cancella i file di export dello storage dello staging: lanciarlo solo dopo questo controllo.

I cron di prod non mandano il bypass: funzionano solo se la protezione del progetto di prod lascia fuori `crm.dbmito.it`, come fa la Standard Protection con i domini di produzione. Da qui non si verifica: va guardato in Settings → Deployment Protection del progetto di prod, prima del primo cron di prod (runbook G2).

## Variabili tolte

`DISCORD_*`, `CUSTOM_ACCESS`, `NEXT_PUBLIC_BASE_URL` e `PREVIEW_DB*` non servono più dal primo deploy di prod con questo codice. In prod non servono più nemmeno i `SENDGRID_*`, che restano solo nello staging.

## Limiti noti

Restano fuori dai controlli, e vanno decisi a parte:

- **`VERCEL_TOKEN` vale per tutto il team, e lo usa ogni branch.** È un secret del repository, e `main` e `dev` non hanno protezione né environment GitHub. Chi può fare push su un branch può far girare un workflow con il token. Con il token, `vercel alias set` o l'API possono puntare `crm.dbmito.it` o `staging-crm.dbmito.it` su qualunque deployment del team. I workflow non lo passano al build, che esegue gli script di `pnpm install` e il codice del branch. Va limitato con un environment GitHub per `main` e uno per `dev`, oppure con la protezione dei due branch.
- **Una deployment fatta fuori dal workflow** (Redeploy, Promote, Instant Rollback, `vercel` a mano, API) non passa dai controlli. Lo staging resta comunque nel suo progetto, con le sue variabili.
- **Fra i controlli e il deploy passano alcuni minuti.** Lo storage entra nel bundle al build, dal file controllato; la stringa del DB la legge la funzione, dalle variabili del progetto al momento del deploy. Una variabile cambiata in quei minuti non viene controllata.
- **Il controllo della stringa del DB** riconosce gli errori involontari. Una stringa costruita apposta per nascondere il progetto di prod passa, ma richiede anche la password del DB di prod.
- **postgres.js** (`src/server/db/index.ts`) non fissa `max: 1`, come Supabase consiglia sul pooler in transaction mode: vale anche per la prod, ed è preesistente.

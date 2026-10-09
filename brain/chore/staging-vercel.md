---
domain: platform
title: Staging su Vercel
type: checklist-operativa
status: in_progress
last_updated: 2026-10-09
---

# Staging su Vercel

Su Vercel ci sono due ambienti:

- **Production:** branch `main`, dominio `crm.dbmito.it`.
- **Staging:** branch `dev`, dominio `staging-crm.dbmito.it`.

Per Vercel lo staging è una deployment di Preview: prende le variabili dell'ambiente Preview e ha `VERCEL_ENV=preview`. Non ci sono altre preview: `vercel.json` spegne i deploy da Git, e pubblicano solo i due workflow.

Questo documento sostituisce, per lo staging, il piano di migrazione che lo voleva su Railway (`brain/chore/migration/`).

## Come si comporta lo staging

- **Deploy:** ogni push su `dev` lancia `.github/workflows/deploy-staging.yaml`. Il workflow fa build e deploy con la CLI, come in produzione, e sposta il dominio `staging-crm.dbmito.it` sulla nuova deployment. I test non girano prima: `ci.yml` gira sulle PR.
- **Controlli del workflow:** si ferma prima del build se:
  - `staging-crm.dbmito.it` non è un dominio del progetto assegnato al branch `dev`. Lo chiede all'API di Vercel a ogni deploy;
  - `vercel pull` non ha scritto `VERCEL_ENV="preview"`, o fra le variabili di Preview c'è `SKIP_ENV_VALIDATION`;
  - lo staging userebbe il progetto Supabase di produzione. Il progetto si riconosce dall'host di `NEXT_PUBLIC_SUPABASE_URL` (`https://<progetto>.supabase.co`). Quello di Preview deve essere diverso da quello di Production, e `SUPABASE_DB_CONNECTION_STRING` di Preview deve contenere il progetto di Preview e non quello di Production;
  - in Preview mancano `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW`, `NEXT_PUBLIC_SUPABASE_URL` o `SUPABASE_KEY`, oppure `SUPABASE_DB_CONNECTION_STRING` è di tipo Sensitive, e il workflow non la può leggere.

  Preview si legge due volte, con gli override del branch `dev` e senza, perché la deployment gira sull'una o sull'altra. Il workflow non stampa nessun valore.

  Il controllo copre il database e lo storage, e conta sul fatto che ogni ambiente li tenga in un solo progetto Supabase (vero al 2026-10-09 per sviluppo e produzione). Non guarda gli altri segreti (`NEXTAUTH_SECRET`, `AZURE_AD_CLIENT_SECRET`, `CRON_SECRET_KEY`): che siano diversi da prod lo garantiscono il punto 2 qui sotto e i passi dei cron.
- **Login:** entrano solo gli utenti già nel database, con la stessa email (anche nelle maiuscole), e gli indirizzi di `AUTH_ALLOWED_EMAILS` che nel database non ci sono. Si entra con Azure o con il link via email (SendGrid). In produzione resta solo Azure, senza filtro.
- **Sentry:** non riceve niente. Lo staging non manda eventi, non carica source map, non crea release e non apre la route `/monitoring`. Lo fa solo la deployment con `VERCEL_ENV=production`.
- **Database:** è il progetto Supabase di sviluppo, lo stesso del locale. Un DB nuovo non va bene: le migrazioni non ricostruiscono lo schema (vedi [[tech-debt/crm/sezione-contatti]]).
- **Mai "Promote to Production" su una deployment dello staging.** È buildata come Preview: login filtrato, niente Sentry, e l'URL dello storage di sviluppo dentro il bundle. In produzione si arriva solo con un push su `main`.

## Prima del merge su `dev`

Il merge su `dev` fa subito il deploy. Questi passi vanno fatti prima, in quest'ordine. Le variabili si guardano solo per nome, mai i valori.

1. [ ] **Vercel → Settings → Environment Variables:** "Automatically expose System Environment Variables" è attiva. Senza, `vercel pull` non scrive `VERCEL_ENV` e i due workflow si fermano.
2. [ ] **Stessa pagina, Preview** (tutti i branch).
   - `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW`: il DB di sviluppo, da `.env.development.local`. `SUPABASE_DB_CONNECTION_STRING` va salvata come variabile normale, non Sensitive: il workflow la legge per riconoscere il progetto. Le altre possono essere Sensitive. Se il team rende Sensitive ogni variabile nuova (la policy delle variabili nelle impostazioni del team), il controllo dello staging non passa mai: va deciso prima.
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: lo storage di sviluppo, da `.env.development.local`, nello stesso progetto del DB. L'URL è nella forma `https://<progetto>.supabase.co`, senza spazi.
   - `NEXTAUTH_SECRET`: un valore nuovo (`openssl rand -base64 32`).
   - `AUTH_ALLOWED_EMAILS`: `info@sevedemo.com,info@spatalo.tech`.
   - `AZURE_AD_CLIENT_ID`, `AZURE_AD_TENANT_ID`: l'unica eccezione, quelli dell'app di prod, perché lo staging usa la stessa app di Entra. `AZURE_AD_CLIENT_SECRET`: un client secret nuovo della stessa app, solo per lo staging (vedi [[chore/migration/attivita-manuali-provider]]).
   - `SENDGRID_USERNAME`, `SENDGRID_API_KEY`, `SENDGRID_SERVER`, `SENDGRID_PORT`: servono agli indirizzi `info@`, che entrano con il link via email.
3. [ ] **Stessa pagina, Preview e override del branch `dev`:** cancellare, se presenti:
   - `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`;
   - `NEXTAUTH_URL`, `NODE_ENV`, `NEXT_PUBLIC_VERCEL_ENV`, `SKIP_ENV_VALIDATION`;
   - `PREVIEW_DB`, `PREVIEW_DB_PSW`.

   Ogni override del branch `dev` sulle variabili del punto 2 deve essere del progetto di sviluppo.
4. [ ] **Vercel → Settings → Git:** il repository `omardeangelis/mito-micro-services` è collegato. Serve per assegnare il dominio a un branch (punto 5). Se non lo è, prima di collegarlo impostare **Ignored Build Step** su "Don't build anything": così Vercel non fa build dai push, nemmeno dai branch senza `vercel.json`, come `main` finché questi branch non ci arrivano. Dopo il collegamento, un push su un branch qualsiasi non deve creare deployment.
5. [ ] **Dominio di staging.**
   - DNS di `dbmito.it`: `staging-crm` CNAME verso il valore che Vercel indica quando si aggiunge il dominio.
   - Vercel → progetto `mito-micro-services` → Settings → Domains: aggiungere `staging-crm.dbmito.it`, ambiente Preview, branch `dev`, senza redirect.
   - **Mai senza branch.** Un dominio senza branch è un dominio di produzione: segue i deploy di `main` ed esce dalla Deployment Protection. Il workflow lo controlla e si ferma.
6. [ ] **Vercel → Settings → Deployment Protection:** Vercel Authentication attiva, su Standard Protection. Al 2026-10-08 lo era: va ricontrollato qui, perché senza lo staging è aperto a chiunque abbia l'URL.
7. [ ] **Microsoft Entra → App registration → Authentication → Web.** Redirect URI:
   - `https://crm.dbmito.it/api/auth/callback/azure-ad`;
   - `https://staging-crm.dbmito.it/api/auth/callback/azure-ad`;
   - `http://localhost:3000/api/auth/callback/azure-ad`.

   Niente wildcard. NextAuth usa come callback l'host da cui si entra: dai link `*.vercel.app` generati da Vercel il login Azure non funziona, si passa sempre dal dominio.
8. [ ] **Utenti del DB di sviluppo:** controllare chi c'è in `mito-deutsche_user` (email e ruolo). Entreranno tutti nello staging, e ogni utente nuovo nasce ADMIN, per default del DB. Chi non deve entrare va tolto dal DB di sviluppo prima del merge.

## Chi apre lo staging

Vercel Authentication controlla l'account Vercel del browser, non l'utente dell'app. Si arriva al login dell'app solo se nel browser c'è un account Vercel del team. Poi si entra nell'app con Azure o con il link via email, per esempio con un indirizzo `info@`.

Chi non è nel team Vercel non arriva al login, nemmeno con un indirizzo ammesso: va aggiunto al team. Ogni membro del team vede le impostazioni del progetto, comprese quelle di Production: aggiungere solo chi lavora al progetto, con il ruolo più basso che apre le deployment.

Le chiamate senza browser, come i cron, passano con l'header `x-vercel-protection-bypass`.

## Dopo il primo push su `dev`

- [ ] Il workflow è verde, compresi i controlli del dominio e dei dati.
- [ ] In Vercel → Deployments la deployment è di Preview e mostra il branch `dev`. Con un altro branch, o nessuno, gira sulle variabili di Preview senza gli override di `dev`: il workflow le ha controllate, ma vanno sistemate.
- [ ] `staging-crm.dbmito.it` punta a quella deployment e, da una finestra anonima, chiede il login Vercel.
- [ ] Il login Azure da `staging-crm.dbmito.it` arriva in fondo, con un utente del DB di sviluppo.
- [ ] Il link via email arriva a un indirizzo `info@`.
- [ ] **Chi non deve entrare resta fuori:**
  - un account Azure del tenant che non è nel DB di sviluppo né in `AUTH_ALLOWED_EMAILS`: il login finisce su "Access denied", e sul DB di sviluppo `SELECT id FROM "mito-deutsche_user" WHERE lower(email) = lower('<indirizzo>')` → 0 righe;
  - un utente del DB, con il link via email, scrivendo l'indirizzo con altre maiuscole (`Mario.Rossi@…` se nel DB è `mario.rossi@…`): "Access denied", e nessun utente nuovo nel DB.
- [ ] Le pagine che caricano dati durante il rendering sul server funzionano: il profilo (`src/app/dashboard/profile/layout.tsx`) e "nuova pratica" nella scheda di un cliente (`src/app/dashboard/customers/[id]/connect/_components/NewPraticaForm.tsx`). Le loro query, sul server, chiamano `https://${VERCEL_URL}` (`src/trpc/shared.ts`), che la protezione copre. Se restano vuote o in errore, aprire un task: le chiamate lato server dovrebbero mandare il bypass.
- [ ] Sentry non riceve niente:
  - nel log del build dello staging non ci sono upload di source map né release;
  - dal browser, `https://staging-crm.dbmito.it/monitoring` risponde 404;
  - un errore provocato sullo staging non compare in Sentry.

## Prima del merge su `main`

Questi branch arrivano in produzione con il merge `dev` → `main`. Prima, in Vercel → Settings → Environment Variables, filtro Production, solo i nomi:

- [ ] ci sono tutte quelle che il build di produzione richiede (`src/env.js`):
  - `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW` (prima non era richiesta), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_KEY`;
  - `NEXTAUTH_SECRET`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`;
  - `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`.

  Ci sono anche `CRON_SECRET_KEY`, per i cron, e `NEXT_PUBLIC_SUPABASE_ANON_KEY`, per l'export. Il build si ferma se manca una di quelle richieste: meglio saperlo prima del merge;
- [ ] non ci sono `SKIP_ENV_VALIDATION` né `NEXT_PUBLIC_VERCEL_ENV`: il primo ferma il workflow di prod, il secondo il build.

## Dopo il primo deploy di prod

- [ ] Il passo "Check the build is production" è verde.
- [ ] `staging-crm.dbmito.it` è ancora sulla deployment dello staging, e chiede ancora il login Vercel: il deploy di prod non l'ha spostato.
- [ ] Il login Azure da `crm.dbmito.it` funziona anche per un utente che non è nel DB di sviluppo: in produzione non c'è filtro.
- [ ] Gli eventi Sentry arrivano con ambiente `production`.
- [ ] **Vercel → Settings → Environment Variables → Production:** cancellare `SENDGRID_*`, `DISCORD_*`, `NEXT_PUBLIC_BASE_URL`, `CUSTOM_ACCESS` e `PREVIEW_DB*`, se presenti. Solo ora: il codice di prima li richiedeva, e un suo deploy fallirebbe senza. Il login via email in produzione non c'è.

## Cron dello staging

I quattro workflow non prod partono solo a mano e chiamano `https://staging-crm.dbmito.it`:

- `Update Alerts`;
- `Delete Supabase Storage`;
- `Update Priority`;
- `Update Customers and Pratices`.

Senza `STAGING_CRON_SECRET_KEY` si fermano prima di chiamare. Senza `VERCEL_AUTOMATION_BYPASS_SECRET` chiamano lo staging, la protezione li respinge e il job diventa rosso. I segreti si creano solo dopo un primo deploy dello staging riuscito, cioè passato dai controlli su dominio, DB e storage, in quest'ordine:

1. [ ] **Chiave dello staging:** generarla con `openssl rand -base64 32`. Mai la stessa di prod.
2. [ ] **Vercel → Environment Variables:** `CRON_SECRET_KEY` solo per **Preview**, con quel valore. Quella di prod resta una voce separata, solo Production.

   Poi rifare il deploy dello staging (un push su `dev`, o rilanciare l'ultimo run di `deploy-staging.yaml`): una variabile nuova entra solo nelle deployment successive.
3. [ ] **GitHub → Settings → Secrets → Actions:** `STAGING_CRON_SECRET_KEY` con lo stesso valore. `gh secret set STAGING_CRON_SECRET_KEY` lo legge da tastiera, senza stamparlo.
4. [ ] **Vercel → Settings → Deployment Protection → Protection Bypass for Automation:** attivarlo, e mettere il segreto su GitHub in `VERCEL_AUTOMATION_BYPASS_SECRET` (`gh secret set VERCEL_AUTOMATION_BYPASS_SECRET`). Apre la protezione di tutte le deployment del progetto. Vercel lo mette anche fra le variabili di sistema di ogni deployment, con lo stesso nome: lo leggono il codice dell'app e chi nel team vede le variabili.
5. [ ] **Primo lancio:** `gh workflow run "Update Alerts" --ref dev`, con gli script di `dev`.
   - Nel log compare `Cron target: https://staging-crm.dbmito.it` e il job è verde.
   - `Delete Supabase Storage` cancella i file di export dello storage dello staging: lanciarlo solo dopo questo controllo.

`crm.dbmito.it` resta senza protezione, perché i cron di prod non mandano il bypass. È un dominio di produzione, e la Standard Protection lo esclude.

## Variabili tolte

`DISCORD_*`, `CUSTOM_ACCESS`, `NEXT_PUBLIC_BASE_URL` e `PREVIEW_DB*` non servono più dal primo deploy di prod con questo codice.

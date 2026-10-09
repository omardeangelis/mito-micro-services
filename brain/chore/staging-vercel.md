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
  - `vercel pull` non ha scritto `VERCEL_ENV="preview"`;
  - una fra `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW`, `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_KEY` manca in Preview o ha lo stesso valore di Production;
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` ha lo stesso valore di Production.

  Il workflow confronta i valori senza stamparli.
- **Login:** entrano solo gli utenti già nel database, con la stessa email (anche nelle maiuscole), e gli indirizzi di `AUTH_ALLOWED_EMAILS` che nel database non ci sono. Si entra con Azure o con il link via email (SendGrid). In produzione resta solo Azure, senza filtro.
- **Sentry:** non riceve niente. Lo staging non manda eventi, non carica source map, non crea release e non apre la route `/monitoring`. Lo fa solo la deployment con `VERCEL_ENV=production`.
- **Database:** è il progetto Supabase di sviluppo, lo stesso del locale. Un DB nuovo non va bene: le migrazioni non ricostruiscono lo schema (vedi [[tech-debt/crm/sezione-contatti]]).

## Prima del merge su `dev`

Il merge su `dev` fa subito il deploy. Questi passi vanno fatti prima, in quest'ordine. Le variabili si guardano solo per nome, mai i valori.

1. [ ] **Vercel → Settings → General:** "Automatically expose System Environment Variables" è attiva. Senza, `vercel pull` non scrive `VERCEL_ENV` e i due workflow si fermano.
2. [ ] **Vercel → Settings → Environment Variables → Preview** (tutti i branch). Copiare i valori da `.env.development.local`, non da prod.
   - `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW`: il DB di sviluppo.
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: lo storage di sviluppo, nello stesso progetto del DB.
   - `NEXTAUTH_SECRET`: un valore nuovo (`openssl rand -base64 32`).
   - `AUTH_ALLOWED_EMAILS`: `info@sevedemo.com,info@spatalo.tech`.
   - `AZURE_AD_CLIENT_ID`, `AZURE_AD_TENANT_ID`: quelli dell'app di prod. `AZURE_AD_CLIENT_SECRET`: un client secret nuovo della stessa app, solo per lo staging (vedi [[chore/migration/attivita-manuali-provider]]).
   - `SENDGRID_USERNAME`, `SENDGRID_API_KEY`, `SENDGRID_SERVER`, `SENDGRID_PORT`: servono agli indirizzi `info@`, che entrano con il link via email.
3. [ ] **Stessa pagina, Preview e override del branch `dev`:** cancellare, se presenti:
   - `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`;
   - `NEXTAUTH_URL`, `NODE_ENV`;
   - `PREVIEW_DB`, `PREVIEW_DB_PSW`.

   Ogni override del branch `dev` sulle variabili del punto 2 deve essere del progetto di sviluppo.
4. [ ] **Vercel → Settings → Environment Variables → Production:** cancellare `SENDGRID_*`, `DISCORD_*`, `NEXT_PUBLIC_BASE_URL`, `CUSTOM_ACCESS` e `PREVIEW_DB*`, se presenti. Il login via email non c'è in produzione.
5. [ ] **Dominio di staging.**
   - DNS di `dbmito.it`: `staging-crm` CNAME verso il valore che Vercel indica quando si aggiunge il dominio.
   - Vercel → progetto `mito-micro-services` → Settings → Domains: aggiungere `staging-crm.dbmito.it` assegnato al branch `dev` (Preview).
   - **Mai senza branch.** Un dominio senza branch è un dominio di produzione: segue i deploy di `main` ed esce dalla Deployment Protection.
6. [ ] **Microsoft Entra → App registration → Authentication → Web.** Redirect URI:
   - `https://crm.dbmito.it/api/auth/callback/azure-ad`;
   - `https://staging-crm.dbmito.it/api/auth/callback/azure-ad`;
   - `http://localhost:3000/api/auth/callback/azure-ad`.

   Niente wildcard. NextAuth usa come callback l'host da cui si entra: dai link `*.vercel.app` generati da Vercel il login Azure non funziona, si passa sempre dal dominio.
7. [ ] **Utenti del DB di sviluppo:** controllare chi c'è in `mito-deutsche_user` (email e ruolo). Entreranno tutti nello staging. Ogni utente nuovo nasce ADMIN, per default del DB.

## Chi apre lo staging

Vercel Authentication è attiva (al 2026-10-08 gli URL delle deployment rimandano al login Vercel) e resta attiva sullo staging.

Controlla l'account Vercel del browser, non l'utente dell'app. Si arriva al login dell'app solo se nel browser c'è un account Vercel del team. Poi si entra nell'app con Azure o con il link via email, per esempio con un indirizzo `info@`.

Chi non è nel team Vercel non arriva al login, nemmeno con un indirizzo ammesso: va aggiunto al team. Le chiamate senza browser, come i cron, passano con l'header `x-vercel-protection-bypass`.

## Dopo il primo push su `dev`

- [ ] Il workflow è verde.
- [ ] `staging-crm.dbmito.it` punta a una deployment Preview e chiede il login Vercel.
- [ ] Il login Azure da `staging-crm.dbmito.it` arriva in fondo.
- [ ] Il link via email arriva a un indirizzo `info@`.
- [ ] Le pagine che caricano dati lato server funzionano: le fetch SSR passano da `VERCEL_URL`, che la protezione copre.
- [ ] Sentry non riceve niente.

## Dopo il primo deploy di prod

- [ ] Il passo "Check the build is production" è verde.
- [ ] Gli eventi Sentry arrivano con ambiente `production`.

## Cron dello staging

I quattro workflow non prod partono solo a mano e chiamano `https://staging-crm.dbmito.it`:

- `Update Alerts`;
- `Delete Supabase Storage`;
- `Update Priority`;
- `Update Customers and Pratices`.

Senza i loro segreti si fermano prima di chiamare. I segreti si creano solo dopo un primo deploy dello staging riuscito, cioè passato dal controllo su DB e storage, in quest'ordine:

1. [ ] **Chiave dello staging:** generarla con `openssl rand -base64 32`. Mai la stessa di prod.
2. [ ] **Vercel → Environment Variables:** `CRON_SECRET_KEY` solo per **Preview**, con quel valore. Quella di prod resta una voce separata, solo Production.

   Poi rifare il deploy dello staging (un push su `dev`, o rilanciare l'ultimo run di `deploy-staging.yaml`): una variabile nuova entra solo nelle deployment successive.
3. [ ] **GitHub → Settings → Secrets → Actions:** `STAGING_CRON_SECRET_KEY` con lo stesso valore. `gh secret set STAGING_CRON_SECRET_KEY` lo legge da tastiera, senza stamparlo.
4. [ ] **Vercel → Settings → Deployment Protection → Protection Bypass for Automation:** attivarlo e mettere il segreto in `VERCEL_AUTOMATION_BYPASS_SECRET` su GitHub (`gh secret set VERCEL_AUTOMATION_BYPASS_SECRET`). Apre la protezione di tutte le deployment del progetto: lo conosce solo GitHub.
5. [ ] **Primo lancio:** `Update Alerts`, a mano.
   - Nel log compare `Cron target: https://staging-crm.dbmito.it` e il job è verde.
   - `Delete Supabase Storage` cancella i file di export dello storage dello staging: lanciarlo solo dopo questo controllo.

`crm.dbmito.it` resta senza protezione, perché i cron di prod non mandano il bypass. È un dominio di produzione, e la Standard Protection lo esclude.

## Variabili tolte

`DISCORD_*`, `CUSTOM_ACCESS`, `NEXT_PUBLIC_BASE_URL` e `PREVIEW_DB*` non servono più.

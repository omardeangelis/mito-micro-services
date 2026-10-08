---
domain: platform
title: Staging su Vercel
type: checklist-operativa
status: in_progress
last_updated: 2026-10-08
---

# Staging su Vercel

Su Vercel ci sono due ambienti: **Production** (`main`, `crm.dbmito.it`) e **staging** (`dev`, `mito-micro-services-staging.vercel.app`). Per Vercel lo staging è una deployment di Preview: prende le variabili dell'ambiente Preview e ha `VERCEL_ENV=preview`. Non ci sono altre preview: `vercel.json` spegne i deploy da Git, e pubblicano solo i due workflow.

## Come si comporta lo staging

- **Deploy:** ogni push su `dev` lancia `.github/workflows/deploy-staging.yaml`. Il workflow fa build e deploy con la CLI, come in produzione, e sposta l'alias `mito-micro-services-staging.vercel.app` sulla nuova deployment.
- **Login:** entrano solo gli utenti già nel database e gli indirizzi di `AUTH_ALLOWED_EMAILS`, con Azure o con il link via email (SendGrid). In produzione resta solo Azure, senza filtro.
- **Sentry:** non riceve niente. Lo staging non manda eventi, non carica source map e non crea release: lo fa solo la deployment con `VERCEL_ENV=production`.
- **Database:** è il progetto Supabase di sviluppo, lo stesso del locale. Un DB nuovo non va bene: le migrazioni non ricostruiscono lo schema (vedi [[tech-debt/crm/sezione-contatti]]).

## Da fare una volta

- [ ] **Vercel → Settings → Environment Variables → Preview** (tutti i branch): copiare i valori da `.env.development.local`, non da prod.
  - `SUPABASE_DB_CONNECTION_STRING`, `SUPABASE_MITO_PSW`: il DB di sviluppo.
  - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_KEY`: lo storage di sviluppo.
  - `NEXTAUTH_SECRET`: un valore nuovo (`openssl rand -base64 32`).
  - `AUTH_ALLOWED_EMAILS`: `info@sevedemo.com,info@spatalo.tech`.
  - `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`: la stessa app di prod, meglio con un client secret dedicato (vedi [[chore/migration/attivita-manuali-provider]]).
  - `SENDGRID_USERNAME`, `SENDGRID_API_KEY`, `SENDGRID_SERVER`, `SENDGRID_PORT`: servono agli indirizzi `info@`, che entrano con il link via email.
  - Da non impostare: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `NEXTAUTH_URL`, `NODE_ENV`.
- [ ] **Microsoft Entra → App registration → Authentication**: aggiungere il redirect URI `https://mito-micro-services-staging.vercel.app/api/auth/callback/azure-ad`. Niente wildcard su `*.vercel.app`.
- **Vercel → Settings → Deployment Protection**: Vercel Authentication è già attiva (al 2026-10-08 gli URL delle deployment rimandano al login Vercel). Lasciarla: lo staging lo apre solo chi è nel team Vercel, prima ancora del login dell'app. Le chiamate senza browser, come i cron, passano con l'header `x-vercel-protection-bypass`.
- [ ] Primo push su `dev` dopo il merge: controllare che il workflow finisca e che l'alias risponda.

## Variabili tolte

`DISCORD_*`, `CUSTOM_ACCESS`, `NEXT_PUBLIC_BASE_URL` e `PREVIEW_DB*` non servono più: si possono cancellare anche da Production su Vercel.

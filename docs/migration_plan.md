# Piano di migrazione — Next.js → Monorepo (Express + React SPA + Postgres)

> Documento di riferimento ad alto livello. Il dettaglio operativo di ogni fase è in `docs/migration/fase-N-*.md`.
> Ogni file di fase ha un frontmatter con `status` e `completed`: **gli agent che eseguono una fase devono aggiornare il frontmatter e spuntare le checkbox dei task man mano che procedono.**

## Stato delle fasi

| Fase | Documento | Stato |
|---|---|---|
| 0 — Setup monorepo | [fase-0-monorepo-setup.md](./migration/fase-0-monorepo-setup.md) | not_started |
| 1 — Package DB + migrazione Postgres | [fase-1-database-postgres.md](./migration/fase-1-database-postgres.md) | not_started |
| 2 — Backend Express | [fase-2-backend-express.md](./migration/fase-2-backend-express.md) | not_started |
| 3 — Frontend React SPA | [fase-3-frontend-spa.md](./migration/fase-3-frontend-spa.md) | not_started |
| 4 — Servizio Import API | [fase-4-import-api.md](./migration/fase-4-import-api.md) | not_started |
| 5 — Deploy e cutover | [fase-5-cutover.md](./migration/fase-5-cutover.md) | not_started |

Dipendenze: le fasi 0→1→2→3 sono sequenziali. La fase 4 può partire in parallelo alla fase 3 (richiede solo `packages/core` e `packages/db` dalla fase 2). La fase 5 chiude tutto.

## Contesto: stato attuale (rilevato 2026-06-11)

App **T3 stack** (`create-t3-app`): Next.js 14 App Router, tRPC v10 (~72 procedure in 10 router), Drizzle ORM su driver `postgres-js`, NextAuth v4 con sessioni su database, deploy su Vercel.

Fatti chiave che riducono il costo della migrazione:

1. **Il DB è già Postgres puro.** Supabase è solo l'hosting: nessuna RLS, nessuno schema `auth` Supabase, nessuna edge function, nessun realtime. Schema in `src/server/db/schema/`, tabelle con prefisso `mito-deutsche_`.
2. **`@supabase/supabase-js` è usato solo per lo storage** (bucket `mito-storage`, path `export/` — file di export temporanei cancellati da un cron). Tre punti di contatto: `src/server/client/supabase.ts`, `src/server/api/routers/supabase/route.ts`, `src/app/api/cron/delete/route.ts` (+ `src/lib/workers/export/service/saveExport.ts`).
3. **La pipeline di import è già REST e disaccoppiata**: `POST /api/import/process` (parse XLSX/CSV → validazione Zod → dedup) + endpoint `create`/`update` con batch da 1000 righe e `onConflictDoNothing`.
4. **Auth**: NextAuth v4 + `@auth/drizzle-adapter`, provider Azure AD (primario in produzione), Discord ed Email/SendGrid (solo non-prod o con `CUSTOM_ACCESS`). Sessioni su DB (tabelle `mito-deutsche_session`, `account`, `verificationToken`).
5. **Cron**: 4 job (`update`, `alert`, `priority`, `delete` export) come route Next.js chiamate da script Node con JWT firmato con `CRON_SECRET_KEY`. Schedulati da **8 workflow GitHub Actions** in `.github/workflows/` (prod UTC: update 00:00, delete 00:30, priority 01:30, alert 02:00 — tabella completa in `docs/migration/fase-0/t5-ci-workflows.md`).

## Architettura target

```
mito/                          (monorepo pnpm workspaces + Turborepo)
├── apps/
│   ├── web/                   React SPA — Vite + React Router + tRPC client
│   ├── api/                   Express — tRPC adapter, Auth.js, storage, export, cron
│   ├── import-api/            Servizio import — REST versionato, auth API-key (fase 4)
│   └── web-legacy/            App Next.js attuale (vive fino al cutover, poi rimossa)
├── packages/
│   ├── db/                    Schema Drizzle, migrazioni, client factory, seeds
│   ├── core/                  Logica di dominio condivisa: parsing/validazione/dedup
│   │                          import, calcolo priorità, logica cron
│   ├── storage/               Interfaccia storage + implementazione S3-compatibile
│   └── config/                tsconfig, eslint, validazione env condivisi
├── pnpm-workspace.yaml
└── turbo.json
```

## Decision log

| # | Decisione | Motivazione |
|---|---|---|
| D1 | **Tenere tRPC** sul backend Express (`@trpc/server/adapters/express`) | Le ~72 procedure e gli hook client `@trpc/react-query` migrano quasi invariati; riscrivere in REST triplicherebbe il costo delle fasi 2-3. REST resta per il servizio import (consumatori esterni). |
| D2 | **Auth.js (`@auth/express`)** al posto di NextAuth v4 | Riusa `@auth/drizzle-adapter`, le stesse tabelle e gli stessi provider: la migrazione auth è configurazione, non riscrittura. Nota: il provider `azure-ad` in Auth.js v5 si chiama `microsoft-entra-id`. |
| D3 | **Storage S3-compatibile** (AWS S3 / Cloudflare R2 / MinIO) dietro interfaccia in `packages/storage` | I file sono export temporanei: qualunque object store va bene; l'interfaccia rende la scelta reversibile. |
| D4 | **React Router (library mode)** per la SPA | Mappatura diretta delle 18 pagine App Router; hook equivalenti a `next/navigation`. Le parallel routes `@admin`/`@blacklist` diventano tab nella pagina profilo. |
| D5 | **node-cron in-process** in `apps/api` per i 4 job schedulati | Elimina il giro HTTP self-call con JWT a 5 minuti. Gli endpoint HTTP `/api/cron/*` restano per trigger manuali/esterni. |
| D6 | **Stesso dominio per SPA e API** in produzione (reverse proxy: `/` → SPA statica, `/api` → Express) | Cookie di sessione first-party, niente problemi CORS/third-party cookies. In dev: proxy di Vite. |
| D7 | Migrazione DB **prima** di tutto il resto (fase 1) | Legacy e nuovo stack condividono lo stesso Postgres durante tutta la migrazione: nessuna sincronizzazione dati necessaria. |
| D8 | **Hosting su Railway** per tutto: Postgres, storage, `api`, `import-api`, SPA (deciso 2026-06-11) | Piattaforma unica = manutenzione semplice (requisito del committente). Postgres con backup schedulati + PITR; Storage Buckets nativi S3-compatibili; environment prod/staging nello stesso progetto. Attività manuali in [attivita-manuali-provider.md](./migration/attivita-manuali-provider.md). |
| D9 | **Railway Storage Buckets + presigned URL** come implementazione di D3 | I bucket Railway sono privati per design (niente bucket pubblici) → presigned obbligatori, che era comunque l'opzione consigliata per gli export. Caveat: niente lifecycle rules → il cron `delete` resta necessario (F2.T6). |

## Mappa variabili d'ambiente (vecchie → nuove)

| Attuale | Nuova | Note |
|---|---|---|
| `SUPABASE_DB_CONNECTION_STRING` + `SUPABASE_MITO_PSW` | `DATABASE_URL` | Singola URL con password inclusa. Oggi la password è passata separatamente e **non validata** in `src/env.js`. |
| `PREVIEW_DB` + `PREVIEW_DB_PSW` | `DATABASE_URL` (per ambiente preview) | Stessa logica, un solo nome per ambiente. |
| `SUPABASE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Fase 2 (`packages/storage`); i valori li genera il Bucket Railway (D9), mappare via variable reference. |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | `AUTH_SECRET`, `AUTH_URL` | Convenzione Auth.js v5. |
| `AZURE_AD_CLIENT_ID/SECRET/TENANT_ID` | invariate (o convenzione `AUTH_MICROSOFT_ENTRA_ID_*`) | Aggiornare i redirect URI sul tenant Azure. |
| `NEXT_PUBLIC_*` | `VITE_*` | Fase 3. |
| `CRON_SECRET_KEY`, `SENDGRID_*`, `SENTRY_*`, `TELEGRAM_*` | invariate | |

## Rischi principali e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Login Azure AD rotto al cutover | Auth.js riusa tabelle e adapter; testare il flusso Entra ID per primo in staging, aggiornare i redirect URI prima del cutover. |
| Divergenza dati legacy/nuovo stack | D7: il DB migra in fase 1, tutto il resto condivide lo stesso Postgres. |
| Regressioni sulle 18 pagine | Migrazione pagina-per-pagina (fase 3) con checklist di parità; i router tRPC invariati garantiscono dati identici. |
| Logica cron sensibile (rate pagate, debito residuo, priorità) | Estratta in `packages/core` con test unitari **prima** di toccarla (task F2.T7). |
| Le API di Auth.js/`@auth/express` evolvono | Gli agent devono verificare le firme correnti sulla documentazione ufficiale (Context7/web) prima di implementare, non fidarsi dei nomi nel piano. |

## Struttura della documentazione

```
docs/
├── migration_plan.md            # questo file: riferimento ad alto livello
└── migration/
    ├── attivita-manuali-provider.md  # checklist attività manuali su dashboard/provider (Railway, Vercel, Supabase, Azure, DNS)
    ├── fase-N-*.md              # overview di fase (frontmatter di stato + tabella task)
    ├── fase-0/tN-*.md           # un file per task, dettaglio operativo (fasi 0 e 1)
    └── fase-1/tN-*.md
```

`attivita-manuali-provider.md` elenca, fase per fase, le operazioni che richiedono dashboard/credenziali/billing e **non possono essere eseguite dagli agent**: gli agent devono segnalare quando un task assegnato dipende da una di quelle voci non ancora spuntata.

Le fasi 0 e 1 hanno un file per ogni task (`docs/migration/fase-0/`, `docs/migration/fase-1/`) con frontmatter di stato proprio, step operativi puntuali, comandi e criteri di verifica. Le fasi 2-3 hanno il dettaglio nei file di fase; le cartelle per-task verranno create quando le fasi precedenti saranno avviate (stesso formato).

## Istruzioni per gli agent esecutori

1. Leggere questo file, poi l'overview della fase assegnata, poi il file del task assegnato (se esiste la cartella per-task).
2. Aggiornare il frontmatter a ogni transizione: `status: in_progress` all'avvio, `status: completed` + `completed: true` + `last_updated` alla fine — sia nel file del task sia, a fase conclusa, nell'overview di fase. Aggiornare anche le tabelle di stato (in questo file e nell'overview di fase).
3. Spuntare le checkbox di verifica (`- [ ]` → `- [x]`) man mano. Se un task viene saltato o modificato, annotarlo nella sezione "Note di esecuzione" in fondo al file.
4. I percorsi file citati si riferiscono al repo attuale (`mito-deutsche/`); dopo la fase 0 l'app vive in `apps/web-legacy/` e i percorsi vanno letti relativi a quella directory.
5. Ogni task ha criteri di **Verifica**: non considerare un task completo finché la verifica non passa.
6. Diverse sezioni "Note di esecuzione" chiedono di registrare dati misurati (versione Postgres, dimensione dump, esiti checklist): compilarle, servono ai task successivi.

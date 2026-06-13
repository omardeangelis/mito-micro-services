---
phase: 2
title: Backend Express (tRPC + Auth.js + storage + cron)
status: not_started
completed: false
depends_on: ["fase-1-database-postgres"]
last_updated: 2026-06-11
---

# Fase 2 — Backend Express (`apps/api`)

## Obiettivo

Costruire `apps/api` (Express) che replica **integralmente** il backend oggi dentro Next.js: i 10 router tRPC, l'auth, le route REST di import/export, i 4 cron e lo storage (sostituendo Supabase Storage con un object store S3-compatibile). Estrarre in `packages/core` la logica di dominio condivisa che servirà anche a `apps/import-api` (fase 4).

A fine fase il backend Express è deployato e testato in staging; il frontend legacy continua a usare il backend Next.js finché la fase 3 non porta la SPA sul nuovo API. **Non serve un periodo di doppio backend in produzione**: il cutover è frontend+backend insieme (fase 5).

## Stato attuale (riferimenti)

- Context tRPC: `src/server/api/trpc.ts` — `createTRPCContext` produce `{ db, supabaseClient, session, headers }`; procedure: `publicProcedure`, `protectedProcedure` (session check), `operatorProcedure` (join `operators`+`users`, inietta `ctx.operator`), `adminProcedure` (check `role === "ADMIN"`).
- Router: `src/server/api/root.ts` compone 10 router da `src/server/api/routers/`: `pratiche` (11 proc), `customer` (13), `operator` (6), `chat` (8), `task` (14), `user` (3), `analytics` (8), `import` (4), `export` (1), `supabase` (storage, ~4).
- Auth: `src/server/auth.ts` — NextAuth v4, sessioni **database**, `DrizzleAdapter`, provider Azure AD (sempre) + Discord + Email/SendGrid (non-prod o `CUSTOM_ACCESS`). Override `createUser` che chiama via HTTP `POST /api/operator/create`. Callback `session` aggiunge `user.id`; callback `redirect` manda a `/dashboard`.
- Middleware API: `src/middleware/auth.ts` — su `export|import|error|user|cron|operator|trpc`: richiede sessione **oppure** JWT Bearer (`CRON_SECRET_KEY`, payload `{ role: "cronjob", exp }`), verifica in `src/app/api/_utils/auth.ts`.
- Route REST attuali (da portare 1:1, sono chiamate anche dai web worker del frontend):
  - Import: `POST /api/import/process` (maxDuration 60s, file ≤ 4.4MB), `POST /api/import/create/{customers,practices,customerToPratica}`, `PUT /api/import/update/{customers,practices}`.
  - Export: `GET|POST /api/export/download`, `POST /api/export/importError`, `GET|POST /api/export/[export]/{callExport,defaultExport,fetchCall,fetchDefault,getMessages,saveExport}`.
  - Cron: `GET /api/cron/{update,alert,delete,priority}` (priority accetta anche POST con `taskId`).
  - Altro: `POST /api/operator/create`, `GET /api/auth/user`, `GET /api/user/preferences`, `GET /api/error` (Sentry).
- Storage Supabase (3+1 punti di contatto): `src/server/client/supabase.ts`, router `src/server/api/routers/supabase/route.ts` (upload/download/getPublicUrl/list/remove su bucket `mito-storage`, path `export/`), `src/app/api/cron/delete/route.ts`, `src/lib/workers/export/service/saveExport.ts` (lato client worker).
- Cron logic: `src/app/api/cron/update/{updatePractices,updateCustomer}.ts`, `src/app/api/cron/alert/route.ts`, `src/app/api/cron/priority/route.ts` (+ `src/lib/utils/priority`), script trigger `src/app/api/cron/scheduled/*.js`.

## Architettura target di `apps/api`

```
apps/api/src/
├── server.ts              # bootstrap: env, sentry, listen
├── app.ts                 # express app: middleware globali, mount moduli
├── env.ts                 # validazione env (@t3-oss/env-core + zod)
├── context.ts             # createTRPCContext per Express
├── auth/                  # Auth.js: config, route mount, session middleware
├── trpc/
│   ├── trpc.ts            # init tRPC, procedure (port di src/server/api/trpc.ts)
│   ├── root.ts            # appRouter (port di root.ts)
│   └── routers/           # i 10 router, spostati
├── routes/
│   ├── import.ts          # /api/import/*
│   ├── export.ts          # /api/export/*
│   ├── cron.ts            # /api/cron/* (trigger manuale)
│   └── operator.ts        # /api/operator/create
├── jobs/                  # node-cron: registrazione schedule → packages/core
└── middleware/            # requireSession, requireCronAuth, errorHandler
```

## Stack tecnico di riferimento (proposta, versioni verificate su npm il 2026-06-11)

| Area | Scelta | Versione | Nota chiave |
|---|---|---|---|
| Runtime | Node.js | **24 LTS** | Active LTS (maintenance fino ad apr 2028). `engines` esplicito nel package.json. |
| HTTP | Express | **^5.2** | v5 è `latest` da mar 2025. Greenfield → sintassi path-to-regexp v8 diretta (`/{*splat}`), errori async inoltrati automaticamente, `req.body` undefined senza parser. |
| RPC | @trpc/server | **^11.17** | v10 è EOL (solo backport sicurezza) e ha CVE-2025-68130. Vedi F2.T4. |
| Auth | @auth/express | **^0.12** | "Experimental" ma mantenuto (release apr 2026); Auth.js è in maintenance mode sotto il team Better Auth → exit strategy nelle Migliorie. |
| Adapter auth | @auth/drizzle-adapter | **^1.11** | API cambiata dalla 0.9: tabelle come oggetti espliciti. Nessuna colonna nuova richiesta. Vedi F2.T3. |
| Validazione | zod | **^3.25** (API v3) | Unica dipendenza nel workspace; codice nuovo libero di usare il subpath `zod/v4`. Flip a zod@4 post-cutover. Vedi F2.T7. |
| Storage | @aws-sdk/client-s3 + s3-request-presigner | ^3 | `forcePathStyle`, `region: "auto"`, checksum `WHEN_REQUIRED`. Vedi F2.T2. |
| Cron | croner | **^10** | Sostituisce node-cron (D5 resta: in-process): `protect` anti-overlap e `catch` nativi, TZ/DST corretti. |
| JWT cron | jose | **^6** | Sostituisce jsonwebtoken (manutenzione ferma): HS256 interoperabile coi token firmati dagli script legacy. |
| Logging | pino + pino-http | ^10 / ^11 | Standard de facto; request-id + redact su header sensibili. |
| Errori | @sentry/node | ^10 | OTel-based; init via `instrument.ts` + `node --import` (gotcha ESM). Vedi F2.T8. |
| Hardening | helmet, express-rate-limit, compression | ^8 / ^8 / ^1.8 | Tutti verificati compatibili Express 5. MemoryStore ok su singola istanza. |
| XLSX | xlsx (SheetJS) | **0.20.3 da cdn.sheetjs.com** | La 0.18.5 di npm è abbandonata e vulnerabile (2 CVE). Vedi F2.T7. |
| Env | @t3-oss/env-core | ^0.13 | Accetta qualsiasi validator Standard Schema (zod 3.25+ incluso). |
| Cache | lru-cache (+ @epic-web/cachified) | ^11 | In-process, niente Redis su singola istanza. Vedi Migliorie. |
| Test | vitest + supertest | **^4** / ^7 | Vitest 4: `projects` al posto di `workspace`, richiede Node ≥20. |
| Dev/Build | tsx (dev) + tsc (build) | — | Niente bundler per l'app (tsup è in maintenance mode); package interni col pattern JIT Turborepo (export di sorgenti `.ts`). |
| TypeScript | typescript | **^5.7** | Peer dep minima di tRPC v11 (il repo è a 5.3: bump nel monorepo). |

## Task

### F2.T1 — Scaffold `apps/api`
- [ ] `package.json` (`@mito/api`, `engines.node >= 24`): deps `express@^5.2`, `@trpc/server@^11` (vedi F2.T4), `superjson`, `zod@^3.25` (vedi F2.T7), `drizzle-orm` (stessa versione di `@mito/db`: i router importano gli operatori `eq`/`and`/`sql` direttamente), `@mito/db`, `@mito/core`, `@mito/storage`, `@auth/express@^0.12`, `@auth/drizzle-adapter@^1.11`, `croner@^10`, `jose@^6`, `@sentry/node@^10`, `pino@^10` + `pino-http@^11`, `helmet@^8`, `express-rate-limit@^8`, `compression@^1.8`, `@t3-oss/env-core@^0.13`; devDeps `tsx`, `typescript@^5.7`, `vitest@^4`, `supertest@^7`, `pino-pretty`, `@types/express@^5`.
  - **Niente `cors` né `cookie-parser`**: prod e dev sono same-origin (D6 + proxy Vite in fase 3 → CORS non si attiva mai) e Auth.js legge i cookie direttamente dagli header. **Niente `multer`**: l'upload import è raw body (vedi F2.T5). **Niente `node-cron`/`jsonwebtoken`**: sostituiti da `croner` e `jose` (vedi tabella stack).
- [ ] `env.ts` con `@t3-oss/env-core`: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `AZURE_AD_*`, `DISCORD_*`, `SENDGRID_*`, `CRON_SECRET_KEY`, `S3_*`, `SENTRY_DSN`, `PORT`, `CUSTOM_ACCESS`. Niente lettura raw di `process.env` fuori da questo file. (`WEB_ORIGIN` eliminata: niente CORS.)
- [ ] `app.ts`: `app.set("trust proxy", true)` (Railway è dietro proxy: serve a cookie `Secure`, Auth.js e rate-limit), `pino-http` (con `genReqId` → request-id e `redact` su `authorization`/`cookie`), `helmet`, `compression`, healthcheck `GET /healthz` (liveness) + `GET /readyz` (readiness: `SELECT 1` sul DB), error handler centralizzato.
- [ ] Script: `dev` (tsx watch), `build` (`tsc` → dist: niente bundler; i package interni `@mito/*` usano il pattern JIT di Turborepo, export di sorgenti `.ts` senza build), `start` (`node --import ./dist/instrument.js dist/server.js`, vedi F2.T8).

**Verifica:** `pnpm --filter @mito/api dev` espone `/healthz` → 200.

### F2.T2 — `packages/storage` (sostituto di Supabase Storage)
- [ ] Definire l'interfaccia a partire dai metodi Supabase realmente usati:
  ```ts
  interface StorageClient {
    upload(path: string, data: Buffer | Uint8Array, opts?: { upsert?: boolean; contentType?: string }): Promise<void>
    download(path: string): Promise<Buffer>
    getPublicUrl(path: string): string
    list(prefix: string, opts?: { limit?: number }): Promise<{ name: string }[]>
    remove(paths: string[]): Promise<void>
  }
  ```
- [ ] Implementazione S3 con `@aws-sdk/client-s3` (l'object store scelto è il **Railway Storage Bucket**, D8/D9 — S3-compatibile; l'interfaccia resta generica con `endpoint` custom + `forcePathStyle`, quindi compatibile anche con MinIO locale). Factory `createS3Storage(config)`.
- [ ] Config client obbligatoria per store non-AWS (verificata sul SDK, 2026-06-11): `forcePathStyle: true`, `region: "auto"`, e **`requestChecksumCalculation: "WHEN_REQUIRED"` + `responseChecksumValidation: "WHEN_REQUIRED"`** — dal SDK ≥3.729 i checksum CRC32 inviati di default rompono molti provider S3-compatibili. Per i presigned URL usare l'**endpoint pubblico** del bucket Railway (quello di rete privata non è raggiungibile dal browser).
- [ ] Implementazione `MemoryStorage` per i test.
- [ ] Provisionare il Bucket Railway (manuale, da dashboard — v. [attivita-manuali-provider.md](./attivita-manuali-provider.md)): uno per environment con credenziali isolate; Railway genera `ENDPOINT`/`ACCESS_KEY_ID`/`SECRET_ACCESS_KEY`/`BUCKET`/`REGION` da mappare sulle env `S3_*`. Per dev locale: MinIO in docker-compose.
- [ ] Nota semantica: oggi `getPublicUrl` di Supabase restituisce URL pubblici permanenti. **Deciso (D9): presigned URL** — i bucket Railway sono privati per design (i bucket pubblici non esistono) e i file sono export di dati clienti. La firma del metodo diventa `getDownloadUrl(path): Promise<string>` e va aggiornato il consumer in `saveExport.ts` (fase 3). Caveat: i bucket Railway non hanno lifecycle rules → la pulizia di `export/` resta a carico del cron `delete` (F2.T6).
- [ ] Migrare eventuali file presenti nel bucket Supabase: **non necessario** — sono export temporanei già soggetti a cancellazione periodica. Documentare la scelta.

**Verifica:** test vitest dell'implementazione S3 contro MinIO locale (upload→list→download→remove round-trip).

### F2.T3 — Auth.js su Express
> Le API di `@auth/express` vanno verificate sulla doc ufficiale al momento dell'implementazione (Context7: `authjs`); i nomi qui sotto sono indicativi.

- [ ] Config Auth.js in `auth/config.ts` con `@auth/drizzle-adapter@^1.11`. **Attenzione, API cambiata dalla 0.9**: la firma `DrizzleAdapter(db, createTable)` non esiste più (la table-prefix function è stata rimossa nella 1.0) — si passano le tabelle come oggetti espliciti: `DrizzleAdapter(db, { usersTable, accountsTable, sessionsTable, verificationTokensTable })`, importate da `@mito/db` (stesso prefisso `mito-deutsche_`, stesse tabelle → le sessioni esistenti restano valide). Session strategy: `database` (esplicita).
- [ ] Provider: `MicrosoftEntraID` (rename di `azure-ad` in Auth.js v5) **configurato con `id: "azure-ad"`**. Motivo (vincolante): le righe esistenti in `mito-deutsche_account` hanno `provider = 'azure-ad'` e il legacy continua a scriverle così fino al cutover — con l'id di default `microsoft-entra-id` l'adapter non troverebbe gli account esistenti e ogni operatore già registrato fallirebbe il login con `OAuthAccountNotLinked` (e non si possono rinominare le righe: il DB è condiviso col legacy). L'id custom mantiene anche il callback path attuale `/api/auth/callback/azure-ad` → su Azure si registra lo stesso path su host nuovo. Config: `issuer: https://login.microsoftonline.com/${TENANT_ID}/v2.0`, stessi scope `openid email profile User.Read offline_access`. Discord ed Email/SendGrid condizionati a `NODE_ENV !== "production" || CUSTOM_ACCESS` come oggi.
- [ ] **Verificare la compatibilità dello schema adapter**: diff tra le colonne attese da `@auth/drizzle-adapter@1.11` e le tabelle esistenti `mito-deutsche_{user,account,session,verificationToken}`. Esito atteso (changelog 0.9→1.11 verificato il 2026-06-11): **nessuna migrazione necessaria** — nessuna colonna rinominata; le novità (default applicativo `crypto.randomUUID` su `users.id`, tabella `authenticators` per WebAuthn) sono opzionali. Il diff resta come verifica formale; se emergesse qualcosa, migrazione Drizzle in `packages/db`.
- [ ] **Continuità di sessione legacy ↔ nuovo**: Auth.js v5 chiama il cookie `authjs.session-token` (prefisso `__Secure-` su HTTPS), NextAuth v4 `next-auth.session-token` — le righe in `mito-deutsche_session` sono condivise, ma con nomi cookie diversi al cutover tutti gli operatori rifarebbero login. Configurare `cookies.sessionToken.name` sul nome legacy (`__Secure-next-auth.session-token` in prod) e **validare presto in staging** che una sessione creata dal legacy venga letta dal nuovo backend (pattern non documentato ufficialmente: se non regge, accettare il re-login al cutover e annotarlo in fase 5).
- [ ] Port delle personalizzazioni:
  - callback `session`: aggiunge `user.id` (identico).
  - override `createUser`: **chiamata diretta** alla funzione di creazione operatore (estratta in `packages/core` o in `apps/api/src/services/operator.ts`) — eliminare la fetch HTTP self-call verso `/api/operator/create`.
  - le `pages` (`newUser`, `signOut`) diventano redirect gestiti dalla SPA in fase 3; lato API basta esporre l'info "first time" (l'operatore appena creato).
- [ ] Mount: `app.use("/api/auth", ExpressAuth(config))` — su Express 5 **non** usare la sintassi `"/api/auth/*"` degli esempi ufficiali (path-to-regexp v8 la rifiuta: o mount semplice o `"/api/auth/{*splat}"`; doc ed esempi di `@auth/express` sono fermi a Express 4). Dietro proxy: `trustHost: true` (o `AUTH_TRUST_HOST=1`) oltre al `trust proxy` di F2.T1, e `AUTH_URL` puntato all'origin pubblico, mai alla porta interna.
- [ ] Middleware `attachSession`: risolve la sessione con `getSession(req, authConfig)` di `@auth/express` (nota: lo snippet nella doc ufficiale omette il secondo argomento, che è obbligatorio) e la mette su `res.locals.session` per tutte le route; middleware `requireSession` che risponde 401 (port della logica di `src/middleware/auth.ts`).
- [ ] Aggiornare i **redirect URI** sulle app registration (manuale, v. [attivita-manuali-provider.md](./attivita-manuali-provider.md)): Azure (Entra ID) e Discord devono accettare `{AUTH_URL}/api/auth/callback/azure-ad` (path invariato grazie all'id custom) per staging e poi produzione.

**Verifica:** in staging, login completo con Entra ID → sessione persistita su DB → `GET /api/auth/session` restituisce l'utente con `id`. Login Discord/Email in dev.

### F2.T4 — tRPC su Express
- [ ] **tRPC v11, non v10** (supera l'idea iniziale di restare sulla major del legacy): v10 è ufficialmente non mantenuto (solo backport di sicurezza) e affetto da CVE-2025-68130 (prototype pollution via FormData, fix ≥10.45.3); `web-legacy` non sarà mai client di questo backend, quindi non esiste alcun vincolo di compatibilità. Delta server v10→v11 piccolo e verificato: `initTRPC` e transformer `superjson` in `create()` invariati, `errorFormatter` invariato, `createExpressMiddleware` da `@trpc/server/adapters/express` invariato; cambia `rawInput` → `getRawInput()` (async) nei middleware; richiede TypeScript ≥5.7.2. Lato client (fase 3) la SPA nasce su `@trpc/tanstack-react-query` + TanStack Query v5 (il setup raccomandato per progetti nuovi).
- [ ] **Indipendentemente dalla migrazione**: bump immediato di `@trpc/*` a `10.45.4` in `web-legacy` (patch release, chiude la CVE sul backend di produzione).
- [ ] `context.ts`:
  ```ts
  export const createTRPCContext = async ({ req, res }: CreateExpressContextOptions) => ({
    db,
    storage,                    // sostituisce supabaseClient
    session: res.locals.session ?? null,
    headers: req.headers,
  })
  ```
- [ ] Port di `src/server/api/trpc.ts` → `trpc/trpc.ts`: stesse 4 procedure (`public`, `protected`, `operator`, `admin`), stesso `errorFormatter` con `zodError`, stesso transformer `superjson`. Le query nei middleware (`enforceIsActiveOperator`, `enforceIsAdmin`) restano identiche.
- [ ] `git mv` dei 10 router da `apps/web-legacy/src/server/api/routers/` → `apps/api/src/trpc/routers/`. Sistemare gli import: `@/server/db` → `@mito/db`, `@/lib/constants/*`, `@/lib/utils/*`, `@/lib/types/*` → `@mito/core` (vedi F2.T7 — i due task vanno coordinati) o copie locali in `apps/api` per ciò che è solo server.
- [ ] Il router `supabase` va rinominato `storage` e riscritto contro `StorageClient` (stesse procedure, stessi input/output così il client non cambia: valutare di mantenere il nome `supabase` nel router fino alla fase 3 per non rompere `web-legacy`… **decisione**: i router in `web-legacy` non vengono toccati, quindi il rename è libero; la SPA in fase 3 userà i nomi nuovi).
- [ ] Mount: `app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext: createTRPCContext }))`.
- [ ] Esportare `export type AppRouter` da un entrypoint types-only (`@mito/api/types` o un piccolo package `packages/api-types`) per il client della fase 3.
- [ ] `web-legacy` **non** viene migrato a questo backend: mantiene la propria copia dei router fino alla dismissione. Congelare le modifiche ai router legacy da qui in avanti (ogni fix va fatto in entrambi o solo nel nuovo, annotandolo).

**Verifica:** test di integrazione con supertest: `analytics` (query semplice), `customer.getAll` con paginazione, una mutation `task`, accesso negato senza sessione (401/UNAUTHORIZED), `adminProcedure` negata a utente OPERATORE (FORBIDDEN "admin-only").

### F2.T5 — Route REST import/export
- [ ] Port delle route import con **stessi path e stessi contratti** (le chiamano i web worker del frontend):
  - `POST /api/import/process` — body raw: `express.raw({ type: "*/*", limit: "25mb" })`, **niente multer** (il contratto attuale è raw ArrayBuffer con nome file in query `?name=`, non multipart — va preservato 1:1 per i worker). Il limite 4.4MB era un vincolo Vercel: alzarlo a 25MB e rimuovere il check lato codice se presente (attenzione all'heap: il parse XLSX in memoria espande ~6-8x la dimensione file). La logica (parse XLSX→CSV, detect Wave/Standard, validazione Zod, trasformazione, dedup) arriva da `packages/core` (F2.T7).
  - `POST /api/import/create/{customers,practices,customerToPratica}` e `PUT /api/import/update/{customers,practices}` — batch 1000 + `onConflictDoNothing`, logica in `packages/core`, accesso al DB via `@mito/db`.
- [ ] Port delle route export: `download`, `importError` (genera XLSX errori e fa upload), e le 6 sotto-route di `[export]` (`callExport`, `defaultExport`, `fetchCall`, `fetchDefault`, `getMessages`, `saveExport`). Sostituire ogni uso di Supabase con `StorageClient`.
- [ ] `POST /api/operator/create`: diventa una funzione interna (usata da Auth.js `createUser`); la route HTTP resta solo se qualcosa di esterno la chiama (verificare: oggi la chiama solo l'adapter — quindi può sparire come endpoint).
- [ ] `GET /api/auth/user` e `GET /api/user/preferences`: coperti da `GET /api/auth/session` e dal router tRPC `user` — segnare come deprecati, non portarli.
- [ ] Applicare `requireSession` (o cron-JWT, vedi F2.T6) agli stessi gruppi di route protetti oggi dal middleware Next.js.

**Verifica:** import end-to-end via HTTP in staging con un file XLSX reale (formato Standard e formato Wave): process → create → verifica righe su DB → file errori su storage scaricabile.

### F2.T6 — Cron come job in-process
- [ ] Estrarre la logica dei 4 job in `packages/core` come funzioni pure che ricevono `(db, storage, now)`:
  - `updatePracticesRates(db, today)` — incremento `ratePagate`/decremento `debitoResiduo` (da `cron/update/updatePractices.ts`, query con `INTERVAL '1 day' * rate_pagate * 30`).
  - `updateCustomerAges(db, today)` — compleanni (da `cron/update/updateCustomer.ts`).
  - `processAlerts(db, today)` — alert scaduti → task followup priorità 150 (da `cron/alert/route.ts`).
  - `recalculateTaskPriorities(db, taskId?)` — batch 100 (da `cron/priority/route.ts` + `src/lib/utils/priority`).
  - `cleanExportFiles(storage)` — svuota `export/` (da `cron/delete/route.ts`).
- [ ] **Prima di estrarre**: scrivere test unitari di caratterizzazione su `updatePracticesRates` e `calculatePriority` (sono le logiche più sensibili: soldi e scadenze). Fixture con casi: rata che chiude la pratica, pratica già chiusa, guard `lastImportUpdate < 30 giorni`.
- [ ] `apps/api/src/jobs/index.ts`: registrazione con **`croner@^10`** (aggiorna D5: stessa decisione in-process, libreria migliore — node-cron è a manutenzione minima e senza overrun protection) con gli schedule di produzione attuali, **rilevati dai workflow GitHub Actions** (vedi tabella in `fase-0/t5-ci-workflows.md`): `update` pratiche/clienti `0 0 * * *` UTC, `delete` export `30 0 * * *`, `priority` `30 1 * * *`, `alert` `0 2 * * *`. Anti-overlap ed error handling nativi: `protect: true` (salta il trigger se il run precedente è ancora in corso) e `catch` (un errore loggato su Sentry non crasha il processo); `timezone: "UTC"` esplicita.
- [ ] Se si adotta la cache in-process (vedi Migliorie): i job invalidano le chiavi `analytics` a fine run — è il dividendo dei cron nello stesso processo.
- [ ] Mantenere gli endpoint `GET /api/cron/{update,alert,delete,priority}` come trigger manuali, protetti dal middleware `requireCronAuth` (port della verifica JWT con `CRON_SECRET_KEY` da `src/app/api/_utils/auth.ts`). Verifica con `jose` (`jwtVerify`, HS256): interoperabile coi token firmati con `jsonwebtoken` dagli script legacy (stesso secret, claim `role: "cronjob"` + `exp`).
- [ ] Gli script `src/app/api/cron/scheduled/*.js`, i relativi script npm e gli **8 workflow GitHub Actions cron** (`update-customer-practices*`, `delete-storage*`, `priority*`, `update-alert*`) diventano obsoleti: disattivarli/rimuoverli **solo al cutover** (fase 5, F5.T5) — fino ad allora i cron di produzione restano quelli legacy. In staging girano i nuovi.

**Verifica:** test unitari verdi; in staging, trigger manuale dei 4 endpoint → effetti attesi su DB/storage; un giro schedulato notturno completato (controllare i log).

### F2.T7 — `packages/core` (logica di dominio condivisa)
Consumatori: `apps/api` (F2.T4/T5/T6), `apps/import-api` (fase 4), in parte `apps/web` (zod schema e costanti).

- [ ] Spostare da `apps/web-legacy`:
  - `src/app/api/import/_types/` → `core/import/types.ts` (schemi `StandardImportFile`, `WaveFile`).
  - `src/app/api/import/_utils/` (parsing date/decimali italiani, `merge.ts` dedup, `nullable.ts`, split batch) → `core/import/`.
  - `src/app/api/import/process/_services/` (`standardFile.ts`, `waveFile.ts`, `parsePratica.ts`) → `core/import/`.
  - `src/lib/utils/priority.ts` → `core/tasks/priority.ts`.
  - `src/lib/constants/{productMap,schema,pagination,regex,timeframes}.ts` → `core/constants/` (solo ciò che è condiviso server/client; verificare import per import).
  - `src/lib/types/schemas.ts` (zod) → `core/schemas.ts`.
  - `createHashForCustomer` (spark-md5) da `src/lib/utils/index.ts` → `core/import/hash.ts`.
- [ ] Regola di dipendenza: `core` può dipendere da `@mito/db` (per i tipi e le insert helpers) e da zod/spark-md5/xlsx/papaparse; **mai** da Express, React o Next.
- [ ] **Strategia zod (vincolante per la convivenza)**: un'unica dipendenza `zod@^3.25` nel workspace. Gli schemi condivisi in `core` restano su **API v3** — drop-in per `web-legacy` (i ~10 form con `zodResolver` di `@hookform/resolvers@3` continuano a funzionare senza toccare il legacy); il codice solo-nuovo (`apps/api/env.ts`, route REST, fase 4) può usare l'API v4 via subpath **`zod/v4`** dello stesso pacchetto. La 3.25+ implementa Standard Schema, quindi `@t3-oss/env-core@^0.13` e tRPC v11 accettano entrambe le API. Post-cutover: flip a `zod@^4` (la root diventa API v4, il legacy non esiste più) con rewrite meccanico degli import `zod/v4` → `zod`.
- [ ] **drizzle-zod**: coordinare la versione con `packages/db` (fase 1). Le versioni recenti (≥0.8, che richiedono zod ≥3.25) generano schemi su API v4 → al momento dello spostamento di `schemas.ts` verificare: o si resta sulla linea che genera schemi API v3 (compatibili coi form legacy così come sono), o si bumpa solo `@hookform/resolvers@^5` in `web-legacy` (rileva v3/v4 a runtime — un solo dep bump, a quel punto la scelta è libera).
- [ ] **xlsx: mai la 0.18.5 di npm** (CVE-2023-30533 prototype pollution + CVE-2024-22363 ReDoS; il pacchetto npm è abbandonato dal maintainer). Nello spostare il parsing in `core`, pinnare il tarball ufficiale: `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`. I test di caratterizzazione di questo task coprono il bump. (`exceljs`, oggi usato per *scrivere* il file errori, resta com'è: stagnante ma solo in scrittura su dati nostri; eventuale consolidamento su SheetJS è un'ottimizzazione successiva.)
- [ ] **spark-md5 non si tocca**: `createHashFromString`/`createHashForCustomer` producono gli hash persistiti in `customers.uniqueHash` (dedup import) — cambiare libreria o algoritmo invaliderebbe il matching coi dati esistenti; inoltre gira anche nei web worker del frontend.
- [ ] In `web-legacy` sostituire gli import spostati con `@mito/core` (necessario perché i file vengono **spostati**, non copiati — un'unica fonte di verità).
- [ ] Test: portare qui gli eventuali test vitest esistenti su queste utility e aggiungere copertura su parsing date/decimali (formati: seriale Excel, `YYYYMMDD`, `M/D/YY`, `1.234,56`) e dedup (`mergeDuplicateCustomers` per CF/P.IVA/tempID).

**Verifica:** `web-legacy` builda e i suoi test passano dopo lo switch degli import; `pnpm --filter @mito/core test` verde.

### F2.T8 — Observability e hardening
- [ ] Sentry: `@sentry/node@^10` (basato su OpenTelemetry: auto-instrumenta Express, http e pg → tracing incluso senza setup extra). **Gotcha ESM**: `Sentry.init()` deve eseguire *prima* che `express` venga importato → file `instrument.ts` separato caricato con `node --import` (importarlo in cima a `server.ts` non basta: gli import sono hoisted); `Sentry.setupExpressErrorHandler(app)` dopo tutte le route, prima degli altri error handler. Stesso DSN di progetto o nuovo progetto Sentry dedicato all'API.
- [ ] Port degli header di sicurezza da `next.config.js` → `helmet@^8` con config equivalente (X-Frame-Options, ecc.); la parte di caching degli asset statici riguarda la SPA (fase 5, reverse proxy).
- [ ] Rate limiting di base sulle route auth e import (`express-rate-limit@^8`; il MemoryStore di default è corretto su singola istanza; richiede il `trust proxy` di F2.T1 per leggere l'IP reale dietro Railway).
- [ ] `compression` (con Brotli, ≥1.8) sulle risposte JSON: i payload superjson delle liste (customer/pratiche/task) sono grandi e comprimono bene.
- [ ] Graceful shutdown (SIGTERM, in quest'ordine): stop dei job croner, `server.close()`, chiusura pool postgres (`sql.end()`), `Sentry.flush()`.
- [ ] Dockerfile multi-stage per `apps/api` (base `node:24-slim`, `pnpm deploy --filter @mito/api --prod` per un'immagine senza devDeps, user non-root) + servizio in docker-compose di sviluppo (api + postgres + minio).

**Verifica:** errore forzato visibile su Sentry; `docker compose up` locale funzionante end-to-end.

### F2.T9 — Parità e collaudo staging
- [ ] Compilare una checklist di parità generata da `root.ts`: per ognuna delle ~72 procedure, esito di una chiamata di smoke test in staging (può essere uno script che enumera `appRouter._def` e segnala le procedure non coperte da test).
- [ ] Checklist route REST: le 6 import, le 8 export, le 4 cron — testate in staging.
- [ ] Deploy di staging documentato (env richieste, comandi).

**Verifica:** checklist allegata in fondo a questo file, tutta verde.

## Migliorie infrastrutturali proposte (da valutare — non bloccanti per la parità)

Analisi del 2026-06-11. Principio guida: prima la parità (port 1:1), le ottimizzazioni dietro interfacce che non cambiano i contratti. Ipotesi di deploy: **singola istanza** su Railway — semplifica tutto ciò che segue; da riverificare se si scala orizzontalmente.

### Cache: in-process, niente Redis (per ora)
Con una singola istanza un layer Redis/Valkey è infrastruttura ingiustificata (un servizio stateful in più da gestire su Railway, ~10$/GB RAM/mese) e non offre nulla che un processo solo non faccia meglio. Proposta: `lru-cache@^11` (+ eventualmente `@epic-web/cachified` per stale-while-revalidate e dedup delle richieste in-flight) dietro un modulo `apps/api/src/cache.ts` con API minimale, così un eventuale store distribuito futuro resta una sostituzione locale. Due bersagli concreti, misurati sul codice attuale:

1. **`operatorProcedure`** esegue 2 SELECT (operatore + ruolo) per *ogni* richiesta autenticata (`src/server/api/trpc.ts:109-148`): cache `userId → operator` con TTL 30–60s e invalidazione esplicita sulle mutation del router `operator`. Caveat da documentare: la disattivazione di un operatore impiega fino al TTL a propagarsi; con 2+ istanze l'invalidazione esplicita si rompe.
2. **Router `analytics`** (8 procedure: SUM/AVG/COUNT/GROUP BY con JOIN multipli su `practices`): i dati cambiano solo con import e cron notturni → cache con TTL 5–15 min + invalidazione diretta a fine job (F2.T6) e a fine import.

**Non** cachare le sessioni in fase 2: il costo è una SELECT per richiesta, la semantica di revoca è delicata; rivalutare con numeri di staging.

### Coda job (decisione che riguarda la fase 4, ma nasce qui)
La fase 4 prevede "coda in-process, poi BullMQ+Redis se serve". Proposta alternativa: **pg-boss@^12** sul Postgres esistente — retry con backoff, dead-letter queue, cron scheduling e `singletonKey` che implementa l'idempotenza per chiave nativamente (si sposa con l'header `Idempotency-Key` previsto). Per import sporadici evita Redis del tutto; anche `api_keys`/audit log stanno bene su Postgres. BullMQ resta l'upgrade documentato se mai servisse throughput serio.

### Framework di `apps/import-api` (fase 4)
`apps/api` resta Express 5: è l'unico stack con adapter tRPC ufficiale **e** pacchetto Auth.js first-party (Fastify non ha `@auth/fastify`; su Hono entrambi i pilastri sarebbero community). Per `apps/import-api` però non servono né tRPC né Auth.js, e il deliverable chiave è la spec OpenAPI verso terzi: valutare **Hono + `@hono/zod-openapi`** — la definizione di rotta *è* simultaneamente spec OpenAPI, validazione e tipi del handler (zero drift spec/implementazione), con UI Scalar/Swagger pronte. Vincolo: richiede zod v4 (ok: import-api è greenfield e usa `zod/v4`). Alternativa conservativa: Express 5 + `@asteasolutions/zod-to-openapi` (anch'esso zod ≥4 dalla v8), accettando spec e handler separati e l'uniformità di stack tra i due servizi.

### Auth a medio termine
Auth.js è in **maintenance mode sotto il team Better Auth** (set 2025: solo security patch; raccomandano Better Auth per i progetti nuovi). Per questa fase `@auth/express` resta la scelta giusta: è l'unica con riuso totale di tabelle, sessioni e provider-id del legacy — la convivenza di Better Auth con NextAuth v4 sullo stesso DB è di fatto impraticabile (tipi colonna incompatibili: `emailVerified` boolean vs timestamp; sessioni mai interoperabili by design; provider id `microsoft` hardcoded). **Post-cutover**, con un solo writer sul DB, pianificare la migrazione a Better Auth: guida ufficiale esistente, trasformazione SQL one-shot, re-login una tantum accettabile per utenti interni. Da aggiungere al decision log di `migration_plan.md` quando ratificata.

### Postgres
- I cron `update`/`priority` fanno loop di UPDATE singole (potenzialmente migliaia di righe): in fase 2 si portano 1:1 (parità prima di tutto, protetti dai test di caratterizzazione di F2.T6); il batching (`UPDATE ... FROM (VALUES ...)`) è un'ottimizzazione successiva già "sbloccata" dall'estrazione in `packages/core`.
- Pool `postgres-js`: dimensionare `max` esplicitamente (default 10) considerando che api + cron in-process + futuro import-api condividono lo stesso Postgres Railway.

## Definition of Done

- `apps/api` replica tutte le funzionalità backend correnti, in staging, con login Entra ID funzionante.
- Supabase Storage sostituito da `packages/storage` (S3-compatibile) in tutto il codice nuovo.
- `packages/core` contiene la logica import/cron/priorità con test; `web-legacy` la consuma da lì (nessuna duplicazione).
- I cron girano in-process su staging.
- `web-legacy` resta l'unico backend di **produzione** fino alla fase 5.

## Rischi specifici

- **Compatibilità adapter Auth.js**: differenze di colonne tra `@auth/drizzle-adapter` v0.9 (attuale) e la 1.11 → mitigato da F2.T3 (diff schema); la verifica preliminare sul changelog non mostra colonne rinominate, ma resta il primo task da chiudere in staging (login Entra ID end-to-end).
- **Auth.js in maintenance mode + `@auth/express` "experimental"**: API stabile di fatto (le release sono bump di `@auth/core`) ma il supporto Express 5 è solo formale — doc ed esempi fermi a Express 4, mount syntax da adattare, insidie note su proxy/`trustHost`. Mitigazione: login+sessione testati per primi in staging; exit strategy Better Auth post-cutover documentata nelle Migliorie.
- **Versioni zod/drizzle-zod disallineate tra core e legacy**: gli schemi condivisi devono restare consumabili dai form di `web-legacy` → strategia vincolante in F2.T7 (unica `zod@^3.25`, API v3 negli schemi condivisi).
- **Contratti dei worker frontend**: i web worker chiamano le route REST con path/formati precisi; ogni deviazione rompe import/export in fase 3 → port 1:1 e test con file reali (F2.T5).
- **Doppia manutenzione router tRPC** tra `web-legacy` e `api` durante le fasi 2-3 → congelare le feature sul legacy; hotfix replicati a mano e annotati nelle Note di esecuzione.

## Note di esecuzione

_(da compilare durante l'esecuzione)_

---
domain: platform
title: Manutenzione delle dipendenze
type: piano
status: in_progress
last_updated: 2026-10-20
---

# Manutenzione delle dipendenze

## Stato al 2026-10-14

Rilevato con `pnpm outdated` e `pnpm audit` su `dev` (`7978a4a`).

- **89 pacchetti non aggiornati, 41 indietro di almeno un major.** La famiglia Drizzle è sulle 0.x, dove anche un minor rompe: drizzle-orm 0.33 → 0.45, drizzle-kit 0.24 → 0.31, drizzle-zod 0.5 → 0.8.
- **`pnpm audit`:** 10 critical, 87 high, 73 moderate, 19 low. Lo stesso pacchetto conta una volta per ogni percorso, quindi le correzioni da fare sono meno.
- **Renovate** è configurato (`renovate.json`, major con approvazione dalla dashboard) ma non gira: non c'è nessun branch suo.

Le vulnerabilità che toccano il runtime di produzione:

| Pacchetto | Problema | Correzione |
|---|---|---|
| `next` 14.2.5 | Auth bypass, cache poisoning, DoS: corretti fino a 14.2.35. Altri esistono solo da 15.5.x: DoS sulle Server Actions, SSRF, RCE nell'ottimizzazione immagini (da verificare se tocca una deployment su Vercel) | 14.2.35 (W0), poi Next 15.5 (W2) |
| `next-auth` 4.24.7 | Critica: normalizzazione delle email, usata dal login via email dello staging | 4.24.15, stesso major (W0) |
| `jsonwebtoken` → `jws` | Verifica HMAC sbagliata: è l'autenticazione dei cron | 9.0.3 (W0) |
| `drizzle-orm` 0.33 | SQL injection tramite identificatori | 0.45.2+ (W1) |
| `xlsx` 0.18.5 | Prototype pollution e ReDoS. Su npm non c'è una versione corretta, e l'import legge file degli utenti | SheetJS 0.20.x dal CDN di SheetJS, in una PR a parte con test di import ed export |
| `@trpc/server`, `nanoid` | Stesso major | 10.45.4, 5.1.x (W0) |
| `nodemailer` | Corretto solo nei major nuovi; lo usa il login via email | W2 |

Le critiche di `vitest` e `tinypool` toccano solo gli strumenti di test.

## Regole

- Una PR per famiglia di pacchetti. Per le 0.x un minor vale come un major.
- Ogni ondata passa i gate di CI (lint, tsc, test, build) e si prova sullo staging prima di andare in `main`.
- **Mai nella stessa release di un cutover di [[chore/migrazione-gcp]]**, e niente merge di dipendenze nella settimana di un cutover di prod.
- Il build locale si fa in un worktree fuori dal repo, senza i file `.env*` (vedi `AGENTS.md`). Dentro il repo ESLint risale al `.eslintrc.cjs` della cartella padre, che non ha `root: true`.

## Ondate

| Ondata | Cosa | Quando | Stato |
|---|---|---|---|
| W0 | Patch di sicurezza dentro il major: next 14.2.35, eslint-config-next, next-auth 4.24.15, jsonwebtoken 9.0.3, tRPC 10.45.4, nanoid 5.1.x, ws 8.x, vitest 1.x, postcss 8.x, più i transitivi corretti nello stesso major con `pnpm.overrides`. Esclusi: xlsx, nodemailer, supabase-js, Drizzle, postgres, prettier | Subito, indipendente da GCP | fatta (PR #20, su `dev`) |
| W0b | xlsx dal CDN di SheetJS (0.20.x), con test di caratterizzazione su import ed export | Dopo W0 | da fare |
| W1 | drizzle-orm 0.45, drizzle-kit 0.31, drizzle-zod, postgres 3.4.x. Il controllo: `pnpm db:generate` non produce differenze. Si prova su Supabase prima di spostare il DB | Prima di S3 della migrazione GCP | fatta (PR #27, su `dev`) |
| W2 | Next 15.5 + React 19, insieme a TanStack Query 5 e tRPC 11, più nodemailer. Prima uno spike: tremor 3 e react-day-picker 8 con React 19, codemod per le API di richiesta asincrone | Spike in parallelo; merge fuori dalle settimane di cutover | da fare |
| W3 | Il resto, una famiglia alla volta: zod 4, Tailwind 4, ESLint flat config + typescript-eslint 8, vitest e jsdom, Sentry 11, date-fns 4, zustand 5, react-day-picker, lucide-react, i minor di Radix e di react-hook-form | Dopo W2 | da fare |
| Renovate | Attivare l'app: automerge dei patch su `dev` con la CI verde, major su approvazione (la regola c'è già), gruppi per famiglia (Radix, tRPC, Drizzle) | Dopo W1 | da fare |

Fuori dalle ondate, da decidere a parte:

- **Effect 4:** `AGENTS.md` fissa Effect 3.x come target. Si va solo all'ultima 3.x.
- **TypeScript 7** (il port nativo): rimandato.
- **Node:** resta 22.x (`engines.node`), LTS fino ad aprile 2027.

## Note di esecuzione

_(per ogni ondata: data, PR, versioni prima e dopo, esito dei gate, residui di `pnpm audit`)_

### W0 — 2026-10-18, branch `chore/deps-w0`

- 12 dipendenze dirette aggiornate dentro il major: next 14.2.35, eslint-config-next 14.2.35, next-auth 4.24.15, jsonwebtoken 9.0.3, @trpc/* 10.45.4, nanoid 5.1.16, ws 8.22.0, vitest 1.6.1, postcss 8.5.30.
- 17 `pnpm.overrides` sui transitivi, tutti dentro il major: brace-expansion, minimatch (3/5/8/9), picomatch, browserslist, cross-spawn, glob, lodash, rollup 3, source-map-js, tar-fs, tmp, postcss, nanoid 3.
- next-auth 4.24.15 tipizza `createUser` come unione della firma legacy e di quella di `@auth/core`. Il parametro di `createUser` in `src/server/auth.ts` ora è dichiarato in modo esplicito, e il test lo chiama con la firma legacy. A runtime NextAuth v4 lo chiama ancora senza `id` (`core/lib/callback-handler.js`): il comportamento non cambia.
- Il warning `unmet peer nodemailer@^7.0.7` è accettato: il peer è opzionale e next-auth usa solo `createTransport` e `sendMail`, uguali in nodemailer 6. nodemailer va in W2.
- Gate: lint, tsc, 302/302 test, build verdi.
- `pnpm audit --prod`: da 72 high + 5 critical a 19 high + 3 critical. Residui:
  - next (10): corretti solo in 15.x → W2;
  - nodemailer (5) → W2;
  - xlsx (2) → W0b;
  - drizzle-orm (1) → W1;
  - @auth/core (2): l'adapter lo cita solo nei commenti, quindi a runtime non viene caricato; si risolve con l'aggiornamento dell'auth;
  - serialize-javascript (1): corretto solo nel major 7;
  - braces (1): nessuna patch.

### W1 — 2026-10-19, branch `chore/deps-w1`

- drizzle-orm 0.33 → 0.45.4, drizzle-kit 0.24 → 0.31.11, postgres 3.4.4 → 3.4.9.
- drizzle-zod resta 0.5.1: va con drizzle-orm 0.45 (test verdi), e le versioni dopo la 0.5 cambiano l'API degli schemi; l'ultima (0.8) vuole zod 3.25 o 4. Va in W3, con zod 4.
- **Drizzle 0.45 avvolge l'errore del driver in un `DrizzleQueryError`**, il cui messaggio contiene la query e i suoi parametri, cioè i dati dei clienti. Il codice (SQLSTATE) e il messaggio del driver stanno nel suo `cause`. Per non mandarli al browser, ai log e a Sentry:
  - `driverError` (`src/server/db/driverError.ts`) restituisce l'errore del driver;
  - `toDbError` (Effect) e le 5 route di import lo usano, come prima dell'aggiornamento;
  - un middleware tRPC dentro quello di Sentry (`driverErrorMiddleware` in `src/server/api/trpc.ts`): una procedura che fallisce su una query fallisce con il messaggio del driver. Un `TRPCError` con un messaggio suo resta com'è;
  - `dropQueryParams` nel `beforeSend` di `sentry.server.config.ts` toglie i parametri da eccezioni, breadcrumb e messaggio, per ogni altro percorso (per esempio i cron).
- I test che scrivono direttamente con Drizzle leggono l'errore del driver con `driverFailure` (`src/test/db.ts`); le asserzioni sono le stesse. Una prova al contrario (middleware e pulizia tolti) fa fallire i 4 test nuovi.
- `pnpm db:generate`: solo la riga nota `ALTER TABLE customers ... SET DEFAULT '<id casuale>'`; lo snapshot di drizzle-kit 0.31 aggiunge campi vuoti (`policies`, `roles`, `checkConstraints`, `isRLSEnabled`, `views`), stessa versione 7. Nessun file generato è stato tenuto.
- Gate prima del merge di `dev`: lint, tsc, 1105/1105 test, build, `api:build` e `api:smoke` verdi.
- `pnpm audit --prod`: drizzle-orm non c'è più (high da 19 a 18).
- `pnpm db:migrate` con drizzle-kit 0.31 sul DB di sviluppo (Supabase): ha applicato `20261019142325_blushing_roland_deschain` di PR5a, in sospeso. Sulla tabella delle task restano `mito-deutsche_task_pkey`, `task_customer_active_uidx` e `task_customer_id_idx`.
- Gate dopo il merge di `dev` (PR #25 e #26): 1825/1825 test.
- 2026-10-20, PR #27 su `dev`. Su staging gira l'immagine `mito-api:40cdbcd` (revisione `00004`): `/health` 200. Un lancio a mano di `update` e `delete-export`, già andati quel giorno, risponde `skipped` e lascia `cron_run` com'era: le due `INSERT ... ON CONFLICT` di `startRun` funzionano con postgres.js sul DB di sviluppo.
- Per un branch aperto prima di W1: dopo il merge di `dev` serve `pnpm install` (cambia il lockfile; in un conflitto su `pnpm-lock.yaml` si prende quello di `dev` e si rilancia `pnpm install`). Un test che aspetta direttamente una query Drizzle e ne controlla l'errore (`code`, messaggio) la avvolge in `driverFailure(...)`; `DbError` e `runTrpc` non cambiano. Gli script `db:*` e `drizzle-kit generate --custom --name=...` restano uguali.

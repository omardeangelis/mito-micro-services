---
domain: platform
type: chore
status: draft
links:
  - "[[chore/migrazione-effect]]"
  - "[[chore/migrazione-gcp]]"
  - "[[chore/manutenzione-dipendenze]]"
  - "[[chore/migrazione-frontend-react]]"
  - "[[chore/fase-2-httpapi]]"
  - "[[chore/migration/fase-3-frontend-spa]]"
  - "[[specs/crm/auth-better-auth/PLAN]]"
  - "[[specs/crm/gestione-operatori/PLAN]]"
  - "[[tech-debt/crm/analytics-effect]]"
created: 2026-10-27
updated: 2026-10-27
---

# Roadmap: backend su Effect 4, app React, un solo rilascio

> Domanda di partenza (2026-10-27): "Vorremmo dividerci in 2: aggiornare le librerie lato BE rimaste indietro, con l'obiettivo anche di rimuovere tRPC, e passare ad avere una React App. [...] L'idea è uscire in un unico colpo con il nuovo stack direttamente su prod invece di aggiornare next da 14 a 16, aggiornare trpc e poi deprecare tutto."

Questa pagina mette in fila il lavoro che porta in prod il nuovo stack: backend su Effect 4 con `HttpApi`, app React in `apps/web`, Next.js e tRPC spenti. **Dal 2026-10-27 è il punto d'ingresso del piano:** l'ordine dei lavori, le decisioni e il debito aperto della migrazione (§8) stanno qui. Le altre pagine restano il dettaglio:
- [[chore/migrazione-gcp]]: dove gira il codice, la checklist del go/no-go e la finestra del rilascio in prod;
- [[specs/crm/auth-better-auth/PLAN]]: l'auth (1.2, e la PR D prima di S6);
- [[chore/migrazione-frontend-react]]: il filone frontend (1.a, 1.b, 1.c, 2.2, 2.3 e le pagine della fase 3), task per task, con la mappa delle rotte e delle server action;
- [[chore/fase-2-httpapi]]: la fase 2 (2.1, 2.2, 2.3), con le decisioni da prendere (H1–H20) e i task del backend, del frontend e dello staging;
- [[chore/migrazione-effect]], chiusa per L1 e L2: le regole per i servizi (§2), come si costruisce `HttpApi` (§3), le route REST (§6) e il debito chiuso (§7).

**Il punto di partenza (2026-10-27).** L1 e L2 di [[chore/migrazione-effect]] sono fatti per tutti i router: ogni procedura tRPC è un adapter di un servizio Effect. Restano il passo 8 (l'auth: le PR C1 e C2 di better-auth sono in `dev`, la C2 con la [PR #108](https://github.com/omardeangelis/mito-micro-services/pull/108) del 2026-10-27; la D non è iniziata e aspetta G2), che qui è il punto 1.2, e la P2 di [[specs/crm/gestione-operatori/PLAN]], che qui è nella fase 5. L3, il trasporto, non è iniziato: sono le fasi 2 e 3. `dev` → `main` è fermo fino al go/no-go dello staging (S6 di [[chore/migrazione-gcp]]).

## 1. Decisioni del 2026-10-27

| # | Decisione | Perché | Cosa supera |
|---|---|---|---|
| R1 | **L'app Next.js di oggi non si aggiorna.** Niente Next 15 o 16, React 19, TanStack Query 5 o tRPC 11 sull'app di oggi: il nuovo stack va in prod in un solo rilascio | Sarebbe lavoro da buttare: l'app React lo sostituisce | W2 di [[chore/manutenzione-dipendenze]], e la parte di W3 che tocca l'app Next |
| R2 | **Effect 4, subito.** È il primo passo del backend | Effect 4 è stabile: 4.0.0 del 2026-10-01, 4.0.6 del 2026-10-22 (`latest` su npm). `HttpApi` sta in `effect/http-api`, non più sotto `unstable/`. Un endpoint `HttpApi` scritto su Effect 3 andrebbe riscritto | Il vincolo 1 del §3 di [[chore/migrazione-effect]]; "Effect 4: solo l'ultima 3.x" di [[chore/manutenzione-dipendenze]]; "`effect` 3.x" di `AGENTS.md`, che cambia con la PR di Effect 4 |
| R3 | **Drizzle resta su 0.45.** La 1.0 non si aspetta | Il 2026-10-27 è in release candidate (`1.0.0-rc.5`), senza una data per la stabile | – |
| R4 | **Niente Tremor nell'app React.** I grafici sono i componenti chart di shadcn, con Recharts sotto | Meno dipendenze: oltre a `@tremor/react`, il repo tiene `@headlessui/react` e `@headlessui/tailwindcss` solo per Tremor (nessun file di `src` importa Headless UI; il plugin sta in `tailwind.config.ts`) | – |
| R5 | **Il layout da telefono va alla fine**, dopo i flussi da rifare | Un layout pensato sui flussi di oggi andrebbe rifatto | Il FOLLOW-UP sui 768 px di [[tech-debt/crm/analytics-effect]] |
| R6 | **Il rilascio porta in prod lo status quo, sul nuovo stack:** stesse pagine, stessi flussi. Quali flussi rifare si decide dopo il rilascio | Il collaudo di parità confronta ogni pagina nuova con quella di Next sugli stessi dati, e regge solo se le due fanno le stesse cose. Il rilascio è già grande senza cambi di prodotto | – |
| R7 | **Tailwind 4** in `apps/web` | L'app parte da zero, e la versione corrente di shadcn è per Tailwind 4 e React 19 | – |
| R8 | **TanStack Query 5 su `HttpApiClient`** come data layer dell'app React | TanStack Query è lo strato che l'app di oggi usa già tramite `@trpc/react-query` (cache, invalidazione, stati di caricamento): cambia il client sotto, non il modello. `HttpApiClient` si ricava dalla definizione di `HttpApi`: i tipi arrivano senza un passo di generazione, e ogni errore arriva decodificato nella sua classe taggata. L'app porta `effect` nel bundle, ma lo porta comunque per gli `Schema` dei form (§2, regola 3). Scartato un client generato dall'OpenAPI: un passo di generazione da tenere allineato, e gli errori come status più corpo, non come classi | Il vincolo 3 del §3 di [[chore/migrazione-effect]] |
| R9 | **L'app React si serve da Vercel come sito statico**, con le stesse rewrite di oggi verso Cloud Run | Stesso dominio e cookie first-party, nessun CORS, nessun cambio di DNS (che dipende da una società esterna), l'URI di Azure non cambia. Un sito statico non usa funzioni serverless, quindi il limite di 12 funzioni del piano Hobby (rischio di [[chore/migrazione-gcp]]) non lo riguarda | – |
| R10 | **In prod si va tutto insieme**, in una sola finestra serale: backend su Cloud Run con Cloud SQL, GCS e better-auth, cron su Cloud Scheduler, app React sul dominio. Niente passi uno per notte | Omar: "la rilasciamo in un colpo solo, non serve a niente fare quel passaggio progressivo". I passi intermedi esistevano solo per la prod: lo staging fa girare tutti i pezzi insieme, ed è quella combinazione che S6 osserva per 2 settimane | L'ordine della fase P e il principio "un passo alla volta, mai due nella stessa notte" di [[chore/migrazione-gcp]]; "mai due cambi nella stessa notte" di [[specs/crm/auth-better-auth/SPEC]] e del suo PLAN; "nessun refactor nella stessa release di un cutover GCP" del §4 di [[chore/migrazione-effect]], ripetuto nelle spec dei router. Resta valido "niente merge durante le 2 settimane di osservazione di S6" |

## 2. Due filoni, un contratto

- **Backend:** Effect 4, auth, poi i gruppi `HttpApi`.
- **Frontend:** l'app React in `apps/web`.

I due filoni si incontrano su `HttpApi`: l'app React chiama solo quello (decisione del 2026-10-25, §3 di [[chore/migrazione-effect]]). L'app Next resta su tRPC, e tRPC si toglie quando si spegne l'app Next. Per questo i due filoni vanno in parallelo, ma non sono indipendenti.

Regole:
1. **Il backend resta almeno un gruppo avanti.** Il frontend è il lavoro più lungo: 14 pagine, 7 layout, 110 file `"use client"`, 47 file su `@/trpc/server` (server component e i 14 file di server action), 42 su `@/trpc/react`, 81 file che importano `next/*`.
2. **Prima la definizione, poi gli handler.** La definizione di un gruppo (endpoint, `Schema` di payload, risposte ed errori) entra in `dev` prima dei suoi handler, così il frontend lavora sulla definizione.
3. **Gli schemi zod di `@mito/domain` restano finché li usa l'app Next.** Il gruppo `HttpApi` usa il suo `Schema`, e i form dell'app React lo usano tramite Standard Schema. Gli schemi zod escono con l'app Next.
4. **L'app Next non cambia per il nuovo stack.** I suoi adapter tRPC restano finché c'è.
5. Valgono le regole di [[chore/migrazione-effect]]: una PR per gruppo, refactor e correzioni in PR diverse, la revisione di Leonardo sulle PR che toccano permessi, ruoli o auth.

## 3. Le fasi, in serie

Le fasi vanno in quest'ordine: 1 → 2 → 3 → 4 → 5. La 6 parte dopo la 4 e può andare insieme alla 5. Dentro una fase, il backend e il frontend lavorano in parallelo.

### Fase 1: fondamenta

I due filoni partono insieme e non hanno bisogno l'uno dell'altro.

**Backend, in serie:**

| # | Attività | Fatto quando |
|---|---|---|
| 1.1 | **Effect 3 → 4** in `packages/server` (122 file che importano `effect`), `apps/api` (13), `src` (10) e `packages/db` (2), seguendo il `MIGRATION.md` di Effect 4, più lo stile di Effect 4 (decisione di Omar del 2026-10-27). Quattro PR, con spec e piano in [[specs/crm/effect-4/SPEC]] e [[specs/crm/effect-4/PLAN]]: **1** Effect 4 con i soli cambi necessari, e `AGENTS.md` a Effect 4; **2** vitest 1.6 → 5, in parallelo alla 1, perché `@effect/vitest` 4 lo richiede; **3** i test che eseguono programmi Effect su `@effect/vitest`; **4** servizi con layer statici, errori in `Schema.TaggedError` e funzioni con `Effect.fn` | Le quattro PR in `dev` con i gate di CI verdi (lint, tsc, test, build, `api:build`, `api:smoke`) e le stesse asserzioni |
| 1.2 | **better-auth: la C2 (il passaggio)** di [[specs/crm/auth-better-auth/PLAN]], prima di Effect 4. **Fatta:** in `dev` con la [PR #108](https://github.com/omardeangelis/mito-micro-services/pull/108) del 2026-10-27. Da lì il login di Next.js e del backend lo fa better-auth. La D (la pulizia: via NextAuth) aspetta G2, la prova del login su staging, che va con le altre prove a fine migrazione: è un prerequisito della fase 4, e con lei si chiudono il passo 8 di [[chore/migrazione-effect]] e TD4 | La C2 in `dev` con i gate di CI verdi. Il login di Azure e via email su staging, con i comportamenti della disattivazione, lo prova G2 |

La C2 è andata prima di Effect 4, come previsto. 1.1 converte anche il codice che tocca (`auth.ts`, `services/operator/deactivate.ts`, la route del download dell'export): i file che importano `effect` restano gli stessi, perché better-auth era già in `dev` con la C1 (contati dopo la C2: 122, 13, 10 e 2, come nella tabella). La D non va insieme a 1.1: tocca anche lei `deactivate.ts`.

**Frontend, in parallelo con 1.1 e 1.2:**

| # | Attività | Fatto quando |
|---|---|---|
| 1.a | **`apps/web`:** Vite, React 19, React Router, Tailwind 4 (R7), variabili `VITE_*` validate, `@sentry/react`. Con Tailwind 4 la configurazione passa da `tailwind.config.ts` al CSS: i token di oggi (colori, font) si riportano lì | La pagina vuota gira in sviluppo con gli stili di oggi |
| 1.b | **Componenti:** i componenti shadcn e Radix di `src/components/ui` che servono, su React 19. I grafici con il chart di shadcn (R4), al posto dei componenti Tremor dei 5 file della dashboard (`Card`, `BarChart`, `DonutChart`, `ProgressCircle`, `DeltaBar`, `BadgeDelta`). `recharts` diventa una dipendenza dichiarata: oggi `DonutCard.tsx` lo importa e arriva solo tramite Tremor. react-day-picker 8 con React 19 è da verificare | I componenti girano in una pagina di prova, senza Tremor in `apps/web` |
| 1.c | **Shell e routing, per desktop:** sidebar, le rotte delle 14 pagine, link diretti, le parallel route `@admin` e `@blacklist` del profilo come tab. La schermata di login con il client di better-auth (`better-auth/react`), collegata al backend, che con la C2 serve già `/api/auth/*` di better-auth | Si naviga fra tutte le rotte, vuote |

### Fase 2: primo contatto (insieme)

Serve a fissare le convenzioni su un gruppo piccolo, prima di farne nove. Il piano, con le decisioni H1–H20 e i task, è [[chore/fase-2-httpapi]].

| # | Filone | Attività |
|---|---|---|
| 2.1 | Backend | `HttpApi` montato nel backend accanto a `/api/trpc`, su un prefisso suo. Un `HttpApiMiddleware` che fornisce `CurrentUser` dalla sessione di better-auth, al posto di `protectedProcedure` e `operatorProcedure`. Il primo gruppo: **"utente corrente"**, che sostituisce `user.getUserPreference` e `operator.getUserOperator` (chiude TD2). Errori in `Schema.TaggedError` con il loro status, OpenAPI generato |
| 2.2 | Frontend | Il data layer è TanStack Query 5 su `HttpApiClient` (R8). Uno spike fissa come si usano insieme: il runtime di Effect che esegue le chiamate nel `queryFn`, le chiavi delle query, l'invalidazione dopo una mutation, gli errori taggati negli stati di errore. La shell legge l'utente corrente dal gruppo: ruolo e `operatorId` per i permessi |
| 2.3 | Insieme | Le convenzioni, scritte nel §3 di [[chore/migrazione-effect]]: prefisso, metodo e path per ogni procedura, `POST .../search` per le liste con filtri annidati, errore → status, come il frontend ricava il client e invalida le query, come si scrivono i test di contratto. Il progetto Vercel dell'app React (R9), con la rewrite del prefisso di `HttpApi` verso Cloud Run accanto a quelle di oggi |

**Prerequisiti:** 1.1, la C2 di 1.2 e la fase 1 del frontend. La D di better-auth non serve.
**Fatto quando:** l'app React su staging fa login e mostra l'utente corrente passando da `HttpApi`.

### Fase 3: gruppo per gruppo

Per ogni gruppo:
- **Backend:** la definizione del gruppo; gli handler, che chiamano i servizi di L1 come oggi gli adapter tRPC; lo status HTTP degli errori del dominio, che sono già `Schema.TaggedError` dalla PR 4 di 1.1; i test di contratto riscritti sugli endpoint (autorizzazione, codice e messaggio di ogni errore, forma della risposta). L'adapter tRPC resta.
- **Frontend:** le pagine che leggono il gruppo. Ogni pagina si confronta con quella di Next sugli stessi dati di staging (stessi numeri, filtri e azioni), da ADMIN e da OPERATORE.

Ordine proposto. Lo decide il frontend, perché segue le pagine: una pagina è finita quando ci sono tutti i gruppi che legge.

| # | Gruppo | Da dove viene | Pagine |
|---|---|---|---|
| 3.1 | `customer` | router `customer` (18 procedure) | `/dashboard/customers`, `customers/new`, `customers/[id]`, `customers/[id]/connect` |
| 3.2 | `task` e contatti | router `task` | `/dashboard/contatti`, `contatti/(dettaglio)/[id]` |
| 3.3 | `pratiche` | router `pratiche` | `/dashboard/pratiche`, `pratiche/[id]` |
| 3.4 | `chat` | router `chat` | le note del cliente, nel dettaglio cliente e nel dettaglio contatto |
| 3.5 | `analytics` | router `analytics` | `/dashboard`, con i grafici di shadcn |
| 3.6 | `import` | router `import`; `/internal/import/*` di Cloud Tasks resta com'è | `/dashboard/import` |
| 3.7 | `export` | `export.callStats` e la route `/api/export/download` | la sezione admin dell'export nella dashboard, il download dei file di export |
| 3.8 | `operator` e admin | router `operator` | `/dashboard/profile`, con le tab admin e blacklist |

**Fatto quando:** le 14 pagine sono nell'app React, `apps/web` non importa niente di tRPC né di `next/*`, e il collaudo di parità su staging (F3.T9 di [[chore/migration/fase-3-frontend-spa]]) è firmato per i due ruoli.

### Fase 4: rilascio in prod, tutto insieme (R10)

**Prerequisiti:** il go/no-go S6 di [[chore/migrazione-gcp]] con la sua checklist, la fase 3 finita, e la PR D di better-auth in `dev` prima che parta l'osservazione di S6, che non vuole merge: la D aspetta G2, e il gate di prod G3 la vuole in prod insieme alla B, alla C1 e alla C2.

Un solo merge `dev` → `main` e una sola finestra serale, in cui la prod passa tutta al nuovo stack: i dati da Supabase a Cloud SQL, il backend di prod su Cloud Run con GCS e better-auth, i cron da GitHub Actions a Cloud Scheduler, l'app React sul dominio. Il runbook della finestra è nella fase P di [[chore/migrazione-gcp]], e si prova su staging prima del go/no-go.

Il rollback:
- **prima del go**, con i dati ancora su Supabase: si torna tutti insieme alla prod di oggi;
- **dopo il go**, i dati nuovi stanno su Cloud SQL, e tornare a Supabase li perderebbe: si corregge in avanti. Per il solo frontend resta l'app Next, deployata e collegata allo stesso backend, fino alla fase 5.

Un rischio da tenere presente: fino a questo merge la prod resta su Next 14.2.35. Alcune vulnerabilità sono corrette solo dalla 15.x: DoS sui server action, SSRF e l'ottimizzazione delle immagini, da verificare se toccano un deploy su Vercel ([[chore/manutenzione-dipendenze]]). Restano anche Supabase e i cron su GitHub Actions. Serve una strada per un hotfix che parta da `main`.

### Fase 5: dismissioni (dopo 2–4 settimane di prod stabile)

- **L'app Next:** `src/app`, `@trpc/*`, `superjson`, `runTrpc` e i traduttori `xErrorToTrpc`, quello che resta di NextAuth, `@sentry/nextjs`, `@t3-oss/env-nextjs`, `eslint-config-next`, Tremor e `@headlessui/*`, gli schemi zod che `Schema` ha sostituito, `drizzle-zod`.
- **`@sentry/node`** si aggiorna: oggi è fermo a 8.55.2 per avere una sola versione con `@sentry/nextjs`.
- **La P2** di [[specs/crm/gestione-operatori/PLAN]], che parte dopo la P1 in prod da 2 settimane, e poi TD1 (la colonna `users.preferences`).
- **TD5:** route `/api/cron/*`, script `scheduled/*.js`, gli 8 workflow GitHub dei cron, `jsonwebtoken`.
- **Le dismissioni di [[chore/migrazione-gcp]]:** `@supabase/supabase-js`, i progetti Supabase, la rinomina delle variabili.
- Il codice server rimasto in `src/server/` si sposta nei pacchetti.

### Fase 6: flussi da rifare e layout da telefono (frontend)

Parte dopo il rilascio (R6).

1. **I flussi da rifare.** Si scelgono quando lo status quo gira in prod sul nuovo stack.
2. **Il layout sotto i 768 px**, su tutte le pagine (sidebar e tabelle), dopo i flussi (R5).

## 4. Dipendenze

| Pacchetto | Oggi | Cosa | Quando |
|---|---|---|---|
| `effect` | 3.22 | → `~4.0.6`: 4.0.6, in `dev` con la [PR #114](https://github.com/omardeangelis/mito-micro-services/pull/114) (PR 1 di 1.1) del 2026-10-27 | 1.1 (PR 1) |
| `@effect/vitest` | – | `~4.0.6`, la stessa di `effect` | 1.1 (PR 3) |
| `vitest`, `vite` | 1.6, transitiva | vitest → 5, `vite` dichiarata (≥ 6.4, la 7 per `@vitejs/plugin-react` 4.7): vitest 5.0.5 e vite 7.3.7, in `dev` con la [PR #113](https://github.com/omardeangelis/mito-micro-services/pull/113) (PR 2 di 1.1) del 2026-10-27, con i progetti di test in `vitest.config.ts` al posto di `vitest.workspace.ts` | 1.1 (PR 2) |
| `drizzle-orm`, `drizzle-kit` | 0.45.4, 0.31.11 | restano (R3) | – |
| `zod`, `drizzle-zod` | 3.25, 0.5.1 | non si aggiornano; nel backend e nell'app React li sostituisce `Schema` | escono nella fase 5 |
| `@trpc/*`, `superjson` | 10.45.4 | non si aggiornano | fase 5 |
| `next`, `next-auth`, `@sentry/nextjs`, `@t3-oss/env-nextjs`, `eslint-config-next` | 14.2.35, 4.24.15, ... | non si aggiornano (R1) | fase 5 |
| `@tremor/react`, `@headlessui/react`, `@headlessui/tailwindcss` | 3.18, 2.2, 0.2 | mai in `apps/web` (R4) | fase 5 |
| `recharts` | arriva tramite Tremor | dipendenza di `apps/web` | 1.b |
| `tailwindcss` | 3.4 | `apps/web` parte dalla 4 (R7); la radice resta sulla 3 con l'app Next | 1.a |
| `@tanstack/react-query` | 4.44 | `apps/web` parte dalla 5 (R8); la radice resta sulla 4 con l'app Next | 2.2 |
| `@sentry/node` | 8.55.2 | → ultima | fase 5 |
| `@supabase/supabase-js`, `jsonwebtoken` | 2.44, 9.0.3 | escono | fase 5 |
| `@types/node` (a 22, come Node), `@google-cloud/storage`, `nodemailer` | 20, 7, 7 | → ultima, una PR per famiglia, con le regole di [[chore/manutenzione-dipendenze]] | quando serve, fuori dalle settimane di cutover |

L'app React parte con le versioni correnti di quello che usa: non eredita le versioni del `package.json` della radice.

## 5. Domande aperte

1. **Quali flussi si rifanno** (fase 6): si decide dopo il rilascio (R6).

## 6. Fuori da questa roadmap

- Drizzle 1.0 (R3), TypeScript 7, Node oltre la 22 (LTS fino ad aprile 2027).
- L'API di import per consumatori esterni, con API key: è una spec a parte (OQ7 di [[specs/crm/import-pratiche/SPEC]]). Diventa il gruppo `import` della stessa `HttpApi` con un `HttpApiSecurity` (§6 di [[chore/migrazione-effect]]).

## 7. Documenti da allineare

Il 2026-10-27 ogni documento qui sotto ha ricevuto un rimando a questa pagina. Resta da fare quello che dipende da un punto della roadmap.

| Documento | Fatto il 2026-10-27 | Resta, e quando |
|---|---|---|
| `AGENTS.md` | Il rimando a questa pagina nella mappa del repo; l'auth su better-auth dopo la C2 (`getServerAuthSession(headers)`, `requestSession`) | "`effect` 3.x" → 4.x e `Context.Service`: fatto sul branch della PR 1 di 1.1, insieme all'eccezione delle asserzioni sulla forma di `Cause` ed `Exit` |
| [[chore/migrazione-effect]] | Chiusa per L1 e L2; i vincoli del §3 aggiornati (R2, R8, R10); la regola sui cutover del §4 e del §6 superata (R10); il debito aperto spostato nel §8 | Le convenzioni di `HttpApi` nel §3, con 2.3 |
| [[chore/migrazione-gcp]] | Il principio "un passo alla volta" e la fase P riscritti per la finestra unica (R10), con le variabili di better-auth per la prod; la riga del rollback nella checklist di S6 | Il runbook della finestra con i comandi, provato su staging prima del go/no-go |
| [[specs/crm/auth-better-auth/SPEC]] e il suo PLAN | Il vincolo "mai due cambi nella stessa notte" e il gate G3 portati sulla finestra unica (R10) | – |
| [[chore/manutenzione-dipendenze]] | W2 annullata, W3 ridotta (R1), Effect 4 (R2) | – |
| [[chore/migration_plan]] | Superato da questa pagina | – |
| [[chore/migration/fase-3-frontend-spa]] | Il rimando alle decisioni R1–R9; i task riscritti in [[chore/migrazione-frontend-react]] | Fatto in [[chore/migrazione-frontend-react]], da confermare (F1–F11). Erano: i task riscritti con 1.a: React 19 invece di 18, Tailwind 4, `HttpApi` e TanStack Query 5 su `HttpApiClient` invece degli hook tRPC, Tremor fuori, layout da telefono in fase 6. Il reverse proxy di D6 sono le rewrite di Vercel (R9): le rewrite e gli header di `next.config.js` (`rewrites()` e `headers()`, con `X-Frame-Options`) passano nella configurazione del progetto Vercel dell'app React. Restano validi lo spostamento dei componenti, i web worker, Sentry e il collaudo di parità |

## 8. Debito aperto della migrazione

Il debito che la migrazione genera sta qui, accanto al piano, e non nelle pagine di `brain/tech-debt/` (decisione di Omar del 2026-10-22). Fino al 2026-10-27 stava nel §7 di [[chore/migrazione-effect]], che tiene le voci chiuse come storia; le voci aperte sono passate qui con gli stessi numeri. Il debito di una feature costruita durante la migrazione resta in `brain/tech-debt/<dominio>/<spec>.md`.

Regole:
- **Chi scrive:** il task di chiusura di ogni punto della roadmap (gate e merge) aggiunge le voci che il punto genera, e chiude quelle che risolve. Lo stesso vale per `docs-maintenance` quando ingerisce il `REPORT.md` di un punto della roadmap.
- **Formato:** stato, origine, perché resta, fix, quando. Stati: `[PREVISTO]` per il debito che un punto pianificato genererà, `[OPEN]` quando il punto è in `dev`, `[CLOSED <data>]` quando è risolto. Le voci nuove partono da TD12.

| # | Stato | Voce | Origine | Perché resta | Fix | Quando |
|---|---|---|---|---|---|---|
| TD1 | `[PREVISTO]` | Colonna `users.preferences` (testo JSON) non più letta né scritta | PR P2 di [[specs/crm/gestione-operatori/PLAN]]: le preferenze di layout passano ai cookie | Toglierla è una migrazione distruttiva: si aspetta di essere sicuri che nessuno la legga e che non serva tornare indietro | Migrazione `ALTER TABLE ... DROP COLUMN preferences`, poi `pnpm db:generate`; schema `packages/db/src/schema/users.ts`; la applica Omar, come le altre | P2 in prod da almeno un mese, `git grep "preferences"` su `@mito/db` e `@mito/server` senza letture della colonna, e in una release senza cutover GCP; nella roadmap: fase 5 |
| TD2 | `[PREVISTO]` | `user.getUserPreference` restituisce solo `role` e `operatorId`, con un nome che parla di preferenze, e doppia in parte `operator.getUserOperator` | PR P2 | Rinominarla tocca 5 file della UI per nessun cambio di comportamento | Un'unica lettura "utente corrente", che sostituisce le due | Con L3, quando le procedure si riscrivono comunque come endpoint `HttpApi`; nella roadmap: 2.1 |
| TD4 | `[OPEN]`; dalla C2, in `dev` dal 2026-10-27, il comportamento sta in better-auth | Il rifiuto del login dei disattivati e l'invalidazione delle loro sessioni stavano nel codice NextAuth v4 di `auth.ts` (`signIn` e l'override di `getSessionAndUser`) | PR 4 di [[specs/crm/gestione-operatori/PLAN]] (AC16, AC17) | Dalla C2 ([PR #108](https://github.com/omardeangelis/mito-micro-services/pull/108), in `dev` dal 2026-10-27) li fa better-auth, con i test di `packages/server/src/betterAuth/_test/` (Azure, link via email, sessione) e quello di `deactivate`, che cancella anche `auth_session`. Restano i pezzi di NextAuth che toglie la D: `services/auth/users.ts` senza chiamanti e la cancellazione da `sessions` in `deactivate` | La PR D (T11) toglie NextAuth; T13 chiude la voce e porta il flusso [[domains/crm/flows/accesso-utente-disattivato]] su better-auth | Passo 8; nella roadmap: la D, prima di S6 |
| TD5 | `[OPEN]` | Route `src/app/api/cron/*`, script `scheduled/*.js` e 8 workflow GitHub dei cron | Passo "cron" (§4 di [[chore/migrazione-effect]]) | La prod usa ancora GitHub Actions finché i cron non passano a Cloud Scheduler | Toglierli tutti insieme | Dopo il passaggio dei cron di prod a Cloud Scheduler ([[chore/migrazione-gcp]]); nella roadmap: fase 5 |
| TD6 | `[OPEN]` per `Sentry.trpcMiddleware`. L'import di `server-only` `[CLOSED 2026-10-27]` con la C2; il resto è chiuso nel §7 di [[chore/migrazione-effect]] | `Sentry.trpcMiddleware` di `api/trpc.ts` importa ancora `@sentry/nextjs`, con lo shim `apps/api/src/shims/sentry.ts` e il suo alias in `apps/api/build.mjs` | Passo 0 (§4 di [[chore/migrazione-effect]]) | Né la C2 né la D di better-auth riscrivono il middleware di Sentry: resta finché resta tRPC. L'import di `server-only` in `services/auth/login.ts` (della [PR #99](https://github.com/omardeangelis/mito-micro-services/pull/99)) l'ha tolto la C2 ([PR #108](https://github.com/omardeangelis/mito-micro-services/pull/108), in `dev` dal 2026-10-27): con lui il backend non partiva (`api:smoke`) | Togliere `Sentry.trpcMiddleware`, lo shim e l'alias insieme a tRPC e a `@sentry/nextjs` | Nella roadmap: fase 5 |
| TD10 (a) | `[OPEN]`, in `dev` con la [PR #86](https://github.com/omardeangelis/mito-micro-services/pull/86) del 2026-10-25 | Chi ha un `chatId` legge e scrive le note di quella chat, qualunque sia il cliente | [[specs/crm/chat-storage-effect/PLAN]] (§14; AC17 della SPEC), PR di `chat` | Il passo 5 non cambia comportamento | Proposta: chiudere senza codice. `customer` non ha una regola di visibilità per operatore: `getCustomerById` è `operatorProcedure` senza filtri sull'attore, quindi ogni operatore attivo vede ogni cliente. Le 4 procedure di `chat` sono già `operatorProcedure`, e "chi può vedere il cliente della chat" vuol dire già "ogni operatore attivo". Se un giorno arriva una visibilità per operatore, la voce rinasce nella sua spec | Con la conferma di Leonardo |
| TD12 | `[PREVISTO]` | `withCurrentEnv` (`packages/server/src/shared/currentEnv.ts`) fa leggere `Config` sull'ambiente del momento, come Effect 3, riconoscendo per identità il `ConfigProvider` di default di Effect 4 | PR 1 di 1.1 ([[specs/crm/effect-4/PLAN]], D15) | Effect 4 fotografa `process.env` alla prima lettura, e due test cambiano l'ambiente fra un test e l'altro (`import.db.test.ts:284-300`, `supabase.test.ts:406-440`). Se una versione di `effect` cambiasse come espone il provider di default, il confronto smetterebbe di valere senza errori; lo coprono quei due test | Leggere la configurazione una volta, all'avvio, in un `Layer` del backend, e nei test fornire il provider esplicito; poi togliere `withCurrentEnv` | Con la fase 2, quando il backend su `HttpApi` costruisce i suoi layer; nella roadmap: 2.1 |

Punti chiusi senza debito nuovo:
- **1.1, PR 2 (vitest 5):** nessun debito. L'avviso di pnpm sul *peer* `@types/node` di vitest 5 (`^22 || >=24`, opzionale) lo chiude la riga di `@types/node` nel §4.

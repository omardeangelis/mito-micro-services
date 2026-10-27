---
domain: platform
type: chore
status: draft
links:
  - "[[chore/roadmap-nuovo-stack]]"
  - "[[chore/migrazione-effect]]"
  - "[[chore/migrazione-gcp]]"
  - "[[chore/migration/fase-3-frontend-spa]]"
  - "[[specs/crm/auth-better-auth/PLAN]]"
created: 2026-10-27
updated: 2026-10-27
---

# Piano del frontend: da Next.js all'app React in `apps/web`

> Richiesta (Leonardo, 2026-10-27): "cerca il file migrazione-nuovo-stack, dobbiamo iniziare a fare il plan della migrazione react".

Questa pagina è il dettaglio del **filone frontend** di [[chore/roadmap-nuovo-stack]]: i punti 1.a, 1.b, 1.c, 2.2, 2.3 e la parte frontend della fase 3. L'ordine delle fasi, le decisioni R1–R10 e il debito della migrazione restano nella roadmap; qui ci sono il come, i task e le mappe pagina per pagina. Riscrive i task di [[chore/migration/fase-3-frontend-spa]] (§7 della roadmap), che resta come storia: dove le due pagine dicono cose diverse vale questa.

**Il perimetro (R6).** L'app React porta in prod lo status quo: stesse pagine, stessi flussi, stessi permessi. Niente cambi di prodotto, niente layout da telefono (R5, fase 6). Un miglioramento che sembra gratis (un filtro in più, una colonna spostata) si annota nel §9 e aspetta la fase 6: rompe il collaudo di parità.

## 1. Fotografia del frontend di oggi (2026-10-27)

| Cosa | Quanto | Dove |
|---|---|---|
| Pagine (`page.tsx`) | 14, di cui 2 parallel route (`@admin`, `@blacklist`) e la radice che reindirizza | `src/app` |
| Layout | 8 (`app`, `login`, `dashboard`, `contatti`, `contatti/(dettaglio)`, `customers`, `pratiche`, `profile`) più `loading.tsx`, `error.tsx`, `global-error.tsx`, `default.tsx` | `src/app` |
| File `"use client"` | 111 | `src` |
| File su `@/trpc/server` (server component e server action) | 34 | `src/app`, `src/components` |
| File su `@/trpc/react` | 23 | idem |
| Import di `next/*` | `next/navigation` 33, `next/cache` 21, `next/link` 15, `next/server` 14 (route handler), `next/headers` 3, `next/image` 2, `next/font` 1 | |
| Server action | 11 file `_actions` | §6 |
| Componenti UI | 31 shadcn/Radix in `src/components/ui`, i custom in `src/components/custom` (note, contatti, tabelle, date picker, badge) | |
| Store | Zustand (`useAnalyticsStore`, `useCustomerTableStore`, `userPreferences`) e `UserPreferenceContext` | `src/store` |
| Hook | 10, di cui 3 su `next/navigation` (`useGetPageAndPerPageParams`, `useGetMultipleUrlParamsValues`, `useHistoryBack`) | `src/lib/hooks` |
| Worker | lettura del file di import (`read.worker.ts`), polling dello stato dell'import (`ImportStatus.tsx`, `refetchInterval`) | `src/lib/import`, `src/app/_context` |
| Tremor | 5 file della dashboard (`DonutCard`, `FinanceCard`, `CircleCard`, `export/ExportCharts`, `export/ExportKpis`) | `src/app/dashboard/_components` |
| Test del frontend | 114 file, 62 dei quali mockano `next/*` o `@/trpc` | `_test/` accanto al codice |

Peso per area (file senza test / test):

| Area | File | `@/trpc/server` | `@/trpc/react` | `next/*` | Test |
|---|---|---|---|---|---|
| `dashboard/contatti` | 46 | 2 | 6 | 15 | 30 |
| `dashboard/customers` | 30 | 8 | 6 | 15 | 10 |
| `dashboard/_components` (analytics, export) | 18 | 6 | 1 | 2 | 10 |
| `dashboard/profile` | 17 | 6 | 2 | 6 | 7 |
| `dashboard/pratiche` | 12 | 4 | 0 | 7 | 4 |
| `dashboard/import` | 6 | 1 | 2 | 1 | 3 |
| `login`, `_components`, `_context` | 7 | 1 | 1 | 4 | 5 |
| `components` | 62 | 3 | 2 | 8 | 14 |
| `lib`, `store` | 38 | 0 | 2 | 5 | 14 |

Il lavoro vero non è spostare i componenti: è il **data fetching**. Oggi le pagine sono server component che chiamano `api.x.y()` sul server, con `Suspense` e `unstable_noStore`, e le scritture passano da server action con `revalidatePath`. Nell'app React ogni lettura diventa una query di TanStack Query su `HttpApiClient` (R8), ogni scrittura una mutation con le sue invalidazioni.

## 2. Decisioni proposte

Da confermare con Omar prima di 1.a. Le marco F per non confonderle con le R della roadmap.

| # | Proposta | Perché |
|---|---|---|
| F1 | **Il codice senza React e senza Next che serve alle due app va in un pacchetto**, non si copia: il parser dei cookie delle preferenze (`src/lib/preferences/cookies.ts`), la lettura del file di import e il suo worker (`src/lib/import/*`), il workbook dell'export (`src/lib/export`), le utility pure di `src/lib/utils`. Le regole del dominio vanno in `@mito/domain`, dove già stanno contatti e schemi; il resto in un pacchetto nuovo, `@mito/client` (`packages/client`: niente React, niente Next, niente codice server) | Lo stesso principio del backend ("importa, non copia"): fino alla fase 5 le due app girano insieme, e una correzione deve valere per tutte e due |
| F2 | **I componenti React si rifanno in `apps/web`, non si condividono.** Tutti, shadcn compresi, si copiano e si adattano: per Tailwind 4 si rinominano le classi che hanno cambiato significato (`outline-none` → `outline-hidden`, `shadow-sm` → `shadow-xs`), e `forwardRef` resta finché funziona su React 19. Rigenerarli con la CLI di shadcn cambierebbe l'aspetto (lo stile corrente non è quello di oggi) e romperebbe la parità (R6) | Le due app hanno React (18/19), Tailwind (3/4) e TanStack Query (4/5) diversi: un pacchetto di componenti comune dovrebbe reggere tutte e due le combinazioni, per buttarne una alla fase 5 |
| F3 | **Congelamento della UI di Next per pagina.** Finché una pagina non è in `apps/web`, le modifiche si fanno su Next come oggi; quando la pagina entra in `apps/web` (la sua PR è in `dev`), ogni modifica a quella pagina si fa nelle due app nella stessa PR, oppure aspetta il rilascio | Senza una regola, il collaudo di parità confronta due pagine che fanno cose diverse (R6) |
| F4 | **React Router 8 in modalità dati** (`createBrowserRouter`, `lazy` per rotta), **senza loader che leggono dati**: le pagine leggono con `useQuery`, e gli skeleton di oggi diventano gli stati di caricamento. Un `loader` serve solo al guard dell'auth e, dopo il rilascio, al prefetch (`queryClient.ensureQueryData`) | Un solo posto dove passano i dati, la cache di TanStack Query; i componenti si portano senza cambiare forma |
| F5 | **Lo stato nell'URL resta nell'URL**: pagina, righe per pagina, filtri e tab con `useSearchParams` di React Router. I 3 hook su `next/navigation` si riscrivono una volta, con la stessa firma, in `apps/web/src/lib/hooks` | I link diretti e il tasto indietro devono funzionare come oggi |
| F6 | **Sessione e permessi:** `authClient.useSession()` di better-auth dice se c'è una sessione (guard della rotta `/dashboard`, redirect da `/login`); il gruppo "utente corrente" di `HttpApi` (2.1) dà ruolo e `operatorId` a `UserPreferenceProvider` e a `useOperatorPermission`. Le preferenze di layout si leggono dai cookie `mito-pref-*` con `document.cookie` prima del primo render, con lo stesso parser (F1) | Oggi lo fanno `dashboard/layout.tsx` e `readRequestPreferences` sul server; nella SPA il primo render li deve avere uguali, senza sfarfallio della sidebar o delle colonne |
| F7 | **Un modulo per gruppo nel data layer** (`apps/web/src/api/<gruppo>.ts`): le query key, le `queryOptions` e le mutation del gruppo, con le invalidazioni scritte accanto alla mutation (§6). Le pagine non chiamano `HttpApiClient` direttamente | Le invalidazioni sostituiscono `revalidatePath`: tenerle in un posto solo evita le liste che non si aggiornano |
| F8 | **Gli errori arrivano come classi taggate** (R8) e un solo helper li traduce nei toast e nei messaggi dei form di oggi: lo stesso testo che oggi esce da `readContactError` e dagli altri traduttori | Il collaudo di parità confronta anche i messaggi di errore |
| F9 | **I test girano in `apps/web` con vitest, jsdom e Testing Library**, con l'API finta data da un `Layer` di test del client (gli handler del gruppo su dati in memoria), non con mock dei moduli. Un test di oggi si porta con la sua pagina, con le stesse asserzioni dove il comportamento è lo stesso; i mock di `next/navigation` diventano un `MemoryRouter` | Il `tdd` del repo vuole test sull'interfaccia pubblica; i mock di `@/trpc` non hanno equivalente |
| F10 | **Il deploy è un progetto Vercel statico** (R9) con un `vercel.json`: la rewrite di tutte le rotte verso `index.html`, le rewrite di `/api/auth/*`, `/api/export/*`, `/api/user/*`, del prefisso di `HttpApi` e (finché serve) di `/api/trpc/*` verso Cloud Run, e gli header di sicurezza di oggi (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Feature-Policy`, ...) con la cache `immutable` sugli asset con hash. Prima il progetto di staging | Stesso dominio e cookie first-party; nessun header si perde con `next.config.js` |
| F11 | **Le variabili pubbliche** sono `VITE_SENTRY_DSN`, `VITE_APP_ENV` e quel poco che serve, validate con `Schema` all'avvio in `apps/web/src/env.ts`. `NEXT_PUBLIC_BASE_URL` sparisce: le chiamate sono relative (`/api/...`) | Una variabile mancante deve fermare la build, come fa oggi `@mito/env` |

## 3. Struttura di `apps/web`

```
apps/web/
  index.html            title, favicon, lang="it"
  vite.config.ts        alias @/ → src/, proxy /api → backend locale (pnpm api:dev)
  vercel.json           rewrite e header (F10)
  src/
    main.tsx            QueryClientProvider, RouterProvider, Toaster, Sentry
    env.ts              variabili VITE_* validate (F11)
    styles/globals.css  Tailwind 4: @theme con i token di tailwind.config.ts, font Inter
    api/                runtime di Effect, HttpApiClient, un modulo per gruppo (F7), errori → messaggi (F8)
    auth/               authClient, guard, pagina di login
    routes/             una cartella per area, come src/app/dashboard: analytics, customers, contatti, pratiche, import, profile
    components/ui/      shadcn rigenerato (F2), chart di shadcn al posto di Tremor (R4)
    components/custom/  note, contatti, tabelle, date picker, badge
    lib/hooks/          gli hook di oggi, su React Router (F5)
    store/              gli store Zustand e UserPreferenceContext
```

Nel workspace è `@mito/web`, con gli script `dev`, `build`, `test`, `lint`, `typecheck`. Dalla radice: `pnpm web:dev` (Vite e `pnpm api:dev` insieme), `pnpm web:build`, `pnpm web:test`. CI aggiunge un job per `apps/web` con gli stessi gate (lint, tsc, test, build) accanto a quelli dell'app Next.

## 4. Task

I numeri sono quelli della roadmap. Una PR per task, salvo dove è scritto altro. La colonna "Dipende" dice cosa deve essere in `dev` prima.

### Fase 1, frontend (in parallelo con Effect 4 e la C2)

| # | Task | Dipende | Fatto quando |
|---|---|---|---|
| 1.a.1 | **Scaffold di `apps/web`**: Vite, React 19, TypeScript con `packages/config/tsconfig.base.json`, React Router 8, Tailwind 4 con i token di oggi riportati in `@theme` (colori, `font-sans`, i plugin che servono), Inter da `@fontsource-variable/inter`, `env.ts` (F11), ESLint senza `eslint-config-next`, vitest con jsdom. Script nel workspace e job di CI | – | `pnpm web:dev` mostra una pagina con gli stili di oggi; CI verde sul job nuovo |
| 1.a.2 | **`@mito/client`** (F1): il pacchetto, con dentro l'import (`src/lib/import`, worker compreso), il workbook dell'export (`src/lib/export`), il parser dei cookie delle preferenze e `format.ts`. L'app Next lo importa al posto dei file di `src/lib` (nessun cambio di comportamento, i test restano verdi; `next build` emette ancora il worker dell'import). Le altre utility di `src/lib/utils/index.ts` restano dove sono finché una pagina portata non le chiede | 1.a.1 | `src/lib` non ha più copie di quello che è nel pacchetto |
| 1.a.3 | **Sentry** con `@sentry/react` e l'integrazione di React Router, `ErrorBoundary` di radice al posto di `global-error.tsx`, upload delle sourcemap in build | 1.a.1 | Un errore di prova arriva su Sentry con lo stack leggibile |
| 1.b.1 | **Componenti shadcn** portati per React 19 e Tailwind 4 (F2): i 31 di `src/components/ui`, `use-toast` e `Toaster` compresi. `react-day-picker` resta alla 8 (dichiara React fino alla 18, ma su React 19 regge: lo prova un test del `Calendar`), il passaggio alla 9 va con la fase 6 perché cambia l'aspetto. Due differenze volute rispetto a oggi: `cn` conosce `text-xxs`, che oggi fa sparire il colore del testo accanto (il badge `xs`); i placeholder grigi e il puntatore sui bottoni, che Tailwind 4 non dà più, sono riportati in `globals.css` | 1.a.1 | Una pagina di prova (`/_dev/ui`, solo in sviluppo) li mostra tutti; i test di `src/components/ui/_test` portati e verdi |
| 1.b.2 | **Grafici**: il chart di shadcn su `recharts` 3 (dipendenza dichiarata) al posto dei componenti Tremor (`Card`, `BarChart`, `DonutChart`, `ProgressCircle`, `DeltaBar`, `BadgeDelta`) dei 5 file della dashboard. Stanno in `apps/web/src/components/charts`, con gli stessi nomi e le stesse props di Tremor e i suoi colori (la palette di Tailwind 3 in hex): in 3.5 i 5 file cambiano solo l'import. Il pallino della legenda di `DonutCard`, oggi una classe `bg-<colore>` della `safelist`, prende il colore da `chartColor` | 1.b.1 | Gli stessi grafici, sugli stessi dati di prova, nella pagina di prova; niente `@tremor/*` né `@headlessui/*` in `apps/web` |
| 1.b.3 | **Componenti custom** (note, contatti, tabelle con TanStack Table, date picker, badge, input) copiati e adattati, senza `next/*`: `next/link` → `Link`, `next/navigation` → React Router | 1.b.1 | I test di `src/components/custom` portati e verdi |
| 1.c.1 | **Shell e rotte**: la sidebar (`DashboardLayout`) con il suo stato chiuso/aperto dal cookie (F6), le rotte di §5 vuote con `lazy`, la 404, l'errore di rotta al posto di `contatti/error.tsx`, i tab del profilo al posto delle parallel route (§5) | 1.b.1 | Si naviga fra tutte le rotte, e un link diretto a ognuna apre la rotta giusta |
| 1.c.2 | **Login e guard** (F6): la pagina di login con `authClient` (Azure e link via email, com'è oggi `src/app/login`), il guard di `/dashboard` e il redirect da `/login`, il logout. Il primo accesso che oggi porta a `/dashboard/profile?firstTime=true` lo decide il server (D15 della spec dell'auth) e la SPA segue il redirect | 1.c.1, la C2 in `dev` | Con il backend locale: login, refresh della pagina con la sessione che resta, logout, `/dashboard` chiuso senza sessione |

### Fase 2, frontend

| # | Task | Dipende | Fatto quando |
|---|---|---|---|
| 2.2.1 | **Spike del data layer** (R8): il runtime di Effect che esegue `HttpApiClient` nel `queryFn` (con `signal` per l'annullamento), le query key per gruppo, una mutation che invalida, un errore taggato che arriva nello stato di errore e nel toast (F8), il `Layer` di test del client (F9). Il risultato si scrive nelle convenzioni di 2.3 | la definizione del gruppo "utente corrente" (2.1) in `dev` | Un test che fa una query e una mutation con il `Layer` di test, e la stessa pagina che gira sul backend locale |
| 2.2.2 | **La shell legge l'utente corrente**: `UserPreferenceProvider` e `useOperatorPermission` sul gruppo "utente corrente", al posto di `user.getUserPreference` e `operator.getUserOperator` | 2.2.1, gli handler di 2.1 | La sidebar mostra le voci di ADMIN e di OPERATORE come oggi |
| 2.3.1 | **Progetto Vercel di staging** per `apps/web` (F10): `vercel.json` con le rewrite e gli header, il dominio di staging, le variabili | 1.c.2 | L'app React su staging fa login e mostra l'utente corrente passando da `HttpApi` (il "fatto quando" della fase 2 della roadmap) |

### Fase 3, frontend: pagina per pagina

Per ogni pagina, nella stessa PR:
1. La rotta legge con le `queryOptions` del gruppo (F7): lo skeleton che oggi è il fallback di `Suspense` o `loading.tsx` diventa lo stato di caricamento.
2. Le server action della pagina diventano mutation con le invalidazioni di §6.
3. Spariscono `unstable_noStore`, `revalidatePath`, `revalidateTag`, `dynamic`, `maxDuration`.
4. I test della pagina si portano (F9).
5. Il confronto con la pagina di Next su staging, da ADMIN e da OPERATORE, con la riga della checklist di §7 compilata nella PR.

| # | Pagine (§5) | Gruppo `HttpApi` | Note |
|---|---|---|---|
| 3.1 | `customers`, `customers/new`, `customers/:id`, `customers/:id/connect` | `customer`, e `pratiche.createPratica` per il collegamento | La lista è la più usata: paginazione, colonne visibili dal cookie, azioni massive (cliente e task insieme in `customerBulkUpdate`), blacklist |
| 3.2 | `contatti`, `contatti/:id` | `task` e contatti | L'area più grande (46 file, 30 test): conviene dividerla in due PR, lista e dettaglio |
| 3.3 | `pratiche`, `pratiche/:id` | `pratiche` | L'anteprima del cliente nel dettaglio (`updateCustomerPreview`) |
| 3.4 | le note nel dettaglio cliente e contatto | `chat` | Componente condiviso (`components/custom/notes`): la PR lo porta e lo collega a 3.1 e 3.2 |
| 3.5 | `/dashboard` | `analytics` | I grafici di 1.b.2; `useAnalyticsStore` per i filtri |
| 3.6 | `import` | `import` | Il worker di lettura in Vite (`new Worker(new URL(..., import.meta.url), { type: "module" })`) da `@mito/client`; il polling di `ImportStatus` con `refetchInterval` come oggi. Prova con un file Standard e uno Wave reali |
| 3.7 | la sezione admin dell'export, il download | `export` | Il download resta una navigazione verso `/api/export/download`, con la rewrite di F10 |
| 3.8 | `profile`, con i tab admin e blacklist | `operator` | Ruoli e disattivazione: revisione di Leonardo (regola 5 della roadmap) |

**3.9 Rifinitura e collaudo**, prima del go/no-go: i bundle per rotta (exceljs e xlsx solo nell'import e nell'export), `grep` senza risultati per `next/` e `@trpc/` in `apps/web`, la checklist di §7 firmata per i due ruoli (F3.T9 della pagina vecchia).

## 5. Rotte

| Rotta | Da | Note |
|---|---|---|
| `/` | `src/app/page.tsx` | redirect a `/dashboard` |
| `/login` | `src/app/login` | 1.c.2 |
| `/dashboard` (layout) | `dashboard/layout.tsx`, `GeneralDasboardLayout`, `_context/ImportStatus` | guard, `UserPreferenceProvider`, `ImportStatusProvider`, sidebar |
| `/dashboard` | `dashboard/page.tsx` | 3.5 |
| `/dashboard/customers` | `customers/page.tsx` | 3.1 |
| `/dashboard/customers/new` | `customers/new` | 3.1 |
| `/dashboard/customers/:id` | `customers/[id]` | 3.1, con le note di 3.4 |
| `/dashboard/customers/:id/connect` | `customers/[id]/connect` | 3.1 |
| `/dashboard/contatti` | `contatti/page.tsx` | 3.2 |
| `/dashboard/contatti/:id` | `contatti/(dettaglio)/[id]` | 3.2; il layout `(dettaglio)` diventa un layout di rotta senza segmento |
| `/dashboard/pratiche` | `pratiche/page.tsx` | 3.3 |
| `/dashboard/pratiche/:id` | `pratiche/[id]` | 3.3 |
| `/dashboard/import` | `import/page.tsx` | 3.6 |
| `/dashboard/profile` | `profile/page.tsx`, `@admin`, `@blacklist` | 3.8; le parallel route diventano tab visibili solo all'ADMIN, con il tab nell'URL (`?tab=admin`) |

## 6. Server action → mutation

Oggi ogni scrittura passa da una server action che chiama `@/trpc/server` e poi `revalidatePath`. Nell'app React diventa una mutation del gruppo con le invalidazioni qui sotto (F7). I nomi delle procedure diventano endpoint con le convenzioni di 2.3.

| Server action | Procedura di oggi | Oggi rivalida | Nell'app React invalida |
|---|---|---|---|
| `customers/_actions/customerBulkUpdate` | `customer.bulkUpdateCustomers`, `task.bulkHandleTask` | layout `/dashboard/customers` | liste e dettagli di `customer`, liste di `task` |
| `customers/_actions/handleCustomerBlackList` | `customer.handleCustomerBlackList` | `/dashboard/customers`, `/dashboard/profile/@blacklist` | liste e dettaglio di `customer`, la blacklist di `operator` |
| `customers/[id]/_actions/updateCustomer` | `customer.updateCustomerFromDashboard` | layout `/dashboard/customers` | il dettaglio e le liste di `customer` |
| `customers/[id]/_actions/connectPratica` | `pratiche.createPratica` | `/dashboard/customers`, `/dashboard/pratiche` | il dettaglio del cliente, le liste di `pratiche` |
| `pratiche/[id]/_actions/updatePratica` | `pratiche.updatePraticaFromDashboard` | layout `/dashboard/pratiche` | il dettaglio e le liste di `pratiche` |
| `pratiche/[id]/_actions/updateCustomerPreview` | `pratiche.updateCustomerPreview` | la pagina `/dashboard/pratiche/[id]` | il dettaglio della pratica, il dettaglio del cliente |
| `components/custom/notes/_actions/updateChat` | `chat.insertMessage` | la pagina del cliente | i messaggi della chat |
| `components/custom/notes/_actions/deleteMessage` | `chat.deleteMessage` | la pagina del cliente | i messaggi della chat |
| `profile/_actions/updateOperatorInfo` | `operator.updateOperatorInfo` | `/dashboard/profile` | l'operatore, l'utente corrente |
| `profile/@admin/_actions/updateOperatorsRole` | `operator.updateOperatorsRole` | `/dashboard/profile` | la lista degli operatori |
| `profile/@admin/_actions/deactivateOperator` | `operator.deactivate` | `/dashboard/profile` | la lista degli operatori, l'impatto della disattivazione |

Due cose da controllare pagina per pagina, perché oggi le dà gratis Next:
- **Il refetch alla navigazione.** Una server component rilegge a ogni navigazione (`force-dynamic`); TanStack Query no, se il dato è fresco. Le liste partono con `staleTime: 0` e `refetchOnMount: "always"` come oggi, e si alzano solo con un motivo scritto.
- **Le invalidazioni larghe.** `revalidatePath(..., "layout")` rilegge tutto sotto il path; la mappa sopra deve coprire ogni query che la pagina mostra dopo la scrittura.

Le route REST che il frontend chiama restano route: `/api/user/preferences` (le colonne visibili), `/api/export/download`, `/api/auth/*` di better-auth. `/api/error` e `/api/sentry-example-api` sono prove di Sentry, non si portano.

## 7. Collaudo di parità

Per ogni riga di §5, su staging, sugli stessi dati, l'app React contro quella di Next, da ADMIN e da OPERATORE:

- stessi numeri (totali, conteggi, grafici) e stesse righe con gli stessi filtri e la stessa paginazione;
- stesse azioni disponibili per ruolo (`useOperatorPermission`), e l'API che rifiuta quelle che il ruolo non ha;
- dopo ogni scrittura la pagina si aggiorna senza ricaricare (§6);
- stessi messaggi di errore e di conferma (F8);
- link diretto, refresh e tasto indietro tengono pagina, filtri e tab (F5);
- le preferenze di layout (sidebar, colonne) restano quelle del cookie.

La checklist si compila nella PR di ogni pagina e si firma tutta in 3.9.

## 8. Rischi

| Rischio | Cosa si fa |
|---|---|
| Le pagine di Next cambiano durante la fase 3 e il collaudo confronta due cose diverse | F3; ogni PR che tocca una pagina già portata la tocca nelle due app |
| Il frontend aspetta il backend | Regola 1 e 2 della roadmap: la definizione del gruppo in `dev` prima degli handler, e il `Layer` di test (F9) per lavorare sulla definizione |
| Il comportamento implicito delle server component (refetch, rivalidazioni larghe) si perde | §6, e la riga "dopo ogni scrittura" della checklist |
| `react-day-picker` 8 o un altro componente Radix non regge React 19 | Verificato in 1.b.1, prima delle pagine |
| Il bundle cresce (exceljs, xlsx, recharts) | `lazy` per rotta (F4), i worker per i file, controllo in 3.9 |
| Un header di sicurezza o una rewrite di `next.config.js` si perde nel passaggio a `vercel.json` | F10, controllo con `curl -I` su staging in 2.3.1 |
| Il primo render senza preferenze (sfarfallio della sidebar o delle colonne) | F6: lettura sincrona del cookie prima del primo render |

## 9. Domande aperte

1. **F1–F11** da confermare con Omar, soprattutto F1 (il pacchetto `@mito/client`) e F3 (il congelamento per pagina).
2. **Chi fa cosa:** la roadmap divide il lavoro in due filoni; questa pagina dà per scontato che il frontend sia un filone solo, con 3.2 divisibile in due PR.
3. **Quando parte 1.a:** non dipende da niente del backend; può partire ora.

Idee per la fase 6, da non fare prima del rilascio (R6): _(vuoto)_

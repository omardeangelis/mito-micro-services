---
phase: 3
title: Frontend React SPA (Vite + React Router)
status: not_started
completed: false
depends_on: ["fase-2-backend-express"]
last_updated: 2026-06-11
---

# Fase 3 — Frontend React SPA (`apps/web`)

## Obiettivo

Ricostruire il frontend come SPA Vite + React Router che parla con `apps/api` (tRPC + REST). La maggior parte del codice UI (componenti shadcn/Radix/Tremor, store Zustand, hook, web worker) si **sposta**; il lavoro vero è convertire il data-fetching delle 18 pagine da RSC/server actions a hook tRPC client-side.

## Stato attuale (riferimenti)

- UI condivisa: `src/components/ui/` (~31 componenti shadcn/Radix), `src/components/custom/` (12), Tremor per la dashboard analytics.
- Stato: `src/store/` (Zustand: tabelle pratiche/clienti, analytics, import/export, preferenze) + `src/store/context/UserPreferenceContext.tsx`.
- Hook: `src/lib/hooks/` (8 hook, tra cui `useOperatorPermission`, `useGetPageAndPerPageParams` — usano `next/navigation`).
- tRPC client: `src/trpc/react.tsx` (`TRPCReactProvider`, httpBatchLink + superjson), `src/trpc/server.ts` (client RSC — **sparisce**), `src/trpc/shared.ts`.
- Pattern dati attuale: pagine RSC fanno `api.x.query()` server-side con `unstable_noStore()` + Suspense; ~32 componenti client usano `trpc.x.useQuery/useMutation`; 15 file di server actions (`_actions/`) che wrappano procedure tRPC + `revalidatePath`/`revalidateTag`.
- Worker: `src/lib/workers/{import,export}/` — web worker che chiamano le route REST `/api/import/*` e `/api/export/*`.
- Auth client: nessun `useSession`; ruolo e `operatorId` arrivano da `api.user.getUserPreference` e vivono in `src/store/userPreferences.ts`. Protezione route: check `getServerAuthSession` in `src/app/dashboard/layout.tsx` e `src/app/login/page.tsx` (nessun middleware globale).
- Font: `next/font/google` (Inter) nel root layout. `next/image`: non usato.

## Decisioni di fase

- **Router**: React Router in library mode (`createBrowserRouter`). Equivalenze: `useRouter().push` → `useNavigate()`, `usePathname` → `useLocation().pathname`, `useSearchParams` → `useSearchParams()` (API quasi identica ma mutabile — attenzione nei custom hook).
- **Suspense**: mantenere gli skeleton attuali usando `isLoading`/`placeholderData` di React Query; non introdurre `useSuspenseQuery` in questa fase (tRPC v10 + RQ v4: suspense opzionale, migrabile dopo).
- **Invalidazione**: `revalidatePath/Tag` → `utils.x.invalidate()` di tRPC (`trpc.useContext()`/`useUtils`). Mappare ogni server action alla invalidation della query che la pagina usa.
- **Dev**: Vite `server.proxy` inoltra `/api` → `http://localhost:<PORT_API>` così i cookie di sessione sono first-party anche in sviluppo. In produzione stesso dominio via reverse proxy (D6).

## Task

### F3.T1 — Scaffold `apps/web`
- [ ] Vite + React 18 + TS (`@vitejs/plugin-react` già in uso nei test legacy). Alias `@/` → `src/`.
- [ ] Port di `tailwind.config.ts`, `postcss.config.cjs`, `src/styles/globals.css`, `components.json` (shadcn). Le CSS variables del font: sostituire `next/font` con `@fontsource-variable/inter` importato in `main.tsx` + `font-sans` su `:root` (stesso variable name usato oggi da Tailwind).
- [ ] Env: `VITE_SENTRY_DSN`, `VITE_BASE_URL` (se ancora serve — molti usi di `NEXT_PUBLIC_BASE_URL` spariscono con i path relativi `/api`). Wrapper tipato in `src/env.ts` che valida `import.meta.env` con zod.
- [ ] `index.html` con title/meta attuali; favicon e asset da `public/`.

**Verifica:** `pnpm --filter web dev` mostra una pagina con un componente shadcn renderizzato e gli stili Tailwind corretti.

### F3.T2 — Spostare il codice UI condiviso
- [ ] `git mv` in `apps/web/src/`: `components/`, `store/`, `lib/hooks/`, `lib/utils/` (la parte client; ciò che è andato in `@mito/core` in F2.T7 si importa da lì), `lib/types/` (idem), `lib/constants/` (idem), `lib/workers/`.
- [ ] Risolvere gli import verso `@mito/core` per schemi zod e costanti condivise.
- [ ] Bonifica `next/*` nei file spostati: `next/navigation` → react-router (toccherà `useGetPageAndPerPageParams`, `useGetMultipleUrlParamsValues`, `useHistoryBack` e ~32 componenti client — fare un grep e tenere la lista qui sotto in "Note di esecuzione"), `next/link` → `Link` di react-router, rimuovere `server-only`.
- [ ] Web worker in Vite: istanziare con `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })`; verificare che `ExportWorker.tsx`/`ImportWorker.tsx` (i context provider in `src/app/_context/`) funzionino invariati. Le URL delle fetch nei worker diventano relative (`/api/...`) e passano dal proxy.

**Verifica:** typecheck verde su `apps/web` con tutti i file spostati; `grep -r "next/" apps/web/src` vuoto.

### F3.T3 — tRPC client e provider
- [ ] Port di `src/trpc/react.tsx`: `createTRPCReact<AppRouter>` con `AppRouter` importato dal types-entrypoint di `apps/api` (F2.T4); `httpBatchLink({ url: "/api/trpc", fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }) })`; transformer superjson da `shared.ts`.
- [ ] `main.tsx`: `TRPCReactProvider` + `RouterProvider` + `Toaster` (port del root layout attuale `src/app/layout.tsx`).
- [ ] Eliminare `src/trpc/server.ts` (client RSC) dal nuovo mondo: non va portato.

**Verifica:** una query di prova (`analytics` o `user.getUserPreference`) renderizza dati reali dallo staging API con sessione.

### F3.T4 — Auth: login, sessione, route guard
- [ ] Hook `useSession`: query React Query su `GET /api/auth/session` (staleTime alto + refetch on focus). Tipo della risposta condiviso con l'API.
- [ ] Pagina `/login`: port di `src/app/login/page.tsx`; i bottoni provider fanno il flusso Auth.js (form POST a `/api/auth/signin/:provider` con CSRF token da `/api/auth/csrf` — verificare il flusso esatto sulla doc `@auth/express`). Redirect post-login a `/dashboard` (oggi nel callback `redirect` di NextAuth).
- [ ] `RequireAuth` route guard (layout route di react-router): senza sessione → redirect `/login`; con sessione su `/login` → redirect `/dashboard`. Sostituisce i check di `dashboard/layout.tsx` e `login/page.tsx`. Centralizzato: è un miglioramento rispetto a oggi.
- [ ] Port di `UserPreferenceProvider` (ruolo + operatorId via `api.user.getUserPreference`) nel layout dashboard, invariato.
- [ ] Gestire il caso `newUser` (oggi `pages.newUser` → `/dashboard/profile?firstTime=true`): dopo il login, se l'API segnala primo accesso, la SPA naviga al profilo con il query param.
- [ ] Logout: chiamata a `/api/auth/signout` + redirect `/login` + reset degli store Zustand.

**Verifica:** ciclo completo login Entra ID → dashboard → refresh pagina (sessione persistente) → logout → guard blocca `/dashboard`.

### F3.T5 — Albero route e shell
- [ ] `createBrowserRouter` con la mappa 1:1 delle pagine attuali:

  | Route SPA | Sorgente attuale | Note |
  |---|---|---|
  | `/` | `src/app/page.tsx` | redirect a `/dashboard` (oggi via `DashboardInitialPage`) |
  | `/login` | `src/app/login/` | F3.T4 |
  | `/dashboard` (layout) | `src/app/dashboard/layout.tsx` | shell: `DashboardLayout`, provider, worker context |
  | `/dashboard` (index) | `src/app/dashboard/page.tsx` | analytics, vedi F3.T6 |
  | `/dashboard/customers` | `customers/page.tsx` | |
  | `/dashboard/customers/new` | `customers/new/` | |
  | `/dashboard/customers/:id` | `customers/[id]/` | |
  | `/dashboard/customers/:id/connect` | `customers/[id]/connect/` | |
  | `/dashboard/pratiche` | `pratiche/page.tsx` | |
  | `/dashboard/pratiche/:id` | `pratiche/[id]/` | dettaglio + chat |
  | `/dashboard/profile` | `profile/` | le parallel route `@admin` e `@blacklist` diventano **tab** (o sezioni condizionate dal ruolo) dentro la pagina |

- [ ] Port di `src/app/_components/` (`DashboardLayout`, `InitialLoadingScreen`, ecc.) nella shell.
- [ ] Lazy loading per route (`React.lazy`) per mantenere bundle ragionevoli (Tremor e exceljs/xlsx pesano; i worker già isolano xlsx).
- [ ] 404 + error boundary di route (sostituiscono `global-error.tsx`).

**Verifica:** navigazione tra tutte le route con dati mock/reali; deep-link diretto a ogni URL funziona (history fallback di Vite).

### F3.T6 — Migrazione pagine: pattern di conversione
Pattern da applicare a ogni pagina (il grosso del lavoro di fase — una pagina per PR):

1. La fetch RSC `const data = await api.x.y.query(input)` diventa `const { data, isLoading } = trpc.x.y.useQuery(input)` nel componente pagina; lo skeleton già esistente (Suspense fallback) si riusa come stato `isLoading`.
2. I componenti client che ricevevano i dati come prop dalla RSC possono ora chiamare direttamente la query (decidere caso per caso: meno prop drilling, stessa query deduplicata da React Query).
3. Ogni server action in `_actions/` diventa `trpc.x.y.useMutation({ onSuccess: () => utils.<query-della-pagina>.invalidate() })`. Census attuale: `customers/_actions/` (4 file: bulk update, blacklist, task status), `pratiche/_actions/` (bulk update e affini), `profile/_actions/`. Compilare la mappa action→mutation→invalidate in "Note di esecuzione" man mano.
4. `unstable_noStore`, `revalidatePath`, `revalidateTag`, `export const dynamic/maxDuration` si eliminano.
5. Parametri URL (paginazione, filtri — `useGetPageAndPerPageParams`) via `useSearchParams` di react-router, già adattato in F3.T2.

- [ ] `/dashboard` (analytics): 8 query `analytics.*`, grafici Tremor, store `useAnalitycsStore`.
- [ ] `/dashboard/customers`: tabella TanStack Table + store `useCustomerTableStore`, paginazione URL, bulk actions (da `_actions/` → mutations).
- [ ] `/dashboard/customers/new`: form react-hook-form + zod (invariati), mutation `customer.create`.
- [ ] `/dashboard/customers/:id` (+ `/connect`): dettaglio, task/alert del cliente, collegamento pratiche.
- [ ] `/dashboard/pratiche`: tabella + store `usePracticeTableStore`, bulk assign.
- [ ] `/dashboard/pratiche/:id`: dettaglio + chat (router `chat`, 8 procedure; verificare se c'è polling/refetchInterval e mantenerlo).
- [ ] `/dashboard/profile` (+ tab admin/blacklist): preferenze utente, gestione ruoli (`adminProcedure`), blacklist.

**Verifica per ogni pagina:** confronto side-by-side con `web-legacy` sugli stessi dati di staging: stessi numeri, stessi filtri, stesse azioni; mutation → UI aggiornata senza reload.

### F3.T7 — Flussi import/export end-to-end
- [ ] Import: UI upload → `ImportWorker` → `POST /api/import/process` (nuova API) → preview/errori → conferma → `create`/`update` batch → invalidate liste. Testare con file Standard e Wave reali.
- [ ] Export: `ExportWorker` → route `/api/export/[export]/*` → `saveExport` ora su storage S3 → download via `/api/export/download` (o presigned URL se scelto in F2.T2 — coordinare).
- [ ] File errori import scaricabile.

**Verifica:** import reale completo e export completo da SPA in staging, file alla mano.

### F3.T8 — Sentry, build e rifiniture
- [ ] `@sentry/react` con integrazione react-router (sourcemap upload nel build CI con `SENTRY_AUTH_TOKEN`).
- [ ] Sostituire le pagine d'errore Next (`global-error.tsx`) con ErrorBoundary Sentry.
- [ ] Build di produzione: `vite build` + verifica bundle size; gli header di sicurezza e il caching di `next.config.js` si applicheranno al reverse proxy in fase 5 (annotare i valori da replicare).
- [ ] Lint: passare a una config ESLint senza `eslint-config-next` (da `packages/config`).

**Verifica:** build prod servita da preview locale (`vite preview` + API staging) — smoke test completo.

### F3.T9 — Collaudo di parità
- [ ] Checklist QA per pagina (la tabella di F3.T5) eseguita da un utente reale su staging: ADMIN e OPERATORE (le due viste differiscono: `useOperatorPermission`).
- [ ] Verifica permessi: OPERATORE non può modificare clienti/pratiche altrui; sezioni admin nascoste e API negata (FORBIDDEN).
- [ ] Test esistenti vitest portati su `apps/web` e verdi.

**Verifica:** checklist firmata nelle Note di esecuzione.

## Definition of Done

- SPA completa in staging contro `apps/api`: tutte le 11 route, import/export, chat, analytics, gestione ruoli.
- Zero dipendenze `next/*` in `apps/web`.
- Parità funzionale validata su entrambi i ruoli.
- `web-legacy` ancora in produzione, intoccato: il cutover è in fase 5.

## Rischi specifici

- **Drift dei contratti**: se in fase 2 il router `supabase`→`storage` o altri nomi cambiano, i type error guidano il fix (vantaggio di tRPC) — ma serve che `apps/web` importi `AppRouter` dal **nuovo** API, mai dal legacy.
- **Comportamenti impliciti delle RSC**: alcune pagine si affidano al refetch-su-navigazione delle RSC; con React Query servono `staleTime` corti o invalidation esplicite — verificare pagina per pagina nella checklist QA.
- **Parallel routes profilo**: la conversione a tab cambia leggermente la UX; farla approvare al committente prima di chiudere la fase.

## Note di esecuzione

_(da compilare durante l'esecuzione: censimento file con `next/navigation`, mappa action→mutation, checklist QA)_

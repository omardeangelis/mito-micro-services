---
domain: crm
type: spec
status: approved
links:
  - "[[chore/fase-2-httpapi]]"
  - "[[specs/crm/auth-better-auth/SPEC]]"
  - "[[chore/roadmap-nuovo-stack]]"
  - "[[chore/migrazione-gcp]]"
created: 2026-10-28
updated: 2026-10-28
---

# Spec: Login di better-auth da due frontend sullo stesso backend

## User input

> per la fase due c'è bisogno di pianificare? Nel caso apri un thread con opus extra

> si da continua, finiamo sta migrazione

Scelta sulla domanda "Come fa login l'app React su staging (2.1.3)?": **baseURL dinamico (H17+H18)**.

---

## Context

È la 2.1.3 di [[chore/fase-2-httpapi]].

Oggi better-auth conosce un solo indirizzo del frontend, `BETTER_AUTH_URL`. Da lì ricava:
- le origini da cui accetta un login;
- l'URI di ritorno da Microsoft;
- il link via email;
- le destinazioni a fine login;
- il prefisso `__Secure-` del cookie di sessione.

Il cookie non ha un attributo `Domain`, quindi vale solo sull'host che lo riceve.

Su staging quell'indirizzo è il dominio dell'app Next.js (`staging-crm.dbmito.it`). Lo stesso backend su Cloud Run deve servire anche l'app React (`apps/web`), che sta su un altro dominio (H17). Senza un cambio, l'app React non può fare login: la sua origine è rifiutata, e il ritorno dal login finisce sul dominio di Next.

Lo stesso problema c'è in altri due casi:
- **in locale:** `pnpm web:dev` (porta 5173) e `next dev` (porta 3000) usano lo stesso `pnpm api:dev`;
- **dopo il rilascio** (fase 4 di [[chore/roadmap-nuovo-stack]]): l'app Next resta deployata su un altro dominio, sullo stesso backend, come rollback del frontend.

Senza questa spec non si chiude il "fatto quando" della fase 2 (2.3.1): l'app React su staging fa login e mostra l'utente corrente.

Chi è coinvolto:
- **sviluppatori**: il link via email su staging e in locale;
- **operatori** e **admin**: provano lo staging; dopo il rilascio, usano in prod il frontend che risponde;
- **chi gestisce gli ambienti** (Omar): Vercel, Azure, le variabili di Cloud Run.

---

## Non-Goals

- Il progetto Vercel dell'app React, il suo `vercel.json` e le sue rewrite (2.3.1, H19).
- La scelta del dominio dell'app React di staging (H17). L'elenco qui accetta solo nomi esatti di domini del progetto (AC2), quindi H17 sceglie un nome, non uno schema.
- Un secondo servizio Cloud Run (l'alternativa di H18, scartata da Leonardo).
- Un cookie condiviso fra domini (`crossSubDomainCookies`): ogni frontend ha la sua sessione.
- Login o provider nuovi, e cambi alle regole di chi entra: [[specs/crm/auth-better-auth/SPEC]] resta com'è.
- Chiudere il backend al traffico che non passa da Vercel (un header segreto sulle rewrite): è una domanda aperta (OQ2), non un requisito.
- La prod: l'elenco arriva con il rilascio (fase 4), con i domini di allora.

---

## Acceptance Criteria

"Elenco" è la variabile con gli host ammessi. "Indirizzo principale" è `BETTER_AUTH_URL`, che resta obbligatorio. "Base della richiesta" è l'indirizzo che il backend ricava per una richiesta, con questa regola: l'host inoltrato (`x-forwarded-host`) se è nell'elenco; altrimenti l'header `Host`, se è nell'elenco; altrimenti l'indirizzo principale. Lo schema è sempre quello dell'indirizzo principale.

### Senza elenco nulla cambia

- **AC1**: Senza elenco, login, sessione, logout, redirect e cookie si comportano esattamente come oggi, sull'indirizzo principale. I test di `packages/server/src/betterAuth/_test/` passano con le asserzioni invariate. Una variabile vuota, o fatta solo di spazi, vale come assente.
- **AC2**: L'elenco ha solo nomi esatti di host, separati da virgole, con la porta facoltativa. Il backend non parte (il processo esce e il `/health` del deploy fallisce, quindi il traffico resta sulla revisione di prima), e `next build` senza `SKIP_ENV_VALIDATION` fallisce, con un messaggio che nomina la variabile, se l'elenco ha anche uno solo di questi:
  - un `*` o un `?`;
  - uno schema o un path;
  - un carattere non valido in un host;
  - un host di loopback (`localhost`, `127.*`, `::1`) con un indirizzo principale `https`;
  - un host che non è di loopback con un indirizzo principale `http`.

  Il controllo sta nello schema di `@mito/env`, come quello di `BETTER_AUTH_URL`.

### Con l'elenco

AC3–AC5 valgono su Vercel solo se OQ1 è verificata.

- **AC3**: Da ogni host ammesso, il login con il link via email (dove è acceso) resta sulla base della richiesta. Il link nell'email punta a quella base, e il redirect finale è `/dashboard` o `/dashboard/profile?firstTime=true` sulla stessa base.
- **AC4**: Da ogni host ammesso, il login con Microsoft parte con l'URI di ritorno della base della richiesta e, al ritorno, finisce su `/dashboard` (o sul primo accesso) di quella base.
- **AC5**: Il cookie di sessione ha, su ogni host, lo stesso nome e gli stessi attributi di oggi: prefisso `__Secure-` e `Secure` quando l'indirizzo principale è `https`, poi `HttpOnly`, `SameSite=Lax`, nessun `Domain` (AC17 di [[specs/crm/auth-better-auth/SPEC]]). Il `Set-Cookie` di fine login non ha `Domain`, quindi un login su un host non dà una sessione sull'altro. Durata, rinnovo e logout restano quelli di oggi (AC14 e AC19).
- **AC6**: Link, URI di ritorno e redirect usano lo schema dell'indirizzo principale, qualunque `x-forwarded-proto` arrivi: con un indirizzo principale `https` non esce mai un link `http`.
- **AC7**: Una richiesta che cambia stato (avvio del login, logout) con un'`Origin` che non è un host ammesso né l'indirizzo principale è rifiutata come oggi una di origine estranea. Non crea verifiche, sessioni o email.
- **AC8**: Un host non ammesso, nell'header `Host` o in `x-forwarded-host`, non diventa un errore. La base della richiesta è l'indirizzo principale, e quindi:
  - la lettura della sessione risponde come senza sessione, o con la sessione del cookie se c'è;
  - `/api/v1/me` risponde 401 senza cookie;
  - nessun link e nessun redirect puntano all'host non ammesso.

  Un `x-forwarded-host` malformato si ignora, e vale `Host` con la stessa regola.
- **AC9**: Il redirect di fine login non porta mai fuori dalla base della richiesta, qualunque `callbackURL` mandi il client: AC5 e AC6 di [[specs/crm/auth-better-auth/SPEC]] valgono per ogni host ammesso. Un login che passa da una rewrite di Vercel (l'URL della richiesta è su `run.app`, la base è l'host inoltrato) finisce bene.
- **AC10**: Le regole di chi entra non cambiano con l'host: il disattivato è rifiutato, valgono le email ammesse in prova, e nessun account si aggancia per la sola email (AC3, AC9, AC11, AC15 di [[specs/crm/auth-better-auth/SPEC]]).
- **AC11**: `api:smoke` avvia il bundle con un elenco che non contiene l'host con cui lo chiama (`127.0.0.1:<porta>`). `/api/auth/get-session` risponde 200 con `null`, e `/api/v1/me` 401.

### Gli ambienti

- **AC12**: In locale, con `BETTER_AUTH_URL=http://localhost:3000`, l'elenco `localhost:3000,localhost:5173`, e `BACKEND_URL=http://localhost:4000` con `BACKEND_AUTH=true` per Next, `next dev` e `pnpm web:dev` fanno login con il link via email sullo stesso `pnpm api:dev`, ognuno sulla sua porta. Lo scrive `AGENTS.md`.
- **AC13**: Lo script di deploy di staging passa al backend l'elenco con il dominio di Next e, quando esiste, quello dell'app React. Fino ad allora passa solo quello di Next, e lo staging di Next fa login come prima.
- **AC14**: [[chore/fase-2-httpapi]] dice cosa fa chi ha gli accessi: registrare in Azure l'URI di ritorno di ogni host ammesso, e aggiungere l'host all'elenco di Cloud Run. La riga 2.1.3 del piano dice che il "rifiuto da un host non ammesso" è AC7 più AC8.

---

## Constraints

- Tocca l'auth: la revisione della PR è di Leonardo (regola 5 della roadmap).
- Il backend su Cloud Run ha `--ingress=all`: chiunque lo chiama direttamente, con un `Host`, un `x-forwarded-host` o un `x-forwarded-proto` a scelta. Per questo:
  - gli header inoltrati valgono solo dentro l'elenco (AC8);
  - lo schema non viene mai dalla richiesta (AC6);
  - l'elenco non ha schemi (AC2).

  Al massimo, chi chiama direttamente sceglie fra i domini del progetto.
- L'elenco ha solo domini che il progetto controlla. Un dominio `*.vercel.app` va bene solo con il nome esatto del progetto, mai con lo schema dei preview.
- `better-auth` resta alla 1.7.13, senza patch.
- Next.js (con o senza `BACKEND_AUTH`) e il backend costruiscono la configurazione con lo stesso `authConfigFrom`.

---

## Technical Notes

- **Il `baseURL` dinamico di better-auth 1.7.** È `{ allowedHosts, protocol, fallback }`, più `advanced.trustedProxyHeaders` per leggere gli header inoltrati (`dist/utils/url.mjs`, `dist/context/helpers.mjs`).
  - `allowedHosts` accetta anche i pattern glob: da qui il divieto di AC2.
  - Senza `fallback`, un host non ammesso lancia `BetterAuthError`, che diventa un 500. Con il `fallback` sull'indirizzo principale, si ha AC8.
  - Lo schema viene da `protocol` se c'è, altrimenti da `x-forwarded-proto`, altrimenti dall'URL della richiesta, che dietro Cloud Run è `http`. Dato `protocol` = lo schema dell'indirizzo principale, si ha AC6.
  - Con la configurazione dinamica, il prefisso `__Secure-` viene da `protocol`, o altrimenti da `NODE_ENV=production`: con `protocol` dato, si ha AC5 anche nei test.
  - Le origini fidate si ricavano dall'elenco e dal `fallback`. Per un host di loopback valgono `http` e `https`: per questo AC2 lo tiene fuori dagli elenchi `https`.
- **`authHandler`** (`packages/server/src/betterAuth/handler.ts`) oggi legge `auth.options.baseURL` come stringa, e lancia se non lo è. `endOfLogin` confronta il redirect con quella stringa. Con l'elenco, il confronto va fatto sulla base della richiesta, non su `new URL(request.url)`, che dietro una rewrite è `run.app`.
- **Le rewrite.** `next.config.js` non riscrive `/api/v1`: a Next non serve. Le rewrite dell'app React sono di 2.3.1.
- **Il nome della variabile**, proposto: `BETTER_AUTH_ALLOWED_HOSTS`, in `@mito/env` e in `authConfigFrom`.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | Una richiesta che passa dalla rewrite di Vercel arriva a Cloud Run con `x-forwarded-host` = l'host del frontend e `x-forwarded-proto` = `https`? La documentazione di Vercel (Rewrites → "Identifying the visitor at your origin") dice di sì per le rewrite verso un'origine esterna. Resta da vedere su staging, con le rewrite di `next.config.js`: dopo il merge, con l'elenco con il solo dominio di Next, un login con il link via email su staging deve finire su `staging-crm.dbmito.it`. Se non regge, la scelta torna a Leonardo (alternativa di H18). | AC3–AC5, AC9, AC13 | Claude, con il deploy di staging dopo il merge | Documentata, da verificare su staging |
| 2 | Chiudere il backend al traffico che non viene da Vercel, con un header segreto messo dalla rewrite (la documentazione di Vercel lo suggerisce). Le rewrite di `next.config.js` non possono aggiungere header; quelle di `vercel.json` (2.3.1) sì. Proposta: con la fase 4. | Superficie di Cloud Run | Omar | Open |
| 3 | Il dominio dell'app React di staging (H17): il nome esatto `*.vercel.app` del progetto, o un sottodominio di `dbmito.it`. | AC13, AC14 | Omar | Open, non blocca il codice |
| 4 | In prod, alla finestra del rilascio (fase 4), l'elenco ha il dominio di prod e quello del Next di rollback: quale dominio prende il Next di rollback? | AC14 | Omar, con la fase 4 | Open |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Un backend per due frontend, con il `baseURL` dinamico di better-auth (H18), invece di un secondo Cloud Run | Scelta di Leonardo del 2026-10-28. Serve anche dopo il rilascio, per il Next di rollback, e in locale. |
| Un host non ammesso usa l'indirizzo principale (`fallback`), invece di dare un errore | Senza `fallback`, ogni chiamata diretta a Cloud Run (smoke, health, uno scanner) diventa un 500 alla prima lettura della sessione. Con il `fallback` link e redirect vanno al dominio principale, che è dove vanno oggi. Il "rifiuto" della riga 2.1.3 diventa AC7 (origine) più AC8 (host). |
| Lo schema viene dall'indirizzo principale, mai dalla richiesta | Con `--ingress=all`, un `x-forwarded-proto: http` falso farebbe uscire un link `http` con il token. Dietro Cloud Run l'URL della richiesta è `http`. |
| Solo nomi esatti nell'elenco | `allowedHosts` accetta i glob. Con `*.vercel.app`, chi chiama direttamente Cloud Run farebbe partire verso la vittima un link via email che punta al proprio progetto Vercel, e ne prenderebbe il token. |
| Senza la variabile nulla cambia (AC1) | La PR entra in `dev` e su staging senza toccare la prod né lo staging di oggi. L'elenco si accende per ambiente. |
| Sessioni separate per host, senza cookie condiviso | I domini di staging (`dbmito.it` e `vercel.app`) non hanno un dominio padre comune, e un cookie condiviso allargherebbe la superficie della sessione. |

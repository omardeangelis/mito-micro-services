---
domain: crm
type: review
scope: spec
spec: gestione-operatori
review_target: "spec implementation, per PR (un round per PR)"
base_ref: claude/great-carson-o6qn17-pr5 (6eb42e0)
head_ref: claude/great-carson-o6qn17-pr5 (a5c808a); correzioni senza review in cb51313
verdict: do-not-ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/gestione-operatori/RUBRIC]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/gestione-operatori/PLAN]]"
  - "[[specs/crm/gestione-operatori/IMPLEMENTATION-NOTES]]"
ingested: true
last_ingested: 2026-10-23
created: 2026-10-22
updated: 2026-10-23
---

# Review Report: gestione-operatori

Un round per PR. Il frontmatter riporta l'ultimo round.

## [Round: 2026-10-22 — PR 2, user e operator su Effect]

### Verdict

**SHIP** · impact: critical. Serve la revisione di Leonardo prima del merge (AC29a, checklist sotto).

### Coverage

- Rubric passes run: 4/4 (v1 e v3 sul modello più forte, v2 e v4 su quello bilanciato).
- Passes skipped or failed: nessuno.
- UI pass: not chartered (diff solo server).
- Gate di CI, eseguiti sulla testa `ac85739~1` (prima dei test aggiunti dopo la review): `next lint`, `tsc --noEmit`, `pnpm run test --run` con i `*.pg.test.ts` (162 file, 2520 test), `pnpm build`, `pnpm api:build`, `pnpm api:smoke`, tutti verdi.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MINOR | v1, v2, v3: percorso di un errore del database | `packages/server/src/effect/trpc.ts:46-51`, raggiunto da `api/trpc.ts:145-149` e dalle procedure di `operator` e `user` | Su un errore del driver il `cause` del `TRPCError` è ora un `DbError` invece del `PostgresError`: per Sentry la catena diventa `TRPCError → DbError → PostgresError`, con gruppi nuovi, e `runTrpc` scrive una riga `Effect.logError` in più. Codice, messaggio e corpo della risposta sono identici (v3 l'ha misurato con l'handler HTTP vero) | Nessuna correzione: è il comportamento di `runTrpc` già in uso da `task`, `customer`, `chat` sulla base. Da sapere al rilascio: possibili issue Sentry nuove per gli stessi errori | no |
| MINOR | v1: test | `api/_test/procedures.db.test.ts` | Nessun test copriva un ADMIN senza operatore su un `adminProcedure`, né il messaggio di `BAD_REQUEST` | **Chiuso** in `ac85739`: due casi aggiunti, verdi anche sul codice della PR 1 | no |
| MINOR | v3: test | `api/_test/driverError.db.test.ts` | Nessun test per un errore del driver in una procedura di `operator` e per il JSON rovinato di `getUserPreference` | **Chiuso** in `ac85739`: due casi aggiunti, verdi anche sul codice della PR 1. Un errore del driver dentro il middleware stesso resta senza test: per provocarlo bisogna rompere la tabella `operators` | no |
| MINOR | v4: forma di AC24 | router `operator` e `user` | AC24 scrive `runTrpc(program, operatorErrorToTrpc \| userErrorToTrpc)`, ma i servizi falliscono solo con `DbError` e `runTrpc` non accetta un mapper: `userErrorToTrpc` non esiste | Nessuna: il tipo di `runTrpc` lo impone. Annotato in `IMPLEMENTATION-NOTES.md` | no |
| MINOR | v4: copertura | `services/operator/_test/queries.db.test.ts` | `getOperatorById` e `getPublicOperator` non hanno test di servizio; li coprono i test del router | Facoltativo | no |
| NIT | v3 | `services/operator/roles.ts` | Resta l'asserzione `!` di `changes.find(...)!.role`, che non può fallire | Si toglie con la transazione della PR 4 (T4.4) | no |
| NIT | v3 | `effect/db.ts` (`toDbError`) | Un `DrizzleQueryError` senza `cause` porterebbe SQL e parametri nel messaggio, prima e dopo la PR | Rischio preesistente, il client pg imposta sempre il `cause` | no |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1: permessi | `protectedProcedure` invariato; `NotAnOperator` → `TRPCError({ code: "BAD_REQUEST" })` come prima; `adminProcedure` resta dopo il controllo dell'operatore e lo impongono i tipi (`ctx.actor` esiste solo dopo); il ruolo viene dalla stessa riga `users` (enum `notNull`), quindi non può differire dalla vecchia seconda query; i test girano davvero sul percorso nuovo (mock di `@mito/db` dentro `ServerLive`); i mutanti "senza controllo del ruolo" e "altro codice per NotAnOperator" sono presi |
| v2: parità delle procedure | I test di caratterizzazione della PR 1 hanno diff vuoto e sono verdi; stesse query, stranezze di AC26 conservate, `.returning()` tolto senza effetto osservabile, `updateOperatorsRole` sequenziale e fuori transazione, id duplicati come prima, `retrieveUserPrefercence` spostata identica |
| v3: errori | Stato HTTP e corpo identici fra vecchio e nuovo codice per errore del driver in procedura, nel middleware, JSON rovinato e `NotAnOperator`; nessun SQL né parametri; `dropExpectedTrpcErrors` classifica come prima; `contactErrorFromCause` null come prima |
| v4: convenzioni e gate | Niente `drizzle-orm` nei router `operator` fuori da `_test/`; `TRPCError` solo nei `*ErrorToTrpc` e in `effect/trpc.ts`; Drizzle solo dentro `query`; nessun Next.js in `packages/server`; `server-only` regge `api:build` e `api:smoke`; i test nuovi passano dall'interfaccia pubblica |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Parità dei middleware dei permessi | SHIP | Ogni ramo del codice vecchio ha il suo corrispondente; l'unica differenza è sul percorso di un errore del database e non cambia chi entra |
| v2 | Parità delle procedure migrate | SHIP | Nessun input con un valore di ritorno o un effetto sul database diverso |
| v3 | Parità del percorso degli errori | SHIP | Il client vede lo stesso; cambia solo la telemetria, come per ogni procedura già su `runTrpc` |
| v4 | Convenzioni e gate | SHIP | Nessun problema bloccante; due note facoltative |

### Human Review Checklist

Per Leonardo (AC29a: la PR cambia i middleware dei permessi), prima del merge in `dev`:

1. Leggere `packages/server/src/api/trpc.ts` da riga 133: `protectedProcedure` è identico, `operatorProcedure` passa da `resolveActor` (`services/auth/actor.ts`), `adminProcedure` controlla `ctx.actor.role`.
2. Confermare che `operatorErrorToTrpc` (`services/operator/errors.ts`) restituisce `BAD_REQUEST` senza messaggio né `cause`, come prima.
3. Lanciare `pnpm run test --run packages/server/src/api packages/server/src/services` e verificare che `git diff claude/great-carson-o6qn17-pr1 -- packages/server/src/api/_test packages/server/src/api/routers/*/_test` mostri solo righe aggiunte.
4. Decidere se le issue Sentry nuove per gli errori del database (finding MINOR 1) vanno annunciate al rilascio.
5. Merge in `dev` fuori da una release di cutover GCP.

### Acceptance criteria check

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC24 | Met (per la PR 2) | Router `operator` senza Drizzle fuori dai test; `getUserPreference` adapter; le `update*` non migrate. Il controllo su `user` vale dopo la P2 |
| AC25 | Met | `UNAUTHORIZED` per i disattivati arriva con la PR 4 |
| AC26 | Met | Test della PR 1 con diff vuoto, verdi |
| AC28 | Met | |
| AC29 | Met | Gate locali verdi; CI su GitHub quando si apre la PR |
| AC29a | Pending | Revisione di Leonardo |

### Notes for docs-maintenance

- Durable findings: nessuno nel debito della feature. La differenza di telemetria su `runTrpc` è comune a tutta la migrazione: va in [[chore/migrazione-effect]] §7 se si decide di correggerla.
- Domain pages that should backlink this review: nessuna ancora (`brain/domains/crm/` non esiste).

## [Round: 2026-10-22 — PR P1, preferenze di layout nel browser]

### Verdict

**SHIP** · impact: critical. Le correzioni minori della review sono in un commit dopo d6d9667 (sotto).

### Coverage

- Rubric passes run: 4/4 (v1 e v2 sul modello più forte, v3 e v4 su quello bilanciato).
- v1 ha lavorato sull'app servita (`next dev` sul seed di `mito_local`), con `agent-browser`, la console, il log del server e l'HTML servito.
- Gate di CI sul branch (d6d9667, dopo la reinstallazione dei `node_modules` del worktree): `next lint`, `tsc`, 2530 test con i `*.pg.test.ts`, `pnpm build`, `api:build`, `api:smoke`, tutti verdi.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MINOR | v2 | `src/store/context/UserPreferenceContext.tsx` | La copia una tantum gira nel render anche dopo che i figli sono montati (getUserPreference fallisce, poi un refetch riesce): avviso di React "Cannot update a component while rendering" | Copia nel render solo prima che i figli montino, poi in un effect; test del percorso caricamento → dati ed errore → successo | no (corretto) |
| MINOR | v2 | stesso file | La copia non controlla il tipo del valore del server: una stringa al posto di una lista diventa un cookie illeggibile e rompe la tabella | Stesso controllo del parser dei cookie prima di copiare | no (corretto) |
| MINOR | v4 | `PraticesTable.tsx` | Nessun test per la tabella Pratiche, cambiata come quella dei Clienti | Test gemelli di quelli dei Clienti | no (corretto) |
| MINOR | v1 | `UserPreferenceProvider` | Le tabelle e la sidebar non sono mai rese dal server: il provider mostra lo scheletro finché la query carica, e la query non è prefetchata. Quindi la lettura dei cookie della richiesta (AC32) serve solo da seme. Se un giorno il dashboard venisse reso dal server, sidebar e chiavi copiate non combacerebbero all'idratazione | Commento nel provider che fissa l'invariante; seminare lo store dai cookie della richiesta se cambia | sì: nota per chi toccherà il rendering del dashboard |
| MINOR | v2 | localStorage `userPreference-storage` | Tolto senza leggerlo: un valore della sidebar più nuovo di quello del server (salvataggio fallito, un altro dispositivo) si perde una volta | Accettato: è solo layout, e quel valore non era per utente (Run 3 di sezione-contatti) | no |
| MINOR | v4 | `src/app/api/user/preferences/route.ts` | La route e le `update*` restano, senza più chiamanti nel client | Voluto: le toglie la P2 (AC34, AC35) | no |
| NIT | v2 | vecchio `PraticesTable` | Il vecchio codice salvava le colonne di Pratiche sotto la chiave sbagliata, e il server non le ha mai tenute: la copia non ne riporta | Una riga nella descrizione della PR | no |
| NIT | v3 | `cookies.ts` | Nessun `Secure`; nessun limite di dimensione; un cookie duplicato su un altro path verrebbe letto diverso da server e client | Nessuna: liste sotto 300 byte, contenuto non sensibile | no |
| NIT | v1 | `CustomersTable.tsx` | Nel cookie finiscono anche `id` e `select`, sempre sovrascritti | Come prima sul server | no |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1: render e router cache | Nessun avviso di idratazione (console, intercettazione di `console.error`, log del server); tracce con un MutationObserver: nessuna colonna appare e sparisce, la sidebar chiusa non si apre al ricaricamento; router cache entro 30 s su Contatti, Clienti e Pratiche con 0 richieste RSC: si vede l'ultima scelta |
| v2: preferenze salvate | La copia scrive solo i cookie mancanti, una volta, prima che i figli seminino, anche con i dati in arrivo dopo; nessun effetto doppio in StrictMode; route, `update*` e `preferences` di `getUserPreference` intatti, quindi una scheda vecchia continua a funzionare (AC35) |
| v3: codifica | Valori illeggibili (encoding, JSON, tipi) assenti senza eccezioni, lato server e client; il giro decode/encode con il parser vero di next 14.2.35 è senza perdite (%, unicode, `;`, `,`); `__proto__` e `constructor` innocui; nessun dato di identità nei cookie |
| v4: store e logout | Ogni setter scrive solo il suo cookie; nessun consumatore rotto da `Partial<UserPreference>`; il logout pulisce i 4 cookie, lo store, ruolo e operatore; ruolo e operatore solo dalla sessione; nessuna scrittura al mount; i test cambiati tolgono solo le asserzioni sul vecchio giro al server |

### Human Review Checklist

1. Annotare la data del rilascio in prod della P1 su Vercel: la P2 arriva al backend almeno 2 settimane dopo (AC34, AC35).
2. Dopo il rilascio, con un utente che ha preferenze salvate solo sul server, controllare che al primo accesso le ritrovi (sidebar e colonne di Clienti e Contatti; quelle di Pratiche il server non le ha mai tenute).
3. In un browser condiviso, controllare che dopo "Esci dal gestionale" non restino cookie `mito-pref-*`.
4. Gate di CI verdi sulla PR.

### Acceptance criteria check

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC31 | Met | Verificato nel browser: nessuna richiesta, cambio immediato |
| AC32 | Met | Le pagine leggono i cookie della richiesta; la tabella però appare solo dopo il caricamento del provider (finding v1) |
| AC33 | Met | Logout verificato nel browser |
| AC34 | Met (parte P1) | Copia verificata nel browser con due utenti del seed |
| AC35 | Met (parte P1) | La parte P2 è un passo di rilascio |

### Notes for docs-maintenance

- Durable findings: l'invariante "niente sotto `UserPreferenceProvider` è reso dal server" (finding v1), da tenere presente a chi cambierà il rendering del dashboard.

## [Round: 2026-10-22 — PR 4, disattivazione backend, primo giro]

### Verdict

**DO NOT SHIP** · impact: critical. Due verificatori su sette (v4, v7) con MAJOR; le correzioni sono in corso (secondo giro sotto, quando arriva).

Obiezione più forte (v4): il log e gli spostamenti della disattivazione scelgono le righe con due statement diversi, quindi un writer che non passa dalla regola dei lock ("Assegna a te", `insertCustomer` con X) può far spostare un cliente senza riga di log, o lasciarlo sul disattivato. Riprodotto su Postgres reale.

### Coverage

- Rubric passes run: 7/7 (v1–v5 sul modello più forte, v6–v7 su quello bilanciato).
- Gate di CI sulla testa della PR 4 (dopo T4.6): verdi, 2618 test con i `*.pg.test.ts`, build, `api:build`, `api:smoke`.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v4 (anche v5) | `services/operator/deactivate.ts` | Log `INSERT ... SELECT` e `UPDATE` scelgono le righe per predicato in statement separati: un cliente che diventa di X fra i due si sposta senza riga di log | Log e spostamenti in un solo statement (CTE che modificano dati), test a due connessioni | no (in correzione) |
| MAJOR | v4 (anche v5) | `services/customer/assignment.ts` `assignToYourself` | "Assegna a te" non prende il lock della riga utente: in una race lascia un cliente sul disattivato (AC7) | `findWorkingOperator(actor.operatorId)` prima del lock del cliente; test a due connessioni | no (in correzione) |
| MAJOR | v4 | `deactivate.ts` | Un contatto attivo senza cliente si sposta senza riga di log: `task_event_log.customer_id` è NOT NULL e le migrazioni sono solo additive. AC9 dice "ogni contatto" | Decisione: resta così, documentato, con un test; nota per Omar (deviazione da AC9) | sì |
| MAJOR | v7 | `deactivate.db.test.ts` | Il failpoint di AC8 fa fallire la prima scrittura: il test passerebbe anche senza transazione | Failpoint dopo gli spostamenti (update di `users`, commit) | no (in correzione) |
| MAJOR | v7 (anche v5) | test di concorrenza | Nessun test dell'ordine dei lock per Assegna chiamate, Assegna Clienti (manca il controllo "cliente non bloccato") e riassegnazione: spostare il controllo dopo il lock del cliente non fa fallire nulla | Test su Postgres reale gemelli di quelli dell'handover; uno con la disattivazione vera | no (in correzione) |
| MINOR | v3 | `services/operator/roles.ts` | Un ADMIN senza operatore conta come admin, ma non può usare le procedure admin: l'ultimo admin vero potrebbe declassarsi | Contare solo gli admin con operatore; test su id duplicati, batch vuoto, errore alla procedura | no (in correzione) |
| MINOR | v7, v5 | `deactivate.pg.test.ts` | Il tetto di 2 ripetizioni su 40P01 non è fissato da un test | Test con deadlock a ogni tentativo: 3 transazioni, poi errore | no (in correzione) |
| MINOR | v4 | router `operator` | `z.number().int()` senza limiti: un id oltre int32 dà 500 invece di `OperatorNotFound` | `.positive().max(2147483647)` | no (in correzione) |
| MINOR | v6 | `auth.ts:174` | `DBAdapter.getSessionAndUser!` | Guard senza `!` | no (in correzione) |
| MINOR | v6 | test | Testi di `describeContactError` per i codici nuovi non asseriti; forma HTTP degli errori simulata a mano | Asserzioni aggiunte | no (in correzione) |
| MINOR | v1 | `authDisabled*.db.test.ts` | "Nessun utente nuovo" chiamando il callback direttamente non prova nulla da solo: la garanzia viene dal flusso di NextAuth (verificato nel sorgente: AccessDenied prima di `createUser`) | Accettato; nota nel test | no |
| MAJOR (release) | v2 | OQ2 | Ogni utente del tenant Azure è ADMIN: via HTTP può declassare un admin (purché ne resti uno) e disattivarlo, e non c'è riattivazione dalla UI | Chiudere OQ2 prima della prod (checklist) | sì: blocca il rilascio in prod |
| NIT | v1, v2, v5, v6, v7 | vari | Commento di `signIn` sul flusso email, etichetta del log di `runAuth`, nome di un test, import duplicati, finestra time-of-check sull'attore, il cron `priority` fuori dalla regola come vittima di un 40P01 | Corretti dove sono codice di questa PR; gli altri annotati | no |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1: autenticazione | Seguito il flusso reale di NextAuth v4: il disattivato è rifiutato prima del ramo prod, il link email non parte e non si usa, nessun `createUser`; l'adapter sovrascritto è quello usato da `getServerSession` e da `sessionFromRequest`; errori del database chiudono |
| v2: autorizzazione | Le tre procedure nuove sono `adminProcedure`; un disattivato riceve `UNAUTHORIZED` anche con la sessione già letta; `protectedProcedure` identico; nessun altro percorso accetta un attore disattivato |
| v3: ruoli | LastAdmin, disattivati nel batch, id sconosciuti, atomicità, doppia retrocessione simultanea su Postgres reale; 10 casi in più provati a parte |
| v4: dati | Ordine dei controlli, transazione unica, "il cliente vince", scrittura per insiemi a 5.000 righe, retry con il SQLSTATE vero, conteggi del dialog uguali agli spostamenti |
| v5: concorrenza | Verificato a due connessioni che Postgres ricontrolla la riga utente dopo l'attesa (EvalPlanQual); nessun writer blocca un cliente prima dell'utente; nessun deadlock negli scenari di AC7 |
| v6: errori | Mappatura esaustiva (tsc), codici leggibili in tutte e due le forme, AC24 e AC28 rispettati |
| v7: test | Nessun test esistente indebolito; i `*.pg.test.ts` girano in CI e non si possono saltare; molti mutanti presi |

### Human Review Checklist

1. Revisione di Leonardo (AC29a): ruoli (`services/operator/roles.ts`), login e sessioni (`auth.ts`, `services/auth/{disabled,actor}.ts`).
2. **OQ2 chiusa prima della prod:** oggi chiunque del tenant Azure entra come ADMIN e può, via `/api/trpc`, declassare e disattivare altri senza possibilità di riattivarli dalla UI.
3. Ordine di rilascio: migrazione della PR 3 applicata sull'ambiente prima che ci arrivino le PR 3 e 4 (IMPLEMENTATION-NOTES, Deviations).
4. Su staging: un utente di prova disattivato con `operator.deactivate` viene buttato fuori al refresh, su Vercel e su Cloud Run, e non rientra con Azure; misurare la lettura in più della sessione.
5. Gate di CI verdi sulla PR, con i `*.pg.test.ts`.
6. Deviazione da AC9 da accettare: un contatto attivo senza cliente si sposta senza riga di log.

### Acceptance criteria check (primo giro)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1–AC6, AC13 | Met | |
| AC7 | Unmet | "Assegna a te" in race (in correzione) |
| AC8 | Met nel codice, test insufficiente | in correzione |
| AC9 | Unmet | log e spostamenti da statement diversi (in correzione); contatti senza cliente (deviazione) |
| AC10–AC12 | Met | tetto dei retry da fissare con un test |
| AC14–AC20 | Met | |
| AC22 (codici), AC24–AC28 | Met | |

## [Round: 2026-10-22 — PR 4, disattivazione backend, secondo giro]

### Verdict

**SHIP** · impact: critical. I due verificatori del primo giro con MAJOR (v4 dati, v7 test) danno SHIP sulle correzioni di a0b45b4, con 2 MINOR e 2 NIT. Restano le condizioni umane del primo giro: revisione di Leonardo, prova su staging, OQ2 prima della prod.

### Coverage

- Rubric passes run: 2/2 (v4, v7, modello più forte). v1, v2, v3, v5, v6: SHIP al primo giro, non rilanciati per scelta di Omar.
- Gate di CI su a0b45b4, in un worktree senza file di env reali: `next lint` e `tsc --noEmit` verdi; `pnpm run test --run` con `TEST_DATABASE_URL` su Postgres 15: 180 file e 2643 test verdi, `*.pg.test.ts` girati e nessuno saltato; `pnpm build`, `api:build`, `api:smoke` verdi.
- Un test saltato per costruzione: `cronCli.test.ts` vuole la porta 54329 libera, e in locale lì c'è il Postgres dei test. In CI il Postgres è sulla 5432 e il test gira.
- v7 ha eseguito 22 mutanti in una copia del codice: tutti presi dai test.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MINOR | v4 | `services/operator/deactivate.ts:153-154`, `:245-247` | Il commento dice che una riga diventata di X dopo i lock "si sposta e si registra allo stesso modo". Vale solo se lo scrittore conferma prima che lo statement `moveAndLog` prenda la sua fotografia: un contatto confermato su X dopo la fine della disattivazione resta sul disattivato (sonda su Postgres 15). Il log resta coerente; il buco è degli scrittori fuori dalla regola dei lock (`customer.insertCustomer`), già nel debito previsto da T5.2 | Commento limitato a "confermata prima dello statement di spostamento", con il rimando al controllo lato scrittore | no |
| MINOR | v7 | `services/operator/_test/deactivate.pg.test.ts:241` | Il test "scritti e confermati dopo i lock" passa anche sul codice di prima (log e spostamenti in statement separati): l'altra connessione conferma prima di ogni scrittura. La garanzia di AC9 sotto race la tiene il test sulla forma del SQL (`deactivate.db.test.ts:746-760`: un solo statement scrive clienti, task e log) | Commento del test che non lo presenta come test di regressione e rimanda al test sulla forma del SQL | no |
| MINOR | v4 | deviazione da AC9 | Il contatto attivo senza cliente si sposta senza riga di log: fa esattamente quello che è dichiarato (spostato, contato, sotto lock, niente log) e non nasconde altro. È scritta in IMPLEMENTATION-NOTES ma non ancora accettata da Omar né nel debito | Accettazione di Omar (checklist), poi voce in `brain/tech-debt/crm/gestione-operatori.md` (T5.2) | sì |
| NIT | v7 | `deactivate.pg.test.ts`, `operatorLock.pg.test.ts` | Quando un'asserzione di lock fallisce, la transazione tenuta non viene rilasciata: un mutante fa fallire 10–19 test per timeout e nasconde il fallimento vero | Rilascio in `onTestFinished` | no |
| NIT | v7 | `operatorLock.pg.test.ts:289` | La riassegnazione dei contatti contro la disattivazione vera "già partita" non ha un test: c'è solo contro un sostituto scritto a mano. AC7 non la elenca e il mutante M8 è preso | — | no |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v4: dati | Controlli di AC3–AC6 prima di ogni scrittura, ognuno con un test che verifica che non cambia nulla. AC8c con `coalesce(nullif(customer.operator_id, X), dest)` sulla riga della fotografia, i quattro casi del cliente coperti. Log costruito dai `RETURNING` dei due UPDATE: `to_operator_id` è quello scritto davvero. Tre sonde a due connessioni (contatto spostato altrove durante l'attesa, solo stato cambiato, cliente cambiato): nessuno spostamento senza log, nessun log senza spostamento. AC10, AC13 (`count()` con zero clienti), conteggi di `deactivationImpact` uguali agli spostamenti. 5.000 clienti + 5.000 contatti in 367 ms |
| v4: retry | `Effect.retry({ times: 2, while: isDeadlock })` attorno all'intera transazione, nuova transazione a ogni tentativo; SQLSTATE letto attraverso `DrizzleQueryError` |
| v7: failpoint (AC8) | Senza transazione e con la transazione spezzata in due (spostamenti, poi `users` e sessioni) i casi tardivi falliscono; il failpoint al commit usa un trigger di vincolo differito |
| v7: ordine dei lock (AC7, AC11) | Mutanti presi: "Assegna a te" con il cliente prima (M4) o senza lock dell'utente (M5), Assegna Clienti (M6), Assegna chiamate (M7), riassegnazione (M8), disattivazione con i clienti prima (M9), senza `FOR UPDATE OF users` (M10), `FOR NO KEY UPDATE` (M11), `findWorkingOperator` senza `KEY SHARE` (M12). Le attese sono sugli statement dichiarati |
| v7: tetto dei retry | 3 ripetizioni, 1, nessuna e retry su ogni `DbError`: tutti presi |
| v7: test non indeboliti | Le asserzioni rimosse fissavano il disegno a due statement e sono sostituite da asserzioni più strette; nessun `skip`, `only` o asserzione condizionale |
| Orchestratore: punti scoperti dal classificatore | "Assegna a te": ordine dei lock preso da M4/M5; `OperatorNotFound` mappato da `customerErrorToTrpc` (tsc). `getOperatorsForDeactivation` e `getDeactivationImpact` usano `deactivationInput` con id int32 positivi |

### Human Review Checklist

1. Revisione di Leonardo (AC29a): ruoli (`services/operator/roles.ts`, compresa la regola nuova di `LastAdmin`: contano solo gli admin con un operatore), login e sessioni (`auth.ts`, `services/auth/{disabled,actor}.ts`), "Assegna a te" che ora blocca la riga utente dell'attore.
2. **OQ2 chiusa prima della prod:** chiunque del tenant Azure entra come ADMIN e può, via `/api/trpc`, declassare e disattivare altri senza riattivazione dalla UI.
3. Ordine di rilascio: migrazione della PR 3 applicata sull'ambiente prima che ci arrivino le PR 3 e 4.
4. Su staging: un utente di prova disattivato con `operator.deactivate` viene buttato fuori al refresh, su Vercel e su Cloud Run, e non rientra con Azure; misurare la lettura in più della sessione.
5. Gate di CI verdi sulla PR, con i `*.pg.test.ts`.
6. Deviazione da AC9 da accettare: un contatto attivo senza cliente si sposta senza riga di log.

### Acceptance criteria check (secondo giro)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1–AC6, AC13 | Met | |
| AC7 | Met | "Assegna a te" dentro la regola dei lock; resta il buco degli scrittori fuori dalla regola (`insertCustomer`), debito previsto da T5.2 |
| AC8 | Met | failpoint tardivi |
| AC9 | Met con una deviazione | contatti senza cliente senza riga di log, da accettare |
| AC10–AC12 | Met | tetto dei retry fissato |
| AC14–AC20 | Met | primo giro; `LastAdmin` corretto e testato |
| AC22 (codici), AC24–AC28 | Met | primo giro |
| AC29 | Met | gate completi su a0b45b4 |
| AC29a | Blocked | revisione di Leonardo, umana |

### Notes for docs-maintenance

- Durable: la deviazione di AC9 (contatti senza cliente) e il buco degli scrittori fuori dalla regola dei lock (`customer.insertCustomer`, `pratiche.PUT`) vanno nel debito della feature.
- La regola dei lock "prima gli utenti, poi i clienti" ora vale anche per "Assegna a te".

## [Round: 2026-10-22 — PR 5, disattivazione UI, primo giro]

### Verdict

**DO NOT SHIP** · impact: critical. Due verificatori su quattro (v3 stato del client, v4 UI) con MAJOR; v1 (contratto d'errore) e v2 (autorizzazione) SHIP.

Obiezione più forte (v3 e v4, trovata in modo indipendente): `handleConfirm` del dialog non ha `try/finally`. Se la chiamata al server action viene rifiutata (rete, timeout della funzione, action non trovata dopo un deploy), `submitting` resta vero: select, "Annulla" e "Conferma" disabilitati, `Esc` e la X ignorati, nessun messaggio. Si esce solo ricaricando la pagina. Riprodotto nel browser con la POST interrotta.

### Coverage

- Rubric passes run: 4/4 (v1, v2 sul modello più forte; v3, v4 su quello bilanciato).
- Gate di CI su 001e861: verdi (2669 test con i `*.pg.test.ts`, build, `api:build`, `api:smoke`).
- v4 sul server `next dev` di `-pr5` con `mito_local` (seed di 10.000 clienti), Chromium headless, da 280 a 1440 px. Non provati: Safari mobile, il singolare "1 cliente" a schermo, la disattivazione dell'ultima riga.
- v1 ha provato le due forme dell'errore dal vivo: `inProcessLink` e `backendLink` contro il backend Hono vero.
- v2 ha chiamato il server action con una sessione OPERATORE, senza cookie e con header falsi: sempre rifiutato, database invariato.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v3, v4 | `DeactivateOperatorDialog.tsx:63-78` | Un rifiuto della chiamata al server action lascia il dialog bloccato per sempre (vedi Verdict) | `try/catch/finally`: `setSubmitting(false)` sempre, `describeActionError("UNKNOWN")` sul rifiuto; test con `mockRejectedValue` che vede l'alert e chiude con `Esc` | no |
| MAJOR | v3 | `OperatorTable.tsx:144-164`, `useOperatorTableStore` | Una modifica di ruolo in sospeso sopravvive alla disattivazione del suo operatore: il prossimo "Salva" manda il suo id, il server rifiuta tutto il batch con `OPERATOR_NOT_FOUND` (AC19) e la modifica non si può più togliere perché la riga non c'è | Togliere quell'id dalle modifiche in sospeso dopo la disattivazione; test del flusso combinato | no |
| MAJOR | v4 | `DeactivateOperatorDialog.tsx:156-160` | Messaggio d'errore `text-destructive` a 3,21:1 su `#ededed` (WCAG 1.4.3 chiede 4,5) | Token di testo più scuro; vedi la decisione sui primitivi condivisi | da decidere |
| MAJOR | v4 | toast `variant: "success"` | Testo a 2,14:1 (`#fafafa` su `rgb(49,196,142)`); variante condivisa con gli altri toast di successo | Token del primitivo | da decidere |
| MAJOR | v4 | bottone "Conferma" (`bg-destructive`) | 3,61:1, 3,30:1 in hover; è il contrasto già registrato in `tech-debt/crm/sezione-contatti.md` ("Contrasto e nomi nei primitivi condivisi") | `#dc2626` o più scuro nella variante `destructive` | sì (già nel debito) |
| MINOR | v3, v1 | `OperatorTable.tsx:146-147` | Anche il cambio di ruolo resta in `loading` se l'action viene rifiutata (difetto di prima, funzione riscritta) | `try/finally` | no |
| MINOR | v3, v2 | `OperatorTable.tsx:104,119-121` | `currentOperatorId` opzionale: senza, "Disattiva" appare anche sulla riga dell'utente corrente (il server rifiuta comunque) | Prop obbligatoria | no |
| MINOR | v3 | `DeactivateOperatorDialog.tsx:64-67` | Destinazione sparita dopo un refetch: "Conferma" abilitato non fa nulla, nessun messaggio | Messaggio e reset della destinazione | no |
| MINOR | v4 | `OperatorTable.tsx:202-206` | Righe con chiave = indice: dopo il successo il nodo della riga tolta viene riusato e il focus va al bottone dell'operatore successivo | `getRowId` sull'id dell'operatore, focus spostato di proposito | no |
| MINOR | v4 | `DeactivateOperatorDialog.tsx:115` | Se le query di lettura falliscono, "Caricamento..." resta per sempre, senza messaggio | Stato d'errore delle query con `role=alert` | no |
| MINOR | v4 | dialog | Il dialog, centrato, salta di ±20 px quando arrivano i conteggi e quando compare l'errore | Altezza riservata per i conteggi e per l'errore | no |
| MINOR | v1 | `_actions/_test/actions.test.ts` | I test costruiscono solo la forma in-process dell'errore, con il messaggio uguale al codice, e non c'è il caso UNKNOWN per `updateOperatorsRole`: un lettore che ignora `data.contactError` (BACKEND_URL) o che restituisce il messaggio passa tutti i test. Il codice oggi è corretto in tutte e due le forme | Fixture con `{ data: { contactError } }`, messaggio diverso dal codice, caso UNKNOWN | no |
| MINOR | v2 | `_actions/_test/actions.test.ts:19-26` | Nessun test lega l'action alla sessione di chi chiama; la prova dal vivo è l'unica | Un `*.db.test.ts` che chiama l'action con una sessione OPERATORE | no |
| MINOR | v4 | `components/ui/dialog.tsx` (condiviso) | Sotto 640 px il dialog tocca i bordi e i bottoni del footer si toccano; la X ha nome "Close" su `lang="it"` ed è ultima nell'ordine del Tab; testo muted a 4,05:1 | Passata sui primitivi `ui/` | sì |
| NIT | v1 | `_actions/*.ts` | `revalidatePath` dentro il `try`: se lanciasse dopo una mutazione riuscita, l'action direbbe UNKNOWN | Fuori dal `try` | no |
| NIT | v2 | `@admin/page.tsx:9`, layout | La lista degli operatori arriva nel payload RSC anche agli OPERATORE (era così anche prima); `getAllUniqueOperators` è `protectedProcedure` | Voce nel debito | sì |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1: contratto d'errore | Dal vivo in tutte e due le forme: `OPERATOR_IS_ADMIN`, `CANNOT_DEACTIVATE_SELF`, `OPERATOR_NOT_FOUND`, `HANDOVER_SAME_OPERATOR`, `LAST_ADMIN` tornano come `{ error: code }`; un id oltre int32 dà `UNKNOWN`; nessun throw; `revalidatePath("/dashboard/profile")` solo sul successo. Mutanti su rethrow, ordine del revalidate, path sbagliato, `INVALID_INPUT` presi |
| v2: autorizzazione | In-process passano gli header della richiesta, con `backendLink` solo il cookie di chi chiama. Server action chiamato con la sessione OPERATORE, senza cookie e con header falsi: `admin-only` / `UNAUTHORIZED` nel log, database identico (AC2). Il payload RSC aggiunge solo l'id dell'operatore di chi chiama |
| v3: stato del client | Nessun toast di successo dopo un errore, `clearOperatorsToEdit` solo sul successo, guardie su admin e utente corrente, mappatura della destinazione, chiusura dopo il successo, conteggi del toast nei campi giusti (AC13), messaggi dei codici: ognuno con un mutante preso |
| v4: UI | AC21 (titolo, conteggi con lo stato di caricamento, destinazioni senza il target, "Conferma" disabilitato senza destinazione), successo di AC22 (dialog chiuso, riga tolta, toast con i conteggi), AC23 (focus sul select, `Esc`, focus al bottone della riga con `:focus-visible`, nomi accessibili), label collegata al select, bottone di riga 84×36 px con anello di focus pieno e contrasto 19,8:1, nessun overflow del dialog da 280 a 1440 px |

### Human Review Checklist

1. Decidere il perimetro delle correzioni (contrasto dei token condivisi in questa PR o nel debito dei primitivi).
2. Dopo le correzioni: secondo giro di v3 e v4.
3. Su staging: una disattivazione vera di un operatore di prova, con i conteggi spostati alla destinazione; `LAST_ADMIN` dall'editor dei ruoli.
4. Se `BACKEND_URL` è attivo sull'ambiente, un errore di dominio dal dialog arriva con il suo messaggio italiano.
5. Le condizioni della PR 4 valgono anche qui: revisione di Leonardo, OQ2 chiusa prima della prod.

### Acceptance criteria check (primo giro)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC20a | Met | toast "Deve restare almeno un admin" provato nel browser; `loading` resta bloccato solo su un rifiuto della chiamata |
| AC21 | Met | |
| AC22 | Unmet | dialog bloccato su un rifiuto della chiamata; messaggio d'errore sotto la soglia di contrasto |
| AC23 | Met | il focus dopo il successo va alla riga successiva: AC23 lo chiede solo per `Esc` |

## [Round: 2026-10-23 — PR 5, secondo giro]

### Verdict

**DO NOT SHIP** · impact: critical. Tre verificatori su cinque SHIP (v3 stato del client, v4 UI del dialog, v7 test dei server action); v5 (Dialog condivisa) e v6 (token) con un MAJOR ciascuno, tutti e due nei primitivi condivisi. I cinque MAJOR del primo giro sono chiusi.

Obiezione più forte (v5): il footer della Dialog passa da `sm:space-x-2` a `gap-2`, ma `AlertCloseConfirmDialog` (la conferma di AC36) e `CustomerHandoverDialog` passavano `gap-2 sm:gap-0` per annullare la spaziatura vecchia. Ora quella classe toglie ogni spazio: da 640 px in su i due bottoni si toccano e l'anello di focus di "Annulla" entra nel bottone accanto. Misurato dal vivo.

### Coverage

- Rubric passes run: 5/5 (v3, v4, v5 sul modello più forte; v6, v7 su quello bilanciato).
- Gate di CI su dcea416: verdi (2692 test con i `*.pg.test.ts`, lint, tsc, build, `api:build`, `api:smoke`).
- v4, v5, v6 sul server `next dev` di dcea416 con `mito_local`, Chromium headless, da 280 a 1440 px. axe non installato: contrasto dal probe e dai pixel degli screenshot. Non provati: Safari, gli stati di caricamento di `WorkerImportDialog` e `CustomerBulkDialog` (richiedono un import o un aggiornamento vero), `BulkActionDialog` e `CommandDialog` (non montati: solo codice).
- v3 e v7 con i mutanti su copie del checkout; le copie sono tornate pulite.
- Effetti sul database locale: v4 ha disattivato Oddone Capecchi (1007) verso Pietro Cardini; v6 ha salvato per errore un'email non valida sul cliente C009961 e l'ha ripristinata.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v5 | `components/ui/dialog.tsx:97`, `AlertCloseConfirmDialog.tsx:88`, `CustomerHandoverDialog.tsx:204` | Bottoni del footer attaccati da 640 px in su (vedi Verdict) | Togliere `gap-2 sm:gap-0` dai due consumer | no |
| MAJOR | v6 | `components/ui/toast.tsx` (`ToastClose`) | La X del toast di successo è `text-foreground/50`: sul verde nuovo fa 2,10:1 in hover e col focus (prima 3,04:1), 3,56:1 col puntatore sopra (prima 8,86:1). WCAG 1.4.11 chiede 3:1. La causa è il token nuovo | Override `group-[.success]:` come quelli di `destructive`, poi misura dal vivo | no |
| MINOR | v4 | `DeactivateOperatorDialog.tsx:142` | L'altezza riservata (60 px) è sotto quella dello stato d'errore delle query (64 px, di più quando il testo va a capo): il dialog si sposta di 2 px, 12 px sotto i 340 px | Riservare l'altezza vera, o messaggio e "Riprova" su una riga | no |
| MINOR | v4 | `DeactivateOperatorDialog.tsx:201` | Lo spazio dell'errore tiene una riga: due messaggi vanno a capo sotto i 400 e i 450 px e il dialog cresce di 20 px | `min-h-10` sotto `sm`, `sm:min-h-5` | no |
| MINOR | v4, v5 | `dialog.tsx:66,83` | La X da 24 px copre il titolo con nomi del seed da 280 a 336 px, e il bottone "indietro" di `CustomerBulkDialog` sotto i 298 px (un clic lì chiude il dialog) | `pr-8` su `DialogHeader`, o spazio a destra nell'header di `CustomerBulkDialog` | no |
| MINOR | v4 | `OperatorTable.tsx:190` | Dopo una disattivazione il focus va al titolo, ma `focus:outline-none` lo rende invisibile (WCAG 2.4.7) | Togliere `focus:outline-none` o un anello `focus-visible` | no |
| MINOR | v5 | `dialog.tsx:55-60` | Il focus iniziale prova un solo candidato: con il primo controllo nascosto il focus resta fuori dal modale; con la sola X va al contenitore invece che alla X (stato di caricamento di `WorkerImportDialog` e `CustomerBulkDialog`); il testo di un input non viene selezionato | Provare i candidati finché il focus si sposta, poi la X, poi il contenitore, con `select()` sugli input | no |
| MINOR | v5 | `ExportDialog.tsx:468` | `w-full` annulla il margine di 16 px sotto i 640 px; ora con gli angoli arrotondati contro il bordo | Togliere `w-full` | no |
| MINOR | v3 | `OperatorTable.tsx:128-131` | Una modifica di ruolo in sospeso resta orfana se la riga sparisce per altre vie (un altro admin disattiva l'operatore, o la chiamata viene rifiutata dopo il commit): "Salva" manda l'id e AC19 rifiuta tutto il batch | Filtrare le modifiche sugli id di `data` prima del salvataggio; test con la riga tolta | no |
| MINOR | v3 | test della tabella e del dialog | Quattro mutanti sopravvivono: `removeOperatorToEdit` che svuota tutto, `onDeactivated` prima del controllo dell'errore, `setLoading(false)` solo nel `catch`, reset di `deactivatedRef` tolto | Le sonde di v3 come test (una modifica su un altro operatore sopravvive; `onDeactivated` non chiamato sugli errori; "Salva" riattivo dopo LAST_ADMIN; focus al bottone dopo un successo senza smontaggio) | no |
| MINOR | v7 | `_actions/_test/actions.test.ts` | Manca la forma HTTP di un errore senza codice di dominio (`contactError: null`): sopravvive un mutante che restituisce `FORBIDDEN` invece di UNKNOWN; il cambio ruolo non ha un caso ADMIN riuscito nel test con la sessione (lo coprono i test del router) | Fixture `contactError: null`; caso ADMIN che cambia un ruolo | no |
| NIT | v3 | `DeactivateOperatorDialog.tsx:182` | Dopo un errore, scegliere un'altra destinazione lascia il messaggio vecchio | `setError(null)` nel cambio di destinazione | no |
| NIT | v4 | dialog | Un errore di conferma e un refetch fallito possono mostrare due `role=alert` insieme | Uno solo | no |
| NIT | v5 | `ExportDialog`, `WorkerImportDialog`, `CustomerBulkDialog` | In alcuni stati ci sono due bottoni "Chiudi" (la X e quello del dialog) | Nessuna, o un nome diverso per uno dei due | no |
| NIT | v7 | `actions.db.test.ts` | Nessun test prova che `resetDb` isola i casi (vale per costruzione) | Nessuna | no |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v3: stato del client | I cinque punti del primo giro chiusi: `finally` resetta sempre `submitting`; la modifica in sospeso esce dallo store anche se la riga si smonta prima della risposta; con `getRowId` il valore del select segue l'id; `loading` mai bloccato; `currentOperatorId` obbligatorio; destinazione sparita gestita. Mutanti uccisi: M3–M7, M10 |
| v4: UI del dialog | AC20a, AC21–AC23 dal vivo. Contrasti: errore 5,53:1, "Conferma" 6,2:1 (hover 5,48, focus 6,2), toast di successo 5,33:1, descrizione 4,9:1, X 7,11:1. Stato d'errore delle query con `role=alert` e "Riprova" che recupera. Dopo una disattivazione vera la riga sparisce e il focus va al titolo, non all'operatore successivo. X "Chiudi" prima nel Tab, 24×24, anello di focus intero; 16 px di margine e footer con 8 px sotto i 640 px |
| v5: Dialog condivisa | Focus iniziale uguale a 001e861 in ogni stato aperto dal vivo (Export, Import, Bulk, Handover, AlertConfirm); i `preventDefault` dei consumer rispettati (mutante ucciso); Tab e Shift+Tab restano nel modale; nessun test cerca più "Close"; classi di animazione identiche; 796 test dei consumer verdi |
| v6: token | Ogni coppia migliora: `text-destructive` 6,46:1 su bianco e 5,53:1 sullo sfondo, `destructive-foreground` 6,19:1, toast di successo 5,34:1, `muted-foreground` da 4,91 a 5,74:1; nessun elemento muted sotto 4,5 nelle schermate principali; `.dark` non raggiungibile e non divergente |
| v7: test dei server action | Nessuna riga di produzione dei server action cambiata. Mutanti uccisi: lettore che ignora `data.contactError`, messaggio al posto del codice, UNKNOWN sbagliato, procedure non admin, sessione nulla, ADMIN senza effetti sul database. I due file girano nel gate di CI (`*.db.test.ts` in node) |

### Human Review Checklist

1. Decidere: correggere i due MAJOR e i MINOR in questa PR, poi un terzo giro di v4, v5 e v6.
2. Approvare a occhio il rosso, il verde e il grigio nuovi nelle schermate principali (bottoni `destructive`, toast, testo muted): il contrasto si misura, la resa la decide una persona.
3. Aprire ogni dialog dell'app e controllare focus iniziale e X "Chiudi".
4. Su staging: una disattivazione vera di un operatore di prova; `LAST_ADMIN` dall'editor dei ruoli; con `BACKEND_URL` attivo, un errore di dominio dal dialog.
5. Le condizioni della PR 4 valgono anche qui: revisione di Leonardo, OQ2 chiusa prima della prod.

### Acceptance criteria check (secondo giro)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC20a | Met | un rifiuto della chiamata mostra il toast generico e "Salva" torna attivo |
| AC21 | Met | |
| AC22 | Met | un rifiuto della chiamata lascia il dialog aperto e usabile; messaggio d'errore a 5,53:1 |
| AC23 | Met | dopo una disattivazione il focus va al titolo (invisibile: MINOR) |

### Notes for docs-maintenance

- Il debito "Contrasto e nomi nei primitivi condivisi" di [[tech-debt/crm/sezione-contatti]] è aggiornato: token e X della Dialog risolti; resta il nome del bottone di chiusura del toast.
- La lista degli operatori nel payload RSC degli OPERATORE è in [[tech-debt/crm/gestione-operatori]].

## [Round: 2026-10-23 — PR 5, terzo giro]

### Verdict

**DO NOT SHIP** · impact: critical. Tre verificatori su quattro SHIP (v3 stato del client, v4 UI del dialog, v6 toast); v5 (Dialog condivisa) con un MAJOR introdotto da questo giro. I due MAJOR del secondo giro sono chiusi.

Obiezione più forte (v5): il focus iniziale nuovo prova i candidati e si ferma solo quando il focus è sull'elemento provato. In `ExportDialog` il primo candidato è la lista dei tab di Radix, che passa il focus al tab attivo: il ciclo la considera fallita e va avanti, e il focus finisce sul bottone delle date, il terzo controllo. Radix e dcea416 lo mettevano sul tab "Standard". Misurato dal vivo.

### Coverage

- Rubric passes run: 4/4 (v3, v4, v5 sul modello più forte; v6 su quello bilanciato).
- Gate di CI su 6eb42e0: verdi (2702 test con i `*.pg.test.ts`, lint, tsc, build, `api:build`, `api:smoke`).
- v4, v5, v6 sul server `next dev` di 6eb42e0 con `mito_local`, Chromium headless, da 280 a 1440 px; v4 anche con il testo a 1,25. axe non installato. Non provati: Safari; gli stati di caricamento e di successo di `CustomerBulkDialog` e quelli di caricamento ed errore di `WorkerImportDialog` ed `ExportDialog` (richiedono una scrittura o un import: solo codice e repliche nel DOM); `BulkActionDialog` e `CommandDialog` non sono montati. v6 ha misurato il toast su nodi iniettati con le classi esatte di `toast.tsx`, non su un toast Radix vero.
- v3 con 15 mutanti su `wt-mut-v3` a 6eb42e0; la copia è tornata pulita.
- Effetti sul database locale: v4 ha disattivato Leonilda Licciardello (1026) verso Severiano Coniglio (1014), 136 clienti e 109 contatti; ha chiuso e riaperto la sidebar dell'admin (preferenza tornata com'era).

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v5 | `components/ui/dialog.tsx:70` | Focus iniziale di `ExportDialog` sul bottone delle date invece che sul tab attivo (vedi Verdict) | Ricordare l'elemento con il focus prima del ciclo e fermarsi appena il focus si sposta, come `focusFirst` di Radix; `select()` solo sull'input che ha preso il focus; saltare i link come Radix. Test con un `Tabs.List` come primo figlio | no |
| MINOR | v4 | `DeactivateOperatorDialog.tsx:144` | Con il testo a 1,25 e da 280 a 317 px la riga d'errore delle query (testo e "Riprova" affiancati) è più larga del dialog: select e bottoni escono di 38 px, il titolo va sotto la X | `min-w-0` e `[overflow-wrap:anywhere]` sul messaggio, poi rimisurare l'altezza riservata a 1,25 | no |
| MINOR | v4, v5 | `dialog.tsx:98` | `pr-6` su `DialogHeader`: sotto i 640 px titoli e descrizioni centrati stanno 12 px a sinistra dell'asse del dialog, in ogni consumer; nell'header di successo di `CustomerBulkDialog` icona e titolo 12 px a sinistra del bottone sotto | Padding simmetrico mentre è centrato: `px-6 sm:pl-0 sm:pr-6` | no |
| MINOR | v3 | `OperatorTable.tsx:151`, `_store/useOperatorTableStore.ts` | La modifica di una riga sparita è nascosta ma resta nello store: se la riga torna (riattivazione a mano) "Salva" la manda senza mostrarla | Togliere dallo store le modifiche degli id assenti da `data`; test con la riga che sparisce e torna | no |
| MINOR (preesistente) | v3 | `_store/useOperatorTableStore.ts`, `profile/layout.tsx` | Cambiare tab smonta la tabella; tornando, lo store ha ancora le modifiche, i select mostrano i ruoli originali e "Salva" le manda | Svuotare lo store al montaggio o allo smontaggio della tabella | no |
| MINOR (preesistente) | v3 | `OperatorTable.tsx:71-80` | Un ruolo scelto mentre il salvataggio è in corso viene cancellato da `clearOperatorsToEdit()` senza essere mandato; il select mostra il ruolo nuovo | Select spenti durante `loading`, o togliere solo gli id mandati | no |
| MINOR (preesistente) | v5 | `ExportDialog.tsx:489` | Le card dei tab forzano il contenuto a 451 px: sotto i 500 px escono dal dialog e il titolo va sotto la X (prima da 280 a 334 px, ora fino a 359) | Card che vanno a capo (`flex-col sm:flex-row`, `min-w-0`), o debito | sì |
| MINOR (latente) | v6 | `toast.tsx:68` (`ToastAction`) | Nella variante `success` l'azione in hover ha testo bianco su `bg-secondary`, 1,07:1; nessun toast di successo ha un'azione oggi | Override `group-[.success]:` quando serve | sì |
| MINOR (preesistente) | v6 | `ToastClose`, `ToastAction` in `default` e `info` | L'anello di focus è il blu di Tailwind al 50%, 1,74:1 | Fuori da questa PR | sì |
| NIT | v4 | dialog | Due `role=alert` insieme (errore di conferma e refetch fallito) | Uno solo | no |
| NIT | v4 | `DeactivateOperatorDialog.tsx:204` | Con il testo a 1,25 il messaggio della destinazione sparita va su tre righe sotto i 340 px | Facoltativo | no |
| NIT | v5 | `CustomerBulkDialog.tsx:227` | Il bottone "Cambia tipo di assegnazione" non tocca più la X, ma va a capo sotto i 309 px | Nessuna | no |
| NIT | v6 | `ToastClose` | La X è invisibile finché il toast non ha il puntatore o il focus: chi usa il touch non la vede | Nessuna | no |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v3: stato del client | Modifiche delle righe sparite né mandate né contate per "Salva" (test e mutanti F1–F7 uccisi); salvataggio parziale riuscito che svuota tutto. Uccisi anche i mutanti sopravvissuti al secondo giro (M1, M2, M8, M9), il FORBIDDEN al posto di UNKNOWN su tutti e due i server action, il ruolo ADMIN sempre rifiutato nel test con la sessione, e il messaggio d'errore che resta dopo un cambio di destinazione. 55 test di `@admin` e 79 del router e dei servizi verdi |
| v4: UI del dialog | Altezza e posizione del dialog identiche fra caricamento, conteggi ed errore delle query in 22 larghezze da 280 a 1440 px; due righe d'errore sotto `sm` senza crescita; titolo lontano dalla X (12,8 px minimo, anche con nomi lunghi iniettati); disattivazione vera da tastiera con il focus sul titolo, anello `focus-visible` a 19,8:1; i passaggi del secondo giro confermati (contrasti, X 24×24 prima nel Tab, margini e footer) |
| v5: Dialog condivisa | Footer di `AlertCloseConfirmDialog`, `CustomerHandoverDialog` e `DeactivateOperatorDialog` con 8 px affiancati da 640 px e in colonna sotto; `ExportDialog` con 16 px di margine sotto i 640 px; gli `onOpenAutoFocus` dei consumer vincono sempre; Import e Bulk con il focus iniziale di 001e861; nessun input di testo come primo controllo, quindi `select()` non cambia nulla oggi; Tab, Shift+Tab ed Esc restano nel modale; 1054 test dei consumer verdi |
| v6: toast | X del toast di successo a 4,01:1 col puntatore sul toast, 5,33:1 col puntatore sulla X e col focus; anello di focus del toast `destructive` da 1,74:1 a 6,20:1; `default` e `info` identici a dcea416 in 8 stati; le classi nuove valgono solo sotto `.group.success` e `.group.destructive` |

### Human Review Checklist

1. Decidere: correggere il MAJOR di v5 e i MINOR nuovi di questo giro (riga d'errore a 1,25, padding dell'header, modifica nascosta nello store) in questa PR, poi un quarto giro di v5 e v4.
2. Decidere i MINOR preesistenti di v3 (cambio di tab, ruolo scelto durante il salvataggio): qui o nel debito della feature.
3. I punti 2–5 del checklist del secondo giro restano validi (colori nuovi a occhio, ogni dialog dell'app, staging, Leonardo e OQ2).

### Acceptance criteria check (terzo giro)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC20a | Met | "Salva" torna attivo dopo un errore; le modifiche delle righe sparite non partono |
| AC21 | Met | |
| AC22 | Met | |
| AC23 | Met | focus sul titolo dopo la disattivazione, ora visibile da tastiera |

### Notes for docs-maintenance

- I MINOR marcati "Durable? sì" (card di `ExportDialog`, `ToastAction` nella variante `success`, anello di focus del toast `default` e `info`) vanno nella voce "Contrasto e nomi nei primitivi condivisi" di [[tech-debt/crm/sezione-contatti]] se non si correggono qui.

## [Round: 2026-10-23 — PR 5, quarto giro]

### Verdict

**DO NOT SHIP** · impact: critical. Due verificatori su tre SHIP (v5 Dialog condivisa, v3 stato del client); v4 (UI del dialog) con un MAJOR introdotto da questo giro. Il MAJOR del terzo giro (focus iniziale di `ExportDialog`) è chiuso.

Obiezione più forte (v4): il padding simmetrico di `DialogHeader` sotto i 640 px (`px-5`) aggiunge 20 px, 25 px con il testo a 1,25, alla larghezza minima dell'header. `DialogContent` è una griglia con una sola colonna: un titolo con una parola lunga la allarga oltre il dialog, e tutti i controlli escono dal riquadro. A 280 px con il testo a 1,25: "Disattiva Pierfrancesco Russo" esce di 7 px, "Disattiva Massimiliano Mastrogiovanni" di 22 px. Con il padding del terzo giro gli stessi nomi ci stavano o quasi (fino a 1,6 px). I 21 nomi del seed ci stanno tutti. Misurato dal vivo con nomi iniettati nel DOM.

### Coverage

- Rubric passes run: 3/3 (v5, v4 sul modello più forte; v3 su quello bilanciato).
- Gate di CI su a5c808a: verdi (2706 test con i `*.pg.test.ts`, lint, tsc, build, `api:build`, `api:smoke`).
- v4 e v5 sul server `next dev` di a5c808a con `mito_local`, Chromium headless, da 280 a 1440 px, con il testo a 1 e a 1,25. v5 ha confrontato la regola del focus con `focus-scope@1.3.1` nel codice e con un harness che applica la regola di Radix allo stesso DOM. Non provati: Safari; gli stati di caricamento, successo ed errore di Export e Import e il caricamento di Bulk (richiedono una scrittura); `BulkActionDialog` e `CommandDialog` non sono montati.
- v3 con 8 mutanti su `wt-mut-v3` a a5c808a; la copia è tornata pulita.
- Effetti sul database locale: v4 ha disattivato Zetico Salvatore (1022) verso Iride Oliviero (1023), 136 clienti e 109 contatti. v5 non ha scritto nulla.

### Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR | v4 | `components/ui/dialog.tsx:106` | Con il testo a 1,25 e un nome lungo, il padding simmetrico dell'header allarga la colonna della griglia oltre il dialog (vedi Verdict) | Colonna che non cresce oltre il dialog (`grid-cols-[minmax(0,1fr)]` su `DialogContent`) e titolo che può andare a capo dentro una parola (`hyphens-auto` o `[overflow-wrap:anywhere]` su `DialogTitle`); provato dal vivo: nessuna sporgenza, titolo centrato | no |
| MINOR | v5 | `dialog.tsx:106`, `CustomerBulkDialog.tsx:228` | Sotto i 640 px il bottone "Cambia tipo di assegnazione" rientra di 20 px rispetto al form e va a capo prima (a 320 px su due righe); a 280 px con il testo a 1,25 l'header è 4 px più largo del dialog | Bottone fuori dall'header con padding, o `-ml-5 sm:ml-0`; rimisurare a 280 px | no |
| MINOR | v4 | `DeactivateOperatorDialog.tsx:147` | Con il testo a 1,25 sotto i 320 px `[overflow-wrap:anywhere]` spezza le parole a metà ("Impossib / ile") | Con la colonna che non cresce, la riga può andare a capo senza spezzare le lettere (`hyphens-auto`, o la riga in colonna sotto `sm`) | no |
| MINOR (preesistente) | v5 | `CustomerBulkDialog.tsx:590` | Da 640 px `sm:text-left` della base vince su `text-center` del consumer: una descrizione su due righe è allineata a sinistra sotto icona e titolo centrati | `sm:text-center` su quell'header | no |
| MINOR | v3 | `OperatorTable.tsx:164` | Il filtro nel memo è ridondante con l'effetto che pota lo store: React esegue l'effetto prima del prossimo evento, quindi nessun test lo vede (mutante sopravvissuto) | Tenerlo come difesa o toglierlo | no |
| NIT | v5 | `_test/dialog.test.tsx` | Nessun test copre il filtro `!el.hidden` | Test con `<button hidden>` prima dell'input | no |
| NIT | v3 | `useOperatorTableStore.ts:46` | `pruneOperatorsToEdit` crea sempre un array nuovo; con un genitore client che crea `data` a ogni render darebbe un loop. Il genitore vero è un server component | Restituire lo stato invariato quando non pota nulla | no |
| NIT (preesistente) | v4 | `DeactivateOperatorDialog.tsx:227` | Durante la richiesta "Conferma" è spento e il focus cade sul body finché il dialog non si chiude | Facoltativo: `aria-disabled` | no |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v5: Dialog condivisa | Regola del focus uguale a `focusFirst` di Radix nel codice e in ogni caso provato dal vivo; `ExportDialog` sul tab attivo ("Standard", o "Chiamate" se scelto prima); Import sul campo del file, Bulk sulla prima card, sul bottone indietro e su "Chiudi" nel successo; gli `onOpenAutoFocus` dei consumer vincono; footer a 8 px, margine di 16 px, X 24×24 con anello intero, Tab ed Esc nel modale; titoli sull'asse sotto i 640 px; 1058 test dei consumer verdi |
| v4: UI del dialog | Riga d'errore senza sporgenze a 16 px da 280 a 1440 px e a 1,25 con i nomi del seed; altezza identica fra errore, caricamento e caricato a 16 px; spazio dell'errore di conferma su due righe senza crescita; focus iniziale sul select, Esc al bottone della riga 6 volte su 6; disattivazione da tastiera con il focus sul titolo e l'anello visibile; contrasti invariati |
| v3: stato del client | La modifica di una riga sparita esce dallo store e non torna con la riga; una modifica fatta fra il render e l'effetto sopravvive (il filtro legge lo stato più recente); nessun loop di render; 7 mutanti su 8 uccisi; 56 test di `@admin` verdi |

### Human Review Checklist

1. Decidere: correggere il MAJOR di v4 e i MINOR di questo giro nella PR 5, poi un quinto giro di v4 e v5.
2. I punti 2–5 del checklist del secondo giro restano validi.

### Acceptance criteria check (quarto giro)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC20a | Met | |
| AC21 | Met | con il testo a 1,25 e nomi lunghi i controlli escono dal dialog a 280 px (MAJOR) |
| AC22 | Met | |
| AC23 | Met | |

### Correzioni dopo il quarto giro

Omar: "Correggi minor e major e poi basta". Correzioni in cb51313 su `-pr5`, senza un quinto giro di review: le misure qui sotto sono dell'orchestratore, non di un verificatore.

- MAJOR: `DialogContent` ha la colonna `minmax(0,1fr)`, che non cresce oltre il dialog; `DialogTitle` va a capo dentro una parola solo quando la parola non sta sulla riga (`break-words`). A 280 px con il testo a 1,25, "Disattiva Massimiliano Mastrogiovanni" e "Disattiva Pierfrancesco Russo" restano nel dialog (nessun elemento fuori dal riquadro, colonna di 178 px); il secondo va a capo come "Pierfrancesc / o Russo". `hyphens-auto` scartato: sillaberebbe anche i titoli che oggi vanno a capo fra le parole.
- MINOR del bottone "Cambia tipo di assegnazione": `-ml-5 sm:ml-0`, allineato al form a 280 px (testo a 1,25), 375 e 800 px.
- MINOR della riga d'errore: la riga va a capo (`flex-wrap`) invece di spezzare le parole. A 280 px con il testo a 1,25 e a 320 px "Riprova" scende sotto il messaggio, senza parole spezzate; a 1280 px resta sulla stessa riga.
- MINOR preesistente dell'header di successo di `CustomerBulkDialog`: `sm:text-center`. Non provato dal vivo (serve un'assegnazione vera).
- MINOR del filtro ridondante: tolto, le modifiche le pota solo l'effetto; i test di `OperatorTable` restano verdi.
- I NIT restano aperti.
- Gate su cb51313: 2706 test con i `*.pg.test.ts`, lint, tsc, build, `api:build`, `api:smoke`.

### Notes for docs-maintenance

- I MINOR preesistenti del terzo giro sono nel debito: [[tech-debt/crm/gestione-operatori]] ("Modifiche di ruolo in sospeso fuori dalla vista") e [[tech-debt/crm/sezione-contatti]] ("Contrasto e nomi nei primitivi condivisi": anello del toast, `ToastAction` di successo, card di `ExportDialog`). v5 misura le card di `ExportDialog` fino a 368 px, non 359.

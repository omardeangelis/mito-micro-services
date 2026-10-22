---
domain: crm
type: review
scope: spec
spec: gestione-operatori
review_target: "spec implementation, per PR (un round per PR)"
base_ref: claude/great-carson-o6qn17-pr4 (97b8ae6)
head_ref: claude/great-carson-o6qn17-pr5 (001e861)
verdict: do-not-ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/gestione-operatori/RUBRIC]]"
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/gestione-operatori/PLAN]]"
  - "[[specs/crm/gestione-operatori/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-10-22
updated: 2026-10-22
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

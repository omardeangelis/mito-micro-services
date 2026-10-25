---
domain: crm
type: review
scope: spec
spec: pratiche-effect
review_target: "spec implementation, branch claude/pratiche-effect (PR #83); giro 2: correzioni di TD9; giro 3: rilancio di v1, v3, v4, v5 sulle correzioni"
base_ref: 5b61b3f (giro 2: def7bd0; giro 3: 4ca830c)
head_ref: bef07ae
verdict: ship
review_impact: critical
human_in_loop: true
links:
  - "[[specs/crm/pratiche-effect/RUBRIC]]"
  - "[[specs/crm/pratiche-effect/SPEC]]"
  - "[[specs/crm/pratiche-effect/PLAN]]"
  - "[[specs/crm/pratiche-effect/IMPLEMENTATION-NOTES]]"
ingested: false
last_ingested: null
created: 2026-10-25
updated: 2026-10-25
---

# Review Report: Router `pratiche` e letture di `task` su Effect (passo 4)

## Verdict

**Giro 3 (rilancio di v1, v3, v4, v5 sulle correzioni, `4ca830c..bef07ae`): SHIP** · impact: critical. I quattro passi danno SHIP, senza BLOCKER né MAJOR. B1 non è corretto nel codice: è debito accettato da Omar (2026-10-25), TD9 (k) riaperta, e i documenti ora lo dicono. Dettagli nel [Round: 2026-10-25] Rilancio sulle correzioni, in fondo.

**Giro 2 (correzioni di TD9, `def7bd0..4ca830c`): DO NOT SHIP** · impact: critical. Dettagli nel [Round: 2026-10-25] Correzioni di TD9. Dopo il giro: M1–M4 corretti in `8d3d33c`, B1 lasciato come debito per decisione di Omar (TD9 (k) riaperta).

**Giro 1 (passo 4, `5b61b3f..fe18f5b`): SHIP** · impact: critical

Al primo giro, 6 passi su 7 hanno dato SHIP e v7 DO NOT SHIP per un MAJOR su AC14: `filtri-sql-sicuri.md` citava il file nuovo senza i numeri di riga e nominava ancora `getAllPratichePage`. Corretto in `fe18f5b`. v7, rilanciato da solo su `fe18f5b`, dà SHIP. Restano solo MINOR e NIT, nessuno sul codice di produzione. La checklist umana qui sotto è obbligatoria (impatto critico).

## Coverage

- Rubric passes run: 7/7, più il rilancio di v7. Modelli: v1, v2, v3 Opus; v4, v5, v6 Sonnet; v7 Haiku (due volte).
- Passes skipped or failed: nessuno.
- UI pass: non previsto. L'unico file sotto `src/components` è un test con righe tolte.

## Findings

| Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----------|--------------------|----------|---------|-------------------------|----------|
| MAJOR (corretto) | v7 — controlli statici e documenti | `brain/tech-debt/crm/filtri-sql-sicuri.md:27,31,46,47` | AC14: le citazioni del file nuovo erano senza numeri di riga; `:31` nominava `getAllPratichePage` | Corretto in `fe18f5b` (`list.ts:114-165`, `:167`, `:49`; `listPractices (ex getAllPratichePage)`); v7 rilanciato: SHIP | no |
| MINOR (corretto) | v7 | `brain/chore/migrazione-effect.md:144` (TD9 (d), (k)) | Mancavano `insertPratica` con `id` → `INTERNAL_SERVER_ERROR` e `bulkAssignPractices` con `[]` → `undefined` | Aggiunti in `fe18f5b` | no |
| MINOR (corretto) | v7 | `brain/chore/migrazione-effect.md:141` (TD6) | "32 file" senza perimetro | "32 file di `packages/`", `fe18f5b` | no |
| MINOR (corretto) | v7 (due giri) | `brain/tech-debt/crm/sezione-contatti.md:205,243,265,267,444` | Riferimenti a `getTasksToExport`, a `task/POST/index.ts` con righe che non esistono più e a `pratiche.updateLastEdit` come ancora presente | Aggiornati a `services/contact/bulkHandleTask.ts` e al passo 4 (`fe18f5b` e il commit di chiusura) | no |
| MINOR (corretto) | v6 — validità dei test | `pratiche/_test/writes.db.test.ts` (`connectPraticaAndCustomer`) | Non rileggeva `practices` e `customers` dopo la chiamata: un mutante che scrive anche una pratica sopravviveva | Test aggiunto in `44f8881`, verde anche su `7c5c77d`; il mutante ora muore | no |
| MINOR | v6 | `task/_test/bulkHandleTask.order.db.test.ts:76-99` | Sul cliente A confronti parziali (`objectContaining`); su C righe intere | Le righe intere dei casi di A le fissa già `bulkHandleTask.db.test.ts`; il file serve all'ordine e allo stop | sì |
| NIT (corretto) | v5 — letture | `services/contact/queries.ts` (`listCustomersWithActiveAlerts`) | Nessun test con un solo cliente: il mutante `length <= 1` sopravviveva | Test aggiunto in `44f8881`, verde anche su `7c5c77d`; il mutante ora muore | no |
| NIT | v5 | `services/contact/queries.ts` (`getActiveTask`), ritorno anticipato di `listCustomersWithActiveAlerts` | `limit 1`, ordine e ritorno anticipato sono mutanti equivalenti | Dichiarati come equivalenti nel PLAN (D19) | no |
| NIT | v1 — permessi | `pratiche/_test/procedures.db.test.ts`, `task/_test/procedures.db.test.ts` | Nessuna riga "senza sessione": le tabelle non distinguono `protectedProcedure` da `publicProcedure`. AC9 non lo chiede | Una riga con un chiamante senza sessione che vuole `UNAUTHORIZED` per tutte le 20 | sì |
| NIT | v1, v6 | `pratiche/_test/procedures.db.test.ts:15-25`, `task/_test/procedures.db.test.ts:16-19` | La lista `REMOVED` non filtra più niente dopo AC7 | Innocua: i `router.db.test.ts` controllano l'assenza; si può togliere in una pulizia | sì |
| NIT | v2 — `bulkHandleTask` | `services/contact/bulkHandleTask.ts:41-42` | Nessun mutante sull'ordine dei lock nel giro di v2 | Fatto dopo la review: lo scambio `lockCustomer`/`findWorkingOperator` muore su `operatorLock.pg` e `deactivate.pg` (11 test); su PGlite sopravvive, come atteso | no |
| NIT | v3 — scritture | `effect/trpc.ts:30-51` | Un errore del driver ha ora un `DbError` come `cause` e una riga di log `tRPC procedure failed` | Atteso e documentato (PLAN §3); nessun chiamante legge la `cause`; il log non contiene SQL | no |
| NIT | v6 | `pratiche/_test/writes.pg.test.ts:140-143,157-159` | `updatedAt` confrontato con `new Date()` dell'host: può oscillare se l'orologio di Docker deriva | In CI il Postgres è un servizio del runner | sì |
| NIT | v4 — SQL del client | `services/practice/list.ts:65` | `onlyMe` da un `OPERATORE` risponde 500 (`total` senza join su `customers`) | Comportamento di base, conservato; è già in TD7 | no |
| NIT | v7 | `.agents/agent-memory/adversarial-verifier/*` | Memorie del verificatore nei commit del branch | Convenzione del repo (`.agents/agent-memory/`), come nel passo 2 | no |

## What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — permessi | Le 20 procedure hanno lo stesso middleware di `5b61b3f`; `api/trpc.ts` non cambia. 12 mutanti di scambio dei middleware uccisi dalle tabelle di AC9. `actorOperatorId` viene solo da `ctx.operator.id` (un mutante da `input.operatorId` muore su 5 test). Nessun chiamante delle 5 procedure tolte in `src/`, `apps/`, `packages/` |
| v2 — `bulkHandleTask` | Corpo di `assignCustomer` identico byte per byte a `5b61b3f`; stesso `forEach` con `concurrency: 1`, `discard: true`; collaboratori invariati; i file di test esistenti non toccati e verdi (132 su PGlite, 20 su Postgres) |
| v3 — scritture | Differenziale base contro branch su 26 casi, PGlite e Postgres, in-process e via HTTP: stesse risposte, codici, messaggi e righe. `typedump` uguale tolte le 5 chiavi di AC7. 13 mutanti su 14 uccisi, l'altro equivalente |
| v4 — SQL del client | `listPractices` identico al programma di base; ogni valore del client arriva come parametro o passa da una mappa chiusa; nessun `sql.raw`; zod invariato e `PracticeListQuery` non lo allarga; 78 + 16 test verdi |
| v5 — letture | SQL identico al testo di base per le 5 letture; stranezze di AC9 conservate; tipi uguali; 21 mutanti su 24 uccisi, gli altri equivalenti o il caso con un solo id (poi coperto) |
| v6 — validità dei test | Verdi su `7c5c77d` (codice di base + test); righe intere con colonne non nulle, riga di controllo, orologio finto; il file `*.pg.test.ts` gira in CI e non si può saltare; 14 mutanti su 15 uccisi; nessuna asserzione esistente cambiata oltre a quelle di AC7 |
| v7 — controlli statici e documenti | `grep` di AC1, AC3–AC7 e AC13 come la SPEC; `api:build` con i 12 simboli dei servizi nel bundle e `api:smoke` verdi su un clone di `d505078`; TD9 con tutte le stranezze di AC9 e AC10 e il flusso "Nuova pratica"; §1, §4, §5, TD6 e le due pagine del debito aggiornati |

## Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Parità dei permessi | SHIP | Middleware invariati, provati da 12 mutanti; nessun chiamante delle procedure tolte |
| v2 | Spostamento di `bulkHandleTask` | SHIP | Programma identico, lock nello stesso ordine, test esistenti invariati e verdi |
| v3 | Parità delle scritture | SHIP | Differenziale di 26 casi uguale su due driver; tipi uguali |
| v4 | SQL del client in `getAllPratiche` | SHIP | Programma identico, ogni valore legato come parametro |
| v5 | Parità delle letture | SHIP | SQL identico, stranezze conservate |
| v6 | Validità dei test | SHIP | Verdi sulla base, righe intere, nessuna asserzione cambiata |
| v7 | Controlli statici e perimetro | DO NOT SHIP → SHIP | Il MAJOR su AC14 è corretto in `fe18f5b`; il rilancio dà SHIP |

## Human Review Checklist

1. **Middleware.** Per le 20 procedure, confronta il builder con `5b61b3f`: `git diff 5b61b3f..HEAD -- packages/server/src/api/routers/pratiche packages/server/src/api/routers/task ':!**/_test/**' | grep -E '^[-+]export const .*Procedure'` deve mostrare solo le 5 procedure tolte. Va bene se non c'è nessuna riga `+` con un middleware diverso.
2. **Procedure tolte.** `git grep -nwE 'getPraticaByPraticaId|updatePracticeUpdatedAt|getTaskById|getTasksToExport' -- packages src apps ':!**/_test/**'` non trova niente. Nessun file della UI o dei server action chiama `pratiche.updatePratica` o `pratiche.updateLastEdit`.
3. **Migrazioni.** `git diff --stat 5b61b3f..HEAD -- packages/db` è vuoto: il controllo della catena delle migrazioni di `AGENTS.md` non serve. Prima della PR, fai comunque il merge di `dev` nel branch e ripeti i test se `dev` ha toccato `pratiche/`, `task/` o `services/contact/`.
4. **CI.** Sulla PR verso `dev`, tutti i gate verdi: `next lint`, `tsc --noEmit`, `pnpm db:check`, `pnpm run test --run` con i `*.pg.test.ts` (servizio Postgres), `pnpm build`, `pnpm api:build`, `pnpm api:smoke`.
5. **Finestra di rilascio.** Il merge non va nella stessa release di un cutover GCP, né nelle 2 settimane di osservazione di S6 (Constraints della SPEC). Il passo va in prod con il resto della migrazione.
6. **TD9.** Nel commit della PR resta `[PREVISTO]`. Dopo il merge in `dev`, un commit di documenti la porta a `[OPEN]` (D16 del PLAN).
7. **Staging (G2).** Con `BACKEND_URL` su Cloud Run, si aprono senza errori le pagine di T11.5, in particolare il dettaglio di una pratica e l'assegnazione massiva dei clienti, che passano via HTTP.

## Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1 | Met | `grep` vuoti; `@mito/db/schema` solo per `stateEnum` e `taskStatus` (v7, v4, v2) |
| AC2 | Met | Middleware (v1), tipi uguali tolte le 5 chiavi (v3, v5, T11.2), errori uguali (v3) |
| AC3 | Met | `TRPCError` solo nei tre `errors.ts` (v7) |
| AC4 | Met | Nessuno zod nei servizi (v7, v4) |
| AC5 | Met | Nessun import da `api/`; parametri espliciti (v7) |
| AC6 | Met | Nessun `server-only` nei file nuovi o modificati di `services/` (v7) |
| AC7 | Met | Procedure e `shared/updateAt.ts` tolte; `grep` come la SPEC; `CustomerChat.test.tsx` nello stesso commit (v1, v7) |
| AC8 | Met | Risposte e righe intere delle letture e delle 5 scritture, verdi su `7c5c77d` (v6, v3, v5) |
| AC9 | Met | Middleware e stranezze fissati, verdi su `7c5c77d` (v1, v3, v5, v6) |
| AC10 | Met | `writes.pg.test.ts`, verde su `7c5c77d` e in CI (v3, v6) |
| AC11 | Met | Nessuna asserzione esistente cambiata oltre ad AC7; i test aggiunti dopo sono verdi anche su `7c5c77d` (v6) |
| AC12 | Met | TD9 `[PREVISTO]` con tutte le stranezze e il flusso "Nuova pratica" (v7) |
| AC13 | Met | Nessun file in `src/app/`, `packages/db/`, `packages/domain/`; in `src/components` solo `CustomerChat.test.tsx` (v7) |
| AC14 | Met | Dopo `fe18f5b` (v7, secondo giro) |
| AC15 | Met in locale | Gate verdi nel worktree di gate (IMPLEMENTATION-NOTES); da confermare sulla CI della PR (checklist, punto 4) |

## Notes for docs-maintenance

- Durable findings to fold into `brain/tech-debt/crm/pratiche-effect.md`:
  - le tabelle dei middleware non hanno una riga "senza sessione" (v1);
  - la lista `REMOVED` delle tabelle dei middleware non filtra più niente (v1, v6);
  - confronti parziali sul cliente A in `bulkHandleTask.order.db.test.ts` (v6);
  - `updatedAt` confrontato con l'orologio dell'host in `writes.pg.test.ts` (v6);
  - dalle note: il bug della UI di `updateCustomerPreview` (id del cliente svuotato da `type="number"` in `CustomerSection.tsx`) e l'assegnazione massiva delle pratiche senza pulsante; i follow-up di `simplify` (`Actor` per `listPractices` e `bulkHandleTask` prima di L3; `runTrpc` con un `ManagedRuntime`).
- Domain pages that should backlink this review: le pagine di `brain/domains/crm/` sulle pratiche e sull'assegnazione massiva, se ci sono.

## [Round: 2026-10-25] Correzioni di TD9

Rubric: [[specs/crm/pratiche-effect/RUBRIC]], sezione dello stesso giro. Confronto `def7bd0` → `4ca830c` (commit `0ff83c1` codice, `4ca830c` documenti), [PR #83](https://github.com/omardeangelis/mito-micro-services/pull/83). Contratto: la SPEC e, per i punti corretti, la voce TD9 (a)–(m) di [[chore/migrazione-effect]] §7.

### Verdict

**DO NOT SHIP** · impact: critical

v1 trova un BLOCKER, v4 e v5 un MAJOR ciascuno; v2 e v3 danno SHIP con MAJOR e MINOR. Il codice nuovo di `pratiche` fa quello che TD9 chiede: transazione atomica su PGlite e postgres-js, permessi giusti nel router, nessuna colonna del form persa. Bloccano tre cose:

- l'assegnazione massiva delle pratiche è ancora possibile da un'altra procedura, mentre TD9 (k) e il debito degli operatori dicono di no;
- un intestatario mancante mostra "Modifica non salvata, riprova" invece di "Cliente non trovato" (TD9 m);
- l'ordine delle regioni (TD9 c) non ha un test che possa fallire.

### Coverage

- Rubric passes run: 5/5. Modelli: v1, v2 Opus; v3, v4, v5 Sonnet.
- Passes skipped or failed: nessuno.
- UI pass: non previsto dal classificatore. L'unico cambio di markup è il tipo dell'input nascosto in `CustomerSection.tsx`, controllato da v3 come dato.
- Gate rilanciati dai verificatori: `tsc --noEmit` 0; test di `pratiche`, `task`, `contact` e `CustomerSection` verdi (fino a 288), i `*.pg.test.ts` sul Postgres locale; ESLint pulito sui 21 file cambiati (v5).

### Findings

| ID | Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----|----------|--------------------|----------|---------|-------------------------|----------|
| B1 | BLOCKER (accettato come debito) | v1 — permessi | `packages/server/src/api/routers/import/GET/index.ts:28-62` (montato in `api/root.ts:27`); `brain/tech-debt/crm/gestione-operatori.md:18`; TD9 (k) | `import.updateExistingPractices` è `protectedProcedure` (basta la sessione), prende `z.array(insertPracticeSchema)` e scrive `operatorId: practice.operatorId` per `praticaId`, senza controllare la destinazione. Con `import.getExistingPractices` (anche `protectedProcedure`) si leggono le righe e si riscrive solo l'operatore. Prova di v1 su PGlite: un utente senza riga operatore sposta due pratiche su un operatore disattivato (`RESULT ok`). Più debole di `bulkAssignPractices`, tolta per questo motivo. Non è una regressione (invariato da `def7bd0`, `import` fuori dal passo), ma il giro scrive "Le pratiche non scrivono più un operatore scelto" e chiude TD9 (k) | Togliere `operatorId` (e `chatId`) dal `set` e portare `import.*` a `operatorProcedure`/`adminProcedure` con una tabella dei middleware; oppure riaprire (k), registrare il percorso di import come debito accettato e correggere la frase. Da controllare nello stesso giro la rotta REST `PUT /api/import/update/practices` (`src/app/api/import/update/_services/updatePractices.ts:93`, montata in `apps/api/src/rest.ts:30`) | sì: Omar ha deciso di non correggerlo qui (2026-10-25). TD9 (k) riaperta, debito in [[tech-debt/crm/gestione-operatori]], frase di `gestione-operatori.md` corretta. La rotta REST non ha il problema: toglie `operatorId` e `chatId` dall'input e riscrive quelli della pratica esistente |
| M1 | MAJOR (corretto in `8d3d33c`) | v4 — errori (e v2, MINOR) | `packages/server/src/services/practice/errors.ts:44` → `services/contact/errors.ts:167-171`; `connectPratica.ts:14` | `CustomerMissing` passa a `contactErrorToTrpc`, che dà un `BAD_REQUEST` senza `contactErrorCause`. `readContactError` dà `null` in tutte e due le forme, e il form mostra "Modifica non salvata, riprova". Il test (`writes.db.test.ts:~441`) fissa solo `message`, che l'action non legge. Raggiungibile dalla UI: `connect/page.tsx` non controlla che il cliente esista | In `practiceErrorToTrpc`, `CustomerMissing` → `BAD_REQUEST` con `cause: contactErrorCause("CUSTOMER_NOT_FOUND", {})` (il messaggio "Cliente non trovato" esiste già); un test che legge l'errore con `readContactError`/`describeContactError` | no |
| M2 | MAJOR (corretto in `8d3d33c`: `queries.pg.test.ts` con `ANALYZE`, il mutante senza `ORDER BY` muore 4 volte su 4) | v5 — test (e v3) | `pratiche/_test/queries.db.test.ts` (`getAllAvailableRegion`); `services/practice/queries.ts:~52` | Togliendo `.orderBy(practices.region)` il test resta verde: PGlite esegue la `selectDistinct` con un sort. Su Postgres vero (container locale, dopo `ANALYZE`) le stesse righe tornano `null,B,A` con HashAggregate. v3 ha provato il mutante: sopravvive | Un caso in un `*.pg.test.ts`, oppure un'asserzione sull'SQL generato (`order by "region"`) | no |
| M3 | MAJOR (corretto in `8d3d33c`) | v3 — input (e v2, MINOR) | `pratiche/POST/index.ts:~31` | `relatedCustomers` omette solo `operatorId` e `fileName`: passano `chatId`, `blackListStatus`, `createdAt`, `updatedAt`, `reddito` e altre colonne, e `email` senza formato. v2: un `chatId` inesistente dà `INTERNAL_SERVER_ERROR` con il messaggio della FK; `blackListStatus: "blacklisted"` e `createdAt: 2000-01-01` vengono scritti. Non peggio di `customer.insertCustomer` (TD8), ma TD9 (d) promette "le sole colonne del form" | `.pick()` delle colonne del form (`id`, `name`, `surname`, `email` con `.email()`, `phoneNumber`, `fiscalCode`, `vatCode`, `tempID`, `uniqueHash`, `source`) più `role` | no |
| M4 | MAJOR (corretto in parte in `8d3d33c`: il ruolo è fissato; il caso `customerId: ""` no, vedi R1 del giro 3) | v3 — input | `pratiche/POST/index.ts` (`role`, `customerId`) | Sostituendo `z.enum(["Coobbligato","Garante"])` con `z.string()`, o togliendo `.min(1)` da `customerId`, i 35 test restano verdi. Con `z.string()` un ruolo `Intestatario` scriverebbe un secondo intestatario | Due casi `BAD_REQUEST`: ruolo `Intestatario` e `customerId: ""` | no |
| m1 | MINOR | v2 — transazione | `services/practice/writes.ts:80-89` | Un 23505 sulla chiave dei collegamenti (un cliente collegato con lo stesso id dell'intestatario mancante) dà `INTERNAL_SERVER_ERROR` con il messaggio del driver, su tutti e due i driver; il rollback tiene. Solo con una richiesta costruita a mano | Rifiutare in zod gli id collegati uguali all'intestatario o duplicati, o mappare il 23505 sui collegamenti | no |
| m2 | MINOR | v2 | `pratiche/_test/writes.pg.test.ts` | Su postgres-js solo il rollback di `CUSTOMER_EXISTS`; `PRACTICE_EXISTS` e `CustomerMissing` solo su PGlite (la prova di v2 su postgres-js passa) | I due casi in `writes.pg.test.ts` | no |
| m3 | MINOR | v3 | `src/app/dashboard/pratiche/[id]/_actions/updateCustomerPreview.ts:8-10` | L'email vuota diventa `null`, il telefono vuoto resta `""`. Modificando solo l'email di un cliente con telefono `NULL`, il telefono diventa `""` e la cella passa da "Missing" a vuota (`CustomerColumns.tsx:220`) | `"" → null` anche su `phoneNumber`; un test dello schema dell'action | no |
| m4 | MINOR | v5 | stesso file | La trasformazione `"" → null` dell'email non ha una voce TD9 né un test dell'action | Registrarla nelle note come decisione; test con `""` → `null` e un'email non valida rifiutata | no |
| m5 | MINOR | v3 | `updateCustomerPreview`, `updatePraticaFromDashboard` | Un id che non esiste aggiorna zero righe e la UI dice "Cliente aggiornato con successo": è per questo che il bug dell'id vuoto non si vedeva. Comportamento di base, fissato dai test | `NOT_FOUND` a zero righe, o debito accettato | sì |
| m6 | MINOR | v4 | `NewPraticaForm.tsx:167` | Ogni errore va sotto "ID Pratica", anche `CUSTOMER_EXISTS` e il cliente mancante | `form.setError("root", …)` o un avviso del form per i codici che non riguardano la pratica | sì |
| m7 | MINOR | v4 | `pratiche/[id]/page.tsx`, `connectPratica.ts` | Nessun test dei consumatori (404 contro rethrow, messaggio per codice) né della forma HTTP dei codici nuovi; v4 li ha provati a mano | Test della pagina e dell'action con le due forme | sì |
| m8 | MINOR | v5 | `CustomerSection.test.tsx` | Costruisce `FormData` dal DOM senza inviare; mock pesanti; avviso di React su `action`. Fallisce sull'input vecchio (provato da v3 e v5) | Facoltativo: chiamare `formAction` e controllare che l'action riceva l'id | sì |
| m9 | MINOR (corretto in `8d3d33c`, nel test di M3) | v1 | `pratiche/_test/writes.db.test.ts:368-381` | Nessun test che un `operatorId` mandato su un cliente collegato venga ignorato (oggi lo è, prova di v1) | Il gemello del test della riga 368 per i clienti collegati | no |
| n1 | NIT | v2, v3, v5 | `writes.db.test.ts:~572` | Titolo "la risposta è quella del driver con zero righe toccate", ma l'asserzione è `toBeUndefined()` | Rinominare | no |
| n2 | NIT | v1, v5 | `procedures.db.test.ts:18-22` | `REMOVED` non filtra niente e nasconderebbe una procedura riaggiunta con quei nomi | Togliere `REMOVED` | no |
| n3 | NIT (corretto) | v5 | `IMPLEMENTATION-NOTES.md` (righe di AC11 e AC13) | Dicono ancora "solo AC7" e "nessun file in `src/app/`, `packages/domain`", falso per questo giro | Segnarle superate come AC12 | no |
| n4 | NIT | v4 | `packages/domain/src/contact/errors.ts` | Codici delle pratiche nello spazio dei nomi "contact" | Debito di nomi, coerente con `CUSTOMER_UNASSIGNED` | sì |
| n5 | NIT | v4 | `pratiche/PUT/index.ts` (`refine`) | Il `refine` "almeno uno fra email e telefono" non si raggiunge dalla UI (l'action manda sempre tutti e due) | Nessuno; protegge le chiamate HTTP dirette | no |
| n6 | NIT | v3 | `services/contact/queries.ts` (`activeAlertsOf`) | Il pareggio su `alert.id` non ha un caso con la stessa scadenza | Un caso con due alert alla stessa scadenza | no |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — permessi | Le 6 procedure di `pratiche` sono `operatorProcedure`; `protectedProcedure` non è più importato nel router. `updatePraticaFromDashboard` prende solo `state` e `id`. `createPratica` prende le 15 colonne del form; la pratica nasce con `operatorId` `NULL` come prima, i clienti collegati con `ctx.operator.id` (prova). Il percorso `createCustomer` ha lo stesso middleware, schema e risoluzione dell'operatore di `customer.insertCustomer`. Nessun resto di `bulkAssignPractices`, `assignPractices`, `bulkUpdateAction`, `BulkActionDialog`, `usePracticeTableStore` |
| v2 — transazione | `query` legge `Tx` dentro `transaction`; `createCustomer` è una `query` senza transazione sua. Nove prove per driver, un fallimento a ogni passo: le fotografie prima e dopo di pratiche, clienti e collegamenti coincidono. 23505 e 23503 arrivano uguali da PGlite e postgres-js (`driverError` scarta `DrizzleQueryError`). Il commento "solo l'intestatario può mancare" regge. Nessun `DbError` recuperato. `updateCustomerContacts` e `updatePracticeFromDashboard` scrivono solo le loro colonne |
| v3 — input | Nessuna colonna del form persa; `productId` mappato; la redirect non dipende dalla risposta. `id` numerico per `updatePraticaFromDashboard`. Il test di `CustomerSection` fallisce sul componente di `def7bd0` (`id: ""`) e passa ora. `ORDER BY deadline, id` sopravvive al consumatore (`CustomerBulkDialog.tsx`), e il suo test uccide il mutante |
| v4 — errori | `PRACTICE_NOT_FOUND`, `PRACTICE_EXISTS`, `CUSTOMER_EXISTS` uguali in dominio, traduttore e messaggi, in-process e via HTTP (prova con il formatter e superjson). La pagina chiama `notFound()` sul codice e rilancia il resto. Niente più "Questa pratica esiste già" per ogni errore. AC3: `TRPCError` solo negli `errors.ts` di `services/` (il nuovo `practice/errors.ts` è ammesso) |
| v5 — confine e test | Niente `next/*`, `next-auth`, `server-only` o `@/` fuori dai test in `packages/server`; servizi senza zod e senza import da `api/`. Ogni asserzione cambiata corrisponde a una voce TD9 o alla rimozione di `bulkAssignPractices`. La tabella dei middleware copre esattamente le chiavi del router. Nessun riferimento rimasto ai file tolti. Nessuna migrazione. `tsc`, test (282, `pg` compreso) ed ESLint verdi |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Permessi del router, `operatorId`, `createCustomer`, via `bulkAssignPractices` | DO NOT SHIP | Il router è giusto, ma l'assegnazione massiva resta possibile da `import.updateExistingPractices` e i documenti dicono il contrario (B1) |
| v2 | Transazione e SQLSTATE | SHIP | Rollback tenuto in tutte le prove su due driver; restano MINOR su input e mappature |
| v3 | Contratti di input | SHIP | Nessuna perdita di dati; tre MAJOR su test e input da chiudere prima del merge |
| v4 | Contratto degli errori | DO NOT SHIP | Il cliente mancante non arriva al form con il messaggio giusto (M1) |
| v5 | Confine e integrità dei test | DO NOT SHIP | Il test dell'ordine delle regioni non può fallire (M2) |

### Human Review Checklist

1. **Decisione su B1 (presa: debito, 2026-10-25).** Omar decide se `import.updateExistingPractices` perde la scrittura di `operatorId` e passa a `operatorProcedure`/`adminProcedure` in questa PR, o se resta come debito accettato. Nel secondo caso TD9 (k) torna aperta per il percorso di import e la frase in `gestione-operatori.md:18` va corretta. Controllare anche da dove viene `operatorId` nella rotta REST `PUT /api/import/update/practices`.
2. **Permessi, revisione di Leonardo.** Il giro porta `getPraticaById` e `createPratica` da `protectedProcedure` a `operatorProcedure` e toglie `operatorId` dagli input: per il §4 di [[chore/migrazione-effect]] serve la revisione di Leonardo prima del merge in `dev`. Controllo: `git diff def7bd0..HEAD -- packages/server/src/api/routers/pratiche ':!**/_test/**' | grep -E '^[-+].*Procedure'` mostra solo passaggi verso `operatorProcedure`.
3. **Correzioni di M1–M4.** Dopo le correzioni, rilanciare almeno v3, v4 e v5 su quel commit. M2 e M4 si provano col mutante: tolto `orderBy` o allargato `role`, almeno un test deve fallire.
4. **CI.** Sulla PR #83: `next lint`, `tsc --noEmit`, `pnpm db:check`, `pnpm run test --run` con i `*.pg.test.ts`, `pnpm build`, `pnpm api:build`, `pnpm api:smoke`, tutti verdi.
5. **Migrazioni.** `git diff --stat def7bd0..HEAD -- packages/db` è vuoto; il controllo della catena non serve. Rifarlo se si fa il merge di `dev` nel branch.
6. **Staging.** Con `BACKEND_URL` su Cloud Run: "Nuova pratica" con un garante; una pratica duplicata ("Questa pratica esiste già"); un cliente collegato già presente ("Un cliente collegato esiste già"); un intestatario inesistente (`/dashboard/customers/<id-falso>/connect`, "Cliente non trovato" dopo M1); il dettaglio di una pratica inesistente (404); la modifica di email e telefono dal dettaglio, anche svuotandoli.
7. **Finestra di rilascio.** Come nel giro 1: il merge non cade in un cutover GCP né nella finestra di osservazione di S6.

### Acceptance criteria check (case B)

Per i punti corretti il contratto è TD9; i criteri della SPEC che chiedevano di conservare le stranezze sono superati (IMPLEMENTATION-NOTES).

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC1 | Met | Adapter: input zod → servizio → `runTrpc` (v5, v1) |
| AC2 | Superato | Il contratto cambia apposta secondo TD9 |
| AC3 | Met | `TRPCError` solo negli `errors.ts`, `practice/errors.ts` compreso (v4) |
| AC4 | Met | Nessuno zod nei servizi (v5) |
| AC5 | Met | Nessun import da `api/` (v5) |
| AC6 | Met | Nessun `server-only` (v5) |
| AC7 | Met | Più `bulkAssignPractices`, `insertPratica`, `connectPraticaAndCustomer` tolte, senza resti (v1, v5) |
| AC9–AC11 | Superato | Le asserzioni cambiate corrispondono a TD9 (v5) |
| AC12 / TD9 | Unmet (a `4ca830c`) | (k) contraddetta da B1; (m) incompleta per il cliente mancante (M1); (c) senza un test che fallisca (M2); (d) più larga per i clienti collegati (M3). (a), (b), (e)–(j), (l) sì. A `bef07ae`: (c), (d), (m) corrette, (k) riaperta (giro 3) |
| AC13 | Superato | Il giro tocca `src/app/`, `packages/domain/` e `src/components/` per le correzioni (n3: le note non lo dicono) |
| AC14 | Unmet (a `4ca830c`) | `gestione-operatori.md:18` e TD9 `[CLOSED]` dicono una cosa falsa sull'assegnazione delle pratiche (B1). A `bef07ae` i documenti sono corretti (v1, giro 3) |
| AC15 | Met in locale | `tsc`, test, `pg` ed ESLint verdi nei passi; CI della PR da vedere (checklist, punto 4) |

### Notes for docs-maintenance

- Durable findings to fold into `brain/tech-debt/crm/pratiche-effect.md` (se non corretti prima del merge): B1 se resta accettato (in `gestione-operatori.md`, con TD9 (k) riaperta); m5, m6, m7, m8, n4.
- I MAJOR M1–M4 e i MINOR m1–m4, m9 sono da correggere prima del merge, non debito.
- Le memorie dei verificatori di questo giro sono in `.agents/agent-memory/adversarial-verifier/`, nel commit `bef07ae`.

## [Round: 2026-10-25] Rilancio sulle correzioni

Rubric: [[specs/crm/pratiche-effect/RUBRIC]], sezione dello stesso giro (i passi v1, v3, v4, v5 del giro 2, ristretti alle correzioni). Confronto `4ca830c` → `bef07ae` (commit `8d3d33c` codice, `bef07ae` documenti), [PR #83](https://github.com/omardeangelis/mito-micro-services/pull/83).

### Verdict

**SHIP** · impact: critical

I quattro passi danno SHIP. M1, M2 e M3 sono corretti e i loro test uccidono i mutanti; M4 è corretto per il ruolo e l'email, non per il `customerId` vuoto (R1). B1 resta nel codice: chi ha una sessione può ancora spostare pratiche su qualunque operatore con `import.updateExistingPractices` (riprodotto da v1). È debito accettato da Omar; TD9 (k) è riaperta e i documenti lo dicono. Restano MINOR sui test e sui documenti, nessuno sul comportamento.

### Coverage

- Rubric passes run: 4/4 (v1 Opus; v3, v4, v5 Sonnet). v2 non rilanciato: le correzioni non toccano la transazione.
- Passes skipped or failed: nessuno. I quattro passi giravano nello stesso worktree e si sono visti a vicenda i mutanti: v1, v3 e v5 hanno rifatto i gate su una copia `git archive` di `bef07ae`, verde.
- UI pass: non previsto.
- Gate rilanciati: `tsc --noEmit` 0; ESLint sui file di codice cambiati 0 (v5; v4 non ha potuto lanciarlo nel worktree); 140 test di `pratiche` e `practice` con Postgres 15, suite completa 3383 test (v5).

### Findings

| ID | Severity | Concern (verifier) | Location | Problem | Required fix / evidence | Durable? |
|----|----------|--------------------|----------|---------|-------------------------|----------|
| R1 | MINOR | v1, v3, v5 | `pratiche/_test/writes.db.test.ts` (caso "un intestatario vuoto"); `pratiche/POST/index.ts` (`customerId`) | Togliendo `.min(1)` da `customerId` i test restano verdi: `""` arriva al database, dà `CustomerMissing` e quindi lo stesso `BAD_REQUEST`, senza scritture. Dopo M1 il caso non distingue zod dalla FK. Il REPORT diceva il caso "fissato" (riga M4 corretta) | Nel caso, controllare che la `cause` non sia `CUSTOMER_NOT_FOUND` (o che l'errore sia di zod su `customerId`) | no |
| R2 | MINOR | v3, v5 | stesso file; `POST/index.ts` (`relatedCustomers[].id`) | Togliendo `.min(1)` dall'id di un cliente collegato i test restano verdi, e si scrive un cliente con `id = ""` (prova di v3). Il controllo c'era già alla base | Un caso `BAD_REQUEST` con un cliente collegato con `id: ""` | no |
| R3 | MINOR | v3 | `writes.db.test.ts` (fixture `related()`) | Togliendo `vatCode` dal `.pick` i test restano verdi: la fixture non ha la partita IVA. Oggi si salva (prova di v3) | `vatCode` nella fixture, o un caso con solo partita IVA | no |
| R4 | MINOR | v5 | `IMPLEMENTATION-NOTES.md` (tabella dei criteri) | Righe vecchie: AC3 "nei tre `errors.ts`; nessun traduttore nuovo", AC2 "tipi uguali a `5b61b3f`", AC9 e AC10 "met", AC14 "met" | Segnarle superate come AC11–AC13 | no |
| R5 | MINOR | v4 | `NewPraticaForm.tsx:163`, `connectPratica.ts` | m6 e m7 restano: "Cliente non trovato" compare sotto "ID Pratica"; nessun test dell'action fino alla stringa (v4 l'ha provata a mano: giusta in tutte e due le forme) | Come m6 e m7 | sì |
| r1 | NIT | v1, v3, v5 | `writes.db.test.ts` (test dei clienti collegati) | Il titolo dice "date", ma il test manda solo `createdAt`; colonne non mandate (`updatedAt`, `reddito`, …) aggiunte al `.pick` sopravvivono. Il `.pick` è una lista chiusa | Facoltativo | no |
| r2 | NIT | v5 | `queries.pg.test.ts` | Il commento fa pensare che `ANALYZE` serva: il mutante muore anche senza (3 su 3) | Riformulare il commento | no |
| r3 | NIT | v1 | `brain/domains/crm/crm-contract.md:56`, `concepts/regola-dei-lock.md:55`, `flows/disattivazione-operatore.md:115` | Citano `pratiche.PUT` fra chi scrive un operatore senza controllarlo e non citano `import.updateExistingPractices` | Per `docs-maintenance` all'ingest | sì |
| r4 | NIT | v1 | `src/lib/workers/import/service/updateCustomer.ts:85-120` | Copia senza chiamanti della stessa scrittura di `operatorId` e `chatId` | Toglierla nella PR del debito di B1 | sì |
| r5 | NIT | v1 | `src/app/api/import/update/practices`, `src/app/api/import/create/practices` | Le rotte REST dell'import accettano qualunque sessione (`authCheck()`): `update` riscrive le colonne di business di qualunque pratica, `create` inserisce con l'`operatorId` del chiamante. Esistevano prima; il piano del debito di B1 cita solo `import.*` | Aggiungerle al debito in [[tech-debt/crm/gestione-operatori]] | sì |
| r6 | NIT | v4 | `api/routers/chat/POST/index.ts:72`, `chat/DELETE/index.ts:17,21` | `TRPCError` creati nel router, fuori dagli `errors.ts`. Fuori dal perimetro di AC3 e da questa PR | Nessuno qui | sì |
| r7 | NIT | v1 | `brain/specs/crm/crm-specs.md:32` | Diceva "(SHIP)" senza il giro 2 | Aggiornato con questo giro | no |

### What passed

| Concern (verifier) | Evidence |
|--------------------|----------|
| v1 — permessi e B1 | `gestione-operatori.md`, TD9 (k), `pratiche-effect.md` e le note dicono il vero; nessun documento attuale dice che le pratiche non si possono più spostare. La rotta REST `PUT /api/import/update/practices` toglie `operatorId` e `chatId` e riscrive quelli della pratica (prova via Hono con un operatore disattivato: invariato). I clienti collegati di `createPratica` prendono l'operatore dalla sessione: 8 mutanti uccisi, 3 equivalenti. Nessun middleware cambiato; `createPratica` su `protectedProcedure` muore |
| v3 — input | Il `.pick` è esattamente l'insieme che il form manda (più `source` e `uniqueHash` aggiunti al submit); email, `tempID`, `source`, `uniqueHash` coincidono col form. M2: 8 su 8 rosso senza `ORDER BY`, 8 su 8 verde col codice; l'ordine con `null` in fondo è quello che il form si aspetta. Ruolo ed email: mutanti uccisi. `tsc` 0, nessun `as` nuovo |
| v4 — errori | I quattro tag hanno una `cause` leggibile; un tag nuovo fa fallire `tsc`. Prova end-to-end con `fetchRequestHandler` e `inProcessLink`: "Cliente non trovato" in tutte e due le forme. Tre mutanti (senza `cause`, codice sbagliato, ritorno a `contactErrorToTrpc`) uccisi da `errors.db.test.ts` e da `writes.db.test.ts`. AC3 nel perimetro della SPEC |
| v5 — confine e test | Nessuna migrazione, nessun import vietato in `packages/server`. Ogni asserzione cambiata corrisponde a M1–M4 o m9, nessuna allentata. `queries.pg.test.ts` gira in CI (progetto `pg`, `pg.setup.ts` si ferma senza URL) e non lascia stato. "Corretto" vero per M1, M2, M3, m9, n3 |

### Per-concern verdicts

| Pass | Charter | Verdict | Rationale |
|------|---------|---------|-----------|
| v1 | Permessi, B1 nei documenti, rotta REST dell'import, clienti collegati | SHIP | Documenti veri, rotta REST sicura, nessun operatore scelto dal chiamante; B1 è debito accettato |
| v3 | Contratti di input, ordine delle regioni, tipi | SHIP | Nessuna colonna persa né in più; M2 solido; restano test mancanti su id vuoti e partita IVA |
| v4 | Contratto degli errori | SHIP | M1 tiene fino al form, in tutte e due le forme |
| v5 | Confine, integrità dei test, documenti | SHIP | Gate verdi su una copia pulita; restano frasi dei documenti da correggere |

### Human Review Checklist

1. **Revisione di Leonardo** (come nel giro 2, punto 2): `getPraticaById` e `createPratica` passano a `operatorProcedure`, `operatorId` fuori dagli input.
2. **B1 resta aperto nel codice.** Fino alla PR del debito, chi ha una sessione può spostare pratiche su qualunque operatore con una chiamata diretta a `import.updateExistingPractices`. Va bene solo se Omar e Leonardo lo accettano fino a quella PR; il piano del debito va allargato alle rotte REST dell'import (r5) e alla copia senza chiamanti (r4).
3. **R1–R3**, da decidere: chiuderli in questa PR (tre casi di test) o lasciarli.
4. **CI, migrazioni, staging e finestra di rilascio**: come nel giro 2, punti 4–7.

### Acceptance criteria check (case B)

| Criterion | Met / Unmet / Blocked | Notes |
|-----------|-----------------------|-------|
| AC12 / TD9 | Met, tranne (k) riaperta | (c) provata su Postgres (v3, v5); (d) ristretta alle colonne del form (v1, v3); (m) "Cliente non trovato" fino al form (v4); (k) `[OPEN]` per l'import (v1) |
| AC14 | Met | I documenti dicono il vero su B1 (v1); restano le righe vecchie delle note (R4) e le pagine di dominio (r3) |
| AC15 | Met in locale | Gate verdi su una copia pulita di `bef07ae` (v5); CI della PR da vedere |

### Notes for docs-maintenance

- Durable findings to fold into the tech debt: R5 (m6, m7) in [[tech-debt/crm/pratiche-effect]]; r4 e r5 in [[tech-debt/crm/gestione-operatori]] con B1; r3 nelle pagine di dominio; r6 nel debito della migrazione.
- Le memorie dei verificatori di questo giro sono in `.agents/agent-memory/adversarial-verifier/`.

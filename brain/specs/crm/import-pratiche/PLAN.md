---
domain: crm
type: plan
links:
  - "[[specs/crm/import-pratiche/SPEC]]"
  - "[[chore/migrazione-effect]]"
  - "[[chore/migrazione-gcp]]"
  - "[[domains/crm/concepts/regola-dei-lock]]"
  - "[[specs/crm/export-chiamate/PLAN]]"
created: 2026-10-24
updated: 2026-10-24
---

# Plan: Import di clienti e pratiche, riscritto

**Spec:** [[specs/crm/import-pratiche/SPEC]] (approvata da Leonardo il 2026-10-24)
**Status:** Planned
**Generato:** 2026-10-24 con `create-plan`: grill (una domanda a Leonardo, D1) → swarm-plan → tdd → adversarial-verifier (primo giro DO NOT SHIP con 2 blocker; secondo giro DO NOT SHIP senza blocker, 3 major e 8 minor; tutti corretti in questa versione, senza un terzo giro per il limite di 2 tentativi). Nessun codice scritto.

---

## 1. Situazione iniziale

- **Lettura del file.** `WorkerImportDialog` (`src/app/dashboard/_components/`) chiama `processFile` (`src/lib/workers/import/service/process.ts`) nella pagina: `XLSX.read` due volte, `sheet_to_csv`, poi `parseCsv` (papaparse con `dynamicTyping` su tutte le colonne tranne codici cliente, codici fiscali e ID pratica) e `parsePratica`. Le regole di conversione sono in `src/app/api/import/process/_services/` (`waveFile.ts`, `standardFile.ts`, `parsePratica.ts`), `src/app/api/import/_utils/` (`index.ts`, `merge.ts`, `nullable.ts`) e `src/lib/utils/index.ts` (`parseDateInput`, `formatDateSerialInDate`, `cleanObject`, `createHashForCustomer`; il file importa anche `clsx` e `tailwind-merge`).
- **Scrittura.** Il web worker `src/lib/workers/import/worker.ts` chiama in sequenza le rotte `src/app/api/import/update/*` e `create/*`, montate anche sul backend (`apps/api/src/rest.ts:22-30`). Ogni rotta usa `authCheck` (basta una sessione) e scrive per conto suo.
  - Clienti esistenti (`update/_services/updateCustomers.ts`): il primo cliente con lo stesso codice fiscale (se il cliente del CRM ce l'ha) o la stessa partita IVA. Poi il cliente fuso, `{ ...primo, ...valori non vuoti della riga }` (:69), fa da `identifiers` a `updateImportedCustomer` (:100): sono aggiornati **tutti** i clienti con il codice cliente della riga, **o** il codice fiscale della riga (se manca, quello del primo), **o** la partita IVA della riga (se manca, quella del primo). Ognuno riceve tutti i campi del cliente fuso, tranne codice cliente, operatore, `id`, `uniqueHash` e `updatedAt`.
  - Pratiche esistenti (`update/_services/updatePractices.ts`): valori non vuoti della riga, rate totali e data di creazione invariate, `last_import_update` solo se cambiano le rate pagate.
  - Legami: `create/customerToPratica/_services/processCTP.ts` (difetti nella spec).
- **Codice morto.** `POST /api/import/process`; le 4 procedure `protectedProcedure` di `packages/server/src/api/routers/import/`.
- **Report errori.** `POST /api/export/importError` lo carica nello storage, `/api/export/download` lo scarica. Dopo #67 (unita il 23/10) sono gli unici usi di quel giro.
- **Effect.** `packages/server/src/effect/db.ts`: `Db`, `query`, `transaction` (READ COMMITTED; **niente timeout né interruzioni dentro**), `lockCustomer`. `runTrpc` in `effect/trpc.ts`. `adminSessionProcedure` (`api/trpc.ts:186`): ogni non admin riceve `FORBIDDEN`, anche senza riga operatore.
- **OIDC.** I cron arrivano da Cloud Scheduler su `/internal/cron/<job>` con un token OIDC per l'URL del servizio, verificato da `cronAuth` (`apps/api/src/cron/auth.ts`, audience esatta). Su staging i job di Scheduler esistono solo per `priority`, `alert`, `update` e `delete-export` (`setup-staging.sh`), oggi in pausa.
- **Altri writer di pratiche con più righe in un'istruzione.** `bulkAssignPractices` (`packages/server/src/api/routers/pratiche/PUT/index.ts:62-70`, `UPDATE … WHERE pratica_id IN …`, senza ordine né transazione né retry) e la disattivazione di un operatore (`services/operator/deactivate.ts`, pratiche per `operator_id`, ripete la transazione 2 volte su 40P01). La chiave delle pratiche è `pratica_id` (`packages/db/src/schema/pratiche.ts`); `id` è una colonna identity.
- **Refresh delle liste.** Clienti, Pratiche e "Ultime Pratiche Aggiornate" sono server component che leggono con `@/trpc/server`: si aggiornano con `router.refresh()`, come fa oggi `ImportWorker.tsx:107`.
- **Client tRPC.** `src/trpc/react.tsx`: `unstable_httpBatchStreamLink` manda le query in GET con l'input nell'URL e unisce le chiamate contemporanee in una richiesta; `loggerLink` scrive in console l'input delle chiamate fallite anche in prod.
- **Piattaforma.** Backend Cloud Run `mito-crm-staging` in `europe-west3`: 1 vCPU, 512 MiB, al massimo 2 istanze, timeout 1800 s, fatturazione per richiesta; il deploy controlla `/health` della revisione nuova prima di darle il traffico. Postgres 15 (niente `transaction_timeout`). I test girano con `TZ=UTC`; i `*.db.test.ts` usano un PGlite in memoria (una sessione), i `*.pg.test.ts` un Postgres vero.
- **Branch e prod.** `main` non si muove dal 2026-10-16 (`bde41e0`); `dev` ha già cambi in attesa del go/no-go (l'export, unito su richiesta di Leonardo).

## 2. Problema

Riscrivere l'import come strumento dell'admin, su Effect, senza cambiare che cosa si salva. Ostacoli:

1. Le regole di conversione restano identiche (AC32, AC33) mentre la lettura va in un worker e la conversione gira anche sul server, in UTC.
2. Tutto o niente (AC19), e AC19b: alla conferma il server deve sapere che cosa diceva l'anteprima, mentre l'anteprima non scrive nulla (AC7) e l'annullamento nemmeno (AC17).
3. L'import finisce anche a scheda chiusa (AC20): su Cloud Run una richiesta finita lascia l'istanza quasi senza CPU. Scelta di Leonardo: Cloud Tasks (D1).
4. 20.000 righe in meno di 30 secondi (AC25), senza deadlock con gli altri writer (AC27).
5. Le righe passano dal browser al server attraverso la rewrite di Vercel, con un limite sul corpo non verificato.
6. Permessi nuovi (AC1–AC4) e una coda nuova su GCP: li rivede Leonardo.

## 3. Forma della soluzione

```
browser (worker)                       server (@mito/server)                       Cloud Tasks
────────────────                       ─────────────────────                       ───────────
file ─► XLSX → CSV → papaparse
        (pipeline di oggi)
     ─► convert + classify + group
        (@mito/domain, come il server)
     ─► chiavi (CF, P.IVA, codice
        cliente, ID pratica) ─────────► import.lookup ─► clienti, pratiche, legami
     ◄─ ────────────────────────────────                 esistenti (nessuna scrittura)
     ─► planRows (@mito/domain):
        numeri, righe scartate, motivi
report errori (xlsx, nel browser)
conferma ─► righe gzip, a pezzi ──────► import.upload ─► import_upload (temporanea) ─► task di pulizia a +1 h
         ─► esito atteso ─────────────► import.start  ─► import_run "running" ───────► POST /internal/import/<id>
                                       executeImport ◄─────────────────────────────────┘ (OIDC, backend)
                                       transaction: lock di import_run, clienti, pratiche;
                                       lookup + planRows rifatti e confrontati con l'esito
                                       atteso; scritture; "completed"; righe cancellate
import.active ogni 3 s (solo admin) ─► avviso + router.refresh()
```

- **Dominio puro `@mito/domain/import`.** Tracciati e riconoscimento del formato; conversione di una riga (spostata dal codice di oggi, con `now` come argomento) e le funzioni di `src/lib/utils` che usa; classificazione (importabile, solo cliente, scartata con i motivi in italiano che nominano la colonna); raggruppamento nel file (AC38); `planRows`, il piano dato quello che esiste nel CRM (riconoscimento dei clienti, AC11b, numeri); schema dei corpi. Nessun accesso al database: lo usano il worker per l'anteprima e il server per l'import, e lo riusano il tracciato XML v2 e la futura API (vincolo Riuso).
- **Servizi Effect `packages/server/src/services/import/`.** `lookup.ts` (che cosa esiste nel CRM), `upload.ts` (righe temporanee), `apply.ts` (scrittura), `run.ts` (avvio, esecuzione, un import alla volta, scadenza), `history.ts` (storico, pulizia), `queue.ts` (servizio `ImportQueue`). Dipendenze come servizi: `Db`, `Clock`, `ImportQueue`, `ImportConfig` (scadenza, dimensione dei blocchi).
- **Procedure** `import.lookup`, `import.upload`, `import.start` (mutation) e `import.active`, `import.list` (query) su `adminSessionProcedure`, adapter senza logica.
- **Rotte interne** `POST /internal/import/run/:id` e `POST /internal/import/purge/:uploadId` sul backend Hono, come quelle dei cron: verificano il token OIDC del service account della coda e chiamano il servizio.
- **UI** in `src/app/dashboard/import/` e `src/lib/import/`.

### PR e merge

Tutte le PR restano in draft. Come per l'export, si uniscono su `dev` (staging) solo quando Leonardo lo chiede, verdi e riviste. Prima del primo merge su `dev` Leonardo conferma che la promozione `dev` → `main` resta ferma fino al go/no-go della prod GCP (vincolo Prod della spec), e la si scrive in [[chore/migrazione-gcp]].

| PR | Branch | Base | Task | Revisione |
|---|---|---|---|---|
| A | `claude/import-caratterizzazione` | `dev` | T1, T2 | Opus (solo test) |
| B | `claude/import-dominio` | A | T3, T4, T5, T6, T8a | Opus (il vecchio import non cambia) |
| C | `claude/import-storico-schema` | `dev` | T7 | Leonardo (migrazione, approvazione su `staging-db`) |
| D | `claude/import-coda` | `dev` | T12a | Leonardo (coda e permessi su GCP; lo script lo lancia lui dal Mac) |
| E | `claude/import-servizio` | B + C | T8b, T9, T9b, T10a, T10b, T11, T13 | Leonardo (permessi, lock); su `dev` solo dopo D e lo script |
| F | `claude/import-ui` | E | T14–T19 | Leonardo; si unisce insieme a G |
| G | `claude/import-cleanup` | F | T20 | Leonardo |

T0 è una prova senza PR; T12b è la prova finale su staging dopo F e G.

## 4. Decision ledger

| # | Decisione | Fonte |
|---|---|---|
| D1 | L'import confermato gira in una richiesta di Cloud Tasks verso il backend: coda con 3 tentativi e backoff, una consegna alla volta, scadenza di 30 minuti. Le righe aspettano in una tabella temporanea dalla conferma alla fine dell'import | Leonardo, 2026-10-24 (card) |
| D2 | Il file si legge nel browser, in un Web Worker modulo, con la pipeline di oggi (`XLSX.read` → `sheet_to_csv` → papaparse con le stesse opzioni): le celle che arrivano alla conversione sono quelle di oggi (AC32), "Annulla" termina il worker (AC18), il backend da 512 MiB non apre file Excel | Piano |
| D3 | L'anteprima si calcola nel worker con il codice del dominio. Al server va solo l'elenco delle chiavi (CF, P.IVA, codice cliente, ID pratica) per `import.lookup`, che legge e non salva nulla: anteprima e annullamento non scrivono nulla (AC7, AC17). Le righe partono una volta sola, alla conferma: forma compatta (`{ colonne, righe: [numero di riga, celle][] }`), gzip (`CompressionStream`), pezzi da 2 MB in base64 mandati uno alla volta (`import.upload`), poi `import.start` | Piano, gate (secondo giro) |
| D4 | La conversione di una riga va nel dominio, pura, con `now` come argomento. Con lei si spostano in `@mito/domain` le funzioni di `src/lib/utils` che usa (`parseDateInput`, `formatDateSerialInDate`, `cleanObject`, `createHashForCustomer` con `spark-md5`), `fiscalCodeRegex` e il tipo dello stato della pratica; `src/lib/utils` le riesporta. `id` e `uniqueHash` di un cliente nuovo li assegna il servizio all'inserimento | Piano, AGENTS.md (niente `@/` in `packages/server`) |
| D5 | Una transazione sola (`transaction` di `effect/db.ts`). Ordine dei lock: la riga di `import_run`, poi i clienti per `id`, poi le pratiche per `pratica_id`, ognuno con un `SELECT … ORDER BY … FOR UPDATE`; poi le scritture a blocchi di 1.000 righe (`INSERT` senza `ON CONFLICT` per clienti e pratiche nuovi, `UPDATE … FROM (VALUES …)`, legami con `ON CONFLICT DO NOTHING`). Su 40P01 la transazione si ripete fino a 2 volte. L'import non blocca righe `users`: la regola dei lock resta valida | Piano, [[domains/crm/concepts/regola-dei-lock]] |
| D6 | `bulkAssignPractices` e la disattivazione bloccano le pratiche nello stesso ordine (`pratica_id`) prima di aggiornarle, in una transazione con retry su 40P01 | Gate (primo giro) |
| D7 | Un import alla volta con un indice unico parziale su `import_run` (`WHERE status = 'running'`): due conferme insieme, anche da istanze diverse, e il doppio clic ricevono il 23505 → `ImportAlreadyRunning` con nome e ora di Roma (AC22). Un task consegnato di nuovo non rifà nulla: `executeImport` parte solo se la riga è `running` e non ancora presa (`claimed_at` nullo) | Piano |
| D8 | Scadenza dei 30 minuti (AC30) senza interrompere la fibra (vietato dentro `transaction`): controllo della scadenza tra un blocco e l'altro (errore taggato → rollback), `SET LOCAL statement_timeout` uguale al tempo rimasto, `SET LOCAL idle_in_transaction_session_timeout = '60s'`. La pulizia porta a `interrupted` le righe `running` più vecchie di 30 minuti con `FOR UPDATE SKIP LOCKED`: una riga bloccata è un import ancora vivo | Piano, gate |
| D9 | `completed` con i numeri si scrive nella stessa transazione dei dati, insieme alla cancellazione delle righe temporanee. `failed` e `interrupted` in una transazione a parte, che cancella anch'essa le righe | Gate (primo giro) |
| D10 | AC19b: `import.start` porta l'esito atteso (i numeri delle righe che l'anteprima dava per importabili o solo cliente). Dentro la transazione `lookup` e `planRows` si rifanno sulle righe bloccate: una riga attesa e ora scartata fa fallire l'import con `ImportRowRejected` (numero di riga e regola, nessun valore). Un cliente o una pratica diventati esistenti nel frattempo cambiano solo i numeri (AC23). L'esito atteso dice solo che cosa l'admin si aspetta: le regole le applica comunque il server (AC12) | Spec, gate |
| D11 | Riconoscimento dei clienti come oggi (OQ1): primo cliente per codice fiscale (se il cliente del CRM ce l'ha) o partita IVA, con `ORDER BY id` per renderlo stabile; aggiornati tutti i clienti con il codice cliente della riga, o il codice fiscale della riga o del primo, o la partita IVA della riga o del primo (§1). Ognuno riceve però solo i valori non vuoti della riga (AC35): oggi gli altri clienti ricevono anche i campi del primo. Cambio elencato nella PR E | Spec (OQ1, AC35), gate |
| D12 | Procedure su `adminSessionProcedure` (AC2). `import.lookup`, `upload` e `start` sono mutation, così chiavi e righe non finiscono in un URL. Nel client le chiamate `import.*` passano da un `httpLink` senza batch (`splitLink`), così i pezzi non si sommano in una richiesta, e `loggerLink` le esclude, così nulla finisce in console | Gate |
| D13 | `ImportQueue` ha tre layer: Cloud Tasks (API REST v2, token del metadata server, `oidcToken` con audience uguale all'URL del servizio, nessuna dipendenza nuova); in processo (`Effect.forkDaemon`, solo con `NODE_ENV` diverso da `production` e senza `K_SERVICE` né `VERCEL`); spento (`import.start` risponde "L'import non è disponibile su questo ambiente"). Senza configurazione il backend parte lo stesso, con la coda spenta: un deploy non si blocca per l'import | Piano, gate (secondo giro) |
| D14 | Le righe temporanee vivono al massimo un'ora: a ogni upload nuovo si mette in coda un task di pulizia con `scheduleTime` a +1 h, che le cancella se nessun import le sta usando; si cancellano anche a fine import (D9). Un upload accetta pezzi solo finché non c'è un import collegato; pulizia e avvio bloccano la riga dell'upload | Gate (secondo giro) |
| D15 | Avviso di fine import con polling di `import.active` ogni 3 s, solo per gli admin e solo con un import in corso; all'esito `router.refresh()` e invalidazione delle query client | Piano, gate |
| D16 | Report errori generato nel browser con `xlsx` dai valori del foglio come testo (non dalle celle di papaparse, che perdono gli zeri iniziali) | Spec (AC14, AC15), gate |
| D17 | Nessun backlog esterno: solo questo `PLAN.md` | Come seeder-locale ed export |
| D18 | Esecuzione: Opus per tutti i task tranne T3 e T15, che vanno a Haiku (puri, con l'esito fissato dai test) con il brief obbligatorio e la review di Opus | Regole del progetto |

## 5. Assunzioni e vincoli

- Nessuna domanda aperta nella spec (OQ1–OQ7 risolte il 2026-10-24); D1 deciso da Leonardo.
- La conferma è accettata quando `import.start` risponde, dopo l'invio delle righe (pochi secondi per 20.000 righe). Chiudere la scheda in quei secondi annulla l'import, che non è ancora partito: lo si dice nell'interfaccia ("Invio del file…").
- Gate di ogni PR: `next lint`, `tsc --noEmit`, `pnpm run test --run` (con `TEST_DATABASE_URL`), `pnpm build`.
- Migrazione solo additiva; dopo `pnpm db:generate` si toglie la riga `ALTER TABLE "mito-deutsche_customers" ALTER COLUMN "id" SET DEFAULT …`; prima di ogni merge si controlla la catena delle migrazioni (AGENTS.md).
- Dati personali: nessun valore delle righe nei log del server, nella console del browser, nello storico, nei motivi di fallimento. Le righe stanno solo in `import_upload`, dalla conferma alla fine dell'import, al massimo un'ora. I backup di Cloud SQL e il ripristino a un istante (PITR) possono contenerle per il loro periodo di conservazione, come contengono già clienti e pratiche.
- Ogni cambio di comportamento rispetto a oggi è elencato nella descrizione della PR che lo introduce.

## 6. Task

### T0: Limite della rewrite di Vercel

- **depends_on**: []
- **location**: nessun file; esito nella PR C
- **description**: su staging, `POST` di corpi da 2 MB e da 5 MB a `https://<frontend di staging>/api/trpc/import.upload` (procedura che non esiste ancora). Una risposta del backend (404 di tRPC) vuol dire che il corpo passa; un 413 di Vercel vuol dire che no. Se 2 MB non passano, la dimensione dei pezzi di D3 scende prima di T11. Se il container non raggiunge staging, la lancia la sessione sul Mac di Leonardo.
- **validation**: codici di risposta riportati nella PR C.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: un corpo da 2 MB arriva al backend di staging attraverso la rewrite (risposta 404 di tRPC, non 413).
- **review_mode**: cli
- **complexity**: low

### T1: Caratterizzazione della conversione di oggi

- **depends_on**: []
- **location**: `src/app/api/import/process/_test/characterization.test.ts` (nuovo; T4 lo sposta)
- **description**: test sul codice di oggi (`processFile` su workbook costruiti nel test con `XLSX.utils.aoa_to_sheet`), con l'orologio fissato e `process.env.TZ = "Europe/Rome"` (l'admin in Italia). Per Wave e Standard fissano i valori di cliente, pratica e ruolo per: rate pagate, rate residue, debito residuo; stato; codice prodotto; sede; nome e cognome; maiuscole; email; codice fiscale o partita IVA; importi in formato italiano; date (seriale Excel, `AAAAMMGG`, `M/G/AA`, illeggibile); nome del file (`MMAA_`, `-` → `_`); i difetti di OQ2 (Wave +1 mese, estinzione = oggi, illeggibile = oggi, seriale +1 giorno); la regola delle righe Wave solo cliente; la fusione nel file (stesso CF e codice cliente, ultimo valore non vuoto); un CAP con zeri iniziali (com'è oggi dopo papaparse).
- **validation**: test verdi sul codice di oggi; un caso per ogni voce di AC32 e di OQ2.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: una riga Wave con "Data Erogazione" 15/01/2024 e la data di oggi fissata dà la data di liquidazione salvata 15/02/2024 alla mezzanotte di Roma e le rate pagate calcolate da quella data.
- **review_mode**: cli
- **complexity**: medium

### T2: Caratterizzazione del riconoscimento dei clienti

- **depends_on**: []
- **location**: `src/app/api/import/update/_test/identity.db.test.ts` (nuovo)
- **description**: test su database di `handleCustomerUpdate` + `updateImportedCustomer`: cliente con codice fiscale riconosciuto per codice fiscale; cliente senza codice fiscale per partita IVA; un altro cliente con lo stesso codice cliente aggiornato anche lui; una riga senza partita IVA aggiorna anche i clienti con la partita IVA del primo cliente riconosciuto (§1); codice cliente mai cambiato; operatore e data di creazione invariati; `last_import_update` impostata. Fissa la regola che T8a, T8b e T9 devono rispettare (D11).
- **validation**: test verdi sul codice di oggi; ogni caso ha un gemello in T8a, T8b o T9 prima che T20 cancelli questo file.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: con A (CF X, P.IVA Y, codice 1) e B (P.IVA Y, codice 2) nel CRM, una riga con CF X, codice 1 e senza P.IVA aggiorna sia A sia B, e nessuno dei due cambia codice cliente.
- **review_mode**: cli
- **complexity**: medium

### T3: Tracciati e riconoscimento del formato

- **depends_on**: []
- **location**: `packages/domain/src/import/formats.ts` + `_test/`
- **description**: le liste di colonne di `src/app/api/import/_constants` si spostano qui (il vecchio file le riesporta). `detectFormat(headers)` → `{ format: "wave" | "standard" }`, oppure `{ error: "emptyHeaders" }` se la prima riga è vuota, oppure `{ error: "missingColumns", closest, missing: string[] }` con il formato che ha più colonne in comune (AC6). Lo Standard si riconosce dai nomi, non dal numero di colonne. Lo usa solo il codice nuovo: il vecchio import tiene il suo riconoscimento fino a T20.
- **validation**: test: tracciato Wave completo, Standard completo, Wave senza "Codice NDG" e "Data Erogazione" → `missing` in quest'ordine, prima riga vuota, colonne in più ignorate.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: un file Wave senza la colonna "Codice NDG" dà `missingColumns` con `closest: "wave"` e `missing: ["Codice NDG"]`.
- **review_mode**: cli
- **complexity**: low

### T4: Conversione di una riga nel dominio

- **depends_on**: [T1, T3]
- **location**: `packages/domain/src/import/convert/` (`wave.ts`, `standard.ts`, `values.ts`, `fileName.ts`), `packages/domain/src/utils/` (funzioni di D4), `packages/domain/package.json` (`spark-md5`), `src/lib/utils/index.ts` (riesporta), `src/lib/import/parseWorkbook.ts`; i test di T1 si spostano in `src/lib/import/_test/characterization.test.ts`
- **description**: sposta le funzioni di conversione e le loro dipendenze (D4) senza cambiarle, con `now` come argomento al posto di `new Date()` e senza `id`/`uniqueHash`. Le date diventano istanti calcolati sul fuso di Roma qualunque sia il fuso del processo (AC33). `parseWorkbook(buffer)` è la pipeline XLSX → CSV → papaparse di oggi, pura, usata dal worker di T14. I test di T1 passano su `parseWorkbook` + conversione del dominio, con le stesse asserzioni, due volte (`TZ` Roma e UTC). Il codice di oggi importa le funzioni spostate, così il vecchio import non cambia.
- **validation**: i test di T1 spostati, con le stesse asserzioni, verdi con `TZ=Europe/Rome` e `TZ=UTC`; i test di oggi (`_utils/_test`, `process/_test`) verdi; nessun import di `@/` in `packages/domain`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: con `TZ=UTC`, la stessa riga di T1 dà la stessa data di liquidazione (mezzanotte di Roma) e le stesse rate pagate.
- **review_mode**: cli
- **complexity**: medium

### T5: Classificazione delle righe e motivi

- **depends_on**: [T4]
- **location**: `packages/domain/src/import/classify.ts`, `messages.ts` + `_test/`
- **description**: `classifyRow(format, cells, now, fileName)` → `importable` (cliente, pratica, ruolo), `customerOnly` (cliente) o `discarded` (tutti i motivi). Dati obbligatori di AC9; regola solo cliente di oggi; AC10 con il suo testo; AC11 con lunghezze e tipi dagli schemi zod di `@mito/domain/schemas`, più i limiti delle colonne intere che drizzle-zod non mette (`smallint`, `integer`: es. "Età"), e un motivo che nomina la colonna del file (mappa campo → colonna per formato). Tutti i motivi in italiano (AC40). Una riga con il cliente non valido e la pratica valida è scartata (cambio già nella spec).
- **validation**: test: una riga per ogni dato obbligatorio mancante; CAP di 6 caratteri; "Età" non numerica e "Età" 70000; riga senza CF né P.IVA con la pratica valida; riga con due errori → due motivi (AC13); nessun motivo in inglese.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: una riga Standard valida ma senza codice fiscale né partita IVA è `discarded` con il motivo "Manca il codice fiscale o la partita IVA del cliente".
- **review_mode**: cli
- **complexity**: medium

### T6: Raggruppamento nel file e schemi dei corpi

- **depends_on**: [T5]
- **location**: `packages/domain/src/import/group.ts`, `payload.ts` + `_test/`
- **description**: dalle righe classificate: clienti per chiave (CF, o P.IVA senza CF) + codice cliente (AC38, regola di `mergeDuplicateCustomers`); pratiche per ID pratica; per ogni campo l'ultimo valore non vuoto; legami (chiave cliente, ID pratica, ruolo) senza doppioni; le chiavi da cercare nel CRM. `payload.ts`: schemi zod delle chiavi di `import.lookup`, del corpo compatto di D3 e dell'esito atteso di D10, condivisi da T11 e T14.
- **validation**: test: stesso CF e codice → un cliente; stesso CF e codici diversi → due clienti; stesso ID pratica su tre righe → una pratica con l'ultimo valore non vuoto; cliente con pratiche in punti diversi del file → un legame per pratica.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: tre righe con lo stesso CF e lo stesso codice cliente, la seconda con l'email vuota e la terza con un'email diversa, danno un cliente con l'email della terza.
- **review_mode**: cli
- **complexity**: medium

### T7: Tabelle dello storico e delle righe temporanee

- **depends_on**: []
- **location**: `packages/db/src/schema/importRun.ts`, `packages/db/src/schema/index.ts`, `packages/db/migrations/` (generata), `packages/db/src/schema/_test/importRun.db.test.ts`
- **description**: `mito-deutsche_import_run`: `id`, `started_at`, `claimed_at`, `finished_at`, `started_by` (FK a `users`), `file_name`, `format`, `status` (enum `running`, `completed`, `failed`, `interrupted`), `failure_reason`, `rows_total`, `rows_discarded`, `customers_created`, `customers_updated`, `practices_created`, `practices_updated`, `links_created`; indice unico parziale `WHERE status = 'running'` (D7); indice su `started_at desc`. Nessuna colonna per i dati delle righe (AC31). `mito-deutsche_import_upload`: `id` (uuid), `created_by`, `created_at`, `file_name`, `format`, `parts` (numero atteso), `run_id` (FK, nullable); `mito-deutsche_import_upload_part`: `upload_id` (FK con `on delete cascade`), `part`, `data` (bytea), PK (`upload_id`, `part`). `pnpm db:generate`, tolta la riga del default di `customers.id`.
- **validation**: la migrazione aggiunge soltanto; `pnpm db:migrate` sul database locale; test: due righe `running` → 23505; cancellare un upload cancella i suoi pezzi; journal e snapshot in catena.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: inserire una seconda riga con `status = 'running'` fallisce con 23505.
- **review_mode**: cli
- **complexity**: high

### T8a: Piano dato il CRM (`planRows`, puro)

- **depends_on**: [T2, T6]
- **location**: `packages/domain/src/import/plan.ts` + `_test/`
- **description**: `planRows(groups, existing)`, dove `existing` è quello che `import.lookup` restituisce (clienti con id, CF, P.IVA, codice cliente; pratiche esistenti; legami esistenti di quelle pratiche). Applica il riconoscimento di D11 e il conflitto di AC11b (codice cliente già nel CRM per un cliente nuovo; due clienti nuovi del file con lo stesso codice → scartate tutte le righe con quel codice). Restituisce i numeri di AC7 (clienti nuovi e da aggiornare contano i clienti distinti del CRM), le righe scartate con i motivi, le righe attese (D10) e le operazioni da fare.
- **validation**: test: numeri di AC7 su casi scritti a mano; importabili + solo cliente + scartate = righe (AC8); i due casi di AC11b; i casi di T2 sul riconoscimento, sullo stato del CRM che il test descrive.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: tre righe, una di un cliente esistente e due di un cliente nuovo con due pratiche nuove, danno `{ customersNew: 1, customersToUpdate: 1, practicesNew: 3, linksNew: 3 }`.
- **review_mode**: cli
- **complexity**: high

### T8b: Lettura del CRM e righe temporanee

- **depends_on**: [T7, T8a]
- **location**: `packages/server/src/services/import/lookup.ts`, `upload.ts`, `errors.ts`, `config.ts` + `_test/lookup.db.test.ts`, `_test/upload.db.test.ts`
- **description**: `lookupExisting(keys)`: a blocchi, i clienti che la regola di D11 può toccare (per CF, P.IVA e codice cliente del file, poi per CF e P.IVA dei primi clienti riconosciuti), le pratiche per ID e i legami di quelle pratiche; nessuna scrittura. `saveUploadPart` (rifiutata quando l'upload ha già un import collegato, D14), `loadUpload` (decompressione con i limiti di D3, schema di T6), `deleteUpload`.
- **validation**: test db: su un CRM con clienti, pratiche e legami, `lookupExisting` + `planRows` danno i numeri attesi e i casi di T2; clienti, pratiche, legami e `import_upload` invariati dopo il lookup; un pezzo dopo l'avvio → rifiutato; un corpo oltre i limiti → `ImportInputInvalid`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: con A (CF X, P.IVA Y) e B (P.IVA Y) nel CRM, il lookup delle chiavi di una riga con solo CF X restituisce sia A sia B.
- **review_mode**: cli
- **complexity**: high

### T9: Scrittura tutto o niente (servizio `applyImport`)

- **depends_on**: [T8b]
- **location**: `packages/server/src/services/import/apply.ts` + `_test/apply.db.test.ts`, `_test/apply.pg.test.ts`
- **description**: dentro `transaction`: lock di D5, `lookupExisting` + `planRows` rifatti e confrontati con l'esito atteso (D10), poi le scritture a blocchi: clienti nuovi senza operatore con `source` del formato (AC34), con `id` e `uniqueHash` di oggi; clienti esistenti secondo D11 e AC35 (valori non vuoti, `file_name`, `source`, `last_import_update`; mai codice cliente, operatore, chat, blacklist, `created_at`); pratiche (AC36); legami con `ON CONFLICT DO NOTHING`, ruolo esistente invariato (AC37). Un 23505 su `temp_id` durante l'inserimento diventa `ImportRowRejected` con la riga (AC19b). Nessun contatto né chat (AC39). Restituisce i numeri scritti (AC23). Scadenza di D8 tra i blocchi; retry su 40P01.
- **validation**: test db: un errore al secondo blocco (`src/test/failpoint.ts`) non lascia nulla (AC19); una riga attesa e in conflitto alla conferma (cliente con quel codice creato nel frattempo) → `ImportRowRejected` con il numero di riga e nulla scritto (AC19b); stesso file due volte → seconda volta zero nuovi (AC24); cliente esistente collegato a una pratica nuova e cliente con pratiche in punti diversi del file (AC37); campi mai toccati (AC35, AC36); contatti, task e chat invariati (AC39); numeri = anteprima (AC23); i gemelli dei casi di T2. Test pg con due connessioni (`holdCustomerLock`, `waitUntilBlocked`): un `UPDATE` di un operatore sul cliente aspetta e poi riesce (AC27).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: se la scrittura delle pratiche fallisce, i clienti nuovi del primo blocco non esistono e i clienti esistenti hanno i valori di prima.
- **review_mode**: cli
- **complexity**: high

### T9b: Writer di più pratiche nello stesso ordine

- **depends_on**: [T9]
- **location**: `packages/server/src/api/routers/pratiche/PUT/index.ts` (`bulkAssignPractices`), `packages/server/src/services/operator/deactivate.ts` (passo 5), `packages/server/src/effect/db.ts` (commento della regola) + `_test/`, `packages/server/src/services/import/_test/concurrency.pg.test.ts`
- **description**: `bulkAssignPractices` diventa un servizio Effect in `transaction` che blocca le pratiche con `ORDER BY pratica_id FOR UPDATE` prima dell'`UPDATE`, con retry su 40P01; la disattivazione blocca allo stesso modo le pratiche dell'operatore prima del passo 5. Il comportamento visibile non cambia. Il commento di `lockCustomer` e [[domains/crm/concepts/regola-dei-lock]] aggiungono "poi le pratiche, per `pratica_id`".
- **validation**: test esistenti di `bulkAssignPractices` e della disattivazione verdi con le stesse asserzioni; test pg: import e `bulkAssignPractices` sulle stesse pratiche in parallelo, import e disattivazione dell'operatore di quelle pratiche in parallelo, tutti riusciti senza 40P01 visibili (AC27); revisione di Leonardo (permessi e lock).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: con un import che tiene la pratica P2 e un `bulkAssignPractices` su P1 e P2 in parallelo, entrambi finiscono senza errori e P1 e P2 hanno l'operatore assegnato.
- **review_mode**: cli
- **complexity**: high

### T10a: Avvio ed esecuzione con la coda

- **depends_on**: [T9, T12a]
- **location**: `packages/server/src/services/import/run.ts`, `queue.ts` + `_test/run.db.test.ts`, `_test/run.pg.test.ts`; `apps/api/src/import/routes.ts`, `apps/api/src/app.ts`, `apps/api/src/cron/auth.ts` (la verifica OIDC diventa riusabile) + `apps/api/src/_test/`; `packages/env/src/index.js` (variabili della coda, facoltative)
- **description**: `startImport(uploadId, expected, admin)`: pulizia di D8, lock della riga dell'upload, riga `running` (23505 → `ImportAlreadyRunning` con nome e ora di Roma, AC22), task in coda con l'ID; se la coda rifiuta, la riga diventa `failed`, le righe si cancellano e l'errore torna all'admin. `executeImport(runId)`: prende la riga (`claimed_at`, D7), esegue `applyImport`, scrive `completed` nella stessa transazione e cancella le righe temporanee (D9); dopo un rollback scrive `failed` con un motivo leggibile senza valori (AC29, AC31) o `interrupted` alla scadenza (AC30). `ImportQueue` con i tre layer di D13. Rotta `POST /internal/import/run/:id`: token OIDC del service account della coda con audience uguale all'URL del servizio, poi `executeImport`; risponde 2xx anche quando l'import fallisce, così Cloud Tasks ripete solo se la consegna non è arrivata.
- **validation**: test db: `startImport` risponde prima della fine e l'esito arriva nello storico (layer in processo); scadenza di prova di 1 s (`ImportConfig`) → `interrupted` e niente scritto; il motivo di un fallimento non contiene il CF della riga; task consegnato due volte → la seconda non fa nulla; coda spenta → "L'import non è disponibile su questo ambiente". Test pg: due `startImport` in parallelo → una `ImportAlreadyRunning`; pulizia in parallelo a un import che sta scrivendo → l'import finisce `completed`. Test della rotta: token con l'audience dell'URL del servizio → esecuzione; senza token, con un altro service account o con l'audience dell'URL del task → 401, nessuna esecuzione. Test del layer: in prod o con `VERCEL` il layer in processo non si sceglie.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: con un import in corso, una seconda `startImport` fallisce con `ImportAlreadyRunning` che porta il nome dell'admin del primo e l'ora di inizio a Roma.
- **review_mode**: cli
- **complexity**: high

### T10b: Storico e pulizia delle righe temporanee

- **depends_on**: [T10a]
- **location**: `packages/server/src/services/import/history.ts` + `_test/history.db.test.ts`; `apps/api/src/import/routes.ts` (`POST /internal/import/purge/:uploadId`)
- **description**: `activeImport()` e `listImports(page)`: 20 per pagina, dal più recente, nome dell'admin, durata, numeri (AC28); una riga `running` scaduta si legge `interrupted`. Il primo pezzo di un upload mette in coda un task di pulizia con `scheduleTime` a +1 h (D14); la rotta cancella l'upload se nessun import lo sta usando, bloccando la riga con `SKIP LOCKED`. In processo il task è una fibra che aspetta un'ora.
- **validation**: test: ordine e pagine da 20; riga `running` di 31 minuti fa → `interrupted` e un nuovo avvio parte (AC30); al primo pezzo parte un task di pulizia a +1 h; il task cancella un upload abbandonato con i suoi pezzi e lascia quello di un import in corso.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: una riga `running` iniziata 31 minuti fa compare in `listImports` come `interrupted`.
- **review_mode**: cli
- **complexity**: medium

### T11: Procedure dell'import solo admin

- **depends_on**: [T10b]
- **location**: `packages/server/src/api/routers/import/` (router nuovo; le 4 procedure vecchie si tolgono in T20) + `_test/import.db.test.ts`
- **description**: `import.lookup`, `import.upload`, `import.start` (mutation) e `import.active`, `import.list` (query) su `adminSessionProcedure` (D12). Gli errori taggati diventano `TRPCError` in un punto solo (`ImportAlreadyRunning` → `CONFLICT` con il testo di AC22, `ImportInputInvalid` → `BAD_REQUEST`, `ImportUnavailable` → `PRECONDITION_FAILED`, `DbError` → `INTERNAL_SERVER_ERROR`). Un admin vede e usa solo i propri upload.
- **validation**: test: per ognuna delle 5, operatore → `FORBIDDEN` senza dati né scritture; utente non admin senza riga operatore → `FORBIDDEN`; senza sessione → `UNAUTHORIZED` (AC2, AC3); righe che violano AC9–AC11b mandate a mano a `start` → scartate e non scritte (AC12); corpo oltre i limiti → `BAD_REQUEST`. Revisione riga per riga di Opus e di Leonardo.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: un operatore non admin che chiama `import.lookup` riceve `FORBIDDEN`.
- **review_mode**: cli
- **complexity**: high

### T12a: Coda Cloud Tasks su staging

- **depends_on**: [T0]
- **location**: `apps/api/gcp/setup-import-queue.sh` (nuovo), `apps/api/gcp/deploy-staging.sh`
- **description**: lo script (idempotente, lanciato da Leonardo dal Mac) abilita l'API Cloud Tasks, crea la coda `mito-crm-staging-import` in `europe-west3` (3 tentativi con backoff, una consegna alla volta), il service account che firma i token dei task, e i permessi: il service account del backend mette task in coda e agisce come quel service account. `deploy-staging.sh` passa al backend coda, URL e service account. Senza queste variabili il backend parte con la coda spenta (D13), quindi la PR si può unire prima o dopo lo script senza bloccare i deploy.
- **validation**: `gcloud tasks queues describe` mostra 3 tentativi e una consegna alla volta; dopo il deploy `/health` risponde e il backend parte con la coda configurata.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: `gcloud tasks queues describe mito-crm-staging-import` riporta `maxAttempts: 3` e `maxConcurrentDispatches: 1`.
- **review_mode**: cli
- **complexity**: medium

### T12b: Memoria e prova su staging

- **depends_on**: [T12a, T13, T19, T20]
- **location**: `apps/api/gcp/deploy-staging.sh` (memoria, se serve); esito nella PR F
- **description**: se T13 ha misurato più di 400 MiB, memoria a 1 GiB. Poi, con F e G su `dev`: import di un file vero da 20.000 righe su staging, scheda chiusa subito dopo la conferma; esito "Completato" nello storico con i numeri dell'anteprima; secondo import dello stesso file con zero nuovi; un'anteprima abbandonata non lascia righe in `import_upload`.
- **validation**: storico, numeri e tabella `import_upload` vuota riportati nella PR.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: un import confermato e abbandonato chiudendo la scheda risulta "Completato" nello storico di staging.
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

### T13: Misure di AC25 e della memoria

- **depends_on**: [T11]
- **location**: `packages/server/src/services/import/_test/import.perf.pg.test.ts` (saltato senza `PERF=1`)
- **description**: sul database del seeder locale, un file Wave di 20.000 righe, metà esistenti e metà nuove, attraverso `import.upload`, `import.start` (layer in processo) ed `executeImport` fino all'esito; mediana di 3 corse dopo una di riscaldamento < 30 s (AC25). Misura il picco di memoria del processo e la dimensione del corpo compresso, che decidono T12b e la dimensione dei blocchi.
- **validation**: numeri riportati nella PR E.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: la mediana di 3 import da 20.000 righe è sotto 30 secondi.
- **review_mode**: cli
- **complexity**: medium

### T14: Lettura del file e anteprima nel worker

- **depends_on**: [T4, T8a, T11]
- **location**: `src/lib/import/read.worker.ts`, `src/lib/import/readImportFile.ts`, `src/lib/import/upload.ts`, `src/trpc/react.tsx` (`splitLink` e `loggerLink` per `import.*`) + `_test/`
- **description**: `readImportFile(file, signal)`: tipo ed estensione (`.xlsx`, `.xls`, `.csv`) e 15 MB controllati prima di leggere (AC5); poi un Web Worker modulo esegue `parseWorkbook` (T4), `detectFormat` (T3), classificazione e raggruppamento, e restituisce formato, intestazioni, righe del foglio come testo (per il report, D16), le chiavi da cercare e il corpo compresso di D3. `previewImport` chiama `import.lookup` e `planRows` (T8a). `signal` termina il worker (AC18). `uploadAndStart` manda i pezzi uno alla volta e poi `import.start` con l'esito atteso. Nessun `console.*`.
- **validation**: test: un `.pdf` → "Formato non supportato: carica un file Excel o CSV" senza leggere il file; 16 MB → "Il file supera i 15 MB"; le celle di un workbook di prova sono quelle di T1; un corpo da 5 MB parte in 3 richieste separate; una chiamata `import.*` fallita non scrive nulla in console. Nel browser: con 20.000 righe "Annulla" ferma la lettura entro 1 s.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: un file `.pdf` dà "Formato non supportato: carica un file Excel o CSV" e il worker non parte.
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

### T15: Report errori

- **depends_on**: [T5]
- **location**: `src/lib/import/errorReport.ts` + `_test/`
- **description**: `buildErrorReport(headers, sheetRows, discarded, fileName, today)` → workbook con un foglio: "Riga", "Errori" (motivi separati da "; "), poi tutte le colonne del file nello stesso ordine e con i valori come testo del foglio (AC14, D16); nome `errori_import_<nome senza estensione>_<AAAA-MM-GG>.xlsx`. Nessun upload (AC15).
- **validation**: test che rilegge il workbook con `xlsx`: intestazioni, numero di riga come in Excel, motivi uniti, colonne in più conservate, CAP "00185" uguale.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: con la riga 6 del file scartata per due motivi, la riga 2 del report ha "Riga" = 6 e "Errori" = "motivo 1; motivo 2".
- **review_mode**: cli
- **complexity**: low

### T16: Pagina "Import" e menu

- **depends_on**: [T11]
- **location**: `src/app/dashboard/import/page.tsx`, `src/app/_components/DashboardLayout.tsx`, `src/app/dashboard/page.tsx` + `_test/`
- **description**: pagina server che legge il ruolo con `api.user.getUserPreference` (la sessione non ha il ruolo; come `CallsSection.tsx`) e risponde `notFound()` a un non admin; voce "Import" nel menu solo per gli admin; il pulsante "Nuovo import" della dashboard, solo per gli admin, diventa un link alla pagina (AC1, AC28). `WorkerImportDialog` esce dalla dashboard (lo cancella T20).
- **validation**: test: con un operatore il menu non ha "Import", la dashboard non ha "Nuovo import" e la pagina risponde 404; con un admin il menu ha la voce e il pulsante porta a `/dashboard/import`.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: renderizzato per un operatore, il menu non contiene la voce "Import".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

### T17: Nuovo import: scelta, anteprima, conferma

- **depends_on**: [T14, T15, T16]
- **location**: `src/app/dashboard/import/_components/NewImport.tsx`, `ImportPreview.tsx` + `_test/`
- **description**: area di trascinamento e selettore (AC5), messaggi di AC6, anteprima con i numeri (AC7), "Nessuna riga da importare" senza conferma (AC16), download del report (AC14), "Annulla" senza chiamate al server (AC17), conferma con "Invio del file…" (§5) e il messaggio di AC22 se rifiutata, stato "In corso" quando `import.start` risponde. Testi in italiano (AC40). Tutto da tastiera; lettura, inizio, fine e fallimento annunciati con una regione `aria-live` (AC41).
- **validation**: test dei componenti (jsdom) per ogni stato; "Annulla" non chiama procedure di scrittura; nel browser: percorso completo con un file Wave e uno Standard, solo tastiera, annunci al lettore di schermo; misura di AC18 (20.000 righe, anteprima < 10 s in locale).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: con un'anteprima senza righe importabili né solo cliente compare "Nessuna riga da importare" e il pulsante di conferma non c'è.
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

### T18: Storico degli import

- **depends_on**: [T16]
- **location**: `src/app/dashboard/import/_components/ImportHistory.tsx` + `_test/`
- **description**: tabella da `import.list`, 20 per pagina, dal più recente: data e ora di Roma, admin, file, formato, stato ("In corso", "Completato", "Fallito", "Interrotto"), durata, numeri del riepilogo; motivo del fallimento leggibile (AC28, AC29, AC30).
- **validation**: test: le quattro etichette di stato; paginazione a 20; un fallito mostra il motivo.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: una riga `interrupted` dello storico compare con lo stato "Interrotto".
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

### T19: Avviso di fine import e liste aggiornate

- **depends_on**: [T17, T18]
- **location**: `src/app/_context/ImportStatus.tsx` (provider nel layout della dashboard, solo admin), `src/app/dashboard/layout.tsx` + `_test/`
- **description**: mentre `import.active` dice che un import di questo admin è in corso, polling ogni 3 s (D15). All'esito: avviso in qualunque pagina, in una regione `aria-live` (AC21, AC41); `router.refresh()` per Clienti, Pratiche e "Ultime Pratiche Aggiornate", e invalidazione di `customer.getAllFileName` (filtro "File") e `import.list` (AC26). Nessun polling per gli operatori né senza import in corso.
- **validation**: test: al passaggio da `running` a `completed` compare l'avviso, `router.refresh` è chiamato e le due query sono invalidate; con un operatore nessuna richiesta a `import.active`. Nel browser: import avviato, navigazione in Clienti, avviso e lista aggiornata senza ricaricare.
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: quando `import.active` passa da in corso a completato, compare l'avviso con l'esito e `router.refresh` viene chiamato.
- **review_mode**: mixed
- **assigned_skills**: agent-browser
- **complexity**: medium

### T20: Rimozione del vecchio import

- **depends_on**: [T17, T19]
- **location**: `src/app/api/import/**`; `src/lib/workers/import/**`; `src/app/dashboard/_components/WorkerImportDialog.tsx`; `src/app/_context/ImportWorker.tsx`, il provider in `src/app/dashboard/layout.tsx`, `useHandleImportWorkerStates` in `DashboardLayout.tsx` e i `vi.mock` in `src/app/_components/_test/DashboardLayout*.test.tsx`; `src/store/useImportStore.ts`; `src/app/api/export/importError/`; le rotte in `apps/api/src/rest.ts` (e i loro casi in `rest.db.test.ts`); le 4 procedure vecchie; `packages/server/src/shared/updateImportedCustomer.ts` se non ha altri usi; le riesportazioni di T3 e T4 rimaste senza chiamanti
- **description**: cancella file e import morti (AC4). Prima di cancellare: i test di T1 vivono già in `src/lib/import/_test/` (T4) e restano; ogni caso di T2 ha il gemello in T8a, T8b o T9. Restano `/api/export/download`, il cron `delete-export` e le procedure dello storage (Non-Goals della spec).
- **validation**: test: le 7 rotte rispondono 404 su Next.js e sul backend; le 4 procedure non esistono; i test di caratterizzazione di T1 e i gemelli di T2 verdi; nessun import (non testo) dei moduli cancellati; gate completi verdi. Un uso fuori da questa lista ferma il task (regola di stop).
- **status**: Planned
- **log**:
- **files edited/created**:
- **backlog_item_id**: —
- **backlog_item_url**: —
- **relation_mode**: body-links
- **tdd_target**: `POST /api/import/create/customers` sul backend risponde 404.
- **review_mode**: cli
- **complexity**: medium

## 7. Grafo e onde

| Onda | Task | Parte quando |
|---|---|---|
| 1 | T0, T1, T2, T3, T7 | subito (file diversi) |
| 2 | T4, T12a | T1 e T3; T0 |
| 3 | T5 | T4 |
| 4 | T6, T15 | T5 |
| 5 | T8a | T2, T6 |
| 6 | T8b | T7, T8a |
| 7 | T9 | T8b |
| 8 | T9b, T10a | T9 (T10a anche T12a) |
| 9 | T10b | T10a |
| 10 | T11 | T10b |
| 11 | T13, T14, T16 | T11 (T14 anche T4, T8a) |
| 12 | T17, T18 | T14, T15, T16 |
| 13 | T19 | T17, T18 |
| 14 | T20 | T17, T19 |
| 15 | T12b | T12a, T13, T19, T20, con F e G su `dev` |

## 8. Strategia di test

- **Caratterizzazione prima di tutto** (T1, T2): verdi sul codice di oggi, poi stesse asserzioni sul codice nuovo (T4, T8a, T8b, T9). Se trovano difetti oltre a quelli della spec, restano come sono e vanno in `brain/tech-debt/crm/`.
- **Dominio puro** (T3–T6, T8a): vitest unitari, con `TZ` Roma e UTC dove ci sono date.
- **Servizi, procedure e rotte** (T8b–T11): `*.db.test.ts` (PGlite) con `migrateUpTo`, factory di `src/test/factories.ts` e `createTestCaller`; sempre dalla procedura, dal servizio o dalla rotta, mai dagli interni di Effect.
- **Concorrenza** (T9, T9b, T10a): `*.pg.test.ts` con due connessioni (`src/test/pg.ts`).
- **Prestazioni** (T13, T17) e **staging** (T0, T12b): fuori dalla CI, numeri nella PR.
- **UI** (T14, T16–T19): componenti con jsdom, poi controllo nel browser con `agent-browser`.
- **Copertura dei criteri**: AC1 T16; AC2–AC3 T11; AC4 T20; AC5 T14; AC6 T3+T17; AC7 T8a+T8b+T17; AC8 T5+T8a; AC9–AC11 T5; AC11b T6+T8a; AC12 T11; AC13 T5+T15; AC14 T15+T17; AC15 T15+T20; AC16 T17; AC17 T17; AC18 T14+T17; AC19, AC19b T9; AC20 T10a+T12b; AC21 T19; AC22 T10a+T11+T17; AC23–AC24 T9; AC25 T13; AC26 T19; AC27 T9+T9b; AC28 T10b+T16+T18; AC29 T10a+T18; AC30 T10a+T10b+T18; AC31 T7+T10a; AC32–AC33 T1+T4; AC34 T9; AC35 T2+T9; AC36–AC37 T9; AC38 T6+T9; AC39 T9; AC40 T5+T17; AC41 T17+T19.

## 9. Rischi

| Rischio | Mitigazione |
|---|---|
| Cloud Run ferma l'istanza a metà import (deploy, riavvio) | La transazione si annulla; la riga passa a `interrupted` dopo 30 minuti (D8, AC30) e l'admin rifà l'import; le righe temporanee si cancellano col task di pulizia |
| Cloud Tasks non consegna o consegna due volte | 3 tentativi con backoff; `claimed_at` (D7) evita il doppio import; se nessuna consegna arriva, `interrupted` dopo 30 minuti |
| Token OIDC con l'audience sbagliata → task rifiutati | Audience fissata all'URL del servizio in `oidcToken` e testata in T10a |
| Il backend nuovo senza la coda configurata | Coda spenta, il backend parte e risponde a `/health` (D13); la PR E si unisce dopo D e lo script |
| Il corpo non passa la rewrite di Vercel | T0 prima della PR C; pezzi da 2 MB mandati uno alla volta e senza batch (D3, D12), più piccoli se serve, senza cambiare lo schema |
| 512 MiB non bastano per decomprimere e convertire 20.000 righe | T13 misura; memoria a 1 GiB in T12b |
| L'import occupa l'unica vCPU e rallenta gli altri sulla stessa istanza | Conversione a blocchi con `Effect.yieldNow`; le scritture aspettano il database, non la CPU |
| Deadlock con altri writer di più righe | Lock ordinati per tutti i writer di più pratiche (D5, D6), retry su 40P01, test pg (T9, T9b) |
| Anteprima nel browser e import sul server danno numeri diversi | Stesso codice (`planRows`, T8a) sui due lati; AC23 confronta i numeri in T9 |
| Le date cambiano spostando la conversione dal browser (Roma) al server (UTC) | T1 con `TZ=Europe/Rome`, T4 con Roma e UTC sulle stesse asserzioni (AC33) |
| La caratterizzazione trova difetti nuovi | Restano come oggi (AC32), annotati nel debito tecnico; correzioni in PR a parte |
| Righe con dati personali rimaste in `import_upload` | Cancellate a fine import e dal task di pulizia dopo un'ora (D14); restano nei backup di Cloud SQL per il loro periodo di conservazione (§5) |
| Un merge su `dev` finisce in prod con la prossima promozione | Promozione `dev` → `main` ferma fino al go/no-go, confermata da Leonardo prima del primo merge (§3) |

## 10. Domande aperte

- Prima del primo merge su `dev`: Leonardo conferma che `dev` → `main` resta ferma fino al go/no-go (§3). Non blocca l'inizio dei lavori.

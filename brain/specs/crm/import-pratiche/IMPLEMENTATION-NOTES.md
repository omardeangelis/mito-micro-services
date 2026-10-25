---
domain: crm
type: implementation-notes
links:
  - "[[specs/crm/import-pratiche/SPEC]]"
  - "[[specs/crm/import-pratiche/PLAN]]"
created: 2026-10-24
updated: 2026-10-25
---

# Implementation Notes

## Summary

- PR A (#77, `claude/import-caratterizzazione`, da `dev`): T1 e T2, test di caratterizzazione sul codice di oggi. Nessun cambio al codice.
- PR D (#82, `claude/import-coda`, da `dev`): T12a, `setup-import-queue.sh` e le variabili `IMPORT_*` nel deploy di staging. Lo script lo lancia Leonardo dal Mac.
- PR C (#81, `claude/import-storico-schema`, da `dev`): T7, tabelle `import_run`, `import_upload`, `import_upload_part` e la loro migrazione, solo additiva. Nessun codice le usa ancora.
- PR B (#78, `claude/import-dominio`, sopra la A): T3, T4, T5, T6, T8a. Tracciati, conversione, classificazione, raggruppamento e piano nel dominio, puri. L'import di oggi usa solo la conversione spostata; il resto lo chiamano le PR E ed F.
- PR E (#85, `claude/import-servizio`, sopra B + C): T8b, T9, T9b, T10a, T10b, T11, T13. Lettura del CRM, righe temporanee, scrittura tutto o niente, avvio ed esecuzione con la coda, storico, pulizia, procedure solo admin, rotte interne del backend con OIDC. Il vecchio import non cambia; le procedure nuove non hanno ancora una UI (PR F).
- PR F (#88, `claude/import-ui`, sopra la E): T14–T19. Lettura e anteprima in un Web Worker, report errori nel browser, invio a parti, pagina Import con storico, voce del menu e pulsante solo admin, avviso di fine in ogni pagina. Il pulsante della dashboard porta alla pagina nuova; il vecchio import resta solo nel codice fino alla PR G.
- PR G (#89, `claude/import-cleanup`, sopra la F): T20. Via le 7 rotte, il worker, la finestra, il contesto, lo store e le 4 procedure vecchie (chiude TD9 (k)). Si unisce insieme alla F.

## Execution Mode

- Mode: sequential
- Delegation: inline. Le regole del progetto (Opus Tech Lead) tengono su Opus architettura, migrazioni, permessi e requisiti; Haiku solo per T3 e T15 (D18). Budget di 5 sub-agent per richiesta.
- Escalations: nessuna.

## Deviations From the Plan

- T1: il piano chiedeva `process.env.TZ = "Europe/Rome"`. Con vitest 1.6 (pool `threads`) il fuso non cambia dentro un file, e `vitest.config.ts` fissa `TZ: "UTC"`. Le date sono verificate come mezzanotte locale (`new Date(2024, 1, 15)`), che nel browser è quella di Roma. T4 e T8a, con la conversione pura e `now` come argomento, verificano gli istanti di Roma espliciti (AC33).
- T1: ambiente `node` invece di jsdom, perché il `File` di jsdom 24 non ha `arrayBuffer()`. `processFile` non usa il DOM.
- T1: le date "come le salva Excel" sono celle numeriche con formato `m/d/yy`. Nel CSV di SheetJS diventano `1/15/24`, quindi il caso `M/G/AA` è quello delle celle data vere.
- T4: per fissare il fuso, `vitest.workspace.ts` ha due progetti in più, `utc` e `rome` (pool `forks`, `env.TZ`), che eseguono i file di `timeZoneTests` (`vitest.config.ts`); il progetto `unit` li esclude. I test di T1 sono divisi: valori della singola riga in `src/lib/import/_test/characterization.test.ts` (su `parseWorkbook` + dominio, istanti di Roma espliciti), comportamento di `processFile` (validazione, fusione, errori) in `process/_test` (12 test).
- T4: `spark-md5` non entra nel `package.json` di `@mito/domain`: `pnpm install` rimescolava voci estranee del lockfile. Il dominio usa le dipendenze della root, come già per zod e drizzle.
- T4: `romeWallClock` e `romeWallToInstant` vengono dal seed locale (`src/server/db/seeds/local/day.ts`), che ora li importa dal dominio.
- T4: `parseDateInput` non è più riesportata da `src/lib/utils` (nessun chiamante fuori dall'import). `DAYS_PER_RATE` in `src/app/api/_utils` resta riesportato senza chiamanti: lo toglie T20.
- T7: il test sta in `packages/db/src/_test/importRun.db.test.ts`, non in `schema/_test/`: drizzle-kit legge come schema ogni file sotto `packages/db/src/schema/*` e caricava il test (con vitest) a `db:generate`.
- T7: `bytea` con `customType` (drizzle-orm 0.45 non lo ha); `uuid` con `gen_random_uuid()`; `failure_reason` fino a 1.000 caratteri; i numeri di quello che l'import ha scritto restano null finché non è `completed`.
- T8a: `planRows(righe classificate, CRM)` invece di `planRows(gruppi, CRM)`: dopo AC11b il file si raggruppa di nuovo senza le righe scartate, così una pratica scritta anche da una di loro prende i valori solo dalle altre. Il worker chiama `groupRows` + `lookupKeys` per le chiavi, poi `planRows`.

- T8b: `lookupExisting` cerca con un parametro array per tipo di chiave (`= ANY($1)`) invece che a blocchi: un parametro per tipo regge 50.000 chiavi, e la query resta una per tipo.
- T9: clienti e pratiche nuovi si inseriscono con `ON CONFLICT DO NOTHING RETURNING`: la transazione non si rompe su un 23505 e la riga in conflitto si trova da `newRows`, che `planRows` ora restituisce (la riga dove ogni cliente e pratica nuovi compare per primo). Gli aggiornamenti usano `jsonb_to_recordset`, un parametro per blocco.
- T9b: "Assegna" della pagina Pratiche (`bulkAssignPractices`) è stato tolto da `dev` (#83) mentre la PR E era aperta, quindi il servizio `assignPractices` di T9b non c'è più. Resta la disattivazione, che blocca le pratiche per `pratica_id` prima del passo 5.
- T10a: le righe confermate stanno sull'upload (colonna `expected`, aggiunta alla migrazione della PR C prima del merge). `startImport` classifica le righe e rifiuta subito una riga attesa che non si può importare, invece di farlo solo nell'esecuzione: l'admin vede l'errore alla conferma (AC12).
- T10a: le variabili `IMPORT_QUEUE`, `IMPORT_OIDC_AUDIENCE`, `IMPORT_OIDC_SERVICE_ACCOUNT` si leggono con `Config` di Effect e non entrano nello schema di `@mito/env`, come `CRON_OIDC_*` e `GCS_BUCKET`: servono solo al backend e mancano su Vercel.
- T10a: la verifica OIDC dei cron è diventata `apps/api/src/oidc.ts`, usata da cron e import con il proprio service account e audience.
- T10b: `activeImport` dà l'ultimo import dell'admin, anche finito: l'avviso di fine (D15) deve leggere l'esito dopo la fine.
- T10b: la pulizia blocca l'upload con un `FOR UPDATE` semplice, non con `SKIP LOCKED`. Con `SKIP LOCKED` una pulizia che arriva mentre l'avvio tiene la riga la salterebbe senza sapere se l'import parte; così aspetta pochi millisecondi e poi vede l'import collegato.
- T13: la mediana era 24,2 s. Il profilo ha trovato tre costi nel dominio, corretti nella PR B dietro i test che c'erano: la ricerca dei clienti di `planRows` era quadratica (ora un indice, 0 differenze su 3.000 casi casuali contro la versione di prima); `Intl.formatToParts` era metà della classificazione (ora l'offset di Roma si chiede una volta per giorno UTC, 0 differenze su 293 cambi d'ora dal 1850 al 2100); uno schema zod per cella costava 1,3 s su un milione di celle (ora un ciclo nel `superRefine`, 0,1 s).
- T14: il messaggio per un file oltre le 50.000 righe è nell'anteprima ("Il file ha più di 50.000 righe"), come T6 lasciava da decidere. Un errore del worker si mostra senza il suo motivo, che potrebbe avere valori delle righe (AC31).
- T19: l'avviso è il toast, che Radix annuncia già in una regione live (AC41): una seconda regione lo farebbe leggere due volte. `router.refresh()` e il filtro "File" si aggiornano solo per un import completato, perché uno fallito o interrotto non ha scritto nulla; lo storico si aggiorna sempre.
- T19: la conferma passa il `runId` al provider (`watch`), così l'avviso arriva anche per un import che finisce prima della prima domanda di `import.active`.
- T20: fuori dall'elenco del piano, ma usati solo dal vecchio import: `src/app/api/export/utils/` (il report errori sul server, che senza `_types` non compilava), `src/lib/types/errors.ts` e `workers.ts`, il prefisso `/api/import` delle rewrite verso il backend. `splitArray` la usa anche "Assegna Clienti": passa in `src/lib/utils`. `src/middleware/auth.ts` ha ancora `/api/import/:path*` nel `matcher`, ma non è collegato a nessun `middleware.ts`: non toccato.

## Surprises and Decisions

Difetti in più rispetto alla spec, fissati dai test e non corretti:
- CAP: papaparse lo legge come numero, quindi `00184` diventa `184`. Riguarda tutti i CAP che iniziano con 0 (Lazio, Piemonte, Liguria…).
- Importi scritti come testo italiano: `1.234,50` diventa `1.23` e `1234,50` diventa `123450.00`. I numeri veri sono letti bene, anche con il separatore delle migliaia, perché SheetJS li scrive come `1,234.50`.
- Un codice fiscale in minuscolo è salvato come partita IVA.
- Il testo `15/01/2024` è letto come mese 15: in Wave diventa 01/03/2025, poi +1 mese; nello Standard la pratica sparisce.
- Standard con date AAAAMMGG o seriali: le rate partono dal 1970 (`new Date(numero)`), quindi risultano tutte pagate, con debito `0` e stato `Chiusa` se `SITUAZIONE` non è nota.
- Standard con data illeggibile: la pratica non diventa "oggi", come diceva la spec. Le rate pagate escono `NaN` e la pratica non passa la validazione: resta solo il cliente, senza errore. Spec corretta nelle Technical Notes. Con AC11 la riga è scartata con `"DATA_LIQUIDAZIONE" non è una data leggibile` (T5): un valore che il CRM non può salvare scarta la riga, anche col cliente valido.
- Una riga Wave senza "Garante" né "Cliente Coobbligato" è letta come Standard e finisce tra gli errori con sette motivi.
- Debito residuo a zero: Wave lo salva come `0.00`, Standard come `0`.
- Riconoscimento: il cliente aggiornato per errore (stessa P.IVA o stesso codice cliente) prende tutti i campi del primo, data di creazione compresa. Restano solo `id`, codice cliente, hash e operatore.
- Una riga con un CF che il CRM non ha va tra i nuovi anche se il suo codice cliente è già nel CRM: poi l'inserimento fallisce sul `temp_id` unico (difetto già nella spec).

Decisioni di T5–T8a:
- AC11: i limiti che drizzle-zod non mette (`smallint`, `integer`, importi `NaN` o `Infinity`) si leggono dal tipo delle colonne delle tabelle, così seguono lo schema. Un valore calcolato (rate pagate, debito residuo, importo erogato) non ripete il motivo del dato da cui viene; se nessuno di quei dati ha un motivo, il motivo dice che il valore non si può calcolare e da quali colonne.
- Standard con `IMPORTO_RATA` come testo (es. `1,234.50`, una cella con il separatore delle migliaia e un importo ≥ 1.000): il debito residuo esce `NaN` e oggi si salva così. Con la riscrittura la riga è scartata con "Non si può calcolare il debito residuo da …". La conversione resta com'è (AC32): difetto in [[tech-debt/crm/import-pratiche]].
- Una conversione che lancia (un numero in `DES_CLIENTE`, `DES_SUBAGENTE` o "Descrizione PdV", che la conversione tratta come testo) oggi ferma l'elaborazione; ora scarta la riga con "La riga ha un valore che l'import non sa leggere".
- Un codice fatto di spazi manca (AC9, AC10): oggi vale come valore.
- AC11b, "tutte le righe con quel codice cliente": le righe dei clienti nuovi con quel codice. Un cliente riconosciuto nel CRM con lo stesso codice tiene le sue righe, perché non crea nulla.
- D11: il legame di una riga va al primo cliente riconosciuto (oggi `processCTP` fa lo stesso). Il primo è il primo nell'ordine di `id` che dà `import.lookup`: `planRows` non riordina, perché l'ordine delle stringhe di Postgres e di JavaScript può differire.
- Limiti del corpo (T6): 50.000 righe (2,5 volte il file più grande, OQ4), 500 colonne, 32.767 caratteri per cella (il limite di Excel), chiavi fino a 255 caratteri. La spec non dice che messaggio dare a un file più lungo: oggi il server risponderebbe `BAD_REQUEST` alla conferma. Da decidere in T14 (un messaggio nell'anteprima).

Decisioni di T8b–T13:
- D11, AC35, cambio di comportamento voluto: i clienti aggiornati per P.IVA o codice cliente ricevono solo i valori non vuoti della riga, non più tutti i campi del primo cliente (creazione, chat, blacklist compresi, vedi sopra).
- Le righe che l'admin non ha confermato non si scrivono, anche se all'esecuzione sarebbero importabili: l'import scrive quello che l'anteprima ha mostrato (D10).
- Pratica esistente: `last_import_update` si sposta solo se cambiano le rate pagate (AC36), `updated_at` non si sposta, come oggi. Cliente aggiornato: si spostano tutti e due.
- Il motivo di un fallimento non ha valori delle righe (AC31): numero di riga e regola, o il codice di Postgres. Un difetto scrive nel log solo il suo tipo.
- L'import nuovo non scrive mai `operatorId`: TD9 (k) di [[chore/migrazione-effect]] si chiude quando T20 toglie `import.updateExistingPractices`.

## Sanity Checks

| Check | Result | Notes |
|------|--------|-------|
| Mutazioni su T1 | ok | Togliendo il +1 mese o leggendo il CAP come testo, 9 test falliscono |
| Mutazioni su T2 | ok | Togliendo la P.IVA dalla condizione di `updateImportedCustomer`, 2 test falliscono |
| Gate CI in locale | ok | `next lint`, `tsc --noEmit`, `pnpm run test --run`. La build la fa la CI (solo file di test) |
| Equivalenza di T4 | ok | I 50 test di T1 verdi a Roma dopo lo spostamento; il test del seed (`importRates`, oltre 1.000 casi contro `calculateDebitoResiduo`) verde; `romeLocalDate`, `addRomeMonth` e `romeParseDate` uguali al `Date` nativo di un processo a Roma su 800 giorni |
| Mutazioni su T5, T6, T8a | ok | Togliendo AC10, la soppressione dei motivi derivati, i limiti delle colonne, la regola solo cliente, la fusione dei valori non vuoti, il codice cliente nella chiave, il nuovo raggruppamento dopo AC11b o il salto dei legami esistenti, almeno un test fallisce |
| Gate CI in locale (PR C) | ok | `next lint`, `tsc --noEmit`, `pnpm run test --run` (3185 passati), progetto `pg` su Postgres 16 (94 passati, tutte le migrazioni), `pnpm build`, `pnpm api:build`, `db:check` |
| Mutazioni su T7 | ok | Senza l'indice unico parziale o senza il `cascade` nella migrazione, un test fallisce |
| Gate CI in locale (PR E) | ok | `next lint`, `tsc --noEmit`, `pnpm run test --run` (3782 passati, 111 saltati), progetto `pg` su Postgres 16 (108 passati), `pnpm api:build` e `pnpm api:smoke` (la rotta dell'import risponde 503 senza coda), `pnpm build` coi segnaposto di CI |
| Prestazioni (T13) | ok | Mediana 12,0 s su 20.000 righe (10,7, 12,0, 12,6), limite 30 s; corpo 0,33 MiB gzip |
| Equivalenza delle ottimizzazioni (T13) | ok | `planRows` con l'indice uguale alla versione di prima su 3.000 casi casuali; offset di Roma uguale a `Intl` su 400.000 istanti e attorno a 293 cambi d'ora; test del dominio verdi in UTC e a Roma |
| Gate CI in locale (PR F) | ok | `next lint`, `tsc --noEmit`, `pnpm run test --run` (3875 passati, 111 saltati), progetto `pg` (108 passati), `pnpm api:build` e `pnpm api:smoke`, `pnpm build` coi segnaposto di CI (il worker esce come chunk a parte) |
| Mutazioni su T17 e T19 | ok | Mostrando sempre il messaggio generico, non chiudendo il worker all'annullamento, chiedendo `import.active` anche per un operatore, chiedendolo dopo la fine, togliendo `router.refresh()` o l'attesa dell'import seguito, almeno un test fallisce |
| Gate CI in locale (PR G) | ok | `next lint`, `tsc --noEmit`, `pnpm run test --run` (3833 passati, 111 saltati), progetto `pg` (108 passati), `pnpm api:build` e `pnpm api:smoke`, `pnpm build` (nessuna rotta `/api/import/*` né `/api/export/importError`) |
| Gate CI in locale (PR B) | ok | `next lint`, `tsc --noEmit`, `pnpm run test --run` (3243 passati, 75 saltati), `pnpm build` coi segnaposto di CI, `pnpm api:build` |

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC32 | Caratterizzato, spostato | T1 copre ogni voce; T4 sposta la conversione nel dominio con gli stessi valori |
| AC33 | Nel dominio | Date di Roma in qualunque processo, test in UTC e a Roma |
| AC6 | Nel dominio | `detectFormat` (T3); il messaggio lo scrive la UI (T16) |
| AC7, AC8 | Nel dominio | `planRows` (T8a); l'anteprima arriva con T14 e T16 |
| AC9–AC11, AC13, AC40 | Nel dominio | `classifyRow` (T5) |
| AC11b | Nel dominio | `planRows` (T8a); il 23505 dentro l'import è di T9 |
| AC31 | Schema | `import_run` senza colonne per i dati delle righe (T7) |
| AC37, AC38 | Nel dominio | `groupRows` (T6), `planRows` (T8a); la scrittura è di T9 |
| AC2, AC3, AC12 | Sul server | Procedure su `adminSessionProcedure`, test per ognuna (T11) |
| AC19, AC19b, AC23, AC24, AC34–AC37, AC39 | Sul server | `applyImport` (T9) |
| AC20, AC22, AC29–AC31 | Sul server | `startImport`, `executeImport`, storico (T10a, T10b); la UI arriva con la PR F |
| AC25 | Misurato | 12,0 s di mediana (T13) |
| AC27 | Sul server | Lock ordinati, test pg con la disattivazione (T9, T9b) |
| AC28 | Server e UI | `listImports` (T10b), pagina, menu e pulsante (T16), storico (T18) |
| AC1, AC5–AC7, AC14–AC18, AC21, AC22, AC26, AC29, AC30, AC40, AC41 | UI, test dei componenti | PR F (T14–T19); il giro nel browser vero e la misura di AC18 sono di T12b |
| AC4 | Tolto | Le 7 rotte rispondono 404 sul backend e mancano dalla build di Next.js; il router `import` ha solo le 5 procedure nuove (T20) |
| OQ1 (riconoscimento) | Caratterizzato, nel dominio | T2 sul codice di oggi; i suoi casi hanno il gemello in `plan.test.ts` (chi si aggiorna). Quali valori riceve ogni cliente (AC35) è di T9 |

## Pre-existing Issues

- I difetti elencati sopra, tutti in produzione oggi: in [[tech-debt/crm/import-pratiche]], una PR per difetto dopo la riscrittura.

## Out of Scope Observations

- `handleCustomerUpdateV2` e `updateExistingCustomers` in `src/lib/workers/import/service/updateCustomer.ts` erano usati solo dalle 4 procedure senza chiamanti: tolti con T20.

## Remaining Work

- T0 (limite della rewrite di Vercel), prima di T11: serve il Chrome di Leonardo con Vercel aperto o una sessione sul Mac, perché il container non raggiunge staging.
- Leonardo lancia `sh apps/api/gcp/setup-import-queue.sh` dal Mac (T12a).
- T12b: memoria del backend. Il test di T13 ha visto 745 MiB di picco, ma è il processo di vitest intero: la misura vera è su staging.
- Il giro nel browser di T14–T19 con T12b, dopo il merge di F e G su `dev`.
- Prima del primo merge su `dev`: conferma di Leonardo che la promozione `dev` → `main` resta ferma fino al go/no-go (PLAN §10).

## Steering

| Date | Feedback | Changes |
|------|----------|---------|
| 2026-10-24 | Leonardo: ok al piano, si parte dalla PR A | — |
| 2026-10-25 | Leonardo: "vai continua", poi "possiamo proseguire" | PR C, D, E, F e G |

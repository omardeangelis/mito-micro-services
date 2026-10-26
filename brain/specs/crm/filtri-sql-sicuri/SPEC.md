---
domain: crm
type: spec
status: implemented
links:
  - "[[tech-debt/crm/search-by-explicit-map]]"
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[chore/crm/report-frontend-riorganizzazione]]"
  - "[[chore/migrazione-effect]]"
ingested: true
last_ingested: 2026-10-24
created: 2026-10-20
updated: 2026-10-24
---

# Spec: Filtri avanzati sicuri di Clienti e Pratiche

---

## User input

Task (sessione dedicata di review di sicurezza, 2026-10-20):

> Esegui la review di sicurezza dei filtri SQL di Clienti e Pratiche, partendo dallo scope già scritto in `brain/tech-debt/crm/search-by-explicit-map.md`. Il problema: le procedure `customer.getAllCustomers` e `pratiche.getAllPratiche` passano a `sql.raw` un `sqlFilter` libero (stringa del client), chiamabile da qualunque utente con una riga in `operators`. Primo passo, prima di scrivere codice: la prova di sfruttamento. Poi, nell'ordine delle skill del progetto: create-spec, create-plan, implement-spec con test rossi prima, e adversarial-review con review_impact critical e un passaggio di sicurezza. Direzione del fix da validare, non da dare per scontata: la pagina manda i filtri come dati (colonna da una mappa chiusa per tabella, operatore da un enum, valore convalidato per tipo), il server li traduce con gli operatori di Drizzle e `containsPattern`, niente `sql.raw`. Non implementare il fix senza che la SPEC sia approvata da Omar.

Decisioni confermate da Omar (2026-10-20):

> 1. **Formato URL** = "Dati strutturati, URL invariato": la pagina manda `{field, op, value}`; il server rivalida su allow-list di colonne/enum. Il param URL resta la tupla `name:op:value` (link salvati compatibili), ma il server la mappa e scarta il resto. Niente più `sql.raw`.
>
> 2. **Finestra rilascio** = "Backend smette subito, filtri off nella finestra": il backend ignora da subito `sqlFilter`/`sqlTaskFilter`; i filtri avanzati restano inattivi finché Vercel non aggiorna il frontend. Nessuno shim.
>
> 3. **Valori non validi** = "Scartati silenziosamente": colonna fuori mappa, operatore non ammesso o valore non convalidato per il tipo vengono ignorati; gli altri filtri validi si applicano.
>
> 4. **Split PR** = "Un'unica PR": Clienti + Pratiche insieme, `filters.ts` condiviso.

Sorgente dello scope e delle evidenze: [search-by-explicit-map.md](../../../tech-debt/crm/search-by-explicit-map.md) → "Scope della review di sicurezza dei filtri SQL".

---

## Context

I filtri avanzati delle liste **Clienti** e **Pratiche** sono composti come **stringa SQL nel browser** (`createSQLQuery` in `src/lib/utils/filters.ts`) e passati in chiaro attraverso tRPC come `sqlFilter` (e per Clienti anche `sqlTaskFilter`). Le procedure `customer.getAllCustomers` e `pratiche.getAllPratiche` lo eseguono con `sql.raw(input.sqlFilter)`, senza validarlo. Sono `operatorProcedure`: le può chiamare **qualunque utente autenticato con una riga attiva in `operators`**, e un chiamante diretto (una POST tRPC, non la pagina) manda il frammento SQL che vuole. La lista bianca di colonne che la pagina applica (quella di Clienti l'ha aggiunta PR6, T6.2) è lato client e **non difende la procedura**. (PR6 = la PR "Clienti semplificata" della [Sezione Contatti](../sezione-contatti/SPEC.md); T6.1/T6.2 sono i suoi task; AC60 è il suo criterio che fa scartare i parametri di filtro rimossi.)

Questa non è una validazione imperfetta: è **esecuzione di SQL arbitrario** da parte di qualsiasi operatore. L'app si connette al database con il ruolo **`postgres` di Supabase** (ruolo owner del progetto; su Cloud SQL diventerà `mito_app`), quindi l'iniezione gira con privilegi pieni di lettura e scrittura su **tutte** le tabelle: anagrafiche con PII dei clienti, utenti, task, pratiche, chat.

La vulnerabilità era già tracciata come debito ([report frontend §3.1](../../../chore/crm/report-frontend-riorganizzazione.md)) e la Sezione Contatti l'ha esplicitamente lasciata fuori dal proprio perimetro ([sezione-contatti SPEC](../sezione-contatti/SPEC.md), Non-Goal). Questa spec è la riforma dedicata che la chiude. Va in prod **nello stesso rilascio `dev`→`main` di PR5a, PR5b e PR6** della Sezione Contatti, mai prima (Omar, 2026-10-24): il fix è scritto sul codice dopo PR6, che è già in `dev`.

Chi è coinvolto:

- **Operatore** (`OPERATORE`) e **Amministratore** (`ADMIN`): usano i filtri avanzati delle liste. Dopo la riforma il comportamento per i filtri validi è invariato.
- **Chi attacca**: oggi, chiunque abbia credenziali da operatore (o faccia aprire un link preparato a un operatore). Dopo la riforma la procedura non esegue più input arbitrario.

---

## Non-Goals

- **Ridisegnare l'interfaccia dei filtri avanzati** (il popover `PopoverDateFilter`, le colonne offerte, gli operatori mostrati): il comportamento visibile dei filtri validi resta quello di oggi.
- **Cambiare le colonne filtrabili** di Clienti o Pratiche rispetto a quelle già previste dai `FILTER_MAP` attuali (vedi Technical Notes). La riforma rende sicura la traduzione, non amplia il set.
- **Rifattorizzare `getAllCustomers`/`getAllPratiche` oltre i filtri e il passaggio di `getAllPratiche` a Effect.** PR6 (T6.1) ha già riscritto `getAllCustomers` come programma Effect senza il join con `task`; questa spec non rifà quel lavoro. `getAllPratiche` passa a Effect in questa PR (decisione di Omar, 2026-10-24) a comportamento invariato (AC12): non si correggono ordinamenti, paginazione, `union` o la ricerca `search_by`/`q`, che già usano Drizzle e `containsPattern`.
- **Uno shim di traduzione** del vecchio `sqlFilter` durante la finestra di rilascio (decisione 2: il backend lo ignora e basta).
- **Gli altri rilievi del tech-debt** `search-by-explicit-map.md` (accessibilità, badge, `router.push` al montaggio, `console.log`): restano dove sono.
- **La ricerca testuale `q`/`search_by`**: già parametrica, fuori perimetro se non per il modello di `containsPattern` che il fix riusa.

---

> **Baseline.** Questi criteri valgono sul codice **dopo** PR6 della Sezione Contatti, che è in `dev` (verificato il 2026-10-24). PR6 (T6.1) ha tolto `sqlTaskFilter` dall'input, il join con `task` e la seconda query sulle task, e ha riscritto `getAllCustomers` come programma Effect; resta solo `sqlFilter` che arriva a `sql.raw`: in Clienti in un solo `where`, condiviso da pagina e `total`; in Pratiche nel `where` del `total` e dei due rami della `union`. I numeri di riga sono in Technical Notes, non nei criteri.

### Chiusura della vulnerabilità

- **AC1** — Dopo la riforma, in nessuna delle due procedure (`customer.getAllCustomers`, `pratiche.getAllPratiche`) resta un `sql.raw`, o un frammento SQL costruito per concatenazione da input del client, in **nessuna** delle loro query (principale, `total`, ed eventuale query sulle task se ancora presente); lo stesso vale per `src/lib/utils/filters.ts`.
- **AC2** — Una chiamata diretta alla procedura (via `createCaller` o POST tRPC) con un filtro che contiene una sottoquery `EXISTS (SELECT … FROM <altra tabella>)` lascia `total` **invariato** rispetto alla stessa chiamata senza quel filtro; un filtro `1=1) OR (1=1` lascia **invariato** il conteggio dei risultati filtrati. Il payload non viene eseguito. Vale sia per `customer.getAllCustomers` sia per `pratiche.getAllPratiche`. I payload dei test sono scelti in modo che sul codice di oggi cambino il risultato: per esempio `NOT EXISTS (SELECT 1 FROM "mito-deutsche_user")` e non `EXISTS`, che è sempre vera perché la riga del chiamante esiste, e `1=1) OR (1=1` insieme a una ricerca (PLAN, §11). (Il ritardo da `pg_sleep` resta come evidenza di sfruttamento, non come criterio: vedi Technical Notes.)
- **AC3** — La suite contiene un test di regressione che diventa **rosso** se si reintroduce `sql.raw` su input del client in una delle due procedure (verifica per mutazione).
- **AC4** — Un valore di filtro su colonna stringa con apice singolo (es. cognome `d'angelo`), `%` o `_` viene confrontato come **parametro letterale**: non chiude la stringa SQL e non agisce da jolly non voluto, come già fa `q` tramite `containsPattern`.
- **AC5** — **Ogni** valore di filtro raggiunge il SQL solo come **parametro legato** (bound parameter), per ogni operatore (`=`, `>`, `<`, `>=`, `<=`) e ogni tipo di colonna (stringa, numero, data, enum): nessun valore viene interpolato nel testo SQL, nemmeno dopo la convalida del tipo.

### Filtri tradotti come dati

- **AC6** — Per i filtri validi, le liste Clienti e Pratiche restituiscono **gli stessi risultati di oggi**: stesse colonne filtrabili, stessi operatori (su colonne stringa `=` resta la ricerca "contiene"; su enum `=` è uguaglianza esatta), stesso conteggio `total`.
- **AC7** — La colonna di un filtro è accettata solo se appartiene a una **mappa chiusa definita per tabella** (Clienti → colonne di `customers`; Pratiche → colonne di `practices`); l'operatore solo se appartiene all'**enum ammesso** per il tipo di quella colonna. La mappa contiene solo colonne presenti nella query attiva della tabella (così una colonna non più interrogata ricade in AC8, non produce SQL verso una tabella assente). Nome colonna e operatore non arrivano mai a un frammento SQL costruito per concatenazione.
- **AC8** — Una voce di filtro con colonna fuori mappa, operatore non ammesso o valore non convalidabile per il tipo (es. una data malformata) viene **scartata silenziosamente**: la procedura applica gli altri filtri validi, senza errore e senza eseguire la voce scartata.

### Compatibilità

- **AC9** — Il parametro URL `filter` mantiene la forma attuale (`nome:operatore:valore`, ripetibile). Un link salvato prima della riforma produce la **stessa lista** per i filtri ancora validi; le voci non più valide (es. filtri su colonne di `task` nella lista Clienti, che PR6 toglie dalla query) sono scartate (AC8), non danno più SQL non valido né errore.
- **AC10** — Dal rilascio del backend, `sqlFilter` non ha **nessun effetto** sul SQL eseguito, anche se un frontend Vercel non ancora aggiornato continua a inviarlo: su quel frontend i filtri avanzati semplicemente non si applicano finché non è aggiornato, e nessun payload viene eseguito. (`sqlTaskFilter` l'ha già tolto PR6, T6.1, e un test lo fissa.)

### Perimetro

- **AC11** — Clienti e Pratiche sono corrette nella **stessa PR**, e `src/lib/utils/filters.ts` condiviso non contiene più un costruttore di SQL grezzo dai filtri (nessun equivalente di `createSQLQuery`/`createSQLFilter`).
- **AC12** — `pratiche.getAllPratiche` diventa un programma Effect e, fuori dai filtri avanzati, restituisce per ogni input gli **stessi dati, lo stesso `total` e lo stesso ordine** di oggi (paginazione, ordinamento, ricerca, `filterBy`). I test di caratterizzazione scritti prima del passaggio restano verdi con le stesse asserzioni; un errore del database resta un `INTERNAL_SERVER_ERROR`.

---

## Constraints

- **Gate di CI invariati** (`.github/workflows/ci.yml`): lint (`next lint` + `tsc --noEmit`), test (`vitest --run`), build (`next build`). Il fix deve passarli tutti.
- **Niente Next.js in `packages/server/**`** e **nessun nuovo `sql.raw` su input**: il codice server gira sia nell'app Next.js sia nel backend Cloud Run (regola `AGENTS.md`).
- **Effect (D9).** Il codice server toccato si muove su Effect dove ha senso (errori tipizzati, `query`/`runTrpc`), coerente con la riscrittura di `getAllCustomers` in PR6 (T6.1). `getAllPratiche` passa a Effect in questa PR (AC12). Non allargare il diff a file non toccati.
- **Drizzle è il layer DB**: i filtri si traducono con gli operatori di Drizzle (`eq`, `gt`, `lt`, `gte`, `lte`, `ilike` con `containsPattern`); nessun pacchetto `@effect/sql*`.
- **Test attraverso l'interfaccia pubblica**: i test chiamano le procedure `customer.getAllCustomers` e `pratiche.getAllPratiche`, non gli interni.
- **Finestra di rilascio Vercel↔Cloud Run**: il backend rilascia separatamente dal frontend; AC10 copre la finestra in cui sono disallineati.
- **Vincolo di processo**: non implementare prima che Omar abbia approvato questa SPEC e deciso la data.

---

## Technical Notes

- **Prova di sfruttamento eseguita** (2026-10-20, Postgres 16 locale usa-e-getta, via `createTestCaller` come operatore autenticato; mai su staging/prod). 4/4: [A] `pg_sleep` iniettato ritarda `getAllCustomers` (~15 ms → ~811 ms); [D] stessa cosa su `getAllPratiche` (~12 ms → ~1210 ms); [B] sottoquery `EXISTS` su `mito-deutsche_user` fa variare `total` 0→1 (esfiltrazione blind); [C] `1=1) OR (1=1` annulla la ricerca. Dettagli e numeri in [search-by-explicit-map.md](../../../tech-debt/crm/search-by-explicit-map.md).
- **Modelli già nel repo per il fix**: `customerSearchColumns` e `praticaSearchColumns` (mappa colonna→`PgColumn`), `containsPattern` (`packages/server/src/api/routers/utils/index.ts`), e `packages/server/src/services/contact/getContacts.ts` (programma Effect con `runTrpc`).
- **Colonne oggi filtrabili** (`CUSTOMER_FILTER_MAP` e `PRATICA_FILTER_MAP` in `src/app/dashboard/customers/_constants/index.ts`, dopo PR6): Clienti → `birthdayDate`, `age`, `source`, `comune`, `sede`, `phoneNumber`, `ambitoLavorativo`, `occupazione` (di `customers`). `state` e `closedAt` di `task` li ha tolti PR6 (T6.2): un link salvato che li ha li perde già nella pagina, e dopo la riforma li scarta il server (AC8). Pratiche → `dataLiquidazione`, `debitoResiduo`, `importoFinanziato`, `ratePagate`, `state`, `importoErogato`, `importoRichiesto`, `rateTotali`, `region`, `importoRata` (di `practices`).
- **Posizioni `sql.raw` su `dev` dopo PR6** (2026-10-24, `594ff64`), in `packages/server/src/api/routers/`: `customer/GET/index.ts:354` (il `where` di pagina e `total`) e `pratiche/GET/index.ts:85` (`filterQuery`, usato da `total` e dai due rami della `union`). I criteri restano in forma semantica, non per numero di riga.
- **Test che oggi usano `sqlFilter` come comportamento atteso**, da riscrivere con i filtri strutturati: `customer/_test/getAllCustomers.db.test.ts` ("il totale conta i clienti…" usa `temp_id like 'c-1%'`; "un sqlFilter su una colonna di customers filtra come prima") e `src/app/dashboard/customers/_components/_test/CustomerTableSection.test.ts` (`savedSqlFilter`). `getAllPratiche` riceve già anche `filter` (le tuple grezze dell'URL), che il server non usa.
- **`=` sui decimali oggi è un errore** (verifica del PLAN, 2026-10-24): `createSQLFilter` tratta come testo le colonne `numeric` di Pratiche, perché in drizzle 0.45.4 hanno `dataType "string"`, quindi `importo_rata:eq:200` diventa `ilike` su un `numeric` e Postgres lo rifiuta, anche se il popover offre `=`. Per AC6 non c'è un risultato di oggi da conservare: diventa uguaglianza esatta (D16, confermata da Omar con l'approvazione di questa SPEC, 2026-10-24). Le altre differenze volute rispetto a oggi sono nel PLAN, §13.
- **Fuso orario**: i database veri sono in `Europe/Rome`, i test in UTC. Una data del filtro (`aaaa-mm-gg`) si converte nel fuso della sessione, come il letterale di oggi.
- **Dove interviene il fix**: pagine `CustomerTableSection.tsx` e `pratiche/page.tsx` (costruzione del filtro), `PopoverFilter.tsx` (scrive e rilegge `filter=`), input Zod e `where` di `packages/server/src/api/routers/customer/GET/index.ts` e `pratiche/GET/index.ts`, e `src/lib/utils/filters.ts` condiviso.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | I log Postgres di Supabase mostrano un uso passato di questa via di iniezione? (Non ispezionabile da sessione; da controllare nel pannello Supabase.) | Risposta all'incidente, non il fix | Omar / infra | Closed (2026-10-24): nessuna traccia. `pg_stat_statements` di prod, azzerato l'ultima volta il 2024-06-13, ha 2317 forme di query su clienti e pratiche: tutti i filtri grezzi dell'app hanno la forma legittima `colonna operatore $n`, su colonne delle mappe, e non c'è nessuna funzione di sistema, catalogo, commento o `;`. Sentry non ha errori SQL in 90 giorni. Limiti nel [[tech-debt/crm/search-by-explicit-map]] |
| 2 | Si tiene esattamente l'insieme di colonne filtrabili di oggi, o si coglie l'occasione per togliere quelle di `task` dalla mappa di Clienti già in questa riforma (dato che PR6 le rimuove dalla query)? | AC7, AC8 | Omar | Closed (2026-10-24): le ha già tolte PR6 (T6.2), la mappa di Clienti ha solo le 8 colonne di `customers` |
| 3 | Data dell'intervento (dopo il rilascio in prod di PR5a/PR5b/PR6). | Scheduling | Omar | Closed (2026-10-24): nello stesso rilascio `dev`→`main` di PR5a, PR5b e PR6, mai prima. La data è quella del rilascio |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Filtri strutturati `{field, op, value}` validati lato server; param URL invariato | Il server smette di fidarsi di stringhe SQL del client; i link salvati continuano a funzionare perché il server rimappa la tupla `name:op:value` su allow-list (Omar, 2026-10-20). |
| Backend ignora subito `sqlFilter`/`sqlTaskFilter`, niente shim | Chiude la falla dal primo rilascio del backend; il costo è una finestra breve in cui i filtri avanzati non si applicano sul frontend non ancora aggiornato (Omar, 2026-10-20). |
| Voci non valide scartate silenziosamente | Robusto ai link salvati stantii (coerente con AC60 di PR6); un vecchio link resta una lista, non diventa una pagina in errore (Omar, 2026-10-20). |
| Clienti + Pratiche in un'unica PR | `filters.ts` è condiviso e la falla è identica: separarle lascerebbe Pratiche sfruttabile più a lungo e richiederebbe un doppio refactor del codice condiviso (Omar, 2026-10-20). |
| Severità alzata rispetto allo scope iniziale | La prova mostra esecuzione arbitraria con il ruolo DB owner (`postgres`), non un filtro malformato: raggio d'azione = intero database (2026-10-20). |
| Ci si ferma alla SPEC; `create-plan` (PLAN.md) è rimandato a dopo l'implementazione di PR6 | La baseline del fix è il codice post-PR6: pianificare prima significherebbe pianificare su righe e forma della query che PR6 cambia. La SPEC resta `draft` in attesa dell'approvazione di Omar e della data (Omar, 2026-10-20). |
| OQ2 chiusa da PR6 | T6.2 ha già tolto `state` e `closedAt` di `task` dalla mappa di Clienti: la riforma tiene le 8 colonne di `customers` che restano (2026-10-24). |
| In prod nello stesso rilascio di PR6, mai prima | Il "dopo" serviva a scrivere il fix sul codice post-PR6, che ora è in `dev`. Ogni rilascio in più lascia l'iniezione aperta in prod (Omar, 2026-10-24). |
| `getAllPratiche` su Effect in questa PR | Scelta di Omar contro la raccomandazione di lasciarla al passo 4 di [[chore/migrazione-effect]]: il router si tocca comunque. Comportamento invariato fuori dai filtri, provato da test di caratterizzazione scritti prima (AC12) (2026-10-24). |
| SPEC approvata, `=` esatto sui decimali (D16) | Il popover offre `=` sulle 5 colonne di importi e oggi va in errore; con l'uguaglianza esatta l'operatore che la UI mostra funziona. Nessun secondo giro del verifier sul PLAN: ogni test di sicurezza va provato rosso su `594ff64` (T3, T6) e alla fine ci sono la review critical e quella di Leo (Omar, 2026-10-24). |
| Tutta la migrazione va in prod insieme | Il piano di migrazione si fa tutto su `dev` e va in prod in un rilascio unico: non c'è un caso "PR6 pronta e questa PR no" da decidere (Omar, 2026-10-24). |
| Deployment vecchi di Vercel: Protezione Standard | Se in G3 gli URL generati dei deployment di prod precedenti al fix sono raggiungibili, si attiva Vercel Authentication con Standard Protection sul progetto di prod, invece di cancellarli: i deployment restano, ma nessun rollback a prima di questa PR (Omar, 2026-10-24). |
| OQ1 chiusa | Controllo di sola lettura su `pg_stat_statements` di prod e su Sentry, autorizzato da Omar: nessuna traccia di uso della falla (2026-10-24). |
| PLAN scritto il 2026-10-24 | La baseline post-PR6 è in `dev` (`594ff64`); la SPEC è stata aggiornata a quella baseline (percorsi in `packages/server`, posizioni di `sql.raw`, OQ2). |

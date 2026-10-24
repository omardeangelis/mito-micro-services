---
domain: crm
type: tech-debt
links:
  - "[[review/search-by-explicit-map/REPORT]]"
  - "[[specs/crm/sezione-contatti/PLAN]]"
  - "[[specs/crm/filtri-sql-sicuri/SPEC]]"
created: 2026-10-15
updated: 2026-10-24
---

# Tech debt: ricerca `search_by` di Clienti e Pratiche

## [2026-10-15] From review [[review/search-by-explicit-map/REPORT]]

Tutto preesistente: la review del cambio `search_by` l'ha trovato, ma non l'ha introdotto. Il cambio è uscito con verdetto SHIP. Il proprietario di prodotto ha chiesto di segnare come debito tecnico anche i punti che il report non marca come durevoli: il `console.log`.

### Sicurezza: filtri tradotti in SQL grezzo

- **[FOLLOW-UP, sicurezza]** `input.sqlFilter` arriva a `sql.raw` — `src/server/api/routers/customer/GET/index.ts:354` (dopo T6.1 di PR6 è scritto una volta sola, nel `where` condiviso da pagina e conteggio; prima erano due righe, 338 e 445), `src/server/api/routers/pratiche/GET/index.ts:85`. Lo stesso valeva per `input.sqlTaskFilter` (`customer/GET/index.ts:371`), che T6.1 ha tolto dall'input: in prod sparisce con il rilascio di PR6.
  - Perché resta: la stringa SQL la costruisce la pagina (`createSQLQuery`) e la manda come input della procedura tRPC. Il server la esegue senza validarla. Chiunque possa chiamare la procedura può quindi mandare un frammento SQL qualsiasi.
  - Fix o prova che serve: una review di sicurezza dedicata. Probabile fix: la pagina manda i filtri come dati, cioè nome della colonna da una mappa chiusa, operatore da un enum e valore. Il server li traduce con gli operatori di Drizzle e i parametri, come fa già `search_by` con `customerSearchColumns`.
- **[FOLLOW-UP, sicurezza]** `createSQLQuery` costruisce `ilike '%${filter.value}%'` senza escape — `src/lib/utils/filters.ts:65`.
  - Perché resta: il valore del filtro, che viene dall'URL, finisce dentro un letterale SQL. Un apice chiude la stringa. `%` e `_` funzionano da caratteri jolly.
  - Fix o prova che serve: va nella stessa review. Dopo il fix il valore deve passare come parametro, con `containsPattern` (`src/server/api/routers/utils/index.ts`) come per `q`.

### Scope della review di sicurezza dei filtri SQL

> **[2026-10-20]** Scope confermato dalla prova di sfruttamento (sotto). Questa
> review è la sessione dedicata che le due voci `[FOLLOW-UP, sicurezza]` sopra
> rimandavano. Esce **dopo** il rilascio in prod di PR5a, PR5b e PR6 della
> Sezione Contatti: PR6 (T6.1 toglie `sqlTaskFilter` dall'input, T6.2 mette una
> lista bianca dei nomi di colonna **nella pagina** di Clienti) non protegge la
> procedura, che continua a fare `sql.raw` di una stringa del client.

**Il problema, in una riga.** `customer.getAllCustomers` e
`pratiche.getAllPratiche` passano a `sql.raw` un `sqlFilter` (e
`customer`: anche `sqlTaskFilter`) che è una stringa SQL del client, senza
validarla. Sono `operatorProcedure`: le può chiamare qualunque utente con una
riga attiva in `operators`. La lista bianca di colonne che la pagina applica
(`createSQLQuery`, e in PR6 T6.2) è lato client e **non difende la procedura**:
un chiamante diretto (createCaller in test, o una POST tRPC autenticata) manda
il `sqlFilter` che vuole.

**Righe attuali (riscansione 2026-10-20, i numeri della voce del 2026-10-15 si
erano spostati):**

- `src/server/api/routers/customer/GET/index.ts:338` e `:445` — `sql.raw` di `sqlFilter` (query principale e query di `total`).
- `src/server/api/routers/customer/GET/index.ts:371` — `sql.raw` di `sqlTaskFilter` (seconda query sulle task).
- `src/server/api/routers/pratiche/GET/index.ts:85` — `sql.raw` di `sqlFilter`.
- Le righe `:252` e `:342` di `customer/GET` sono le stesse chiamate ma **commentate**.
- Costruzione della stringa senza escape: `src/lib/utils/filters.ts` (`createSQLFilter`/`createSQLQuery`, ~righe 56–88): `` `${filter.name} ${symbol} '${filter.value}'` ``. Il nome colonna si interpola comunque; per la query principale di Clienti `createSQLQuery` è chiamata **senza** `selectedTable`, quindi non filtra nemmeno i nomi fuori mappa.

**Prova di sfruttamento (eseguita, non teorica).** Postgres 16 locale usa-e-getta,
via `createTestCaller` (router vero, middleware incluse) come `operatorProcedure`
autenticato. Mai su staging o produzione. Esito 4/4:

- **[A] Esecuzione arbitraria** — `customer.getAllCustomers` con `sqlFilter = "pg_sleep(0.4) IS NOT NULL"`: la query passa da ~15 ms a ~811 ms (il filtro gira due volte: query principale + `total`).
- **[D] Stessa falla su Pratiche** — `pratiche.getAllPratiche`, stesso payload: da ~12 ms a ~1210 ms.
- **[B] Lettura cross-tabella (blind)** — `sqlFilter` con `EXISTS (SELECT 1 FROM "mito-deutsche_user" WHERE role = 'ADMIN')`: `total = 0` senza admin, `total = 1` dopo averne inserito uno. Il result set dipende da un'altra tabella ⇒ esfiltrazione blind di qualsiasi tabella del DB.
- **[C] Bypass dei filtri** — `sqlFilter = "1=1) OR (1=1"` chiude la parentesi del `WHERE` e annulla la ricerca (una `q` che da sola dà 0 righe passa a >0).

**Raggio d'azione (alza la severità).** L'app si connette al DB con il ruolo
**`postgres` di Supabase** (ruolo owner del progetto — `brain/chore/migrazione-gcp.md:153`;
su Cloud SQL diventerà `mito_app`, `:143`). L'SQL iniettato gira quindi con i
privilegi pieni dell'app sull'intero database: lettura e scrittura di **tutte**
le tabelle (anagrafiche con PII dei clienti, utenti, task, pratiche, chat), non
solo delle due liste. Non è un filtro "sbagliato": è esecuzione di SQL arbitrario
da parte di qualunque operatore autenticato.

**Da verificare fuori dal repo (non accessibile da qui):** se i log Postgres di
Supabase mostrano un uso passato di questa via. Da controllare da Omar/infra nel
pannello Supabase; plausibilmente poco concludente se `log_statement` non logga
le query dell'app. (Nota di contorno: il "chiamante mattutino sconosciuto dei
cron di prod" in `PLAN.md` è un'altra cosa, non riguarda `sqlFilter`.)

**Direzione del fix (da validare in SPEC, non da dare per scontata).** La pagina
manda i filtri come **dati** — colonna da una mappa chiusa per tabella, operatore
da un enum, valore convalidato per tipo — e il server li traduce con gli
operatori di Drizzle (`eq/gt/lt/gte/lte`) e `containsPattern` per l'`ilike`.
`createSQLQuery` e i tre `sql.raw` spariscono. Modelli già nel repo:
`customerSearchColumns` con `containsPattern`, `praticaSearchColumns`, e
`src/server/services/contact/getContacts.ts` (D9, programma Effect con `runTrpc`).

**Decisioni da prendere in SPEC (per Omar):**

1. **Formato sul filo.** Array tipizzato `{field, op, value}[]` validato con Zod lato server (allow-list di colonne per tabella, enum di operatori), al posto della stringa `name:op:value` di oggi. Da decidere se tenere il param URL `filter` (retro-compatibilità dei link salvati) e tradurlo, o cambiarlo.
2. **Compatibilità fra rilasci.** Vercel (frontend) e Cloud Run (backend) rilasciano separatamente: la procedura deve accettare per una finestra sia il vecchio input (ignorandolo/rifiutandolo in sicurezza) sia il nuovo, finché le due parti non sono entrambe aggiornate. Decidere la strategia (nuovo campo input affiancato al vecchio, poi rimozione).
3. **Valori non validi.** Cosa fa il server con una colonna fuori mappa, un operatore non ammesso o un valore che non convalida per il tipo: errore `BAD_REQUEST` vs. filtro ignorato. (Oggi un link salvato con colonne di `task`, dopo PR6, darebbe SQL non valido — finding 7 del PLAN, AC60.)
4. **Pratiche nella stessa PR o separata.** Il fix tocca sia Clienti sia Pratiche (più `filters.ts` condiviso): decidere se un'unica PR o due. È il motivo per cui non è entrato in PR6.

**Vincolo di processo.** Non implementare il fix prima che Omar abbia approvato la
SPEC e deciso la data. Flusso: `create-spec` → `create-plan` → `implement-spec`
(test rossi prima: chiamate dirette alla procedura, e verifica per mutazione che
rimettere `sql.raw` renda rosso un test) → `adversarial-review` con
`review_impact` critical e un passaggio di sicurezza.

### Accessibilità

Rilievi di v8. La review non li ha misurati in un browser: va fatto quando si correggono.

- **[FOLLOW-UP, a11y]** Il trigger del selettore "Cerca per" non ha un nome accessibile esplicito — `src/app/dashboard/customers/_components/TableFilterSections.tsx:194`.
  - Perché resta: è fuori dal perimetro del cambio, che non ha toccato il markup del selettore.
  - Fix o prova che serve: un `aria-label` ("Cerca per") sul `SelectTrigger`, poi un controllo con lo screen reader.
- **[FOLLOW-UP, a11y]** Il badge della ricerca si chiude solo col mouse. È un `div` con `onClick` e la X non ha nome — `TableFilterSections.tsx:318`, `src/app/dashboard/pratiche/_components/TableFilterSection.tsx:160`.
  - Perché resta: è fuori dal perimetro del cambio.
  - Fix o prova che serve: un `button` con un nome, per esempio "Togli ricerca", raggiungibile da tastiera.
- **[FOLLOW-UP, a11y]** Altri rilievi dello stesso passaggio:
  - i toggle hanno `aria-label` "Toggle bold" e "Toggle italic";
  - la riga dei filtri può uscire dallo schermo sotto i ~460 px.
  - Fix o prova che serve: misurarli nel browser.

### Piccoli

- **[MINOR]** Se si clicca il badge mentre la navigazione non è ancora arrivata, il campo si svuota subito. Badge e URL restano sulla ricerca precedente finché il push non arriva — `TableFilterSections.tsx:102` (`resetSearchParams`).
  - Perché resta: c'era già prima, e la finestra in cui succede è breve.
  - Fix o prova che serve: svuotare il campo quando l'URL cambia, non al click, e scrivere un test con il push in attesa (`holdPush` in `TableFilterSections.test.tsx`).
- **[NIT]** `console.log(filterableColumns)` nel filtro di Pratiche — `src/app/dashboard/pratiche/_components/TableFilterSection.tsx:81`.
  - Perché resta: c'era già prima, ed è fuori dal perimetro del cambio.
  - Fix o prova che serve: toglierlo.
- **[FOLLOW-UP]** Le tabelle fanno `router.push` al montaggio per scrivere l'ordinamento nell'URL, quindi ogni visita aggiunge una voce alla cronologia — `src/app/dashboard/customers/_components/CustomersTable.tsx:171`, `src/app/dashboard/pratiche/_components/PraticesTable.tsx:129`.
  - Perché resta: c'era già prima, ed è fuori dal perimetro del cambio.
  - Fix o prova che serve: `router.replace` al montaggio, poi un controllo nel browser che Indietro torni alla pagina precedente con un solo passo.

## [2026-10-20] Scope della review di sicurezza dei filtri SQL

Decisione di Omar (2026-10-20, A15 del [[specs/crm/sezione-contatti/PLAN]]): PR6 non affronta l'`sql.raw` dei filtri. È il prossimo passo dopo il rilascio di PR5 e PR6, in una sessione dedicata con una review di sicurezza. Questo è lo scope, scritto leggendo il codice di `dev` il 2026-10-20; la sessione parte da qui e rifà la scansione prima di fidarsene.

### Il problema, com'è nel codice

- Due procedure, `customer.getAllCustomers` e `pratiche.getAllPratiche`, accettano `sqlFilter: z.string()` e lo passano a `sql.raw` dentro il `WHERE` (`src/server/api/routers/customer/GET/index.ts`, nel `where` che la lista e il conteggio condividono dopo T6.1 di PR6; `src/server/api/routers/pratiche/GET/index.ts`). `getAllCustomers` accettava anche `sqlTaskFilter`, che T6.1 di PR6 ha tolto dall'input.
- Sono `operatorProcedure`: le chiama qualunque utente con una riga in `operators`, di ruolo ADMIN o OPERATORE (`enforceIsActiveOperator` controlla solo che l'operatore esista). Si raggiungono su `/api/trpc` e sul backend Cloud Run senza passare dalla pagina.
- La stringa la costruisce la pagina con `createSQLQuery` (`src/lib/utils/filters.ts`) e il server non la rivede. La lista bianca dei nomi di colonna che PR6 aggiunge in T6.2 sta nella pagina e **non protegge la procedura**: serve a non rompere i link salvati, non è un controllo di sicurezza.
- Dentro `createSQLFilter`: il nome della colonna si interpola anche se non è nella mappa; un operatore sconosciuto diventa `undefined` nel SQL; il valore sta tra apici senza escape; `ilike '%…%'` non protegge `%` e `_`.
- `createFilterFromString` divide su `:` e tiene le prime tre parti: un valore che contiene `:` si tronca. Difetto di correttezza, collaterale.
- Gli altri `sql` con interpolazione che ho letto usano colonne o valori che Drizzle lega come parametri, e la ricerca `q` / `search_by` usa mappe chiuse e `containsPattern`. Contatti (`src/server/services/contact/getContacts.ts`) fa `ILIKE ${pattern} ESCAPE '\\'` ed è il modello da imitare. La review lo conferma, non lo assume.

### Perimetro: dentro

1. `sqlFilter` (e `sqlTaskFilter`, finché T6.1 di PR6 non è in prod) in `customer.getAllCustomers` e `pratiche.getAllPratiche`.
2. `src/lib/utils/filters.ts`: `createFilterFromString`, `createSQLFilter`, `createSQLQuery`.
3. I chiamanti e le mappe: `CustomerTableSection.tsx`, `src/app/dashboard/pratiche/page.tsx`, `CUSTOMER_FILTER_QUERY_MAP` e `PRATICA_FILTER_QUERY_MAP` in `src/app/dashboard/customers/_constants`.
4. L'URL: `src/components/custom/table/PopoverFilter.tsx` scrive `filter=` e lo rilegge; e i link salvati dagli operatori.
5. I test: `getAllCustomers.db.test.ts` e `getAllPratiche.db.test.ts`, più quelli nuovi.

### Perimetro: fuori

Sessioni e ruoli di NextAuth; gli altri router, salvo la scansione iniziale (ogni `sql.raw` e ogni `sql` che riceve una stringa del client); l'accessibilità e i piccoli di questa pagina, che restano più sopra.

### Cosa la review deve provare, non assumere

1. **Lo sfruttamento, su un database di sviluppo o locale, mai in prod.** Da un utente OPERATORE, con una chiamata diretta alla procedura, un `sqlFilter` che: esce dalla tabella (sottoquery su `users` o su un'altra tabella), usa `pg_sleep`, chiude la parentesi e aggiunge un `OR`. Dire cosa si legge, se esiste un modo di scrivere (funzioni con effetti) e se il driver ammette più statement. Il risultato decide la gravità.
2. **Con quale ruolo Postgres si connette l'app** (il ruolo di Supabase che salta le RLS, o uno limitato) e cosa può leggere e scrivere. Un ruolo a privilegi minimi è una mitigazione a parte, da valutare con la migrazione a GCP.
3. **Se è mai stato sfruttato:** i log di Vercel, Sentry e Cloud Run cercando `sqlFilter` con `;`, `--`, `select`, `union`, `pg_sleep`. Se la risposta non è "mai", Omar decide cosa fare dei dati personali dei clienti.
4. **Chi deve vedere cosa**, come domanda di prodotto e non di SQL: `onlyMe` e `filterBy.operatore` sono input del client. In Pratiche `onlyMe` restringe a un operatore solo se il client lo manda.

### Direzione del fix, da validare nella sessione

La pagina manda i filtri come dati, `filters: { column, operator, value }[]`. Il server traduce la colonna con una mappa chiusa per tabella (le stesse chiavi di `*_FILTER_QUERY_MAP`), l'operatore con `eq`, `gt`, `lt`, `gte`, `lte` di Drizzle e `ilike` con `containsPattern` per il testo, e controlla il valore per tipo di colonna (data, numero, enum, testo). Niente `sql.raw`. Riferimenti già nel repo: `customerSearchColumns` con `containsPattern` (`q` e `search_by`) e `getContacts.ts`.

### Decisioni da prendere all'inizio della sessione

1. **Formato dell'URL:** tenere `filter=<colonna>:<operatore>:<valore>` (i link salvati restano validi) o cambiarlo.
2. **Compatibilità fra rilasci:** con frontend (Vercel) e backend (Cloud Run) rilasciati separati, un frontend vecchio manda `sqlFilter` a un backend nuovo. O il server accetta i due formati per un rilascio e poi toglie il vecchio (ordine come A17 di PR6), o rifiuta subito `sqlFilter` se la prova 1 lo trova sfruttabile.
3. **Valori non validi:** scartarli in silenzio o dare errore.
4. **Pratiche:** nella stessa PR o in una seconda.
5. Il valore con `:` troncato.

### Test

Prima i test rossi, con una chiamata diretta alla procedura (`createCaller`) e non dalla pagina: un apice nel valore, `) OR (1=1`, un nome di colonna fuori mappa, un operatore sconosciuto, `%` e `_` che valgano come lettere, una sottoquery su un'altra tabella. Oggi passano o danno un errore SQL; dopo devono dare zero righe o `BAD_REQUEST`, senza effetti. Verifica per mutazione: rimettere `sql.raw` rende rosso almeno un test. Un test del componente per il formato dell'URL e una passata nel browser con un link salvato.

### Come lavorarci

Una sessione dedicata: `create-spec` (con criteri di accettazione di sicurezza), `create-plan`, `implement-spec`, poi `adversarial-review` con `review_impact: critical` e un passaggio di sicurezza. Il primo passo è la prova di sfruttamento del punto 1. Serve una data: finché il fix non è in prod l'esposizione resta.

### Legame con PR6

T6.2 aggiunge la lista bianca dei nomi di colonna solo per non rompere i link salvati; T6.1 toglie `sqlTaskFilter` dall'input e lascia `sqlFilter` libero; `PopoverFilter.tsx` scarta le voci con nome ignoto. La riforma assorbe la lista bianca e il resto.

## [2026-10-24] La falla è stata usata in prod? (OQ1 di [[specs/crm/filtri-sql-sicuri/SPEC]])

Nessuna traccia. Controllo di sola lettura, autorizzato da Omar, in una transazione `READ ONLY` sul database di prod e su Sentry.

- **`pg_stat_statements`** (Postgres 15.1, azzerato l'ultima volta il 2024-06-13): 4942 forme di query, 2317 su clienti o pratiche.
  - Tutte le 86 forme dell'app con un filtro grezzo hanno la forma che produce `createSQLFilter`: `colonna operatore $n`, unite da `AND`, solo su colonne delle due mappe. Le più usate: `sede ilike`, `comune ilike`, `state =`.
  - In nessuna query dell'app ci sono funzioni di sistema (`pg_sleep`, `pg_*`, `current_setting`, `version()`), cataloghi (`information_schema`), commenti, `;` o confronti fra due parametri come `$1=$2`. L'unico confronto fra parametri è la query del cron sulle rate (`DATE("data_liquidazione") + INTERVAL … = $2`).
  - Le altre forme anomale vengono dall'editor di tabelle di Supabase (`-- source: dashboard`, `_base_query`, `json_populate_record`).
- **Sentry** (`javascript-nextjs`): nessun errore con `syntax error`, `operator does not exist`, `invalid input syntax` o `canceling statement` in 90 giorni.

**Limiti.** Non è una prova di assenza.
- `pg_stat_statements` ha `max` 5000 ed è stato potato 25 volte: un'iniezione eseguita una volta sola può essere stata espulsa.
- Registra solo le query riuscite: i tentativi falliti non ci sono.
- Sentry registra pochissimi errori (circa 20 in 90 giorni), quindi pesa poco.

Fuori tema, non è un'iniezione: ci sono 14 `delete from "mito-deutsche_customers"` e 14 `delete from "mito-deutsche_practices"` senza `where`. Sono istruzioni a sé, che `sql.raw` dentro una `SELECT` con parametri non può generare, e nel codice di oggi non c'è nessun `.delete(customers)`. Da dove vengano non si può ricostruire: `pg_stat_statements` non tiene date.

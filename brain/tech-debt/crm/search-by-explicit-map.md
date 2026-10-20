---
domain: crm
type: tech-debt
links:
  - "[[review/search-by-explicit-map/REPORT]]"
  - "[[specs/crm/sezione-contatti/PLAN]]"
created: 2026-10-15
updated: 2026-10-20
---

# Tech debt: ricerca `search_by` di Clienti e Pratiche

## [2026-10-15] From review [[review/search-by-explicit-map/REPORT]]

Tutto preesistente: la review del cambio `search_by` l'ha trovato, ma non l'ha introdotto. Il cambio è uscito con verdetto SHIP. Il proprietario di prodotto ha chiesto di segnare come debito tecnico anche i punti che il report non marca come durevoli: il `console.log`.

### Sicurezza: filtri tradotti in SQL grezzo

- **[FOLLOW-UP, sicurezza]** `input.sqlFilter` arriva a `sql.raw` — `src/server/api/routers/customer/GET/index.ts:338`, `:445`, `src/server/api/routers/pratiche/GET/index.ts:85`. Lo stesso vale per `input.sqlTaskFilter` (`customer/GET/index.ts:371`).
  - Perché resta: la stringa SQL la costruisce la pagina (`createSQLQuery`) e la manda come input della procedura tRPC. Il server la esegue senza validarla. Chiunque possa chiamare la procedura può quindi mandare un frammento SQL qualsiasi.
  - Fix o prova che serve: una review di sicurezza dedicata. Probabile fix: la pagina manda i filtri come dati, cioè nome della colonna da una mappa chiusa, operatore da un enum e valore. Il server li traduce con gli operatori di Drizzle e i parametri, come fa già `search_by` con `customerSearchColumns`.
- **[FOLLOW-UP, sicurezza]** `createSQLQuery` costruisce `ilike '%${filter.value}%'` senza escape — `src/lib/utils/filters.ts:65`.
  - Perché resta: il valore del filtro, che viene dall'URL, finisce dentro un letterale SQL. Un apice chiude la stringa. `%` e `_` funzionano da caratteri jolly.
  - Fix o prova che serve: va nella stessa review. Dopo il fix il valore deve passare come parametro, con `containsPattern` (`src/server/api/routers/utils/index.ts`) come per `q`.

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

- Due procedure, `customer.getAllCustomers` e `pratiche.getAllPratiche`, accettano `sqlFilter: z.string()` e lo passano a `sql.raw` dentro il `WHERE` (`src/server/api/routers/customer/GET/index.ts`, nella lista e nel conteggio; `src/server/api/routers/pratiche/GET/index.ts`). `getAllCustomers` accetta anche `sqlTaskFilter`, che T6.1 di PR6 toglie dall'input.
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

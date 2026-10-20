---
domain: crm
type: tech-debt
links:
  - "[[review/search-by-explicit-map/REPORT]]"
created: 2026-10-15
updated: 2026-10-20
---

# Tech debt: ricerca `search_by` di Clienti e Pratiche

## [2026-10-15] From review [[review/search-by-explicit-map/REPORT]]

Tutto preesistente: la review del cambio `search_by` l'ha trovato, ma non l'ha introdotto. Il cambio è uscito con verdetto SHIP. Il proprietario di prodotto ha chiesto di segnare come debito tecnico anche i punti che il report non marca come durevoli: il `console.log`.

### Sicurezza: filtri tradotti in SQL grezzo

- **[FOLLOW-UP, sicurezza]** `input.sqlFilter` arriva a `sql.raw` — `src/server/api/routers/customer/GET/index.ts:338`, `:438`, `src/server/api/routers/pratiche/GET/index.ts:85`. Lo stesso vale per `input.sqlTaskFilter` (`customer/GET/index.ts:365`).
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

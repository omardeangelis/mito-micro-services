---
domain: crm
type: tech-debt
links:
  - "[[review/search-by-explicit-map/REPORT]]"
created: 2026-10-15
updated: 2026-10-15
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

---
domain: crm
title: Report frontend — quanto lavoro serve e come riorganizzarlo
status: draft
last_updated: 2026-08-04
context: "Preparazione all'ingestion XML v2.0 e allo split Prestiti/Cessioni"
---

# Report frontend

Domanda a cui risponde questo documento: **quanto frontend tocca il cambio Prestiti/Cessioni + nuovi campi anagrafici, e come andrebbe riorganizzato per renderlo più intellegibile.**

> **Aggiornamento 2026-08-04** — deciso di andare a **verticali** (tabelle e route separate per Attività, Prestiti, Cessioni):
> vedi [design-lavorazioni-e-verticali.md §4](brain/chore/crm/design-lavorazioni-e-verticali.md). Quella ristrutturazione **assorbe le Fasi 1 e 3**
> di §4 qui sotto: del riordino restano fuori Fase 2, 4, 5 e 6 → **10 gg invece di 16**.

---

## 1. Fotografia

| Metrica | Valore |
|---|---|
| Pagine (App Router) | 12 |
| `.tsx` in `src/app` | ~10.100 righe |
| `src/app` + `src/components` | ~14.500 righe |
| Componenti client (`"use client"`) | 36 |
| Procedure tRPC consumate | 79 |
| `console.log` residui | 80 |

I file più grossi — ed è qui che si concentra il debito:

| File | Righe |
|---|---|
| [NewPraticaForm.tsx](src/app/dashboard/customers/[id]/connect/_components/NewPraticaForm.tsx) | 989 |
| [CustomerColumns.tsx](src/app/dashboard/customers/_components/CustomerColumns.tsx) | 635 |
| [CustomerBulkDialog.tsx](src/app/dashboard/customers/_components/CustomerBulkDialog.tsx) | 619 |
| [NewCustomerForm.tsx](src/app/dashboard/customers/new/_components/NewCustomerForm.tsx) | 597 |
| [ExportDialog.tsx](src/app/dashboard/_components/ExportDialog.tsx) | 557 |
| [CustomerForm.tsx](src/app/dashboard/customers/[id]/_components/CustomerForm.tsx) | 544 |
| [PraticaGeneralForm.tsx](src/app/dashboard/pratiche/[id]/_components/PraticaGeneralForm.tsx) | 402 |

---

## 2. Quanto frontend tocca il cambio in arrivo

### 2.1 Nuovi campi anagrafici — impatto contenuto, 6 file

I nuovi campi cliente sono attributi scalari e il pattern esiste già (`reddito`, `occupazione`, `ambito` sono lì).

| File | Cosa cambia |
|---|---|
| `customers/[id]/_components/CustomerForm.tsx` | +8 campi nel `pick` dello schema e nella griglia |
| `customers/new/_components/NewCustomerForm.tsx` | idem in creazione manuale |
| `customers/_components/CustomerColumns.tsx` | colonne opzionali (nascoste di default) |
| `customers/_constants/index.ts` | nuove voci in `CUSTOMER_FILTER_MAP` |
| `dashboard/_components/ExportDialog.tsx` | nuove colonne esportabili |
| `customers/[id]/_actions/updateCustomer.ts` | schema di update |

**Stima: 1,5–2 gg.** Nessuna sorpresa attesa — ma vedi §3.4: la griglia del form è fatta a mano e ogni campo aggiunto peggiora un layout già fragile.

### 2.2 Prestiti / Cessioni — impatto trasversale, ~14 file

Qui il problema non è la quantità di codice ma il fatto che **non esiste un concetto di "famiglia di pratica"**: prodotti e stati sono costanti globali usate ovunque, quindi l'aggiunta di una seconda famiglia si propaga.

- `productMap` è referenziata in **16 file** (di cui 9 frontend).
- `stateEnum` / `PraticaState` in **12 file**, importati **direttamente dallo schema Drizzle dentro componenti client** (`import { stateEnum } from "@/server/db/schema/pratiche"` in [TableColumn.tsx:25](src/app/dashboard/pratiche/_components/TableColumn.tsx:25) e [PraticaGeneralForm.tsx:35](src/app/dashboard/pratiche/[id]/_components/PraticaGeneralForm.tsx:35)).

File da toccare: lista pratiche (page, `PraticesTable`, `TableColumn`, `TableFilterSection`, `BulkActionDialog`), dettaglio pratica (`PraticaGeneralForm`, `CustomerSection`), pratiche del cliente (`CustomerPraticaTable`), collega pratica (`NewPraticaForm`, 989 righe), dashboard (`LastUpdatedTableColumns`, `FinanceCard`/`DonutCard` per i KPI), export (`ExportDialog`), costanti.

**Stima a codice invariato: 3–4 gg**, con alto rischio di regressioni sulle pratiche esistenti (ogni file va toccato "a mano" e non c'è copertura di test sul frontend).
**Stima dopo la Fase 1 del riordino (§4): ~1 gg**, perché diventa la configurazione di una famiglia in più.

---

## 3. Problemi strutturali, in ordine di impatto

### 3.1 🔴 SQL costruito nel browser e passato a `sql.raw()`

I filtri avanzati delle liste vengono composti **come stringa SQL nel client** e passati in chiaro attraverso tRPC:

- [filters.ts:56-88](src/lib/utils/filters.ts:56) costruisce `` `${filter.name} ${symbol} '${filter.value}'` ``
- [pratiche/page.tsx:29](src/app/dashboard/pratiche/page.tsx:29) e [CustomerTableSection.tsx:35](src/app/dashboard/customers/_components/CustomerTableSection.tsx:35) lo passano come `sqlFilter`
- [pratiche/GET/index.ts:79](src/server/api/routers/pratiche/GET/index.ts:79) e [customer/GET/index.ts:324](src/server/api/routers/customer/GET/index.ts:324) fanno `sql.raw(input.sqlFilter)`

Il valore finisce dentro apici singoli **senza escaping**, e l'input arriva dai query param dell'URL. Un operatore autenticato (o chiunque gli faccia aprire un link) può eseguire SQL arbitrario. È il primo problema da chiudere, indipendentemente dal progetto Cessioni: da sostituire con un filtro dichiarativo `{field, op, value}[]` validato con Zod lato server e tradotto in condizioni Drizzle.

### 3.2 🟠 Il dominio non ha una casa

- `PRATICA_FILTER_MAP` — i filtri delle **pratiche** — vive in [`customers/_constants/index.ts`](src/app/dashboard/customers/_constants/index.ts) e viene importata da `pratiche/_components/TableFilterSection.tsx`.
- Il catalogo prodotti è una `Map` hardcoded in `lib/constants/productMap.ts`, mentre la tabella `products` esiste a DB, viene seedata e **non è letta da nessuna query**.
- Gli stati pratica sono importati dallo schema Drizzle direttamente nei componenti client.
- I tipi di riga sono ridichiarati a mano invece di derivarli: `PraticheColumnSelectedProps` ([TableColumn.tsx:28](src/app/dashboard/pratiche/_components/TableColumn.tsx:28)) riscrive 12 campi di `Practice` con tipi leggermente diversi (`productId: string | number | null`).

Effetto: per capire "quali stati può avere una pratica" bisogna leggere 4 file in 3 cartelle diverse.

### 3.3 🟠 L'import è orchestrato dal browser

[worker.ts](src/lib/workers/import/worker.ts) esegue 5 catene di `fetch` sequenziali con chunk fisso a 30, senza retry né ripresa: se l'utente chiude il tab, l'import si interrompe a metà lasciando dati parziali. Con l'arrivo dell'ingestion server-to-server (documentata in [fase-4-import-api.md](brain/chore/migration/fase-4-import-api.md)) questa UI va ridotta a **monitor degli import job** — meno codice, non di più.

### 3.4 🟡 I form fanno il lavoro delle schede dati

`PraticaGeneralForm` (402 righe) è un `<form>` con **12 input `disabled`** e 2 campi realmente editabili (stato, e indirettamente l'operatore). Ha tre schemi Zod intersecati (`praticaSchema`, `formInitialValues`, `extendSchema`) di cui solo il secondo valida davvero, e campi `hidden` duplicati per far passare i valori alla server action.

Con le Cessioni i campi crescono. La direzione giusta è separare **scheda dati read-only generata da configurazione** (una lista di `{label, value, format}`) dal **form delle poche azioni possibili**. Stessa dinamica su `CustomerForm` (544 righe): la griglia `grid-cols-3` con `grid-cols-2` annidati è già al limite, +8 campi la rompe.

### 3.5 🟡 Rumore e codice morto

- 80 `console.log`, alcuni su path di produzione: [parsePratica.ts:168-175](src/app/api/import/process/_services/parsePratica.ts:168) logga 7 righe per import, [_utils/index.ts:31](src/app/api/import/_utils/index.ts:31) logga **ogni campo di ogni riga** del CSV, `TableFilterSection` logga a ogni render.
- Blocchi commentati: colonne Nome/Cognome in [TableColumn.tsx:95-114](src/app/dashboard/pratiche/_components/TableColumn.tsx:95), l'intera `advancedData` in [pratiche/GET/index.ts:175-210](src/server/api/routers/pratiche/GET/index.ts:175), `defaultExport` duplicato in due path.
- [pratiche/GET/index.ts:145](src/server/api/routers/pratiche/GET/index.ts:145): `union()` di **due SELECT identiche** — funziona solo perché `UNION` deduplica, cioè è un `DISTINCT` scritto nel modo più costoso possibile.

---

## 4. Riorganizzazione proposta

Fasata e incrementale: ogni fase è mergeabile da sola e lascia l'app funzionante. **Nessun big-bang.**

### Fase 1 — Un modulo di dominio condiviso · 3 gg · *abilitante*

```
src/lib/domain/practice/
  catalog.ts     // prodotti + famiglia, letti dalla tabella products (cache)
  states.ts      // PraticaState, STATES_BY_KIND, label e colori
  columns.ts     // definizione colonne per famiglia
  filters.ts     // PRATICA_FILTER_MAP (spostata da customers/_constants)
src/lib/domain/customer/
  fields.ts      // gruppi di campi anagrafici (identità, contatti, lavoro, residenza)
  states.ts      // task status + ALLOWED_TASK_STATES per famiglia
```

Regola: **i componenti client non importano più da `@/server/db/schema/*`**. È la fase che rende tutte le altre economiche, e da sola porta la voce "Frontend Cessioni" da 3–4 gg a ~1.

### Fase 2 — Filtri tipizzati end-to-end · 4 gg · *chiude la falla di §3.1*

Il client emette `[{field: "state", op: "eq", value: "Liquidata"}]`; il server valida con Zod contro una allow-list di colonne e costruisce condizioni Drizzle. `createSQLQuery` e i tre `sql.raw` spariscono.

### Fase 3 — Tabella pratiche parametrica · 3 gg

Un solo `PracticesTable` che riceve la configurazione di famiglia da Fase 1. Prestiti e Cessioni diventano due route (o due tab) sullo stesso componente. Include l'eliminazione della `union` inutile e la derivazione dei tipi riga da `Practice`.

### Fase 4 — Dettaglio pratica: scheda + azioni · 3 gg

`<PracticeDataSheet config={...} />` read-only + `<PracticeActionsForm />` con i soli campi editabili. Riduce `PraticaGeneralForm` da 402 righe a ~120 e rende l'aggiunta di campi una riga di configurazione.

### Fase 5 — Import come monitor · 2 gg

L'upload manuale resta per i file Wave; l'orchestrazione dal browser viene sostituita da una lista job con stato e report errori, allineata all'endpoint di ingestion (§3 dell'[analisi](brain/chore/crm/analisi-import-xml-v2.md)).

### Fase 6 — Pulizia · 1 gg

Rimozione `console.log` su path caldi (con una regola ESLint che li blocchi), eliminazione blocchi commentati e file duplicati, tipi derivati.

**Totale riordino: ~16 gg.**

---

## 5. Raccomandazione

Non fare tutto e non farlo dopo. L'ordine che consiglio:

1. **Fase 2 subito** (o almeno l'escaping dei valori): è una vulnerabilità aperta, non un refactor.
2. **Fase 1 prima di iniziare le Cessioni**: 3 giorni investiti che ne fanno risparmiare 3 e riducono molto il rischio di regressione, dato che sul frontend non c'è copertura di test.
3. **Fasi 3 e 4 insieme alle Cessioni**, non prima: si fanno "gratis" mentre quei file vanno comunque toccati.
4. **Fasi 5 e 6 dopo il go-live** dell'ingestion, quando si sa cosa dell'import manuale sopravvive davvero.

Ultima nota di contesto: esiste già un piano di migrazione a monorepo con SPA React ([migration_plan.md](brain/chore/migration_plan.md), fase 3), oggi `not_started`. Le fasi 1, 2 e 6 sono **lavoro che si porta dietro** in quella migrazione senza costi aggiuntivi (modulo di dominio, filtri tipizzati, pulizia). Le fasi 3, 4 e 5 toccano componenti che verrebbero comunque riscritti: se la migrazione parte nei prossimi mesi, vale la pena farle *una volta sola*, nella SPA.

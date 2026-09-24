---
domain: crm
title: Design — sezione Contatti e semplificazione della tabella Clienti
status: draft
last_updated: 2026-09-24
related: "design-lavorazioni-e-verticali.md §3, §4, §7, §8 · report-frontend-riorganizzazione.md §3.1"
scope: "nuova sezione Contatti (task), query e mutazioni server, note, semplificazione lista e scheda Clienti, stima"
---

# Sezione Contatti e tabella Clienti semplificata

**Obiettivo**: togliere la gestione delle task dalla tabella Clienti e spostarla in una sezione dedicata, **Contatti**: una vista verticale sulle chiamate, con filtri (operatore, date, cliente, stato, priorità) e la data del prossimo alert. Dal dettaglio di un contatto si vede il cliente associato, si cambiano operatore, stato e priorità, si imposta il prossimo alert e si lascia una nota.

È un primo passo compatibile con la struttura a verticali di [design-lavorazioni-e-verticali.md §4](brain/chore/crm/design-lavorazioni-e-verticali.md), dove la sezione si chiamava "Attività". `task.kind` (prestiti e cessioni sullo stesso cliente) resta fuori, ma la query è pensata per ricevere quel filtro in seguito.

| § | Contenuto |
|---|---|
| [1](#1-perimetro) | Perimetro |
| [2](#2-fase-0--dati-e-indici) | Fase 0: dati e indici |
| [3](#3-fase-1--backend-lettura) | Fase 1: backend, lettura |
| [4](#4-fase-2--backend-modifiche) | Fase 2: backend, modifiche |
| [5](#5-fase-3--note) | Fase 3: note |
| [6](#6-fase-4--frontend-contatti) | Fase 4: frontend Contatti |
| [7](#7-fase-5--semplificazione-clienti) | Fase 5: semplificazione Clienti |
| [8](#8-fase-6--verifica-e-rilascio) | Fase 6: verifica e rilascio |
| [9](#9-stima) | Stima |
| [10](#10-decisioni) | Decisioni |
| [11](#11-fuori-perimetro-da-fare-con-il-nuovo-export-chiamate) | Fuori perimetro |

---

## 1. Perimetro

- **"Contatti" è il nome di prodotto.** Tabella DB e router tRPC restano `task`: rinominarli costerebbe una migrazione senza dare nessun vantaggio.
- **Restano com'è:**
  - la logica dell'assegnazione massiva (`bulkHandleTask`), già concordata con gli operatori in [guida-assegnazione-massiva-e-alert.md](brain/chore/crm/guida-assegnazione-massiva-e-alert.md);
  - i cron `alert` e `priority`;
  - l'export chiamate;
  - lo schema di `task_event_log`.

**Perché conviene.** Oggi [getAllCustomers](src/server/api/routers/customer/GET/index.ts:285) fa il join con le task, applica `LIMIT` e *poi* toglie i duplicati in JavaScript. Di conseguenza:
- la pagina può restituire meno righe di `perPage`;
- il `total` risulta gonfiato;
- l'ordinamento per priorità o per "contattato il" viene rifatto solo sulla pagina corrente.

Togliere il join risolve tutti e tre i problemi.

---

## 2. Fase 0 — dati e indici

**~0,5 gg**

1. **Controllo dei duplicati attivi.** Il bug è documentato in [task/GET:142](src/server/api/routers/task/GET/index.ts:142). Query di verifica:
   ```sql
   SELECT customer_id, count(*) FROM "mito-deutsche_task"
   WHERE is_active GROUP BY 1 HAVING count(*) > 1;
   ```
   In Contatti ogni task attiva è una riga, quindi un duplicato mostra lo stesso cliente due volte. Se ce ne sono, serve una migrazione che li disattivi e tenga solo la task più recente. Il criterio è quello già usato nel codice: `GREATEST(updated_at, created_at), id`.
2. **Indici per la nuova query.**
   - `task(customer_id)`
   - `task(operator_id) WHERE is_active`
   - `task(priority DESC) WHERE is_active`
   - `alert(task_id)`

   Oggi `task` non ha nessun indice. Vanno verificati con `EXPLAIN ANALYZE` su dati della dimensione di produzione.

---

## 3. Fase 1 — backend, lettura

**~1 gg**

### `task.getContacts`

L'input è tipizzato con Zod. **Non si usa `sql.raw`**, cioè la vulnerabilità di SQL injection descritta nel [report frontend §3.1](brain/chore/crm/report-frontend-riorganizzazione.md).

```ts
{
  page, perPage,
  orderBy: "priority" | "closedAt" | "nextAlert" | "createdAt" | "updatedAt" | "customer",
  sortedBy: "asc" | "desc",
  operatorIds?: number[],            // 0 = non assegnato
  onlyMe?: boolean,                  // su task.operatorId
  states?: TaskStatus[],
  priorities?: ("low"|"medium"|"high"|"urgent")[],
  customerQuery?: string,            // cognome/nome/CF/P.IVA/telefono
  customerId?: string,               // deep link dalla tabella Clienti
  dateField?: "closedAt" | "nextAlert" | "createdAt",
  from?: Date, to?: Date,
  hasAlert?: boolean,
  includeInactive?: boolean          // default false: solo contatti attivi
}
```

**Struttura della query:**
- `task` INNER JOIN `customers`
- LEFT JOIN `operators`
- LEFT JOIN `alert` sulla condizione `alert.id = task.alert_id AND NOT alert.is_resolved`, che fornisce la colonna "Prossimo alert"
- `ORDER BY <col> IS NULL, <col>, task.id` e `LIMIT/OFFSET`
- il `total` usa la stessa `where`

Niente `GROUP BY` e niente deduplica in JavaScript.

**Fasce di priorità condivise.** Le fasce (≤20, ≤60, ≤100, >100) oggi stanno dentro il componente [priority.tsx](src/components/custom/badge/priority.tsx). Si spostano in `src/lib/domain/contact/priority.ts`, così badge client e filtro server usano la stessa definizione.

### `task.getContactById`

Carica i dati del pannello di dettaglio:
- task, cliente e operatore;
- alert attivo;
- storico alert del cliente (riusa `getCustomerAlerts`);
- facoltativo: storico da `task_event_log` di quella task.

---

## 4. Fase 2 — backend, modifiche

**~2 gg**

Oggi la logica di cambio stato è ripetuta in tre punti lato client:
- [StateSelector](src/app/dashboard/customers/_components/CustomerColumns.tsx:500)
- [taskStatusAction](src/app/dashboard/customers/_actions/taskStatusAction.ts)
- [CustomerTaskManager](src/app/dashboard/customers/[id]/_components/CustomerTaskManager.tsx:103)

In questi punti la logica fa più chiamate in sequenza senza transazione, e le regole non coincidono (vedi §10, decisione 3). Si porta sul server, in mutation che girano in un'unica `db.transaction`:

| Mutation | Cosa fa |
|---|---|
| `task.changeState` | Decide la direzione con `getTaskStatusDirection`: persist, close (imposta `closedAt`) oppure reopen. Per il reopen **tiene l'INSERT e la disattivazione di oggi**, per non cambiare l'export (§11). Se c'è un alert attivo lo chiude, scrive l'event log e chiama `updateLastEdit`. **Restituisce l'id della task**: dopo un reopen è nuovo e il dettaglio deve fare `router.replace` al nuovo id. |
| `task.updatePriority` | `priority` + `customPriority=true`. Ha anche l'opzione "Automatica" (`customPriority=false`), che restituisce la priorità al cron. |
| `task.reassign` | Aggiorna `task.operatorId` e registra `operator_reassign` nel log. Oggi un riassegnamento singolo non esiste: c'è solo quello massivo. Vedi §10, decisione 1. |
| `task.setNextAlert` | Se c'è già un alert aperto lo chiude (finisce nello Storico), crea il nuovo, imposta `task.alertId` e lo stato `richiamare`, e registra tutto nel log. Resta la regola già spiegata agli operatori: l'alert si può mettere solo su stati con esito o su `nessuno`. |

**Permessi controllati dal server.** Oggi il controllo "solo le task assegnate a te" esiste solo nel client ([CustomerColumns.tsx:531](src/app/dashboard/customers/_components/CustomerColumns.tsx:531)). Serve un helper `assertCanEditTask`:
- gli ADMIN possono tutto;
- un operatore modifica solo le proprie task;
- `reassign` è riservato agli ADMIN.

**Pulizia:**
- in [createAlert](src/server/api/routers/task/POST/index.ts:370) il ramo `if (customerId.length === 0)` ([riga 388](src/server/api/routers/task/POST/index.ts:388)) legge poi `customerId[0]!`, quindi non funziona: va rimosso;
- [bulkCreateTask](src/server/api/routers/task/POST/index.ts:323) non viene chiamato da nessuna parte.

**Rafforzamento opzionale.** Quando tutte le creazioni di task disattivano la precedente dentro la stessa transazione, si può aggiungere l'indice `UNIQUE (customer_id) WHERE is_active`. Oggi [createTask](src/server/api/routers/task/POST/index.ts:25) non lo fa: la disattivazione la fa il client in una seconda chiamata separata. Con l'arrivo di `kind` l'indice diventerà `(customer_id, kind)`.

---

## 5. Fase 3 — note

**~0,5 gg**

**Decisione presa**: nel dettaglio contatto si mostra **la chat del cliente** e basta. Una nota scritta dal contatto finisce nella chat del cliente, quindi si ritrova sia sul contatto sia nella scheda cliente.

**Niente `messages.task_id`.** Il legame nota → task si romperebbe a ogni nuova riga `task` creata da riapertura, cron alert o assegnazione massiva. Una tab "Note della chiamata" risulterebbe vuota proprio dopo un followup, cioè quando il nuovo operatore ha bisogno delle note del collega: sarebbe una feature parziale. Il legame si ricostruisce più avanti dagli orari, vedi §11.

**Cosa serve:**
- **Niente migrazione e niente procedure nuove.** Bastano quelle che esistono già: `chat.getChatMessagesById`, `chat.insertMessage`, `chat.createNewCustomerChat`.
- **Piccolo refactor per riusare il componente della chat.**
  - [PraticaActiveChat](src/app/dashboard/pratiche/[id]/_components/PraticaNotes.tsx:42) capisce dall'URL cosa aggiornare (`location.pathname.includes("customer")` e `params.id`, [riga 52](src/app/dashboard/pratiche/[id]/_components/PraticaNotes.tsx:52)). In `/dashboard/contatti/[id]` aggiornerebbe una pratica passandole l'id della task.
  - Le action ricaricano percorsi fissi: [updateChat](src/app/dashboard/pratiche/[id]/_actions/updateChat.ts) ricarica `/dashboard/pratiche/[id]`, [createNewChat](src/app/dashboard/pratiche/[id]/_actions/createNewChat.ts) ricarica `/dashboard/customers/[id]`.
  - Il componente deve ricevere come prop `owner: { type: "customer" | "pratica", id }` e rinfrescare la pagina corrente. Lo stesso vale per `PraticaNewChat`.
- **La pagina del contatto legge `limit`** dai parametri dell'URL, come fa già la scheda cliente, così "Carica altri messaggi" funziona.

Risultato: il pannello note è lo stesso nella scheda cliente e nel contatto, con un solo comportamento da spiegare agli operatori.

---

## 6. Fase 4 — frontend Contatti

**~3 gg**

```
src/app/dashboard/contatti/
  page.tsx, layout.tsx
  [id]/page.tsx                        // Sheet di dettaglio, come customers/[id]
  _components/ContactsTableSection.tsx // searchParams → getContacts
  _components/ContactsTable.tsx        // tanstack, manualSorting, paginazione
  _components/ContactColumns.tsx
  _components/ContactFilters.tsx
  _components/ContactDetail.tsx
  _components/ContactStateSelect.tsx   // estratto da StateSelector
  _components/ContactAlertForm.tsx     // estratto da CustomerAlertCreator
  _lib/searchParams.ts                 // URL ↔ input Zod (parse + serialize)
```

### Colonne

- Cliente, con link alla scheda
- Telefono e CF, nascondibili
- Stato, modificabile nella riga
- Priorità
- Operatore
- Contattato il
- **Prossimo alert**: data e messaggio in tooltip, evidenziato se scade oggi o è già scaduto
- Creato e Aggiornato
- Menu azioni: apri cliente, copia telefono

### Filtri

- Ricerca cliente
- Operatore: riusa `OperatorSelector`, con l'opzione "Non assegnato"
- Stato: riusa `TaskStatusSelector`
- Priorità: componente nuovo
- Date: campo a scelta tra Contattato il, Prossimo alert e Creato, con intervallo dal/al
- Interruttori "Solo i miei", "Con alert" e "Includi chiusi"

I parametri URL sono dedicati e separati da virgola (`?stato=chiamare,richiamare&operatore=3`). Non si riusa `filter_by` perché oggi divide i valori sul trattino.

### Pannello di dettaglio

- Stessi dati della riga e pulsante "Apri scheda cliente"
- Stato, priorità e operatore modificabili (l'operatore solo dagli ADMIN)
- Alert attivo, con X per chiuderlo o sostituzione con uno nuovo, più lo storico degli alert del cliente
- Note: chat del cliente (§5)
- Facoltativo: timeline da `task_event_log`

### Altro

- **Sidebar**: link "Contatti" in [DashboardLayout.tsx](src/app/_components/DashboardLayout.tsx:135), tra Clienti e Pratiche.
- **Preferenza colonne dedicata**: `contactTableVisibleColumns`, da aggiungere in `updateUserPreference`, nello store e nei tipi.
- **Badge stato condiviso**: `TaskBadgeV2` si sposta in `components/custom/badge/`.

---

## 7. Fase 5 — semplificazione Clienti

**~1 gg**

### `getAllCustomers`

Da togliere:
- il join con `task`
- `status` e `sqlTaskFilter`
- la seconda query sulle task
- `generateUniqueCustomers`
- gli ordinamenti `contattato` e `priority`

Il conteggio pratiche può diventare una sottoquery scalare, così sparisce anche il `GROUP BY`. L'ordinamento di default diventa `updatedAt desc`.

### Colonne e filtri

- **Colonne** ([CustomerColumns.tsx](src/app/dashboard/customers/_components/CustomerColumns.tsx)): tolte "Stato Chiamate", "Contattato il", "Priorità" e `StateSelector`. Nel menu azioni si aggiunge "Vedi contatti", che porta a `/dashboard/contatti?cliente_id=…`.
- **Filtri**:
  - `TaskStatusSelector` sparisce;
  - in `CUSTOMER_FILTER_MAP` si tolgono "Stato" e "Contattato il", che sono colonne della tabella task;
  - si semplifica il parsing in `CustomerTableSection`.
- **File eliminati**: `taskStatusAction.ts`.

### Assegnazione massiva

Resta in Clienti con entrambe le modalità: è il modo in cui nascono i contatti per i clienti che non ne hanno uno. Cambia solo l'etichetta: "Assegna chiamate" diventa "Crea/assegna contatti".

### Scheda cliente

- **Riepilogo contatto.** `CustomerTaskManager` e `CustomerActivities` vengono sostituiti da un riepilogo in sola lettura: stato, operatore, priorità, prossimo alert e il pulsante **"Gestisci contatto"**.
- **Cliente senza contatto attivo.** Compare "Crea contatto", che sostituisce il "+" di oggi.
- **Note.** Restano dove sono.

---

## 8. Fase 6 — verifica e rilascio

**~1 gg**

### Test vitest su funzioni pure

- input → condizioni Drizzle di `getContacts`;
- fasce di priorità;
- decisione di transizione in `changeState` (direzione + alert da chiudere).

### Scenari manuali

- cambio stato persist/close/reopen, con redirect al nuovo id;
- sostituzione di un alert;
- nota scritta dal contatto visibile anche nella scheda cliente;
- combinazioni di filtri, con `total` che corrisponde alle righe;
- il totale Clienti non è più gonfiato;
- righe corrette in `task_event_log`.

### Altri controlli

- **Prestazioni**: `EXPLAIN ANALYZE` su `getContacts` e sulla nuova `getAllCustomers`.
- **Guida operatori**: aggiornare [guida-assegnazione-massiva-e-alert.md](brain/chore/crm/guida-assegnazione-massiva-e-alert.md). Il §5 va riscritto, perché gli alert si gestiscono in Contatti, e va aggiunta una sezione su Contatti.

### Ordine delle PR

Ciascuna PR si può rilasciare da sola:
1. Fasi 0–2: backend, migrazioni additive.
2. Fase 4: Contatti affiancato a Clienti.
3. Fase 3: note.
4. Fase 5: semplificazione di Clienti.

La PR 4 va per ultima, così gli operatori usano Contatti per qualche giorno prima che le colonne spariscano da Clienti.

---

## 9. Stima

| Fase | Giorni |
|---|---|
| 0 — dati e indici | 0,5 |
| 1 — backend, lettura | 1 |
| 2 — backend, modifiche | 2 |
| 3 — note | 0,5 |
| 4 — frontend Contatti | 3 |
| 5 — semplificazione Clienti | 1 |
| 6 — verifica e rilascio | 1 |
| **Totale** | **~9** |

---

## 10. Decisioni

| # | Decisione | Stato | Raccomandazione |
|---|---|---|---|
| 1 | Il cambio di operatore sul contatto aggiorna anche `customers.operatorId`? | aperta | **Sì, per ora.** È quello che fa già "Assegna chiamate", e il cron alert assegna il followup leggendo `customers.operatorId`. Separare referente e proprietario del contatto ha senso quando arriva `kind` ([design §3](brain/chore/crm/design-lavorazioni-e-verticali.md)). |
| 2 | Nella scheda cliente si modifica il contatto o c'è solo un riepilogo? | aperta | Riepilogo in sola lettura più un link a Contatti. |
| 3 | Cambio di stato con alert attivo | aperta | Oggi la lista chiude l'alert a *ogni* cambio (con conferma), il dettaglio solo uscendo da `richiamare`. Consiglio il comportamento della lista, sempre con conferma. |
| 4 | Duplicati attivi | aperta | Pulizia (Fase 0) più indice unico (Fase 2). |
| 5 | Vista di default di Contatti | aperta | Solo contatti attivi, con "Includi chiusi" per lo storico. |
| 6 | Note nel dettaglio contatto | **presa** | Solo la chat del cliente, niente `messages.task_id` (§5). |

---

## 11. Fuori perimetro: da fare con il nuovo export chiamate

Questi punti vanno affrontati **insieme**, quando l'export chiamate passerà da `task` a `task_event_log` ([design §8](brain/chore/crm/design-lavorazioni-e-verticali.md)). Farli prima cambierebbe i numeri dei report senza averli concordati con il cliente.

- **Id stabile della task** ([design §7](brain/chore/crm/design-lavorazioni-e-verticali.md)). Il cron alert e la riapertura aggiornerebbero la stessa riga invece di crearne una nuova. Oggi non si può fare perché l'export conta le righe `task`: ogni riga conserva una chiusura (`closed_at`), e unendole le chiamate precedenti sparirebbero dai numeri.
- **Azione `contact`** ("Registra tentativo"), per contare le richiamate che non cambiano lo stato.
- **Recupero dello storico.** Il log esiste solo dalla migrazione del 19/06/2026. Per le date precedenti si ricavano eventi dalle righe `task` con `closed_at`, eliminando le copie (stesso cliente e stesso `closed_at` = un evento solo).
- ⚠️ **Retention del log.** [cleanupTaskEventLog](src/app/api/cron/cleanupTaskEventLog/route.ts:14) cancella il log più vecchio di 3 mesi. Va tolta o allungata prima che l'export dipenda dal log. Va anche verificato se gira in produzione: nei workflow GitHub non risulta, esiste solo lo script `clean:task-event-log`.
- **`task_id` sulle note.** Si potrà aggiungere allora e ricostruire per le note già esistenti in base all'orario: la task giusta è quella del cliente con il `createdAt` più recente che non supera `sendDate`. L'unica ambiguità sono i duplicati attivi.
- **Come concordarlo.** Per i mesi in cui esistono sia il log sia le righe `task`, si possono lanciare vecchio e nuovo export in parallelo e mostrare al cliente la differenza, operatore per operatore, prima di cambiare.

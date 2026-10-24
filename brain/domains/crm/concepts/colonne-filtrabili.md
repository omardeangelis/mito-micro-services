---
domain: crm
type: concept
status: implemented
ingested: true
last_ingested: 2026-10-24
links:
  - "[[specs/crm/filtri-sql-sicuri/SPEC]]"
  - "[[specs/crm/filtri-sql-sicuri/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/filtri-sql-sicuri/REPORT]]"
  - "[[tech-debt/crm/filtri-sql-sicuri]]"
  - "[[domains/crm/flows/filtro-avanzato-di-clienti-e-pratiche]]"
  - "[[domains/crm/concepts/filtro-avanzato]]"
created: 2026-10-24
updated: 2026-10-24
---

# Colonne filtrabili

## Definition

L'insieme chiuso delle colonne su cui si può mettere un [[domains/crm/concepts/filtro-avanzato]], una mappa per tabella. La stessa mappa la usano il popover, per offrire colonne e operatori, e il server, per accettare o scartare una voce. Contiene solo colonne della query attiva della tabella, così una colonna non più interrogata si scarta invece di produrre SQL verso una tabella assente (AC7).

## Attributes

| Tabella | Etichetta nel popover | Colonna | Tipo |
|---|---|---|---|
| Clienti (`customers`) | Compleanno | `birthday_date` | data |
| | Età | `age` | intero |
| | Fonte | `source` | enum |
| | Comune | `comune` | testo |
| | Sede | `sede` | testo |
| | Telefono | `phone_number` | testo |
| | Ambito | `ambito_lavorativo` | testo |
| | Occupazione | `occupazione` | testo |
| Pratiche (`practices`) | Liquidato il | `data_liquidazione` | data |
| | Debito | `debito_residuo` | decimale |
| | Finanzato | `importo_finanziato` | decimale |
| | Rate pagate | `rate_pagate` | intero |
| | Stato | `state` | enum |
| | Erogato | `importo_erogato` | decimale |
| | Richiesto | `importo_richiesto` | decimale |
| | Rate totali | `rate_totali` | intero |
| | Regione | `region` | testo |
| | Rata | `importo_rata` | decimale |

| Tipo | Operatori |
|---|---|
| testo, enum | solo `=` |
| intero, decimale, data | `=`, `>`, `<`, `>=`, `<=` |
| tipo sconosciuto | nessuno: la colonna non si può filtrare |

## Related flows

- [[domains/crm/flows/filtro-avanzato-di-clienti-e-pratiche]]

## [Source: SPEC + IMPLEMENTATION-NOTES]

- Le mappe sono `Map` e non oggetti: `__proto__`, `constructor` e `toString` restano nomi sconosciuti.
- Il tipo si legge da `columnType` della colonna drizzle (`PgVarchar`, `PgNumeric`, `PgTimestamp`…), non da `dataType`, che per `numeric` vale `"string"` come per il testo.
- `state` e `closed_at` di `task` non sono più colonne di Clienti: le ha tolte PR6 della Sezione Contatti, insieme al join con `task`. Un link salvato che le usa perde quelle voci.
- La riforma non ha cambiato l'insieme delle colonne né gli operatori mostrati (Non-Goal della spec).
- Codice: `packages/domain/src/filters/advanced.ts` (`CUSTOMER_FILTER_MAP`, `PRATICA_FILTER_MAP` per etichetta, `*_FILTER_QUERY_MAP` per nome, `filterKindOf`, `operatorsFor`). Le mappe dipendono dalle colonne di drizzle; un descrittore di dati semplice è un follow-up in [[tech-debt/crm/filtri-sql-sicuri]].

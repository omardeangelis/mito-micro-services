---
domain: crm
type: concept
status: implemented
ingested: true
last_ingested: 2026-10-24
links:
  - "[[specs/crm/customer-effect/SPEC]]"
  - "[[specs/crm/customer-effect/IMPLEMENTATION-NOTES]]"
  - "[[chore/migrazione-effect]]"
  - "[[domains/crm/flows/controllo-dei-duplicati-di-un-cliente-nuovo]]"
created: 2026-10-24
updated: 2026-10-24
---

# Codici del cliente

## Definition

I tre codici che identificano un cliente del CRM: l'NDG (il "Codice Cliente", in schema `tempID`), il codice fiscale e la partita IVA. Servono a cercare un cliente e a capire, prima di crearne uno, se esiste già.

## Attributes

| Codice | Colonna | Tipo | Regole |
|---|---|---|---|
| NDG ("Codice Cliente") | `temp_id` | `varchar(255)`, obbligatorio | Unico nel database: un secondo cliente con lo stesso NDG fallisce all'insert. Nel form di Nuovo cliente è sempre compilato. La ricerca non toglie gli spazi |
| Codice fiscale | `fiscal_code` | `char(16)` | Non unico nel database. Postgres lo restituisce con gli spazi in coda fino a 16 caratteri. Il form di Nuovo cliente lo vuole di 16 caratteri; la ricerca toglie gli spazi attorno |
| Partita IVA | `vat_code` | `varchar(255)` | Non unica nel database. Il form la vuole di 11 caratteri; la ricerca toglie gli spazi attorno |

- Almeno uno fra codice fiscale e partita IVA: lo vogliono il form di Nuovo cliente e lo schema della ricerca (`customer.getCustomersByFiscalCodeOrVatCode`), anche quando si cerca per NDG (TD8 (b) di [[chore/migrazione-effect]]).
- La ricerca per codici trova ogni cliente che ha uno qualunque dei codici passati non vuoti; un codice vuoto non trova nessuno, e senza codici la lista è vuota.

## Related flows

- [[domains/crm/flows/controllo-dei-duplicati-di-un-cliente-nuovo]]

## [Source: SPEC + IMPLEMENTATION-NOTES]

- Il passo 2 di [[chore/migrazione-effect]] ([[specs/crm/customer-effect/SPEC]]) ha portato la ricerca nel servizio `findCustomersByCode` (`packages/server/src/services/customer/queries.ts`), a comportamento invariato. Poi, nella stessa PR, ha tolto la priorità fra i codici (prima `tempID`, poi codice fiscale, poi partita IVA), che lasciava creare un cliente con il codice fiscale di un altro.
- Il database non impedisce un codice fiscale o una partita IVA doppi: il controllo è solo nel browser, nei due form del flusso. Chi chiama `customer.insertCustomer` direttamente può creare un doppione.

---
domain: crm
type: concept
status: implemented
ingested: true
last_ingested: 2026-10-26
links:
  - "[[specs/crm/import-pratiche/SPEC]]"
  - "[[specs/crm/import-pratiche/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/import-pratiche/PLAN]]"
  - "[[tech-debt/crm/import-pratiche]]"
  - "[[domains/crm/concepts/codici-del-cliente]]"
  - "[[domains/crm/concepts/riga-dell-import]]"
  - "[[domains/crm/flows/nuovo-import-con-anteprima]]"
  - "[[domains/crm/flows/esecuzione-di-un-import-confermato]]"
created: 2026-10-26
updated: 2026-10-26
---

# Riconoscimento dei clienti nell'import

## Definition

La regola che dice quale cliente del CRM è il cliente di una riga, e quali clienti la riga aggiorna. In questa fase resta quella di prima, con i suoi difetti (OQ1, Leonardo, 2026-10-24): la riscrittura cambia **come** si importa, non **chi** è lo stesso cliente. Cambia solo che cosa riceve un cliente aggiornato (AC35) e come si tratta un codice cliente in conflitto (AC11b).

- **Il primo cliente.** Un cliente del CRM con codice fiscale è lo stesso della riga se il codice fiscale coincide; uno senza codice fiscale, se coincide la partita IVA. Fra più candidati vale il primo per `id`, così la scelta è stabile (D11).
- **I clienti aggiornati.** Tutti i clienti con il codice cliente della riga, **o** il codice fiscale della riga (se manca, quello del primo), **o** la partita IVA della riga (se manca, quella del primo). È l'OR di prima, fissato dai test di caratterizzazione (T2).
- **Il legame.** Va al primo cliente riconosciuto (come faceva `processCTP`).
- **Un cliente nuovo** nasce quando nessun cliente del CRM è riconosciuto: senza operatore, con `source` `wave` o `internal` secondo il formato (AC34). Se il suo codice cliente è già usato, la riga è scartata (AC11b, [[domains/crm/concepts/riga-dell-import]]).

## Attributes

| Che cosa scrive l'import | Cliente esistente (AC35) | Pratica esistente (AC36) |
|---|---|---|
| Valori della riga | Solo quelli non vuoti; i campi vuoti nella riga restano com'erano | Solo quelli non vuoti, compreso `file_name`, tranne le rate totali |
| Non cambia mai | Codice cliente, operatore, chat, stato della blacklist, data di creazione | Operatore, chat, data di creazione |
| `file_name`, `source` | Prendono quelli dell'import | — |
| `last_import_update` | L'ora dell'import, sempre | Solo se cambiano le rate pagate |
| `updated_at` | Si sposta | Non si sposta, come prima |

Un legame che esiste già resta com'è, ruolo compreso (AC37). Importare due volte lo stesso file dà, la seconda volta, zero clienti, pratiche e legami nuovi (AC24).

## Related flows

- [[domains/crm/flows/nuovo-import-con-anteprima]]: `import.lookup` legge i candidati per le chiavi del file e il worker calcola i numeri dell'anteprima.
- [[domains/crm/flows/esecuzione-di-un-import-confermato]]: la stessa regola rifatta sui clienti bloccati, poi le scritture.

Concetto vicino: [[domains/crm/concepts/codici-del-cliente]] (NDG, codice fiscale, partita IVA nel resto del CRM).

## [Source: import-pratiche]

- Spec: Definizioni ("Cliente esistente"), AC24, AC34–AC38, OQ1 di [[specs/crm/import-pratiche/SPEC]]; piano §1 e D11 di [[specs/crm/import-pratiche/PLAN]]. Codice: `packages/domain/src/import/plan.ts` (`planRows`), `packages/server/src/services/import/lookup.ts` e `apply.ts`.
- **Cambio di comportamento voluto (D11, AC35).** Prima ogni cliente aggiornato riceveva tutti i campi del cliente fuso `{ ...primo, ...valori non vuoti della riga }`: un cliente aggiornato per errore (stessa partita IVA o stesso codice cliente) prendeva i campi del primo, data di creazione, chat e blacklist compresi. Ora riceve solo i valori non vuoti della riga. Elencato nella PR E (#85).
- **Difetti che restano** (OQ1, da correggere dopo in una spec o PR a parte): una riga aggiorna anche il cliente che ha il suo codice cliente, se è un altro; con più clienti con lo stesso codice fiscale il primo è una scelta arbitraria, ora almeno stabile; una riga con un codice fiscale che il CRM non ha va tra i nuovi anche se il suo codice cliente è già nel CRM, e ora è scartata con AC11b invece di bloccare l'import. In [[tech-debt/crm/import-pratiche]].
- L'ordine di `id` è quello che dà `import.lookup`: `planRows` non riordina, perché l'ordine delle stringhe di Postgres e di JavaScript può differire.

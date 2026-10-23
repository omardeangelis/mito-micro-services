---
domain: crm
type: contract
status: proposed
ingested: true
last_ingested: 2026-10-23
links:
  - "[[domains/crm/crm]]"
  - "[[specs/crm/export-chiamate/SPEC]]"
  - "[[specs/crm/export-chiamate/IMPLEMENTATION-NOTES]]"
created: 2026-10-23
updated: 2026-10-23
---

# Contratto del dominio CRM

> [!warning] Sintesi parziale
> Questo contratto riporta SOLO ciò che stabilisce la spec [[specs/crm/export-chiamate/SPEC|export-chiamate]]: l'export delle chiamate, lo stato `non risponde`, la definizione di chiamata e i permessi admin. Il resto del dominio CRM (contatti, clienti, assegnazioni, import, cron) non è ancora sintetizzato: l'assenza di una voce qui non dice nulla su di esso.

## Owns

- La definizione di **chiamata effettuata**, risposta, non risposta e appuntamento fissato: [[domains/crm/concepts/chiamata]].
- Lo stato del contatto `non risponde` e le sue transizioni: [[domains/crm/concepts/stato-del-contatto]].
- L'export delle chiamate per operatore (totali, grafici, file Excel) e il periodo che può coprire: [[domains/crm/concepts/periodo-dell-export]], [[domains/crm/flows/export-chiamate-per-operatore-admin]].

## Does Not Own

- L'export "default" (clienti e pratiche) e l'elenco delle chiamate chiuse con note: non esistono più (AC15).
- Gli altri numeri della dashboard (finanziato medio, chiamate completate, importi per sede).
- La ricostruzione delle chiamate precedenti al 15/09/2026, data da cui esiste il registro delle azioni sui contatti.
- Il ritorno automatico in coda dopo un tempo e il richiamo automatico dei contatti `non risponde`.
- Gli export per gli operatori: non esportano né vedono grafici.
- Chi vede o modifica i contatti.

## Invariants

- Solo un admin ottiene i dati dell'export: non admin `FORBIDDEN`, senza sessione `UNAUTHORIZED` (AC7, AC8); ai non admin non compare né il comando né la sezione (AC6, AC20).
- La risposta dell'export contiene solo totali per operatore: nessun dato di clienti, telefoni o note (AC22).
- Le chiamate si contano dal registro dei cambi di stato, non da "Contattato il" (Decision Log); azioni massive e cambi del sistema non sono chiamate (AC10).
- effettuate = risposte + non risposte; un appuntamento fissato è anche una risposta.
- Il periodo dell'export è in giorni di Roma, estremi inclusi, e non va oltre 3 mesi indietro (AC11, AC11b).
- Indicatori, grafici e file mostrano gli stessi numeri per lo stesso periodo (AC19).
- Da `non risponde` non si torna a `chiamare` né a `followup` (AC1b); un contatto `non risponde` resta in coda e conserva il suo operatore (AC2).
- Il codice dell'export è in Effect e le sue regole di chiamata e periodo stanno in `@mito/domain`, senza Next.js né codice server.

Debito noto: [[tech-debt/crm/export-chiamate]].

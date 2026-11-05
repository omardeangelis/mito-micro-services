---
domain: crm
type: flow
links:
  - "[[specs/crm/assegnazione-wave/SPEC]]"
created: 2026-11-03
updated: 2026-11-04
ingested: false
last_ingested: null
---

# Flow map: Import e assegnazione della Wave

> Map of [[specs/crm/assegnazione-wave/SPEC]]. Every requirement cites an acceptance criterion there; `SPEC.md` is the contract.
> Source: `ux-advisor` review of the prototype at `apps/web/src/prototypes/import-wave/` (`/dashboard/prototypes/import-wave`), 2026-11-03, verdict `proceed with decisions`.

## Goal
L'admin conferma la scadenza di una Wave appena importata e ne divide i clienti senza operatore fra il team; il segnale è la schermata di fine con «Assegnati <N> clienti della <nome>» e la panoramica senza clienti senza operatore (AC7, AC15, AC17, AC19).

## Persona situations
- Admin × toast di fine import × admin × PC × Wave da 6–9 mila clienti × conosce i CRM — il flusso completo in due passi (AC2, AC4–AC17).
- Admin × Promozione di clienti già tutti assegnati × admin × PC — 0 da assegnare: solo la scadenza (AC8).
- Rosario × riga dello storico × admin × PC — Wave già con scadenza: arriva sulla panoramica, non nel flusso (AC3, AC19).
- Admin × home-admin, riga del team × admin × PC — una persona sola scelta, «Quanti» vuoto (AC2, AC14).
- Admin × Wave scaduta × admin × PC — avviso, «Proroga» o «Riassegna» con gli inattivi scelti (AC21, AC22, AC27).
- Operatore × apre l'indirizzo × `OPERATORE` — accesso negato (AC1).

## Entry points
- Toast di fine import di una Wave, comando «Assegna», per 10 s (AC2).
- Riga di una Wave nello storico degli import (AC2).
- «Assegna» o «Apri» di una riga di «Ultimi import», o «Assegna» di una riga del team, in home-admin (AC2).
- Wave senza scadenza → flusso al primo passo; con scadenza → panoramica (AC3).

## Happy path
1. L'admin apre la Wave dal toast → «Ingressi e scadenza»: anello doppio, «Clienti importati», «Da assegnare», «Già assegnati» (AC5).
2. Controlla la scadenza proposta, oggi + 30, o ne sceglie un'altra (AC6).
3. «Avanti» → la scadenza è salvata, il fuoco va sul titolo «Assegna» (AC7, AC31).
4. Sceglie la divisione; «Ritmo dei 30 giorni precedenti» è già scelta (AC11).
5. Controlla «A chi»: gli operatori attivi scelti, gli inattivi in cima e non scelti (AC12).
6. Lascia «Quanti» al massimo o scrive un numero; il riepilogo e il pulsante lo seguono (AC13, AC14).
7. «Assegna <N> a <K> operatori» → «Assegnazione in corso…» (AC15).
→ Outcome: schermata di fine centrata, «Assegnati <N> clienti della <nome>», «Vai alla Wave» (AC17).

Riassegnazione: «Riassegna…» → «Da chi» (inattivi scelti) → «Quali e quanti contatti» → «A chi» → «Sposta <N> a <K> operatori» → «Spostati <N> contatti» (AC22–AC27).

## States
| Action or region | Outcome, state, or interruption | Criterion |
|---|---|---|
| Assegna / Sposta | success | AC17, AC27 |
| Assegna / Sposta | numeri cambiati (chi riceve o cede non è più nel team, meno clienti da assegnare) | AC16 |
| Assegna / Sposta | altro errore dichiarato | AC16 |
| Assegna / Sposta | esito incerto (rete, 5xx, timeout) | AC16 |
| Assegna / Sposta | sessione scaduta, admin disattivato, utente senza permesso | AC16 |
| Assegna / Sposta | lento: migliaia di contatti | AC15 |
| Assegna / Sposta | l'admin lascia la pagina durante la conferma | AC16 |
| Sposta | un contatto ha avuto un esito fra anteprima e conferma | AC26, AC27 |
| Sposta | tutti i contatti scelti sono cambiati | AC26 |
| Assegna | su una Wave scaduta | AC10, AC17 |
| Primo passo, Proroga | salvataggio della scadenza fallito, incerto o rifiutato | AC7, AC16, AC20 |
| Pagina | caricamento, errore con «Riprova» | AC38 |
| Primo passo | Wave con 0 da assegnare | AC8 |
| Primo passo | Wave completata prima della traccia dei clienti | AC29, open question 3 |
| Pagina | Standard, id inesistente, import non completato | AC1 |
| «Quali contatti» | un'opzione a 0 | AC24 |

## Leaving and interrupting
- «Annulla» al primo passo → panoramica, Wave senza scadenza, «Scadenza da confermare» (AC9).
- Uscita dopo «Avanti» → la scadenza resta, la panoramica offre «Assegna» (AC7).
- Indietro del browser o un link → scelte non confermate scartate senza domande (AC9).

## Accessibility
- Il fuoco va sul titolo a ogni cambio di passo, di schermata di fine e di flusso; Invio ripetuto non salta i passi (AC31).
- Il riepilogo è annunciato una volta per cambio (AC14).
- I numeri delle tabelle si leggono con la loro colonna; tutta la riga si sceglie (AC32).
- Errore di «Quanti» collegato al campo (AC13, AC24); fuoco nel campo inline solo con clic o Spazio (AC24).
- Task accessibility fixes (AC33).
- Manual checks still needed: NVDA e VoiceOver dopo «Avanti», dopo la schermata di fine e dopo «Riassegna…»; riepilogo con cambi veloci; avviso della Wave scaduta all'apertura; F8 sul toast di fine import (Constraints).

## Persona dependencies
- L'import tiene la traccia dei clienti, che la pagina legge (AC29).
- L'operatore trova i contatti assegnati in Da chiamare, ordinati per scadenza della Wave (AC17, AC28).
- home-admin apre questa pagina dai suoi «Assegna» e «Apri» (AC2).
- Fino all'«oggi» con le Wave, i testi di fine non promettono la home (AC17).

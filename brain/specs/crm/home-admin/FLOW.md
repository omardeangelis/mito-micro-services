---
domain: crm
type: flow
links:
  - "[[specs/crm/home-admin/SPEC]]"
  - "[[personas]]"
  - "[[specs/crm/home-operatore/SPEC]]"
  - "[[specs/crm/assegnazione-wave/SPEC]]"
created: 2026-11-01
updated: 2026-11-05
---

# Flow map: Home dell'admin

> Map of [[specs/crm/home-admin/SPEC]]. Every requirement cites an acceptance criterion there; `SPEC.md` is the contract.
> Source: `ux-advisor` review of the prototype at `apps/web/src/prototypes/home-admin/` (`/dashboard/prototypes/home-admin`), 2026-11-01, verdict `proceed with decisions`.
> 2026-11-03: il riquadro «Assegna contatti» è passato a [[specs/crm/assegnazione-wave/SPEC|assegnazione-wave]], con la sua mappa [[specs/crm/assegnazione-wave/FLOW]]. Qui resta il pulsante «Assegna» che apre la pagina della Wave.
> 2026-11-04: una Wave senza clienti senza operatore si apre con «Apri»; tolta la riga di AC40.

## Goal
L'admin vede com'è andata la giornata del team, quanto delle ultime Wave è stato lavorato e chi è indietro, e da lì apre la pagina di una Wave per assegnarla. La prova sono i numeri di «Ultimi import» e di «Dettaglio giornaliero» (AC9, AC10, AC28).

## Persona situations
Segmenti da [[personas]]. Tutti su PC fisso, da 1024 a 1920 px (Constraints di SPEC.md; AC46, AC50).
- **Admin** × `/dashboard` × `ADMIN` non disattivato × 15 operatori e 8 admin, Wave da 6–9 mila clienti: guarda «Ultimi import» e preme «Assegna» sulla riga di una Wave, che apre la sua pagina (AC10, AC13).
- **Admin** con un operatore inattivo: lo vede in ambra in «Dettaglio giornaliero» («Inattivo da <N> giorni», AC28) e nel dettaglio dell'import («mai chiamati da chi è inattivo», AC12); lo spostamento dei suoi contatti si fa nella pagina della Wave, che si apre con «Assegna» o con «Apri» (AC13).
- **Admin** con una Wave scaduta e tutti i clienti assegnati: legge «scaduta · <N> da fare» (AC10) e apre la pagina con «Apri», per prorogarla o riassegnarla (AC13).
- **Admin** che fa anche qualche chiamata: vede i suoi richiami in «I tuoi richiami» e li apre con «Lavorali» (AC6).
- **Rosario (proprietario)** × `ADMIN`: guarda solo la fascia in alto, dove legge «<K> su <M> hanno chiamato», con gli admin compresi in M (AC6), e da lì va in Analisi (AC5).
- **Operatore** × `OPERATORE`: non vede questa home (AC1). Qui è la persona di cui l'admin guarda i numeri (AC27, AC28).

## Entry points
- `/dashboard` da `ADMIN` non disattivato; un `OPERATORE` vede la sua home (AC1).
- Senza sessione, da admin disattivato o senza riga operatore: nessun dato (AC2).

## Happy path
1. Apre la home → saluto, azioni rapide e quattro numeri di oggi (AC4, AC5, AC6).
2. Guarda «Ultimi import» → le ultime 4 Wave, con il dettaglio della più recente aperto (AC8, AC9, AC10, AC11, AC12).
3. Preme «Assegna» sulla riga di una Wave → si apre la pagina della Wave (AC13).
4. Scende a «Dettaglio giornaliero» → vede chi è indietro e apre il dettaglio di una persona (AC27, AC28, AC29).
→ Outcome: l'admin sa dove intervenire e arriva alla Wave da assegnare con un clic (AC10, AC13).

## States
| Action or region | Outcome, state, or interruption | Criterion |
|---|---|---|
| «Assegna» | apre la pagina della Wave, dalla riga di un import o del team | AC13 |
| «Apri» | Wave senza clienti senza operatore: apre la sua pagina | AC13 |
| «Assegna» del team | disattivato: «Ultimi import» non caricato o in errore, nessuna Wave elencata con clienti senza operatore | AC13 |
| Ogni parte | caricamento | AC30, AC47 |
| Ogni parte | errore, con «Riprova» | AC30, AC49 |
| Ogni parte | ritorno da un'altra pagina, per esempio dopo un'assegnazione | AC30 |
| «Ultimi import» | nessun import Wave | AC8 |
| «Ultimi import» | import con 0 clienti | AC10 |
| Barra | clienti con operatore, senza contatto | AC10 |
| Dettaglio di un import | aperto mentre un altro si chiude | AC11, AC39 |
| Dettaglio di un import | nessuno ha contatti della Wave | AC12 |
| «I tuoi richiami» | nessuno per oggi | AC6 |
| Numeri di oggi | prima della prima chiamata o risposta | AC6 |
| Dettaglio di una persona | clic su un cliente: il dettaglio si apre sopra la home, e chiudendolo l'admin è nel punto di prima | AC29 |

## Accessibility
- Il fuoco dopo «Riprova» va sul titolo della sezione (AC49).
- Chiudendo il dettaglio di un contatto il fuoco torna sul cliente da cui era stato aperto (AC29).
- Nomi dei pulsanti «Assegna» e «Apri», dei dettagli, dei gruppi e della barra di avanzamento (AC31).
- Controllo manuale ancora da fare, con NVDA e VoiceOver: cosa si sente dopo «Riprova» (Constraints di SPEC.md; AC49).

## Persona dependencies
- «Assegna» e «Apri» aprono la pagina della Wave di [[specs/crm/assegnazione-wave/SPEC|assegnazione-wave]], che assegna e sposta i contatti (AC13).
- «Lavorali» apre `/dashboard/lavoro`, la vista che crea [[specs/crm/home-operatore/SPEC|home-operatore]]: questa home non esce prima di quella rotta (AC6; Constraints di SPEC.md).
- Chiamate, tassi e arretrati vengono dal registro delle chiamate e dagli alert della spec «Esiti, richiami e stati del contatto», che va prima (AC6, AC7, AC28, AC29).
- «Ultimi import» legge la traccia dei clienti di ogni import, di [[specs/crm/assegnazione-wave/SPEC|assegnazione-wave]] (AC9, AC10; Constraints di SPEC.md).
- La voce scelta del ToggleGroup è corretta in [[specs/crm/design-system-web/SPEC|design-system-web]] (AC48).
- I toast restano in basso a destra e possono coprire i comandi delle righe più basse mentre sono a schermo (open question 14).

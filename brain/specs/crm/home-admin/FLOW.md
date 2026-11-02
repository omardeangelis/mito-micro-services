---
domain: crm
type: flow
links:
  - "[[specs/crm/home-admin/SPEC]]"
  - "[[personas]]"
  - "[[specs/crm/home-operatore/SPEC]]"
created: 2026-11-01
updated: 2026-11-02
---

# Flow map: Home dell'admin

> Map of [[specs/crm/home-admin/SPEC]]. Every requirement cites an acceptance criterion there; `SPEC.md` is the contract.
> Source: `ux-advisor` review of the prototype at `apps/web/src/prototypes/home-admin/` (`/dashboard/prototypes/home-admin`), 2026-11-01, verdict `proceed with decisions`.

## Goal
L'admin vede com'è andata la giornata del team e assegna i contatti di una Wave dalla home, senza passare da Clienti. La prova è il toast dell'esito e i numeri nuovi in «Ultimi import» e in «Dettaglio giornaliero» (AC26).

## Persona situations
Segmenti da [[personas]]. Tutti su PC fisso, da 1024 a 1920 px (Constraints di SPEC.md; AC46, AC50).
- **Admin** × `/dashboard` × `ADMIN` attivo × 15 operatori e 8 admin, Wave da 6–9 mila clienti × conosce l'assegnazione massiva di Clienti: assegna dalla riga di un import, con l'anteprima Ora / Cambia / Dopo prima della conferma (AC14, AC15, AC18).
- **Admin** con un operatore fermo (per esempio 1.099 mai chiamati): per toglierglieli parte dalla riga di un import con «Assegnati e mai chiamati», una Wave alla volta (AC19). L'«Assegna» sulla riga di quell'operatore gli darebbe altri contatti, perciò parte con «Quanti» vuoto e dice che è fermo (AC15, AC20).
- **Admin** che fa anche qualche chiamata: vede i suoi richiami in «I tuoi richiami» e li apre con «Lavorali» (AC6).
- **Rosario (proprietario)** × `ADMIN`: guarda solo la fascia in alto, dove legge «<K> su <M> hanno chiamato», con gli admin compresi in M (AC6), e da lì va in Analisi (AC5).
- **Operatore** × `OPERATORE`: non vede questa home (AC1). Qui è la persona di cui l'admin guarda i numeri e a cui assegna contatti (AC27, AC28).

## Entry points
- `/dashboard` da `ADMIN` attivo; un `OPERATORE` vede la sua home (AC1).
- Senza sessione, da admin disattivato o senza riga operatore: nessun dato e nessuna assegnazione (AC2).

## Happy path
1. Apre la home → saluto, azioni rapide e quattro numeri di oggi (AC4, AC5, AC6).
2. Guarda «Ultimi import» → le ultime 4 Wave, con il dettaglio della più recente aperto (AC8, AC9, AC10, AC11, AC12).
3. Preme «Assegna» sulla riga di una Wave → si apre «Assegna contatti» con «Senza operatore», «Secondo il ritmo», gli operatori attivi e «Quanti» al massimo (AC14, AC15).
4. Cambia divisione o persone → l'anteprima per persona e il riepilogo si aggiornano (AC17, AC18, AC20).
5. Conferma «Assegna <N> a <K> operatori» → «Assegnazione in corso…», riquadro bloccato (AC21).
6. Arriva la risposta → il riquadro si chiude, il toast dice cosa è stato assegnato e a chi, il fuoco torna su «Assegna» (AC26, AC31).
7. Scende a «Dettaglio giornaliero» → vede chi è indietro e apre il dettaglio di una persona (AC27, AC28, AC29).
→ Outcome: i contatti della Wave sono assegnati, tutto o niente, e i numeri della home sono quelli di dopo (AC24, AC26).

## States
| Action or region | Outcome, state, or interruption | Criterion |
|---|---|---|
| Conferma | riuscita | present |
| Conferma | lenta: in corso | AC21 |
| Conferma | numeri cambiati (quattro casi) | AC25 |
| Conferma | altro errore dichiarato dal server | AC25 |
| Conferma | esito incerto: rete, 5xx, risposta illeggibile | AC43 |
| Conferma | stessa richiesta arrivata due volte | AC43 |
| Conferma | sessione assente o admin disattivato | AC43 |
| Conferma | utente `OPERATORE` o senza riga operatore | AC43 |
| Conferma | parziale: non esiste | AC24 |
| Conferma | uscita dalla home durante l'invio | AC44 |
| Conferma | ricarica o scheda chiusa durante l'invio | AC44 |
| Conferma | rilettura fallita, Wave o riga sparite dopo la rilettura | AC44, AC31 |
| Conferma | ritorno alla home prima della risposta | AC44 |
| Riquadro | aperto da una riga del team | AC15, AC20 |
| Riquadro | clic fuori con scelte cambiate | AC42 |
| Riquadro | clic su un altro comando della home mentre è aperto | AC42 |
| Ogni parte | rilettura dopo una conferma | AC30 |
| Riquadro | più alto della finestra | AC41 |
| Riquadro | nessuno scelto, «Quanti» fuori dai limiti, niente da assegnare | AC20 |
| Toast | sopra il pulsante su cui torna il fuoco, o su un comando che riceve il fuoco mentre è a schermo | AC45, open question 14 |
| Ogni parte | caricamento | AC30, AC47 |
| Ogni parte | errore, con «Riprova» | AC30, AC49 |
| «Assegna» | sezioni non caricate o in errore | AC13 |
| «Ultimi import» | team in errore | AC40 |
| «Ultimi import» | nessun import Wave | AC8 |
| «Ultimi import» | import con 0 clienti | AC10 |
| Barra | clienti con operatore, senza contatto | AC10 |
| Dettaglio di un import | aperto mentre un altro si chiude | AC11, AC39 |
| Dettaglio di un import | nessuno ha contatti della Wave | AC12 |
| «I tuoi richiami» | nessuno per oggi | AC6 |
| Numeri di oggi | prima della prima chiamata o risposta | AC6 |

## Accessibility
- Riquadro «Assegna»: il fuoco entra, Tab resta dentro, Esc chiude (non durante l'invio), e alla chiusura il fuoco torna sul pulsante che l'ha aperto, o sul titolo della sezione se quel pulsante non c'è più o è disattivato. Durante l'invio e dopo una conferma non riuscita il fuoco resta sulla conferma (AC21, AC31, AC42, AC44).
- Dopo una conferma riuscita il toast non copre il pulsante a fuoco (AC31, AC45).
- Il riepilogo è annunciato in modo educato a ogni cambio, compresi i messaggi d'errore dell'assegnazione (AC20, AC25, AC43); il toast dell'esito si annuncia nella regione delle notifiche di [[specs/crm/toast-sonner/SPEC|toast-sonner]], da verificare a mano (Constraints di SPEC.md).
- Correzioni del compito: il nome del riquadro, i numeri di ogni persona nell'anteprima, il fuoco dopo «Riprova» (AC49).
- Nomi dei pulsanti «Assegna», dei dettagli, dei gruppi e della barra di avanzamento (AC31).
- Controlli manuali ancora da fare, con NVDA e VoiceOver: il nome del riquadro all'apertura e ora / cambio / dopo sulle caselle; il riepilogo annunciato una volta sola; il toast annunciato in «Notifiche (F8)» e il fuoco su «Assegna»; cosa si sente dopo «Riprova» (Constraints di SPEC.md; AC20, AC26, AC31, AC49).

## Persona dependencies
- L'admin assegna; l'operatore che riceve trova i contatti nuovi fra i suoi da chiamare, e chi cede li perde (AC22, AC23).
- «Lavorali» apre `/dashboard/lavoro`, la vista che crea [[specs/crm/home-operatore/SPEC|home-operatore]]: questa home non esce prima di quella rotta (AC6; Constraints di SPEC.md).
- Chiamate, tassi e arretrati vengono dal registro delle chiamate e dagli alert della spec «Esiti, richiami e stati del contatto», che va prima (AC6, AC7, AC28, AC29).
- La voce scelta del ToggleGroup si corregge in [[specs/crm/design-system-web/SPEC|design-system-web]] prima di questa home (AC48).
- La posizione dei toast si decide nel design system (AC45, open question 14).

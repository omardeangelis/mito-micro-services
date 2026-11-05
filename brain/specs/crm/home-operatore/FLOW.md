---
domain: crm
type: flow
links:
  - "[[specs/crm/home-operatore/SPEC]]"
  - "[[personas]]"
  - "[[specs/crm/assegnazione-wave/SPEC]]"
created: 2026-11-01
updated: 2026-11-05
---

# Flow map: Home dell'operatore — «Lavora da qui»

> Map of [[specs/crm/home-operatore/SPEC]]. Every requirement cites an acceptance criterion there; `SPEC.md` is the contract.
> Source: `ux-advisor` review of the prototype at `apps/web/src/prototypes/home-operatore/` (`/dashboard/prototypes/home-operatore`), 2026-11-01, verdict `iterate`.

## Goal
L'operatore apre la home la mattina, registra l'esito di ogni richiamo scaduto o di oggi senza lasciare la pagina, e ritrova in «Fatti oggi» ogni chiamata fatta, con l'esito e l'ora (AC11, AC17, AC23, AC28, AC30).

## Persona situations
- Operatore × `/dashboard` × `OPERATORE` × PC fisso da 1024 px × giornata tipica (una decina di richiami, 23 chiamate) × non abituato a un CRM — vede solo i propri richiami e le proprie chiamate (AC1, AC2, AC43).
- Operatore × `/dashboard` × `OPERATORE` × PC fisso × giornata piena (64 scaduti + 192 di oggi, 57 chiamate) × come sopra — tutte le righe sono nella tabella, e raggiunge «Fatti oggi» con «Vedi le chiamate» invece di scorrere 15.000 px o attraversare 1.296 fermate di Tab (AC14, AC41).
- Operatore × `/dashboard` × `OPERATORE` × PC fisso × qualunque volume × abituato all'app Next.js — usa «Richiamare» per «devo richiamarlo» anche senza risposta; il riquadro gli ricorda di usare Non risponde (AC18).
- Operatore × `/dashboard` × `OPERATORE` × PC fisso × nuovo, senza richiami — vede da dove partire, la lista o chi gli assegna i contatti (AC24).
- Admin × indirizzo dedicato (OQ2) da «Lavorali» della sua home × `ADMIN` × PC fisso × pochi richiami propri × abituato ai CRM — stessa vista, con i suoi dati (AC4).
- Chi usa solo la tastiera o un lettore di schermo × come sopra — ogni passo ha un fuoco e un annuncio definiti (AC23, AC26, AC38, AC41, AC46, AC50).

## Entry points
- `/dashboard` con una sessione `OPERATORE` (AC1); senza sessione, il login (AC3).
- L'indirizzo dedicato della vista, per un `ADMIN` o un `OPERATORE` (AC4, OQ2).
- Il ritorno alla home da un'altra pagina, per esempio dalla lista Contatti: le quattro parti mostrano i dati del momento (AC36).
- La chiusura del dettaglio di un contatto aperto dalla home: l'utente è nel punto di prima (AC53).

## Happy path
1. Apre la home → saluto, giorno, «Il mio oggi» e «Da chiamare» in alto; sotto «Richiami da fare» con «Scaduti · N» e «Di oggi · M», poi «Fatti oggi» (AC5–AC9, AC11–AC13, AC28).
2. Legge la riga in cima → nome, telefono e messaggio dell'alert, da quanto è scaduto, stato del contatto (AC15, AC16).
3. Chiama e il cliente non risponde → «Non risponde»: la riga resta aperta con «tentato alle HH:mm», il fuoco resta sul pulsante (AC22, AC26).
4. Chiama e fissa l'appuntamento → «Appuntamento»: avviso «Registrato: Appuntamento · <cliente>», la riga resta al suo posto chiusa con «Appuntamento registrato alle HH:mm», i conteggi scendono, il fuoco va al cliente della riga aperta seguente (AC17, AC23, AC25).
5. Il cliente vuole essere richiamato → «Richiamare»: il riquadro a sinistra del pulsante, fuoco su domani; sceglie il giorno, scrive il messaggio, «Salva richiamo del gg/mm» (AC18–AC20, AC45, AC46).
6. Il salvataggio riesce → il riquadro si chiude, la riga si chiude con «Richiamo il gg/mm registrato alle HH:mm» (AC20, AC23).
7. Ogni chiamata registrata → in cima a «Fatti oggi», contata in «Il mio oggi», «Da chiamare» aggiornato, senza ricaricare (AC35, AC8).
8. A metà giornata vuole vedere cosa ha fatto → «Vedi le chiamate»: «Fatti oggi» a schermo, fuoco sul titolo (AC41).
9. Vuole vedere il contatto prima di chiamarlo → clic sul nome: il dettaglio si apre sopra la home; chiudendolo è nel punto di prima, con il fuoco sul nome (AC53).
10. Cerca il cliente a cui ha messo un richiamo → lo ritrova in «Fatti oggi» con «Richiamo · gg/mm» e il messaggio (AC29, AC30, AC33).
→ Outcome: i richiami lavorati sono chiusi o tentati, e «Fatti oggi» e «Il mio oggi» contano le stesse chiamate (AC8, AC23, AC28).

## States
| Action or region | Outcome, state, or interruption | Criterion |
|---|---|---|
| Esiti e «Salva richiamo» | riuscita, Non risponde | AC22 |
| Esiti e «Salva richiamo» | riuscita, esito che chiude l'alert | AC23 |
| Esiti e «Salva richiamo» | lenta: «Registro…», riga bloccata | AC26 |
| Esiti | doppio clic nello stesso punto | AC26 |
| Esiti e «Salva richiamo» | incerta (rete, 5xx, nessuna risposta in 15 secondi) | AC48 |
| Esiti e «Salva richiamo» | l'utente lascia la home durante la registrazione | AC52 |
| Esiti | l'utente lavora un'altra riga mentre la prima registra | AC23, AC26 |
| Esiti e «Salva richiamo» | rifiutata (contatto passato a un altro, sostituito, richiamo da confermare, stato che non lo ammette) | AC27 |
| Esiti e «Salva richiamo» | alert già lavorato: la riga si chiude con «Già lavorato da <nome> alle HH:mm» | AC27 |
| «Salva richiamo» | giorno già passato | AC27 |
| Esiti e «Salva richiamo» | sessione scaduta | AC27 |
| «Salva richiamo» | messaggio oltre 500 caratteri | AC47 |
| «Salva richiamo» | Invio senza giorno | AC50 |
| Riquadro «Richiamare» | chiuso senza salvare, poi riaperto | AC21 |
| Riquadro «Richiamare» | Esc o clic fuori durante il salvataggio | AC20 |
| Riquadro «Richiamare» | aperto vicino al bordo della finestra | AC45 |
| Righe chiuse | nuovo caricamento della home (escono) o ricarica della sezione (restano) | AC23 |
| Righe aperte | non più dell'utente alla ricarica della sezione: si chiudono al loro posto | AC23, AC27 |
| Quattro parti | ritorno alla scheda del browser | AC36 |
| Dettaglio aperto dalla home | chiuso con X, Esc, clic fuori o indietro: punto di prima, dati aggiornati | AC23, AC53 |
| Dettaglio aperto dalla home | passaggio a un altro contatto, ricarica dell'indirizzo, errore nel dettaglio | AC53 |
| Righe a schermo | lavorate da un collega nel frattempo | AC27 |
| Richiami da fare | vuoto, con o senza contatti da chiamare | AC24 |
| Fatti oggi | vuoto | AC34 |
| Fatti oggi | più di 8 chiamate | AC33 |
| Quattro parti | caricamento | AC38 |
| Quattro parti | errore, «Riprova» | AC39, AC50 |
| Quattro parti | aggiornamento fallito: contenuto a schermo, errore sopra | AC37, AC39 |
| Esiti e «Salva richiamo» | risposta arrivata dopo i 15 secondi: la pagina non cambia | AC48 |
| Quattro parti | una in errore, le altre usabili | AC37 |

## Accessibility
- Registrare un esito: durante l'attesa il fuoco resta sul pulsante; dopo Non risponde resta lì, dopo gli altri esiti va al cliente della riga aperta seguente (se l'utente non l'ha spostato altrove), dopo un rifiuto o un esito incerto resta sul pulsante, e se la ricarica chiude la riga va come dopo una riga chiusa (AC23, AC26).
- Riquadro «Richiamare»: dialogo con il nome del titolo, il fuoco entra sul giorno di domani (o della bozza), Esc chiude tranne durante il salvataggio e il fuoco torna su «Richiamare» (AC46).
- «Vedi le chiamate» porta il fuoco sul titolo «Fatti oggi», saltando le righe dei richiami (AC41).
- Dettaglio del contatto: chiudendolo il fuoco torna sul link da cui era stato aperto (AC53).
- Annunci: l'avviso di ogni esito (AC25, AC27, AC48), il caricamento (AC38), l'errore (AC39), il ritorno dei dati dopo «Riprova» (AC50).
- Correzioni per il compito: «Riprova», Invio senza giorno, messaggio dell'alert al fuoco (AC50); calendario in italiano e riquadro d'errore (AC51).
- Manual checks still needed (VoiceOver + Chrome, Constraints della spec): Invio su «Appuntamento» della seconda riga e passaggio del fuoco alla riga seguente; apertura di «Richiamare»; «Riprova» con i richiami in errore.

## Persona dependencies
- L'Admin assegna o sposta contatti a metà giornata, anche dalla pagina della Wave: una riga già a schermo dell'operatore può non essere più sua, e la registrazione è rifiutata con il nome del nuovo operatore e il link al contatto (AC27).
- Lo stesso alert nella home dell'assegnatario e del titolare del cliente: la seconda registrazione si chiude come già lavorata (AC27).
- I contatti di una Wave arrivano nel numero «Da chiamare» e nell'ordine della lista; l'«oggi» con le Wave è fuori (AC9; Non-Goals di SPEC.md; [[specs/crm/assegnazione-wave/SPEC|assegnazione-wave]]).
- Una chiamata registrata dal dettaglio del contatto compare in «Fatti oggi» alla chiusura (AC28, AC53).
- Alert aperti dopo la scadenza, registro delle chiamate, sei stati, rifiuti di «Registra chiamata» e lo stesso invio contato una volta: spec «Esiti, richiami e stati del contatto» (Prerequisito della spec, open question 13).
- «Apri la lista» apre la lista Contatti con «Solo i miei», Da chiamare e Non risponde, e il totale coincide (AC10).

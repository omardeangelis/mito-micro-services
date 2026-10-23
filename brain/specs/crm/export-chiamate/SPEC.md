---
domain: crm
type: spec
status: implemented
links:
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/seeder-locale/SPEC]]"
  - "[[chore/migrazione-gcp]]"
created: 2026-10-23
updated: 2026-10-23
---

# Spec: Export chiamate per operatore, solo admin

---

## User input

> ora vorrei iniziare con la revisione del codice del dominio dell'export
> Oltre  che migrare tutto ad effect e ad avere una grossa attenzione alle performance del sito, bisogna farre anche delle modifiche richieste dal cliente:
>
> * solo l'admin può fare gli export, ed è proprio per loro che va pensato
> * vogliono che l'export sia solo delle chiamate
> * vogliono avere Chiamata effettuate, totale rispsota, totale appuntamenti fissati, totale non risposte, per singolo operatore.
>
> Possiamo anche pensare di introdurre qualche grafico che rappresenti in maniera più chiara

Decisioni di Leonardo (2026-10-22), dalle domande di chiarimento:

> Come contiamo le "non risposte", visto che l'esito non esiste? → **Nuovo esito "non risponde"**

> ok e fai la pr separata

> Quando deve tornare in coda un contatto "non risponde"? → **Resta subito in coda**

---

## Context

Il cliente vuole misurare il lavoro degli operatori sulle chiamate. Oggi l'export lo fa chiunque, admin e operatori, e contiene due cose diverse: clienti e pratiche ("default") e l'elenco delle chiamate chiuse, con le note della chat di ogni cliente. Non dà nessun totale per operatore e non distingue chi ha risposto da chi no.

L'export diventa uno strumento dell'**admin**: un periodo scelto, una riga per operatore con quattro numeri (chiamate effettuate, risposte, appuntamenti fissati, non risposte), e dei grafici che mostrano gli stessi numeri a colpo d'occhio. Gli **operatori** non esportano più nulla.

Per contare le non risposte serve un dato che oggi non c'è: lo stato del contatto `non risponde`. Un contatto che non risponde resta in coda, così l'operatore lo richiama senza altri passaggi.

Il dominio export è anche il pilota della riscrittura del backend in Effect: il comportamento qui sopra è quello nuovo richiesto dal cliente, e i test lo fissano prima della riscrittura.

---

## Non-Goals

- L'export "default" (clienti e pratiche): sparisce, non viene riscritto.
- Gli altri numeri della dashboard (finanziato medio, chiamate completate, importi per sede): restano come sono.
- Ricostruire le chiamate fatte prima che esistesse il registro delle azioni sui contatti (15/09/2026).
- Il ritorno automatico in coda dopo un tempo, o un richiamo automatico, per i contatti `non risponde`: restano in coda da subito.
- Esportare per gli operatori i propri numeri.
- Cambiare chi vede o modifica i contatti.

---

## Definizioni

- **Chiamata effettuata**: un cambio di stato fatto da un operatore, a mano (dalla lista o dal dettaglio del contatto), da uno stato "da chiamare" (`chiamare`, `followup`, `non risponde`) o da `richiamare`, verso un esito (`app.to`, `caricato`, `erogata`, `non interessato`, `richiamare`) o verso `non risponde`. Conta per l'operatore che ha fatto il cambio, nel giorno in cui l'ha fatto. Ogni cambio conta una volta: lo stesso contatto chiamato tre volte nel periodo fa tre chiamate.
- **Non risposta**: una chiamata effettuata il cui stato di arrivo è `non risponde`.
- **Risposta**: una chiamata effettuata che non è una non risposta (effettuate = risposte + non risposte).
- **Appuntamento fissato**: una chiamata effettuata il cui stato di arrivo è `app.to`. È anche una risposta.
- **Periodo**: dal primo all'ultimo giorno scelti, inclusi, nel fuso di Roma.

---

## Acceptance Criteria

### Stato "non risponde"

- AC1. Un contatto può essere messo a mano nello stato `non risponde` da qualunque stato da cui oggi si può scegliere un esito; `non risponde` compare tra gli stati del selettore e dei filtri di Contatti.
- AC1b. Da `non risponde` si può passare a mano a ogni esito e a `nessuno`, mai a `chiamare` né a `followup`: il selettore non li offre e una richiesta che li chiede è rifiutata come transizione non ammessa, senza modificare nulla.
- AC2. Passare da `chiamare` o `followup` a `non risponde` non valorizza "Contattato il", lascia il contatto attivo e assegnato allo stesso operatore, e scrive una riga di cambio stato nel registro.
- AC2b. Da `richiamare` a `non risponde` "Contattato il" resta quello di prima.
- AC3. Da `non risponde` a un esito il contatto si chiude come da `chiamare`: "Contattato il" prende la data del cambio.
- AC4. Dopo il ricalcolo notturno delle priorità, un contatto `non risponde` senza priorità personalizzata ha priorità 100: sotto `chiamare` (120), sopra tutti gli altri stati.
- AC5. Su un contatto `non risponde` "Imposta richiamo" non è disponibile, come su `chiamare`.

### Chi esporta

- AC6. Un utente non admin non vede il comando di export in nessuna pagina.
- AC7. Una richiesta dei dati dell'export fatta da un utente non admin è rifiutata con errore `FORBIDDEN` e non restituisce nessun dato.
- AC8. Una richiesta senza sessione è rifiutata con errore `UNAUTHORIZED`.

### Contenuto

- AC9. L'admin sceglie un periodo e ottiene, per ogni operatore che ha almeno una chiamata effettuata nel periodo, nome e cognome e i quattro totali: chiamate effettuate, risposte, appuntamenti fissati, non risposte.
- AC10. I totali seguono le definizioni: un cambio da `richiamare` ad `app.to` è una chiamata effettuata e un appuntamento; un cambio da un altro esito (`app.to`, `caricato`, `erogata`, `non interessato`) a un esito, da un esito a `chiamare`, o fatto da un'azione massiva o dal sistema, non è una chiamata effettuata.
- AC11. Un cambio fatto il primo o l'ultimo giorno del periodo, a qualunque ora del giorno a Roma, è contato; uno fatto il giorno prima o il giorno dopo no.
- AC11b. Il primo giorno selezionabile è il giorno dopo quello di 3 mesi fa, l'ultimo è oggi; se inizia prima del 15/09/2026 un avviso dice "Dati completi solo dal 15/09/2026".
- AC12. Le righe degli operatori sono in ordine di chiamate effettuate decrescenti, a parità per cognome e nome. Una riga finale riporta la somma dei quattro totali su tutti gli operatori.
- AC13. Il file scaricato è un foglio Excel con un solo foglio, una riga per operatore più la riga dei totali, e le colonne "Operatore", "Chiamate effettuate", "Risposte", "Appuntamenti fissati", "Non risposte". Il nome del file è `chiamate_<primo giorno>_<ultimo giorno>.xlsx`, con i giorni in formato `AAAA-MM-GG`.
- AC14. Un periodo senza chiamate effettuate dà un messaggio "Nessuna chiamata nel periodo" e nessun file.
- AC15. L'export "default" (clienti e pratiche) e l'elenco delle chiamate chiuse con le note non sono più disponibili.

### Grafici

- AC16. Nella dashboard l'admin sceglie un periodo, con le stesse regole di AC11b, che vale sia per i grafici sia per il file; vede quattro indicatori con i totali del periodo.
- AC17. L'admin vede un grafico a barre con, per ogni operatore, risposte e non risposte impilate.
- AC18. L'admin vede una classifica degli operatori per quota di appuntamenti fissati sulle risposte, in percentuale decrescente, a parità per cognome e nome; un operatore senza risposte compare con 0%.
- AC19. Grafici e indicatori mostrano gli stessi numeri del file per lo stesso periodo.
- AC20. Un operatore non vede grafici né indicatori dell'export.

### Prestazioni

- AC21. Con 100.000 cambi di stato nel periodo, distribuiti su 30 operatori, la richiesta dei dati dell'export risponde in meno di 500 ms: mediana di 10 richieste consecutive, misurata sul server in locale dopo una prima richiesta di riscaldamento.
- AC22. La risposta contiene solo i totali per operatore: nessun dato di clienti, telefoni o note.

---

## Constraints

- Le PR che toccano permessi le rivede Leonardo e non si uniscono in autonomia (AC6–AC8, AC20).
- Il backend nuovo va scritto in Effect, con i test sul comportamento nuovo prima della riscrittura (pilota Effect, regole in `CLAUDE.md`).
- La riscrittura resta su branch in draft fino al go/no-go della prod GCP ([[chore/migrazione-gcp]]); lo stato `non risponde` segue lo stesso vincolo, perché richiede una migrazione dell'enum.
- Il registro delle azioni sui contatti esiste dal 15/09/2026 e la pulizia notturna ne cancella le righe più vecchie di 3 mesi: i periodi possibili sono limitati da questo.
- PR piccole e separate (preferenza di Leonardo).

---

## Technical Notes

- Lo stato `non risponde` e il suo comportamento in coda sono già in due PR draft: #57 (enum, migrazione, dominio) e #61 (stato aperto, priorità 100, scenario P13 del seed locale), impilata su #57.
- Oggi l'export passa da un web worker che scarica le righe, una richiesta di messaggi per cliente, costruisce il file nel browser, lo carica nello storage e lo riscarica; il cron `delete-export` pulisce i file. Con i soli totali per operatore il file può nascere nel browser senza passare dallo storage.
- Molte route sotto `src/app/api/export/[export]/` sono interamente commentate.
- La dashboard ha già Tremor tra le dipendenze.

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | Una richiamata (da `richiamare` a un esito o a `non risponde`) conta come chiamata effettuata? Default proposto: sì (Definizioni, AC10): è una telefonata vera e può fissare un appuntamento, mentre i cambi tra altri esiti (es. `app.to` → `caricato`) sono avanzamenti della pratica. | AC9, AC10 | Leonardo | Open |
| 2 | Oltre ai totali, il cliente vuole anche l'elenco delle singole chiamate (cliente, operatore, esito, data) in un secondo foglio? Default proposto: no, solo i totali (AC13, AC22). | AC13, AC22 | Leonardo | Open |
| 3 | I grafici stanno nella dashboard home o in una pagina admin a parte? Default proposto: dashboard home, sezione admin. | AC16–AC18 | Leonardo | Open |
| 4 | Un admin che ha anche una riga operatore e fa chiamate compare tra gli operatori? Default proposto: sì, come gli altri. | AC9 | Leonardo | Open |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Nuovo stato `non risponde` invece di usare `richiamare` (2026-10-22) | `richiamare` ha già il significato di "il cliente ha chiesto di essere richiamato"; solo un dato dedicato dà numeri veri. |
| `non risponde` resta subito in coda, priorità 100 (2026-10-22) | Il contatto non esce mai dalla coda e la chiamata resta tracciata; 100 lo mette subito dopo i contatti mai chiamati. |
| Le chiamate si contano dal registro dei cambi di stato, non da "Contattato il" | "Contattato il" tiene solo l'ultima chiusura e non registra le non risposte. |
| Da `non risponde` non si torna a `chiamare` né a `followup` | Il contatto è già in coda; tornare a `chiamare` aggiungerebbe una via in più per aggirare il divieto `followup` → `chiamare` (oggi esiste già passando da `nessuno`). Va aggiunto a #61. |
| Periodo limitato agli ultimi 3 mesi | Il registro più vecchio di 3 mesi viene cancellato ogni notte: numeri parziali senza avviso sarebbero sbagliati. |
| Le azioni massive e del sistema non sono chiamate | Sono riassegnazioni o automatismi, non telefonate fatte dall'operatore. |
| L'export è solo dell'admin e contiene solo totali | Richiesta del cliente; niente dati personali dei clienti nel file. |

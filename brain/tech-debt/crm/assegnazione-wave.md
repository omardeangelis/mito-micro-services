---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/assegnazione-wave/SPEC]]"
  - "[[specs/crm/assegnazione-wave/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/assegnazione-wave/REPORT]]"
created: 2026-11-04
updated: 2026-11-04
---

# Tech debt: Import e assegnazione della Wave

## `jit` del Postgres di produzione e ordine della coda

Scoperto in T21 (`EXPLAIN ANALYZE` su `mito_local`).

- La scadenza della Wave nell'ordine della lista Contatti (AC28) è una sottoquery correlata. Il suo costo stimato (143.462 a volume di piano) supera `jit_above_cost`, e Postgres compila la query con JIT: 27–55 ms invece di 8,7 ms con `jit=off`.

**Effetto oggi:** nessuno sui dati. Se prod ha `jit` acceso, la lista Contatti per priorità può costare fino a ~300 ms in più per richiesta a volume pieno.

**Da fare:** leggere `SHOW jit` sul Postgres di produzione (sola lettura). Se è acceso, decidere fra `SET LOCAL jit = off` per quella query e una riscrittura della chiave.

## La ricostruzione della traccia non trova nulla in produzione

Scoperto in T2 (D14).

- La migrazione `20261104171940_wave_assignment_trace` ricostruisce la traccia delle Wave passate da `import_run`. Le Wave caricate in prod finora sono passate dal vecchio importer di Next.js, che non scriveva righe `import_run`.

**Effetto:** dopo il rilascio le Wave già caricate non compaiono fra le Wave da assegnare e i loro clienti non prendono la scadenza nella coda. Solo le Wave importate dopo il rilascio hanno la traccia.

**Deciso (Omar, 2026-11-04):** le Wave passate non si ricostruiscono. La pagina parte dalla prossima Wave importata dopo il rilascio.

## Nota di rilascio: niente import durante il deploy

- Un import che scrive fra la migrazione e il passaggio del traffico alla nuova revisione gira sul codice vecchio, che non scrive la traccia. La ricostruzione di D14 è idempotente e si può rilanciare per recuperarla.

**Da fare al rilascio:** non lanciare import durante la finestra del deploy, oppure rilanciare la ricostruzione dopo.

## Controlli con lettore di schermo non eseguiti

- I quattro controlli NVDA e VoiceOver di `IMPLEMENTATION-NOTES.md` (fuoco sul titolo, riepilogo letto una volta, avviso della Wave scaduta, toast raggiungibile con F8) non si possono fare da qui. I test controllano il markup (`aria-live`, fuoco), non la lettura.

**Da fare:** Omar li esegue sulla pagina vera prima del rilascio.

## Una proroga più lontana perde contro una più vicina salvata prima

Scoperto nelle correzioni dopo la revisione (v5).

- La proroga scrive solo sopra la scadenza letta. Due admin che prorogano dalla stessa scadenza, uno al 1° marzo e uno al 1° aprile: se il 1° marzo arriva prima, il 1° aprile riceve «scadenza cambiata» invece di vincere.

**Effetto:** l'admin vede l'errore, rilegge la Wave e riprova. Nessuna scadenza torna indietro.

**Da fare, se serve:** accettare una proroga più lontana della scadenza corrente anche quando questa è cambiata.

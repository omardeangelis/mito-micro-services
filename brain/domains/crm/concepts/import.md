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
  - "[[specs/crm/import-pratiche/REPORT]]"
  - "[[tech-debt/crm/import-pratiche]]"
  - "[[domains/crm/flows/nuovo-import-con-anteprima]]"
  - "[[domains/crm/flows/esecuzione-di-un-import-confermato]]"
  - "[[domains/crm/concepts/riga-dell-import]]"
created: 2026-10-26
updated: 2026-10-26
---

# Import

## Definition

Un **import** è quello che succede tra la conferma di un file da parte di un admin e il suo esito. È tutto o niente: o scrive tutte le righe confermate, con i loro legami, o non scrive nulla (AC19). Ne gira uno alla volta in tutto il CRM (AC22), continua anche se l'admin chiude la scheda (AC20) e resta nello storico (AC28). L'anteprima che lo precede non è un import: legge il CRM e non scrive nulla (AC7).

Ogni import è una riga di `import_run`. Le righe del file stanno in una tabella temporanea, `import_upload` con le sue parti, solo dalla conferma alla fine dell'import, al massimo un'ora (D14).

Solo gli `ADMIN` importano, tutti (OQ5). Un operatore non vede la pagina né i comandi, e ogni procedura `import.*` gli risponde `FORBIDDEN` (AC1, AC2).

## Attributes

| Attributo | Che cosa vale | Regola |
|---|---|---|
| Stato | `running`, `completed`, `failed`, `interrupted`; nello storico "In corso", "Completato", "Fallito", "Interrotto" | Al massimo un `running` (indice unico parziale `import_run_one_running`). Una riga `running` oltre la scadenza si legge `interrupted` anche prima che la pulizia la scriva |
| Inizio, admin | `started_at`, `started_by` | Nello storico in ora di Roma, con il nome dell'admin |
| Presa | `claimed_at` | Segnata da chi esegue: un task consegnato due volte non rifà nulla (D7) |
| Fine, durata | `finished_at` | Scritta con l'esito |
| File e formato | `file_name`, `format` (Wave o Standard) | Il nome del file come l'admin l'ha caricato |
| Righe | `rows_total`, `rows_discarded` | Scritte all'avvio, dalle righe confermate |
| Numeri di quello che ha scritto | clienti nuovi e aggiornati, pratiche nuove e aggiornate, legami nuovi | Null finché non è `completed`. Uguali a quelli dell'anteprima se nessuno ha cambiato il CRM nel frattempo (AC23) |
| Motivo | `failure_reason`, fino a 1.000 caratteri | Solo per `failed` e `interrupted`. Leggibile, senza valori delle righe: numero di riga e regola, o il codice di Postgres (AC29, AC31) |
| Scadenza | 30 minuti dall'inizio | Controllata tra un blocco di scritture e l'altro; oltre, rollback e `interrupted` (AC30, D8) |
| Righe temporanee | `import_upload` (admin, file, formato, numero di parti, `run_id`, righe attese) e `import_upload_part` (corpo gzip a parti) | Un upload accetta parti finché non ha un import collegato; si cancella a fine import o dalla pulizia a +1 ora |

Lo storico mostra solo questi dati, 20 import per pagina dal più recente (AC28): nessun nome, codice fiscale, telefono o importo delle righe (AC31).

## Related flows

- [[domains/crm/flows/nuovo-import-con-anteprima]]: anteprima, conferma e avvio.
- [[domains/crm/flows/esecuzione-di-un-import-confermato]]: coda, transazione, esiti, scadenza, pulizia e avviso.

Concetto vicino: [[domains/crm/concepts/riga-dell-import]] (che cosa entra nell'import e che cosa resta fuori).

## [Source: import-pratiche]

- Spec: AC19–AC31 e il Decision Log di [[specs/crm/import-pratiche/SPEC]] ("tutto o niente", "un import alla volta", "report errori senza storage"). Piano: D1, D7–D10, D13–D15 di [[specs/crm/import-pratiche/PLAN]].
- Schema in `packages/db/src/schema/importRun.ts`, migrazione `20261025014131_import_run`, solo additiva (PR C #81). I numeri restano null finché l'import non è `completed` (T7).
- Il report errori non è parte dell'import: nasce nel browser e non va né al server né allo storage (AC15).
- Dove gira: sul backend Cloud Run, quindi i limiti delle funzioni Vercel (60 secondi, corpo di 4,5 MB) non valgono. La coda è Cloud Tasks su staging e prod, in processo solo in locale, spenta altrove (D13).
- Review [[specs/crm/import-pratiche/REPORT]]: prima delle correzioni, le righe temporanee di un import fermato a metà restavano fino al prossimo import. Ora la pulizia lo porta a `interrupted` e le cancella (`ac3ec7e`). Se è giusto farlo anche quando nessuno avvia un altro import è una domanda per Leonardo nella checklist della review.

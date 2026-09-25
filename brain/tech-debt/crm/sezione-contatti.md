---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/sezione-contatti/SPEC]]"
  - "[[specs/crm/sezione-contatti/IMPLEMENTATION-NOTES]]"
created: 2026-09-25
updated: 2026-09-25
---

# Tech debt: Sezione Contatti

## Le migrazioni non ricostruiscono lo schema di produzione

Scoperto in T1.1–T1.2 (PR1), preesistente.

- `20240926195125_lucky_roughhouse` usa il tipo `task_status`, che nasce solo in `20260619152227_same_hemingway`: su un Postgres vuoto la prima migrazione fallisce.
- `alert.is_resolved` (`boolean DEFAULT false NOT NULL`) è negli snapshot da `20260615235953_brown_madelyne_pryor` ma in nessun file SQL. In prod c'è perché è arrivato con `db:push`; `db:generate` non lo emetterà mai.

**Effetto oggi:** nessuno in prod. Un DB nuovo creato con `pnpm db:migrate` (sviluppo, preview) non parte o non ha la colonna.

**Contromisura attuale:** l'harness di test (`src/test/db.ts`, `PUSHED_SCHEMA`) applica i due pezzi dove prod li ha ricevuti.

**Da fare fuori da questa spec:** una migrazione additiva e idempotente (`ADD COLUMN IF NOT EXISTS "is_resolved"`) e, per il tipo, una nota nel README o una migrazione "baseline". Poi `PUSHED_SCHEMA` si riduce di conseguenza.

## Nessun test esercita il lock del cliente

Scoperto nella review di PR1 (F5), accettato dal piano (D4) ma non dichiarato.

- PGlite ha una sola connessione: due transazioni non possono correre insieme, quindi `lockCustomer` (`SELECT … FOR UPDATE`) non si può mettere alla prova. Togliendo `.for("update")` da `src/server/effect/db.ts` tutti i test restano verdi.
- AC71 in concorrenza (cron, massiva e `createTask` sullo stesso cliente) si regge solo sulla lettura del codice: `lockCustomer` è il primo comando di ogni `transaction` che scrive un contatto, e `replaceActiveContact` accetta solo un `LockedCustomer`, che produce solo `lockCustomer`.

**Effetto oggi:** una regressione sul lock passerebbe la CI. Dopo PR2 l'indice unico la farebbe emergere in prod come errore 23505, non come dato sporco.

**Da fare fuori da questa spec:** un test di concorrenza su un Postgres vero (per esempio un servizio `postgres` nel job Test di `ci.yml`), con due transazioni sullo stesso cliente.

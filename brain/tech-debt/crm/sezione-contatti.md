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

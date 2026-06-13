---
task: F1.T5
phase: 1
title: Cutover del database di produzione
status: not_started
completed: false
depends_on: ["F1.T4"]
last_updated: 2026-06-11
---

# F1.T5 — Cutover database di produzione

## Obiettivo

Spostare la produzione dal Postgres Supabase al nuovo Postgres, con finestra di manutenzione breve. Da qui in poi il nuovo DB è la fonte di verità per **tutta** la migrazione (legacy e nuovo stack lo condividono).

## Prerequisiti

- F1.T4 completata senza anomalie; runbook con tempi misurati.
- `DATABASE_URL` di produzione già configurata su Vercel come env (non ancora usata: il fallback la ignora finché non esiste — doppio controllo che NON sia già definita prima del momento del cutover).
- Finestra concordata con gli utenti (app interna: bastano poche decine di minuti fuori orario; i cron girano tra le 00:00 e le 02:00 UTC — evitare quella fascia o disattivare temporaneamente i workflow).

## Step operativi (runbook)

1. **T-1 giorno**: backup manuale extra su Supabase; verificare che i backup automatici del nuovo Postgres siano attivi e che un restore di prova sia stato fatto almeno una volta.
2. **Inizio finestra**: attivare la modalità manutenzione — opzione semplice: env flag su Vercel + redeploy, o protezione password Vercel. Disattivare temporaneamente i 4 workflow cron prod (`workflow_dispatch` only) per evitare scritture durante il dump.
3. Dump fresco da Supabase → restore su produzione nuova (comandi identici a F1.T4, runbook alla mano).
4. `verify-migration.ts` Supabase ↔ nuovo prod → deve uscire 0.
5. Impostare/attivare `DATABASE_URL` su Vercel (production) → redeploy.
6. Smoke test di produzione (checklist F1.T4 punto 4, eseguita da un utente reale).
7. Riattivare i workflow cron; trigger manuale di `update:priority` come test immediato (è idempotente sui task senza `customPriority`).
8. **Revocare le scritture sul DB Supabase** (rollback rimane possibile in lettura):
   ```sql
   ALTER ROLE <ruolo_app_supabase> SET default_transaction_read_only = on;
   ```
   oppure semplicemente non distribuire più la vecchia connection string. NON cancellare il progetto Supabase (serve ancora lo storage fino alla fase 2; il DB resta come rollback ≥ 2 settimane).
9. Fine finestra: rimuovere la manutenzione, comunicare il completamento.

## Rollback (se la verifica o lo smoke test falliscono)

1. Rimuovere `DATABASE_URL` da Vercel → redeploy (il fallback rimanda a Supabase).
2. Riabilitare le scritture su Supabase se erano state revocate.
3. Nessuna perdita dati: durante la finestra non ci sono state scritture (manutenzione + cron disattivati).

## Verifica

- [ ] Produzione operativa sul nuovo Postgres; `verify-migration.ts` a 0.
- [ ] Sessioni utente esistenti valide dopo il cutover (login NON richiesto di nuovo — le tabelle session sono nel dump).
- [ ] Notte successiva: i 4 cron prod completati con successo (controllare le run GitHub Actions e gli effetti su DB).
- [ ] DB Supabase in sola lettura, finestra di rollback annotata (data di scadenza nelle Note).

## Note di esecuzione

_(da compilare: data/ora cutover, durata effettiva, anomalie, data fine periodo rollback)_

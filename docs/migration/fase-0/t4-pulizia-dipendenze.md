---
task: F0.T4
phase: 0
title: Rimozione dipendenze morte
status: not_started
completed: false
depends_on: ["F0.T2"]
last_updated: 2026-06-11
---

# F0.T4 — Rimozione dipendenze morte

## Obiettivo

Eliminare da `apps/web-legacy` le dipendenze installate ma mai importate. Verifica già eseguita il 2026-06-11: `grep -rn "better-sqlite3\|@libsql\|nodemailer" src/` → **zero risultati** in `*.ts/tsx/js`.

## Da rimuovere

| Pacchetto | Sezione | Motivo |
|---|---|---|
| `better-sqlite3` | dependencies | mai importato (residuo di setup T3/drizzle iniziale) |
| `@types/better-sqlite3` | devDependencies | idem |
| `@libsql/client` | dependencies | mai importato |
| `nodemailer` | dependencies | mai importato direttamente; l'email passa dal provider SMTP di NextAuth, che **non** richiede nodemailer come peer? — ATTENZIONE: verificare prima di rimuovere (vedi sotto) |

## Step operativi

1. **Verifica preliminare su nodemailer**: il provider Email di NextAuth v4 richiede `nodemailer` come peer dependency (lo usa internamente per inviare i magic link). Controllare: `pnpm why nodemailer` e la doc di `next-auth@4` provider Email.
   - Se risulta peer dependency richiesta → **non rimuoverlo**; annotare qui che è un peer di next-auth e va rimosso solo quando NextAuth sparirà (fase 5).
   - Il provider Email è attivo solo con `NODE_ENV !== "production"` o `CUSTOM_ACCESS` (vedi `src/server/auth.ts:28-41`): testare il magic link in dev dopo l'eventuale rimozione.
2. Rimozione:
   ```bash
   pnpm --filter web-legacy remove better-sqlite3 @types/better-sqlite3 @libsql/client
   # nodemailer: solo se la verifica al punto 1 lo consente
   ```
3. Build + test + (se nodemailer rimosso) login via email in dev.

## Verifica

- [ ] `grep -rn "better-sqlite3\|@libsql" apps/web-legacy/src` vuoto e pacchetti assenti dal lockfile per `web-legacy`.
- [ ] Esito verifica nodemailer annotato sotto.
- [ ] `pnpm --filter web-legacy build` e `test` verdi.

## Note di esecuzione

_(da compilare — in particolare l'esito della verifica nodemailer)_

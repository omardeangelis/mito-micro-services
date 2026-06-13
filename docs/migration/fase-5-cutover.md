---
phase: 5
title: Deploy, cutover e decommissioning
status: not_started
completed: false
depends_on: ["fase-3-frontend-spa", "fase-4-import-api"]
last_updated: 2026-06-11
---

# Fase 5 — Deploy, cutover e decommissioning

> Livello di dettaglio: outline. Hosting confermato: **Railway** (D8) — le operazioni manuali su dashboard/DNS sono in [attivita-manuali-provider.md](./attivita-manuali-provider.md).

## Obiettivo

Portare in produzione il nuovo stack (SPA + API + import-API), spegnere l'app Next.js su Vercel e chiudere il progetto Supabase.

## Macro-task

- [ ] F5.T1 — **Hosting su Railway** (D8): servizi `api` e `import-api` già attivi dalla fase 2/4; per il routing stesso-dominio (D6) la via consigliata è la SPA statica **servita da Express** in `apps/api` (history fallback) — niente reverse proxy dedicato; in alternativa servizio statico separato + proxy. Dominio custom + TLS gestiti da Railway. Replicare gli header di sicurezza e caching annotati in F3.T8.
- [ ] F5.T2 — **Pipeline CD**: build immagini, deploy staging→prod, sourcemap Sentry.
- [ ] F5.T3 — **Pre-cutover**: decisione dominio (oggi prod è su `*.vercel.app` senza dominio custom — opzioni A/B in [attivita-manuali-provider.md](./attivita-manuali-provider.md)); redirect URI Azure/Discord aggiunti per il dominio di produzione; `AUTH_URL`/secret di prod; backup DB.
- [ ] F5.T4 — **Cutover**: finestra breve — freeze scritture sul legacy, switch al nuovo stack (DNS se dominio custom, altrimenti comunicazione del nuovo URL agli operatori), smoke test (login, liste, un import, un export, cron trigger manuale). **Nota**: il dominio cambia in ogni caso rispetto a `*.vercel.app`, quindi i cookie di sessione non migrano e gli operatori rifanno il login al cutover — comunicarlo in anticipo. (Le sessioni su DB restano valide: chi rifà login non perde nulla.)
- [ ] F5.T5 — **Switch scheduler cron**: disattivare i trigger esterni legacy; i job girano in-process in `apps/api` (F2.T6).
- [ ] F5.T6 — **Osservazione** (≥ 2 settimane): Sentry, log, cron notturni, import reali.
- [ ] F5.T7 — **Decommissioning**: rimozione progetto Vercel, chiusura progetto Supabase (DB già migrato in fase 1; svuotare bucket storage), eliminazione `apps/web-legacy` dal repo, pulizia env legacy, aggiornamento README.

## Rollback plan

- Fino a F5.T7 il legacy resta deployabile: rollback = ripuntare il DNS a Vercel (se dominio custom) o semplicemente tornare a usare l'URL `*.vercel.app`, che resta attivo (il DB è condiviso, nessuna perdita dati).
- Dopo F5.T7: solo roll-forward; per questo l'osservazione (F5.T6) precede ogni smantellamento.

## Note di esecuzione

_(da compilare durante l'esecuzione)_

# Creato con T3 App

This is a [T3 Stack](https://create.t3.gg/) project bootstrapped with `create-t3-app`.

## Stack in this project

- [Next.js](https://nextjs.org)
- [NextAuth.js](https://next-auth.js.org)
- [Drizzle](https://orm.drizzle.team)
- [Tailwind CSS](https://tailwindcss.com)
- [tRPC](https://trpc.io)

## Main Libraries of the project

- [shadcn/ui](https://ui.shadcn.com/docs) - UI components
- [tremor](https://www.tremor.so/) - Charts and data visualization
- [usehooks-ts]("https://usehooks-ts.com/react-hook/use-is-mounted") - React hooks (copy from the repo and paste what you need)

## How do I deploy this?

Follow our deployment guides for [Vercel](https://create.t3.gg/en/deployment/vercel), [Netlify](https://create.t3.gg/en/deployment/netlify) and [Docker](https://create.t3.gg/en/deployment/docker) for more information.

### DROP TABLE query

DROP TABLE "customers_to_pratiche", "mito-deutsche_account", "mito-deutsche_customers", "mito-deutsche_practices", "mito-deutsche_products", "mito-deutsche_session", "mito-deutsche_user","mito-deutsche_verificationToken", "mito-deutsche_operator";

### Grant access to public schema on SQL

GRANT CREATE ON SCHEMA public TO <role_name>;

### Comando per clonare la repo con tutti i file in LF:

git clone --config core.autocrlf=false https://github.com/S-P-A-Talo/mito-deutsche.git

## Database locale

Il database locale è un Postgres 15 in Docker, come la produzione. Serve a tre cose: provare una migrazione su un database proprio prima di applicarla allo sviluppo condiviso, far girare i test su Postgres vero e provare i cron su dati generati dal seeder.

Comandi, dalla radice del repo:

- `pnpm db:local:up`: avvia il Postgres e aspetta che sia pronto.
- `pnpm db:local:down`: ferma il Postgres. I dati restano nel volume `mito-postgres`.
- `pnpm db:local:reset`: elimina il database `mito_local` e lo ricrea vuoto.
- `pnpm db:local:migrate`: applica a `mito_local` le migrazioni in sospeso e stampa quante ne ha applicate.
- `pnpm test:pg`: esegue i test `*.pg.test.ts` su quel Postgres.
- `pnpm seed:local [--customers N]`: riempie `mito_local` con i dati di prova (vedi sotto). È l'unico modo previsto per riempirlo.
- `pnpm seed:local:cron [job…]`: esegue i cron di produzione su `mito_local`.
- `pnpm seed:local:verify`: confronta `mito_local` con gli scenari del seed.

Gli script `db:local:*` e `seed:local*` non leggono i file `.env*`: il DSN è scritto in `src/server/db/scripts/localDb.ts`, e si fermano prima di collegarsi se l'host non è `localhost` o `127.0.0.1` o se il database non è `mito_local`. Non possono arrivare al database di sviluppo né a quello di produzione.

### Provare una migrazione prima di sviluppo

1. Passa al ramo base, quello da cui parte la migrazione (di solito `dev`), e riparti da un database vuoto. `reset` cancella i dati di `mito_local`.

```bash
git checkout <ramo-base>
pnpm db:local:up
pnpm db:local:reset
pnpm db:local:migrate
```

2. Passa al ramo con la migrazione nuova e applicala. Il comando deve applicarne almeno una, per esempio `mito_local: 1 migrazione applicata`.

```bash
git checkout <ramo-con-la-migrazione>
pnpm db:local:migrate
```

3. Controlla lo schema sul database locale, in sola lettura, per esempio con `psql`.

```bash
docker compose exec postgres psql -U postgres -d mito_local
```

### Provare i cron sul seed locale

```bash
pnpm db:local:up
pnpm db:local:reset
pnpm db:local:migrate
pnpm seed:local                # 10.000 clienti; --customers N per cambiarli, minimo 300
pnpm seed:local:cron           # priority, alert, update, cleanup-task-event-log, in ordine
pnpm seed:local:verify         # "passato" o "fallito" per ogni scenario
```

- `seed:local` svuota tutte le tabelle di `mito_local` e scrive i dati del giorno di Roma in cui lo lanci. Si ferma prima di scrivere se `mito_local` non ha tutte le migrazioni del repo: lancia `pnpm db:local:migrate`.
- `seed:local:cron` accetta anche solo alcuni job, per esempio `pnpm seed:local:cron priority alert`, ma sempre in quell'ordine e ognuno una volta sola. La verifica vuole tutte e quattro le corse riuscite.
- Il seed vale solo per il suo giorno: rifallo ogni giorno, e dopo una corsa fallita o interrotta, perché `update` non è idempotente.
- I tre comandi non partono fra mezzanotte e le 01:00 (le 02:00 con l'ora legale) a Roma: lì il giorno di Roma, usato da `alert`, e quello UTC, usato da `update`, sono diversi.
- Il manifesto con gli scenari e le corse è `.local-seed/manifest.json`, nella cartella da cui lanci il comando (con `pnpm`, la radice del repo). È ignorato da git.

### Limiti

- Lo schema viene dalle migrazioni del repo, più i pezzi che la produzione ha ricevuto da `db:push`. Non è una copia del database di sviluppo.
- I dati del database di sviluppo, i ruoli, le estensioni e gli oggetti creati a mano non ci sono: i dati sono solo quelli generati da `seed:local`.
- L'app non gira sul database locale: il login Azure AD e lo storage Supabase restano quelli di sviluppo.

### Test su Postgres vero

```bash
pnpm db:local:up
pnpm test:pg
```

Ogni file di test crea un database suo, `mito_test_<casuale>`, sullo stesso Postgres, e lo elimina alla fine: `mito_local` non viene toccato. Senza `TEST_DATABASE_URL`, `pnpm run test --run` salta questi test. In CI invece girano sempre.

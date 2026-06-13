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

### Comandi per svuotare db e ricaricarlo

pnpm seed:clearRelationsTables
pnpm seed:clearTables
pnpm seed:pratiche
pnpm seed:customers
pnpm seed:customerToPratica
# mito-micro-services

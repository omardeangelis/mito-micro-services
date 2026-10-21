# Storage

Il servizio Effect `Storage` viene da [`@s-p-a-talo/gcs-storage`](https://github.com/S-P-A-Talo/packages/tree/main/packages/gcs-storage): un Layer GCS (`makeGcsStorageLayer`), un Layer in memoria per i test (`makeMemoryStorageLayer`) e una facciata Promise (`createStorageClient`). Le correzioni al servizio si fanno lì, con un changeset, e arrivano qui aggiornando la versione in `package.json`.

Il pacchetto è privato, su GitHub Packages: `pnpm install` legge `.npmrc` e ha bisogno di `GITHUB_PACKAGES_TOKEN` (un token GitHub con `read:packages` che vede l'org S-P-A-Talo) in locale, nella CI, su Vercel e in Cloud Build.

Solo di MITO: `supabase.ts` (il bucket Supabase `mito-storage` dietro la stessa interfaccia, per la prod finché lo storage non passa a GCS) e `layer.ts` (`StorageLive`: GCS con `GCS_BUCKET`, altrimenti Supabase). L'indice riesporta il pacchetto, quindi `@/server/services/storage` resta l'import da usare.

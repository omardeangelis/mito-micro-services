# Storage

Copia di `gcs-storage-kit` 0.1.0 (`~/Desktop/lavoro/gcs-storage-kit`, vedi `brain/chore/migrazione-gcp.md`). Un servizio Effect `Storage` con un Layer GCS (`makeGcsStorageLayer`), un Layer in memoria per i test (`makeMemoryStorageLayer`) e una facciata Promise (`createStorageClient`).

Differenze dall'originale, solo di forma: import senza estensione `.js`, formattazione di questo repo, test in `_test/`.

Le correzioni vanno fatte anche nel kit, finché il kit non diventa una dipendenza del progetto.

Solo di MITO, non del kit: `supabase.ts` (il bucket Supabase `mito-storage` dietro la stessa interfaccia, per la prod finché lo storage non passa a GCS) e `layer.ts` (`StorageLive`: GCS con `GCS_BUCKET`, altrimenti Supabase).

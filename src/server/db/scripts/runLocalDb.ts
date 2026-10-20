// `pnpm db:local:reset` and `pnpm db:local:migrate`: the local database of
// docker-compose.yml (`pnpm db:local:up` first). See localDb.ts
import { migrateLocalDatabase, resetLocalDatabase } from "./localDb"

const command = process.argv[2]

if (command === "reset") {
  await resetLocalDatabase()
  console.log("mito_local ricreato, vuoto: ora pnpm db:local:migrate")
} else if (command === "migrate") {
  const applied = await migrateLocalDatabase()
  console.log(
    `mito_local: ${applied} ${applied === 1 ? "migrazione applicata" : "migrazioni applicate"}`
  )
} else {
  console.error("Uso: tsx src/server/db/scripts/runLocalDb.ts reset|migrate")
  process.exit(1)
}

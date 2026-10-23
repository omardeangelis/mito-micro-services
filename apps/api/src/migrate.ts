import { fileURLToPath } from "node:url"
import { Cause, Effect, Exit } from "effect"
import { connect } from "@mito/db/connect"
import { applyMigrations, MigrationOutOfOrder } from "@mito/db/migrate"

// Applies the pending migrations to the app's database and exits: the Cloud
// Run Job that runs before each deploy of the backend, with the image, the
// database and the secrets of the service. Exit code 1 when they fail: the
// deploy stops there and the service keeps its revision
//
// The image has the migrations next to the bundle (Dockerfile):
// apps/api/dist/migrate.js -> packages/db/migrations
const folder = fileURLToPath(
  new URL("../../../packages/db/migrations", import.meta.url)
)

const client = connect({ max: 1, onnotice: () => undefined })
const exit = await Effect.runPromiseExit(applyMigrations(client, folder))
await client.end({ timeout: 5 })

if (Exit.isSuccess(exit)) {
  console.log(`Migrations applied: ${exit.value}`)
} else {
  const error = Cause.squash(exit.cause)
  console.error(
    error instanceof MigrationOutOfOrder
      ? `Migrations out of order, none applied: ${error.tags.join(", ")} would be skipped. Generate them again on top of dev (pnpm db:generate)`
      : "Migrations failed:",
    error
  )
  process.exitCode = 1
}

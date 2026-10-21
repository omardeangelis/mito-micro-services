// `pnpm seed:local:cron [job…]`: see commands/cron.ts. Runs under
// `tsx --conditions=react-server`, because the backend's jobs import
// `server-only`. Connects only to mito_local (localDb.ts), reads no env file
import { connectLocal } from "../../scripts/localDb"
import { cronLocal } from "./commands/cron"

const jobs = process.argv.slice(2).filter((arg) => arg !== "--")
const connection = connectLocal()
try {
  const manifest = await cronLocal({
    client: connection.db,
    now: new Date(),
    jobs,
  })
  for (const run of manifest.runs) {
    console.log(
      `${run.job}: ${run.outcome === "succeeded" ? "riuscito" : run.outcome} ` +
        JSON.stringify(run.counters ?? {})
    )
  }
  console.log("Per controllare gli scenari: `pnpm seed:local:verify`.")
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await connection.client.end()
}

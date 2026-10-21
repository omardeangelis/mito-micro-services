// `pnpm seed:local [--customers N]`: see commands/seed.ts. Connects only to
// mito_local (localDb.ts), reads no env file
import { connectLocal } from "../../scripts/localDb"
import { parseSeedArgs, seedLocal } from "./commands/seed"

let connection: ReturnType<typeof connectLocal> | undefined
try {
  // The arguments first: a wrong one stops before connecting
  const { n } = parseSeedArgs(process.argv.slice(2))
  connection = connectLocal()
  const summary = await seedLocal({ client: connection.db, now: new Date(), n })
  console.log(
    `mito_local: seed del ${summary.day} con ${summary.n} clienti ` +
      `(${summary.counts.practices} pratiche, ${summary.counts.tasks} ` +
      `contatti, ${summary.counts.alerts} alert, ${summary.counts.taskEventLog} ` +
      `righe di log). Manifesto in ${summary.manifestPath}.\n` +
      "Ora `pnpm seed:local:cron`, poi `pnpm seed:local:verify`."
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await connection?.client.end()
}

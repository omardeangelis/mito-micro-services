// `pnpm seed:local:verify`: see commands/verify.ts. Connects only to
// mito_local (localDb.ts), reads no env file
import { connectLocal } from "../../scripts/localDb"
import { verifyLocal } from "./commands/verify"

const connection = connectLocal()
try {
  const { lines, exitCode } = await verifyLocal({
    client: connection.db,
    now: new Date(),
  })
  for (const line of lines) console.log(line)
  process.exitCode = exitCode
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await connection.client.end()
}

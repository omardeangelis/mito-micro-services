// `pnpm db:copy-check:dev [copy]`: compares the development database, the
// source, with a copy of it on this machine: `mito_local` by default, or the
// local DSN given (Cloud SQL through its Auth Proxy on 127.0.0.1), whose
// password, if not in the DSN, comes from PGPASSWORD. Both are only read.
// Prints the differences and exits 1 if there is any.
import postgres from "postgres"
import { loadEnv } from "@/lib/global/loadDbEnv"
import { localConnection } from "../localDsn"
import { compareFingerprints, fingerprint } from "./copyCheck"
import { LOCAL_DATABASE_URL } from "./localDb"

loadEnv()
if (process.env.NODE_ENV !== "development") {
  console.error("Uso: pnpm db:copy-check:dev, sul database di sviluppo")
  process.exit(1)
}
const { SUPABASE_DB_CONNECTION_STRING, SUPABASE_MITO_PSW } = process.env
if (!SUPABASE_DB_CONNECTION_STRING || !SUPABASE_MITO_PSW) {
  // Without them postgres.js would connect to PGHOST or localhost
  console.error(".env.development.local non imposta il database di sviluppo")
  process.exit(1)
}

// The copy stops here unless it is on this machine
const copyUrl = process.argv[2] ?? LOCAL_DATABASE_URL
const copyConnection = localConnection(copyUrl)
const copy = postgres({
  ...copyConnection,
  // Cloud SQL's password stays out of the command line, in PGPASSWORD
  password: copyConnection.password || process.env.PGPASSWORD,
  max: 1,
  onnotice: () => undefined,
})
// Through the pooler, as the app: fingerprint uses only SET LOCAL
const source = postgres(SUPABASE_DB_CONNECTION_STRING, {
  password: SUPABASE_MITO_PSW,
  prepare: false,
  max: 1,
})

try {
  const [a, b] = await Promise.all([fingerprint(source), fingerprint(copy)])
  const rows = Object.values(a.tables).reduce((n, t) => n + t.rows, 0)
  const differences = compareFingerprints(a, b)
  console.log(
    `Sorgente: sviluppo. Copia: ${copyConnection.host}:${copyConnection.port}/${copyConnection.database}`
  )
  if (differences.length === 0) {
    console.log(
      `Identico: ${Object.keys(a.tables).length} tabelle, ${rows} righe, ${Object.keys(a.sequences).length} sequenze, stesso schema`
    )
  } else {
    const count = differences.length
    console.log(
      `Diverso, ${count} ${count === 1 ? "differenza" : "differenze"}:`
    )
    for (const line of differences) console.log(`- ${line}`)
    process.exitCode = 1
  }
} finally {
  await Promise.all([source.end(), copy.end()])
}

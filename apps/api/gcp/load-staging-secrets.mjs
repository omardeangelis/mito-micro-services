// Loads the values of the staging secrets of mito-crm-staging into Secret
// Manager. Run it from the repo root: node apps/api/gcp/load-staging-secrets.mjs
//
// It reads only .env.development.local (the development database, as in
// `pnpm api:dev`) and never prints a value: each one goes to gcloud on stdin.
// It stops before writing anything if a variable is missing, or if a value is
// the same as in .env or .env.prod.local, which hold production values.
// NEXTAUTH_SECRET is generated: the backend reads database sessions and
// doesn't use it until B4.
import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { parseEnv } from "node:util"

const PROJECT = "mito-crm"
const FROM_FILE = [
  "SUPABASE_DB_CONNECTION_STRING",
  "SUPABASE_MITO_PSW",
  "SUPABASE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
]

const read = (file) =>
  existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {}

if (!existsSync(".env.development.local")) {
  console.error("Run it from the repo root: .env.development.local not found")
  process.exit(1)
}
const dev = read(".env.development.local")
const prodFiles = [".env", ".env.prod.local"].map((file) => [file, read(file)])

const problems = []
for (const name of FROM_FILE) {
  if (!dev[name]) {
    problems.push(`${name} is missing in .env.development.local`)
    continue
  }
  for (const [file, values] of prodFiles)
    if (values[name] === dev[name])
      problems.push(`${name} has the same value as in ${file} (production)`)
}
if (problems.length) {
  console.error(`Nothing written:\n- ${problems.join("\n- ")}`)
  process.exit(1)
}

const values = Object.fromEntries(FROM_FILE.map((name) => [name, dev[name]]))
values.NEXTAUTH_SECRET = randomBytes(32).toString("base64")

for (const [name, value] of Object.entries(values)) {
  const secret = `STAGING_${name}`
  const result = spawnSync(
    "gcloud",
    [
      "secrets",
      "versions",
      "add",
      secret,
      `--project=${PROJECT}`,
      "--data-file=-",
    ],
    { input: value, stdio: ["pipe", "ignore", "pipe"] }
  )
  if (result.status !== 0) {
    console.error(`${secret}: gcloud failed\n${result.error ?? result.stderr}`)
    process.exit(1)
  }
  console.log(`${secret}: new version added`)
}

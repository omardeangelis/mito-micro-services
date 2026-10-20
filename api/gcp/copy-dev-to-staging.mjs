// Copies the development database into the database `mito` of the staging
// Cloud SQL instance, then checks the copy. From the repo root, with Docker
// running and gcloud logged in:
//   node api/gcp/copy-dev-to-staging.mjs [--replace]
//
// 1. pg_dump of the schemas public and drizzle, with the postgres:15 image (the
//    archive of a newer pg_dump doesn't restore into Postgres 15). Through the
//    DIRECT host of the development project, never the pooler: pg_dump sets
//    search_path = '' for its session, which through the transaction pooler
//    would stay on a backend the app uses. The direct host is IPv6 only and
//    Docker has no IPv6 on a Mac: a relay on 127.0.0.1 forwards to it, with TLS
//    end to end.
// 2. The Auth Proxy (`cloud-sql-proxy`, gcloud's credentials) on 127.0.0.1.
// 3. `mito` is created if missing, owned by mito_app, with the TimeZone of the
//    databases in use (`ALTER DATABASE` isn't in a dump of the schemas). If it
//    has tables already, it stops, unless --replace.
// 4. pg_restore --clean --if-exists --no-owner --no-privileges, stopping at the
//    first error, then ANALYZE.
// 5. `pnpm db:copy-check:dev` on the copy: it must say "Identico".
//
// It reads the database only from .env.development.local, and stops if .env or
// .env.prod.local hold the same one. No credential reaches the screen, a
// command line or a file: they go in the environment of the child processes.
// The dump is a temporary file, deleted at the end.
import { spawn, spawnSync } from "node:child_process"
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { parseEnv } from "node:util"
import postgres from "postgres"

const PROJECT = "mito-crm"
const INSTANCE = `${PROJECT}:europe-west3:mito-crm-staging`
const PROXY_PORT = 54330
const replace = process.argv.includes("--replace")

const read = (file) =>
  existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {}
if (!existsSync(".env.development.local")) {
  console.error("Run it from the repo root: .env.development.local not found")
  process.exit(1)
}
const dev = read(".env.development.local")
const url = dev.SUPABASE_DB_CONNECTION_STRING
const devPassword = dev.SUPABASE_MITO_PSW
if (!url || !devPassword) {
  console.error(".env.development.local doesn't set the development database")
  process.exit(1)
}
// The project ref: in the pooler's user (postgres.<ref>) or the direct host
const projectRef = (dsn) => {
  const u = new URL(dsn)
  return (
    decodeURIComponent(u.username).split(".")[1] ??
    u.hostname.match(/^db\.([^.]+)\./)?.[1]
  )
}
const ref = projectRef(url)
if (!ref) {
  console.error("The development DSN names no Supabase project")
  process.exit(1)
}
for (const file of [".env", ".env.prod.local"]) {
  const other = read(file).SUPABASE_DB_CONNECTION_STRING
  if (other && projectRef(other) === ref) {
    console.error(`Stopped: ${file} holds the same database (production)`)
    process.exit(1)
  }
}

const run = (command, args, { env = {}, stdin, stdout } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: [
        stdin ? "pipe" : "ignore",
        stdout ? "pipe" : "inherit",
        "inherit",
      ],
    })
    if (stdin) createReadStream(stdin).pipe(child.stdin)
    if (stdout) child.stdout.pipe(stdout)
    child.on("error", reject)
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args[0]} exited with ${code}`))
    )
  })

const secret = spawnSync(
  "gcloud",
  [
    "secrets",
    "versions",
    "access",
    "latest",
    "--secret=STAGING_CLOUDSQL_MITO_APP_PASSWORD",
    `--project=${PROJECT}`,
  ],
  { encoding: "utf8" }
)
if (secret.status !== 0) {
  console.error(`Cannot read the password of mito_app:\n${secret.stderr}`)
  process.exit(1)
}
const appPassword = secret.stdout

const folder = mkdtempSync(path.join(os.tmpdir(), "mito-dump-"))
const dump = path.join(folder, "dev.dump")
let relay
let proxy
try {
  // 1. The dump, through the relay to the direct host
  relay = net.createServer((client) => {
    const upstream = net.connect({ host: `db.${ref}.supabase.co`, port: 5432 })
    client.pipe(upstream).pipe(client)
    const close = () => (client.destroy(), upstream.destroy())
    client.on("error", close)
    upstream.on("error", close)
  })
  await new Promise((resolve) => relay.listen(0, "127.0.0.1", resolve))
  const started = Date.now()
  const file = createWriteStream(dump, { mode: 0o600 })
  await run(
    "docker",
    [
      "run",
      "--rm",
      "-e",
      "PGPASSWORD",
      "postgres:15",
      "pg_dump",
      `host=host.docker.internal port=${relay.address().port} user=postgres dbname=postgres sslmode=require connect_timeout=15`,
      "-Fc",
      "--schema=public",
      "--schema=drizzle",
      "--no-owner",
      "--no-privileges",
    ],
    { env: { PGPASSWORD: devPassword }, stdout: file }
  )
  await new Promise((resolve) => file.end(resolve))
  relay.close()
  relay = undefined
  console.log(
    `Dump di sviluppo: ${Math.round((Date.now() - started) / 1000)} s`
  )

  // 2. The Auth Proxy, ready when it says so
  proxy = spawn(
    "cloud-sql-proxy",
    [
      "--gcloud-auth",
      "--address",
      "127.0.0.1",
      "--port",
      String(PROXY_PORT),
      INSTANCE,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The Auth Proxy didn't start in 60 s")),
      60000
    )
    const watch = (data) => {
      if (String(data).includes("ready for new connections"))
        clearTimeout(timer), resolve()
    }
    proxy.stdout.on("data", watch)
    proxy.stderr.on("data", watch)
    proxy.on("close", (code) =>
      reject(new Error(`The Auth Proxy exited with ${code}`))
    )
  })

  // 3. The database
  const connect = (database) =>
    postgres({
      host: "127.0.0.1",
      port: PROXY_PORT,
      user: "mito_app",
      password: appPassword,
      database,
      max: 1,
      onnotice: () => undefined,
    })
  const server = connect("postgres")
  try {
    const [exists] =
      await server`SELECT 1 FROM pg_database WHERE datname = 'mito'`
    if (!exists) await server`CREATE DATABASE mito`
    await server`ALTER DATABASE mito SET TimeZone = 'Europe/Rome'`
  } finally {
    await server.end()
  }
  const db = connect("mito")
  try {
    const [{ tables }] = await db`
      SELECT count(*)::int AS tables FROM pg_tables WHERE schemaname IN ('public', 'drizzle')`
    if (tables > 0 && !replace) {
      throw new Error(`mito has ${tables} tables: --replace wipes them`)
    }

    // 4. The restore
    const restored = Date.now()
    await run(
      "docker",
      [
        "run",
        "--rm",
        "-i",
        "-e",
        "PGPASSWORD",
        "postgres:15",
        "pg_restore",
        "-h",
        "host.docker.internal",
        "-p",
        String(PROXY_PORT),
        "-U",
        "mito_app",
        "-d",
        "mito",
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
      ],
      { env: { PGPASSWORD: appPassword }, stdin: dump }
    )
    await db`ANALYZE`
    console.log(
      `Restore in mito: ${Math.round((Date.now() - restored) / 1000)} s`
    )
  } finally {
    await db.end()
  }

  // 5. The check
  await run(
    "pnpm",
    ["db:copy-check:dev", `postgres://mito_app@127.0.0.1:${PROXY_PORT}/mito`],
    {
      env: { PGPASSWORD: appPassword },
    }
  )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  relay?.close()
  proxy?.kill()
  rmSync(folder, { recursive: true, force: true })
}

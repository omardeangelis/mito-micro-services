import { spawn } from "child_process"
import net from "net"
import {
  LOCAL_DATABASE_URL,
  localConnection,
  localDatabaseEnv,
} from "../src/localDsn"

// `with-local-db.ts <command> [args]`: runs the command on the local database
// of docker-compose.yml (mito_local), whatever the shell or
// `.env.development.local` hold for the database: the variables of the
// process win over the env files of Node (`--env-file`) and of Next.js. It is
// how `api:dev`, `dev:web` and `apps/api`'s `dev` start, so the local servers
// never reach the Supabase development database. Stops before starting the
// command when the database doesn't answer.
const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error("Uso: with-local-db.ts <comando> [argomenti]")
  process.exit(1)
}

const { host, port } = localConnection(LOCAL_DATABASE_URL, {
  database: "mito_local",
})
const reachable = await new Promise<boolean>((resolve) => {
  const socket = net.connect({ host, port })
  socket.setTimeout(1500)
  socket.once("connect", () => resolve(true))
  socket.once("timeout", () => resolve(false))
  socket.once("error", () => resolve(false))
}).catch(() => false)
if (!reachable) {
  console.error(
    `mito_local non risponde su ${host}:${port}: pnpm db:local:up, poi pnpm db:local:migrate`
  )
  process.exit(1)
}

const child = spawn(command, args, {
  stdio: "inherit",
  env: { ...process.env, ...localDatabaseEnv() },
})
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal))
}
child.on("exit", (code) => process.exit(code ?? 1))

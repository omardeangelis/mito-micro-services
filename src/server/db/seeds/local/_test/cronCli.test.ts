// @vitest-environment node
import { spawn } from "child_process"
import { createHash } from "crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "fs"
import net from "net"
import { tmpdir } from "os"
import path from "path"
import { afterEach, describe, expect, it } from "vitest"
import { romeDay } from "../day"

// The repo root: tsconfig.json, src/ and node_modules are there
const root = path.resolve(__dirname, "../../../../../..")
const LOCAL_PORT = 54329
const REPO_MANIFEST = path.join(root, ".local-seed/manifest.json")

/** A server that counts the connections it gets and closes them. */
async function listener(at: { port: number; host: string } | { path: string }) {
  const state = { connections: 0 }
  const server = net.createServer((socket) => {
    state.connections++
    socket.destroy()
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(at, () => {
      server.off("error", reject)
      resolve()
    })
  })
  const address = server.address()
  return {
    state,
    port: typeof address === "object" && address ? address.port : 0,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

/** Whether something already listens on 127.0.0.1:`port`. */
async function isBusy(port: number) {
  try {
    const probe = await listener({ port, host: "127.0.0.1" })
    await probe.close()
    return false
  } catch {
    return true
  }
}

const hashOf = (file: string) =>
  existsSync(file)
    ? createHash("sha256").update(readFileSync(file)).digest("hex")
    : null

// A `mito_local` running: the test must never reach it
const portBusy = await isBusy(LOCAL_PORT)
// Between midnight and 01:00/02:00 in Rome the command stops before connecting
const now = new Date()
const daysDiffer = romeDay(now) !== now.toISOString().slice(0, 10)
const skipReason = portBusy
  ? `port ${LOCAL_PORT} is busy (a mito_local running?)`
  : daysDiffer
    ? "the Rome and UTC days differ right now"
    : undefined
if (skipReason) console.warn(`cronCli.test.ts skipped: ${skipReason}`)

const toClose: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of toClose.splice(0)) await close()
})

describe.skipIf(Boolean(skipReason))("seed:local:cron (AC28a)", () => {
  it("connects only to 127.0.0.1:54329, whatever the shell and the env files hold", async () => {
    const hostile = await listener({ port: 0, host: "127.0.0.1" })
    toClose.push(hostile.close)
    const socketDir = mkdtempSync(path.join(tmpdir(), "cron-cli-socket-"))
    const unix = await listener({ path: path.join(socketDir, ".s.PGSQL.5432") })
    toClose.push(unix.close)
    const local = await listener({ port: LOCAL_PORT, host: "127.0.0.1" })
    toClose.push(local.close)

    const hostileDsn = `postgres://u:p@127.0.0.1:${hostile.port}/prod`
    const cwd = mkdtempSync(path.join(tmpdir(), "cron-cli-"))
    const envFile = `SUPABASE_DB_CONNECTION_STRING=${hostileDsn}\nSUPABASE_MITO_PSW=x\n`
    writeFileSync(path.join(cwd, ".env"), envFile)
    writeFileSync(path.join(cwd, ".env.development.local"), envFile)
    mkdirSync(path.join(cwd, ".local-seed"))
    writeFileSync(
      path.join(cwd, ".local-seed/manifest.json"),
      JSON.stringify({
        day: romeDay(new Date()),
        n: 300,
        scenarios: [],
        runs: [],
      })
    )
    const repoManifestBefore = hashOf(REPO_MANIFEST)

    // Only what the test sets: no NODE_ENV, no variable of this shell
    const env: Record<string, string> = {
      PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: process.env.HOME ?? tmpdir(),
      SUPABASE_DB_CONNECTION_STRING: hostileDsn,
      SUPABASE_MITO_PSW: "x",
      PGHOST: "127.0.0.1",
      PGPORT: String(hostile.port),
      PGDATABASE: "prod",
      PGUSER: "x",
      PGPASSWORD: "x",
      INSTANCE_UNIX_SOCKET: socketDir,
    }
    const child = spawn(
      path.join(root, "node_modules/.bin/tsx"),
      [
        "--conditions=react-server",
        "--tsconfig",
        path.join(root, "tsconfig.json"),
        path.join(root, "src/server/db/seeds/local/cron.cli.ts"),
        "priority",
      ],
      {
        cwd,
        // The app's ProcessEnv requires NODE_ENV, which the child must not get
        env: env as NodeJS.ProcessEnv,
        stdio: ["ignore", "pipe", "pipe"],
      }
    )
    let output = ""
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()))
    // The fake server speaks no Postgres: the command fails, after connecting
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL")
        reject(new Error(`cron.cli.ts didn't finish in 60 s:\n${output}`))
      }, 60_000)
      child.on("exit", () => {
        clearTimeout(timer)
        resolve()
      })
    })

    expect(hostile.state.connections, output).toBe(0)
    expect(unix.state.connections, output).toBe(0)
    expect(local.state.connections, output).toBeGreaterThanOrEqual(1)
    expect(hashOf(REPO_MANIFEST)).toBe(repoManifestBefore)
  }, 90_000)
})

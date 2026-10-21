// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest"
import {
  connectLocal,
  LOCAL_DATABASE_URL,
  localSeedConnection,
} from "../../../scripts/localDb"
import { DEFAULT_CUSTOMERS, parseSeedArgs } from "../commands/seed"

const HOSTILE_ENV = {
  PGHOST: "db.example.com",
  PGPORT: "6543",
  PGDATABASE: "postgres",
  PGUSER: "prod",
  PGPASSWORD: "prod",
  SUPABASE_DB_CONNECTION_STRING:
    "postgres://prod:prod@db.example.com:6543/postgres",
  SUPABASE_MITO_PSW: "prod",
  INSTANCE_UNIX_SOCKET: "/cloudsql/project:region:instance",
}

const saved = Object.fromEntries(
  Object.keys(HOSTILE_ENV).map((key) => [key, process.env[key]])
)

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("localSeedConnection", () => {
  it("connects to 127.0.0.1:54329/mito_local by default", () => {
    expect(LOCAL_DATABASE_URL).toBe(
      "postgres://postgres:local@127.0.0.1:54329/mito_local"
    )
    expect(localSeedConnection()).toEqual({
      host: "127.0.0.1",
      port: 54329,
      user: "postgres",
      password: "local",
      database: "mito_local",
    })
  })

  it("refuses a host that isn't local, another database and a query string, before connecting (AC1)", () => {
    expect(() =>
      localSeedConnection("postgres://u:p@db.example.com:5432/mito_local")
    ).toThrow(/host/)
    expect(() =>
      localSeedConnection("postgres://u:p@127.0.0.1:54329/postgres")
    ).toThrow(/mito_local/)
    expect(() =>
      localSeedConnection(
        "postgres://u:p@127.0.0.1:54329/mito_local?host=db.example.com"
      )
    ).toThrow(/query string/)
  })

  it("ignores PG*, the Supabase variables and INSTANCE_UNIX_SOCKET (AC28a)", () => {
    Object.assign(process.env, HOSTILE_ENV)

    const options = localSeedConnection()

    expect(options).toMatchObject({
      host: "127.0.0.1",
      port: 54329,
      database: "mito_local",
    })
    expect(options).not.toHaveProperty("path")
  })
})

describe("connectLocal", () => {
  it("builds the commands' client on 127.0.0.1:54329/mito_local whatever the environment says (AC28a)", async () => {
    Object.assign(process.env, HOSTILE_ENV)

    const { client } = connectLocal()

    // postgres.js connects on the first query: reading the options opens nothing
    expect(client.options).toMatchObject({
      host: ["127.0.0.1"],
      port: [54329],
      database: "mito_local",
      user: "postgres",
    })
    expect(client.options.path).toBeFalsy()
    await client.end()
  })
})

describe("parseSeedArgs", () => {
  it("defaults to 10,000 customers and reads --customers", () => {
    expect(parseSeedArgs([])).toEqual({ n: DEFAULT_CUSTOMERS })
    expect(DEFAULT_CUSTOMERS).toBe(10_000)
    expect(parseSeedArgs(["--customers", "300"])).toEqual({ n: 300 })
    expect(parseSeedArgs(["--customers=500"])).toEqual({ n: 500 })
  })

  it("refuses fewer than 300 customers, a value that isn't an integer and an unknown argument", () => {
    expect(() => parseSeedArgs(["--customers", "299"])).toThrow(/300/)
    expect(() => parseSeedArgs(["--customers"])).toThrow(/--customers/)
    expect(() => parseSeedArgs(["--customers", "1e4"])).toThrow(/--customers/)
    expect(() => parseSeedArgs(["--clienti", "300"])).toThrow(/sconosciuto/)
  })
})

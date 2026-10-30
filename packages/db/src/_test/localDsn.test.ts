import { describe, expect, it } from "vitest"
import {
  LOCAL_DATABASE_URL,
  localConnection,
  localDatabaseEnv,
} from "@mito/db/localDsn"

describe("localDatabaseEnv", () => {
  it("mette l'app su mito_local: DSN senza password, password a parte, niente socket", () => {
    expect(localDatabaseEnv()).toEqual({
      SUPABASE_DB_CONNECTION_STRING:
        "postgres://postgres@127.0.0.1:54329/mito_local",
      SUPABASE_MITO_PSW: "local",
      INSTANCE_UNIX_SOCKET: "",
    })
  })

  it("è la connessione di LOCAL_DATABASE_URL, letta come fa connect", () => {
    const env = localDatabaseEnv()
    expect({
      ...localConnection(env.SUPABASE_DB_CONNECTION_STRING!, {
        database: "mito_local",
      }),
      password: env.SUPABASE_MITO_PSW,
    }).toEqual(localConnection(LOCAL_DATABASE_URL, { database: "mito_local" }))
  })
})

describe("localConnection", () => {
  it("un DSN locale dà la connessione, presa solo dal DSN", () => {
    expect(
      localConnection("postgres://postgres:local@127.0.0.1:54329/postgres")
    ).toEqual({
      host: "127.0.0.1",
      port: 54329,
      user: "postgres",
      password: "local",
      database: "postgres",
    })
    expect(localConnection("postgresql://u:p%40ss@localhost/db")).toEqual({
      host: "localhost",
      port: 5432,
      user: "u",
      password: "p@ss",
      database: "db",
    })
  })

  it.each([
    ["senza host", "postgres://postgres:local@/postgres", /no host/],
    ["senza host né credenziali", "postgres:///postgres", /no host/],
    [
      "con più host",
      "postgres://u:p@127.0.0.1:54329,db.example.com:5432/postgres",
      /more than one host/,
    ],
    [
      "con un host remoto",
      "postgres://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
      /the host is aws-0-eu-central-1\.pooler\.supabase\.com/,
    ],
    [
      "con un host che inizia come quello locale",
      "postgres://u:p@localhost.example.com/postgres",
      /the host is localhost\.example\.com/,
    ],
    [
      "con una query string",
      "postgres://u:p@127.0.0.1/postgres?host=db.example.com",
      /query string/,
    ],
    ["senza database", "postgres://u:p@127.0.0.1:54329", /no database/],
    ["che non è Postgres", "mysql://u:p@127.0.0.1/db", /not a postgres/],
  ])("un DSN %s si ferma", (_, dsn, reason) => {
    expect(() => localConnection(dsn)).toThrow(reason)
  })

  it("con un nome di database richiesto, un altro nome si ferma", () => {
    const dsn = "postgres://postgres:local@127.0.0.1:54329/postgres"
    expect(() => localConnection(dsn, { database: "mito_local" })).toThrow(
      /the database is postgres, not mito_local/
    )
    expect(
      localConnection("postgres://postgres:local@127.0.0.1:54329/mito_local", {
        database: "mito_local",
      }).database
    ).toBe("mito_local")
  })
})

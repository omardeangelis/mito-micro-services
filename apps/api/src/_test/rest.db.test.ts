import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { once } from "node:events"
import { type AddressInfo } from "node:net"
import { serve } from "@hono/node-server"
import { sessions } from "@mito/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"
import { app } from "../app"

// The real NextAuth configuration, as the Next.js route serves it
vi.unmock("@/server/auth")

const FRONTEND = "https://staging-crm.example.it"
const DAY = 24 * 60 * 60 * 1000
const SESSION_COOKIE = "__Secure-next-auth.session-token"

async function signIn(userId: string) {
  const sessionToken = `token-${userId}`
  await testDb
    .insert(sessions)
    .values({ sessionToken, userId, expires: new Date(Date.now() + 20 * DAY) })
  return sessionToken
}

// The REST routes behind authCheck, with the method the Next.js app exports.
// The dynamic segment of /api/export/[export] is `export` here
const AUTHENTICATED: [string, string][] = [
  ["POST", "/api/export/download"],
  ["POST", "/api/export/importError"],
  ["POST", "/api/export/export/fetchCall"],
  ["POST", "/api/export/export/fetchDefault"],
  ["POST", "/api/export/export/getMessages"],
  ["POST", "/api/export/export/saveExport"],
  ["POST", "/api/import/create/customerToPratica"],
  ["POST", "/api/import/create/customers"],
  ["POST", "/api/import/create/practices"],
  ["POST", "/api/import/process"],
  ["PUT", "/api/import/update/customers"],
  ["PUT", "/api/import/update/practices"],
]

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  // NextAuth builds every URL and picks the __Secure- cookies from it
  vi.stubEnv("NEXTAUTH_URL", FRONTEND)
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret")
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe("route REST sul backend", () => {
  it.each(AUTHENTICATED)(
    "senza cookie %s %s risponde 401",
    async (method, path) => {
      const response = await app.request(path, { method })

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: "Unauthorized" })
    }
  )

  it("un metodo non esportato risponde 405", async () => {
    const response = await app.request("/api/import/process", {
      method: "GET",
    })

    expect(response.status).toBe(405)
  })

  it("con sessione l'export dei messaggi di nessuna chat risponde un risultato vuoto", async () => {
    const operator = await createOperator()
    const token = await signIn(operator.userId)

    const response = await app.request("/api/export/export/getMessages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE}=${token}`,
      },
      body: JSON.stringify({ chatIds: [] }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ result: [] })
  })

  it("con sessione le preferenze della tabella clienti usano @/trpc/server e rispondono OK", async () => {
    const operator = await createOperator()
    const token = await signIn(operator.userId)

    const response = await app.request("/api/user/preferences?pref=ct", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE}=${token}`,
      },
      body: JSON.stringify({
        preferences: { customerTableVisibleColumns: ["name", "surname"] },
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: "OK" })
  })

  it("le preferenze senza il parametro pref rispondono 400", async () => {
    const operator = await createOperator()
    const token = await signIn(operator.userId)

    const response = await app.request("/api/user/preferences", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE}=${token}`,
      },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(400)
  })

  it("su una porta vera, come su Cloud Run, legge il corpo della richiesta", async () => {
    // @hono/node-server hands the routes its own request, not undici's
    const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" })
    await once(server, "listening")
    const { port } = server.address() as AddressInfo
    try {
      const operator = await createOperator()
      const token = await signIn(operator.userId)

      const response = await fetch(
        `http://127.0.0.1:${port}/api/export/export/getMessages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `${SESSION_COOKIE}=${token}`,
          },
          body: JSON.stringify({ chatIds: [] }),
        }
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ result: [] })
    } finally {
      server.close()
    }
  })
})

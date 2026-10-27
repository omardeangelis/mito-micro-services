import {
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
import { migrateUpTo, resetDb } from "@/test/db"
import { signIn } from "@/test/authSession"
import { createOperator } from "@/test/factories"
import { app } from "../app"

// The real session read: better-auth of the app
vi.unmock("@mito/server/auth")

// The REST routes behind authCheck, with the method the Next.js app exports
const AUTHENTICATED: [string, string][] = [["POST", "/api/export/download"]]

// The routes of the old import, gone with it (AC4)
const OLD_IMPORT: [string, string][] = [
  ["POST", "/api/export/importError"],
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

  it.each(OLD_IMPORT)(
    "%s %s del vecchio import non esiste: 404 (AC4)",
    async (method, path) => {
      const operator = await createOperator()
      const { cookie } = await signIn(operator.userId)

      const response = await app.request(path, {
        method,
        headers: { cookie },
      })

      expect(response.status).toBe(404)
    }
  )

  it("un metodo non esportato risponde 405", async () => {
    const response = await app.request("/api/user/preferences", {
      method: "GET",
    })

    expect(response.status).toBe(405)
  })

  it("con sessione le preferenze della tabella clienti usano @/trpc/server e rispondono OK", async () => {
    const operator = await createOperator()
    const { cookie } = await signIn(operator.userId)

    const response = await app.request("/api/user/preferences?pref=ct", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
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
    const { cookie } = await signIn(operator.userId)

    const response = await app.request("/api/user/preferences", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
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
      const { cookie } = await signIn(operator.userId)

      const response = await fetch(
        `http://127.0.0.1:${port}/api/user/preferences?pref=ct`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            preferences: { customerTableVisibleColumns: ["name", "surname"] },
          }),
        }
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ message: "OK" })
    } finally {
      server.close()
    }
  })
})

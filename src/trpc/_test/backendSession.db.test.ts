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
import { serve, type ServerType } from "@hono/node-server"
import { sessions } from "@/server/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"
import { app } from "../../../api/src/app"
import { backendSession } from "../backendSession"

// The real NextAuth configuration, as the backend runs it
vi.unmock("@/server/auth")

const DAY = 24 * 60 * 60 * 1000

// The backend of api/ on a real port, as Cloud Run serves it
let server: ServerType
let backendUrl: string

beforeAll(async () => {
  await migrateUpTo()
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" })
  await once(server, "listening")
  backendUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

beforeEach(async () => {
  await resetDb()
  vi.stubEnv("NEXTAUTH_URL", "https://staging-crm.example.it")
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret")
})

afterAll(() => {
  vi.unstubAllEnvs()
  server.close()
})

describe("backendSession", () => {
  it("con il cookie di una sessione risponde la sessione del backend", async () => {
    const operator = await createOperator()
    await testDb.insert(sessions).values({
      sessionToken: "token",
      userId: operator.userId,
      expires: new Date(Date.now() + 20 * DAY),
    })

    const session = await backendSession({
      url: backendUrl,
      cookie: "__Secure-next-auth.session-token=token",
    })

    expect(session?.user.id).toBe(operator.userId)
  })

  it("senza cookie risponde nessuna sessione", async () => {
    expect(await backendSession({ url: backendUrl, cookie: null })).toBeNull()
  })

  it("se il backend non risponde 200 lancia, invece di mandare al login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("down", { status: 503 })
    )

    await expect(
      backendSession({ url: backendUrl, cookie: null })
    ).rejects.toThrow(/503/)
  })
})

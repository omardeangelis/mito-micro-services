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
import { migrateUpTo, resetDb } from "@/test/db"
import { signIn } from "@/test/authSession"
import { createOperator } from "@/test/factories"
import { app } from "../../../apps/api/src/app"
import { backendSession } from "../backendSession"

// The real session read: better-auth of the app, as the backend runs it
vi.unmock("@mito/server/auth")

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
})

afterAll(() => {
  server.close()
})

describe("backendSession", () => {
  it("con il cookie di una sessione risponde la sessione del backend", async () => {
    const operator = await createOperator()
    const { cookie } = await signIn(operator.userId)

    const session = await backendSession({ url: backendUrl, cookie })

    expect(session?.user.id).toBe(operator.userId)
    expect(new Date(session!.expires).valueOf()).toBeGreaterThan(Date.now())
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

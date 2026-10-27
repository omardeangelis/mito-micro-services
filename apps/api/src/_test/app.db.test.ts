import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { eq } from "drizzle-orm"
import { authSessions } from "@mito/db/schema/auth"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { signIn, SESSION_COOKIE } from "@/test/authSession"
import { createOperator } from "@/test/factories"
import { app } from "../app"

// The real session read: better-auth of the app, which the backend runs once
// per request
vi.unmock("@mito/server/auth")

const DAY = 24 * 60 * 60 * 1000

const sessionOf = (token: string) =>
  testDb
    .select()
    .from(authSessions)
    .where(eq(authSessions.token, token))
    .then((rows) => rows[0])

const getPreferences = (cookie?: string) =>
  app.request("/api/trpc/user.getUserPreference", {
    headers: cookie ? { cookie } : {},
  })

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

afterAll(() => {
  vi.useRealTimers()
})

describe("backend", () => {
  it("risponde all'health check", async () => {
    const response = await app.request("/health")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it("senza cookie di sessione una procedura protetta risponde UNAUTHORIZED, come in Next.js", async () => {
    const response = await getPreferences()
    expect(response.status).toBe(401)
    const body = (await response.json()) as {
      error: { json: { data: { code: string } } }
    }
    expect(body.error.json.data.code).toBe("UNAUTHORIZED")
  })

  it("con il cookie di una sessione valida esegue la procedura come quell'utente", async () => {
    const operator = await createOperator({ role: "ADMIN" })
    const { cookie } = await signIn(operator.userId)

    const response = await getPreferences(`other=1; ${cookie}`)

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      result: { data: { json: { role: string; operatorId: number } } }
    }
    expect(body.result.data.json).toMatchObject({
      role: "ADMIN",
      operatorId: operator.id,
    })
  })

  it("un token che non è nel database non autentica", async () => {
    const response = await getPreferences(`${SESSION_COOKIE}=sconosciuto`)
    expect(response.status).toBe(401)
  })

  it("un token con la firma sbagliata non autentica", async () => {
    const operator = await createOperator()
    const { token } = await signIn(operator.userId)

    const response = await getPreferences(
      `${SESSION_COOKIE}=${encodeURIComponent(`${token}.${"A".repeat(43)}=`)}`
    )

    expect(response.status).toBe(401)
  })

  it("una sessione scaduta non autentica e viene cancellata", async () => {
    const operator = await createOperator()
    const { token, cookie } = await signIn(operator.userId, {
      expiresAt: new Date(Date.now() - 1000),
    })

    const response = await getPreferences(cookie)

    expect(response.status).toBe(401)
    expect(await sessionOf(token)).toBeUndefined()
  })

  it("una sessione con più di un giorno di vita prende una nuova scadenza a trenta giorni", async () => {
    const operator = await createOperator()
    // Created two days ago: expires in 28 days
    const { token, cookie } = await signIn(operator.userId, {
      expiresAt: new Date(Date.now() + 28 * DAY),
    })

    await getPreferences(cookie)

    const session = await sessionOf(token)
    expect(session!.expiresAt.valueOf()).toBeGreaterThan(Date.now() + 29 * DAY)
  })

  it("una sessione creata da meno di un giorno mantiene la sua scadenza", async () => {
    const operator = await createOperator()
    const expiresAt = new Date(Date.now() + 30 * DAY - 60 * 60 * 1000)
    const { token, cookie } = await signIn(operator.userId, { expiresAt })

    await getPreferences(cookie)

    const session = await sessionOf(token)
    expect(session!.expiresAt.valueOf()).toBe(expiresAt.valueOf())
  })
})

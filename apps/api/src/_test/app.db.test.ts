import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"
import { sessions } from "@/server/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"
import { app } from "../app"

// The real NextAuth configuration: the backend reads sessions with its adapter
// and its `session` callback
vi.unmock("@/server/auth")

const DAY = 24 * 60 * 60 * 1000

async function signIn(userId: string, expires: Date) {
  const sessionToken = `token-${userId}`
  await testDb.insert(sessions).values({ sessionToken, userId, expires })
  return sessionToken
}

const sessionOf = (sessionToken: string) =>
  testDb
    .select()
    .from(sessions)
    .where(eq(sessions.sessionToken, sessionToken))
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
    const token = await signIn(operator.userId, new Date(Date.now() + 20 * DAY))

    const response = await getPreferences(
      `other=1; __Secure-next-auth.session-token=${token}`
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      result: { data: { json: { role: string; operatorId: number } } }
    }
    expect(body.result.data.json).toMatchObject({
      role: "ADMIN",
      operatorId: operator.id,
    })
  })

  it("accetta anche il cookie senza prefisso di next dev", async () => {
    const operator = await createOperator()
    const token = await signIn(operator.userId, new Date(Date.now() + 20 * DAY))

    const response = await getPreferences(`next-auth.session-token=${token}`)

    expect(response.status).toBe(200)
  })

  it("un token che non è nel database non autentica", async () => {
    const response = await getPreferences(
      "__Secure-next-auth.session-token=sconosciuto"
    )
    expect(response.status).toBe(401)
  })

  it("una sessione scaduta non autentica e viene cancellata, come fa NextAuth", async () => {
    const operator = await createOperator()
    const token = await signIn(operator.userId, new Date(Date.now() - 1000))

    const response = await getPreferences(
      `__Secure-next-auth.session-token=${token}`
    )

    expect(response.status).toBe(401)
    expect(await sessionOf(token)).toBeUndefined()
  })

  it("una sessione con più di un giorno di vita prende una nuova scadenza a trenta giorni", async () => {
    const operator = await createOperator()
    // Created two days ago: expires in 28 days
    const token = await signIn(operator.userId, new Date(Date.now() + 28 * DAY))

    await getPreferences(`__Secure-next-auth.session-token=${token}`)

    const session = await sessionOf(token)
    expect(session!.expires.valueOf()).toBeGreaterThan(Date.now() + 29 * DAY)
  })

  it("una sessione creata da meno di un giorno mantiene la sua scadenza", async () => {
    const operator = await createOperator()
    const expires = new Date(Date.now() + 30 * DAY - 60 * 60 * 1000)
    const token = await signIn(operator.userId, expires)

    await getPreferences(`__Secure-next-auth.session-token=${token}`)

    const session = await sessionOf(token)
    expect(session!.expires.valueOf()).toBe(expires.valueOf())
  })
})

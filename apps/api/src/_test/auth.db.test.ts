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
import { sessions } from "@/server/db/schema/users"
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

// The cookies of a response, as the browser would send them back
const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ")

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

describe("auth sul backend", () => {
  it("senza cookie /api/auth/session risponde una sessione vuota", async () => {
    const response = await app.request("/api/auth/session")

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
  })

  it("con il cookie di una sessione /api/auth/session risponde l'utente con il suo id", async () => {
    const operator = await createOperator()
    const token = await signIn(operator.userId)

    const response = await app.request("/api/auth/session", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { user: { id: string } }
    expect(body.user.id).toBe(operator.userId)
  })

  it("/api/auth/csrf risponde il token e imposta il cookie __Secure- del frontend", async () => {
    const response = await app.request("/api/auth/csrf")

    expect(response.status).toBe(200)
    const body = (await response.json()) as { csrfToken: string }
    expect(body.csrfToken).toMatch(/\w+/)
    expect(cookiesOf(response)).toContain("__Host-next-auth.csrf-token=")
  })

  it("il logout con il token csrf cancella la sessione e reindirizza al frontend", async () => {
    const operator = await createOperator()
    const token = await signIn(operator.userId)
    const csrf = await app.request("/api/auth/csrf")
    const { csrfToken } = (await csrf.json()) as { csrfToken: string }

    const response = await app.request("/api/auth/signout", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `${cookiesOf(csrf)}; ${SESSION_COOKIE}=${token}`,
      },
      body: new URLSearchParams({ csrfToken, json: "true" }).toString(),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { url: string }
    expect(body.url.startsWith(FRONTEND)).toBe(true)
    const left = await testDb
      .select()
      .from(sessions)
      .where(eq(sessions.sessionToken, token))
    expect(left).toEqual([])
    expect(cookiesOf(response)).toContain(`${SESSION_COOKIE}=`)
  })

  it("il logout senza token csrf non cancella la sessione", async () => {
    const operator = await createOperator()
    const token = await signIn(operator.userId)

    const response = await app.request("/api/auth/signout", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `${SESSION_COOKIE}=${token}`,
      },
      body: "",
    })

    expect(response.status).toBe(302)
    const left = await testDb
      .select()
      .from(sessions)
      .where(eq(sessions.sessionToken, token))
    expect(left).toHaveLength(1)
  })

  it("/api/auth/user risponde l'operatore della sessione", async () => {
    const operator = await createOperator({ role: "ADMIN" })
    const token = await signIn(operator.userId)

    const response = await app.request("/api/auth/user", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      operator: { id: number }
      isAdmin: boolean
    }
    expect(body.operator.id).toBe(operator.id)
    expect(body.isAdmin).toBe(true)
  })
})

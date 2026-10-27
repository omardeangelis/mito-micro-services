import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"
import { authSessions } from "@mito/db/schema/auth"
import { sessions } from "@mito/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { signIn, SESSION_COOKIE } from "@/test/authSession"
import { createOperator } from "@/test/factories"
import { app } from "../app"

// The real session read: better-auth of the app, from the env of
// vitest.config.ts (spec auth-better-auth, T7)
vi.unmock("@mito/server/auth")

const FRONTEND = "https://staging-crm.example.it"
const DAY = 24 * 60 * 60 * 1000

const sessionRow = (token: string) =>
  testDb.select().from(authSessions).where(eq(authSessions.token, token))

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("auth sul backend", () => {
  it("senza cookie /api/auth/get-session risponde nessuna sessione", async () => {
    const response = await app.request("/api/auth/get-session")

    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
  })

  it("con il cookie di una sessione /api/auth/get-session risponde l'utente con il suo id", async () => {
    const operator = await createOperator()
    const { cookie } = await signIn(operator.userId)

    const response = await app.request("/api/auth/get-session", {
      headers: { cookie },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { user: { id: string } }
    expect(body.user.id).toBe(operator.userId)
  })

  it("/api/auth/session risponde la sessione nella forma di NextAuth, {} senza (D16)", async () => {
    const operator = await createOperator()
    const { cookie } = await signIn(operator.userId)

    const signedIn = await app.request("/api/auth/session", {
      headers: { cookie },
    })
    const signedOut = await app.request("/api/auth/session")

    const body = (await signedIn.json()) as {
      user: { id: string }
      expires: string
    }
    expect(body.user.id).toBe(operator.userId)
    expect(new Date(body.expires).valueOf()).toBeGreaterThan(Date.now())
    expect(await signedOut.json()).toEqual({})
  })

  it("il cookie di una sessione NextAuth ancora valida non dà sessione (AC20)", async () => {
    const operator = await createOperator()
    await testDb.insert(sessions).values({
      sessionToken: "nextauth-token",
      userId: operator.userId,
      expires: new Date(Date.now() + 20 * DAY),
    })

    const response = await app.request("/api/auth/get-session", {
      headers: { cookie: "__Secure-next-auth.session-token=nextauth-token" },
    })

    expect(await response.json()).toBeNull()
  })

  it("il logout cancella la sessione, e il cookie riusato non vale più (AC19)", async () => {
    const operator = await createOperator()
    const { token, cookie } = await signIn(operator.userId)

    const response = await app.request("/api/auth/sign-out", {
      method: "POST",
      headers: { cookie, origin: FRONTEND },
    })

    expect(response.status).toBe(200)
    expect(await sessionRow(token)).toEqual([])
    expect(response.headers.getSetCookie().join("\n")).toContain(
      `${SESSION_COOKIE}=;`
    )
    const again = await app.request("/api/auth/get-session", {
      headers: { cookie },
    })
    expect(await again.json()).toBeNull()
  })

  it("il logout da un'altra origine non cancella la sessione", async () => {
    const operator = await createOperator()
    const { token, cookie } = await signIn(operator.userId)

    const response = await app.request("/api/auth/sign-out", {
      method: "POST",
      headers: { cookie, origin: "https://evil.example.com" },
    })

    expect(response.status).toBe(403)
    expect(await sessionRow(token)).toHaveLength(1)
  })

  it("il cookie di sessione è HttpOnly, Secure e SameSite=Lax (AC17)", async () => {
    const operator = await createOperator()
    const { cookie } = await signIn(operator.userId)

    // better-auth writes it with the same attributes at the login and when it
    // clears it: here, at the logout
    const response = await app.request("/api/auth/sign-out", {
      method: "POST",
      headers: { cookie, origin: FRONTEND },
    })

    const written = response.headers
      .getSetCookie()
      .find((line) => line.startsWith(`${SESSION_COOKIE}=`))
    expect(written).toBeDefined()
    expect(written).toMatch(/;\s*HttpOnly/i)
    expect(written).toMatch(/;\s*Secure/i)
    expect(written).toMatch(/;\s*SameSite=Lax/i)
  })

  it("le operazioni fuori dall'elenco rispondono 404 anche sul backend (D9)", async () => {
    const response = await app.request("/api/auth/list-sessions")
    expect(response.status).toBe(404)
  })

  it("/api/auth/user risponde l'operatore della sessione", async () => {
    const operator = await createOperator({ role: "ADMIN" })
    const { cookie } = await signIn(operator.userId)

    const response = await app.request("/api/auth/user", {
      headers: { cookie },
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

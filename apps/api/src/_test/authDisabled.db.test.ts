import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { sessions } from "@mito/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"
import { app } from "../app"
import { sessionFromRequest } from "../session"

// The real NextAuth configuration: the backend reads sessions with its adapter
vi.unmock("@mito/server/auth")

const DAY = 24 * 60 * 60 * 1000
const SESSION_COOKIE = "__Secure-next-auth.session-token"

/** A session row of `userId`, valid for another 20 days, and its token. */
async function signIn(userId: string) {
  const sessionToken = `token-${userId}`
  await testDb
    .insert(sessions)
    .values({ sessionToken, userId, expires: new Date(Date.now() + 20 * DAY) })
  return sessionToken
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

// A deactivated user is out of the sessions the backend reads too
// (gestione-operatori, AC16)
describe("sessione di un utente disattivato sul backend", () => {
  it("sessionFromRequest la tratta come una sessione inesistente", async () => {
    const operator = await createOperator({ disabledAt: new Date() })
    const token = await signIn(operator.userId)

    const request = new Request("http://localhost/api/trpc", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    })

    expect(await sessionFromRequest(request)).toBeNull()
  })

  it("una procedura protetta risponde UNAUTHORIZED", async () => {
    const operator = await createOperator({ disabledAt: new Date() })
    const token = await signIn(operator.userId)

    const response = await app.request("/api/trpc/user.getUserPreference", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    })

    expect(response.status).toBe(401)
    const body = (await response.json()) as {
      error: { json: { data: { code: string } } }
    }
    expect(body.error.json.data.code).toBe("UNAUTHORIZED")
  })
})

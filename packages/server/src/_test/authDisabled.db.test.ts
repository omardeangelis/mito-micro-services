import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { sessions } from "@mito/db/schema/users"
import { authOptions } from "../auth"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"

// The real NextAuth configuration, which the other tests get mocked
vi.unmock("@mito/server/auth")

// A deactivated user is out of every session (gestione-operatori, AC16)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

afterAll(() => {
  vi.unstubAllEnvs()
})

const adapter = authOptions.adapter!

/** A session row of `userId`, valid for another day, and its token. */
async function openSession(userId: string) {
  const sessionToken = `token-${userId}`
  await testDb.insert(sessions).values({
    sessionToken,
    userId,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })
  return sessionToken
}

describe("adapter.getSessionAndUser", () => {
  it("restituisce null per la sessione ancora valida di un utente disattivato", async () => {
    const operator = await createOperator({ disabledAt: new Date() })
    const token = await openSession(operator.userId)

    expect(await adapter.getSessionAndUser!(token)).toBeNull()
  })

  it("restituisce sessione e utente di un utente attivo", async () => {
    const operator = await createOperator()
    const token = await openSession(operator.userId)

    const found = await adapter.getSessionAndUser!(token)

    expect(found?.user.id).toBe(operator.userId)
    expect(found?.session.sessionToken).toBe(token)
  })
})

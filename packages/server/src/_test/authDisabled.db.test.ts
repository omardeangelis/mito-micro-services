import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { type User } from "next-auth"
import { sessions, users } from "@mito/db/schema/users"
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

describe("signIn di un utente disattivato", () => {
  const signIn = (user: { id: string; email: string }) =>
    authOptions.callbacks!.signIn!({ user: user as User, account: null })

  it("lo rifiuta riconosciuto per id, l'utente dell'adapter di un account collegato", async () => {
    const operator = await createOperator({ disabledAt: new Date() })

    expect(
      await signIn({
        id: operator.userId,
        email: `${operator.userId}@test.local`,
      })
    ).toBe(false)
  })

  it("lo rifiuta riconosciuto per email, anche con altre maiuscole, con l'id del provider", async () => {
    const operator = await createOperator({ disabledAt: new Date() })
    const email = `${operator.userId}@test.local`

    expect(await signIn({ id: "provider-id", email })).toBe(false)
    expect(
      await signIn({ id: "provider-id", email: email.toUpperCase() })
    ).toBe(false)
    expect(await testDb.select({ id: users.id }).from(users)).toEqual([
      { id: operator.userId },
    ])
  })

  it("fa ancora entrare un utente attivo già nel database", async () => {
    const operator = await createOperator()

    expect(
      await signIn({
        id: operator.userId,
        email: `${operator.userId}@test.local`,
      })
    ).toBe(true)
  })
})

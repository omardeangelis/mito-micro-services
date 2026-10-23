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
import { users } from "@mito/db/schema/users"
import { authOptions } from "../auth"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"

// The real NextAuth configuration, which the other tests get mocked
vi.unmock("@mito/server/auth")

// Production: Azure only, and anyone the tenant lets in (no APP_ENV=staging)
vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production")
  vi.stubEnv("AZURE_AD_CLIENT_ID", "client-id")
  vi.stubEnv("AZURE_AD_CLIENT_SECRET", "client-secret")
  vi.stubEnv("AZURE_AD_TENANT_ID", "tenant-id")
})

const signIn = (user: { id: string; email: string }) =>
  authOptions.callbacks!.signIn!({ user: user as User, account: null })

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

afterAll(() => {
  vi.unstubAllEnvs()
})

// A deactivated user can't sign in, in production too (gestione-operatori, AC17)
describe("signIn in produzione", () => {
  it("offre solo Azure", () => {
    expect(authOptions.providers.map((provider) => provider.id)).toEqual([
      "azure-ad",
    ])
  })

  it("rifiuta un utente disattivato riconosciuto per id", async () => {
    const operator = await createOperator({ disabledAt: new Date() })

    expect(
      await signIn({
        id: operator.userId,
        email: `${operator.userId}@test.local`,
      })
    ).toBe(false)
  })

  it("rifiuta un utente disattivato riconosciuto per email con altre maiuscole, senza crearne uno nuovo", async () => {
    const operator = await createOperator({ disabledAt: new Date() })

    expect(
      await signIn({
        id: "azure-profile-id",
        email: `${operator.userId}@test.local`.toUpperCase(),
      })
    ).toBe(false)
    expect(await testDb.select({ id: users.id }).from(users)).toEqual([
      { id: operator.userId },
    ])
  })

  it("fa ancora entrare chiunque non sia disattivato, anche senza utente", async () => {
    const operator = await createOperator()

    expect(
      await signIn({
        id: operator.userId,
        email: `${operator.userId}@test.local`,
      })
    ).toBe(true)
    expect(
      await signIn({ id: "azure-profile-id", email: "nuovo@tenant.it" })
    ).toBe(true)
  })
})

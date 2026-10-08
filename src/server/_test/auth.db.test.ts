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
import { type User } from "next-auth"
import { operators } from "@/server/db/schema/operators"
import { users } from "@/server/db/schema/users"
import { authOptions } from "@/server/auth"
import { migrateUpTo, resetDb, testDb } from "@/test/db"

// The real NextAuth configuration, which the other tests get mocked
vi.unmock("@/server/auth")

// Staging: a preview deployment with Azure, SendGrid and the allowed addresses
vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview")
  vi.stubEnv("AZURE_AD_CLIENT_ID", "client-id")
  vi.stubEnv("AZURE_AD_CLIENT_SECRET", "client-secret")
  vi.stubEnv("AZURE_AD_TENANT_ID", "tenant-id")
  vi.stubEnv("SENDGRID_USERNAME", "apikey")
  vi.stubEnv("SENDGRID_API_KEY", "sendgrid-key")
  vi.stubEnv("SENDGRID_SERVER", "smtp.sendgrid.net")
  vi.stubEnv("SENDGRID_PORT", "587")
  vi.stubEnv("AUTH_ALLOWED_EMAILS", " Info@Sevedemo.com,info@spatalo.tech ")
})

const signIn = (email: string | null) =>
  authOptions.callbacks!.signIn!({
    user: { id: "provider-id", email } as User,
    account: null,
  })

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe("auth outside production", () => {
  it("offre l'accesso con Azure e con il link via email", () => {
    expect(authOptions.providers.map((provider) => provider.id)).toEqual([
      "azure-ad",
      "email",
    ])
  })

  it("fa entrare un utente già nel database, con l'email in maiuscolo o minuscolo", async () => {
    await testDb.insert(users).values({ id: "u1", email: "Mario.Rossi@x.it" })

    expect(await signIn("mario.rossi@X.it")).toBe(true)
  })

  it("fa entrare gli indirizzi di AUTH_ALLOWED_EMAILS anche senza utente", async () => {
    expect(await signIn("info@sevedemo.com")).toBe(true)
    expect(await signIn("INFO@spatalo.tech")).toBe(true)
  })

  it("rifiuta un indirizzo che non è nel database né fra quelli ammessi", async () => {
    await testDb.insert(users).values({ id: "u1", email: "mario.rossi@x.it" })

    expect(await signIn("estraneo@x.it")).toBe(false)
    expect(await signIn(null)).toBe(false)
  })

  it("crea l'utente senza immagine insieme al suo operatore", async () => {
    const created = await authOptions.adapter!.createUser!({
      name: "Ada",
      email: "ada@x.it",
      image: "https://example.com/ada.png",
      emailVerified: null,
    })

    const [user] = await testDb
      .select()
      .from(users)
      .where(eq(users.id, created.id))
    expect(user).toMatchObject({ name: "Ada", email: "ada@x.it", image: null })
    expect(
      await testDb
        .select({ userId: operators.userId })
        .from(operators)
        .where(eq(operators.userId, created.id))
    ).toEqual([{ userId: created.id }])
  })
})

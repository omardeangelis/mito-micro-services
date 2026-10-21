import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { eq } from "drizzle-orm"
import { type User } from "next-auth"
import { type AdapterUser } from "next-auth/adapters"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { authOptions } from "@/server/auth"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failNextInsertInto } from "@/test/failpoint"

// The real NextAuth configuration, which the other tests get mocked
vi.unmock("@/server/auth")

// Staging: a production deployment of its own project, with APP_ENV=staging,
// Azure, SendGrid and the allowed addresses
vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production")
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging")
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

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(() => {
  vi.unstubAllEnvs()
})

const adapter = authOptions.adapter!

// The Adapter type allows two createUser signatures; NextAuth v4 calls the
// one without the id, as here (see src/server/auth.ts)
const adapterCreateUser = adapter.createUser as (
  user: Omit<AdapterUser, "id">
) => Promise<AdapterUser>

const createUser = () =>
  adapterCreateUser({
    name: "Ada",
    email: "ada@x.it",
    image: "https://example.com/ada.png",
    emailVerified: new Date("2026-10-01T08:00:00.000Z"),
  })

describe("auth outside production", () => {
  it("offre l'accesso con Azure e con il link via email", () => {
    expect(authOptions.providers.map((provider) => provider.id)).toEqual([
      "azure-ad",
      "email",
    ])
  })

  it("fa entrare un utente già nel database, che l'adapter poi ritrova", async () => {
    await testDb.insert(users).values({ id: "u1", email: "mario.rossi@x.it" })

    expect(await signIn("mario.rossi@x.it")).toBe(true)
    expect(await adapter.getUserByEmail!("mario.rossi@x.it")).toMatchObject({
      id: "u1",
    })
  })

  it("fa entrare un utente salvato con le maiuscole che arriva con la stessa email", async () => {
    await testDb.insert(users).values({ id: "u1", email: "Mario.Rossi@x.it" })

    expect(await signIn("Mario.Rossi@x.it")).toBe(true)
    expect(await adapter.getUserByEmail!("Mario.Rossi@x.it")).toMatchObject({
      id: "u1",
    })
  })

  it("rifiuta un utente salvato con altre maiuscole, per cui l'adapter creerebbe un secondo utente", async () => {
    await testDb.insert(users).values([
      { id: "u1", email: "Mario.Rossi@x.it" },
      { id: "u2", email: "INFO@spatalo.tech" },
    ])

    expect(await adapter.getUserByEmail!("mario.rossi@x.it")).toBeNull()
    expect(await signIn("mario.rossi@x.it")).toBe(false)
    expect(await signIn("info@spatalo.tech")).toBe(false)
    expect(await testDb.select({ id: users.id }).from(users)).toHaveLength(2)
  })

  it("fa entrare gli indirizzi di AUTH_ALLOWED_EMAILS anche senza utente", async () => {
    expect(await signIn("info@sevedemo.com")).toBe(true)
    expect(await signIn("INFO@spatalo.tech")).toBe(true)
  })

  it("rifiuta un indirizzo che non è nel database né fra quelli ammessi", async () => {
    await testDb.insert(users).values({ id: "u1", email: "mario.rossi@x.it" })

    expect(await signIn("estraneo@x.it")).toBe(false)
    expect(await signIn("")).toBe(false)
    expect(await signIn(null)).toBe(false)
  })

  it("prende l'email alla lettera, senza caratteri jolly", async () => {
    await testDb.insert(users).values({ id: "u1", email: "mario.rossi@x.it" })

    expect(await signIn("%@x.it")).toBe(false)
    expect(await signIn("mario.rossi@x.i_")).toBe(false)
  })

  it("non fa entrare nessuno se il database non risponde, e non mostra l'errore del driver", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.spyOn(testDb, "select").mockImplementationOnce(() => {
      throw new Error("connect ECONNREFUSED 10.0.0.1:5432")
    })

    await expect(signIn("mario.rossi@x.it")).rejects.toThrow(/^Sign-in failed$/)
    expect(console.error).toHaveBeenCalled()
  })

  it("crea l'utente senza immagine insieme al suo operatore", async () => {
    const created = await createUser()

    expect(created).toMatchObject({
      name: "Ada",
      email: "ada@x.it",
      image: null,
      emailVerified: new Date("2026-10-01T08:00:00.000Z"),
    })
    const [user] = await testDb
      .select()
      .from(users)
      .where(eq(users.id, created.id))
    expect(user).toMatchObject({
      name: "Ada",
      email: "ada@x.it",
      image: null,
      role: "ADMIN",
    })
    expect(
      await testDb
        .select({ userId: operators.userId })
        .from(operators)
        .where(eq(operators.userId, created.id))
    ).toEqual([{ userId: created.id }])
  })

  it("se l'operatore non si crea, non lascia nemmeno l'utente", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    await failNextInsertInto(operators)

    await expect(createUser()).rejects.toThrow(/^Sign-in failed$/)
    expect(await testDb.select().from(users)).toEqual([])
    expect(await testDb.select().from(operators)).toEqual([])
  })
})

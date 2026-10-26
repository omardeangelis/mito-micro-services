import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { eq } from "drizzle-orm"
import { authAccounts, authSessions } from "@mito/db/schema/auth"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { linkMicrosoft, loginWithMicrosoft, testAuth } from "./harness"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"
import { failNextInsertInto } from "@/test/failpoint"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  // better-auth logs every refused login
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const allSessions = () => testDb.select().from(authSessions)
const allUsers = () => testDb.select({ id: users.id }).from(users)

describe("login con Azure, account collegato", () => {
  it("rifiuta un utente disattivato: nessuna sessione (AC11)", async () => {
    const operator = await createOperator({ disabledAt: new Date() })
    await linkMicrosoft(operator.userId, "oid-ada")

    await loginWithMicrosoft(testAuth(), {
      oid: "oid-ada",
      email: `${operator.userId}@test.local`,
    })

    expect(await allSessions()).toEqual([])
  })

  it("fa entrare lo stesso utente, con ruolo, operatore e preferenze di prima (AC1)", async () => {
    const operator = await createOperator({ role: "ADMIN" })
    await testDb
      .update(users)
      .set({ preferences: '{"theme":"dark"}' })
      .where(eq(users.id, operator.userId))
    await linkMicrosoft(operator.userId, "oid-ada")

    await loginWithMicrosoft(testAuth(), {
      oid: "oid-ada",
      email: `${operator.userId}@test.local`,
    })

    expect(await allSessions()).toMatchObject([{ userId: operator.userId }])
    expect(await allUsers()).toEqual([{ id: operator.userId }])
    const [user] = await testDb
      .select()
      .from(users)
      .where(eq(users.id, operator.userId))
    expect(user).toMatchObject({
      role: "ADMIN",
      preferences: '{"theme":"dark"}',
    })
  })

  it("trova l'utente dall'account anche se l'email di Azure è cambiata (AC2)", async () => {
    const operator = await createOperator()
    await linkMicrosoft(operator.userId, "oid-ada")

    await loginWithMicrosoft(testAuth(), {
      oid: "oid-ada",
      email: "nuova.email@x.it",
    })

    expect(await allSessions()).toMatchObject([{ userId: operator.userId }])
    const [user] = await testDb
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, operator.userId))
    expect(user?.email).toBe(`${operator.userId}@test.local`)
  })
})

describe("login con Azure, account non collegato", () => {
  it("non aggancia mai un utente esistente per la sola email (AC3)", async () => {
    const operator = await createOperator()
    // Confirmed, as every user after the migration of PR B: better-auth
    // would link it with linking on
    await testDb
      .update(users)
      .set({ emailConfirmed: true })
      .where(eq(users.id, operator.userId))

    await loginWithMicrosoft(testAuth(), {
      oid: "oid-altro",
      email: `${operator.userId}@test.local`,
    })

    expect(await allSessions()).toEqual([])
    expect(await testDb.select().from(authAccounts)).toEqual([])
    expect(await allUsers()).toEqual([{ id: operator.userId }])
  })

  it("rifiuta un utente salvato con altre maiuscole, senza crearne un secondo", async () => {
    const operator = await createOperator()
    const email = `${operator.userId}@test.local`
    await testDb
      .update(users)
      .set({ email: email.toUpperCase() })
      .where(eq(users.id, operator.userId))

    await loginWithMicrosoft(testAuth(), { oid: "oid-altro", email })

    expect(await allSessions()).toEqual([])
    expect(await allUsers()).toEqual([{ id: operator.userId }])
  })

  it("rifiuta un utente disattivato cercato per email, con altre maiuscole (AC11)", async () => {
    const operator = await createOperator({ disabledAt: new Date() })

    await loginWithMicrosoft(testAuth(), {
      oid: "oid-altro",
      email: `${operator.userId}@TEST.local`,
    })

    expect(await allSessions()).toEqual([])
    expect(await allUsers()).toEqual([{ id: operator.userId }])
  })
})

describe("primo login con Azure (AC4, AC10)", () => {
  it("crea l'utente OPERATORE senza immagine, il suo operatore, l'account e la sessione", async () => {
    await loginWithMicrosoft(testAuth(), {
      oid: "oid-nuovo",
      email: "Nuovo@X.it",
      name: "Nuovo Utente",
    })

    const [user, ...others] = await testDb.select().from(users)
    expect(others).toEqual([])
    expect(user).toMatchObject({
      name: "Nuovo Utente",
      email: "nuovo@x.it",
      image: null,
      role: "OPERATORE",
      preferences: null,
      disabledAt: null,
    })
    expect(
      await testDb.select({ userId: operators.userId }).from(operators)
    ).toEqual([{ userId: user!.id }])
    expect(
      await testDb
        .select({
          userId: authAccounts.userId,
          providerId: authAccounts.providerId,
          accountId: authAccounts.accountId,
        })
        .from(authAccounts)
    ).toEqual([
      { userId: user!.id, providerId: "microsoft", accountId: "oid-nuovo" },
    ])
    expect(await allSessions()).toMatchObject([{ userId: user!.id }])
  })

  it("se l'operatore non si crea, non lascia né l'utente né l'account né la sessione", async () => {
    await failNextInsertInto(operators)

    await loginWithMicrosoft(testAuth(), {
      oid: "oid-nuovo",
      email: "nuovo@x.it",
    })

    expect(await testDb.select().from(users)).toEqual([])
    expect(await testDb.select().from(operators)).toEqual([])
    expect(await testDb.select().from(authAccounts)).toEqual([])
    expect(await allSessions()).toEqual([])
  })

  it("se l'account non si salva, non lascia l'utente", async () => {
    await failNextInsertInto(authAccounts)

    await loginWithMicrosoft(testAuth(), {
      oid: "oid-nuovo",
      email: "nuovo@x.it",
    })

    expect(await testDb.select().from(users)).toEqual([])
    expect(await testDb.select().from(operators)).toEqual([])
    expect(await allSessions()).toEqual([])
  })
})

describe("login con Azure in un ambiente di prova (AC9)", () => {
  const rules = {
    testLogin: true,
    allowedEmails: new Set(["info@sevedemo.com"]),
  }

  it("crea l'utente di un indirizzo ammesso, senza differenze di maiuscole", async () => {
    await loginWithMicrosoft(testAuth(rules), {
      oid: "oid-nuovo",
      email: "Info@SeveDemo.com",
    })

    expect(await allUsers()).toHaveLength(1)
    expect(await allSessions()).toHaveLength(1)
  })

  it("rifiuta un indirizzo che non è nel database né fra quelli ammessi", async () => {
    await loginWithMicrosoft(testAuth(rules), {
      oid: "oid-nuovo",
      email: "estraneo@x.it",
    })

    expect(await allUsers()).toEqual([])
    expect(await allSessions()).toEqual([])
  })

  it("fa entrare un utente collegato", async () => {
    const operator = await createOperator()
    await linkMicrosoft(operator.userId, "oid-ada")

    await loginWithMicrosoft(testAuth(rules), {
      oid: "oid-ada",
      email: `${operator.userId}@test.local`,
    })

    expect(await allSessions()).toMatchObject([{ userId: operator.userId }])
  })
})

describe("token di Azure (AC31)", () => {
  it("non chiede l'accesso offline né Graph, e non chiama Graph", async () => {
    const { authorization, microsoft } = await loginWithMicrosoft(testAuth(), {
      oid: "oid-nuovo",
      email: "nuovo@x.it",
    })

    expect(authorization.searchParams.get("scope")).toBe("openid profile email")
    expect(
      microsoft.requests.filter(
        ({ url }) => !url.includes("/oauth2/v2.0/token")
      )
    ).toEqual([])
  })

  it("non conserva i token nell'account, né al primo login né ai successivi", async () => {
    const auth = testAuth()
    const profile = { oid: "oid-nuovo", email: "nuovo@x.it" }
    await loginWithMicrosoft(auth, profile)
    await loginWithMicrosoft(auth, profile)

    expect(await allSessions()).toHaveLength(2)
    expect(
      await testDb
        .select({
          accessToken: authAccounts.accessToken,
          refreshToken: authAccounts.refreshToken,
          idToken: authAccounts.idToken,
        })
        .from(authAccounts)
    ).toEqual([{ accessToken: null, refreshToken: null, idToken: null }])
  })
})

describe("database che non risponde", () => {
  it("non apre la sessione se il controllo dei disattivati fallisce", async () => {
    const operator = await createOperator()
    await linkMicrosoft(operator.userId, "oid-ada")
    const select = testDb.select.bind(testDb)
    vi.spyOn(testDb, "select").mockImplementation(((
      fields?: Record<string, unknown>
    ) => {
      // The read of isUserDisabled, the only one with these two fields
      if (fields && Object.keys(fields).join() === "id,disabledAt") {
        throw new Error("connect ECONNREFUSED 10.0.0.1:5432")
      }
      return select(fields as never)
    }) as typeof testDb.select)

    await loginWithMicrosoft(testAuth(), {
      oid: "oid-ada",
      email: `${operator.userId}@test.local`,
    })

    expect(await allSessions()).toEqual([])
  })
})

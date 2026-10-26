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
import {
  linkMicrosoft,
  loginWithMicrosoft,
  openLink,
  requestLink,
  testAuth,
} from "./harness"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"
import { failNextInsertInto } from "@/test/failpoint"

beforeAll(async () => {
  await migrateUpTo()
})

let sent: { email: string; url: string }[] = []
const sendMagicLink = async (email: string, url: string) => {
  sent.push({ email, url })
}

/** A test environment with the email login and one allowed address. */
const auth = () =>
  testAuth({
    testLogin: true,
    allowedEmails: new Set(["info@sevedemo.com"]),
    sendMagicLink,
  })

beforeEach(async () => {
  await resetDb()
  sent = []
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const allSessions = () => testDb.select().from(authSessions)

/** An operator whose email is confirmed, as every user after PR B. */
async function confirmedOperator(values: { disabledAt?: Date } = {}) {
  const operator = await createOperator(values)
  await testDb
    .update(users)
    .set({ emailConfirmed: true })
    .where(eq(users.id, operator.userId))
  return { ...operator, email: `${operator.userId}@test.local` }
}

describe("link via email: a chi parte", () => {
  it("non parte per un utente disattivato, anche con altre maiuscole (AC11, AC12)", async () => {
    const operator = await confirmedOperator({ disabledAt: new Date() })

    const response = await requestLink(auth(), operator.email)
    await requestLink(auth(), operator.email.toUpperCase())

    expect(sent).toEqual([])
    // The answer doesn't tell the address was refused
    expect(response.status).toBe(200)
  })

  it("parte per un utente attivo, anche scritto con le maiuscole", async () => {
    const operator = await confirmedOperator()

    await requestLink(auth(), operator.email.toUpperCase())

    expect(sent).toHaveLength(1)
  })

  it("non parte per un utente salvato con altre maiuscole (AC9)", async () => {
    const operator = await confirmedOperator()
    await testDb
      .update(users)
      .set({ email: operator.email.toUpperCase() })
      .where(eq(users.id, operator.userId))

    await requestLink(auth(), operator.email)

    expect(sent).toEqual([])
  })

  it("parte per un indirizzo ammesso senza utente, non per uno estraneo (AC9)", async () => {
    await requestLink(auth(), "Info@SeveDemo.com")
    await requestLink(auth(), "estraneo@x.it")

    expect(sent.map(({ email }) => email.toLowerCase())).toEqual([
      "info@sevedemo.com",
    ])
  })

  it("non esiste senza il login di prova, anche con chi lo invia (AC7)", async () => {
    const response = await requestLink(
      testAuth({ testLogin: false, sendMagicLink }),
      "info@sevedemo.com"
    )

    expect(response.status).toBe(404)
    expect(sent).toEqual([])
  })
})

describe("link via email: l'apertura", () => {
  it("apre la sessione dell'utente", async () => {
    const operator = await confirmedOperator()
    await requestLink(auth(), operator.email)

    await openLink(auth(), sent[0]!.url)

    expect(await allSessions()).toMatchObject([{ userId: operator.userId }])
  })

  it("crea l'utente OPERATORE di un indirizzo ammesso, con il suo operatore", async () => {
    await requestLink(auth(), "info@sevedemo.com")

    await openLink(auth(), sent[0]!.url)

    const [user, ...others] = await testDb.select().from(users)
    expect(others).toEqual([])
    expect(user).toMatchObject({
      email: "info@sevedemo.com",
      role: "OPERATORE",
      image: null,
    })
    expect(
      await testDb.select({ userId: operators.userId }).from(operators)
    ).toEqual([{ userId: user!.id }])
    expect(await allSessions()).toMatchObject([{ userId: user!.id }])
  })

  it("se l'operatore non si crea, non lascia l'utente", async () => {
    await requestLink(auth(), "info@sevedemo.com")
    await failNextInsertInto(operators)

    await openLink(auth(), sent[0]!.url)

    expect(await testDb.select().from(users)).toEqual([])
    expect(await allSessions()).toEqual([])
  })

  it("vale una volta sola (AC8)", async () => {
    const operator = await confirmedOperator()
    await requestLink(auth(), operator.email)

    await openLink(auth(), sent[0]!.url)
    await openLink(auth(), sent[0]!.url)

    expect(await allSessions()).toHaveLength(1)
  })

  it("vale 24 ore, non di più (AC8)", async () => {
    const operator = await confirmedOperator()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-26T08:00:00Z"))
    await requestLink(auth(), operator.email)
    await requestLink(auth(), operator.email)

    vi.setSystemTime(new Date("2026-10-27T07:59:00Z"))
    await openLink(auth(), sent[0]!.url)
    expect(await allSessions()).toHaveLength(1)

    vi.setSystemTime(new Date("2026-10-27T08:01:00Z"))
    await openLink(auth(), sent[1]!.url)
    expect(await allSessions()).toHaveLength(1)
  })

  it("non apre la sessione di un utente disattivato dopo l'invio (AC11)", async () => {
    const operator = await confirmedOperator()
    await requestLink(auth(), operator.email)
    await testDb
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.id, operator.userId))

    await openLink(auth(), sent[0]!.url)

    expect(await allSessions()).toEqual([])
  })

  it("lascia collegato l'account Azure di chi entra con il link (D4)", async () => {
    const operator = await confirmedOperator()
    await linkMicrosoft(operator.userId, "oid-ada")
    await requestLink(auth(), operator.email)

    await openLink(auth(), sent[0]!.url)

    expect(await allSessions()).toHaveLength(1)
    expect(
      await testDb.select({ userId: authAccounts.userId }).from(authAccounts)
    ).toEqual([{ userId: operator.userId }])
  })

  it("lascia collegato l'account di un utente nato con Azure", async () => {
    const instance = auth()
    await loginWithMicrosoft(instance, {
      oid: "oid-nuovo",
      email: "info@sevedemo.com",
    })
    vi.unstubAllGlobals()
    await requestLink(instance, "info@sevedemo.com")

    await openLink(instance, sent[0]!.url)

    expect(await allSessions()).toHaveLength(2)
    expect(await testDb.select().from(authAccounts)).toHaveLength(1)
  })
})

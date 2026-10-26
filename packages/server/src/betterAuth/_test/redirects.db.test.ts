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
import { authSessions } from "@mito/db/schema/auth"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { authHandler } from "../handler"
import {
  BASE,
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

let sent: string[] = []

/** The handler of a test environment with Azure and the email login. */
const handler = () =>
  authHandler(
    testAuth({
      testLogin: true,
      allowedEmails: new Set(["info@sevedemo.com"]),
      sendMagicLink: async (_email, url) => {
        sent.push(url)
      },
    })
  )

beforeEach(async () => {
  await resetDb()
  sent = []
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const location = (response: Response) => response.headers.get("location")

async function activeOperator(values: { disabledAt?: Date } = {}) {
  const operator = await createOperator(values)
  await testDb
    .update(users)
    .set({ emailConfirmed: true })
    .where(eq(users.id, operator.userId))
  return { ...operator, email: `${operator.userId}@test.local` }
}

/** The body of `response`, as text, to look for what it must not say. */
const text = (response: Response) => response.clone().text()

describe("redirect di un login rifiutato o fallito (AC13)", () => {
  it("il callback di un utente disattivato risponde /login?error=1, senza altri parametri", async () => {
    const operator = await activeOperator({ disabledAt: new Date() })
    await linkMicrosoft(operator.userId, "oid-ada")

    const { callback } = await loginWithMicrosoft(handler(), {
      oid: "oid-ada",
      email: operator.email,
    })

    expect(callback.status).toBe(302)
    expect(location(callback)).toBe("/login?error=1")
    expect(callback.headers.getSetCookie()).toEqual([])
  })

  it("lo stesso per un indirizzo non ammesso e per un account non collegato", async () => {
    const operator = await activeOperator()

    const notAllowed = await loginWithMicrosoft(handler(), {
      oid: "oid-nuovo",
      email: "estraneo@x.it",
    })
    const notLinked = await loginWithMicrosoft(handler(), {
      oid: "oid-altro",
      email: operator.email,
    })

    expect(location(notAllowed.callback)).toBe("/login?error=1")
    expect(location(notLinked.callback)).toBe("/login?error=1")
  })

  it("lo stesso se il database non risponde, senza l'errore del driver", async () => {
    const operator = await activeOperator()
    await linkMicrosoft(operator.userId, "oid-ada")
    const select = testDb.select.bind(testDb)
    vi.spyOn(testDb, "select").mockImplementation(((
      fields?: Record<string, unknown>
    ) => {
      if (fields && Object.keys(fields).join() === "id,disabledAt") {
        throw new Error("connect ECONNREFUSED 10.0.0.1:5432")
      }
      return select(fields as never)
    }) as typeof testDb.select)

    const { callback } = await loginWithMicrosoft(handler(), {
      oid: "oid-ada",
      email: operator.email,
    })

    expect(location(callback)).toBe("/login?error=1")
    expect(await text(callback)).not.toMatch(/ECONNREFUSED|failed/i)
  })

  it("lo stesso se Microsoft rifiuta o l'utente annulla", async () => {
    const auth = handler()
    const start = await auth(
      new Request(`${BASE}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE },
        body: JSON.stringify({ provider: "microsoft" }),
      })
    )
    const { url } = (await start.json()) as { url: string }
    const state = new URL(url).searchParams.get("state") ?? ""

    const callback = await auth(
      new Request(
        `${BASE}/api/auth/callback/microsoft?error=access_denied&error_description=AADSTS65004&state=${state}`
      )
    )

    expect(location(callback)).toBe("/login?error=1")
  })

  it("il link di un utente nuovo il cui operatore non si crea risponde /login?error=1", async () => {
    const auth = handler()
    await requestLink(auth, "info@sevedemo.com")
    await failNextInsertInto(operators)

    const verify = await openLink(auth, sent[0]!)

    expect(verify.status).toBe(302)
    expect(location(verify)).toBe("/login?error=1")
    expect(await testDb.select().from(users)).toEqual([])
  })

  it("un link già usato o inventato risponde /login?error=1", async () => {
    const operator = await activeOperator()
    const auth = handler()
    await requestLink(auth, operator.email)
    await openLink(auth, sent[0]!)

    const again = await openLink(auth, sent[0]!)
    const invented = await openLink(
      auth,
      `${BASE}/api/auth/magic-link/verify?token=inventato`
    )

    expect(location(again)).toBe("/login?error=1")
    expect(location(invented)).toBe("/login?error=1")
  })

  it("la richiesta del link con il database giù risponde 500 senza il motivo", async () => {
    vi.spyOn(testDb, "select").mockImplementation(() => {
      throw new Error("connect ECONNREFUSED 10.0.0.1:5432")
    })

    const response = await requestLink(handler(), "info@sevedemo.com")

    expect(response.status).toBe(500)
    expect(await text(response)).not.toMatch(/ECONNREFUSED|Sign-in failed/)
    expect(sent).toEqual([])
  })
})

describe("indirizzi di ritorno (AC4, AC5, AC6)", () => {
  const evil = {
    callbackURL: "https://evil.example/rubato",
    newUserCallbackURL: "https://evil.example/nuovo",
    errorCallbackURL: "https://evil.example/errore",
  }

  it("un utente che non è nuovo va a /dashboard, qualunque indirizzo chieda il client", async () => {
    const operator = await activeOperator()
    await linkMicrosoft(operator.userId, "oid-ada")

    const { callback } = await loginWithMicrosoft(
      handler(),
      { oid: "oid-ada", email: operator.email },
      { ...evil, callbackURL: "/admin" }
    )

    expect(location(callback)).toBe("/dashboard")
  })

  it("un utente nuovo va al profilo, la prima volta", async () => {
    const { callback } = await loginWithMicrosoft(
      handler(),
      { oid: "oid-nuovo", email: "info@sevedemo.com" },
      evil
    )

    expect(location(callback)).toBe("/dashboard/profile?firstTime=true")
  })

  it("un rifiuto non va all'indirizzo d'errore del client", async () => {
    const { callback } = await loginWithMicrosoft(
      handler(),
      { oid: "oid-nuovo", email: "estraneo@x.it" },
      evil
    )

    expect(location(callback)).toBe("/login?error=1")
  })

  it("il link ignora gli indirizzi della richiesta e quelli cambiati nel link", async () => {
    const operator = await activeOperator()
    const auth = handler()
    await requestLink(auth, operator.email, evil)
    const link = new URL(sent[0]!)
    expect(link.searchParams.get("callbackURL")).toBe("/dashboard")
    link.searchParams.set("callbackURL", evil.callbackURL)

    const verify = await openLink(auth, link.href)

    expect(location(verify)).toBe(`${BASE}/dashboard`)
    expect(await testDb.select().from(authSessions)).toHaveLength(1)
  })

  it("il link di un indirizzo nuovo porta al profilo, senza il nome scelto dal client", async () => {
    const auth = handler()
    await requestLink(auth, "info@sevedemo.com", { name: "Nome Inventato" })

    const verify = await openLink(auth, sent[0]!)

    expect(location(verify)).toBe(`${BASE}/dashboard/profile?firstTime=true`)
    expect(await testDb.select({ name: users.name }).from(users)).toEqual([
      { name: "" },
    ])
  })
})

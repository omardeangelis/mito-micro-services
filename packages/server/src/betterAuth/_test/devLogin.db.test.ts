import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { authHandler } from "../handler"
import { BASE, testAuth } from "./harness"
import { migrateUpTo, resetDb } from "@/test/db"
import { createOperator } from "@/test/factories"

// The quick login of local development: admin or operator in one click, on
// two fixed accounts (devLogin)

const signIn = (
  handler: (request: Request) => Promise<Response>,
  body: Record<string, unknown>
) =>
  handler(
    new Request(`${BASE}/api/auth/sign-in/dev-account`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify(body),
    })
  )

const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ")

const sessionOf = async (
  handler: (request: Request) => Promise<Response>,
  cookie: string
) => {
  const response = await handler(
    new Request(`${BASE}/api/auth/get-session`, { headers: { cookie } })
  )
  return (await response.json()) as { user: { id: string } } | null
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("accesso rapido di sviluppo", () => {
  it("entra come admin o come operatore negli account fissi", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const operator = await createOperator()
    const handler = authHandler(
      testAuth({
        devAccounts: { admin: admin.userId, operator: operator.userId },
      })
    )

    for (const [account, userId] of [
      ["admin", admin.userId],
      ["operator", operator.userId],
    ] as const) {
      const response = await signIn(handler, { account })
      expect(response.status).toBe(200)
      expect((await sessionOf(handler, cookiesOf(response)))?.user.id).toBe(
        userId
      )
    }
  })

  it("senza gli account (fuori dallo sviluppo locale) non esiste: 404", async () => {
    await createOperator({ role: "ADMIN" })
    const handler = authHandler(testAuth({ testLogin: true }))

    const response = await signIn(handler, { account: "admin" })

    expect(response.status).toBe(404)
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it("accetta solo admin e operator, mai un id scelto dal client", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const handler = authHandler(
      testAuth({ devAccounts: { admin: admin.userId, operator: "missing" } })
    )

    const byId = await signIn(handler, { account: admin.userId })
    expect(byId.status).toBe(400)
    expect(cookiesOf(byId)).toBe("")

    // The extra field is dropped: still the admin of the config
    const extra = await signIn(handler, {
      account: "admin",
      userId: "someone-else",
    })
    expect((await sessionOf(handler, cookiesOf(extra)))?.user.id).toBe(
      admin.userId
    )
  })

  it("un account disattivato non entra", async () => {
    const admin = await createOperator({
      role: "ADMIN",
      disabledAt: new Date(),
    })
    const handler = authHandler(
      testAuth({ devAccounts: { admin: admin.userId, operator: "missing" } })
    )

    const response = await signIn(handler, { account: "admin" })

    expect(response.status).not.toBe(200)
    expect(await sessionOf(handler, cookiesOf(response))).toBeNull()
  })
})

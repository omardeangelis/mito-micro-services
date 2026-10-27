import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { Effect, Exit, Layer } from "effect"
import { eq } from "drizzle-orm"
import { authSessions } from "@mito/db/schema/auth"
import { users } from "@mito/db/schema/users"
import { DbLive } from "../../effect/db"
import { authHandler } from "../handler"
import {
  AuthSession,
  authSessionOf,
  readSession,
  SessionReadFailed,
} from "../session"
import { BASE, sessionCookie, testAuth } from "./harness"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"

let links: string[] = []
const auth = testAuth({
  testLogin: true,
  allowedEmails: new Set(),
  sendMagicLink: async (_email, url) => {
    links.push(url)
  },
})
const handler = authHandler(auth)

const read = (cookie: string) =>
  Effect.runPromise(
    readSession(new Headers({ cookie })).pipe(
      Effect.provide(Layer.merge(authSessionOf(auth), DbLive))
    )
  )

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  links = []
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function signedIn() {
  const operator = await createOperator()
  const email = `${operator.userId}@test.local`
  await testDb
    .update(users)
    .set({ emailConfirmed: true, name: "Ada" })
    .where(eq(users.id, operator.userId))
  return { operator, email, cookie: await sessionCookie(handler, email, links) }
}

const disable = (userId: string) =>
  testDb
    .update(users)
    .set({ disabledAt: new Date() })
    .where(eq(users.id, userId))

describe("readSession", () => {
  it("la sessione di un utente disattivato dopo la creazione della sessione è null (AC15)", async () => {
    const { operator, cookie } = await signedIn()
    await disable(operator.userId)

    expect(await read(cookie)).toBeNull()
  })

  it("con il cookie di una sessione valida dà l'utente, nella forma di oggi", async () => {
    const { operator, email, cookie } = await signedIn()
    const [row] = await testDb.select().from(authSessions)

    expect(await read(cookie)).toEqual({
      user: { id: operator.userId, name: "Ada", email, image: null },
      expires: row!.expiresAt.toISOString(),
    })
  })

  it("senza cookie, con un cookie inventato o di una sessione cancellata è null", async () => {
    const { cookie } = await signedIn()

    expect(await read("")).toBeNull()
    expect(await read("better-auth.session_token=inventato.firma")).toBeNull()
    await testDb.delete(authSessions)
    expect(await read(cookie)).toBeNull()
  })

  it("dura 30 giorni: scaduta è null (AC14)", async () => {
    const { cookie } = await signedIn()
    const [row] = await testDb.select().from(authSessions)
    const days = (row!.expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThanOrEqual(30)

    await testDb
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
    expect(await read(cookie)).toBeNull()
  })

  it("si rinnova dopo 24 ore di uso, non prima (AC14)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-01T08:00:00Z"))
    const { cookie } = await signedIn()
    const expiresAt = async () =>
      (await testDb.select().from(authSessions))[0]!.expiresAt.toISOString()

    vi.setSystemTime(new Date("2026-10-01T20:00:00Z"))
    await read(cookie)
    expect(await expiresAt()).toBe("2026-10-31T08:00:00.000Z")

    vi.setSystemTime(new Date("2026-10-02T09:00:00Z"))
    await read(cookie)
    expect(await expiresAt()).toBe("2026-11-01T09:00:00.000Z")
  })

  it("se better-auth non legge la sessione fallisce, non risponde null", async () => {
    const failing = Layer.succeed(AuthSession, {
      read: () => Promise.reject(new Error("connect ECONNREFUSED")),
    })

    const exit = await Effect.runPromiseExit(
      readSession(new Headers()).pipe(
        Effect.provide(Layer.merge(failing, DbLive))
      )
    )

    expect(exit).toMatchObject(
      Exit.fail(new SessionReadFailed({ cause: expect.anything() }))
    )
  })
})

describe("GET /api/auth/get-session (D16)", () => {
  const getSession = (cookie: string) =>
    handler(
      new Request(`${BASE}/api/auth/get-session`, { headers: { cookie } })
    )

  it("risponde l'utente con il suo id", async () => {
    const { operator, cookie } = await signedIn()

    expect(await (await getSession(cookie)).json()).toMatchObject({
      user: { id: operator.userId },
    })
  })

  it("risponde null per un utente disattivato dopo il login", async () => {
    const { operator, cookie } = await signedIn()
    await disable(operator.userId)

    const response = await getSession(cookie)

    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
  })

  it("risponde null senza cookie", async () => {
    expect(await (await getSession("")).json()).toBeNull()
  })
})

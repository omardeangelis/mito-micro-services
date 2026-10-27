import { afterEach, beforeAll, beforeEach, vi } from "vitest"
import { describe, expect, it } from "@effect/vitest"
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
  readSession(new Headers({ cookie })).pipe(
    Effect.provide(Layer.merge(authSessionOf(auth), DbLive))
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
  it.effect(
    "la sessione di un utente disattivato dopo la creazione della sessione è null (AC15)",
    () =>
      Effect.gen(function* () {
        const { operator, cookie } = yield* Effect.promise(() => signedIn())
        yield* Effect.promise(() => disable(operator.userId))

        expect(yield* read(cookie)).toBeNull()
      })
  )

  it.effect(
    "con il cookie di una sessione valida dà l'utente, nella forma di oggi",
    () =>
      Effect.gen(function* () {
        const { operator, email, cookie } = yield* Effect.promise(() =>
          signedIn()
        )
        const [row] = yield* Effect.promise(() =>
          testDb.select().from(authSessions)
        )

        expect(yield* read(cookie)).toEqual({
          user: { id: operator.userId, name: "Ada", email, image: null },
          expires: row!.expiresAt.toISOString(),
        })
      })
  )

  it.effect(
    "senza cookie, con un cookie inventato o di una sessione cancellata è null",
    () =>
      Effect.gen(function* () {
        const { cookie } = yield* Effect.promise(() => signedIn())

        expect(yield* read("")).toBeNull()
        expect(
          yield* read("better-auth.session_token=inventato.firma")
        ).toBeNull()
        yield* Effect.promise(() => testDb.delete(authSessions))
        expect(yield* read(cookie)).toBeNull()
      })
  )

  it.effect("dura 30 giorni: scaduta è null (AC14)", () =>
    Effect.gen(function* () {
      const { cookie } = yield* Effect.promise(() => signedIn())
      const [row] = yield* Effect.promise(() =>
        testDb.select().from(authSessions)
      )
      const days = (row!.expiresAt.getTime() - Date.now()) / 86_400_000
      expect(days).toBeGreaterThan(29.9)
      expect(days).toBeLessThanOrEqual(30)

      yield* Effect.promise(() =>
        testDb
          .update(authSessions)
          .set({ expiresAt: new Date(Date.now() - 1000) })
      )
      expect(yield* read(cookie)).toBeNull()
    })
  )

  it.effect("si rinnova dopo 24 ore di uso, non prima (AC14)", () =>
    Effect.gen(function* () {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date("2026-10-01T08:00:00Z"))
      const { cookie } = yield* Effect.promise(() => signedIn())
      const expiresAt = async () =>
        (await testDb.select().from(authSessions))[0]!.expiresAt.toISOString()

      vi.setSystemTime(new Date("2026-10-01T20:00:00Z"))
      yield* read(cookie)
      expect(yield* Effect.promise(() => expiresAt())).toBe(
        "2026-10-31T08:00:00.000Z"
      )

      vi.setSystemTime(new Date("2026-10-02T09:00:00Z"))
      yield* read(cookie)
      expect(yield* Effect.promise(() => expiresAt())).toBe(
        "2026-11-01T09:00:00.000Z"
      )
    })
  )

  it.effect(
    "se better-auth non legge la sessione fallisce, non risponde null",
    () =>
      Effect.gen(function* () {
        const failing = Layer.succeed(AuthSession, {
          read: () => Promise.reject(new Error("connect ECONNREFUSED")),
        })

        const exit = yield* readSession(new Headers()).pipe(
          Effect.provide(Layer.merge(failing, DbLive)),
          Effect.exit
        )

        expect(exit).toMatchObject(
          Exit.fail(new SessionReadFailed({ cause: expect.anything() }))
        )
      })
  )
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

import { afterEach, beforeAll, beforeEach, vi } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Cause, Clock, Context, Data, Effect, Exit } from "effect"
import { TestClock } from "effect/testing"
import { TRPCError } from "@trpc/server"
import { sql } from "drizzle-orm"
import { users } from "@mito/db/schema/users"
import { query, transaction } from "../db"
import { forEachIsolated } from "../errorReporter"
import { runTrpc } from "../trpc"
import { migrateUpTo, resetDb, testClient, testDb } from "@/test/db"
import { failureTag, isDefect, provideServer } from "@/test/effect"
import { failAtCommit } from "@/test/failpoint"
import { reportedErrors } from "@/test/errorReporter"
import { T } from "@mito/server/services/analytics/_test/clock"

class Boom extends Data.TaggedError("Boom")<Record<never, never>> {}

class Probe extends Context.Service<Probe, { readonly value: string }>()(
  "test/Probe"
) {}

const insertUser = (id: string) =>
  query((client) => client.insert(users).values({ id, email: `${id}@t.it` }))

const squashedMessage = (exit: Exit.Exit<unknown, unknown>) => {
  if (Exit.isSuccess(exit)) return undefined
  const error = Cause.squash(exit.cause)
  return error instanceof Error ? error.message : String(error)
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("transaction", () => {
  it.effect(
    "se il programma scrive e poi fallisce con un errore tipizzato, non resta nessuna scrittura e il chiamante riceve lo stesso errore",
    () =>
      Effect.gen(function* () {
        const exit = yield* transaction(
          Effect.gen(function* () {
            yield* insertUser("u1")
            return yield* new Boom()
          })
        ).pipe(provideServer, Effect.exit)

        expect(failureTag(exit)).toBe("Boom")
        expect(
          yield* Effect.promise(() => testDb.select().from(users))
        ).toEqual([])
      })
  )

  it.effect(
    "se il programma scrive e poi lancia un'eccezione, non resta nessuna scrittura e il chiamante riceve un difetto",
    () =>
      Effect.gen(function* () {
        const exit = yield* transaction(
          Effect.gen(function* () {
            yield* insertUser("u1")
            yield* Effect.sync(() => {
              throw new Error("kaboom")
            })
          })
        ).pipe(provideServer, Effect.exit)

        expect(isDefect(exit)).toBe(true)
        expect(squashedMessage(exit)).toBe("kaboom")
        expect(
          yield* Effect.promise(() => testDb.select().from(users))
        ).toEqual([])
      })
  )

  it.effect(
    "se il programma scrive e poi si interrompe, non resta nessuna scrittura e il chiamante riceve un'interruzione",
    () =>
      Effect.gen(function* () {
        const exit = yield* transaction(
          Effect.gen(function* () {
            yield* insertUser("u1")
            return yield* Effect.interrupt
          })
        ).pipe(provideServer, Effect.exit)

        expect(Exit.hasInterrupts(exit)).toBe(true)
        expect(
          yield* Effect.promise(() => testDb.select().from(users))
        ).toEqual([])
      })
  )

  it.effect(
    "chiamata dentro un'altra transazione fallisce subito con un messaggio esplicito",
    () =>
      Effect.gen(function* () {
        const exit = yield* transaction(
          Effect.gen(function* () {
            yield* insertUser("u1")
            yield* transaction(insertUser("u2"))
          })
        ).pipe(provideServer, Effect.exit)

        expect(isDefect(exit)).toBe(true)
        expect(squashedMessage(exit)).toMatch(/inside another transaction/)
        expect(
          yield* Effect.promise(() => testDb.select().from(users))
        ).toEqual([])
      })
  )

  it.effect(
    "un DbError recuperato in un successo fa comunque fallire la transazione",
    () =>
      Effect.gen(function* () {
        const exit = yield* transaction(
          Effect.gen(function* () {
            yield* insertUser("u1")
            yield* insertUser("u1").pipe(
              Effect.catchTag("DbError", () => Effect.void)
            )
          })
        ).pipe(provideServer, Effect.exit)

        expect(isDefect(exit)).toBe(true)
        expect(squashedMessage(exit)).toMatch(/DbError was recovered/)
        expect(
          yield* Effect.promise(() => testDb.select().from(users))
        ).toEqual([])
      })
  )

  it.effect("se il programma riesce le scritture restano", () =>
    Effect.gen(function* () {
      const exit = yield* transaction(insertUser("u1")).pipe(
        provideServer,
        Effect.exit
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(
        yield* Effect.promise(() => testDb.select({ id: users.id }).from(users))
      ).toEqual([{ id: "u1" }])
    })
  )

  it.effect(
    "gira in read committed anche se il database ha un altro livello di default",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          testDb.insert(users).values({ id: "u1", email: "u1@t.it" })
        )
        yield* Effect.promise(() =>
          testClient.exec(`SET default_transaction_isolation TO 'serializable'`)
        )
        const exit = yield* transaction(
          query((client) =>
            client
              .select({
                level: sql<string>`current_setting('transaction_isolation')`,
              })
              .from(users)
          )
        ).pipe(
          provideServer,
          Effect.exit,
          Effect.ensuring(
            Effect.promise(() =>
              testClient.exec(`RESET default_transaction_isolation`)
            )
          )
        )

        expect(exit).toEqual(Exit.succeed([{ level: "read committed" }]))
      })
  )
})

describe("transaction e il contesto del chiamante", () => {
  it.effect(
    "dentro la transazione Clock.currentTimeMillis vale l'istante dell'orologio fisso fornito dal chiamante",
    () =>
      Effect.gen(function* () {
        // The TestClock of it.effect, which the caller (the test) provides
        yield* TestClock.setTime(T)

        const exit = yield* transaction(
          Effect.gen(function* () {
            yield* insertUser("u1")
            return yield* Clock.currentTimeMillis
          })
        ).pipe(provideServer, Effect.exit)

        expect(exit).toEqual(Exit.succeed(T))
      })
  )

  it.effect(
    "dentro la transazione si vede un servizio fornito dal chiamante",
    () =>
      Effect.gen(function* () {
        const exit = yield* transaction(
          Effect.gen(function* () {
            yield* insertUser("u1")
            return (yield* Probe).value
          })
        ).pipe(
          Effect.provideService(Probe, { value: "dal chiamante" }),
          provideServer,
          Effect.exit
        )

        expect(exit).toEqual(Exit.succeed("dal chiamante"))
      })
  )
})

describe("transaction al COMMIT", () => {
  it.effect(
    "un COMMIT che fallisce per un vincolo differito arriva al chiamante come DbError con il codice SQLSTATE, e non resta nessuna scrittura",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => failAtCommit(users))

        const exit = yield* transaction(insertUser("u1")).pipe(
          provideServer,
          Effect.exit
        )

        expect(failureTag(exit)).toBe("DbError")
        expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({
          code: "P0001",
        })
        expect(
          yield* Effect.promise(() => testDb.select().from(users))
        ).toEqual([])
      })
  )
})

describe("query", () => {
  it.effect("fuori da una transazione legge dal DB", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        testDb.insert(users).values({ id: "u1", email: "u1@t.it" })
      )

      const exit = yield* query((client) =>
        client.select({ id: users.id }).from(users)
      ).pipe(provideServer, Effect.exit)

      expect(exit).toEqual(Exit.succeed([{ id: "u1" }]))
    })
  )

  it.effect(
    "un errore del driver diventa un DbError con il codice SQLSTATE",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          testDb.insert(users).values({ id: "u1", email: "u1@t.it" })
        )

        const exit = yield* insertUser("u1").pipe(
          Effect.catchTag("DbError", (error) => Effect.succeed(error.code)),
          provideServer,
          Effect.exit
        )

        expect(exit).toEqual(Exit.succeed("23505"))
      })
  )
})

// runTrpc is an edge: these tests go through its Promise interface, so they
// stay plain `it`
describe("runTrpc", () => {
  it("restituisce il valore del programma", async () => {
    await expect(runTrpc(Effect.succeed(42))).resolves.toBe(42)
  })

  it("traduce un errore tipizzato con mapError", async () => {
    await expect(
      runTrpc(
        new Boom(),
        () => new TRPCError({ code: "CONFLICT", message: "boom" })
      )
    ).rejects.toMatchObject({ code: "CONFLICT", message: "boom" })
  })

  it("trasforma un DbError in INTERNAL_SERVER_ERROR con il messaggio del driver", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      runTrpc(query((client) => client.execute(sql`SELECT * FROM missing`)))
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: 'relation "missing" does not exist',
    })
  })

  it("trasforma un difetto in INTERNAL_SERVER_ERROR con il messaggio dell'eccezione", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      runTrpc(
        Effect.sync(() => {
          throw new Error("kaboom")
        })
      )
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "kaboom",
    })
  })
})

// it.live: ServerLive's logger writes to the console of the fiber, which
// it.effect replaces with TestConsole
describe("ServerLive", () => {
  it.live("manda Effect.logWarning su console.warn, non su console.log", () =>
    Effect.gen(function* () {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined)

      yield* Effect.logWarning("attenzione a questo").pipe(provideServer)

      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("attenzione a questo")
      )
      expect(log).not.toHaveBeenCalled()
    })
  )

  it.live("manda Effect.logInfo su console.info, non su console.log", () =>
    Effect.gen(function* () {
      const info = vi.spyOn(console, "info").mockImplementation(() => undefined)
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined)

      yield* Effect.logInfo("un'informazione").pipe(provideServer)

      expect(info).toHaveBeenCalledTimes(1)
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining("un'informazione")
      )
      expect(log).not.toHaveBeenCalled()
    })
  )

  it.live("manda Effect.logError su console.error", () =>
    Effect.gen(function* () {
      const error = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined)

      yield* Effect.logError("qualcosa è andato storto").pipe(provideServer)

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("qualcosa è andato storto")
      )
    })
  )
})

describe("forEachIsolated", () => {
  it.effect(
    "se il secondo di tre elementi muore, elabora il terzo, conta un fallimento e lo segnala una volta con i suoi dati",
    () =>
      Effect.gen(function* () {
        vi.spyOn(console, "error").mockImplementation(() => undefined)
        const seen: number[] = []

        const exit = yield* forEachIsolated(
          [1, 2, 3],
          (item) =>
            item === 2
              ? Effect.die(new Error("kaboom"))
              : Effect.sync(() => {
                  seen.push(item)
                  return item * 10
                }),
          (item) => ({ item })
        ).pipe(provideServer, Effect.exit)

        expect(exit).toEqual(Exit.succeed({ succeeded: [10, 30], failed: 1 }))
        expect(seen).toEqual([1, 3])
        expect(reportedErrors.map(({ data }) => data)).toEqual([{ item: 2 }])
      })
  )
})

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { Cause, Data, Effect, Exit } from "effect"
import { TRPCError } from "@trpc/server"
import { sql } from "drizzle-orm"
import { users } from "@/server/db/schema/users"
import { query, transaction } from "@/server/effect/db"
import { forEachIsolated } from "@/server/effect/errorReporter"
import { runTrpc } from "@/server/effect/trpc"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag, isDefect, runServer } from "@/test/effect"
import { reportedErrors } from "@/test/errorReporter"

class Boom extends Data.TaggedError("Boom")<Record<never, never>> {}

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
  it("se il programma scrive e poi fallisce con un errore tipizzato, non resta nessuna scrittura e il chiamante riceve lo stesso errore", async () => {
    const exit = await runServer(
      transaction(
        Effect.gen(function* () {
          yield* insertUser("u1")
          return yield* new Boom()
        })
      )
    )

    expect(failureTag(exit)).toBe("Boom")
    expect(await testDb.select().from(users)).toEqual([])
  })

  it("se il programma scrive e poi lancia un'eccezione, non resta nessuna scrittura e il chiamante riceve un difetto", async () => {
    const exit = await runServer(
      transaction(
        Effect.gen(function* () {
          yield* insertUser("u1")
          yield* Effect.sync(() => {
            throw new Error("kaboom")
          })
        })
      )
    )

    expect(isDefect(exit)).toBe(true)
    expect(squashedMessage(exit)).toBe("kaboom")
    expect(await testDb.select().from(users)).toEqual([])
  })

  it("chiamata dentro un'altra transazione fallisce subito con un messaggio esplicito", async () => {
    const exit = await runServer(
      transaction(
        Effect.gen(function* () {
          yield* insertUser("u1")
          yield* transaction(insertUser("u2"))
        })
      )
    )

    expect(isDefect(exit)).toBe(true)
    expect(squashedMessage(exit)).toMatch(/inside another transaction/)
    expect(await testDb.select().from(users)).toEqual([])
  })

  it("un DbError recuperato in un successo fa comunque fallire la transazione", async () => {
    const exit = await runServer(
      transaction(
        Effect.gen(function* () {
          yield* insertUser("u1")
          yield* insertUser("u1").pipe(
            Effect.catchTag("DbError", () => Effect.void)
          )
        })
      )
    )

    expect(isDefect(exit)).toBe(true)
    expect(squashedMessage(exit)).toMatch(/DbError was recovered/)
    expect(await testDb.select().from(users)).toEqual([])
  })

  it("se il programma riesce le scritture restano", async () => {
    const exit = await runServer(transaction(insertUser("u1")))

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(await testDb.select({ id: users.id }).from(users)).toEqual([
      { id: "u1" },
    ])
  })
})

describe("query", () => {
  it("fuori da una transazione legge dal DB", async () => {
    await testDb.insert(users).values({ id: "u1", email: "u1@t.it" })

    const exit = await runServer(
      query((client) => client.select({ id: users.id }).from(users))
    )

    expect(exit).toEqual(Exit.succeed([{ id: "u1" }]))
  })

  it("un errore del driver diventa un DbError con il codice SQLSTATE", async () => {
    await testDb.insert(users).values({ id: "u1", email: "u1@t.it" })

    const exit = await runServer(
      insertUser("u1").pipe(
        Effect.catchTag("DbError", (error) => Effect.succeed(error.code))
      )
    )

    expect(exit).toEqual(Exit.succeed("23505"))
  })
})

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

describe("ServerLive", () => {
  it("manda Effect.logError su console.error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

    await runServer(Effect.logError("qualcosa è andato storto"))

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("qualcosa è andato storto")
    )
  })
})

describe("forEachIsolated", () => {
  it("se il secondo di tre elementi muore, elabora il terzo, conta un fallimento e lo segnala una volta con i suoi dati", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const seen: number[] = []

    const exit = await runServer(
      forEachIsolated(
        [1, 2, 3],
        (item) =>
          item === 2
            ? Effect.die(new Error("kaboom"))
            : Effect.sync(() => {
                seen.push(item)
                return item * 10
              }),
        (item) => ({ item })
      )
    )

    expect(exit).toEqual(Exit.succeed({ succeeded: [10, 30], failed: 1 }))
    expect(seen).toEqual([1, 3])
    expect(reportedErrors.map(({ data }) => data)).toEqual([{ item: 2 }])
  })
})

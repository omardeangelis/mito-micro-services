import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Effect, Exit } from "effect"
import { users } from "@mito/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import { createOperator } from "@/test/factories"
import { updateOperatorsRole } from "../roles"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const roleOf = async (userId: string) => {
  const [row] = await testDb
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
  return row?.role
}

describe("updateOperatorsRole", () => {
  it.effect("changes the roles and returns the input as it is", () =>
    Effect.gen(function* () {
      const promoted = yield* Effect.promise(() =>
        createOperator({ role: "OPERATORE" })
      )
      const demoted = yield* Effect.promise(() =>
        createOperator({ role: "ADMIN" })
      )
      const input = [
        { id: promoted.id, role: "ADMIN" as const },
        { id: demoted.id, role: "OPERATORE" as const },
      ]

      const exit = yield* updateOperatorsRole(input).pipe(
        provideServer,
        Effect.exit
      )

      expect(exit).toEqual(Exit.succeed(input))
      expect(yield* Effect.promise(() => roleOf(promoted.userId))).toBe("ADMIN")
      expect(yield* Effect.promise(() => roleOf(demoted.userId))).toBe(
        "OPERATORE"
      )
    })
  )

  it.effect("skips an id that doesn't exist and still changes the others", () =>
    Effect.gen(function* () {
      // Another admin stays: demoting the only one is LastAdmin (AC18)
      yield* Effect.promise(() => createOperator({ role: "ADMIN" }))
      const operator = yield* Effect.promise(() =>
        createOperator({ role: "ADMIN" })
      )
      const input = [
        { id: operator.id + 1, role: "OPERATORE" as const },
        { id: operator.id, role: "OPERATORE" as const },
      ]

      const exit = yield* updateOperatorsRole(input).pipe(
        provideServer,
        Effect.exit
      )

      expect(exit).toEqual(Exit.succeed(input))
      expect(yield* Effect.promise(() => roleOf(operator.userId))).toBe(
        "OPERATORE"
      )
    })
  )
})

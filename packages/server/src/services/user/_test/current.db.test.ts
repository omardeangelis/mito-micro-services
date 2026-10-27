import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { eq } from "drizzle-orm"
import { users } from "@mito/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag, provideServer } from "@/test/effect"
import { createOperator, createUser } from "@/test/factories"
import { getCurrentUser } from "../current"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("getCurrentUser", () => {
  it.effect("of a user without an operator fails with NotAnOperator", () =>
    Effect.gen(function* () {
      const user = yield* Effect.promise(() => createUser({ role: "ADMIN" }))

      const exit = yield* getCurrentUser(user.id).pipe(
        provideServer,
        Effect.exit
      )

      expect(failureTag(exit)).toBe("NotAnOperator")
    })
  )

  it.effect(
    "of a user with an operator returns the parsed preferences, role and operatorId",
    () =>
      Effect.gen(function* () {
        const operator = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        const preferences = {
          dashboardCollapsed: true,
          contactTableVisibleColumns: ["phoneNumber"],
        }
        yield* Effect.promise(() =>
          testDb
            .update(users)
            .set({ preferences: JSON.stringify(preferences) })
            .where(eq(users.id, operator.userId))
        )

        const exit = yield* getCurrentUser(operator.userId).pipe(
          provideServer,
          Effect.exit
        )

        expect(exit).toEqual(
          Exit.succeed({
            preferences,
            role: "OPERATORE",
            operatorId: operator.id,
          })
        )
      })
  )
})

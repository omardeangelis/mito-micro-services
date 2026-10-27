import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { migrateUpTo, resetDb } from "@/test/db"
import { failureTag, provideServer } from "@/test/effect"
import { createOperator, createUser } from "@/test/factories"
import { resolveActor } from "../actor"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("resolveActor", () => {
  it.effect("fails with NotAnOperator for a user without an operator row", () =>
    Effect.gen(function* () {
      const user = yield* Effect.promise(() => createUser())

      const exit = yield* resolveActor(user.id).pipe(provideServer, Effect.exit)

      expect(failureTag(exit)).toBe("NotAnOperator")
    })
  )

  it.effect("returns the user's operator, with the role, and its actor", () =>
    Effect.gen(function* () {
      const operator = yield* Effect.promise(() =>
        createOperator({ role: "ADMIN" })
      )

      const exit = yield* resolveActor(operator.userId).pipe(
        provideServer,
        Effect.exit
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      if (!Exit.isSuccess(exit)) return
      expect(exit.value.operator).toMatchObject({
        id: operator.id,
        userId: operator.userId,
        role: "ADMIN",
      })
      expect(exit.value.actor).toEqual({
        operatorId: operator.id,
        role: "ADMIN",
      })
    })
  )
})

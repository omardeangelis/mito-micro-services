import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { migrateUpTo, resetDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import { createOperator, createUser } from "@/test/factories"
import { isUserDisabled } from "../disabled"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const disabled = (input: Parameters<typeof isUserDisabled>[0]) =>
  Effect.gen(function* () {
    const exit = yield* isUserDisabled(input).pipe(provideServer, Effect.exit)
    if (!Exit.isSuccess(exit)) throw new Error("isUserDisabled failed")
    return exit.value
  })

describe("isUserDisabled", () => {
  it.effect("is true for a deactivated user found by id", () =>
    Effect.gen(function* () {
      const operator = yield* Effect.promise(() =>
        createOperator({ disabledAt: new Date() })
      )

      expect(yield* disabled({ id: operator.userId })).toBe(true)
    })
  )

  it.effect("is false for an active user found by id", () =>
    Effect.gen(function* () {
      const operator = yield* Effect.promise(() => createOperator())

      expect(yield* disabled({ id: operator.userId })).toBe(false)
    })
  )

  it.effect("finds a deactivated user by email in another letter case", () =>
    Effect.gen(function* () {
      const user = yield* Effect.promise(() =>
        createUser({ disabledAt: new Date() })
      )

      expect(
        yield* disabled({ id: "provider-id", email: user.email.toUpperCase() })
      ).toBe(true)
    })
  )

  it.effect(
    "lets the user with the id decide over another with the email",
    () =>
      Effect.gen(function* () {
        const active = yield* Effect.promise(() => createUser())
        const other = yield* Effect.promise(() =>
          createUser({ disabledAt: new Date() })
        )

        expect(yield* disabled({ id: active.id, email: other.email })).toBe(
          false
        )
      })
  )

  it.effect("is false for no user, and without id or email", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => createUser({ disabledAt: new Date() }))

      expect(yield* disabled({ id: "nobody", email: "nobody@x.it" })).toBe(
        false
      )
      expect(yield* disabled({ email: "%@test.local" })).toBe(false)
      expect(yield* disabled({})).toBe(false)
      expect(yield* disabled({ email: null })).toBe(false)
    })
  )
})

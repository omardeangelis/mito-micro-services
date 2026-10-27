import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { migrateUpTo, resetDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import { createOperator, createSystemOperator } from "@/test/factories"
import { listActiveOperators } from "../queries"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("listActiveOperators", () => {
  it.effect(
    "lists the operators with a user, with their role, and not the system operator",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const operator = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        yield* Effect.promise(() => createSystemOperator())

        const exit = yield* listActiveOperators().pipe(
          provideServer,
          Effect.exit
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        if (!Exit.isSuccess(exit)) return
        expect(
          exit.value
            .map(({ id, role }) => ({ id, role }))
            .sort((a, b) => a.id - b.id)
        ).toEqual([
          { id: admin.id, role: "ADMIN" },
          { id: operator.id, role: "OPERATORE" },
        ])
      })
  )
})

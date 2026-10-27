import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Effect, Exit } from "effect"
import { operators } from "@mito/db/schema/operators"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag, provideServer } from "@/test/effect"
import { createOperator } from "@/test/factories"
import { updateOperatorInfo } from "../profile"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("updateOperatorInfo", () => {
  it.effect(
    "writes the name and surname of the operator and returns the row after the update (TD3 b)",
    () =>
      Effect.gen(function* () {
        const operator = yield* Effect.promise(() =>
          createOperator({ name: "Mario", surname: "Rossi" })
        )
        const other = yield* Effect.promise(() =>
          createOperator({ name: "Anna", surname: "Bianchi" })
        )

        const exit = yield* updateOperatorInfo(operator.id, {
          name: "Luigi",
          surname: "Verdi",
        }).pipe(provideServer, Effect.exit)

        expect(Exit.isSuccess(exit)).toBe(true)
        if (!Exit.isSuccess(exit)) return
        expect(exit.value).toMatchObject({
          id: operator.id,
          name: "Luigi",
          surname: "Verdi",
        })
        const rows = yield* Effect.promise(() =>
          testDb
            .select({
              id: operators.id,
              name: operators.name,
              surname: operators.surname,
            })
            .from(operators)
            .where(eq(operators.id, operator.id))
        )
        expect(rows).toEqual([
          { id: operator.id, name: "Luigi", surname: "Verdi" },
        ])
        const [untouched] = yield* Effect.promise(() =>
          testDb
            .select({ name: operators.name, surname: operators.surname })
            .from(operators)
            .where(eq(operators.id, other.id))
        )
        expect(untouched).toEqual({ name: "Anna", surname: "Bianchi" })
      })
  )

  it.effect(
    "fails with OperatorNotFound for an id with no operator, and writes nothing (TD3 b)",
    () =>
      Effect.gen(function* () {
        const other = yield* Effect.promise(() =>
          createOperator({ name: "Anna", surname: "Bianchi" })
        )

        const exit = yield* updateOperatorInfo(other.id + 1, {
          name: "Luigi",
          surname: "Verdi",
        }).pipe(provideServer, Effect.exit)

        expect(failureTag(exit)).toBe("OperatorNotFound")
        const [untouched] = yield* Effect.promise(() =>
          testDb
            .select({ name: operators.name, surname: operators.surname })
            .from(operators)
            .where(eq(operators.id, other.id))
        )
        expect(untouched).toEqual({ name: "Anna", surname: "Bianchi" })
      })
  )
})

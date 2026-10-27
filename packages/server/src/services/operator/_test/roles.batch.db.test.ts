import { beforeAll, beforeEach } from "vitest"
import {} from "@effect/vitest"
import { describe, expect, it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Effect, Exit } from "effect"
import { users } from "@mito/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag, provideServer } from "@/test/effect"
import { createTestCaller } from "@/test/caller"
import { createOperator, createUser } from "@/test/factories"
import { failNextUpdateOf } from "@/test/failpoint"
import { updateOperatorsRole } from "../roles"

// Il cambio di ruolo è un batch atomico, che non toglie l'ultimo admin e rifiuta
// i disattivati (gestione-operatori, AC18, AC19, AC20)

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

describe("updateOperatorsRole, l'ultimo admin (AC18)", () => {
  it.effect(
    "l'unico admin che si declassa riceve LastAdmin e resta ADMIN",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )

        const exit = yield* updateOperatorsRole([
          { id: admin.id, role: "OPERATORE" },
        ]).pipe(provideServer, Effect.exit)

        expect(failureTag(exit)).toBe("LastAdmin")
        expect(yield* Effect.promise(() => roleOf(admin.userId))).toBe("ADMIN")
      })
  )

  it.effect("con due admin, declassarne uno riesce", () =>
    Effect.gen(function* () {
      const a = yield* Effect.promise(() => createOperator({ role: "ADMIN" }))
      const b = yield* Effect.promise(() => createOperator({ role: "ADMIN" }))
      const input = [{ id: b.id, role: "OPERATORE" as const }]

      const exit = yield* updateOperatorsRole(input).pipe(
        provideServer,
        Effect.exit
      )

      expect(exit).toEqual(Exit.succeed(input))
      expect(yield* Effect.promise(() => roleOf(a.userId))).toBe("ADMIN")
      expect(yield* Effect.promise(() => roleOf(b.userId))).toBe("OPERATORE")
    })
  )

  it.effect(
    "declassarli entrambi nello stesso batch riceve LastAdmin e non cambia nulla",
    () =>
      Effect.gen(function* () {
        const a = yield* Effect.promise(() => createOperator({ role: "ADMIN" }))
        const b = yield* Effect.promise(() => createOperator({ role: "ADMIN" }))

        const exit = yield* updateOperatorsRole([
          { id: a.id, role: "OPERATORE" },
          { id: b.id, role: "OPERATORE" },
        ]).pipe(provideServer, Effect.exit)

        expect(failureTag(exit)).toBe("LastAdmin")
        expect(yield* Effect.promise(() => roleOf(a.userId))).toBe("ADMIN")
        expect(yield* Effect.promise(() => roleOf(b.userId))).toBe("ADMIN")
      })
  )

  it.effect(
    "declassare un admin e promuovere un operatore nello stesso batch riesce",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const operator = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        const input = [
          { id: admin.id, role: "OPERATORE" as const },
          { id: operator.id, role: "ADMIN" as const },
        ]

        const exit = yield* updateOperatorsRole(input).pipe(
          provideServer,
          Effect.exit
        )

        expect(exit).toEqual(Exit.succeed(input))
        expect(yield* Effect.promise(() => roleOf(admin.userId))).toBe(
          "OPERATORE"
        )
        expect(yield* Effect.promise(() => roleOf(operator.userId))).toBe(
          "ADMIN"
        )
      })
  )

  it.effect(
    "un admin disattivato non conta: l'admin attivo che si declassa riceve LastAdmin",
    () =>
      Effect.gen(function* () {
        const active = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const disabled = yield* Effect.promise(() =>
          createOperator({
            role: "ADMIN",
            disabledAt: new Date(),
          })
        )

        const exit = yield* updateOperatorsRole([
          { id: active.id, role: "OPERATORE" },
        ]).pipe(provideServer, Effect.exit)

        expect(failureTag(exit)).toBe("LastAdmin")
        expect(yield* Effect.promise(() => roleOf(active.userId))).toBe("ADMIN")
        expect(yield* Effect.promise(() => roleOf(disabled.userId))).toBe(
          "ADMIN"
        )
      })
  )

  it.effect(
    "un id che non esiste viene saltato e il resto del batch cambia",
    () =>
      Effect.gen(function* () {
        const a = yield* Effect.promise(() => createOperator({ role: "ADMIN" }))
        const b = yield* Effect.promise(() => createOperator({ role: "ADMIN" }))
        const input = [
          { id: b.id + 100, role: "OPERATORE" as const },
          { id: b.id, role: "OPERATORE" as const },
        ]

        const exit = yield* updateOperatorsRole(input).pipe(
          provideServer,
          Effect.exit
        )

        expect(exit).toEqual(Exit.succeed(input))
        expect(yield* Effect.promise(() => roleOf(a.userId))).toBe("ADMIN")
        expect(yield* Effect.promise(() => roleOf(b.userId))).toBe("OPERATORE")
      })
  )
})

describe("updateOperatorsRole, l'ultimo admin: i casi limite (AC18)", () => {
  it.effect(
    "con lo stesso id due volte vale la prima modifica: l'unico admin che prima si declassa riceve LastAdmin",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )

        const exit = yield* updateOperatorsRole([
          { id: admin.id, role: "OPERATORE" },
          { id: admin.id, role: "ADMIN" },
        ]).pipe(provideServer, Effect.exit)

        expect(failureTag(exit)).toBe("LastAdmin")
        expect(yield* Effect.promise(() => roleOf(admin.userId))).toBe("ADMIN")
      })
  )

  it.effect(
    "con lo stesso id due volte vale la prima modifica: l'unico admin che prima resta ADMIN non riceve LastAdmin",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const input = [
          { id: admin.id, role: "ADMIN" as const },
          { id: admin.id, role: "OPERATORE" as const },
        ]

        const exit = yield* updateOperatorsRole(input).pipe(
          provideServer,
          Effect.exit
        )

        expect(exit).toEqual(Exit.succeed(input))
        expect(yield* Effect.promise(() => roleOf(admin.userId))).toBe("ADMIN")
      })
  )

  it.effect(
    "un utente ADMIN senza operatore non conta: l'ultimo admin vero che si declassa riceve LastAdmin",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const withoutOperator = yield* Effect.promise(() =>
          createUser({ role: "ADMIN" })
        )

        const exit = yield* updateOperatorsRole([
          { id: admin.id, role: "OPERATORE" },
        ]).pipe(provideServer, Effect.exit)

        expect(failureTag(exit)).toBe("LastAdmin")
        expect(yield* Effect.promise(() => roleOf(admin.userId))).toBe("ADMIN")
        expect(yield* Effect.promise(() => roleOf(withoutOperator.id))).toBe(
          "ADMIN"
        )
      })
  )

  it.effect("un batch vuoto riesce e non cambia nulla", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() =>
        createOperator({ role: "ADMIN" })
      )

      expect(
        yield* updateOperatorsRole([]).pipe(provideServer, Effect.exit)
      ).toEqual(Exit.succeed([]))
      expect(yield* Effect.promise(() => roleOf(admin.userId))).toBe("ADMIN")
    })
  )
})

describe("updateOperatorsRole, gli operatori disattivati (AC19)", () => {
  it.effect(
    "un disattivato nel batch riceve OperatorNotFound e l'altro operatore del batch non cambia",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => createOperator({ role: "ADMIN" }))
        const disabled = yield* Effect.promise(() =>
          createOperator({
            role: "OPERATORE",
            disabledAt: new Date(),
          })
        )
        const other = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )

        const exit = yield* updateOperatorsRole([
          { id: other.id, role: "ADMIN" },
          { id: disabled.id, role: "ADMIN" },
        ]).pipe(provideServer, Effect.exit)

        expect(failureTag(exit)).toBe("OperatorNotFound")
        expect(yield* Effect.promise(() => roleOf(other.userId))).toBe(
          "OPERATORE"
        )
        expect(yield* Effect.promise(() => roleOf(disabled.userId))).toBe(
          "OPERATORE"
        )
      })
  )
})

describe("operator.updateOperatorsRole, gli operatori disattivati (AC19)", () => {
  it("un disattivato nel batch risponde BAD_REQUEST con il codice OPERATOR_NOT_FOUND", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const disabled = await createOperator({
      role: "OPERATORE",
      disabledAt: new Date(),
    })

    await expect(
      createTestCaller(admin).operator.updateOperatorsRole([
        { id: disabled.id, role: "ADMIN" },
      ])
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      cause: { code: "OPERATOR_NOT_FOUND" },
    })
    expect(await roleOf(disabled.userId)).toBe("OPERATORE")
  })
})

describe("updateOperatorsRole, il batch è atomico (AC20)", () => {
  it.effect(
    "se il secondo aggiornamento fallisce, il primo utente ha il ruolo di prima",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => createOperator({ role: "ADMIN" }))
        const first = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        const second = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        yield* Effect.promise(() =>
          failNextUpdateOf(users, { id: second.userId })
        )

        const exit = yield* updateOperatorsRole([
          { id: first.id, role: "ADMIN" },
          { id: second.id, role: "ADMIN" },
        ]).pipe(provideServer, Effect.exit)

        expect(failureTag(exit)).toBe("DbError")
        expect(yield* Effect.promise(() => roleOf(first.userId))).toBe(
          "OPERATORE"
        )
        expect(yield* Effect.promise(() => roleOf(second.userId))).toBe(
          "OPERATORE"
        )
      })
  )
})

import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { Exit } from "effect"
import { users } from "@mito/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag, runServer } from "@/test/effect"
import { createOperator } from "@/test/factories"
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
  it("l'unico admin che si declassa riceve LastAdmin e resta ADMIN", async () => {
    const admin = await createOperator({ role: "ADMIN" })

    const exit = await runServer(
      updateOperatorsRole([{ id: admin.id, role: "OPERATORE" }])
    )

    expect(failureTag(exit)).toBe("LastAdmin")
    expect(await roleOf(admin.userId)).toBe("ADMIN")
  })

  it("con due admin, declassarne uno riesce", async () => {
    const a = await createOperator({ role: "ADMIN" })
    const b = await createOperator({ role: "ADMIN" })
    const input = [{ id: b.id, role: "OPERATORE" as const }]

    const exit = await runServer(updateOperatorsRole(input))

    expect(exit).toEqual(Exit.succeed(input))
    expect(await roleOf(a.userId)).toBe("ADMIN")
    expect(await roleOf(b.userId)).toBe("OPERATORE")
  })

  it("declassarli entrambi nello stesso batch riceve LastAdmin e non cambia nulla", async () => {
    const a = await createOperator({ role: "ADMIN" })
    const b = await createOperator({ role: "ADMIN" })

    const exit = await runServer(
      updateOperatorsRole([
        { id: a.id, role: "OPERATORE" },
        { id: b.id, role: "OPERATORE" },
      ])
    )

    expect(failureTag(exit)).toBe("LastAdmin")
    expect(await roleOf(a.userId)).toBe("ADMIN")
    expect(await roleOf(b.userId)).toBe("ADMIN")
  })

  it("declassare un admin e promuovere un operatore nello stesso batch riesce", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const operator = await createOperator({ role: "OPERATORE" })
    const input = [
      { id: admin.id, role: "OPERATORE" as const },
      { id: operator.id, role: "ADMIN" as const },
    ]

    const exit = await runServer(updateOperatorsRole(input))

    expect(exit).toEqual(Exit.succeed(input))
    expect(await roleOf(admin.userId)).toBe("OPERATORE")
    expect(await roleOf(operator.userId)).toBe("ADMIN")
  })

  it("un admin disattivato non conta: l'admin attivo che si declassa riceve LastAdmin", async () => {
    const active = await createOperator({ role: "ADMIN" })
    const disabled = await createOperator({
      role: "ADMIN",
      disabledAt: new Date(),
    })

    const exit = await runServer(
      updateOperatorsRole([{ id: active.id, role: "OPERATORE" }])
    )

    expect(failureTag(exit)).toBe("LastAdmin")
    expect(await roleOf(active.userId)).toBe("ADMIN")
    expect(await roleOf(disabled.userId)).toBe("ADMIN")
  })

  it("un id che non esiste viene saltato e il resto del batch cambia", async () => {
    const a = await createOperator({ role: "ADMIN" })
    const b = await createOperator({ role: "ADMIN" })
    const input = [
      { id: b.id + 100, role: "OPERATORE" as const },
      { id: b.id, role: "OPERATORE" as const },
    ]

    const exit = await runServer(updateOperatorsRole(input))

    expect(exit).toEqual(Exit.succeed(input))
    expect(await roleOf(a.userId)).toBe("ADMIN")
    expect(await roleOf(b.userId)).toBe("OPERATORE")
  })
})

describe("updateOperatorsRole, gli operatori disattivati (AC19)", () => {
  it("un disattivato nel batch riceve OperatorNotFound e l'altro operatore del batch non cambia", async () => {
    await createOperator({ role: "ADMIN" })
    const disabled = await createOperator({
      role: "OPERATORE",
      disabledAt: new Date(),
    })
    const other = await createOperator({ role: "OPERATORE" })

    const exit = await runServer(
      updateOperatorsRole([
        { id: other.id, role: "ADMIN" },
        { id: disabled.id, role: "ADMIN" },
      ])
    )

    expect(failureTag(exit)).toBe("OperatorNotFound")
    expect(await roleOf(other.userId)).toBe("OPERATORE")
    expect(await roleOf(disabled.userId)).toBe("OPERATORE")
  })
})

describe("updateOperatorsRole, il batch è atomico (AC20)", () => {
  it("se il secondo aggiornamento fallisce, il primo utente ha il ruolo di prima", async () => {
    await createOperator({ role: "ADMIN" })
    const first = await createOperator({ role: "OPERATORE" })
    const second = await createOperator({ role: "OPERATORE" })
    await failNextUpdateOf(users, { id: second.userId })

    const exit = await runServer(
      updateOperatorsRole([
        { id: first.id, role: "ADMIN" },
        { id: second.id, role: "ADMIN" },
      ])
    )

    expect(failureTag(exit)).toBe("DbError")
    expect(await roleOf(first.userId)).toBe("OPERATORE")
    expect(await roleOf(second.userId)).toBe("OPERATORE")
  })
})

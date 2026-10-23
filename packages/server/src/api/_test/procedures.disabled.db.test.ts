import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb } from "@/test/db"
import { createOperator } from "@/test/factories"

// A deactivated operator whose session was already read (createTestCaller
// passes it to the caller as is): resolveActor still turns them away
// (gestione-operatori, AC16)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("operatorProcedure con un operatore disattivato", () => {
  it("risponde UNAUTHORIZED", async () => {
    const operator = await createOperator({ disabledAt: new Date() })
    const caller = createTestCaller(operator)

    await expect(caller.operator.getUserOperator()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })

  it("lascia passare un operatore attivo", async () => {
    const operator = await createOperator()
    const caller = createTestCaller(operator)

    await expect(caller.operator.getUserOperator()).resolves.toMatchObject({
      id: operator.id,
    })
  })
})

describe("adminProcedure con un admin disattivato", () => {
  it("risponde UNAUTHORIZED, non FORBIDDEN", async () => {
    const admin = await createOperator({
      role: "ADMIN",
      disabledAt: new Date(),
    })
    const caller = createTestCaller(admin)

    await expect(caller.operator.updateOperatorsRole([])).rejects.toMatchObject(
      { code: "UNAUTHORIZED" }
    )
  })
})

describe("protectedProcedure con un utente disattivato", () => {
  it("controlla solo che ci sia una sessione (AC25)", async () => {
    const operator = await createOperator({ disabledAt: new Date() })
    const caller = createTestCaller(operator)

    await expect(
      caller.operator.getUserPublicOperator()
    ).resolves.toMatchObject({ id: operator.id })
  })
})

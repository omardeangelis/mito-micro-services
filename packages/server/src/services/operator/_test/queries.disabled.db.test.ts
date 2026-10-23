import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb } from "@/test/db"
import { createOperator } from "@/test/factories"

// The operator lists leave the deactivated out; the history still finds them
// by id (gestione-operatori, AC14)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("operatori disattivati", () => {
  it("operator.getAllUniqueOperators non li elenca", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const active = await createOperator()
    await createOperator({ disabledAt: new Date() })

    const listed =
      await createTestCaller(admin).operator.getAllUniqueOperators()

    expect(listed.map(({ id }) => id).sort((a, b) => a - b)).toEqual(
      [admin.id, active.id].sort((a, b) => a - b)
    )
  })

  it("operator.getOperatorById li restituisce ancora, per lo storico", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const disabled = await createOperator({ disabledAt: new Date() })

    const found = await createTestCaller(admin).operator.getOperatorById({
      id: disabled.id,
    })

    expect(found).toMatchObject({ id: disabled.id, userId: disabled.userId })
  })
})

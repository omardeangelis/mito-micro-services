import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Exit } from "effect"
import { migrateUpTo, resetDb } from "@/test/db"
import { runServer } from "@/test/effect"
import { createOperator, createSystemOperator } from "@/test/factories"
import { listActiveOperators } from "../queries"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("listActiveOperators", () => {
  it("lists the operators with a user, with their role, and not the system operator", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const operator = await createOperator({ role: "OPERATORE" })
    await createSystemOperator()

    const exit = await runServer(listActiveOperators())

    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(
      exit.value.map(({ id, role }) => ({ id, role })).sort((a, b) => a.id - b.id)
    ).toEqual([
      { id: admin.id, role: "ADMIN" },
      { id: operator.id, role: "OPERATORE" },
    ])
  })
})

import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { Exit } from "effect"
import { operators } from "@mito/db/schema/operators"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag, runServer } from "@/test/effect"
import { createOperator } from "@/test/factories"
import { updateOperatorInfo } from "../profile"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("updateOperatorInfo", () => {
  it("writes the name and surname of the operator and returns the row after the update (TD3 b)", async () => {
    const operator = await createOperator({ name: "Mario", surname: "Rossi" })
    const other = await createOperator({ name: "Anna", surname: "Bianchi" })

    const exit = await runServer(
      updateOperatorInfo(operator.id, { name: "Luigi", surname: "Verdi" })
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value).toMatchObject({
      id: operator.id,
      name: "Luigi",
      surname: "Verdi",
    })
    const rows = await testDb
      .select({
        id: operators.id,
        name: operators.name,
        surname: operators.surname,
      })
      .from(operators)
      .where(eq(operators.id, operator.id))
    expect(rows).toEqual([{ id: operator.id, name: "Luigi", surname: "Verdi" }])
    const [untouched] = await testDb
      .select({ name: operators.name, surname: operators.surname })
      .from(operators)
      .where(eq(operators.id, other.id))
    expect(untouched).toEqual({ name: "Anna", surname: "Bianchi" })
  })

  it("fails with OperatorNotFound for an id with no operator, and writes nothing (TD3 b)", async () => {
    const other = await createOperator({ name: "Anna", surname: "Bianchi" })

    const exit = await runServer(
      updateOperatorInfo(other.id + 1, { name: "Luigi", surname: "Verdi" })
    )

    expect(failureTag(exit)).toBe("OperatorNotFound")
    const [untouched] = await testDb
      .select({ name: operators.name, surname: operators.surname })
      .from(operators)
      .where(eq(operators.id, other.id))
    expect(untouched).toEqual({ name: "Anna", surname: "Bianchi" })
  })
})

import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { Exit } from "effect"
import { users } from "@mito/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { runServer } from "@/test/effect"
import { createOperator } from "@/test/factories"
import { updateOperatorsRole } from "../roles"

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

describe("updateOperatorsRole", () => {
  it("changes the roles and returns the input as it is", async () => {
    const promoted = await createOperator({ role: "OPERATORE" })
    const demoted = await createOperator({ role: "ADMIN" })
    const input = [
      { id: promoted.id, role: "ADMIN" as const },
      { id: demoted.id, role: "OPERATORE" as const },
    ]

    const exit = await runServer(updateOperatorsRole(input))

    expect(exit).toEqual(Exit.succeed(input))
    expect(await roleOf(promoted.userId)).toBe("ADMIN")
    expect(await roleOf(demoted.userId)).toBe("OPERATORE")
  })

  it("skips an id that doesn't exist and still changes the others", async () => {
    // Another admin stays: demoting the only one is LastAdmin (AC18)
    await createOperator({ role: "ADMIN" })
    const operator = await createOperator({ role: "ADMIN" })
    const input = [
      { id: operator.id + 1, role: "OPERATORE" as const },
      { id: operator.id, role: "OPERATORE" as const },
    ]

    const exit = await runServer(updateOperatorsRole(input))

    expect(exit).toEqual(Exit.succeed(input))
    expect(await roleOf(operator.userId)).toBe("OPERATORE")
  })
})

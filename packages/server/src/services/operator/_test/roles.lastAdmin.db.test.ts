import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { users } from "@mito/db/schema/users"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"

// Deve restare almeno un admin (gestione-operatori, AC18)

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

describe("operator.updateOperatorsRole, l'ultimo admin", () => {
  it("l'unico admin che si declassa riceve LastAdmin e resta ADMIN", async () => {
    const admin = await createOperator({ role: "ADMIN" })

    await expect(
      createTestCaller(admin).operator.updateOperatorsRole([
        { id: admin.id, role: "OPERATORE" },
      ])
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Deve restare almeno un admin",
      cause: { code: "LAST_ADMIN" },
    })
    expect(await roleOf(admin.userId)).toBe("ADMIN")
  })
})

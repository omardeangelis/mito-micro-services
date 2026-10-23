import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { users } from "@mito/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("createOperator", () => {
  it("con disabledAt scrive un utente disattivato", async () => {
    const disabledAt = new Date("2026-10-20T10:00:00Z")

    const operator = await createOperator({ disabledAt })

    const [user] = await testDb
      .select({ disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, operator.userId))
    expect(user?.disabledAt).toEqual(disabledAt)
  })

  it("senza disabledAt scrive un utente attivo", async () => {
    const operator = await createOperator()

    const [user] = await testDb
      .select({ disabledAt: users.disabledAt, disabledBy: users.disabledBy })
      .from(users)
      .where(eq(users.id, operator.userId))
    expect(user).toEqual({ disabledAt: null, disabledBy: null })
  })
})

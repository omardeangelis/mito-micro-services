import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Exit } from "effect"
import { eq } from "drizzle-orm"
import { users } from "@mito/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { runServer } from "@/test/effect"
import { createOperator, createUser } from "@/test/factories"
import { getCurrentUser } from "../current"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("getCurrentUser", () => {
  it("of a user without an operator returns empty preferences, role and operatorId undefined", async () => {
    const user = await createUser({ role: "ADMIN" })

    const exit = await runServer(getCurrentUser(user.id))

    expect(exit).toEqual(
      Exit.succeed({ preferences: {}, role: undefined, operatorId: undefined })
    )
  })

  it("of a user with an operator returns the parsed preferences, role and operatorId", async () => {
    const operator = await createOperator({ role: "OPERATORE" })
    const preferences = {
      dashboardCollapsed: true,
      contactTableVisibleColumns: ["phoneNumber"],
    }
    await testDb
      .update(users)
      .set({ preferences: JSON.stringify(preferences) })
      .where(eq(users.id, operator.userId))

    const exit = await runServer(getCurrentUser(operator.userId))

    expect(exit).toEqual(
      Exit.succeed({
        preferences,
        role: "OPERATORE",
        operatorId: operator.id,
      })
    )
  })
})

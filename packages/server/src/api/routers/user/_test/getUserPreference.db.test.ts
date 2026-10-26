import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { users } from "@mito/db/schema/users"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator, createUser } from "@/test/factories"

// Characterization of user.getUserPreference before its refactor (gestione-operatori, PR 1)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("user.getUserPreference", () => {
  it("returns the parsed preferences with the role and the operator id of the signed-in user (AC26)", async () => {
    const operator = await createOperator({ role: "ADMIN" })
    const preferences = {
      dashboardCollapsed: true,
      contactTableVisibleColumns: ["phoneNumber"],
    }
    await testDb
      .update(users)
      .set({ preferences: JSON.stringify(preferences) })
      .where(eq(users.id, operator.userId))
    const caller = createTestCaller(operator)

    const result = await caller.user.getUserPreference()

    expect(result).toEqual({
      preferences,
      role: "ADMIN",
      operatorId: operator.id,
    })
  })

  it("returns an empty object of preferences when the user has none stored", async () => {
    const operator = await createOperator({ role: "OPERATORE" })
    await testDb
      .update(users)
      .set({ preferences: null })
      .where(eq(users.id, operator.userId))
    const caller = createTestCaller(operator)

    const result = await caller.user.getUserPreference()

    expect(result.preferences).toEqual({})
    expect(result.role).toBe("OPERATORE")
    expect(result.operatorId).toBe(operator.id)
  })

  it("answers BAD_REQUEST, as every operator procedure, to a user without an operator row", async () => {
    const user = await createUser({ role: "ADMIN" })
    const caller = createTestCaller({ id: user.id })

    await expect(caller.user.getUserPreference()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "BAD_REQUEST",
    })
  })

  it("answers UNAUTHORIZED with Utente disattivato, as every operator procedure, to a deactivated operator", async () => {
    const operator = await createOperator({
      role: "ADMIN",
      disabledAt: new Date(),
    })
    const caller = createTestCaller(operator)

    await expect(caller.user.getUserPreference()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Utente disattivato",
    })
  })
})

import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { users } from "@mito/db/schema/users"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"

/** The preferences of the user as the database stores them, key by key. */
const storedPreferences = async (
  userId: string
): Promise<Record<string, unknown>> => {
  const [row] = await testDb
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
  return JSON.parse(row?.preferences ?? "{}") as Record<string, unknown>
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("user.updateContactTableVisibleColumns", () => {
  it("saves the columns of Contatti and leaves those of Clienti as they were (AC5)", async () => {
    const operator = await createOperator()
    const caller = createTestCaller(operator)
    await caller.user.updateCustomerTableVisibleColumns({
      preferences: { customerTableVisibleColumns: ["email"] },
    })

    await caller.user.updateContactTableVisibleColumns({
      preferences: { contactTableVisibleColumns: ["phoneNumber"] },
    })

    const { preferences } = await caller.user.getUserPreference()
    expect(preferences.contactTableVisibleColumns).toEqual(["phoneNumber"])
    expect(preferences.customerTableVisibleColumns).toEqual(["email"])
  })

  it("keeps the columns of Contatti when those of Clienti are saved afterwards (AC5)", async () => {
    const operator = await createOperator()
    const caller = createTestCaller(operator)
    await caller.user.updateContactTableVisibleColumns({
      preferences: { contactTableVisibleColumns: ["phoneNumber"] },
    })

    await caller.user.updateCustomerTableVisibleColumns({
      preferences: { customerTableVisibleColumns: ["email"] },
    })

    const { preferences } = await caller.user.getUserPreference()
    expect(preferences.contactTableVisibleColumns).toEqual(["phoneNumber"])
    expect(preferences.customerTableVisibleColumns).toEqual(["email"])
  })

  it("leaves the other keys of the preferences as they were, the ones the code doesn't know included", async () => {
    const operator = await createOperator()
    const caller = createTestCaller(operator)
    await caller.user.updateDashboardCollapsed({
      preferences: { dashboardCollapsed: true },
    })
    await caller.user.updatePracticesTableVisibleColumns({
      preferences: { practicesTableVisibleColumns: ["status"] },
    })
    // A key an older or newer version of the app saved
    await testDb
      .update(users)
      .set({
        preferences: JSON.stringify({
          ...(await storedPreferences(operator.userId)),
          legacyKey: 42,
        }),
      })
      .where(eq(users.id, operator.userId))

    await caller.user.updateContactTableVisibleColumns({
      preferences: { contactTableVisibleColumns: ["phoneNumber"] },
    })

    const { preferences } = await caller.user.getUserPreference()
    expect(preferences.dashboardCollapsed).toBe(true)
    expect(preferences.practicesTableVisibleColumns).toEqual(["status"])
    expect(preferences.contactTableVisibleColumns).toEqual(["phoneNumber"])
    expect(await storedPreferences(operator.userId)).toMatchObject({
      legacyKey: 42,
    })
  })

  it("saves the choice for the signed-in user only (AC5)", async () => {
    const first = createTestCaller(await createOperator())
    const second = createTestCaller(await createOperator())

    await first.user.updateContactTableVisibleColumns({
      preferences: { contactTableVisibleColumns: ["phoneNumber"] },
    })

    const { preferences } = await second.user.getUserPreference()
    expect(preferences.contactTableVisibleColumns).toBeUndefined()
    const { preferences: ownPreferences } = await first.user.getUserPreference()
    expect(ownPreferences.contactTableVisibleColumns).toEqual(["phoneNumber"])
  })

  it("keeps an empty list as an empty list (everything visible)", async () => {
    const caller = createTestCaller(await createOperator())
    await caller.user.updateContactTableVisibleColumns({
      preferences: { contactTableVisibleColumns: ["phoneNumber"] },
    })

    await caller.user.updateContactTableVisibleColumns({
      preferences: { contactTableVisibleColumns: [] },
    })

    const { preferences } = await caller.user.getUserPreference()
    expect(preferences.contactTableVisibleColumns).toEqual([])
  })

  it("drops the key when saved without it, like the other table preferences", async () => {
    const caller = createTestCaller(await createOperator())
    await caller.user.updateDashboardCollapsed({
      preferences: { dashboardCollapsed: true },
    })
    await caller.user.updateContactTableVisibleColumns({
      preferences: { contactTableVisibleColumns: ["phoneNumber"] },
    })

    await caller.user.updateContactTableVisibleColumns({ preferences: {} })

    const { preferences } = await caller.user.getUserPreference()
    expect(preferences).not.toHaveProperty("contactTableVisibleColumns")
    expect(preferences.dashboardCollapsed).toBe(true)
  })

  describe("limits of the list", () => {
    it.each([
      [
        "more than 20 columns",
        Array.from({ length: 21 }, (_, i) => `column${i}`),
      ],
      ["a column name over 64 characters", ["a".repeat(65)]],
    ])(
      "rejects %s with BAD_REQUEST and keeps what was saved",
      async (_label, columns) => {
        const caller = createTestCaller(await createOperator())
        await caller.user.updateContactTableVisibleColumns({
          preferences: { contactTableVisibleColumns: ["phoneNumber"] },
        })

        await expect(
          caller.user.updateContactTableVisibleColumns({
            preferences: { contactTableVisibleColumns: columns },
          })
        ).rejects.toMatchObject({ code: "BAD_REQUEST" })

        const { preferences } = await caller.user.getUserPreference()
        expect(preferences.contactTableVisibleColumns).toEqual(["phoneNumber"])
      }
    )

    it("accepts 20 columns of 64 characters", async () => {
      const caller = createTestCaller(await createOperator())
      const columns = Array.from({ length: 20 }, (_, i) =>
        `${i}`.padEnd(64, "x")
      )

      await caller.user.updateContactTableVisibleColumns({
        preferences: { contactTableVisibleColumns: columns },
      })

      const { preferences } = await caller.user.getUserPreference()
      expect(preferences.contactTableVisibleColumns).toEqual(columns)
    })
  })
})

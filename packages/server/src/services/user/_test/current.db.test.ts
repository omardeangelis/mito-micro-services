import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Exit } from "effect"
import { migrateUpTo, resetDb } from "@/test/db"
import { runServer } from "@/test/effect"
import { createUser } from "@/test/factories"
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
})

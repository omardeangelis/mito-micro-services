import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Exit } from "effect"
import { migrateUpTo, resetDb } from "@/test/db"
import { failureTag, runServer } from "@/test/effect"
import { createOperator, createUser } from "@/test/factories"
import { resolveActor } from "../actor"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("resolveActor", () => {
  it("fails with NotAnOperator for a user without an operator row", async () => {
    const user = await createUser()

    const exit = await runServer(resolveActor(user.id))

    expect(failureTag(exit)).toBe("NotAnOperator")
  })

  it("returns the user's operator, with the role, and its actor", async () => {
    const operator = await createOperator({ role: "ADMIN" })

    const exit = await runServer(resolveActor(operator.userId))

    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.operator).toMatchObject({
      id: operator.id,
      userId: operator.userId,
      role: "ADMIN",
    })
    expect(exit.value.actor).toEqual({ operatorId: operator.id, role: "ADMIN" })
  })
})

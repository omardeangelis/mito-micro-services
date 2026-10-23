import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Exit } from "effect"
import { migrateUpTo, resetDb } from "@/test/db"
import { runServer } from "@/test/effect"
import { createOperator, createUser } from "@/test/factories"
import { isUserDisabled } from "../disabled"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const disabled = async (input: Parameters<typeof isUserDisabled>[0]) => {
  const exit = await runServer(isUserDisabled(input))
  if (!Exit.isSuccess(exit)) throw new Error("isUserDisabled failed")
  return exit.value
}

describe("isUserDisabled", () => {
  it("is true for a deactivated user found by id", async () => {
    const operator = await createOperator({ disabledAt: new Date() })

    expect(await disabled({ id: operator.userId })).toBe(true)
  })

  it("is false for an active user found by id", async () => {
    const operator = await createOperator()

    expect(await disabled({ id: operator.userId })).toBe(false)
  })

  it("finds a deactivated user by email in another letter case", async () => {
    const user = await createUser({ disabledAt: new Date() })

    expect(
      await disabled({ id: "provider-id", email: user.email.toUpperCase() })
    ).toBe(true)
  })

  it("lets the user with the id decide over another with the email", async () => {
    const active = await createUser()
    const other = await createUser({ disabledAt: new Date() })

    expect(await disabled({ id: active.id, email: other.email })).toBe(false)
  })

  it("is false for no user, and without id or email", async () => {
    await createUser({ disabledAt: new Date() })

    expect(await disabled({ id: "nobody", email: "nobody@x.it" })).toBe(false)
    expect(await disabled({ email: "%@test.local" })).toBe(false)
    expect(await disabled({})).toBe(false)
    expect(await disabled({ email: null })).toBe(false)
  })
})

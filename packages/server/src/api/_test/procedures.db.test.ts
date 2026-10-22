import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@mito/db"
import { appRouter } from "@mito/server/api/root"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb } from "@/test/db"
import { createOperator, createUser } from "@/test/factories"

// Characterization of the procedure middlewares of api/trpc.ts before their
// move to Effect (gestione-operatori, PR 1): codes and messages stay the same

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("adminProcedure", () => {
  it("answers FORBIDDEN with the message admin-only to an OPERATORE", async () => {
    const operator = await createOperator({ role: "OPERATORE" })
    const caller = createTestCaller(operator)

    await expect(
      caller.operator.updateOperatorsRole([{ id: operator.id, role: "ADMIN" }])
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "admin-only" })
  })

  it("lets an ADMIN operator through", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const caller = createTestCaller(admin)

    await expect(caller.operator.updateOperatorsRole([])).resolves.toBeDefined()
  })
})

describe("protectedProcedure", () => {
  it("answers UNAUTHORIZED to a caller with no session", async () => {
    // createTestCaller always signs in, so the caller is built here with none
    const anonymous = appRouter.createCaller({
      db,
      supabaseClient: {} as never,
      session: null,
      headers: new Headers(),
    })

    await expect(anonymous.user.getUserPreference()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })
})

describe("operatorProcedure", () => {
  it("answers BAD_REQUEST to a signed-in user with no operator row", async () => {
    const user = await createUser()
    const caller = createTestCaller({ id: user.id })

    await expect(caller.operator.getUserOperator()).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })

  it("answers with the default message of BAD_REQUEST, none of its own", async () => {
    const user = await createUser()
    const caller = createTestCaller({ id: user.id })

    await expect(caller.operator.getUserOperator()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "BAD_REQUEST",
    })
  })

  it("checks the operator before the role: an ADMIN user without operator gets BAD_REQUEST on an adminProcedure", async () => {
    const user = await createUser({ role: "ADMIN" })
    const caller = createTestCaller({ id: user.id })

    await expect(caller.operator.updateOperatorsRole([])).rejects.toMatchObject(
      { code: "BAD_REQUEST" }
    )
  })
})

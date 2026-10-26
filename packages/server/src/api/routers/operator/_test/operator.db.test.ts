import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { createTestCaller, rejectionOf } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import {
  createOperator,
  createSystemOperator,
  createUser,
} from "@/test/factories"

// Characterization of the operator router as it is before its move to Effect
// (gestione-operatori, PR 1): the refactor keeps every assertion here as it is

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("operator.updateOperatorInfo", () => {
  it("returns the operator with the new name and surname, and its role (TD3 b)", async () => {
    const operator = await createOperator({
      role: "ADMIN",
      name: "Mario",
      surname: "Rossi",
    })
    const caller = createTestCaller(operator)

    const returned = await caller.operator.updateOperatorInfo({
      name: "Luigi",
      surname: "Verdi",
    })

    expect(returned).toEqual({
      ...operator,
      name: "Luigi",
      surname: "Verdi",
      updatedAt: expect.any(Date) as Date,
    })
  })

  it("writes the new name and surname to the database", async () => {
    const operator = await createOperator({ name: "Mario", surname: "Rossi" })
    const caller = createTestCaller(operator)

    await caller.operator.updateOperatorInfo({
      name: "Luigi",
      surname: "Verdi",
    })

    const [row] = await testDb
      .select({ name: operators.name, surname: operators.surname })
      .from(operators)
      .where(eq(operators.id, operator.id))
    expect(row).toEqual({ name: "Luigi", surname: "Verdi" })
  })
})

describe("operator.getAllUniqueOperators", () => {
  it("returns each operator with a user and its role, without the system operator", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const operator = await createOperator({ role: "OPERATORE" })
    await createSystemOperator()
    const caller = createTestCaller(admin)

    const rows = await caller.operator.getAllUniqueOperators()

    expect(
      rows.map(({ id, role }) => ({ id, role })).sort((a, b) => a.id - b.id)
    ).toEqual([
      { id: admin.id, role: "ADMIN" },
      { id: operator.id, role: "OPERATORE" },
    ])
  })
})

describe("operator.getOperatorById", () => {
  it("returns the operator with the given id and its role", async () => {
    const operator = await createOperator({
      role: "ADMIN",
      name: "Mario",
      surname: "Rossi",
    })
    const caller = createTestCaller(operator)

    const found = await caller.operator.getOperatorById({ id: operator.id })

    expect(found).toEqual(operator)
  })

  it("returns undefined for an id that doesn't exist", async () => {
    const operator = await createOperator()
    const caller = createTestCaller(operator)

    const found = await caller.operator.getOperatorById({
      id: operator.id + 1,
    })

    expect(found).toBeUndefined()
  })

  it("rejects a call without an id with BAD_REQUEST, even with a single operator in the database (TD3 a)", async () => {
    const operator = await createOperator({ role: "ADMIN" })

    const error = await rejectionOf(
      createTestCaller(operator).operator.getOperatorById(
        // @ts-expect-error -- `id` is required: the request of an old client
        {}
      )
    )

    expect(error).toMatchObject({ code: "BAD_REQUEST" })
  })

  it.each([0, -1, 1.5])(
    "rejects id %s with BAD_REQUEST, even with a single operator in the database (TD3 a)",
    async (id) => {
      const operator = await createOperator({ role: "ADMIN" })

      const error = await rejectionOf(
        createTestCaller(operator).operator.getOperatorById({ id })
      )

      expect(error).toMatchObject({ code: "BAD_REQUEST" })
    }
  )
})

describe("operator.getUserOperator", () => {
  it("returns the operator of the signed-in user, with its role", async () => {
    const operator = await createOperator({
      role: "ADMIN",
      name: "Mario",
      surname: "Rossi",
    })
    const caller = createTestCaller(operator)

    expect(await caller.operator.getUserOperator()).toEqual(operator)
  })
})

describe("operator.getUserPublicOperator", () => {
  it("returns only id, name and surname of the signed-in user's operator", async () => {
    const operator = await createOperator({
      role: "ADMIN",
      name: "Mario",
      surname: "Rossi",
    })
    const caller = createTestCaller(operator)

    const publicOperator = await caller.operator.getUserPublicOperator()

    expect(publicOperator).toEqual({
      id: operator.id,
      name: "Mario",
      surname: "Rossi",
    })
  })

  it("returns undefined for a user without an operator", async () => {
    const user = await createUser()
    const caller = createTestCaller({ id: user.id })

    expect(await caller.operator.getUserPublicOperator()).toBeUndefined()
  })
})

describe("operator.updateOperatorsRole", () => {
  it("changes the role of the listed operators and returns the input as it is", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const promoted = await createOperator({ role: "OPERATORE" })
    const demoted = await createOperator({ role: "ADMIN" })
    const caller = createTestCaller(admin)
    const input = [
      { id: promoted.id, role: "ADMIN" as const },
      { id: demoted.id, role: "OPERATORE" as const },
    ]

    const returned = await caller.operator.updateOperatorsRole(input)

    expect(returned).toEqual(input)
    const roleOf = async (userId: string) => {
      const [row] = await testDb
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
      return row?.role
    }
    expect(await roleOf(promoted.userId)).toBe("ADMIN")
    expect(await roleOf(demoted.userId)).toBe("OPERATORE")
  })

  it("skips an id that doesn't exist and still changes the others", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const operator = await createOperator({ role: "ADMIN" })
    const caller = createTestCaller(admin)
    const missingId = operator.id + 1

    await expect(
      caller.operator.updateOperatorsRole([
        { id: missingId, role: "OPERATORE" },
        { id: operator.id, role: "OPERATORE" },
      ])
    ).resolves.toBeDefined()

    const [row] = await testDb
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, operator.userId))
    expect(row?.role).toBe("OPERATORE")
  })

  it("rejects a caller who is not an admin with FORBIDDEN and changes nothing", async () => {
    const caller = createTestCaller(await createOperator({ role: "OPERATORE" }))
    const target = await createOperator({ role: "OPERATORE" })

    await expect(
      caller.operator.updateOperatorsRole([{ id: target.id, role: "ADMIN" }])
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "admin-only" })

    const [row] = await testDb
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, target.userId))
    expect(row?.role).toBe("OPERATORE")
  })
})

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"
import { type Session } from "next-auth"
import { getServerAuthSession } from "@mito/server/auth"
import { customers } from "@mito/db/schema/customers"
import { users } from "@mito/db/schema/users"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createOperator } from "@/test/factories"
import { deactivateOperatorAction } from "../deactivateOperator"
import { updateOperatorsRoleAction } from "../updateOperatorsRole"

// The server actions run the procedures as whoever calls them: only an admin
// deactivates or changes roles (AC2, AC18)

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

/** Signs in the user of an operator. */
function signIn(operator: { userId: string }) {
  vi.mocked(getServerAuthSession).mockResolvedValue({
    user: { id: operator.userId },
    expires: "2099-01-01T00:00:00.000Z",
  } as Session)
}

const userOf = async (operator: { userId: string }) => {
  const [user] = await testDb
    .select()
    .from(users)
    .where(eq(users.id, operator.userId))
  return user!
}

const ownerOf = async (customerId: string) => {
  const [customer] = await testDb
    .select({ operatorId: customers.operatorId })
    .from(customers)
    .where(eq(customers.id, customerId))
  return customer!.operatorId
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("deactivateOperatorAction con la sessione di chi chiama", () => {
  it("un OPERATORE è rifiutato e il database non cambia", async () => {
    const caller = await createOperator({ role: "OPERATORE" })
    const leaving = await createOperator({ role: "OPERATORE" })
    const destination = await createOperator({ role: "OPERATORE" })
    const customer = await createCustomer({ operatorId: leaving.id })
    signIn(caller)

    const res = await deactivateOperatorAction({
      operatorId: leaving.id,
      toOperatorId: destination.id,
    })

    expect(res).toEqual({ error: "UNKNOWN" })
    expect((await userOf(leaving)).disabledAt).toBeNull()
    expect(await ownerOf(customer.id)).toBe(leaving.id)
  })

  it("un ADMIN disattiva l'operatore e ne sposta i clienti", async () => {
    const caller = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator({ role: "OPERATORE" })
    const destination = await createOperator({ role: "OPERATORE" })
    const customer = await createCustomer({ operatorId: leaving.id })
    signIn(caller)

    const res = await deactivateOperatorAction({
      operatorId: leaving.id,
      toOperatorId: destination.id,
    })

    expect(res).toEqual({
      result: { customersMoved: 1, contactsMoved: 0, practicesMoved: 0 },
    })
    expect((await userOf(leaving)).disabledAt).not.toBeNull()
    expect(await ownerOf(customer.id)).toBe(destination.id)
  })
})

describe("updateOperatorsRoleAction con la sessione di chi chiama", () => {
  it("un OPERATORE è rifiutato e il ruolo non cambia", async () => {
    const caller = await createOperator({ role: "OPERATORE" })
    const other = await createOperator({ role: "OPERATORE" })
    signIn(caller)

    const res = await updateOperatorsRoleAction([
      { id: other.id, role: "ADMIN" },
    ])

    expect(res).toEqual({ error: "UNKNOWN" })
    expect((await userOf(other)).role).toBe("OPERATORE")
  })

  it("un ADMIN cambia il ruolo", async () => {
    const caller = await createOperator({ role: "ADMIN" })
    const other = await createOperator({ role: "OPERATORE" })
    signIn(caller)

    const res = await updateOperatorsRoleAction([
      { id: other.id, role: "ADMIN" },
    ])

    expect(res).toEqual({})
    expect((await userOf(other)).role).toBe("ADMIN")
  })
})

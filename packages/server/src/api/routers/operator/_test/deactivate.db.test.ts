import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { users } from "@mito/db/schema/users"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import {
  createCustomer,
  createOperator,
  createPractice,
  createSystemOperator,
  createTask,
} from "@/test/factories"

// Le procedure della disattivazione (gestione-operatori, AC1–AC6, AC13, AC21)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("operator.deactivate", () => {
  it("su un ADMIN risponde BAD_REQUEST con il codice OPERATOR_IS_ADMIN", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const otherAdmin = await createOperator({ role: "ADMIN" })
    const target = await createOperator()

    await expect(
      createTestCaller(admin).operator.deactivate({
        operatorId: otherAdmin.id,
        toOperatorId: target.id,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Declassa l'admin a operatore prima di disattivarlo",
      cause: { code: "OPERATOR_IS_ADMIN" },
    })
  })
})

const operatorOfCustomer = async (customerId: string) => {
  const [row] = await testDb
    .select({ operatorId: customers.operatorId })
    .from(customers)
    .where(eq(customers.id, customerId))
  return row?.operatorId
}

const isDisabled = async (userId: string) => {
  const [row] = await testDb
    .select({ disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, userId))
  return row?.disabledAt !== null
}

describe("operator.deactivate: il contratto", () => {
  it("un admin disattiva se stesso con CANNOT_DEACTIVATE_SELF", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const target = await createOperator()

    await expect(
      createTestCaller(admin).operator.deactivate({
        operatorId: admin.id,
        toOperatorId: target.id,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Non puoi disattivare te stesso",
      cause: { code: "CANNOT_DEACTIVATE_SELF" },
    })
    expect(await isDisabled(admin.userId)).toBe(false)
  })

  it("un operatore inesistente risponde OPERATOR_NOT_FOUND", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const target = await createOperator()

    await expect(
      createTestCaller(admin).operator.deactivate({
        operatorId: 999_999,
        toOperatorId: target.id,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Operatore non trovato",
      cause: { code: "OPERATOR_NOT_FOUND" },
    })
  })

  it("un id oltre gli interi di Postgres è BAD_REQUEST di validazione, non un errore del database", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const target = await createOperator()
    const caller = createTestCaller(admin)

    await expect(
      caller.operator.deactivate({
        operatorId: 2_147_483_648,
        toOperatorId: target.id,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      caller.operator.getDeactivationImpact({ operatorId: 2_147_483_648 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      caller.operator.getOperatorsForDeactivation({ operatorId: 2_147_483_648 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("un operatore gia' disattivato risponde OPERATOR_NOT_FOUND", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const gone = await createOperator({ disabledAt: new Date() })
    const target = await createOperator()

    await expect(
      createTestCaller(admin).operator.deactivate({
        operatorId: gone.id,
        toOperatorId: target.id,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      cause: { code: "OPERATOR_NOT_FOUND" },
    })
  })

  it("una destinazione disattivata risponde OPERATOR_NOT_FOUND e non sposta nulla", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator()
    const disabledTarget = await createOperator({ disabledAt: new Date() })
    const customer = await createCustomer({ operatorId: leaving.id })

    await expect(
      createTestCaller(admin).operator.deactivate({
        operatorId: leaving.id,
        toOperatorId: disabledTarget.id,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Operatore non trovato",
      cause: { code: "OPERATOR_NOT_FOUND" },
    })
    expect(await operatorOfCustomer(customer.id)).toBe(leaving.id)
    expect(await isDisabled(leaving.userId)).toBe(false)
  })

  it("la destinazione uguale all'operatore risponde HANDOVER_SAME_OPERATOR", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator()

    await expect(
      createTestCaller(admin).operator.deactivate({
        operatorId: leaving.id,
        toOperatorId: leaving.id,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Il cliente è già di questo operatore",
      cause: { code: "HANDOVER_SAME_OPERATOR" },
    })
    expect(await isDisabled(leaving.userId)).toBe(false)
  })

  it("un OPERATORE che chiama la procedura riceve FORBIDDEN admin-only e non cambia nulla", async () => {
    const caller = createTestCaller(await createOperator({ role: "OPERATORE" }))
    const leaving = await createOperator()
    const target = await createOperator()
    const customer = await createCustomer({ operatorId: leaving.id })

    await expect(
      caller.operator.deactivate({
        operatorId: leaving.id,
        toOperatorId: target.id,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "admin-only" })

    expect(await operatorOfCustomer(customer.id)).toBe(leaving.id)
    expect(await isDisabled(leaving.userId)).toBe(false)
  })

  it("un admin riceve i tre conteggi dello spostamento", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator()
    const target = await createOperator()
    const customer = await createCustomer({ operatorId: leaving.id })

    const result = await createTestCaller(admin).operator.deactivate({
      operatorId: leaving.id,
      toOperatorId: target.id,
    })

    expect(result).toEqual({
      customersMoved: 1,
      contactsMoved: 0,
      practicesMoved: 0,
    })
    expect(await operatorOfCustomer(customer.id)).toBe(target.id)
    expect(await isDisabled(leaving.userId)).toBe(true)
  })
})

describe("operator.getDeactivationImpact", () => {
  it("conta clienti, contatti attivi e pratiche dell'operatore", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator()
    const first = await createCustomer({ operatorId: leaving.id })
    await createCustomer({ operatorId: leaving.id })
    await createCustomer({ operatorId: admin.id })
    await createTask({ customerId: first.id, operatorId: leaving.id })
    await createTask({
      customerId: first.id,
      operatorId: leaving.id,
      isActive: false,
    })
    await createPractice({ customerId: first.id, operatorId: leaving.id })

    const impact = await createTestCaller(admin).operator.getDeactivationImpact(
      { operatorId: leaving.id }
    )

    expect(impact).toEqual({ customers: 2, contacts: 1, practices: 1 })
  })

  it("risponde zeri per un operatore senza portafoglio", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator()

    expect(
      await createTestCaller(admin).operator.getDeactivationImpact({
        operatorId: leaving.id,
      })
    ).toEqual({ customers: 0, contacts: 0, practices: 0 })
  })

  it("un OPERATORE riceve FORBIDDEN admin-only", async () => {
    const caller = createTestCaller(await createOperator({ role: "OPERATORE" }))
    const leaving = await createOperator()

    await expect(
      caller.operator.getDeactivationImpact({ operatorId: leaving.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "admin-only" })
  })
})

describe("operator.getOperatorsForDeactivation", () => {
  it("elenca gli operatori attivi tranne quello da disattivare, senza disattivati e sistema, per cognome e nome", async () => {
    const admin = await createOperator({
      role: "ADMIN",
      name: "Anna",
      surname: "Zeta",
    })
    const leaving = await createOperator({
      name: "Carla",
      surname: "Mura",
    })
    const luca = await createOperator({ name: "Luca", surname: "Alfa" })
    const bruno = await createOperator({ name: "Bruno", surname: "Alfa" })
    await createOperator({ name: "Ex", surname: "Dis", disabledAt: new Date() })
    await createSystemOperator()

    const targets = await createTestCaller(
      admin
    ).operator.getOperatorsForDeactivation({ operatorId: leaving.id })

    expect(targets).toEqual([
      { id: bruno.id, name: "Bruno", surname: "Alfa" },
      { id: luca.id, name: "Luca", surname: "Alfa" },
      { id: admin.id, name: "Anna", surname: "Zeta" },
    ])
  })

  it("un OPERATORE riceve FORBIDDEN admin-only", async () => {
    const caller = createTestCaller(await createOperator({ role: "OPERATORE" }))
    const leaving = await createOperator()

    await expect(
      caller.operator.getOperatorsForDeactivation({ operatorId: leaving.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "admin-only" })
  })
})

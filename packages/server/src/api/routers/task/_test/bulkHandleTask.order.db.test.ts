import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import {
  activeTasksOf,
  customerRow,
  logOf,
  migrateUpTo,
  resetDb,
  tasksOf,
} from "@/test/db"
import { createTestCaller } from "@/test/caller"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
} from "@/test/factories"

// The run order of the bulk assignment: one transaction per customer, in the
// order given, and the first failure stops the run. The case with the error on
// the last customer is in bulkHandleTask.db.test.ts.

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("task.bulkHandleTask, ordine e arresto al primo errore", () => {
  it("su [A, inesistente, C] fallisce, assegna A e lascia C com'era", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const admin = await createOperator({ role: "ADMIN", name: "Admin" })
    const previousOperator = await createOperator({ name: "Precedente" })
    const nextOperator = await createOperator({ name: "Nuovo" })
    const caller = createTestCaller(admin)
    const first = await createCustomer({ operatorId: previousOperator.id })
    const last = await createCustomer({ operatorId: previousOperator.id })
    // C has an active contact that the run would replace if it got there
    await createTask({
      customerId: last.id,
      operatorId: previousOperator.id,
      state: "app.to",
    })
    const lastBefore = {
      customer: await customerRow(last.id),
      tasks: await tasksOf(last.id),
      log: await logOf(last.id),
    }

    await expect(
      caller.task.bulkHandleTask({
        operatorId: nextOperator.id,
        customerIds: [first.id, "missing-customer", last.id],
        state: "chiamare",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Cliente non trovato: missing-customer",
    })

    // A, before the missing one, stays assigned
    expect(await customerRow(first.id)).toMatchObject({
      operatorId: nextOperator.id,
    })
    expect(await activeTasksOf(first.id)).toEqual([
      expect.objectContaining({
        state: "chiamare",
        operatorId: nextOperator.id,
        isActive: true,
      }),
    ])
    expect(await logOf(first.id)).toEqual([
      expect.objectContaining({
        action: "state_change",
        source: "bulk",
        actorOperatorId: admin.id,
        fromState: null,
        toState: "chiamare",
      }),
      expect.objectContaining({
        action: "operator_reassign",
        source: "bulk",
        actorOperatorId: admin.id,
        fromOperatorId: previousOperator.id,
        toOperatorId: nextOperator.id,
      }),
    ])
    // C, after it, is as it was
    expect(await customerRow(last.id)).toEqual(lastBefore.customer)
    expect(await tasksOf(last.id)).toEqual(lastBefore.tasks)
    expect(await logOf(last.id)).toEqual(lastBefore.log)
  })

  it("con l'alert confermato, la task nuova è più recente di quella che sostituisce", async () => {
    const admin = await createOperator({ role: "ADMIN", name: "Admin" })
    const previousOperator = await createOperator({ name: "Precedente" })
    const nextOperator = await createOperator({ name: "Nuovo" })
    const caller = createTestCaller(admin)
    const customer = await createCustomer({ operatorId: previousOperator.id })
    const previous = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "richiamare",
    })
    await createAlert({
      taskId: previous.id,
      deadline: new Date("2030-01-02T08:00:00.000Z"),
    })
    // With the clock still, the database's default (the start of the
    // transaction) equals the app's clock that rewrites the old task: only
    // the insert's own ordering can put the new task ahead
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2030-01-01T09:00:00.000Z"))

    await caller.task.bulkHandleTask({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
      state: "chiamare",
      resolveAlertCustomerIds: [customer.id],
    })

    const [old, current] = await tasksOf(customer.id)
    expect(old).toMatchObject({ id: previous.id, isActive: false })
    expect(current).toMatchObject({ isActive: true, state: "chiamare" })
    expect(current!.updatedAt.getTime()).toBeGreaterThan(
      old!.updatedAt.getTime()
    )
  })
})

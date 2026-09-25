import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import { logOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
} from "@/test/factories"
import { failNextInsertInto } from "@/test/failpoint"

// The four cases of the operators' guide (brain/chore/crm/guida-assegnazione-
// massiva-e-alert.md). The UI offers the bulk assignment to admins only.

const CLOSED_AT = new Date("2026-09-20T09:30:00.000Z")

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function seed() {
  const admin = await createOperator({ role: "ADMIN", name: "Admin" })
  const previousOperator = await createOperator({ name: "Precedente" })
  const nextOperator = await createOperator({ name: "Nuovo" })
  const customer = await createCustomer({ operatorId: previousOperator.id })
  const caller = createTestCaller(admin)
  return { admin, previousOperator, nextOperator, customer, caller }
}

describe("task.bulkHandleTask (comportamento attuale)", () => {
  it("caso 1: un cliente senza contatto attivo riceve una nuova task attiva e il nuovo operatore", async () => {
    const { admin, previousOperator, nextOperator, customer, caller } =
      await seed()

    await caller.task.bulkHandleTask({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
      state: "chiamare",
    })

    const [active] = await caller.task.getActiveTask({ id: customer.id })
    expect(active).toMatchObject({
      state: "chiamare",
      operatorId: nextOperator.id,
      priority: 120,
      closedAt: null,
      alertId: null,
      isActive: true,
    })
    expect(await tasksOf(customer.id)).toHaveLength(1)
    expect(
      await caller.customer.getCustomerById({ id: customer.id })
    ).toMatchObject({ operatorId: nextOperator.id })
    expect(await logOf(customer.id)).toEqual([
      expect.objectContaining({
        action: "state_change",
        source: "bulk",
        taskId: active!.id,
        actorOperatorId: admin.id,
        fromState: null,
        toState: "chiamare",
      }),
      expect.objectContaining({
        action: "operator_reassign",
        source: "bulk",
        taskId: active!.id,
        actorOperatorId: admin.id,
        fromOperatorId: previousOperator.id,
        toOperatorId: nextOperator.id,
      }),
    ])
  })

  it("caso 1: senza cambio di operatore scrive solo il cambio di stato", async () => {
    const { previousOperator, customer, caller } = await seed()

    await caller.task.bulkHandleTask({
      operatorId: previousOperator.id,
      customerIds: [customer.id],
      state: "chiamare",
    })

    expect(await logOf(customer.id)).toEqual([
      expect.objectContaining({ action: "state_change", toState: "chiamare" }),
    ])
  })

  it("caso 2: con l'alert confermato, l'attore risolve l'alert e nasce una nuova task che eredita closedAt", async () => {
    const { admin, previousOperator, nextOperator, customer, caller } =
      await seed()
    const previous = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "richiamare",
      closedAt: CLOSED_AT,
    })
    const alert = await createAlert({
      taskId: previous.id,
      deadline: new Date("2026-10-01T08:00:00.000Z"),
    })

    await caller.task.bulkHandleTask({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
      state: "chiamare",
      resolveAlertCustomerIds: [customer.id],
    })

    const [active] = await caller.task.getActiveTask({ id: customer.id })
    expect(active).toMatchObject({
      state: "chiamare",
      operatorId: nextOperator.id,
      priority: 120,
      closedAt: CLOSED_AT,
      alertId: null,
    })
    expect(active!.id).not.toBe(previous.id)
    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({
        id: previous.id,
        isActive: false,
        alertId: null,
        state: "richiamare",
      }),
      expect.objectContaining({ id: active!.id }),
    ])
    expect(await caller.task.getCustomerAlerts({ id: customer.id })).toEqual([
      expect.objectContaining({
        id: alert.id,
        isResolved: true,
        resolvedByName: admin.name,
      }),
    ])
    expect(
      await caller.customer.getCustomerById({ id: customer.id })
    ).toMatchObject({ operatorId: nextOperator.id })
    expect(await logOf(customer.id)).toEqual([
      expect.objectContaining({
        action: "alert_resolved",
        source: "bulk",
        taskId: previous.id,
        alertId: alert.id,
        actorOperatorId: admin.id,
      }),
      expect.objectContaining({
        action: "state_change",
        source: "bulk",
        taskId: active!.id,
        fromState: "richiamare",
        toState: "chiamare",
      }),
      expect.objectContaining({
        action: "operator_reassign",
        source: "bulk",
        taskId: active!.id,
        fromOperatorId: previousOperator.id,
        toOperatorId: nextOperator.id,
      }),
    ])
  })

  it("caso 2: la nuova task resta la più recente del cliente, e Assegna Clienti riassegna quella", async () => {
    const { previousOperator, nextOperator, customer, caller } = await seed()
    const laterOperator = await createOperator({ name: "Successivo" })
    const previous = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "richiamare",
    })
    await createAlert({
      taskId: previous.id,
      deadline: new Date("2026-10-01T08:00:00.000Z"),
    })
    await caller.task.bulkHandleTask({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
      state: "chiamare",
      resolveAlertCustomerIds: [customer.id],
    })

    await caller.customer.bulkUpdateCustomers({
      operatorId: laterOperator.id,
      customerIds: [customer.id],
    })

    const [active] = await caller.task.getActiveTask({ id: customer.id })
    expect(active).toMatchObject({ operatorId: laterOperator.id })
    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({
        id: previous.id,
        operatorId: previousOperator.id,
      }),
      expect.objectContaining({ id: active!.id }),
    ])
  })

  it("caso 3: un contatto app.to senza alert diventa una nuova task attiva nello stato richiesto che eredita closedAt, e la precedente non è più attiva", async () => {
    const { admin, previousOperator, nextOperator, customer, caller } =
      await seed()
    const previous = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "app.to",
      closedAt: CLOSED_AT,
    })

    await caller.task.bulkHandleTask({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
      state: "chiamare",
    })

    const [active] = await caller.task.getActiveTask({ id: customer.id })
    expect(active).toMatchObject({
      state: "chiamare",
      operatorId: nextOperator.id,
      priority: 120,
      closedAt: CLOSED_AT,
      alertId: null,
    })
    expect(active!.id).not.toBe(previous.id)
    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({
        id: previous.id,
        isActive: false,
        state: "app.to",
      }),
      expect.objectContaining({ id: active!.id }),
    ])
    expect(
      await caller.customer.getCustomerById({ id: customer.id })
    ).toMatchObject({ operatorId: nextOperator.id })
    expect(await logOf(customer.id)).toEqual([
      expect.objectContaining({
        action: "state_change",
        source: "bulk",
        taskId: active!.id,
        actorOperatorId: admin.id,
        fromState: "app.to",
        toState: "chiamare",
      }),
      expect.objectContaining({
        action: "operator_reassign",
        source: "bulk",
        taskId: active!.id,
        actorOperatorId: admin.id,
        fromOperatorId: previousOperator.id,
        toOperatorId: nextOperator.id,
      }),
    ])
  })

  it("caso 4: un contatto in followup viene solo riassegnato, senza cambiare stato", async () => {
    const { admin, previousOperator, nextOperator, customer, caller } =
      await seed()
    const previous = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "followup",
      closedAt: CLOSED_AT,
    })

    await caller.task.bulkHandleTask({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
      state: "chiamare",
    })

    const [active] = await caller.task.getActiveTask({ id: customer.id })
    expect(active).toMatchObject({
      id: previous.id,
      state: "followup",
      operatorId: nextOperator.id,
      closedAt: CLOSED_AT,
    })
    expect(await tasksOf(customer.id)).toHaveLength(1)
    expect(
      await caller.customer.getCustomerById({ id: customer.id })
    ).toMatchObject({ operatorId: nextOperator.id })
    expect(await logOf(customer.id)).toEqual([
      expect.objectContaining({
        action: "operator_reassign",
        source: "bulk",
        taskId: previous.id,
        actorOperatorId: admin.id,
        fromOperatorId: previousOperator.id,
        toOperatorId: nextOperator.id,
      }),
    ])
  })

  it("caso 4: con un alert non confermato il contatto viene solo riassegnato e l'alert resta aperto", async () => {
    const { previousOperator, nextOperator, customer, caller } = await seed()
    const previous = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "richiamare",
      closedAt: CLOSED_AT,
    })
    const alert = await createAlert({
      taskId: previous.id,
      deadline: new Date("2026-10-01T08:00:00.000Z"),
    })

    await caller.task.bulkHandleTask({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
      state: "chiamare",
    })

    const [active] = await caller.task.getActiveTask({ id: customer.id })
    expect(active).toMatchObject({
      id: previous.id,
      state: "richiamare",
      operatorId: nextOperator.id,
      alertId: alert.id,
    })
    expect(await tasksOf(customer.id)).toHaveLength(1)
    expect(await caller.task.getCustomerAlerts({ id: customer.id })).toEqual([
      expect.objectContaining({ id: alert.id, isResolved: false }),
    ])
    expect(await logOf(customer.id)).toEqual([
      expect.objectContaining({
        action: "operator_reassign",
        taskId: previous.id,
        fromOperatorId: previousOperator.id,
        toOperatorId: nextOperator.id,
      }),
    ])
  })

  it("elabora più clienti nello stesso ordine della richiesta", async () => {
    const { nextOperator, caller } = await seed()
    const first = await createCustomer()
    const second = await createCustomer()

    await caller.task.bulkHandleTask({
      operatorId: nextOperator.id,
      customerIds: [first.id, second.id],
      state: "chiamare",
    })

    const [firstTask] = await tasksOf(first.id)
    const [secondTask] = await tasksOf(second.id)
    expect(firstTask!.id).toBeLessThan(secondTask!.id)
  })

  it("un errore durante l'elaborazione di un cliente non lascia né la nuova task né la disattivazione della precedente", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { previousOperator, nextOperator, caller } = await seed()
    const first = await createCustomer({ operatorId: previousOperator.id })
    const second = await createCustomer({ operatorId: previousOperator.id })
    const firstPrevious = await createTask({
      customerId: first.id,
      operatorId: previousOperator.id,
      state: "app.to",
    })
    const secondPrevious = await createTask({
      customerId: second.id,
      operatorId: previousOperator.id,
      state: "app.to",
    })
    await failNextInsertInto(taskEventLog, { customer_id: second.id })

    await expect(
      caller.task.bulkHandleTask({
        operatorId: nextOperator.id,
        customerIds: [first.id, second.id],
        state: "chiamare",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })

    // The first customer stays processed
    const [firstActive] = await caller.task.getActiveTask({ id: first.id })
    expect(firstActive).toMatchObject({
      state: "chiamare",
      operatorId: nextOperator.id,
    })
    expect(await tasksOf(first.id)).toHaveLength(2)
    expect(await logOf(first.id)).toHaveLength(2)
    // The second one is as it was
    expect(await tasksOf(second.id)).toEqual([secondPrevious])
    expect(
      await caller.customer.getCustomerById({ id: second.id })
    ).toMatchObject({ operatorId: previousOperator.id })
    expect(await logOf(second.id)).toEqual([])
    expect(firstPrevious.id).not.toBe(firstActive!.id)
  })

  it("un cliente inesistente risponde BAD_REQUEST senza scrivere nulla per lui", async () => {
    const { nextOperator, caller } = await seed()

    await expect(
      caller.task.bulkHandleTask({
        operatorId: nextOperator.id,
        customerIds: ["missing-customer"],
        state: "chiamare",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(await testDb.select().from(task)).toEqual([])
  })
})

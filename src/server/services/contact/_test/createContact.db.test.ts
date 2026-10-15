import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { eq } from "drizzle-orm"
import { readContactError } from "@/lib/domain/contact/errors"
import { customers } from "@/server/db/schema/customers"
import { task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import { createTestCaller } from "@/test/caller"
import {
  activeTasksOf,
  logOf,
  migrateUpTo,
  resetDb,
  tasksOf,
  testDb,
} from "@/test/db"
import { failNextInsertInto } from "@/test/failpoint"
import { createCustomer, createOperator, createTask } from "@/test/factories"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("task.createContact", () => {
  it("'Crea contatto' su un cliente assegnato crea un contatto attivo in chiamare assegnato all'operatore del cliente", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })

    await createTestCaller(operator).task.createContact({
      customerId: customer.id,
      source: "detail",
    })

    const [contact] = await activeTasksOf(customer.id)
    expect(contact).toMatchObject({
      state: "chiamare",
      operatorId: operator.id,
      isActive: true,
      closedAt: null,
    })
    expect(await logOf(customer.id)).toMatchObject([
      {
        action: "state_change",
        source: "detail",
        taskId: contact!.id,
        fromState: null,
        toState: "chiamare",
        actorOperatorId: operator.id,
      },
    ])
  })
})

const longAgo = new Date("2026-01-01T00:00:00Z")

const customerRow = async (id: string) =>
  (await testDb.select().from(customers).where(eq(customers.id, id)))[0]!

/** Everything "Crea contatto" may write: the database holds one customer. */
const snapshot = async (customerId: string) => ({
  tasks: await tasksOf(customerId),
  log: await logOf(customerId),
  customer: await customerRow(customerId),
})

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("expected the call to fail")
    },
    (caught: unknown) => caught
  )

describe("task.createContact: il contatto creato (AC66)", () => {
  it("un amministratore crea il contatto assegnato all'operatore del cliente, a priorità 120, e riceve il suo id", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })

    const result = await createTestCaller(admin).task.createContact({
      customerId: customer.id,
      source: "list",
    })

    const [contact] = await activeTasksOf(customer.id)
    expect(contact).toMatchObject({
      state: "chiamare",
      operatorId: operator.id,
      priority: 120,
      closedAt: null,
    })
    expect(result).toEqual({ taskId: contact!.id })
    expect(await logOf(customer.id)).toMatchObject([
      {
        action: "state_change",
        source: "list",
        taskId: contact!.id,
        fromState: null,
        toState: "chiamare",
        actorOperatorId: admin.id,
      },
    ])
  })

  it("un cliente con soli contatti non più attivi ne riceve uno nuovo, il più recente del cliente", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const superseded = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "non interessato",
      isActive: false,
      updatedAt: longAgo,
    })
    // An older contact whose updated_at runs ahead of the clock
    const ahead = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "app.to",
      isActive: false,
      updatedAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    const { taskId } = await createTestCaller(operator).task.createContact({
      customerId: customer.id,
      source: "detail",
    })

    const tasks = await tasksOf(customer.id)
    expect(tasks.map((each) => [each.id, each.isActive])).toEqual([
      [superseded.id, false],
      [ahead.id, false],
      [taskId, true],
    ])
    const mostRecent = [...tasks].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    )[0]
    expect(mostRecent!.id).toBe(taskId)
  })

  it("aggiorna l'ultima modifica del cliente", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({
      operatorId: operator.id,
      updatedAt: longAgo,
    })
    const before = new Date()

    await createTestCaller(operator).task.createContact({
      customerId: customer.id,
      source: "detail",
    })

    expect(
      (await customerRow(customer.id)).updatedAt.getTime()
    ).toBeGreaterThanOrEqual(before.getTime())
  })
})

describe("task.createContact: rifiuti", () => {
  it.each(["OPERATORE", "ADMIN"] as const)(
    "su un cliente senza operatore risponde 'Cliente non assegnato' e non crea nulla (AC67, %s)",
    async (role) => {
      const actor = await createOperator({ role })
      const customer = await createCustomer({ updatedAt: longAgo })
      const before = await snapshot(customer.id)

      const error = await failure(
        createTestCaller(actor).task.createContact({
          customerId: customer.id,
          source: "detail",
        })
      )

      expect(error).toMatchObject({ code: "PRECONDITION_FAILED" })
      expect(readContactError(error)).toEqual({
        code: "CUSTOMER_UNASSIGNED",
        payload: {},
      })
      expect(await snapshot(customer.id)).toEqual(before)
    }
  )

  it("su un cliente che ha già un contatto attivo risponde con quel contatto e non ne crea un secondo (AC67, AC71)", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({
      operatorId: operator.id,
      updatedAt: longAgo,
    })
    const active = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      updatedAt: longAgo,
    })
    const before = await snapshot(customer.id)

    const error = await failure(
      createTestCaller(operator).task.createContact({
        customerId: customer.id,
        source: "detail",
      })
    )

    expect(error).toMatchObject({ code: "CONFLICT" })
    expect(readContactError(error)).toEqual({
      code: "CONTACT_ALREADY_ACTIVE",
      payload: { activeTaskId: active.id },
    })
    expect(await snapshot(customer.id)).toEqual(before)
    expect(await activeTasksOf(customer.id)).toHaveLength(1)
    expect(await logOf(customer.id)).toEqual([])
  })

  it("un operatore non crea un contatto per il cliente di un collega e non modifica nulla (D2, AC49)", async () => {
    const me = await createOperator()
    const colleague = await createOperator({ name: "Luca", surname: "Verdi" })
    const customer = await createCustomer({
      operatorId: colleague.id,
      updatedAt: longAgo,
    })
    const before = await snapshot(customer.id)

    const error = await failure(
      createTestCaller(me).task.createContact({
        customerId: customer.id,
        source: "detail",
      })
    )

    expect(error).toMatchObject({ code: "FORBIDDEN" })
    expect(readContactError(error)).toEqual({
      code: "CONTACT_FORBIDDEN",
      payload: { assignee: "Luca Verdi" },
    })
    expect(await snapshot(customer.id)).toEqual(before)
  })

  it("un cliente che non esiste risponde CUSTOMER_NOT_FOUND", async () => {
    const operator = await createOperator()

    const error = await failure(
      createTestCaller(operator).task.createContact({
        customerId: "missing",
        source: "detail",
      })
    )

    expect(error).toMatchObject({ code: "NOT_FOUND" })
    expect(readContactError(error)).toEqual({
      code: "CUSTOMER_NOT_FOUND",
      payload: {},
    })
  })
})

describe("task.createContact: tutto o niente", () => {
  it("se fallisce la scrittura della riga state_change non resta né il contatto né la riga", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({
      operatorId: operator.id,
      updatedAt: longAgo,
    })
    const before = await snapshot(customer.id)
    await failNextInsertInto(taskEventLog, { action: "state_change" })
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      createTestCaller(operator).task.createContact({
        customerId: customer.id,
        source: "detail",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })

    expect(await snapshot(customer.id)).toEqual(before)
    expect(before.tasks).toEqual([])
  })

  it("un unique_violation sull'inserimento del contatto senza un altro contatto attivo resta un errore del server e non scrive nulla", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({
      operatorId: operator.id,
      updatedAt: longAgo,
    })
    const before = await snapshot(customer.id)
    await failNextInsertInto(task, {}, { sqlstate: "23505" })
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const error = await failure(
      createTestCaller(operator).task.createContact({
        customerId: customer.id,
        source: "detail",
      })
    )

    expect(error).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      cause: { _tag: "DbError", code: "23505" },
    })
    expect(readContactError(error)).toBeNull()
    expect(await snapshot(customer.id)).toEqual(before)
    expect(before.tasks).toEqual([])
  })
})

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
import { customers } from "@/server/db/schema/customers"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import { assignCustomers } from "@/server/services/customer/assignment"
import { logOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { failureTag, runServer } from "@/test/effect"
import { failNextInsertInto } from "@/test/failpoint"
import {
  createAlert,
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"

// "Assegna Clienti" in the customers dashboard

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
  const caller = createTestCaller(admin)
  return { admin, previousOperator, nextOperator, caller }
}

describe("customer.bulkUpdateCustomers", () => {
  it("assegna il cliente e la sua task più recente, se è da chiamare", async () => {
    const { previousOperator, nextOperator, caller } = await seed()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    const current = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "chiamare",
    })

    await caller.customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    expect(
      await caller.customer.getCustomerById({ id: customer.id })
    ).toMatchObject({ operatorId: nextOperator.id })
    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({ id: current.id, operatorId: nextOperator.id }),
    ])
  })

  // Cambia di proposito (T6.8a, D26, AC75): prima un contatto con esito restava
  // al vecchio operatore e il suo cliente passava solo
  it("il contatto con un esito segue il cliente, senza cambiare stato; i clienti non scelti restano come sono", async () => {
    const { previousOperator, nextOperator, caller } = await seed()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    const closedAt = new Date("2026-09-01T10:00:00.000Z")
    const outcome = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "non interessato",
      closedAt,
    })
    const other = await createCustomer({ operatorId: previousOperator.id })
    const otherTask = await createTask({
      customerId: other.id,
      operatorId: previousOperator.id,
      state: "chiamare",
    })

    await caller.customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    expect(
      await caller.customer.getCustomerById({ id: customer.id })
    ).toMatchObject({ operatorId: nextOperator.id })
    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({
        id: outcome.id,
        operatorId: nextOperator.id,
        state: "non interessato",
        closedAt,
      }),
    ])
    expect(await tasksOf(other.id)).toEqual([
      expect.objectContaining({
        id: otherTask.id,
        operatorId: previousOperator.id,
      }),
    ])
  })
})

const deadline = new Date("2026-11-20T09:00:00.000Z")

/** The `operator_reassign` row of "Assegna Clienti" the test expects. */
const bulkRow = (row: {
  taskId: number | null
  from: number | null
  to: number
  actor: number
}): unknown =>
  expect.objectContaining({
    action: "operator_reassign",
    source: "bulk",
    taskId: row.taskId,
    fromOperatorId: row.from,
    toOperatorId: row.to,
    actorOperatorId: row.actor,
  })

const customerRow = async (id: string) => {
  const [row] = await testDb
    .select()
    .from(customers)
    .where(eq(customers.id, id))
  return row!
}

describe("customer.bulkUpdateCustomers, cliente e contatto insieme (D14, D26, AC75, D29)", () => {
  it("un contatto in richiamare con un alert aperto passa con il cliente, e il log ha le due righe", async () => {
    const { admin, previousOperator, nextOperator, caller } = await seed()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "richiamare",
    })
    const openAlert = await createAlert({ taskId: contact.id, deadline })

    await caller.customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    expect((await customerRow(customer.id)).operatorId).toBe(nextOperator.id)
    // Stato, priorità e alert restano com'erano
    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({
        id: contact.id,
        operatorId: nextOperator.id,
        state: "richiamare",
        priority: contact.priority,
        alertId: openAlert.id,
        isActive: true,
      }),
    ])
    const log = await logOf(customer.id)
    expect(log).toHaveLength(2)
    expect(log).toEqual(
      expect.arrayContaining([
        bulkRow({
          taskId: null,
          from: previousOperator.id,
          to: nextOperator.id,
          actor: admin.id,
        }),
        bulkRow({
          taskId: contact.id,
          from: previousOperator.id,
          to: nextOperator.id,
          actor: admin.id,
        }),
      ])
    )
  })

  it("un cliente senza contatto: passa solo il cliente, con una riga di log e nessun contatto nuovo", async () => {
    const { admin, previousOperator, nextOperator, caller } = await seed()
    const customer = await createCustomer({ operatorId: previousOperator.id })

    await caller.customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    expect((await customerRow(customer.id)).operatorId).toBe(nextOperator.id)
    expect(await tasksOf(customer.id)).toEqual([])
    expect(await logOf(customer.id)).toEqual([
      bulkRow({
        taskId: null,
        from: previousOperator.id,
        to: nextOperator.id,
        actor: admin.id,
      }),
    ])
  })

  it("cliente e contatto senza operatore (l'uso tipico): passano al nuovo operatore, e la riga del contatto ha il da nullo", async () => {
    const { admin, nextOperator, caller } = await seed()
    const customer = await createCustomer({ operatorId: null })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: null,
      state: "chiamare",
    })

    await caller.customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    expect((await customerRow(customer.id)).operatorId).toBe(nextOperator.id)
    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({ id: contact.id, operatorId: nextOperator.id }),
    ])
    const log = await logOf(customer.id)
    expect(log).toHaveLength(2)
    expect(log).toEqual(
      expect.arrayContaining([
        bulkRow({
          taskId: null,
          from: null,
          to: nextOperator.id,
          actor: admin.id,
        }),
        bulkRow({
          taskId: contact.id,
          from: null,
          to: nextOperator.id,
          actor: admin.id,
        }),
      ])
    )
  })

  it("cliente senza operatore con il contatto di un altro operatore (caso b): passano entrambi, e la riga del contatto va dall'altro operatore al nuovo", async () => {
    const { admin, previousOperator, nextOperator, caller } = await seed()
    const customer = await createCustomer({ operatorId: null })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "richiamare",
    })

    await caller.customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    expect((await customerRow(customer.id)).operatorId).toBe(nextOperator.id)
    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({ id: contact.id, operatorId: nextOperator.id }),
    ])
    const log = await logOf(customer.id)
    expect(log).toHaveLength(2)
    expect(log).toEqual(
      expect.arrayContaining([
        bulkRow({
          taskId: null,
          from: null,
          to: nextOperator.id,
          actor: admin.id,
        }),
        bulkRow({
          taskId: contact.id,
          from: previousOperator.id,
          to: nextOperator.id,
          actor: admin.id,
        }),
      ])
    )
  })

  it("cliente già del nuovo operatore con il contatto di un altro: cambia solo il contatto, una riga di log", async () => {
    const { admin, previousOperator, nextOperator, caller } = await seed()
    const customer = await createCustomer({ operatorId: nextOperator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "richiamare",
    })
    const before = await customerRow(customer.id)

    await caller.customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    // Il cliente non si riscrive
    expect(await customerRow(customer.id)).toEqual(before)
    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({ id: contact.id, operatorId: nextOperator.id }),
    ])
    expect(await logOf(customer.id)).toEqual([
      bulkRow({
        taskId: contact.id,
        from: previousOperator.id,
        to: nextOperator.id,
        actor: admin.id,
      }),
    ])
  })

  it("cliente e contatto già allineati: nessuna scrittura, nessuna riga di log, nessun errore", async () => {
    const { nextOperator, caller } = await seed()
    const customer = await createCustomer({ operatorId: nextOperator.id })
    await createTask({
      customerId: customer.id,
      operatorId: nextOperator.id,
      state: "richiamare",
    })
    const customerBefore = await customerRow(customer.id)
    const tasksBefore = await tasksOf(customer.id)

    await caller.customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    expect(await customerRow(customer.id)).toEqual(customerBefore)
    expect(await tasksOf(customer.id)).toEqual(tasksBefore)
    expect(await logOf(customer.id)).toEqual([])
  })

  it("un contatto non attivo resta all'operatore che lo ha lavorato", async () => {
    const { previousOperator, nextOperator, caller } = await seed()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    const superseded = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "app.to",
      isActive: false,
    })
    const active = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "chiamare",
    })

    await caller.customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({
        id: superseded.id,
        operatorId: previousOperator.id,
      }),
      expect.objectContaining({ id: active.id, operatorId: nextOperator.id }),
    ])
    // Una riga per il cliente e una per il contatto attivo, nessuna per l'altro
    expect(await logOf(customer.id)).toHaveLength(2)
  })

  it("più clienti: ognuno passa con il suo contatto", async () => {
    const { previousOperator, nextOperator, caller } = await seed()
    const first = await createCustomer({ operatorId: previousOperator.id })
    const firstContact = await createTask({
      customerId: first.id,
      operatorId: previousOperator.id,
      state: "app.to",
    })
    const second = await createCustomer({ operatorId: null })
    const secondContact = await createTask({
      customerId: second.id,
      operatorId: null,
      state: "followup",
    })

    await caller.customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [first.id, second.id],
    })

    for (const [customer, contact] of [
      [first, firstContact],
      [second, secondContact],
    ] as const) {
      expect((await customerRow(customer.id)).operatorId).toBe(nextOperator.id)
      expect(await tasksOf(customer.id)).toEqual([
        expect.objectContaining({
          id: contact.id,
          operatorId: nextOperator.id,
        }),
      ])
      expect(await logOf(customer.id)).toHaveLength(2)
    }
  })
})

describe("customer.bulkUpdateCustomers, errori (P19, D29)", () => {
  it("un operatore di destinazione che non c'è, o quello di sistema, dà errore prima che qualunque cliente cambi", async () => {
    const { previousOperator, caller } = await seed()
    const system = await createSystemOperator()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "richiamare",
    })

    for (const operatorId of [30000, system.id]) {
      await expect(
        caller.customer.bulkUpdateCustomers({
          operatorId,
          customerIds: [customer.id],
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    }

    expect((await customerRow(customer.id)).operatorId).toBe(
      previousOperator.id
    )
    expect(await tasksOf(customer.id)).toEqual([contact])
    expect(await logOf(customer.id)).toEqual([])
  })

  it("un cliente che non esiste dà CUSTOMER_NOT_FOUND e ferma il resto: i clienti prima restano assegnati", async () => {
    const { previousOperator, nextOperator, caller } = await seed()
    const before = await createCustomer({ operatorId: previousOperator.id })
    const beforeContact = await createTask({
      customerId: before.id,
      operatorId: previousOperator.id,
      state: "richiamare",
    })
    const after = await createCustomer({ operatorId: previousOperator.id })
    const afterContact = await createTask({
      customerId: after.id,
      operatorId: previousOperator.id,
      state: "richiamare",
    })

    await expect(
      caller.customer.bulkUpdateCustomers({
        operatorId: nextOperator.id,
        customerIds: [before.id, "missing-customer", after.id],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    expect((await customerRow(before.id)).operatorId).toBe(nextOperator.id)
    expect(await tasksOf(before.id)).toEqual([
      expect.objectContaining({
        id: beforeContact.id,
        operatorId: nextOperator.id,
      }),
    ])
    expect((await customerRow(after.id)).operatorId).toBe(previousOperator.id)
    expect(await tasksOf(after.id)).toEqual([afterContact])
  })

  it("un guasto al secondo cliente lascia il primo assegnato e il resto no, con il messaggio del driver", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { previousOperator, nextOperator, caller } = await seed()
    const [first, second, third] = await Promise.all(
      [0, 1, 2].map(async () => {
        const customer = await createCustomer({
          operatorId: previousOperator.id,
        })
        await createTask({
          customerId: customer.id,
          operatorId: previousOperator.id,
          state: "richiamare",
        })
        return customer
      })
    )
    await failNextInsertInto(taskEventLog, { customer_id: second!.id })

    const error = await caller.customer
      .bulkUpdateCustomers({
        operatorId: nextOperator.id,
        customerIds: [first!.id, second!.id, third!.id],
      })
      .catch((e: unknown) => e)

    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    expect((error as Error).message).toMatch(/^failpoint: insert into/)
    expect((await customerRow(first!.id)).operatorId).toBe(nextOperator.id)
    expect((await tasksOf(first!.id))[0]!.operatorId).toBe(nextOperator.id)
    for (const untouched of [second!, third!]) {
      expect((await customerRow(untouched.id)).operatorId).toBe(
        previousOperator.id
      )
      expect((await tasksOf(untouched.id))[0]!.operatorId).toBe(
        previousOperator.id
      )
    }
  })

  // D29: la riga del log sta nella stessa transazione degli UPDATE
  it("se la riga di log del contatto non si scrive, tornano indietro anche l'UPDATE del cliente e quello del contatto", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { previousOperator, nextOperator, caller } = await seed()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "richiamare",
    })
    await failNextInsertInto(taskEventLog, { task_id: contact.id })

    await expect(
      caller.customer.bulkUpdateCustomers({
        operatorId: nextOperator.id,
        customerIds: [customer.id],
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })

    expect((await customerRow(customer.id)).operatorId).toBe(
      previousOperator.id
    )
    expect(await tasksOf(customer.id)).toEqual([contact])
    expect(await logOf(customer.id)).toEqual([])
  })
})

describe("customer.bulkUpdateCustomers, permessi (P7)", () => {
  it("un OPERATORE che la chiama riceve FORBIDDEN e nulla cambia", async () => {
    const { previousOperator, nextOperator } = await seed()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    const current = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "chiamare",
    })

    await expect(
      createTestCaller(previousOperator).customer.bulkUpdateCustomers({
        operatorId: nextOperator.id,
        customerIds: [customer.id],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(
      await createTestCaller(previousOperator).customer.getCustomerById({
        id: customer.id,
      })
    ).toMatchObject({ operatorId: previousOperator.id })
    expect(await tasksOf(customer.id)).toEqual([current])
    expect(await logOf(customer.id)).toEqual([])
  })

  // Il test via procedura passa dal middleware: il servizio si prova da solo
  it.each(["di un collega", "suo"])(
    "il servizio chiamato da un OPERATORE per un cliente %s dà CustomerAssignmentForbidden e nulla cambia",
    async (whose) => {
      const { previousOperator, nextOperator } = await seed()
      const colleague = await createOperator({ name: "Collega" })
      const customer = await createCustomer({
        operatorId: whose === "suo" ? previousOperator.id : colleague.id,
      })
      const contact = await createTask({
        customerId: customer.id,
        operatorId: customer.operatorId,
        state: "richiamare",
      })

      const exit = await runServer(
        assignCustomers({
          customerIds: [customer.id],
          toOperatorId: nextOperator.id,
          actor: { role: "OPERATORE", operatorId: previousOperator.id },
        })
      )

      expect(failureTag(exit)).toBe("CustomerAssignmentForbidden")
      expect((await customerRow(customer.id)).operatorId).toBe(
        customer.operatorId
      )
      expect(await tasksOf(customer.id)).toEqual([contact])
      expect(await logOf(customer.id)).toEqual([])
    }
  )
})

describe("customer.updateCustomer", () => {
  it("non esiste più", async () => {
    const { previousOperator, nextOperator } = await seed()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    const procedures = createTestCaller(nextOperator)
      .customer as unknown as Record<
      string,
      ((input: unknown) => Promise<unknown>) | undefined
    >

    // Over HTTP tRPC answers NOT_FOUND; the server-side caller just throws
    await expect(async () =>
      procedures.updateCustomer!({
        id: customer.id,
        operatorId: nextOperator.id,
      })
    ).rejects.toThrow()
    expect(
      await createTestCaller(previousOperator).customer.getCustomerById({
        id: customer.id,
      })
    ).toMatchObject({ operatorId: previousOperator.id })
  })
})

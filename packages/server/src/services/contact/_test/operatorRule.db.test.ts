import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { Cause, Exit } from "effect"
import { eq } from "drizzle-orm"
import { type TaskStatus } from "@mito/domain/schemas"
import { customers } from "@mito/db/schema/customers"
import { task } from "@mito/db/schema/task"
import { processDueAlerts } from "../processDueAlerts"
import { deactivateOperator } from "../../operator/deactivate"
import { createTestCaller } from "@/test/caller"
import {
  activeTasksOf,
  driverFailure,
  logOf,
  migrateUpTo,
  resetDb,
  testDb,
} from "@/test/db"
import { runServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"
import { assertContactOperatorMatchesCustomer } from "@/test/operatorRule"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// La regola «stesso operatore» (D26, D27): oggi un cliente e il suo contatto
// attivo hanno lo stesso operatore. La garanzia sta nel codice e in questo
// file, non in un vincolo del database: con la verifica attiva, ogni
// transazione che lascia un cliente toccato e il suo contatto attivo su
// operatori diversi fallisce al COMMIT con "operator rule: …".
//
// Il giorno in cui un cliente avrà un gestore (admin) diverso da chi lo
// contatta (operatori), questa è la sola regola da cambiare.
//
// Copertura: da fixture allineate, ogni scrittore che cambia o assegna gli
// operatori fa una chiamata riuscita. Il controllo negativo sotto prova che la
// verifica scatta; senza, tutte le chiamate passerebbero a vuoto. Un nuovo
// scrittore è coperto solo se aggiunge qui la sua chiamata. Si semina prima di
// `assertContactOperatorMatchesCustomer`.
//
// Traccia (D29): per ogni scrittore che cambia l'operatore di una task già
// esistente il test controlla la riga `operator_reassign` con il suo `task_id`,
// `from_operator_id` (anche nullo) e `to_operator_id`. Le task create
// (createContact, riaperture, followup del cron) non hanno un "prima".

const deadline = new Date("2026-10-20T22:00:00Z")

/** A customer of `operator` with an active contact in `state`. */
const seedContact = async (
  operator: { id: number } | null,
  state: TaskStatus = "chiamare"
) => {
  const customer = await createCustomer({ operatorId: operator?.id ?? null })
  const contact = await createTask({
    customerId: customer.id,
    operatorId: operator?.id ?? null,
    state,
  })
  return { customer, contact }
}

/** The `operator_reassign` rows of the customer, by task. */
const reassignRows = async (customerId: string) =>
  (await logOf(customerId)).filter((row) => row.action === "operator_reassign")

/** The customer and its active contact are on the same operator. */
const expectAligned = async (customerId: string) => {
  const [customer] = await testDb
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
  const active = await activeTasksOf(customerId)
  for (const contact of active) {
    expect(contact.operatorId).toBe(customer!.operatorId)
  }
  return { customer: customer!, active }
}

describe("regola «stesso operatore», controllo negativo", () => {
  it("una scrittura su task che lascia contatto e cliente su operatori diversi fa fallire il COMMIT con il messaggio della regola", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()
    const { contact } = await seedContact(owner)
    await assertContactOperatorMatchesCustomer()

    await expect(
      driverFailure(
        testDb
          .update(task)
          .set({ operatorId: colleague.id })
          .where(eq(task.id, contact.id))
      )
    ).rejects.toThrow(/operator rule/)
  })

  it("lo stesso vale per una scrittura su customers che lascia il cliente su un altro operatore", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()
    const { customer } = await seedContact(owner)
    await assertContactOperatorMatchesCustomer()

    await expect(
      driverFailure(
        testDb
          .update(customers)
          .set({ operatorId: colleague.id })
          .where(eq(customers.id, customer.id))
      )
    ).rejects.toThrow(/operator rule/)
  })

  it("un contatto senza operatore su un cliente con operatore (e il contrario) è un disallineamento", async () => {
    const owner = await createOperator()
    const { contact } = await seedContact(owner)
    await assertContactOperatorMatchesCustomer()

    await expect(
      driverFailure(
        testDb
          .update(task)
          .set({ operatorId: null })
          .where(eq(task.id, contact.id))
      )
    ).rejects.toThrow(/operator rule/)
  })

  it("la regola si guarda al COMMIT: due scritture che si compensano nella stessa transazione passano", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()
    const { customer, contact } = await seedContact(owner)
    await assertContactOperatorMatchesCustomer()

    await testDb.transaction(async (tx) => {
      await tx
        .update(task)
        .set({ operatorId: colleague.id })
        .where(eq(task.id, contact.id))
      await tx
        .update(customers)
        .set({ operatorId: colleague.id })
        .where(eq(customers.id, customer.id))
    })

    await expectAligned(customer.id)
  })

  it("un contatto non attivo su un altro operatore, un cliente senza contatto e due senza operatore passano", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()
    const withSuperseded = await createCustomer({ operatorId: owner.id })
    await createTask({
      customerId: withSuperseded.id,
      operatorId: colleague.id,
      isActive: false,
    })
    const withoutContact = await createCustomer({ operatorId: owner.id })
    const bothUnassigned = await seedContact(null)
    await assertContactOperatorMatchesCustomer()

    for (const id of [
      withSuperseded.id,
      withoutContact.id,
      bothUnassigned.customer.id,
    ]) {
      await testDb
        .update(customers)
        .set({ blackListStatus: "review" })
        .where(eq(customers.id, id))
    }
  })
})

describe("regola «stesso operatore»: task.changeState", () => {
  it.each([
    ["un cambio di stato sullo stesso contatto", "chiamare", "nessuno"],
    ["passare a un esito", "chiamare", "app.to"],
  ] as const)(
    "%s lascia cliente e contatto allineati",
    async (_name, from, to) => {
      const owner = await createOperator()
      const { customer, contact } = await seedContact(owner, from)
      await assertContactOperatorMatchesCustomer()

      await createTestCaller(owner).task.changeState({
        taskId: contact.id,
        toState: to,
        source: "list",
        confirmedAlertId: null,
      })

      const { active } = await expectAligned(customer.id)
      expect(active).toMatchObject([{ id: contact.id, operatorId: owner.id }])
    }
  )

  it("la riapertura crea un contatto dello stesso operatore del cliente", async () => {
    const owner = await createOperator()
    const { customer, contact } = await seedContact(owner, "app.to")
    await assertContactOperatorMatchesCustomer()

    const result = await createTestCaller(owner).task.changeState({
      taskId: contact.id,
      toState: "chiamare",
      source: "detail",
      confirmedAlertId: null,
    })

    expect(result).toMatchObject({ reopened: true })
    const { active } = await expectAligned(customer.id)
    expect(active).toMatchObject([{ id: result.taskId, operatorId: owner.id }])
  })
})

describe("regola «stesso operatore»: task.createContact", () => {
  it("il contatto nuovo prende l'operatore del cliente", async () => {
    const owner = await createOperator()
    const customer = await createCustomer({ operatorId: owner.id })
    await assertContactOperatorMatchesCustomer()

    const { taskId } = await createTestCaller(owner).task.createContact({
      customerId: customer.id,
      source: "detail",
    })

    const { active } = await expectAligned(customer.id)
    expect(active).toMatchObject([{ id: taskId, operatorId: owner.id }])
  })
})

describe("regola «stesso operatore»: task.reassign", () => {
  it("un admin sposta contatto e cliente insieme, con le due righe di log", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const owner = await createOperator()
    const colleague = await createOperator()
    const { customer, contact } = await seedContact(owner, "app.to")
    await assertContactOperatorMatchesCustomer()

    await createTestCaller(admin).task.reassign({
      taskId: contact.id,
      operatorId: colleague.id,
    })

    const { customer: after } = await expectAligned(customer.id)
    expect(after.operatorId).toBe(colleague.id)
    expect(await reassignRows(customer.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: contact.id,
          fromOperatorId: owner.id,
          toOperatorId: colleague.id,
        }),
      ])
    )
  })
})

describe("regola «stesso operatore»: customer.handover", () => {
  it("il passaggio di consegne sposta cliente e contatto, con la riga del contatto", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()
    const { customer, contact } = await seedContact(owner, "app.to")
    await assertContactOperatorMatchesCustomer()

    await createTestCaller(owner).customer.handover({
      customerId: customer.id,
      toOperatorId: colleague.id,
    })

    const { customer: after } = await expectAligned(customer.id)
    expect(after.operatorId).toBe(colleague.id)
    expect(await reassignRows(customer.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: contact.id,
          fromOperatorId: owner.id,
          toOperatorId: colleague.id,
        }),
      ])
    )
  })
})

describe("regola «stesso operatore»: customer.assignToYourself", () => {
  it("con il contatto senza operatore, cliente e contatto passano all'operatore, con la riga del contatto e from nullo", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact(null)
    await assertContactOperatorMatchesCustomer()

    await createTestCaller(operator).customer.assignToYourself({
      id: customer.id,
    })

    const { customer: after } = await expectAligned(customer.id)
    expect(after.operatorId).toBe(operator.id)
    expect(await reassignRows(customer.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: contact.id,
          fromOperatorId: null,
          toOperatorId: operator.id,
        }),
      ])
    )
  })

  it("senza contatto attivo passa solo il cliente", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: null })
    await assertContactOperatorMatchesCustomer()

    await createTestCaller(operator).customer.assignToYourself({
      id: customer.id,
    })

    const { customer: after, active } = await expectAligned(customer.id)
    expect(after.operatorId).toBe(operator.id)
    expect(active).toEqual([])
  })
})

describe("regola «stesso operatore»: task.bulkHandleTask", () => {
  const seedBulk = async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const previousOperator = await createOperator()
    const nextOperator = await createOperator()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    return { admin, previousOperator, nextOperator, customer }
  }

  it("caso 1, un cliente senza contatto attivo: il contatto nuovo e il cliente sono del nuovo operatore", async () => {
    const { admin, nextOperator, customer } = await seedBulk()
    await assertContactOperatorMatchesCustomer()

    await createTestCaller(admin).task.bulkHandleTask({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
      state: "chiamare",
    })

    const { customer: after, active } = await expectAligned(customer.id)
    expect(after.operatorId).toBe(nextOperator.id)
    expect(active).toHaveLength(1)
  })

  it("caso 2, l'alert aperto confermato: il contatto nuovo e il cliente sono del nuovo operatore", async () => {
    const { admin, previousOperator, nextOperator, customer } = await seedBulk()
    const previous = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "richiamare",
    })
    await createAlert({ taskId: previous.id, deadline })
    await assertContactOperatorMatchesCustomer()

    await createTestCaller(admin).task.bulkHandleTask({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
      state: "chiamare",
      resolveAlertCustomerIds: [customer.id],
    })

    const { customer: after, active } = await expectAligned(customer.id)
    expect(after.operatorId).toBe(nextOperator.id)
    expect(active[0]!.id).not.toBe(previous.id)
  })

  it("caso 3, un esito senza alert: il contatto nuovo e il cliente sono del nuovo operatore", async () => {
    const { admin, previousOperator, nextOperator, customer } = await seedBulk()
    const previous = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "app.to",
    })
    await assertContactOperatorMatchesCustomer()

    await createTestCaller(admin).task.bulkHandleTask({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
      state: "chiamare",
    })

    const { customer: after, active } = await expectAligned(customer.id)
    expect(after.operatorId).toBe(nextOperator.id)
    expect(active[0]!.id).not.toBe(previous.id)
  })

  it.each(["chiamare", "followup"] as const)(
    "caso 4, un contatto in %s: passa con il cliente, con la riga del contatto",
    async (state) => {
      const { admin, previousOperator, nextOperator, customer } =
        await seedBulk()
      const previous = await createTask({
        customerId: customer.id,
        operatorId: previousOperator.id,
        state,
      })
      await assertContactOperatorMatchesCustomer()

      await createTestCaller(admin).task.bulkHandleTask({
        operatorId: nextOperator.id,
        customerIds: [customer.id],
        state: "chiamare",
      })

      const { customer: after, active } = await expectAligned(customer.id)
      expect(after.operatorId).toBe(nextOperator.id)
      expect(active).toMatchObject([{ id: previous.id }])
      expect(await reassignRows(customer.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            taskId: previous.id,
            fromOperatorId: previousOperator.id,
            toOperatorId: nextOperator.id,
          }),
        ])
      )
    }
  )
})

describe("regola «stesso operatore»: customer.bulkUpdateCustomers", () => {
  const seedAssign = async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const previousOperator = await createOperator()
    const nextOperator = await createOperator()
    return { admin, previousOperator, nextOperator }
  }

  it("un cliente senza contatto passa da solo", async () => {
    const { admin, previousOperator, nextOperator } = await seedAssign()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    await assertContactOperatorMatchesCustomer()

    await createTestCaller(admin).customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    const { customer: after } = await expectAligned(customer.id)
    expect(after.operatorId).toBe(nextOperator.id)
  })

  it.each(["chiamare", "richiamare", "app.to"] as const)(
    "un contatto in %s passa con il cliente, con la riga del contatto",
    async (state) => {
      const { admin, previousOperator, nextOperator } = await seedAssign()
      const { customer, contact } = await seedContact(previousOperator, state)
      if (state === "richiamare") {
        await createAlert({ taskId: contact.id, deadline })
      }
      await assertContactOperatorMatchesCustomer()

      await createTestCaller(admin).customer.bulkUpdateCustomers({
        operatorId: nextOperator.id,
        customerIds: [customer.id],
      })

      const { customer: after, active } = await expectAligned(customer.id)
      expect(after.operatorId).toBe(nextOperator.id)
      expect(active).toMatchObject([{ id: contact.id, state }])
      expect(await reassignRows(customer.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            taskId: contact.id,
            fromOperatorId: previousOperator.id,
            toOperatorId: nextOperator.id,
          }),
        ])
      )
    }
  )

  it("più clienti, di operatori diversi, passano ognuno con il suo contatto", async () => {
    const { admin, previousOperator, nextOperator } = await seedAssign()
    const other = await createOperator()
    const first = await seedContact(previousOperator)
    const second = await seedContact(other, "app.to")
    const third = await seedContact(null)
    await assertContactOperatorMatchesCustomer()

    await createTestCaller(admin).customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [first.customer.id, second.customer.id, third.customer.id],
    })

    for (const { customer } of [first, second, third]) {
      const { customer: after } = await expectAligned(customer.id)
      expect(after.operatorId).toBe(nextOperator.id)
    }
  })

  it("cliente e contatto già del nuovo operatore non cambiano", async () => {
    const { admin, nextOperator } = await seedAssign()
    const { customer } = await seedContact(nextOperator)
    await assertContactOperatorMatchesCustomer()

    await createTestCaller(admin).customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    await expectAligned(customer.id)
    expect(await logOf(customer.id)).toEqual([])
  })
})

describe("regola «stesso operatore»: il cron degli alert (processDueAlerts)", () => {
  const NOW = new Date("2026-09-25T06:00:00.000Z")

  it("un alert che scade oggi crea il followup dell'operatore del cliente", async () => {
    await createSystemOperator()
    const operator = await createOperator()
    const { customer, contact } = await seedContact(operator, "richiamare")
    await createAlert({
      taskId: contact.id,
      deadline: new Date("2026-09-25T08:00:00.000Z"),
    })
    await assertContactOperatorMatchesCustomer()

    const exit = await runServer(processDueAlerts(NOW, { budgetMs: 60_000 }))

    if (Exit.isFailure(exit)) throw new Error(Cause.pretty(exit.cause))
    expect(exit.value).toMatchObject({ processed: 1, failed: 0 })
    const { active } = await expectAligned(customer.id)
    expect(active).toMatchObject([
      { state: "followup", operatorId: operator.id },
    ])
  })
})

describe("regola «stesso operatore»: deactivateOperator", () => {
  it("i clienti dell'operatore passano alla destinazione con i loro contatti attivi, con le righe dei contatti", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator()
    const target = await createOperator()
    const first = await seedContact(leaving, "richiamare")
    const second = await seedContact(leaving, "app.to")
    const bare = await createCustomer({ operatorId: leaving.id })
    const ofTarget = await seedContact(target)
    await assertContactOperatorMatchesCustomer()

    const exit = await runServer(
      deactivateOperator({
        operatorId: leaving.id,
        toOperatorId: target.id,
        actor: { role: "ADMIN", operatorId: admin.id },
      })
    )

    if (Exit.isFailure(exit)) throw new Error(Cause.pretty(exit.cause))
    expect(exit.value).toEqual({
      customersMoved: 3,
      contactsMoved: 2,
      practicesMoved: 0,
    })
    for (const { customer, contact } of [first, second]) {
      const { customer: after } = await expectAligned(customer.id)
      expect(after.operatorId).toBe(target.id)
      expect(await reassignRows(customer.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            taskId: contact.id,
            source: "deactivation",
            fromOperatorId: leaving.id,
            toOperatorId: target.id,
          }),
        ])
      )
    }
    const { customer: bareAfter } = await expectAligned(bare.id)
    expect(bareAfter.operatorId).toBe(target.id)
    await expectAligned(ofTarget.customer.id)
    expect(await logOf(ofTarget.customer.id)).toEqual([])
  })
})

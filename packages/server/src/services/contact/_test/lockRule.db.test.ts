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
import { messages } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { chatToOperator } from "@mito/db/schema/relations/chatToOperator"
import { task } from "@mito/db/schema/task"
import { query, transaction } from "../../../effect/db"
import { processDueAlerts } from "../processDueAlerts"
import { deactivateOperator } from "../../operator/deactivate"
import { createTestCaller } from "@/test/caller"
import {
  activeTasksOf,
  logOf,
  migrateUpTo,
  resetDb,
  tasksOf,
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
import {
  assertCustomerLockedOnChatWrite,
  assertCustomerLockedOnWrite,
} from "@/test/lockRule"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("regola dei lock", () => {
  it("con la verifica del lock attiva, una scrittura su task senza lockCustomer fallisce con il messaggio della regola dei lock", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const customer = await createCustomer()
    const contact = await createTask({ customerId: customer.id })
    await assertCustomerLockedOnWrite()

    const exit = await runServer(
      transaction(
        query((client) =>
          client
            .update(task)
            .set({ state: "app.to" })
            .where(eq(task.id, contact.id))
        )
      )
    )

    expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain(
      "lock rule"
    )
  })
})

// Coverage: with the check active, every writer of a contact succeeds, so each
// one locks the customer before it writes. The RED test above is the negative
// control: a check that never fires would let all of these pass. Seed before
// `assertCustomerLockedOnWrite`, as the factories write without locks. A new
// writer is covered only if it adds its call here.
//
// Outside the rule, so not covered here: the `priority` cron
// (`refreshPriorities`) and the event-log cleanup (`cleanupTaskEventLog`).

const deadline = new Date("2026-10-20T22:00:00Z")
const inTwoDays = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)

/** A customer of `operator` with an active contact in `state`. */
const seedContact = async (
  operator: { id: number },
  state: TaskStatus = "chiamare"
) => {
  const customer = await createCustomer({ operatorId: operator.id })
  const contact = await createTask({
    customerId: customer.id,
    operatorId: operator.id,
    state,
  })
  return { customer, contact }
}

describe("regola dei lock: task.changeState", () => {
  it("un cambio di stato sullo stesso contatto prende il lock del cliente", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact(operator, "chiamare")
    await assertCustomerLockedOnWrite()

    await createTestCaller(operator).task.changeState({
      taskId: contact.id,
      toState: "nessuno",
      source: "list",
      confirmedAlertId: null,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, state: "nessuno" },
    ])
  })

  it("passare a un esito prende il lock del cliente", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact(operator, "chiamare")
    await assertCustomerLockedOnWrite()

    await createTestCaller(operator).task.changeState({
      taskId: contact.id,
      toState: "app.to",
      source: "list",
      confirmedAlertId: null,
    })

    const [after] = await tasksOf(customer.id)
    expect(after).toMatchObject({ id: contact.id, state: "app.to" })
    expect(after!.closedAt).not.toBeNull()
  })

  it("la riapertura prende il lock del cliente", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact(operator, "app.to")
    await assertCustomerLockedOnWrite()

    const result = await createTestCaller(operator).task.changeState({
      taskId: contact.id,
      toState: "chiamare",
      source: "detail",
      confirmedAlertId: null,
    })

    expect(result).toMatchObject({ reopened: true })
    expect(await activeTasksOf(customer.id)).toMatchObject([
      { id: result.taskId, state: "chiamare" },
    ])
  })

  it("chiudere l'alert confermato prende il lock del cliente", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact(operator, "richiamare")
    const open = await createAlert({ taskId: contact.id, deadline })
    await assertCustomerLockedOnWrite()

    await createTestCaller(operator).task.changeState({
      taskId: contact.id,
      toState: "app.to",
      source: "list",
      confirmedAlertId: open.id,
    })

    expect(await logOf(customer.id)).toMatchObject([
      { action: "alert_resolved", alertId: open.id },
      { action: "state_change", toState: "app.to" },
    ])
  })
})

describe("regola dei lock: le altre azioni sul contatto", () => {
  it("task.createContact prende il lock del cliente", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    await assertCustomerLockedOnWrite()

    const { taskId } = await createTestCaller(operator).task.createContact({
      customerId: customer.id,
      source: "detail",
    })

    expect(await activeTasksOf(customer.id)).toMatchObject([{ id: taskId }])
  })

  it("task.setPriority prende il lock del cliente", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact(operator)
    await assertCustomerLockedOnWrite()

    await createTestCaller(operator).task.setPriority({
      taskId: contact.id,
      priority: "urgent",
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, priority: 120, customPriority: true },
    ])
  })

  it("task.resolveAlert prende il lock del cliente", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact(operator, "richiamare")
    const open = await createAlert({ taskId: contact.id, deadline })
    await assertCustomerLockedOnWrite()

    await createTestCaller(operator).task.resolveAlert({
      alertId: open.id,
      source: "detail",
    })

    expect(await logOf(customer.id)).toMatchObject([
      { action: "alert_resolved", alertId: open.id },
    ])
  })

  it("task.setCallback prende il lock del cliente", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact(operator, "app.to")
    await assertCustomerLockedOnWrite()

    const { alertId } = await createTestCaller(operator).task.setCallback({
      taskId: contact.id,
      deadline: inTwoDays(),
      message: "Richiamare dopo le 18",
      replacesAlertId: null,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, state: "richiamare", alertId },
    ])
  })

  it("task.setCallback con un alert sostituito prende il lock del cliente", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact(operator, "richiamare")
    const replaced = await createAlert({ taskId: contact.id, deadline })
    await assertCustomerLockedOnWrite()

    const { alertId } = await createTestCaller(operator).task.setCallback({
      taskId: contact.id,
      deadline: inTwoDays(),
      message: "Secondo richiamo",
      replacesAlertId: replaced.id,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, alertId },
    ])
    expect(await logOf(customer.id)).toMatchObject([
      { action: "alert_resolved", alertId: replaced.id },
    ])
  })

  it("task.reassign di un admin prende il lock del cliente", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const owner = await createOperator()
    const colleague = await createOperator()
    const { customer, contact } = await seedContact(owner, "app.to")
    await assertCustomerLockedOnWrite()

    await createTestCaller(admin).task.reassign({
      taskId: contact.id,
      operatorId: colleague.id,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, operatorId: colleague.id },
    ])
    expect(await logOf(customer.id)).toHaveLength(2)
  })
})

describe("regola dei lock: l'operatore del cliente", () => {
  it("customer.handover con il contatto che segue prende il lock del cliente", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()
    const { customer, contact } = await seedContact(owner, "app.to")
    await assertCustomerLockedOnWrite()

    await createTestCaller(owner).customer.handover({
      customerId: customer.id,
      toOperatorId: colleague.id,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, operatorId: colleague.id },
    ])
    expect(await logOf(customer.id)).toHaveLength(2)
  })

  it("customer.assignToYourself con il contatto senza operatore, che segue il cliente, prende il lock del cliente", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: null })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: null,
    })
    await assertCustomerLockedOnWrite()

    await createTestCaller(operator).customer.assignToYourself({
      id: customer.id,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, operatorId: operator.id },
    ])
    expect(await logOf(customer.id)).toMatchObject([
      {
        action: "operator_reassign",
        source: "self_assign",
        taskId: null,
        toOperatorId: operator.id,
      },
      {
        action: "operator_reassign",
        source: "self_assign",
        taskId: contact.id,
        fromOperatorId: null,
        toOperatorId: operator.id,
      },
    ])
  })

  it("customer.assignToYourself senza contatto attivo prende il lock del cliente", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: null })
    await assertCustomerLockedOnWrite()

    await createTestCaller(operator).customer.assignToYourself({
      id: customer.id,
    })

    expect(await logOf(customer.id)).toMatchObject([
      { source: "self_assign", taskId: null, toOperatorId: operator.id },
    ])
  })
})

describe("regola dei lock: task.bulkHandleTask", () => {
  const seedBulk = async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const previousOperator = await createOperator()
    const nextOperator = await createOperator()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    return { admin, previousOperator, nextOperator, customer }
  }

  it("caso 1, un cliente senza contatto attivo: prende il lock del cliente", async () => {
    const { admin, nextOperator, customer } = await seedBulk()
    await assertCustomerLockedOnWrite()

    await createTestCaller(admin).task.bulkHandleTask({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
      state: "chiamare",
    })

    expect(await activeTasksOf(customer.id)).toMatchObject([
      { state: "chiamare", operatorId: nextOperator.id },
    ])
  })

  it("caso 2, l'alert aperto confermato: prende il lock del cliente", async () => {
    const { admin, previousOperator, nextOperator, customer } = await seedBulk()
    const previous = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "richiamare",
    })
    const open = await createAlert({ taskId: previous.id, deadline })
    await assertCustomerLockedOnWrite()

    await createTestCaller(admin).task.bulkHandleTask({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
      state: "chiamare",
      resolveAlertCustomerIds: [customer.id],
    })

    const [active] = await activeTasksOf(customer.id)
    expect(active).toMatchObject({ state: "chiamare", alertId: null })
    expect(active!.id).not.toBe(previous.id)
    expect(await logOf(customer.id)).toMatchObject([
      { action: "alert_resolved", alertId: open.id },
      { action: "state_change" },
      { action: "operator_reassign" },
    ])
  })

  it("caso 3, un esito senza alert: prende il lock del cliente", async () => {
    const { admin, previousOperator, nextOperator, customer } = await seedBulk()
    const previous = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "app.to",
    })
    await assertCustomerLockedOnWrite()

    await createTestCaller(admin).task.bulkHandleTask({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
      state: "chiamare",
    })

    const [active] = await activeTasksOf(customer.id)
    expect(active).toMatchObject({
      state: "chiamare",
      operatorId: nextOperator.id,
    })
    expect(active!.id).not.toBe(previous.id)
  })

  it.each(["chiamare", "followup"] as const)(
    "caso 4, un contatto in %s: prende il lock del cliente",
    async (state) => {
      const { admin, previousOperator, nextOperator, customer } =
        await seedBulk()
      const previous = await createTask({
        customerId: customer.id,
        operatorId: previousOperator.id,
        state,
      })
      await assertCustomerLockedOnWrite()

      await createTestCaller(admin).task.bulkHandleTask({
        operatorId: nextOperator.id,
        customerIds: [customer.id],
        state: "chiamare",
      })

      expect(await activeTasksOf(customer.id)).toMatchObject([
        { id: previous.id, state, operatorId: nextOperator.id },
      ])
    }
  )
})

describe("regola dei lock: il cron degli alert (processDueAlerts)", () => {
  const NOW = new Date("2026-09-25T06:00:00.000Z")

  const seedDueAlert = async (due: Date) => {
    await createSystemOperator()
    const operator = await createOperator()
    const { customer, contact } = await seedContact(operator, "richiamare")
    const open = await createAlert({ taskId: contact.id, deadline: due })
    return { customer, open }
  }

  const run = async () => {
    const exit = await runServer(processDueAlerts(NOW, { budgetMs: 60_000 }))
    if (Exit.isFailure(exit)) throw new Error(Cause.pretty(exit.cause))
    return exit.value
  }

  it("un alert che scade oggi crea il followup e prende il lock del cliente", async () => {
    const { customer } = await seedDueAlert(
      new Date("2026-09-25T08:00:00.000Z")
    )
    await assertCustomerLockedOnWrite()

    expect(await run()).toMatchObject({ processed: 1, failed: 0 })

    expect(await activeTasksOf(customer.id)).toMatchObject([
      { state: "followup" },
    ])
  })

  it("un alert di un altro giorno si chiude soltanto e prende il lock del cliente", async () => {
    const { customer, open } = await seedDueAlert(
      new Date("2026-09-20T08:00:00.000Z")
    )
    await assertCustomerLockedOnWrite()

    expect(await run()).toMatchObject({ processed: 1, failed: 0 })

    expect(await logOf(customer.id)).toMatchObject([
      { action: "alert_resolved", alertId: open.id },
    ])
  })
})

// "Assegna Clienti" prende il lock del cliente (T6.8a, A11): una transazione per
// cliente, con il contatto bloccato dopo il cliente
describe("regola dei lock: customer.bulkUpdateCustomers", () => {
  const seedAssign = async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const previousOperator = await createOperator()
    const nextOperator = await createOperator()
    return { admin, previousOperator, nextOperator }
  }

  it("un cliente senza contatto: prende il lock del cliente", async () => {
    const { admin, previousOperator, nextOperator } = await seedAssign()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    await assertCustomerLockedOnWrite()

    await createTestCaller(admin).customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    expect(await logOf(customer.id)).toMatchObject([
      { action: "operator_reassign", source: "bulk", taskId: null },
    ])
  })

  it("un contatto in chiamare: prende il lock del cliente", async () => {
    const { admin, previousOperator, nextOperator } = await seedAssign()
    const { customer, contact } = await seedContact(previousOperator)
    await assertCustomerLockedOnWrite()

    await createTestCaller(admin).customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, operatorId: nextOperator.id },
    ])
  })

  it("un contatto in richiamare con l'alert aperto: prende il lock del cliente", async () => {
    const { admin, previousOperator, nextOperator } = await seedAssign()
    const { customer, contact } = await seedContact(
      previousOperator,
      "richiamare"
    )
    const open = await createAlert({ taskId: contact.id, deadline })
    await assertCustomerLockedOnWrite()

    await createTestCaller(admin).customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      {
        id: contact.id,
        operatorId: nextOperator.id,
        state: "richiamare",
        alertId: open.id,
      },
    ])
  })

  it("cliente e contatto già allineati: passa senza scrivere", async () => {
    const { admin, nextOperator } = await seedAssign()
    const { customer } = await seedContact(nextOperator, "richiamare")
    await assertCustomerLockedOnWrite()

    await createTestCaller(admin).customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    expect(await logOf(customer.id)).toEqual([])
  })
})

// The customer's chat: "Avvia una chat" and deleting a note write the chat of
// one customer, so two operators on it wait for each other. In PGlite the
// transactions never overlap, so only this check sees the lock go missing
describe("regola dei lock: chat del cliente", () => {
  it("con la verifica attiva, aggiungere un operatore alla chat senza lockCustomer fallisce", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const operator = await createOperator()
    const customer = await createCustomer()
    const { id: chatId } = await createTestCaller(
      operator
    ).chat.createNewCustomerChat({ customerId: customer.id })
    const colleague = await createOperator()
    await assertCustomerLockedOnChatWrite()

    const exit = await runServer(
      transaction(
        query((client) =>
          client
            .insert(chatToOperator)
            .values({ chatId, operatorId: colleague.id })
        )
      )
    )

    expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain(
      "lock rule"
    )
  })

  it("'Avvia una chat' prende il lock del cliente", async () => {
    const operator = await createOperator()
    const customer = await createCustomer()
    await assertCustomerLockedOnChatWrite()

    const { id } = await createTestCaller(operator).chat.createNewCustomerChat({
      customerId: customer.id,
    })

    const [after] = await testDb
      .select({ chatId: customers.chatId })
      .from(customers)
      .where(eq(customers.id, customer.id))
    expect(after!.chatId).toBe(id)
  })

  it("eliminare l'ultima nota, che cancella la chat, prende il lock del cliente", async () => {
    const operator = await createOperator()
    const customer = await createCustomer()
    const { id: chatId } = await createTestCaller(
      operator
    ).chat.createNewCustomerChat({ customerId: customer.id })
    const [saved] = await testDb
      .insert(messages)
      .values({ chatId, operatorId: operator.id, content: "Nota" })
      .returning({ id: messages.id })
    await assertCustomerLockedOnChatWrite()

    await createTestCaller(operator).chat.deleteMessage({ id: saved!.id })

    expect(await testDb.select().from(chatToOperator)).toEqual([])
  })

  it("con la verifica attiva, inserire una nota senza lockCustomer fallisce", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const operator = await createOperator()
    const customer = await createCustomer()
    const { id: chatId } = await createTestCaller(
      operator
    ).chat.createNewCustomerChat({ customerId: customer.id })
    await assertCustomerLockedOnChatWrite()

    const exit = await runServer(
      transaction(
        query((client) =>
          client
            .insert(messages)
            .values({ chatId, operatorId: operator.id, content: "Nota" })
        )
      )
    )

    expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain(
      "lock rule"
    )
  })

  it("una nota di un operatore che non è ancora nella chat prende il lock del cliente", async () => {
    const operator = await createOperator()
    const colleague = await createOperator()
    const customer = await createCustomer()
    const { id: chatId } = await createTestCaller(
      operator
    ).chat.createNewCustomerChat({ customerId: customer.id })
    await assertCustomerLockedOnChatWrite()

    await createTestCaller(colleague).chat.insertMessage({
      chatId,
      content: "Nota del collega",
    })

    expect(
      await testDb
        .select({
          operatorId: messages.operatorId,
          content: messages.content,
        })
        .from(messages)
    ).toEqual([{ operatorId: colleague.id, content: "Nota del collega" }])
    expect(
      await testDb
        .select()
        .from(chatToOperator)
        .where(eq(chatToOperator.operatorId, colleague.id))
    ).toEqual([{ chatId, operatorId: colleague.id }])
  })

  it("una nota di chi ha avviato la chat prende il lock del cliente", async () => {
    const operator = await createOperator()
    const customer = await createCustomer()
    const { id: chatId } = await createTestCaller(
      operator
    ).chat.createNewCustomerChat({ customerId: customer.id })
    await assertCustomerLockedOnChatWrite()

    await createTestCaller(operator).chat.insertMessage({
      chatId,
      content: "Nota",
    })

    expect(
      await testDb
        .select({ operatorId: messages.operatorId })
        .from(messages)
        .where(eq(messages.chatId, chatId))
    ).toEqual([{ operatorId: operator.id }])
  })
})

// The deactivation of an operator locks, after the two users, every customer
// it moves or whose active contact it moves, then those contacts (AC11)
describe("regola dei lock: deactivateOperator", () => {
  it("clienti dell'operatore, un cliente senza operatore e uno di un collega con un suo contatto attivo: prende il lock di ogni cliente", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const leaving = await createOperator()
    const target = await createOperator()
    const colleague = await createOperator()
    const { customer: own, contact } = await seedContact(leaving, "richiamare")
    await createAlert({ taskId: contact.id, deadline })
    const bare = await createCustomer({ operatorId: leaving.id })
    const orphan = await createCustomer({ operatorId: null })
    const orphanContact = await createTask({
      customerId: orphan.id,
      operatorId: leaving.id,
    })
    const ofColleague = await createCustomer({ operatorId: colleague.id })
    const colleagueContact = await createTask({
      customerId: ofColleague.id,
      operatorId: leaving.id,
    })
    await assertCustomerLockedOnWrite()

    const exit = await runServer(
      deactivateOperator({
        operatorId: leaving.id,
        toOperatorId: target.id,
        actor: { role: "ADMIN", operatorId: admin.id },
      })
    )

    if (Exit.isFailure(exit)) throw new Error(Cause.pretty(exit.cause))
    expect(exit.value).toEqual({
      customersMoved: 2,
      contactsMoved: 3,
      practicesMoved: 0,
    })
    expect(await tasksOf(own.id)).toMatchObject([
      { id: contact.id, operatorId: target.id },
    ])
    expect(await tasksOf(orphan.id)).toMatchObject([
      { id: orphanContact.id, operatorId: target.id },
    ])
    expect(await tasksOf(ofColleague.id)).toMatchObject([
      { id: colleagueContact.id, operatorId: colleague.id },
    ])
    expect(await logOf(bare.id)).toMatchObject([
      { source: "deactivation", taskId: null, toOperatorId: target.id },
    ])
  })
})

import { TRPCError } from "@trpc/server"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { appRouter } from "../../../root"
import { createTestCaller, rejectionOf } from "@/test/caller"
import { migrateUpTo, resetDb } from "@/test/db"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
  createUser,
} from "@/test/factories"

// Quale middleware protegge ogni procedura del router `task`:
// - operator: sessione e operatore attivo (operatorProcedure);
// - admin: operatore attivo con ruolo ADMIN (adminProcedure).
// Le procedure che un task successivo rimuove restano fuori dalla tabella.

const REMOVED = ["getTaskById", "getTasksToExport"] as const

type Removed = (typeof REMOVED)[number]

type Guard = "operator" | "admin"

type TaskProcedure = Exclude<
  keyof typeof appRouter._def.record.task._def.record,
  Removed
>

type Caller = ReturnType<typeof createTestCaller>

/** Dati creati prima di ogni test, usati come input validi. */
type Fixtures = {
  /** Cliente con un contatto attivo (`taskId`) e un alert aperto */
  customerId: string
  /** Cliente senza contatti attivi, per "Crea contatto" */
  freeCustomerId: string
  taskId: number
  alertId: number
  operatorId: number
}

type ProcedureSpec = {
  guard: Guard
  call: (caller: Caller, fixtures: Fixtures) => Promise<unknown>
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * I dati di un operatore: i suoi clienti, un contatto attivo con un alert
 * aperto e un cliente senza contatti. Le procedure di contatto li leggono
 * come dell'operatore, così il suo tentativo arriva al servizio.
 */
const fixturesOf = async (operatorId: number): Promise<Fixtures> => {
  const customer = await createCustomer({ operatorId })
  const freeCustomer = await createCustomer({ operatorId })
  const contact = await createTask({
    customerId: customer.id,
    operatorId,
    state: "nessuno",
  })
  const alert = await createAlert({
    taskId: contact.id,
    deadline: new Date(Date.now() + 7 * DAY_MS),
    message: "Richiamare",
  })
  return {
    customerId: customer.id,
    freeCustomerId: freeCustomer.id,
    taskId: contact.id,
    alertId: alert.id,
    operatorId,
  }
}

/** Una riga per procedura: la guardia attesa e una chiamata con input valido. */
const PROCEDURES = {
  createContact: {
    guard: "operator",
    call: (c, f) =>
      c.task.createContact({ customerId: f.freeCustomerId, source: "list" }),
  },
  setCallback: {
    guard: "operator",
    call: (c, f) =>
      c.task.setCallback({
        taskId: f.taskId,
        deadline: new Date(Date.now() + 7 * DAY_MS),
        message: null,
        replacesAlertId: f.alertId,
      }),
  },
  changeState: {
    guard: "operator",
    call: (c, f) =>
      c.task.changeState({
        taskId: f.taskId,
        toState: "non interessato",
        source: "list",
        confirmedAlertId: f.alertId,
      }),
  },
  setPriority: {
    guard: "operator",
    call: (c, f) => c.task.setPriority({ taskId: f.taskId, priority: "high" }),
  },
  resolveAlert: {
    guard: "operator",
    call: (c, f) => c.task.resolveAlert({ alertId: f.alertId, source: "list" }),
  },
  getCustomerAlerts: {
    guard: "operator",
    call: (c, f) => c.task.getCustomerAlerts({ id: f.customerId }),
  },
  getActiveTask: {
    guard: "operator",
    call: (c, f) => c.task.getActiveTask({ id: f.customerId }),
  },
  getCustomersWithActiveAlerts: {
    guard: "operator",
    call: (c, f) =>
      c.task.getCustomersWithActiveAlerts({ customerIds: [f.customerId] }),
  },
  getContacts: {
    guard: "operator",
    call: (c) => c.task.getContacts({}),
  },
  getContactById: {
    guard: "operator",
    call: (c, f) => c.task.getContactById({ id: String(f.taskId) }),
  },
  reassign: {
    guard: "admin",
    call: (c, f) =>
      c.task.reassign({ taskId: f.taskId, operatorId: f.operatorId }),
  },
  bulkHandleTask: {
    guard: "admin",
    call: (c, f) =>
      c.task.bulkHandleTask({ operatorId: f.operatorId, customerIds: [] }),
  },
} satisfies Record<TaskProcedure, ProcedureSpec>

const names = Object.keys(PROCEDURES) as TaskProcedure[]
const operatorNames = names.filter(
  (name) => PROCEDURES[name].guard === "operator"
)
const adminNames = names.filter((name) => PROCEDURES[name].guard === "admin")

/** Le chiavi del router, senza le procedure rimosse. */
const routerKeys = () => {
  const removed: readonly string[] = REMOVED
  return Object.keys(appRouter._def.record.task._def.record)
    .filter((key) => !removed.includes(key))
    .sort()
}

let fixtures: Fixtures

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  const target = await createOperator()
  fixtures = await fixturesOf(target.id)
})

describe("task: guardia di ogni procedura", () => {
  it("la tabella copre esattamente le procedure del router task", () => {
    expect([...names].sort()).toEqual(routerKeys())
  })

  describe("utente senza operatore", () => {
    it.each(names)(
      "%s rifiuta con BAD_REQUEST: non è un operatore",
      async (name) => {
        const caller = createTestCaller(await createUser())
        const error = await rejectionOf(PROCEDURES[name].call(caller, fixtures))
        expect(error).toBeInstanceOf(TRPCError)
        expect(error).toMatchObject({
          code: "BAD_REQUEST",
          message: "BAD_REQUEST",
        })
      }
    )
  })

  describe("operatore disattivato", () => {
    it.each(names)(
      "%s rifiuta con UNAUTHORIZED: utente disattivato",
      async (name) => {
        const caller = createTestCaller(
          await createOperator({ disabledAt: new Date() })
        )
        const error = await rejectionOf(PROCEDURES[name].call(caller, fixtures))
        expect(error).toBeInstanceOf(TRPCError)
        expect(error).toMatchObject({
          code: "UNAUTHORIZED",
          message: "Utente disattivato",
        })
      }
    )
  })

  describe("operatore attivo non admin", () => {
    it.each(operatorNames)("%s passa con un operatore attivo", async (name) => {
      const operator = await createOperator({ role: "OPERATORE" })
      const caller = createTestCaller(operator)
      // Un rifiuto farebbe fallire il test
      await PROCEDURES[name].call(caller, await fixturesOf(operator.id))
    })

    it.each(adminNames)(
      "%s rifiuta con FORBIDDEN: admin-only",
      async (name) => {
        const caller = createTestCaller(
          await createOperator({ role: "OPERATORE" })
        )
        const error = await rejectionOf(PROCEDURES[name].call(caller, fixtures))
        expect(error).toBeInstanceOf(TRPCError)
        expect(error).toMatchObject({
          code: "FORBIDDEN",
          message: "admin-only",
        })
      }
    )
  })
})

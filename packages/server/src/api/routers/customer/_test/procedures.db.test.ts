import { TRPCError } from "@trpc/server"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { appRouter } from "../../../root"
import { createTestCaller, rejectionOf } from "@/test/caller"
import { migrateUpTo, resetDb } from "@/test/db"
import {
  createCustomer,
  createOperator,
  createPractice,
  createUser,
} from "@/test/factories"

// Quale middleware protegge ogni procedura del router `customer`:
// - protected: basta la sessione (protectedProcedure), anche senza operatore;
// - operator: sessione e operatore attivo (operatorProcedure);
// - admin: operatore attivo con ruolo ADMIN (adminProcedure).

type Guard = "protected" | "operator" | "admin"

type CustomerProcedure = keyof typeof appRouter._def.record.customer._def.record

type Caller = ReturnType<typeof createTestCaller>

/** Dati creati prima di ogni test, usati come input validi. */
type Fixtures = {
  customerId: string
  praticaId: string
  operatorId: number
}

type ProcedureSpec = {
  guard: Guard
  call: (caller: Caller, fixtures: Fixtures) => Promise<unknown>
}

let sequence = 0
/** Un id nuovo per i clienti inseriti dai test. */
const freshId = () => `customer-guard-${++sequence}`

/** Una riga per procedura: la guardia attesa e una chiamata con input valido. */
const PROCEDURES = {
  getCustomerById: {
    guard: "protected",
    call: (c, f) => c.customer.getCustomerById({ id: f.customerId }),
  },
  getCustomersByFiscalCodeOrVatCode: {
    guard: "protected",
    call: (c) =>
      c.customer.getCustomersByFiscalCodeOrVatCode({
        fiscalCode: "RSSMRA80A01H501U",
      }),
  },
  getAllPraticaByCustomer: {
    guard: "protected",
    call: (c, f) => c.customer.getAllPraticaByCustomer({ id: f.customerId }),
  },
  getAllCustomerForPratica: {
    guard: "protected",
    call: (c, f) => c.customer.getAllCustomerForPratica({ id: f.praticaId }),
  },
  getAllFileName: {
    guard: "protected",
    call: (c) => c.customer.getAllFileName("customers"),
  },
  getCustomerUnderReview: {
    guard: "protected",
    call: (c) => c.customer.getCustomerUnderReview(),
  },
  insertCustomer: {
    guard: "protected",
    call: (c) => {
      const id = freshId()
      return c.customer.insertCustomer({
        id,
        name: "Anna",
        surname: id,
        tempID: id,
        uniqueHash: id,
        source: "inbound",
      })
    },
  },
  getAllCustomers: {
    guard: "operator",
    call: (c) => c.customer.getAllCustomers({ page: 1, perPage: 10 }),
  },
  getAllAvailableComune: {
    guard: "operator",
    call: (c) => c.customer.getAllAvailableComune(),
  },
  getAllAvaliableSede: {
    guard: "operator",
    call: (c) => c.customer.getAllAvaliableSede(),
  },
  getAllAvailableAmbito: {
    guard: "operator",
    call: (c) => c.customer.getAllAvailableAmbito(),
  },
  getAllAvailableJobs: {
    guard: "operator",
    call: (c) => c.customer.getAllAvailableJobs(),
  },
  updateCustomerFromDashboard: {
    guard: "operator",
    call: (c, f) =>
      c.customer.updateCustomerFromDashboard({
        id: f.customerId,
        name: "Anna",
        surname: "Rossi",
        source: "inbound",
      }),
  },
  handover: {
    guard: "operator",
    call: (c, f) =>
      c.customer.handover({
        customerId: f.customerId,
        toOperatorId: f.operatorId,
      }),
  },
  handleCustomerBlackList: {
    guard: "operator",
    call: (c, f) =>
      c.customer.handleCustomerBlackList({
        id: f.customerId,
        blackListStatus: "whitelisted",
      }),
  },
  assignToYourself: {
    guard: "operator",
    call: (c, f) => c.customer.assignToYourself({ id: f.customerId }),
  },
  updateLastEdit: {
    guard: "operator",
    call: (c, f) => c.customer.updateLastEdit({ id: f.customerId }),
  },
  bulkUpdateCustomers: {
    guard: "admin",
    call: (c, f) =>
      c.customer.bulkUpdateCustomers({
        operatorId: f.operatorId,
        customerIds: [f.customerId],
      }),
  },
} satisfies Record<CustomerProcedure, ProcedureSpec>

const names = Object.keys(PROCEDURES) as CustomerProcedure[]

/** I nomi delle procedure protette dalla guardia `guard`. */
const namesWith = (guard: Guard) =>
  names.filter((name) => PROCEDURES[name].guard === guard)

/** Le guardie che richiedono un operatore: operatorProcedure e adminProcedure. */
const operatorNames = names.filter(
  (name) => PROCEDURES[name].guard !== "protected"
)

let fixtures: Fixtures

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  const customer = await createCustomer()
  const pratica = await createPractice({ customerId: customer.id })
  const target = await createOperator()
  fixtures = {
    customerId: customer.id,
    praticaId: pratica.praticaId,
    operatorId: target.id,
  }
})

describe("customer: guardia di ogni procedura", () => {
  it("la tabella copre esattamente le procedure del router customer", () => {
    expect([...names].sort()).toEqual(
      Object.keys(appRouter._def.record.customer._def.record).sort()
    )
  })

  describe("utente senza operatore", () => {
    it.each(namesWith("protected"))(
      "%s risponde: la sola sessione basta",
      async (name) => {
        const caller = createTestCaller(await createUser())
        await expect(
          PROCEDURES[name].call(caller, fixtures)
        ).resolves.toBeDefined()
      }
    )

    it.each(operatorNames)(
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
    it.each(namesWith("protected"))(
      "%s risponde: la sola sessione basta",
      async (name) => {
        const caller = createTestCaller(
          await createOperator({ disabledAt: new Date() })
        )
        await expect(
          PROCEDURES[name].call(caller, fixtures)
        ).resolves.toBeDefined()
      }
    )

    it.each(operatorNames)(
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

  describe("operatore non admin", () => {
    it("bulkUpdateCustomers rifiuta con FORBIDDEN: admin-only", async () => {
      const caller = createTestCaller(
        await createOperator({ role: "OPERATORE" })
      )
      const error = await rejectionOf(
        PROCEDURES.bulkUpdateCustomers.call(caller, fixtures)
      )
      expect(error).toBeInstanceOf(TRPCError)
      expect(error).toMatchObject({
        code: "FORBIDDEN",
        message: "admin-only",
      })
    })
  })

  it("un utente senza operatore che chiama `customer.updateLastEdit` riceve `BAD_REQUEST`, mentre `customer.getCustomerById` gli risponde", async () => {
    const caller = createTestCaller(await createUser())

    const error = await rejectionOf(
      caller.customer.updateLastEdit({ id: fixtures.customerId })
    )
    expect(error).toMatchObject({ code: "BAD_REQUEST" })

    await expect(
      caller.customer.getCustomerById({ id: fixtures.customerId })
    ).resolves.toMatchObject({ id: fixtures.customerId })
  })
})

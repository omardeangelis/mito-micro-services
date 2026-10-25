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

// Quale middleware protegge ogni procedura del router `pratiche`:
// - protected: sessione valida, anche senza operatore (protectedProcedure);
// - operator: sessione e operatore attivo (operatorProcedure);
// - admin: operatore attivo con ruolo ADMIN (adminProcedure).
// Le procedure che un task successivo rimuove restano fuori dalla tabella.

const REMOVED = [
  "getPraticaByPraticaId",
  "updatePratica",
  "updateLastEdit",
] as const

type Removed = (typeof REMOVED)[number]

type Guard = "protected" | "operator" | "admin"

type PraticheProcedure = Exclude<
  keyof typeof appRouter._def.record.pratiche._def.record,
  Removed
>

type Caller = ReturnType<typeof createTestCaller>

/** Dati creati prima di ogni test, usati come input validi. */
type Fixtures = {
  customerId: string
  praticaId: string
  praticaRowId: number
  operatorId: number
}

type ProcedureSpec = {
  guard: Guard
  call: (caller: Caller, fixtures: Fixtures) => Promise<unknown>
}

let sequence = 0
/** Un id nuovo per le pratiche inserite dai test. */
const freshId = (prefix: string) => `${prefix}-guard-${++sequence}`

/** Una riga per procedura: la guardia attesa e una chiamata con input valido. */
const PROCEDURES = {
  getPraticaById: {
    guard: "protected",
    call: (c, f) => c.pratiche.getPraticaById({ id: f.praticaId }),
  },
  insertPratica: {
    guard: "protected",
    call: (c) =>
      c.pratiche.insertPratica({
        praticaId: freshId("pratica"),
        importoFinanziato: "10000",
        importoErogato: "10000",
        rateTotali: 60,
        importoRata: "200",
        ratePagate: 0,
        dataLiquidazione: new Date("2026-01-15T00:00:00.000Z"),
        state: "Liquidata",
      }),
  },
  connectPraticaAndCustomer: {
    guard: "protected",
    call: async (c, f) => {
      // Un cliente nuovo: la coppia cliente-pratica non esiste ancora
      const customer = await createCustomer()
      return c.pratiche.connectPraticaAndCustomer({
        customerId: customer.id,
        praticaId: f.praticaId,
        customerRole: "Intestatario",
      })
    },
  },
  getAllPratiche: {
    guard: "operator",
    call: (c) => c.pratiche.getAllPratiche({ page: 1, perPage: 10 }),
  },
  getAllAvailableRegion: {
    guard: "operator",
    call: (c) => c.pratiche.getAllAvailableRegion(),
  },
  updatePraticaFromDashboard: {
    guard: "operator",
    call: (c, f) =>
      c.pratiche.updatePraticaFromDashboard({
        id: f.praticaRowId,
        state: "Liquidata",
      }),
  },
  updateCustomerPreview: {
    guard: "operator",
    call: (c, f) =>
      c.pratiche.updateCustomerPreview({
        id: f.customerId,
        email: "anna@test.local",
        phoneNumber: "3331234567",
      }),
  },
  bulkAssignPractices: {
    guard: "operator",
    call: (c, f) =>
      c.pratiche.bulkAssignPractices({
        operatorId: f.operatorId,
        practiceIds: [f.praticaId],
      }),
  },
} satisfies Record<PraticheProcedure, ProcedureSpec>

const names = Object.keys(PROCEDURES) as PraticheProcedure[]
const protectedNames = names.filter(
  (name) => PROCEDURES[name].guard === "protected"
)
const guardedNames = names.filter(
  (name) => PROCEDURES[name].guard !== "protected"
)
const operatorNames = names.filter(
  (name) => PROCEDURES[name].guard === "operator"
)

/** Le chiavi del router, senza le procedure rimosse. */
const routerKeys = () => {
  const removed: readonly string[] = REMOVED
  return Object.keys(appRouter._def.record.pratiche._def.record)
    .filter((key) => !removed.includes(key))
    .sort()
}

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
    praticaRowId: pratica.id,
    operatorId: target.id,
  }
})

describe("pratiche: guardia di ogni procedura", () => {
  it("la tabella copre esattamente le procedure del router pratiche", () => {
    expect([...names].sort()).toEqual(routerKeys())
  })

  describe("utente senza operatore", () => {
    it.each(guardedNames)(
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

    it.each(protectedNames)(
      "%s passa: la sessione basta, senza operatore",
      async (name) => {
        const caller = createTestCaller(await createUser())
        // Un rifiuto farebbe fallire il test
        await PROCEDURES[name].call(caller, fixtures)
      }
    )
  })

  describe("operatore disattivato", () => {
    it.each(guardedNames)(
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

    it.each(protectedNames)(
      "%s passa: la sessione basta, anche disattivato",
      async (name) => {
        const caller = createTestCaller(
          await createOperator({ disabledAt: new Date() })
        )
        // Un rifiuto farebbe fallire il test
        await PROCEDURES[name].call(caller, fixtures)
      }
    )
  })

  describe("operatore attivo", () => {
    it.each(operatorNames)("%s passa con un operatore attivo", async (name) => {
      const caller = createTestCaller(
        await createOperator({ role: "OPERATORE" })
      )
      // Un rifiuto farebbe fallire il test
      await PROCEDURES[name].call(caller, fixtures)
    })
  })
})

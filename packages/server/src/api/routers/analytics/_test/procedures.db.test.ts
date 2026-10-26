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

// Quale middleware protegge ogni procedura del router `analitycs`:
// - session: solo la sessione (protectedProcedure), senza riga operatore;
// - operator: sessione e operatore attivo (operatorProcedure).
// Le procedure senza chiamanti, che un task successivo rimuove, restano fuori
// dalla tabella.

const REMOVED = [
  "getPraticheLiquidate",
  "getAllNewPraticheOfLastMonth",
  "getAllImportoRatePageteOfLastMonth",
] as const

type Removed = (typeof REMOVED)[number]

type Guard = "session" | "operator"

type AnalyticsProcedure = Exclude<
  keyof typeof appRouter._def.record.analitycs._def.record,
  Removed
>

type Caller = ReturnType<typeof createTestCaller>

type ProcedureSpec = {
  guard: Guard
  call: (caller: Caller) => Promise<unknown>
}

/** Una riga per procedura: la guardia attesa e una chiamata con input valido. */
const PROCEDURES = {
  getFinanziatoMedioPerOperatore: {
    guard: "session",
    call: (c) =>
      c.analitycs.getFinanziatoMedioPerOperatore({ timeFrame: "30d" }),
  },
  getAmountPerSedeInLastMonth: {
    guard: "session",
    call: (c) => c.analitycs.getAmountPerSedeInLastMonth({ timeFrame: "30d" }),
  },
  getAllDoneTasksInLastMonth: {
    guard: "operator",
    call: (c) => c.analitycs.getAllDoneTasksInLastMonth(),
  },
  getFinanziatoTotalePerOperatore: {
    guard: "operator",
    call: (c) =>
      c.analitycs.getFinanziatoTotalePerOperatore({ timeFrame: "30d" }),
  },
  getFinaziatoMedioPerCliente: {
    guard: "operator",
    call: (c) => c.analitycs.getFinaziatoMedioPerCliente({ timeFrame: "30d" }),
  },
} satisfies Record<AnalyticsProcedure, ProcedureSpec>

const names = Object.keys(PROCEDURES) as AnalyticsProcedure[]
const sessionNames = names.filter(
  (name) => PROCEDURES[name].guard === "session"
)
const operatorNames = names.filter(
  (name) => PROCEDURES[name].guard === "operator"
)

/** Le chiavi del router, senza le procedure rimosse. */
const routerKeys = () => {
  const removed: readonly string[] = REMOVED
  return Object.keys(appRouter._def.record.analitycs._def.record)
    .filter((key) => !removed.includes(key))
    .sort()
}

const DAY_MS = 24 * 60 * 60 * 1000

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("analitycs: guardia di ogni procedura", () => {
  it("la tabella copre esattamente le procedure del router analitycs", () => {
    expect([...names].sort()).toEqual(routerKeys())
  })

  describe("utente senza operatore", () => {
    it.each(operatorNames)(
      "un utente senza operatore riceve `BAD_REQUEST` da %s",
      async (name) => {
        const caller = createTestCaller(await createUser())
        const error = await rejectionOf(PROCEDURES[name].call(caller))
        expect(error).toBeInstanceOf(TRPCError)
        expect(error).toMatchObject({
          code: "BAD_REQUEST",
          message: "BAD_REQUEST",
        })
      }
    )

    it.each(sessionNames)(
      "%s passa con un utente senza operatore",
      async (name) => {
        const caller = createTestCaller(await createUser())
        // Un rifiuto farebbe fallire il test
        await PROCEDURES[name].call(caller)
      }
    )
  })

  describe("operatore disattivato", () => {
    it.each(operatorNames)(
      "un operatore disattivato riceve `UNAUTHORIZED` da %s",
      async (name) => {
        const caller = createTestCaller(
          await createOperator({ disabledAt: new Date() })
        )
        const error = await rejectionOf(PROCEDURES[name].call(caller))
        expect(error).toBeInstanceOf(TRPCError)
        expect(error).toMatchObject({
          code: "UNAUTHORIZED",
          message: "Utente disattivato",
        })
      }
    )

    it.each(sessionNames)(
      "%s passa con un operatore disattivato",
      async (name) => {
        const caller = createTestCaller(
          await createOperator({ disabledAt: new Date() })
        )
        await PROCEDURES[name].call(caller)
      }
    )
  })

  describe("operatore attivo", () => {
    it.each(names)("%s passa con un operatore attivo", async (name) => {
      const caller = createTestCaller(
        await createOperator({ role: "OPERATORE" })
      )
      await PROCEDURES[name].call(caller)
    })
  })

  // Le due procedure su protectedProcedure non filtrano per operatore: un
  // OPERATORE legge i numeri di tutto il CRM, anche di clienti di un altro
  describe("OPERATORE: numeri di tutto il CRM", () => {
    /** Una pratica da 1000 a Roma, liquidata 15 giorni fa, di un cliente dell'operatore B. */
    const seedPraticaOfOtherOperator = async () => {
      const other = await createOperator({ name: "Luigi" })
      const customer = await createCustomer({ operatorId: other.id })
      await createPractice({
        customerId: customer.id,
        importoFinanziato: "1000",
        desPuntoVendita: "Roma",
        dataLiquidazione: new Date(Date.now() - 15 * DAY_MS),
      })
    }

    it("getFinanziatoMedioPerOperatore legge la pratica di un cliente di un altro operatore", async () => {
      await seedPraticaOfOtherOperator()
      const caller = createTestCaller(
        await createOperator({ role: "OPERATORE" })
      )

      await expect(
        caller.analitycs.getFinanziatoMedioPerOperatore({ timeFrame: "30d" })
      ).resolves.toEqual({ reference: "1000.0000000000000000", comparison: 0 })
    })

    it("getAmountPerSedeInLastMonth legge la pratica di un cliente di un altro operatore", async () => {
      await seedPraticaOfOtherOperator()
      const caller = createTestCaller(
        await createOperator({ role: "OPERATORE" })
      )

      await expect(
        caller.analitycs.getAmountPerSedeInLastMonth({ timeFrame: "30d" })
      ).resolves.toEqual([{ data: "Roma", total: 1000 }])
    })
  })
})

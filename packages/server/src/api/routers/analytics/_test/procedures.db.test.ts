import { TRPCError } from "@trpc/server"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { appRouter } from "../../../root"
import { createTestCaller, rejectionOf } from "@/test/caller"
import { migrateUpTo, resetDb } from "@/test/db"
import { createOperator, createUser } from "@/test/factories"

// Quale middleware protegge ogni procedura del router `analytics` (AC19):
// - operator: sessione e operatore attivo (operatorProcedure);
// - admin: operatore attivo con ruolo ADMIN (adminProcedure).
// Nessuna procedura resta su protectedProcedure. La tabella controlla solo
// l'esito, risposta o errore: i numeri, e chi vede che cosa, stanno nei test
// dei dati.

type Guard = "operator" | "admin"

type AnalyticsProcedure =
  keyof typeof appRouter._def.record.analytics._def.record

type Caller = ReturnType<typeof createTestCaller>

type ProcedureSpec = {
  guard: Guard
  call: (caller: Caller) => Promise<unknown>
}

/** Una riga per procedura: la guardia attesa e una chiamata con input valido. */
const PROCEDURES = {
  getFinancedTotal: {
    guard: "operator",
    call: (c) => c.analytics.getFinancedTotal({ timeFrame: "30d" }),
  },
  getFinancedAverage: {
    guard: "operator",
    call: (c) => c.analytics.getFinancedAverage({ timeFrame: "30d" }),
  },
  getFinancedByBranch: {
    guard: "admin",
    call: (c) => c.analytics.getFinancedByBranch({ timeFrame: "30d" }),
  },
  getContactProgress: {
    guard: "operator",
    call: (c) => c.analytics.getContactProgress(),
  },
} satisfies Record<AnalyticsProcedure, ProcedureSpec>

const names = Object.keys(PROCEDURES) as AnalyticsProcedure[]
const operatorNames = names.filter(
  (name) => PROCEDURES[name].guard === "operator"
)
const adminNames = names.filter((name) => PROCEDURES[name].guard === "admin")

const expectRejection = async (
  call: Promise<unknown>,
  expected: { code: string; message: string }
) => {
  const error = await rejectionOf(call)
  expect(error).toBeInstanceOf(TRPCError)
  expect(error).toMatchObject(expected)
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("analytics: guardia di ogni procedura", () => {
  it("la tabella copre esattamente le procedure del router analytics", () => {
    expect([...names].sort()).toEqual(
      Object.keys(appRouter._def.record.analytics._def.record).sort()
    )
  })

  describe("utente senza operatore", () => {
    it.each(names)(
      "un utente senza operatore riceve `BAD_REQUEST` da %s",
      async (name) => {
        const caller = createTestCaller(await createUser())
        await expectRejection(PROCEDURES[name].call(caller), {
          code: "BAD_REQUEST",
          message: "BAD_REQUEST",
        })
      }
    )

    // TD11: anche un admin senza riga operatore, come oggi per "Chiamate
    // completate"
    it.each(names)(
      "un ADMIN senza riga operatore riceve `BAD_REQUEST` da %s",
      async (name) => {
        const caller = createTestCaller(await createUser({ role: "ADMIN" }))
        await expectRejection(PROCEDURES[name].call(caller), {
          code: "BAD_REQUEST",
          message: "BAD_REQUEST",
        })
      }
    )
  })

  describe("operatore disattivato", () => {
    it.each(names)(
      "un OPERATORE disattivato riceve `UNAUTHORIZED` da %s",
      async (name) => {
        const caller = createTestCaller(
          await createOperator({ role: "OPERATORE", disabledAt: new Date() })
        )
        await expectRejection(PROCEDURES[name].call(caller), {
          code: "UNAUTHORIZED",
          message: "Utente disattivato",
        })
      }
    )

    it.each(names)(
      "un ADMIN disattivato riceve `UNAUTHORIZED` da %s",
      async (name) => {
        const caller = createTestCaller(
          await createOperator({ role: "ADMIN", disabledAt: new Date() })
        )
        await expectRejection(PROCEDURES[name].call(caller), {
          code: "UNAUTHORIZED",
          message: "Utente disattivato",
        })
      }
    )
  })

  describe("OPERATORE attivo", () => {
    it.each(operatorNames)(
      "%s risponde a un OPERATORE attivo",
      async (name) => {
        const caller = createTestCaller(
          await createOperator({ role: "OPERATORE" })
        )
        // Un rifiuto farebbe fallire il test
        await PROCEDURES[name].call(caller)
      }
    )

    it.each(adminNames)(
      "un `OPERATORE` riceve `FORBIDDEN` con il messaggio `admin-only` da `analytics.%s`",
      async (name) => {
        const caller = createTestCaller(
          await createOperator({ role: "OPERATORE" })
        )
        await expectRejection(PROCEDURES[name].call(caller), {
          code: "FORBIDDEN",
          message: "admin-only",
        })
      }
    )
  })

  describe("ADMIN attivo", () => {
    it.each(names)("%s risponde a un ADMIN attivo", async (name) => {
      const caller = createTestCaller(await createOperator({ role: "ADMIN" }))
      await PROCEDURES[name].call(caller)
    })
  })
})

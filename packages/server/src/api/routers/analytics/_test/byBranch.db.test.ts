import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@mito/db"
import { practices, stateEnum } from "@mito/db/schema/pratiche"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb } from "@/test/db"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"

// `analitycs.getAmountPerSedeInLastMonth` com'è oggi: una riga per punto
// vendita delle pratiche liquidate nella finestra di riferimento (`timeFrame`,
// 30 giorni di default), in ordine di nome con `null` per ultimo, con le
// pratiche senza clienti contate e ogni stato incluso. Il periodo precedente
// resta fuori: ogni test vi lascia una pratica di Milano che non deve contare.

const DAY = 86_400_000

type TimeFrame = "30d" | "90d" | "365d"

const CASES: {
  name: string
  input: { timeFrame?: TimeFrame }
  timeFrame: TimeFrame
  days: number
}[] = [
  { name: "input {}", input: {}, timeFrame: "30d", days: 30 },
  {
    name: 'input { timeFrame: "30d" }',
    input: { timeFrame: "30d" },
    timeFrame: "30d",
    days: 30,
  },
  {
    name: 'input { timeFrame: "90d" }',
    input: { timeFrame: "90d" },
    timeFrame: "90d",
    days: 90,
  },
  {
    name: 'input { timeFrame: "365d" }',
    input: { timeFrame: "365d" },
    timeFrame: "365d",
    days: 365,
  },
]

let sequence = 0
const freshId = (prefix: string) => `${prefix}-sede-${++sequence}`

/** Un istante `days` giorni prima di adesso. */
const daysAgo = (days: number) => new Date(Date.now() - days * DAY)

/** Una pratica senza clienti, con le colonne che `createPractice` valorizza di default. */
const praticaSenzaClienti = async (
  values: Partial<typeof practices.$inferInsert>
) => {
  await db.insert(practices).values({
    praticaId: freshId("pratica"),
    importoFinanziato: "10000",
    importoErogato: "10000",
    rateTotali: 60,
    importoRata: "200",
    ratePagate: 0,
    dataLiquidazione: new Date("2026-01-15T00:00:00.000Z"),
    state: "Liquidata",
    ...values,
  })
}

/** Una pratica di un cliente nuovo, che appartiene a `operatorId` se è dato. */
const praticaDi = async (
  values: Partial<typeof practices.$inferInsert>,
  operatorId?: number
) => {
  const customer = await createCustomer(
    operatorId === undefined ? {} : { operatorId }
  )
  return createPractice({ customerId: customer.id, ...values })
}

/**
 * Le pratiche della finestra di riferimento, in quest'ordine (Roma, il `null`,
 * Milano: non è alfabetico, quindi l'ordine lo deve dare la query), più una
 * pratica di Milano nel periodo precedente.
 */
const seedRiferimento = async (days: number, operatorId?: number) => {
  const dentro = daysAgo(days / 2)
  await praticaDi(
    {
      desPuntoVendita: "Roma",
      importoFinanziato: "1000",
      dataLiquidazione: dentro,
    },
    operatorId
  )
  await praticaDi(
    {
      desPuntoVendita: null,
      importoFinanziato: "2000",
      dataLiquidazione: dentro,
    },
    operatorId
  )
  await praticaDi(
    {
      desPuntoVendita: "Milano",
      importoFinanziato: "4000",
      dataLiquidazione: dentro,
    },
    operatorId
  )
  await praticaDi(
    {
      desPuntoVendita: "Milano",
      importoFinanziato: "8000",
      dataLiquidazione: daysAgo(days * 1.5),
    },
    operatorId
  )
}

/** La risposta di `seedRiferimento`, con `null` per ultimo. */
const ATTESO = [
  { data: "Milano", total: 4000 },
  { data: "Roma", total: 1000 },
  { data: null, total: 2000 },
]

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("analitycs.getAmountPerSedeInLastMonth: pratiche per punto vendita", () => {
  describe.each(CASES)("$name", (c) => {
    it(`con \`${c.timeFrame}\`: una riga per punto vendita nel periodo, in ordine di nome, con \`null\` per ultimo`, async () => {
      await seedRiferimento(c.days)
      const caller = createTestCaller(await createOperator({ role: "ADMIN" }))

      expect(
        await caller.analitycs.getAmountPerSedeInLastMonth(c.input)
      ).toEqual(ATTESO)
    })

    it(`con \`${c.timeFrame}\`, la pratica senza clienti nella finestra conta nel totale del suo punto vendita`, async () => {
      await seedRiferimento(c.days)
      await praticaSenzaClienti({
        desPuntoVendita: "Roma",
        importoFinanziato: "500",
        dataLiquidazione: daysAgo(c.days / 2),
      })
      const caller = createTestCaller(await createOperator({ role: "ADMIN" }))

      expect(
        await caller.analitycs.getAmountPerSedeInLastMonth(c.input)
      ).toEqual([
        { data: "Milano", total: 4000 },
        { data: "Roma", total: 1500 },
        { data: null, total: 2000 },
      ])
    })

    it(`con \`${c.timeFrame}\`, le pratiche di ogni stato nella finestra contano, \`Rifiutata\` compresa`, async () => {
      await seedRiferimento(c.days)
      // Napoli: una pratica per stato, con importi potenze di 2 (100, 200, 400…)
      for (const [i, state] of stateEnum.entries()) {
        await praticaDi({
          desPuntoVendita: "Napoli",
          importoFinanziato: String(100 * 2 ** i),
          state,
          dataLiquidazione: daysAgo(c.days / 2),
        })
      }
      const caller = createTestCaller(await createOperator({ role: "ADMIN" }))

      expect(
        await caller.analitycs.getAmountPerSedeInLastMonth(c.input)
      ).toEqual([
        { data: "Milano", total: 4000 },
        { data: "Napoli", total: 6300 },
        { data: "Roma", total: 1000 },
        { data: null, total: 2000 },
      ])
    })

    it(`con \`${c.timeFrame}\`, ADMIN e OPERATORE ricevono la stessa risposta, anche se le pratiche sono di clienti di un altro operatore`, async () => {
      const proprietario = await createOperator({ role: "OPERATORE" })
      await seedRiferimento(c.days, proprietario.id)
      const admin = await createOperator({ role: "ADMIN" })
      const operatore = await createOperator({ role: "OPERATORE" })

      expect(
        await createTestCaller(admin).analitycs.getAmountPerSedeInLastMonth(
          c.input
        )
      ).toEqual(ATTESO)
      expect(
        await createTestCaller(operatore).analitycs.getAmountPerSedeInLastMonth(
          c.input
        )
      ).toEqual(ATTESO)
    })
  })
})

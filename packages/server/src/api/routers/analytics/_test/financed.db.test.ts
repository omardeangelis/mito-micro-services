import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@mito/db"
import {
  customerRoleEnum,
  customerToPratica,
} from "@mito/db/schema/relations/customerToPratica"
import { type TimeFrame } from "@mito/domain/constants/timeframes"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb } from "@/test/db"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"

// Le due procedure sugli importi finanziati del router `analytics`:
// `getFinancedTotal` e `getFinancedAverage`, entrambe con le pratiche
// finanziate (Liquidata, Chiusa, Estinta anticipata) con almeno un cliente che
// il chiamante vede, ognuna una volta. Ognuna legge due finestre: `reference` (gli ultimi N giorni) e `comparison`
// (i N giorni prima). Ogni caso crea le pratiche in entrambe le finestre, con
// importi diversi, e controlla le due risposte insieme.
//
// Gli importi sono potenze di 2 per 1000: ogni somma dice esattamente quali
// pratiche sono state contate. Le date sono relative all'orologio del test e
// stanno ad almeno un giorno dai bordi delle finestre.
//
// Ogni importo è un `number`, anche la media (7000 / 3, per esempio); senza
// pratiche nella finestra il totale e la media sono 0. La risposta porta anche
// `windows`, le finestre su cui il server ha contato: i test degli importi
// guardano solo `reference` e `comparison`, quelli di "forma della risposta"
// anche le finestre.

const DAY = 86_400_000

type TimeFrameInput = { timeFrame?: TimeFrame }

const TIME_FRAMES: { label: string; input: TimeFrameInput; days: number }[] = [
  { label: "`{}` (30d di default)", input: {}, days: 30 },
  { label: "`30d`", input: { timeFrame: "30d" }, days: 30 },
  { label: "`90d`", input: { timeFrame: "90d" }, days: 90 },
  { label: "`365d`", input: { timeFrame: "365d" }, days: 365 },
]

type Caller = ReturnType<typeof createTestCaller>
type Practice = Parameters<typeof createPractice>[0]
type PracticeValues = Omit<Practice, "customerId">
type State = NonNullable<Practice["state"]>

/**
 * Le date delle pratiche per una finestra di `days` giorni: nella finestra di
 * riferimento, in quella di confronto, prima di entrambe e nel futuro.
 */
function datesFor(days: number) {
  const now = Date.now()
  return {
    reference: new Date(now - Math.floor(days / 2) * DAY),
    comparison: new Date(now - Math.ceil(days * 1.5) * DAY),
    tooOld: new Date(now - Math.ceil(days * 2.5) * DAY),
    future: new Date(now + 2 * DAY),
  }
}

/**
 * Una pratica che collega i clienti `customerIds`, in ordine Intestatario,
 * Coobbligato, Garante (`createPractice` collega solo l'Intestatario).
 */
async function createPracticeOf(
  customerIds: [string, ...string[]],
  values: PracticeValues
) {
  const [intestatario, ...others] = customerIds
  const practice = await createPractice({ ...values, customerId: intestatario })
  if (others.length > 0) {
    await db.insert(customerToPratica).values(
      others.map((customerId, index) => ({
        customerId,
        praticaId: practice.praticaId,
        customerRole: customerRoleEnum[index + 1],
      }))
    )
  }
  return practice
}

/** L'id di un cliente nuovo dell'operatore, o senza operatore con `null`. */
const customerOf = async (operatorId: number | null) =>
  (await createCustomer({ operatorId })).id

/** Gli importi di una risposta, senza le finestre su cui il server ha contato. */
const amountsOf = ({
  reference,
  comparison,
}: {
  reference: number
  comparison: number
}) => ({ reference, comparison })

/** Le due risposte per lo stesso input, da confrontare insieme. */
async function readAll(caller: Caller, input: TimeFrameInput) {
  return {
    totale: amountsOf(await caller.analytics.getFinancedTotal(input)),
    media: amountsOf(await caller.analytics.getFinancedAverage(input)),
  }
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("pratica con tre clienti", () => {
  it("con `30d`, una pratica con Intestatario, Coobbligato e Garante dello stesso operatore somma il suo importo una volta in `getFinancedTotal`", async () => {
    const when = datesFor(30)
    const operator = await createOperator({ role: "OPERATORE" })
    const triple: [string, string, string] = [
      await customerOf(operator.id),
      await customerOf(operator.id),
      await customerOf(operator.id),
    ]
    await createPracticeOf(triple, {
      importoFinanziato: "1000",
      dataLiquidazione: when.reference,
    })
    await createPracticeOf(triple, {
      importoFinanziato: "4000",
      dataLiquidazione: when.comparison,
    })

    const res = await createTestCaller(operator).analytics.getFinancedTotal({
      timeFrame: "30d",
    })

    expect(res).toMatchObject({ reference: 1000, comparison: 4000 })
  })
})

describe.each(TIME_FRAMES)("con $label", ({ input, days }) => {
  it("una pratica con tre clienti dello stesso operatore conta una volta: il totale la somma una volta e nella media vale una pratica (S2)", async () => {
    const when = datesFor(days)
    const operator = await createOperator({ role: "OPERATORE" })
    const triple: [string, string, string] = [
      await customerOf(operator.id),
      await customerOf(operator.id),
      await customerOf(operator.id),
    ]
    const single = await customerOf(operator.id)
    // reference: 1000 + 2000; comparison: 4000 + 8000
    await createPracticeOf(triple, {
      importoFinanziato: "1000",
      dataLiquidazione: when.reference,
    })
    await createPracticeOf([single], {
      importoFinanziato: "2000",
      dataLiquidazione: when.reference,
    })
    await createPracticeOf(triple, {
      importoFinanziato: "4000",
      dataLiquidazione: when.comparison,
    })
    await createPracticeOf([single], {
      importoFinanziato: "8000",
      dataLiquidazione: when.comparison,
    })

    const res = await readAll(createTestCaller(operator), input)

    // medie su 2 pratiche: (1000 + 2000) / 2 e (4000 + 8000) / 2
    expect(res).toEqual({
      totale: { reference: 3000, comparison: 12000 },
      media: {
        reference: 1500,
        comparison: 6000,
      },
    })
  })

  it("le pratiche con soli clienti senza operatore non contano", async () => {
    const when = datesFor(days)
    const operator = await createOperator({ role: "OPERATORE" })
    const admin = await createOperator({ role: "ADMIN" })
    const assigned = await customerOf(operator.id)
    const withoutOperator = await customerOf(null)
    const alsoWithoutOperator = await customerOf(null)
    await createPracticeOf([assigned], {
      importoFinanziato: "1000",
      dataLiquidazione: when.reference,
    })
    await createPracticeOf([assigned], {
      importoFinanziato: "2000",
      dataLiquidazione: when.reference,
    })
    await createPracticeOf([withoutOperator, alsoWithoutOperator], {
      importoFinanziato: "16000",
      dataLiquidazione: when.reference,
    })
    await createPracticeOf([assigned], {
      importoFinanziato: "4000",
      dataLiquidazione: when.comparison,
    })
    await createPracticeOf([assigned], {
      importoFinanziato: "8000",
      dataLiquidazione: when.comparison,
    })
    await createPracticeOf([withoutOperator, alsoWithoutOperator], {
      importoFinanziato: "32000",
      dataLiquidazione: when.comparison,
    })

    const res = await readAll(createTestCaller(admin), input)

    expect(res).toEqual({
      totale: { reference: 3000, comparison: 12000 },
      media: {
        reference: 1500,
        comparison: 6000,
      },
    })
  })

  it("contano solo le pratiche finanziate: Liquidata, Chiusa ed Estinta anticipata, in entrambe le finestre (S9)", async () => {
    const when = datesFor(days)
    const operator = await createOperator({ role: "OPERATORE" })
    const customer = await customerOf(operator.id)
    const states: State[] = [
      "Liquidata",
      "Rifiutata",
      "Chiusa",
      "Estinta anticipata",
      "Rinunciata",
      "Stornata",
    ]
    // reference: da 1000 a 32000; comparison: da 64000 a 2048000
    const referenceAmounts = ["1000", "2000", "4000", "8000", "16000", "32000"]
    const comparisonAmounts = [
      "64000",
      "128000",
      "256000",
      "512000",
      "1024000",
      "2048000",
    ]
    for (const [index, state] of states.entries()) {
      await createPracticeOf([customer], {
        state,
        importoFinanziato: referenceAmounts[index]!,
        dataLiquidazione: when.reference,
      })
      await createPracticeOf([customer], {
        state,
        importoFinanziato: comparisonAmounts[index]!,
        dataLiquidazione: when.comparison,
      })
    }

    const res = await readAll(createTestCaller(operator), input)

    // Liquidata, Chiusa ed Estinta anticipata: 1000 + 4000 + 8000 e
    // 64000 + 256000 + 512000, su 3 pratiche; Rifiutata, Rinunciata e
    // Stornata non contano
    expect(res).toEqual({
      totale: { reference: 13000, comparison: 832000 },
      media: {
        reference: 13000 / 3,
        comparison: 832000 / 3,
      },
    })
  })

  it("le pratiche fuori da entrambe le finestre non contano", async () => {
    const when = datesFor(days)
    const operator = await createOperator({ role: "OPERATORE" })
    const customer = await customerOf(operator.id)
    const amounts: [Date, string][] = [
      [when.reference, "1000"],
      [when.reference, "2000"],
      [when.comparison, "4000"],
      [when.comparison, "8000"],
      // prima della finestra di confronto e nel futuro
      [when.tooOld, "16000"],
      [when.future, "32000"],
    ]
    for (const [dataLiquidazione, importoFinanziato] of amounts) {
      await createPracticeOf([customer], {
        importoFinanziato,
        dataLiquidazione,
      })
    }

    const res = await readAll(createTestCaller(operator), input)

    expect(res).toEqual({
      totale: { reference: 3000, comparison: 12000 },
      media: {
        reference: 1500,
        comparison: 6000,
      },
    })
  })

  describe("chi vede che cosa", () => {
    /**
     * Due operatori con un cliente ciascuno (A ha due pratiche per
     * finestra, B una) e un cliente senza operatore; un ADMIN senza clienti.
     */
    async function seedTwoOperators() {
      const when = datesFor(days)
      const operatorA = await createOperator({ role: "OPERATORE" })
      const operatorB = await createOperator({ role: "OPERATORE" })
      const admin = await createOperator({ role: "ADMIN" })
      const customerA = await customerOf(operatorA.id)
      const customerB = await customerOf(operatorB.id)
      const customerWithout = await customerOf(null)
      const practices: [string, string, Date][] = [
        // reference
        [customerA, "1000", when.reference],
        [customerA, "2000", when.reference],
        [customerB, "4000", when.reference],
        [customerWithout, "8000", when.reference],
        // comparison
        [customerA, "16000", when.comparison],
        [customerA, "32000", when.comparison],
        [customerB, "64000", when.comparison],
        [customerWithout, "128000", when.comparison],
      ]
      for (const [customer, importoFinanziato, dataLiquidazione] of practices) {
        await createPracticeOf([customer], {
          importoFinanziato,
          dataLiquidazione,
        })
      }
      return { operatorA, operatorB, admin }
    }

    // La media dell'ADMIN: tutta la CRM, escluso il cliente senza operatore
    const WHOLE_CRM_AVERAGE = {
      reference: 7000 / 3,
      comparison: 112000 / 3,
    }

    it("un OPERATORE vede solo le pratiche dei suoi clienti, anche nella media di `getFinancedAverage`", async () => {
      const { operatorA, operatorB } = await seedTwoOperators()

      expect(await readAll(createTestCaller(operatorA), input)).toEqual({
        totale: { reference: 3000, comparison: 48000 },
        media: {
          reference: 1500,
          comparison: 24000,
        },
      })
      expect(await readAll(createTestCaller(operatorB), input)).toEqual({
        totale: { reference: 4000, comparison: 64000 },
        media: {
          reference: 4000,
          comparison: 64000,
        },
      })
    })

    it("un ADMIN vede le pratiche di tutti i clienti con un operatore", async () => {
      const { admin } = await seedTwoOperators()

      expect(await readAll(createTestCaller(admin), input)).toEqual({
        totale: { reference: 7000, comparison: 112000 },
        media: WHOLE_CRM_AVERAGE,
      })
    })
  })

  describe("forma della risposta (S6)", () => {
    it("senza pratiche nelle finestre, `reference` e `comparison` di totale e media sono 0", async () => {
      const operator = await createOperator({ role: "OPERATORE" })
      const admin = await createOperator({ role: "ADMIN" })
      const empty = {
        totale: { reference: 0, comparison: 0 },
        media: { reference: 0, comparison: 0 },
      }

      expect(await readAll(createTestCaller(operator), input)).toEqual(empty)
      expect(await readAll(createTestCaller(admin), input)).toEqual(empty)
    })

    it("con pratiche solo nella finestra di riferimento, gli importi sono numeri e `comparison` è 0", async () => {
      const when = datesFor(days)
      const operator = await createOperator({ role: "OPERATORE" })
      const customer = await customerOf(operator.id)
      await createPracticeOf([customer], {
        importoFinanziato: "1000",
        dataLiquidazione: when.reference,
      })

      expect(await readAll(createTestCaller(operator), input)).toEqual({
        totale: { reference: 1000, comparison: 0 },
        media: { reference: 1000, comparison: 0 },
      })
    })

    it("con pratiche solo nella finestra di confronto, gli importi sono numeri e `reference` è 0", async () => {
      const when = datesFor(days)
      const operator = await createOperator({ role: "OPERATORE" })
      const customer = await customerOf(operator.id)
      await createPracticeOf([customer], {
        importoFinanziato: "2000",
        dataLiquidazione: when.comparison,
      })

      expect(await readAll(createTestCaller(operator), input)).toEqual({
        totale: { reference: 0, comparison: 2000 },
        media: { reference: 0, comparison: 2000 },
      })
    })

    it("`getFinancedTotal` e `getFinancedAverage` portano le finestre su cui hanno contato: due `Date` per finestra, il confronto che finisce dove comincia il riferimento", async () => {
      const operator = await createOperator({ role: "OPERATORE" })
      const caller = createTestCaller(operator)

      for (const res of [
        await caller.analytics.getFinancedTotal(input),
        await caller.analytics.getFinancedAverage(input),
      ]) {
        const { reference, comparison } = res.windows
        expect(reference.start).toBeInstanceOf(Date)
        expect(reference.end).toBeInstanceOf(Date)
        expect(comparison.start).toBeInstanceOf(Date)
        expect(comparison.end).toBeInstanceOf(Date)
        expect(comparison.end).toEqual(reference.start)
        expect(reference.end.getTime() - reference.start.getTime()).toBe(
          days * DAY
        )
        expect(comparison.end.getTime() - comparison.start.getTime()).toBe(
          days * DAY
        )
      }
    })
  })
})

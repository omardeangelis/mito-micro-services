import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@mito/db"
import { practices, stateEnum } from "@mito/db/schema/pratiche"
import {
  customerRoleEnum,
  customerToPratica,
} from "@mito/db/schema/relations/customerToPratica"
import { type Actor } from "@mito/domain/contact/permissions"
import { migrateUpTo, resetDb } from "@/test/db"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"
import { actorOf } from "../../contact/actor"
import { financedAverage, financedByBranch, financedTotal } from "../financed"
import { at, DAY, T } from "./clock"

// Quali pratiche contano negli importi (AC12–AC14), con il Clock fermo a `T`
// e `30d`:
// - una pratica conta una volta, anche con tre clienti;
// - un OPERATORE vede le pratiche con almeno un cliente suo, un ADMIN quelle
//   con almeno un cliente assegnato a un operatore;
// - contano solo le pratiche finanziate: Liquidata, Chiusa, Estinta
//   anticipata.
// Ogni fixture c'è nel riferimento e nel confronto, con importi diversi
// (potenze di 2), e ogni caso controlla tutti e due i numeri.

const REFERENCE = new Date(T - 15 * DAY)
const COMPARISON = new Date(T - 45 * DAY)

type Values = Partial<typeof practices.$inferInsert>

let sequence = 0

/** Una pratica dei clienti dati, in ordine Intestatario, Coobbligato, Garante. */
async function practiceOf(customerIds: string[], values: Values) {
  const [first, ...others] = customerIds
  if (!first) {
    // Una pratica senza clienti
    await db.insert(practices).values({
      praticaId: `pratica-senza-clienti-${++sequence}`,
      importoFinanziato: "10000",
      importoErogato: "10000",
      rateTotali: 60,
      importoRata: "200",
      ratePagate: 0,
      dataLiquidazione: REFERENCE,
      state: "Liquidata",
      ...values,
    })
    return
  }
  const practice = await createPractice({ ...values, customerId: first })
  if (others.length > 0) {
    await db.insert(customerToPratica).values(
      others.map((customerId, index) => ({
        customerId,
        praticaId: practice.praticaId,
        customerRole: customerRoleEnum[index + 1],
      }))
    )
  }
}

/** La stessa pratica nel riferimento e nel confronto, con importi diversi. */
async function inBothWindows(
  customerIds: string[],
  [reference, comparison]: [number, number],
  values: Values = {}
) {
  await practiceOf(customerIds, {
    ...values,
    importoFinanziato: String(reference),
    dataLiquidazione: REFERENCE,
  })
  await practiceOf(customerIds, {
    ...values,
    importoFinanziato: String(comparison),
    dataLiquidazione: COMPARISON,
  })
}

const customerOf = async (operatorId: number | null) =>
  (await createCustomer({ operatorId })).id

/** Il totale e la media di `actor`, senza le finestre. */
async function amountsOf(actor: Actor) {
  const total = await at(T, financedTotal({ timeFrame: "30d", actor }))
  const average = await at(T, financedAverage({ timeFrame: "30d", actor }))
  return {
    total: { reference: total.reference, comparison: total.comparison },
    average: { reference: average.reference, comparison: average.comparison },
  }
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("una pratica conta una volta (AC12)", () => {
  it("una pratica con Intestatario, Coobbligato e Garante dello stesso operatore somma il suo importo una volta nel totale, e vale una pratica nella media", async () => {
    const operator = await createOperator({ role: "OPERATORE" })
    const three = [
      await customerOf(operator.id),
      await customerOf(operator.id),
      await customerOf(operator.id),
    ]
    await inBothWindows(three, [1000, 4000])
    await inBothWindows([await customerOf(operator.id)], [2000, 8000])

    expect(await amountsOf(actorOf(operator))).toEqual({
      total: { reference: 3000, comparison: 12000 },
      average: { reference: 1500, comparison: 6000 },
    })
  })
})

describe("quali pratiche vede il chiamante (AC13)", () => {
  it("una pratica con clienti di due operatori conta una volta per ciascuno dei due, e una volta per l'admin", async () => {
    const operatorA = await createOperator({ role: "OPERATORE" })
    const operatorB = await createOperator({ role: "OPERATORE" })
    const admin = await createOperator({ role: "ADMIN" })
    const customerA = await customerOf(operatorA.id)
    const customerB = await customerOf(operatorB.id)
    await inBothWindows([customerA, customerB], [1000, 2000])
    await inBothWindows([await customerOf(operatorA.id)], [4000, 8000])
    await inBothWindows([await customerOf(operatorB.id)], [16000, 32000])

    expect(await amountsOf(actorOf(operatorA))).toEqual({
      total: { reference: 5000, comparison: 10000 },
      average: { reference: 2500, comparison: 5000 },
    })
    expect(await amountsOf(actorOf(operatorB))).toEqual({
      total: { reference: 17000, comparison: 34000 },
      average: { reference: 8500, comparison: 17000 },
    })
    expect(await amountsOf(actorOf(admin))).toEqual({
      total: { reference: 21000, comparison: 42000 },
      average: { reference: 7000, comparison: 14000 },
    })
  })

  it("una pratica con soli clienti senza operatore resta fuori per l'admin e per l'operatore", async () => {
    const operator = await createOperator({ role: "OPERATORE" })
    const admin = await createOperator({ role: "ADMIN" })
    await inBothWindows([await customerOf(operator.id)], [1000, 2000])
    await inBothWindows(
      [await customerOf(null), await customerOf(null)],
      [4000, 8000]
    )

    const onlyAssigned = {
      total: { reference: 1000, comparison: 2000 },
      average: { reference: 1000, comparison: 2000 },
    }
    expect(await amountsOf(actorOf(operator))).toEqual(onlyAssigned)
    expect(await amountsOf(actorOf(admin))).toEqual(onlyAssigned)
  })
})

describe("contano solo le pratiche finanziate (AC14)", () => {
  // Una pratica per stato, con l'importo 1000 · 2^i nel riferimento e
  // 64 000 · 2^i nel confronto: Liquidata (i = 0), Chiusa (2) ed Estinta
  // anticipata (3) danno 13 000 e 832 000
  const seedStates = async (customerId: string) => {
    for (const [i, state] of stateEnum.entries()) {
      await inBothWindows([customerId], [1000 * 2 ** i, 64000 * 2 ** i], {
        state,
        desPuntoVendita: "Roma",
      })
    }
  }

  it("nel totale e nella media contano `Liquidata`, `Chiusa` ed `Estinta anticipata`; `Rifiutata`, `Rinunciata` e `Stornata` non cambiano il risultato", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const operator = await createOperator({ role: "OPERATORE" })
    await seedStates(await customerOf(operator.id))

    expect(await amountsOf(actorOf(admin))).toEqual({
      total: { reference: 13000, comparison: 832000 },
      average: { reference: 13000 / 3, comparison: 832000 / 3 },
    })
  })

  it("nella ciambella contano `Liquidata`, `Chiusa` ed `Estinta anticipata`; `Rifiutata`, `Rinunciata` e `Stornata` non cambiano il risultato", async () => {
    const operator = await createOperator({ role: "OPERATORE" })
    await seedStates(await customerOf(operator.id))

    expect(await at(T, financedByBranch({ timeFrame: "30d" }))).toEqual([
      { data: "Roma", total: 13000 },
    ])
  })
})

describe("la ciambella non segue i clienti", () => {
  it("conta anche le pratiche senza clienti, e quelle con soli clienti senza operatore, ognuna una volta", async () => {
    const operator = await createOperator({ role: "OPERATORE" })
    await practiceOf([], {
      desPuntoVendita: "Roma",
      importoFinanziato: "1000",
    })
    await practiceOf([await customerOf(null)], {
      desPuntoVendita: "Roma",
      importoFinanziato: "2000",
      dataLiquidazione: REFERENCE,
    })
    await practiceOf(
      [
        await customerOf(operator.id),
        await customerOf(operator.id),
        await customerOf(operator.id),
      ],
      {
        desPuntoVendita: null,
        importoFinanziato: "4000",
        dataLiquidazione: REFERENCE,
      }
    )

    expect(await at(T, financedByBranch({ timeFrame: "30d" }))).toEqual([
      { data: "Roma", total: 3000 },
      { data: null, total: 4000 },
    ])
  })
})

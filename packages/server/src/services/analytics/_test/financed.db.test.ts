import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { type ServerServices } from "@mito/server/effect/server"
import { provideServer } from "@/test/effect"
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
import { DAY, T } from "./clock"

/** The program with the `Clock` stopped at `millis`: the `TestClock` of `it.effect`. */
const at = <A, E>(
  millis: number,
  program: Effect.Effect<A, E, ServerServices>
) => TestClock.setTime(millis).pipe(Effect.andThen(program), provideServer)

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
const amountsOf = (actor: Actor) =>
  Effect.gen(function* () {
    const total = yield* at(T, financedTotal({ timeFrame: "30d", actor }))
    const average = yield* at(T, financedAverage({ timeFrame: "30d", actor }))
    return {
      total: { reference: total.reference, comparison: total.comparison },
      average: { reference: average.reference, comparison: average.comparison },
    }
  })

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("una pratica conta una volta (AC12)", () => {
  it.effect(
    "una pratica con Intestatario, Coobbligato e Garante dello stesso operatore somma il suo importo una volta nel totale, e vale una pratica nella media",
    () =>
      Effect.gen(function* () {
        const operator = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        const three = [
          yield* Effect.promise(() => customerOf(operator.id)),
          yield* Effect.promise(() => customerOf(operator.id)),
          yield* Effect.promise(() => customerOf(operator.id)),
        ]
        yield* Effect.promise(() => inBothWindows(three, [1000, 4000]))
        const value1 = yield* Effect.promise(() => customerOf(operator.id))
        yield* Effect.promise(() => inBothWindows([value1], [2000, 8000]))

        expect(yield* amountsOf(actorOf(operator))).toEqual({
          total: { reference: 3000, comparison: 12000 },
          average: { reference: 1500, comparison: 6000 },
        })
      })
  )
})

describe("due pratiche con lo stesso importo (AC12)", () => {
  it.effect(
    "contano tutte e due, nel totale e nella media: una pratica una volta, non un importo una volta",
    () =>
      Effect.gen(function* () {
        const operator = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        const three = [
          yield* Effect.promise(() => customerOf(operator.id)),
          yield* Effect.promise(() => customerOf(operator.id)),
          yield* Effect.promise(() => customerOf(operator.id)),
        ]
        yield* Effect.promise(() => inBothWindows(three, [1000, 2000]))
        const value3 = yield* Effect.promise(() => customerOf(operator.id))
        yield* Effect.promise(() => inBothWindows([value3], [1000, 2000]))
        const value5 = yield* Effect.promise(() => customerOf(operator.id))
        yield* Effect.promise(() => inBothWindows([value5], [4000, 8000]))

        expect(yield* amountsOf(actorOf(operator))).toEqual({
          total: { reference: 6000, comparison: 12000 },
          average: { reference: 2000, comparison: 4000 },
        })
      })
  )

  it.effect("contano tutte e due nella ciambella", () =>
    Effect.gen(function* () {
      const operator = yield* Effect.promise(() =>
        createOperator({ role: "OPERATORE" })
      )
      for (const amount of [1000, 1000, 4000]) {
        const value7 = yield* Effect.promise(() => customerOf(operator.id))
        yield* Effect.promise(() =>
          practiceOf([value7], {
            desPuntoVendita: "Roma",
            importoFinanziato: String(amount),
            dataLiquidazione: REFERENCE,
          })
        )
      }

      expect(yield* at(T, financedByBranch({ timeFrame: "30d" }))).toEqual([
        { data: "Roma", total: 6000 },
      ])
    })
  )
})

describe("quali pratiche vede il chiamante (AC13)", () => {
  it.effect(
    "una pratica con clienti di due operatori conta una volta per ciascuno dei due, e una volta per l'admin",
    () =>
      Effect.gen(function* () {
        const operatorA = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        const operatorB = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const customerA = yield* Effect.promise(() => customerOf(operatorA.id))
        const customerB = yield* Effect.promise(() => customerOf(operatorB.id))
        yield* Effect.promise(() =>
          inBothWindows([customerA, customerB], [1000, 2000])
        )
        const value9 = yield* Effect.promise(() => customerOf(operatorA.id))
        yield* Effect.promise(() => inBothWindows([value9], [4000, 8000]))
        const value11 = yield* Effect.promise(() => customerOf(operatorB.id))
        yield* Effect.promise(() => inBothWindows([value11], [16000, 32000]))

        expect(yield* amountsOf(actorOf(operatorA))).toEqual({
          total: { reference: 5000, comparison: 10000 },
          average: { reference: 2500, comparison: 5000 },
        })
        expect(yield* amountsOf(actorOf(operatorB))).toEqual({
          total: { reference: 17000, comparison: 34000 },
          average: { reference: 8500, comparison: 17000 },
        })
        expect(yield* amountsOf(actorOf(admin))).toEqual({
          total: { reference: 21000, comparison: 42000 },
          average: { reference: 7000, comparison: 14000 },
        })
      })
  )

  it.effect(
    "una pratica con soli clienti senza operatore resta fuori per l'admin e per l'operatore",
    () =>
      Effect.gen(function* () {
        const operator = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const value13 = yield* Effect.promise(() => customerOf(operator.id))
        yield* Effect.promise(() => inBothWindows([value13], [1000, 2000]))
        const value15 = yield* Effect.promise(() => customerOf(null))
        const value16 = yield* Effect.promise(() => customerOf(null))
        yield* Effect.promise(() =>
          inBothWindows([value15, value16], [4000, 8000])
        )

        const onlyAssigned = {
          total: { reference: 1000, comparison: 2000 },
          average: { reference: 1000, comparison: 2000 },
        }
        expect(yield* amountsOf(actorOf(operator))).toEqual(onlyAssigned)
        expect(yield* amountsOf(actorOf(admin))).toEqual(onlyAssigned)
      })
  )
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

  it.effect(
    "nel totale e nella media contano `Liquidata`, `Chiusa` ed `Estinta anticipata`; `Rifiutata`, `Rinunciata` e `Stornata` non cambiano il risultato",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const operator = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        const value18 = yield* Effect.promise(() => customerOf(operator.id))
        yield* Effect.promise(() => seedStates(value18))

        expect(yield* amountsOf(actorOf(admin))).toEqual({
          total: { reference: 13000, comparison: 832000 },
          average: { reference: 13000 / 3, comparison: 832000 / 3 },
        })
      })
  )

  it.effect(
    "nella ciambella contano `Liquidata`, `Chiusa` ed `Estinta anticipata`; `Rifiutata`, `Rinunciata` e `Stornata` non cambiano il risultato",
    () =>
      Effect.gen(function* () {
        const operator = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        const value20 = yield* Effect.promise(() => customerOf(operator.id))
        yield* Effect.promise(() => seedStates(value20))

        expect(yield* at(T, financedByBranch({ timeFrame: "30d" }))).toEqual([
          { data: "Roma", total: 13000 },
        ])
      })
  )
})

describe("la ciambella non segue i clienti", () => {
  it.effect(
    "conta anche le pratiche senza clienti, e quelle con soli clienti senza operatore, ognuna una volta",
    () =>
      Effect.gen(function* () {
        const operator = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        yield* Effect.promise(() =>
          practiceOf([], {
            desPuntoVendita: "Roma",
            importoFinanziato: "1000",
          })
        )
        const value22 = yield* Effect.promise(() => customerOf(null))
        yield* Effect.promise(() =>
          practiceOf([value22], {
            desPuntoVendita: "Roma",
            importoFinanziato: "2000",
            dataLiquidazione: REFERENCE,
          })
        )
        const value24 = yield* Effect.promise(() => customerOf(operator.id))
        const value25 = yield* Effect.promise(() => customerOf(operator.id))
        const value26 = yield* Effect.promise(() => customerOf(operator.id))
        yield* Effect.promise(() =>
          practiceOf([value24, value25, value26], {
            desPuntoVendita: null,
            importoFinanziato: "4000",
            dataLiquidazione: REFERENCE,
          })
        )

        expect(yield* at(T, financedByBranch({ timeFrame: "30d" }))).toEqual([
          { data: "Roma", total: 3000 },
          { data: null, total: 4000 },
        ])
      })
  )
})

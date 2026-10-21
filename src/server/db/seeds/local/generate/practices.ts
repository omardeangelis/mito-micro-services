// Products and practices of the local seed (AC13, AC14 and the `update`
// scenarios U1-U7, U11). Pure and seeded: the result depends only on the
// number of practices, `n` and `day`.
//
// `update` selects a practice when its due date, `data_liquidazione` (Rome
// day) + `rate_pagate` x 30 days, is D, and updates it only if the last import
// is older than 30 days. A generic practice is never selected: only the
// scenario rows are.
import { DAYS_PER_RATE } from "@mito/domain/constants/practice"
import { productMap } from "@mito/domain/constants/productMap"
import { stateEnum } from "@mito/db/schema/index"
import { addDays, romeNoon, subMonthsDay } from "../day"
import { importRates } from "../importRates"
import type { Day, PracticeRow, ProductRow } from "../types"
import { SEED_FILE_NAME } from "./customers"
import { createFaker, createRandom, range } from "./random"
import { practiceScenarioCounts, type PracticeScenarioKind } from "./scenarios"

type State = (typeof stateEnum)[number]

const PRODUCT_ID_START = 1000
const PRACTICE_ID_START = 1000
const TOTAL_RATES = [12, 18, 24, 36, 48, 60]
const GENERIC_TOTAL_RATES = [12, 18, 24, 30, 36, 48, 60, 72, 84, 96, 120]
const REGIONS = [
  "Lombardia",
  "Lazio",
  "Veneto",
  "Campania",
  "Piemonte",
  "Puglia",
]
const PAYMENT_METHODS = ["SDD", "Bollettino", "Bonifico", "Trattenuta"]
const OTHER_STATES = stateEnum.filter((s) => s !== "Liquidata")

const pad = (value: number, length: number) =>
  String(value).padStart(length, "0")
const euros = (amount: number) => amount.toFixed(2)

export function generateProducts(day: Day): ProductRow[] {
  const at = romeNoon(addDays(day, -365))
  return Array.from(productMap.entries()).map(([code, [label, type]], i) => ({
    id: PRODUCT_ID_START + i,
    productCode: code,
    productLabel: label,
    productType: type,
    createdAt: at,
    updatedAt: at,
  }))
}

/** What a practice is made of, before it becomes a row. */
type Spec = {
  state: State
  liqDay: Day
  rateTotali: number
  ratePagate: number
  importoRata: number
  debitoResiduo: string | null
  lastImportDay: Day
}

export function generatePractices({
  n,
  practiceCount,
  day,
}: {
  n: number
  practiceCount: number
  day: Day
}): PracticeRow[] {
  const rng = createRandom("practices")
  const faker = createFaker("practices")
  const productCodes = rng.shuffle(Array.from(productMap.keys()))

  // Which practices are scenarios, in which order: a shuffled prefix
  const counts = practiceScenarioCounts(n)
  const queue: Array<{ kind: PracticeScenarioKind; state?: State }> = [
    ...range(counts.U1).map(() => ({ kind: "U1" as const })),
    ...range(counts.U2).map(() => ({ kind: "U2" as const })),
    ...range(counts.U3).map(() => ({ kind: "U3" as const })),
    ...range(counts.U4).map(() => ({ kind: "U4" as const })),
    ...OTHER_STATES.flatMap((state) =>
      range(counts.U5PerState).map(() => ({ kind: "U5" as const, state }))
    ),
    ...range(counts.U6).map(() => ({ kind: "U6" as const })),
    ...range(counts.U7a).map(() => ({ kind: "U7a" as const })),
    ...range(counts.U7b).map(() => ({ kind: "U7b" as const })),
    ...range(counts.U11).map(() => ({ kind: "U11" as const })),
  ]
  if (queue.length > practiceCount) {
    throw new Error("Troppi scenari di pratiche per il numero di pratiche")
  }
  const scenarioAt = new Map<number, (typeof queue)[number]>()
  rng
    .shuffle(range(practiceCount))
    .slice(0, queue.length)
    .forEach((practiceIndex, position) => {
      scenarioAt.set(practiceIndex, queue[position]!)
    })

  const oldImport = () => addDays(day, -rng.int(32, 92))

  /** A scenario practice: exempt from `importRates`, but coherent. */
  const scenario = (kind: PracticeScenarioKind, forced?: State): Spec => {
    const rateTotali = rng.pick(TOTAL_RATES)
    const importoRata = rng.int(60, 700)
    const remaining = (paid: number) => euros((rateTotali - paid) * importoRata)
    // due on D: liquidation = D - paid x 30 days
    const dueOnD = (paid: number) => addDays(day, -paid * DAYS_PER_RATE)
    const base = {
      state: "Liquidata" as State,
      rateTotali,
      importoRata,
      lastImportDay: oldImport(),
    }
    switch (kind) {
      case "U1": {
        const paid = rng.int(1, rateTotali - 2)
        return {
          ...base,
          liqDay: dueOnD(paid),
          ratePagate: paid,
          debitoResiduo: remaining(paid),
        }
      }
      case "U2": {
        const paid = rateTotali - 1
        return {
          ...base,
          liqDay: dueOnD(paid),
          ratePagate: paid,
          debitoResiduo: remaining(paid),
        }
      }
      case "U3": {
        const paid = rng.int(1, rateTotali - 2)
        return {
          ...base,
          liqDay: dueOnD(paid),
          ratePagate: paid,
          debitoResiduo: remaining(paid),
          lastImportDay: addDays(day, -rng.int(1, 28)),
        }
      }
      case "U4":
        return {
          ...base,
          liqDay: dueOnD(rateTotali),
          ratePagate: rateTotali,
          debitoResiduo: euros(importoRata),
        }
      case "U5": {
        const paid = rng.int(1, rateTotali - 1)
        return {
          ...base,
          state: forced ?? "Rifiutata",
          liqDay: dueOnD(paid),
          ratePagate: paid,
          debitoResiduo: remaining(paid),
        }
      }
      case "U6": {
        const paid = rng.int(1, rateTotali - 1)
        return {
          ...base,
          liqDay: dueOnD(paid),
          ratePagate: paid,
          debitoResiduo: null,
        }
      }
      case "U7a":
      case "U7b": {
        const paid = rng.int(1, rateTotali - 1)
        const liqDay = addDays(dueOnD(paid), kind === "U7a" ? -1 : 1)
        return {
          ...base,
          liqDay,
          ratePagate: paid,
          debitoResiduo: remaining(paid),
        }
      }
      case "U11": {
        const paid = rng.int(1, rateTotali - 1)
        return {
          ...base,
          liqDay: day,
          ratePagate: paid,
          debitoResiduo: remaining(paid),
        }
      }
    }
  }

  /** An ordinary practice: what the import would compute for D, never due on D. */
  const generic = (): Spec => {
    const rateTotali = rng.pick(GENERIC_TOTAL_RATES)
    const importoRata = rng.int(60, 700)
    // never less than 2 months before D
    let liqDay = addDays(subMonthsDay(day, 2), -rng.int(0, 1100))
    let rates = importRates(romeNoon(liqDay), rateTotali, importoRata, day)
    // a due date on D would make `update` select it (it can happen when the
    // paid rates are capped at the total): shift the liquidation a day back
    while (addDays(liqDay, rates.ratePagate * DAYS_PER_RATE) === day) {
      liqDay = addDays(liqDay, -1)
      rates = importRates(romeNoon(liqDay), rateTotali, importoRata, day)
    }
    const drawn = rng.weighted<State>([
      ["Liquidata", 70],
      ["Chiusa", 8],
      ["Estinta anticipata", 6],
      ["Rifiutata", 6],
      ["Rinunciata", 5],
      ["Stornata", 5],
    ])
    // all rates paid: the import closes the practice
    const state: State =
      drawn === "Liquidata" && rates.ratePagate === rateTotali
        ? "Chiusa"
        : drawn
    return {
      state,
      liqDay,
      rateTotali,
      ratePagate: rates.ratePagate,
      importoRata,
      debitoResiduo: rates.debitoResiduo,
      lastImportDay: oldImport(),
    }
  }

  return range(practiceCount).map((i) => {
    const planned = scenarioAt.get(i)
    const spec = planned ? scenario(planned.kind, planned.state) : generic()
    const financed = spec.rateTotali * spec.importoRata
    const lastImportUpdate = romeNoon(spec.lastImportDay)
    const dueDay = addDays(spec.liqDay, spec.ratePagate * DAYS_PER_RATE)
    return {
      id: PRACTICE_ID_START + i,
      praticaId: `P${pad(i + 1, 8)}`,
      region: rng.pick(REGIONS),
      desPuntoVendita: `Punto vendita ${faker.location.city()}`,
      desConvenzionato: faker.company.name(),
      subagente: faker.person.fullName(),
      importoFinanziato: euros(financed),
      importoErogato: euros(Math.round(financed * 0.97)),
      rateTotali: spec.rateTotali,
      importoRata: euros(spec.importoRata),
      ratePagate: spec.ratePagate,
      debitoResiduo: spec.debitoResiduo,
      dataLiquidazione: romeNoon(spec.liqDay),
      dataEstinzione:
        spec.state === "Estinta anticipata"
          ? romeNoon(dueDay < day ? dueDay : day)
          : null,
      importoRichiesto: euros(financed),
      paymentMethod: rng.pick(PAYMENT_METHODS),
      tassoPratica: euros(rng.int(300, 1200) / 100),
      state: spec.state,
      // the first two fix both values, whatever the draw
      isWave: i === 0 ? true : i === 1 ? false : rng.chance(0.25),
      fileName: SEED_FILE_NAME,
      createdAt: romeNoon(spec.liqDay),
      updatedAt: lastImportUpdate,
      lastImportUpdate,
      // every product at least once, then at random
      productId:
        i < productCodes.length ? productCodes[i]! : rng.pick(productCodes),
      operatorId: null,
      chatId: null,
    }
  })
}

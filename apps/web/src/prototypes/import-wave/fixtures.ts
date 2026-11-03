// FAKE DATA for the prototype of the Wave's page
// (brain/chore/crm/design-import-e-assegnazione-wave.md §5). The team is the
// one of ../home-admin (15 operators, a median of 2.854 to call); the Wave
// gains a deadline and who it brought in (new clients, clients already there
// and in which state): none of it is saved yet. Waves and Promozioni have the
// same format.

import { addDays, startOfDay, subDays } from "date-fns"
import { rng } from "../home-operatore/fixtures"
import {
  type Operator,
  type Wave,
  adminScenarios,
  isActive,
  split,
} from "../home-admin/fixtures"

/** Who the import brought in */
export type Arrivals = {
  /** Clients the import created: nobody has them */
  newCustomers: number
  /** Clients already in the CRM, by the state of their contact */
  present: {
    /** No contact: nobody has them to call */
    unassigned: number
    /** Da chiamare, never called */
    never: number
    noAnswer: number
    /** Richiamo: an open alert */
    callback: number
    /** Appuntamento, Pratica caricata, Non interessato */
    worked: number
  }
}

export type WaveRun = Wave & {
  fileName: string
  /** «Scadenza»: null until the admin confirms it */
  deadline: Date | null
  arrivals: Arrivals
}

export type WaveScenario = {
  id: string
  label: string
  /** Where the admin comes from: the toast at the end of the import, or a row of the history */
  entry: "toast" | "storico"
  wave: WaveRun
  operators: Operator[]
}

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0)

/**
 * The Wave's contacts over the operators: `never` never called, `tried` in
 * Non risponde. Who stopped calling holds `stuckShare` times the others' share
 */
function withLoads(
  operators: readonly Operator[],
  waveId: string,
  {
    never,
    tried,
    seed,
    stuckShare,
  }: {
    never: number
    tried: number
    seed: number
    stuckShare: number
  }
): Operator[] {
  const next = rng(seed)
  const weights = operators.map((o) => {
    const jitter = 0.6 + next() * 0.8
    if (o.toCall < 200) return 0
    if (o.role === "ADMIN") return o.perDay > 0 ? 0.15 * jitter : 0
    return isActive(o) ? jitter : stuckShare * jitter
  })
  const nevers = split(never, weights)
  const trieds = split(
    tried,
    weights.map((w, i) => (isActive(operators[i]!) ? w : 0))
  )
  return operators.map((o, i) => ({
    ...o,
    byWave: {
      ...o.byWave,
      [waveId]: {
        toCall: nevers[i]! + trieds[i]!,
        neverCalled: nevers[i]!,
      },
    },
  }))
}

const presentTotal = (a: Arrivals) => sum(Object.values(a.present))

export function waveScenarios(now: Date): WaveScenario[] {
  const today = startOfDay(now)
  const team = adminScenarios(now)[0]!.operators

  // Just imported: most clients new, some already in the CRM with a contact
  // (also at Alessio, who stopped 26 days ago)
  const novId = "w16"
  const novOps = withLoads(team, novId, {
    never: 690,
    tried: 440,
    seed: 801,
    stuckShare: 1.4,
  })
  const novArrivals: Arrivals = {
    newCustomers: 4636,
    present: {
      unassigned: 390,
      never: 690,
      noAnswer: 440,
      callback: 84,
      worked: 140,
    },
  }
  const nov: WaveRun = {
    id: novId,
    name: "Wave Novembre",
    fileName: "WAVE_NOV_2026.xlsx",
    importedOn: today,
    customers: novArrivals.newCustomers + presentTotal(novArrivals),
    unassigned: novArrivals.newCustomers + novArrivals.present.unassigned,
    neverCalled: 690,
    attempted: 440,
    worked: novArrivals.present.callback + novArrivals.present.worked,
    deadline: null,
    arrivals: novArrivals,
  }

  // A Promozione: the same format as a Wave
  const promoId = "p11"
  const promoOps = withLoads(team, promoId, {
    never: 214,
    tried: 96,
    seed: 811,
    stuckShare: 1,
  })
  const promoArrivals: Arrivals = {
    newCustomers: 530,
    present: {
      unassigned: 40,
      never: 214,
      noAnswer: 96,
      callback: 22,
      worked: 18,
    },
  }
  const promo: WaveRun = {
    id: promoId,
    name: "Promozione Compleanni novembre",
    fileName: "PROMO_COMPLEANNI_1126.xlsx",
    importedOn: today,
    customers: promoArrivals.newCustomers + presentTotal(promoArrivals),
    unassigned: promoArrivals.newCustomers + promoArrivals.present.unassigned,
    neverCalled: 214,
    attempted: 96,
    worked: promoArrivals.present.callback + promoArrivals.present.worked,
    deadline: null,
    arrivals: promoArrivals,
  }

  // Already assigned 18 days ago: nobody without an operator, Alessio stuck
  // with his share never called
  const octId = "w15"
  const octOps = withLoads(team, octId, {
    never: 3100,
    tried: 980,
    seed: 821,
    stuckShare: 2.2,
  })
  const oct: WaveRun = {
    id: octId,
    name: "Wave Ottobre",
    fileName: "WAVE_OTT_2026.xlsx",
    importedOn: subDays(today, 18),
    customers: 8950,
    unassigned: 0,
    neverCalled: 3100,
    attempted: 980,
    worked: 4870,
    deadline: addDays(today, 10),
    arrivals: {
      newCustomers: 6120,
      present: {
        unassigned: 1310,
        never: 820,
        noAnswer: 410,
        callback: 120,
        worked: 170,
      },
    },
  }

  // Past its deadline with work left
  const sepId = "w14"
  const sepOps = withLoads(team, sepId, {
    never: 1460,
    tried: 680,
    seed: 831,
    stuckShare: 2,
  })
  const sep: WaveRun = {
    id: sepId,
    name: "Wave Settembre",
    fileName: "WAVE_SET_2026.xlsx",
    importedOn: subDays(today, 41),
    customers: 7400,
    unassigned: 0,
    neverCalled: 1460,
    attempted: 680,
    worked: 5260,
    deadline: subDays(today, 4),
    arrivals: {
      newCustomers: 5010,
      present: {
        unassigned: 1120,
        never: 640,
        noAnswer: 380,
        callback: 95,
        worked: 155,
      },
    },
  }

  return [
    {
      id: "nuova",
      label: "Appena importata",
      entry: "toast",
      wave: nov,
      operators: novOps,
    },
    {
      id: "promo",
      label: "Promozione appena importata",
      entry: "toast",
      wave: promo,
      operators: promoOps,
    },
    {
      id: "assegnata",
      label: "Tutta assegnata",
      entry: "storico",
      wave: oct,
      operators: octOps,
    },
    {
      id: "scaduta",
      label: "Scaduta",
      entry: "storico",
      wave: sep,
      operators: sepOps,
    },
  ]
}

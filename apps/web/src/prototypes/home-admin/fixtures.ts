// FAKE DATA for the prototype of the admin's home
// (brain/chore/crm/design-home-e-richiami.md §4, §6, §7). The team's day
// depends on D1 and D2 like the operator's; the Wave numbers (clients without
// an operator, contacts never called, who has them) need endpoints that don't
// exist yet. Volumes follow production of 2026-11-01: 15 operators, about 23
// calls a day each, 2,2% appointments, a median of 2.854 contacts to call.

import { startOfDay, subDays, subMinutes } from "date-fns"
import {
  type Callback,
  type Entry,
  type MyDay,
  type SectionId,
  callbacks,
  dayOf,
  rng,
} from "../home-operatore/fixtures"

/** One operator's contacts of one Wave still to work */
type WaveLoad = {
  /** In `chiamare` and `non risponde` */
  toCall: number
  /** Of those, the ones nobody has called yet */
  neverCalled: number
}

export type Role = "OPERATORE" | "ADMIN"

export type Operator = {
  id: number
  name: string
  role: Role
  day: MyDay
  /** Their open alerts past the deadline, oldest first (D1) */
  overdue: Callback[]
  /** Contacts in `chiamare` and `non risponde`, of every Wave */
  toCall: number
  /** Of those, the ones nobody has called yet, of the Wave below */
  neverCalled: number
  /** The same, Wave by Wave */
  byWave: Readonly<Record<string, WaveLoad>>
  /** Calls a working day, over the last 30 days */
  perDay: number
  /** Days since the last call: 0 when they called today */
  away: number
  /** Today's calls, newest first */
  diary: Entry[]
}

export type Wave = {
  id: string
  name: string
  importedOn: Date
  customers: number
  /** Clients of the Wave with no contact: nobody has them to call */
  unassigned: number
  /** Contacts of the Wave assigned and never called */
  neverCalled: number
  /** Called, without an outcome yet */
  attempted: number
  /** Contacts with an outcome */
  worked: number
}

export type AdminScenario = {
  id: string
  label: string
  operators: Operator[]
  waves: Wave[]
  /** The admin's own callbacks (§4.6) */
  mine: { overdue: number; today: number }
  loading?: readonly SectionId[]
  failing?: readonly SectionId[]
}

/** Who stopped calling this many days ago is left out of a split */
const AWAY = 7

export const isActive = (o: Operator) => o.away < AWAY

type Seed = {
  name: string
  /** OPERATORE when missing */
  role?: Role
  calls: number
  late: number[]
  toCall: number
  perDay: number
  /** Minutes since the last call, past the usual few */
  idle?: number
  /** Days since the last call, for who has not called today */
  away?: number
}

const typicalLate = (n: number, oldest: number) =>
  Array.from({ length: n }, (_, i) =>
    Math.max(1, Math.round(oldest * Math.pow(1 - i / n, 1.6)))
  )

// 15 operators: Alessio stopped 26 days ago with his contacts never called,
// Roberta finished hers, Federica is almost done. Then the 8 admins
const team: Seed[] = [
  {
    name: "Giulia Ferraro",
    calls: 31,
    late: typicalLate(5, 12),
    toCall: 2854,
    perDay: 28,
  },
  {
    name: "Marco Iannone",
    calls: 27,
    late: typicalLate(3, 6),
    toCall: 3120,
    perDay: 24,
  },
  { name: "Sara Capasso", calls: 44, late: [], toCall: 2410, perDay: 38 },
  {
    name: "Davide Russo",
    calls: 9,
    late: typicalLate(14, 21),
    toCall: 4980,
    perDay: 14,
    idle: 95,
  },
  {
    name: "Chiara Esposito",
    calls: 23,
    late: typicalLate(2, 3),
    toCall: 2702,
    perDay: 22,
  },
  {
    name: "Luca Fusco",
    calls: 19,
    late: typicalLate(6, 9),
    toCall: 3390,
    perDay: 18,
  },
  { name: "Valentina Nappi", calls: 57, late: [1], toCall: 1905, perDay: 49 },
  {
    name: "Andrea Cirillo",
    calls: 22,
    late: typicalLate(4, 8),
    toCall: 2988,
    perDay: 21,
  },
  { name: "Federica Sannino", calls: 16, late: [], toCall: 140, perDay: 22 },
  {
    name: "Simone Aprea",
    calls: 25,
    late: typicalLate(3, 5),
    toCall: 2560,
    perDay: 24,
  },
  {
    name: "Martina Ruocco",
    calls: 33,
    late: typicalLate(2, 2),
    toCall: 2211,
    perDay: 30,
  },
  {
    name: "Alessio Menna",
    calls: 0,
    late: typicalLate(7, 15),
    toCall: 7730,
    perDay: 0,
    away: 26,
  },
  {
    name: "Ilaria Scognamiglio De Rosa",
    calls: 21,
    late: typicalLate(1, 4),
    toCall: 2840,
    perDay: 20,
  },
  {
    name: "Fabio Mele",
    calls: 18,
    late: typicalLate(3, 7),
    toCall: 3015,
    perDay: 19,
  },
  {
    name: "Roberta Granata",
    calls: 0,
    late: [],
    toCall: 2,
    perDay: 24,
    away: 1,
  },
  // 8 admins: Paola (who looks) and two more who call a little, Anna who
  // stopped with a few contacts, Rosario who only reads the reports, and three
  // technical accounts that never call
  {
    name: "Paola De Luca",
    role: "ADMIN",
    calls: 6,
    late: [1],
    toCall: 240,
    perDay: 5,
  },
  {
    name: "Gennaro Vitiello",
    role: "ADMIN",
    calls: 3,
    late: [],
    toCall: 980,
    perDay: 4,
  },
  {
    name: "Mario Sorrentino",
    role: "ADMIN",
    calls: 1,
    late: [],
    toCall: 60,
    perDay: 2,
  },
  {
    name: "Anna Liguori",
    role: "ADMIN",
    calls: 0,
    late: typicalLate(2, 10),
    toCall: 1240,
    perDay: 3,
    away: 9,
  },
  {
    name: "Rosario Cuomo",
    role: "ADMIN",
    calls: 0,
    late: [],
    toCall: 0,
    perDay: 0,
  },
  {
    name: "Supporto IT",
    role: "ADMIN",
    calls: 0,
    late: [],
    toCall: 0,
    perDay: 0,
  },
  {
    name: "Account di servizio",
    role: "ADMIN",
    calls: 0,
    late: [],
    toCall: 0,
    perDay: 0,
  },
  {
    name: "Test Admin",
    role: "ADMIN",
    calls: 0,
    late: [],
    toCall: 0,
    perDay: 0,
  },
]

type WaveSeed = Omit<Wave, "importedOn"> & { daysAgo: number }

const waveSeeds: WaveSeed[] = [
  {
    id: "w15",
    name: "Wave 15",
    daysAgo: 4,
    customers: 6380,
    unassigned: 3900,
    neverCalled: 1420,
    attempted: 450,
    worked: 610,
  },
  {
    id: "w14",
    name: "Wave 14",
    daysAgo: 32,
    customers: 8950,
    unassigned: 0,
    neverCalled: 4210,
    attempted: 860,
    worked: 3880,
  },
  {
    id: "w13",
    name: "Wave 13",
    daysAgo: 54,
    customers: 7400,
    unassigned: 0,
    neverCalled: 2960,
    attempted: 420,
    worked: 4020,
  },
  {
    id: "w12",
    name: "Wave 12",
    daysAgo: 89,
    customers: 9100,
    unassigned: 120,
    neverCalled: 1870,
    attempted: 470,
    worked: 6640,
  },
]

/** `total` split by `weights`, the remainders to the largest fractions */
export function split(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (sum === 0) return weights.map(() => 0)
  const exact = weights.map((w) => (total * w) / sum)
  const parts = exact.map(Math.floor)
  let rest = total - parts.reduce((s, p) => s + p, 0)
  const order = exact
    .map((e, i) => [e - Math.floor(e), i] as const)
    .sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (rest === 0) break
    parts[i]! += 1
    rest -= 1
  }
  return parts
}

/** Each Wave's contacts, operator by operator */
function loadsOf(seeds: readonly Seed[]) {
  return waveSeeds.map((w, k) => {
    const next = rng(500 + k)
    const share = seeds.map((s) => {
      const jitter = 0.7 + next() * 0.6
      // Roberta and Federica got none of these; Alessio stopped before
      // Wave 15 and never called the ones he had
      if (s.toCall < 300) return { never: 0, tried: 0 }
      if (s.away !== undefined && s.away >= AWAY) {
        return w.daysAgo < s.away
          ? { never: 0, tried: 0 }
          : { never: 2 * jitter, tried: 0 }
      }
      return { never: jitter, tried: jitter }
    })
    const never = split(
      w.neverCalled,
      share.map((x) => x.never)
    )
    const tried = split(
      w.attempted,
      share.map((x) => x.tried)
    )
    return { id: w.id, never, tried }
  })
}

function operatorsOf(
  now: Date,
  seeds: readonly Seed[],
  { morning = false }: { morning?: boolean } = {}
): Operator[] {
  const loads = loadsOf(seeds)
  return seeds.map((s, i) => {
    const calls = morning ? 0 : s.calls
    const answered = Math.round(calls * 0.6)
    const day: MyDay = {
      calls,
      answered,
      appointments: Math.min(answered, Math.round(calls * 0.03)),
    }
    const queue = callbacks(40 + i, s.late, now, 10_000 + i * 1000)
    // The last call a few minutes ago, or a while ago for one who stopped
    const end = subMinutes(now, s.idle ?? (i * 7) % 38)
    const { queue: overdue, diary } = dayOf(60 + i, end, queue, day, {
      retried: Math.min(2, s.late.length),
      closed: Math.round(calls * 0.2),
    })
    const byWave = Object.fromEntries(
      loads.map((l) => [
        l.id,
        { toCall: l.never[i]! + l.tried[i]!, neverCalled: l.never[i]! },
      ])
    )
    return {
      id: i + 1,
      name: s.name,
      role: s.role ?? "OPERATORE",
      day,
      overdue,
      toCall: s.toCall,
      neverCalled: Object.values(byWave).reduce((n, l) => n + l.neverCalled, 0),
      byWave,
      perDay: s.perDay,
      away: s.away ?? 0,
      diary,
    }
  })
}

function wavesOf(now: Date): Wave[] {
  const today = startOfDay(now)
  return waveSeeds.map(({ daysAgo, ...w }) => ({
    ...w,
    importedOn: subDays(today, daysAgo),
  }))
}

export function adminScenarios(now: Date): AdminScenario[] {
  const operators = operatorsOf(now, team)
  const waves = wavesOf(now)
  const mine = { overdue: 2, today: 3 }
  const base = { operators, waves, mine }

  // One operator far behind: 64 overdue, the oldest 34 days late
  const behind = team.map((s) =>
    s.name === "Davide Russo"
      ? { ...s, late: typicalLate(64, 34), calls: 4, idle: 170 }
      : s
  )

  return [
    { id: "in-corso", label: "Giornata in corso", ...base },
    {
      id: "mattina",
      label: "Mattina presto",
      ...base,
      operators: operatorsOf(now, team, { morning: true }),
    },
    {
      id: "indietro",
      label: "Un operatore indietro",
      ...base,
      operators: operatorsOf(now, behind),
    },
    {
      id: "assegnato",
      label: "Wave tutte assegnate",
      ...base,
      waves: waves.map((w) => ({ ...w, unassigned: 0 })),
    },
    {
      id: "senza-richiami",
      label: "Nessun mio richiamo",
      ...base,
      mine: { overdue: 0, today: 0 },
    },
    {
      id: "caricamento",
      label: "Caricamento",
      ...base,
      loading: ["teamDay", "team", "waves", "mine"],
    },
    {
      id: "errore",
      label: "Una sezione fallisce",
      ...base,
      failing: ["team"],
    },
  ]
}

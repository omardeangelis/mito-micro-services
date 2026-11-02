// FAKE DATA for the prototype of the operator's home
// (brain/chore/crm/design-home-e-richiami.md §6, §7). Everything here depends
// on D1 (overdue alerts stay open), D2 (every call is logged) and endpoints
// that don't exist yet. Volumes follow production of 2026-11-01.

import {
  addDays,
  differenceInMinutes,
  startOfDay,
  subDays,
  subMinutes,
} from "date-fns"

/** The six states of D6 */
export type State =
  | "chiamare"
  | "non risponde"
  | "richiamare"
  | "app.to"
  | "caricato"
  | "non interessato"

export type Callback = {
  taskId: number
  customer: string
  phone: string
  /** The day of the open alert */
  deadline: Date
  message: string | null
  state: State
  /** Days since the deadline, 0 for today */
  daysLate: number
  /** A call already made today on this contact, with no answer */
  triedAt?: Date
  /** The outcome that closed the alert on this page: the row stays, closed */
  done?: { outcome: Outcome; callbackOn?: Date | undefined; at: Date }
}

/** The four outcomes of "Registra chiamata" (§5) */
export type Outcome =
  "non risponde" | "richiamare" | "app.to" | "non interessato"

/** A call of today in the diary (D2: every call leaves a row) */
export type Entry = {
  id: string
  taskId: number
  customer: string
  phone: string
  outcome: Outcome
  /** The day of the new alert, for `richiamare` */
  callbackOn?: Date | undefined
  message?: string | undefined
  at: Date
  /** An open alert of the home, or a contact of the list to call */
  from: "richiamo" | "lista"
}

export type MyDay = { calls: number; answered: number; appointments: number }

export type SectionId =
  | "overdue"
  | "today"
  | "toCall"
  | "myDay"
  | "diary"
  // The admin's home (../home-admin)
  | "teamDay"
  | "team"
  | "waves"
  | "mine"

export type Scenario = {
  id: string
  label: string
  overdue: Callback[]
  today: Callback[]
  /** Contacts in `chiamare` and `non risponde` */
  toCall: number
  myDay: MyDay
  /** Today's calls, newest first */
  diary: Entry[]
  /** Sections that never finish loading */
  loading?: readonly SectionId[]
  /** Sections whose first load fails */
  failing?: readonly SectionId[]
}

// A small seeded generator, so every reload shows the same people
export const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

const firstNames = [
  "Giuseppe",
  "Maria",
  "Antonio",
  "Anna",
  "Francesco",
  "Rosa",
  "Salvatore",
  "Giovanna",
  "Vincenzo",
  "Carmela",
  "Luigi",
  "Teresa",
  "Domenico",
  "Lucia",
  "Pasquale",
  "Angela",
  "Raffaele",
  "Concetta",
  "Gennaro",
  "Assunta",
  "Ciro",
  "Immacolata",
  "Michele",
  "Filomena",
  "Carmine",
  "Rita",
]
const lastNames = [
  "Esposito",
  "Russo",
  "Romano",
  "Ferrara",
  "De Luca",
  "Cozzolino",
  "Iovine",
  "Marino",
  "Greco",
  "Bruno",
  "Gallo",
  "Coppola",
  "Della Corte",
  "Santoro",
  "D'Angelo",
  "Caputo",
  "Amato",
  "Rinaldi",
  "Barbato",
  "Sorrentino",
  "Vitale",
  "Longobardi",
  "Mazzella",
  "Palumbo",
]
const messages: (string | null)[] = [
  "Richiamare dopo le 15, è al lavoro la mattina",
  "Vuole parlarne con la moglie prima di decidere",
  "Interessata al consolidamento, aspetta la busta paga di novembre",
  null,
  "Ha già un prestito con un'altra banca, chiedere la scadenza",
  "Richiamare",
  null,
  "Preferisce essere chiamato sul fisso",
  "Valuta la cessione del quinto: ha chiesto il conteggio estintivo all'altra finanziaria e lo manda appena arriva, insieme al CUD del 2025 e all'ultima busta paga; richiamare per fissare l'appuntamento in filiale a Pomigliano",
  "Non era convinto della rata, rifare il preventivo a 84 mesi",
  null,
  "Chiede di essere richiamato dal figlio Marco",
]
const callbackMessages = [
  "Manda le buste paga entro venerdì",
  "Richiamare nel pomeriggio",
  undefined,
  "Ne parla con il marito",
  undefined,
  "Aspetta il conteggio estintivo",
]

const LONG_NAME = "Maria Antonietta Esposito Di Giacomantonio"

export const phoneOf = (next: () => number) => {
  const prefix = ["320", "328", "331", "339", "347", "349", "366", "389"][
    Math.floor(next() * 8)
  ]
  const digits = String(Math.floor(next() * 9_000_000) + 1_000_000)
  return `${prefix} ${digits.slice(0, 3)} ${digits.slice(3)}`
}

export const nameOf = (next: () => number) =>
  `${lastNames[Math.floor(next() * lastNames.length)]} ${
    firstNames[Math.floor(next() * firstNames.length)]
  }`

export function callbacks(
  seed: number,
  daysLate: readonly number[],
  now: Date,
  firstId: number
): Callback[] {
  const next = rng(seed)
  const today = startOfDay(now)
  return daysLate.map((late, i) => {
    const tried = late > 0 && next() < 0.35
    return {
      taskId: firstId + i,
      // The long name once, among the overdue
      customer: i === 2 && late > 0 ? LONG_NAME : nameOf(next),
      phone: phoneOf(next),
      deadline: subDays(today, late),
      message: messages[(seed + i) % messages.length] ?? null,
      // After the deadline the contact is in `chiamare`, or in `non risponde`
      // after an attempt (D1, D6)
      state: tried ? "non risponde" : "chiamare",
      daysLate: late,
    }
  })
}

/**
 * Today's calls, consistent with the numbers of `day`: the unanswered ones on
 * `retried` open alerts of the queue (which stay open, D1, and get `triedAt`),
 * `closed` alerts already worked and gone, the rest from the list to call.
 */
export function dayOf(
  seed: number,
  now: Date,
  queue: Callback[],
  day: MyDay,
  { retried, closed }: { retried: number; closed: number }
): { queue: Callback[]; diary: Entry[] } {
  const next = rng(seed)
  const today = startOfDay(now)
  const unanswered = day.calls - day.answered
  const others = day.answered - day.appointments
  const callbackCount = Math.round(others * 0.7)
  const outcomes: Outcome[] = [
    ...Array<Outcome>(unanswered).fill("non risponde"),
    ...Array<Outcome>(day.appointments).fill("app.to"),
    ...Array<Outcome>(callbackCount).fill("richiamare"),
    ...Array<Outcome>(others - callbackCount).fill("non interessato"),
  ]
  // Shuffle, the same way on every reload
  for (let i = outcomes.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[outcomes[i], outcomes[j]] = [outcomes[j]!, outcomes[i]!]
  }

  // The calls end a few minutes ago, about one every 6 minutes, all today
  const end = subMinutes(now, 4)
  const span = Math.min(
    outcomes.length * 6,
    Math.max(differenceInMinutes(end, today) - 1, outcomes.length)
  )
  const step = outcomes.length > 1 ? span / (outcomes.length - 1) : 0

  const retriedRows = queue.filter((c) => c.daysLate > 0).slice(0, retried)
  const triedAt = new Map<number, Date>()
  let closedLeft = closed
  const diary = outcomes.map((outcome, i): Entry => {
    const at = subMinutes(end, Math.round(i * step))
    const base = {
      id: `${seed}-${i}`,
      outcome,
      at,
      ...(outcome === "richiamare"
        ? {
            callbackOn: addDays(today, 1 + Math.floor(next() * 6)),
            message: callbackMessages[i % callbackMessages.length],
          }
        : {}),
    }
    const row =
      outcome === "non risponde"
        ? retriedRows.find((r) => !triedAt.has(r.taskId))
        : undefined
    if (row) {
      triedAt.set(row.taskId, at)
      return {
        ...base,
        taskId: row.taskId,
        customer: row.customer,
        phone: row.phone,
        from: "richiamo",
      }
    }
    const fromCallback = outcome !== "non risponde" && closedLeft-- > 0
    return {
      ...base,
      taskId: 5000 + seed * 100 + i,
      customer: nameOf(next),
      phone: phoneOf(next),
      from: fromCallback ? "richiamo" : "lista",
    }
  })
  return {
    queue: queue.map((c) => {
      const at = triedAt.get(c.taskId)
      return at ? { ...c, state: "non risponde", triedAt: at } : c
    }),
    diary,
  }
}

const split = (queue: Callback[]) => ({
  overdue: queue.filter((c) => c.daysLate > 0),
  today: queue.filter((c) => c.daysLate === 0),
})

// The days late of a typical day: 5 arretrati (§7)
const typicalLate = [12, 6, 3, 2, 1]
// A full day: 64 arretrati, the oldest 34 days late
const fullLate = Array.from({ length: 64 }, (_, i) =>
  Math.max(1, Math.round(34 * Math.pow(1 - i / 64, 1.8)))
)

export function scenarios(now: Date): Scenario[] {
  const typicalQueue = [
    ...callbacks(7, typicalLate, now, 1000),
    ...callbacks(11, Array(11).fill(0), now, 1100),
  ]
  const typicalDay = { calls: 14, answered: 9, appointments: 1 }
  const typical = (() => {
    const { queue, diary } = dayOf(3, now, typicalQueue, typicalDay, {
      retried: 2,
      closed: 4,
    })
    return { ...split(queue), toCall: 2854, myDay: typicalDay, diary }
  })()

  const fullDay = { calls: 57, answered: 31, appointments: 2 }
  const full = dayOf(
    5,
    now,
    [
      ...callbacks(5, fullLate, now, 2000),
      ...callbacks(13, Array(192).fill(0), now, 3000),
    ],
    fullDay,
    { retried: 10, closed: 18 }
  )

  const quietDay = { calls: 6, answered: 4, appointments: 0 }
  const quiet = dayOf(9, now, [], quietDay, { retried: 0, closed: 0 })

  return [
    { id: "tipica", label: "Giornata tipica", ...typical },
    {
      id: "piena",
      label: "Giornata piena",
      ...split(full.queue),
      toCall: 7730,
      myDay: fullDay,
      diary: full.diary,
    },
    {
      id: "inizio",
      label: "Inizio giornata",
      ...split(typicalQueue),
      toCall: 2854,
      myDay: { calls: 0, answered: 0, appointments: 0 },
      diary: [],
    },
    {
      id: "niente",
      label: "Niente in scadenza",
      overdue: [],
      today: [],
      toCall: 1420,
      myDay: quietDay,
      diary: quiet.diary,
    },
    {
      id: "nuovo",
      label: "Operatore nuovo",
      overdue: [],
      today: [],
      toCall: 0,
      myDay: { calls: 0, answered: 0, appointments: 0 },
      diary: [],
    },
    {
      id: "caricamento",
      label: "Caricamento",
      ...typical,
      loading: ["overdue", "today", "toCall", "myDay", "diary"],
    },
    {
      id: "errore",
      label: "Una sezione fallisce",
      ...typical,
      failing: ["overdue", "today"],
    },
  ]
}

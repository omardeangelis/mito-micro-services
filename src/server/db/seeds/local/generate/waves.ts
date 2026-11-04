// The Waves of the local seed (spec assegnazione-wave, T20): five completed
// `format = 'wave'` imports with the trace of their customers, like the
// scenarios of the prototype, and the calls of the last 30 days: the contacts
// step already wrote them on each operator's own contacts, so the paces differ
// with the operators' loads, and one operator is made inactive by moving its
// recent calls to another. No call row is added: the log keeps the chain of
// states and the `closedAt` the contacts test checks. Pure and seeded, as the
// rest of the dataset: it only reads the customers, contacts and log that the
// other steps made, and returns the new rows plus the log with the actors
// changed.
//
//   «nuova»      no deadline, new customers without operator and some existing
//   «promo»      0 to assign: every customer already has an operator
//   «assegnata»  deadline in the future, to-do spread over the operators, some
//                customers still without operator
//   «scaduta»    deadline yesterday, to-do, with the inactive operator among them
//   «ricostruita» `created` NULL (rebuilt from the file name), no deadline
//
// The inactive operator is `INACTIVE_OPERATOR_ID`: its last call is the oldest
// of the 30 days that is at least `INACTIVE_LAST_CALL_OFFSET` days before D,
// and the team's calls fill the days since (the spec asks for 7 worked days).
import type {
  ImportRunCustomerRow,
  ImportRunRow,
  CustomerRow,
  Day,
  OperatorRow,
  TaskEventLogRow,
  TaskRow,
} from "../types"
import { addDays } from "../day"
import { createDayClock } from "./clock"
import { HEAVY_OPERATOR_ID, SYSTEM_OPERATOR_ID } from "./operators"
import { createRandom } from "./random"

export const WAVE_ID_START = 1000

/** The users that run the imports: the first ADMIN of the seed. */
const IMPORT_USER_ID = "seed-user-01"

/** The inactive operator: a medium OPERATORE. */
export const INACTIVE_OPERATOR_ID = HEAVY_OPERATOR_ID + 3
/** Days before D from which on its calls are kept; the newer ones pass on. */
export const INACTIVE_LAST_CALL_OFFSET = 14

/** To-do of an active contact: Da chiamare or Non risponde. */
const TO_DO = new Set<string>(["chiamare", "non risponde"])

export type WaveName =
  "ricostruita" | "scaduta" | "assegnata" | "promo" | "nuova"

/** Id, file and start of each Wave: older first, so ids follow time. */
export const WAVES: Readonly<
  Record<WaveName, { id: number; fileName: string; startedOffset: number }>
> = {
  ricostruita: {
    id: WAVE_ID_START,
    fileName: "WAVE_SET_2026_RICOSTRUITA.xlsx",
    startedOffset: 40,
  },
  scaduta: {
    id: WAVE_ID_START + 1,
    fileName: "WAVE_OTT_2026_SCADUTA.xlsx",
    startedOffset: 20,
  },
  assegnata: {
    id: WAVE_ID_START + 2,
    fileName: "WAVE_OTT_2026_ASSEGNATA.xlsx",
    startedOffset: 6,
  },
  promo: {
    id: WAVE_ID_START + 3,
    fileName: "PROMO_NOV_2026.xlsx",
    startedOffset: 4,
  },
  nuova: {
    id: WAVE_ID_START + 4,
    fileName: "WAVE_NOV_2026.xlsx",
    startedOffset: 1,
  },
}

/** Days after D of the deadline of «assegnata»; «scaduta» ends the day before. */
export const ASSIGNED_DEADLINE_DAYS = 10

/** Customers per Wave, at most: modest, whatever N. */
const NEW_CUSTOMERS_MAX = 150
const EXISTING_IN_NEW = 60
const PROMO_SIZE = 200
const TO_DO_PER_ASSIGNED = 240
const TO_DO_PER_EXPIRED = 150
const WORKED_PER_WAVE = 30
const REBUILT_SIZE = 120

/** Takes one from each group in turn: the groups stay evenly represented. */
function roundRobin<T>(groups: readonly (readonly T[])[], limit: number): T[] {
  const picked: T[] = []
  for (let k = 0; picked.length < limit; k++) {
    let any = false
    for (const group of groups) {
      if (k < group.length) {
        any = true
        picked.push(group[k]!)
        if (picked.length === limit) break
      }
    }
    if (!any) break
  }
  return picked
}

export function generateWaves({
  day,
  customers,
  operators,
  tasks,
  taskEventLog,
}: {
  day: Day
  customers: readonly CustomerRow[]
  operators: readonly OperatorRow[]
  tasks: readonly TaskRow[]
  taskEventLog: readonly TaskEventLogRow[]
}): {
  importRuns: ImportRunRow[]
  importRunCustomers: ImportRunCustomerRow[]
  taskEventLog: TaskEventLogRow[]
} {
  const rng = createRandom("waves")
  const clock = createDayClock(day)
  const teamIds = new Set(
    operators
      .map((operator) => operator.id)
      .filter((id) => id !== SYSTEM_OPERATOR_ID)
  )

  const activeByCustomer = new Map<string, TaskRow>()
  for (const task of tasks) {
    if (task.isActive && task.customerId != null) {
      activeByCustomer.set(task.customerId, task)
    }
  }

  // «Senza operatore»: no operator, and no active contact or one without
  const withoutOperator = customers.filter((customer) => {
    if (customer.operatorId != null) return false
    const active = activeByCustomer.get(customer.id)
    return active?.operatorId == null
  })
  const withOperator = customers.filter(
    (customer) => customer.operatorId != null
  )
  const toDoOf = (operatorId: number) =>
    withOperator.filter((customer) => {
      const active = activeByCustomer.get(customer.id)
      return (
        customer.operatorId === operatorId &&
        active?.operatorId === operatorId &&
        TO_DO.has(active.state ?? "")
      )
    })
  const teamOperatorIds = [...teamIds].sort((a, b) => a - b)
  const toDoByOperator = teamOperatorIds.map(toDoOf)
  const inactiveToDo = toDoOf(INACTIVE_OPERATOR_ID)
  const worked = withOperator.filter((customer) => {
    const active = activeByCustomer.get(customer.id)
    return active !== undefined && !TO_DO.has(active.state ?? "")
  })

  // Each Wave draws from its own shuffle, so the sets differ
  const shuffled = <T>(items: readonly T[]) => rng.shuffle(items)
  const shuffledGroups = <T>(groups: readonly (readonly T[])[]) =>
    groups.map((group) => rng.shuffle(group))

  type Member = { customer: CustomerRow; created: boolean | null }
  const members = (
    picked: readonly CustomerRow[],
    created: (index: number, customer: CustomerRow) => boolean | null
  ): Member[] =>
    picked.map((customer, index) => ({
      customer,
      created: created(index, customer),
    }))

  // «nuova»: the new customers have no operator
  const newOnes = shuffled(withoutOperator).slice(0, NEW_CUSTOMERS_MAX)
  const nuova = [
    ...members(newOnes, () => true),
    ...members(shuffled(withOperator).slice(0, EXISTING_IN_NEW), () => false),
  ]

  // «promo»: all of them have an operator already
  const promo = members(
    shuffled(withOperator).slice(0, PROMO_SIZE),
    () => false
  )

  // «assegnata»: to-do over the operators, a few without, a few worked
  const assegnata = [
    ...members(
      roundRobin(shuffledGroups(toDoByOperator), TO_DO_PER_ASSIGNED),
      (index) => index % 4 === 0
    ),
    ...members(shuffled(withoutOperator).slice(0, 25), () => true),
    ...members(shuffled(worked).slice(0, WORKED_PER_WAVE), () => false),
  ]

  // «scaduta»: all the to-do of the inactive operator, then the others
  const others = shuffledGroups(
    toDoByOperator.filter((group) => group !== inactiveToDo)
  )
  const scaduta = [
    ...members(inactiveToDo, () => false),
    ...members(
      roundRobin(others, TO_DO_PER_EXPIRED - inactiveToDo.length),
      (index) => index % 5 === 0
    ),
    ...members(shuffled(withoutOperator).slice(0, 10), () => true),
    ...members(shuffled(worked).slice(0, WORKED_PER_WAVE), () => false),
  ]

  // Rebuilt from the file name: nothing says whether a customer was created
  const ricostruita = members(
    shuffled(withOperator).slice(0, REBUILT_SIZE),
    () => null
  )

  const plans: ReadonlyArray<{
    name: WaveName
    members: readonly Member[]
    deadline: Day | null
  }> = [
    { name: "ricostruita", members: ricostruita, deadline: null },
    { name: "scaduta", members: scaduta, deadline: addDays(day, -1) },
    {
      name: "assegnata",
      members: assegnata,
      deadline: addDays(day, ASSIGNED_DEADLINE_DAYS),
    },
    { name: "promo", members: promo, deadline: null },
    { name: "nuova", members: nuova, deadline: null },
  ]

  const importRuns: ImportRunRow[] = []
  const importRunCustomers: ImportRunCustomerRow[] = []
  for (const plan of plans) {
    const wave = WAVES[plan.name]
    // A customer once per Wave (the key is the run and the customer)
    const unique = new Map(
      plan.members.map((member) => [member.customer.id, member])
    )
    const rows = [...unique.values()]
    const created = rows.filter((row) => row.created === true).length
    const updated = rows.filter((row) => row.created === false).length
    const rebuilt = plan.name === "ricostruita"
    const discarded = rng.int(0, 6)
    const startedAt = clock.noon(wave.startedOffset)
    importRuns.push({
      id: wave.id,
      startedAt,
      claimedAt: startedAt,
      finishedAt: startedAt,
      startedBy: IMPORT_USER_ID,
      fileName: wave.fileName,
      format: "wave",
      status: "completed",
      failureReason: null,
      rowsTotal: rows.length + discarded,
      rowsDiscarded: discarded,
      customersCreated: rebuilt ? null : created,
      customersUpdated: rebuilt ? null : updated,
      practicesCreated: rebuilt ? null : created + updated,
      practicesUpdated: rebuilt ? null : 0,
      linksCreated: rebuilt ? null : created + updated,
      deadline: plan.deadline,
    })
    for (const row of rows) {
      importRunCustomers.push({
        runId: wave.id,
        customerId: row.customer.id,
        created: row.created,
      })
    }
  }

  return {
    importRuns,
    importRunCustomers,
    taskEventLog: reassignCalls({ clock, taskEventLog }),
  }
}

/**
 * The calls of the inactive operator from the last days pass to the heaviest
 * operator; if it has none from `INACTIVE_LAST_CALL_OFFSET` on, the nearest
 * call from there goes to it, so it did call before. Only the actor changes.
 */
function reassignCalls({
  clock,
  taskEventLog,
}: {
  clock: ReturnType<typeof createDayClock>
  taskEventLog: readonly TaskEventLogRow[]
}): TaskEventLogRow[] {
  const offsetOf = (row: TaskEventLogRow) => clock.offsetOf(row.createdAt!)
  const rows = taskEventLog.map((row) =>
    row.action === "call" &&
    row.actorOperatorId === INACTIVE_OPERATOR_ID &&
    offsetOf(row) < INACTIVE_LAST_CALL_OFFSET
      ? { ...row, actorOperatorId: HEAVY_OPERATOR_ID }
      : row
  )

  const isOlderCall = (row: TaskEventLogRow) =>
    row.action === "call" &&
    offsetOf(row) >= INACTIVE_LAST_CALL_OFFSET &&
    offsetOf(row) <= 30
  if (
    rows.some(
      (row) => isOlderCall(row) && row.actorOperatorId === INACTIVE_OPERATOR_ID
    )
  ) {
    return rows
  }
  let nearest = -1
  rows.forEach((row, k) => {
    if (
      isOlderCall(row) &&
      (nearest === -1 || offsetOf(row) < offsetOf(rows[nearest]!))
    ) {
      nearest = k
    }
  })
  if (nearest === -1) return rows
  return rows.map((row, k) =>
    k === nearest ? { ...row, actorOperatorId: INACTIVE_OPERATOR_ID } : row
  )
}

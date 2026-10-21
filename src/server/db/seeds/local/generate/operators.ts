// Users, operators and the assignment of customers to operators (AC16-AC18).
// Pure and seeded: the result depends only on `day` (and on the customers the
// assignment is given). Every timestamp is derived from D with `romeNoon`: the
// DB defaults (`emailVerified`, `createdAt`) and `$onUpdate` (`updatedAt`) would
// otherwise write "now".
import { SYSTEM_OPERATOR_USER_ID } from "@mito/domain/constants/operator"
import { addDays, romeNoon } from "../day"
import type { CustomerRow, Day, OperatorRow, UserRow } from "../types"
import { slug } from "./customers"
import { createFaker, createRandom, range } from "./random"

/**
 * Share of the customers that the contacts step gives an active contact: the
 * same for every operator and for the customers without operator, so the load
 * of an operator on active contacts follows its share of customers.
 */
export const ACTIVE_CONTACT_SHARE = 0.8

/** Share of the customers that has no operator (AC18 asks for at least 2%). */
export const UNASSIGNED_SHARE = 0.03

export const ADMIN_COUNT = 3
export const OPERATORE_COUNT = 25

/**
 * Layout of the operators, in the order they are written. Operator ids start at
 * 1000 (the identity of the table):
 *   1000-1002  ADMIN users `seed-user-01`..`seed-user-03`
 *   1003-1027  OPERATORE users `seed-user-04`..`seed-user-28`
 *   1028       the system operator (last), with no row in `users`
 * Among the OPERATORE, in order: the heavy one, 18 medium ones, 5 small ones
 * and the empty one.
 */
const FIRST_OPERATOR_ID = 1000
const MEDIUM_COUNT = 18
const SMALL_COUNT = 5

export const HEAVY_OPERATOR_ID = FIRST_OPERATOR_ID + ADMIN_COUNT
export const EMPTY_OPERATOR_ID =
  FIRST_OPERATOR_ID + ADMIN_COUNT + OPERATORE_COUNT - 1
export const SYSTEM_OPERATOR_ID =
  FIRST_OPERATOR_ID + ADMIN_COUNT + OPERATORE_COUNT
export const SYSTEM_OPERATOR_NAME = "Sistema"

const userIdOf = (position: number) =>
  `seed-user-${String(position + 1).padStart(2, "0")}`

/**
 * Share of the customers that have an operator, in per mille, by operator id.
 * Admins: 24, 16 and 12. Heavy OPERATORE: 350. Medium: 22, 26, 30, 34, 38
 * repeated (2.2%-3.8%, 528 in all). Small: 14 each. Empty: 0. System: 0.
 * The sum is 1,000.
 */
const SHARES_PER_MILLE: ReadonlyMap<number, number> = (() => {
  const shares = new Map<number, number>()
  const admins = [24, 16, 12]
  admins.forEach((share, i) => shares.set(FIRST_OPERATOR_ID + i, share))
  shares.set(HEAVY_OPERATOR_ID, 350)
  range(MEDIUM_COUNT).forEach((i) =>
    shares.set(HEAVY_OPERATOR_ID + 1 + i, 22 + (i % 5) * 4)
  )
  range(SMALL_COUNT).forEach((i) =>
    shares.set(HEAVY_OPERATOR_ID + 1 + MEDIUM_COUNT + i, 14)
  )
  shares.set(EMPTY_OPERATOR_ID, 0)
  shares.set(SYSTEM_OPERATOR_ID, 0)
  const total = [...shares.values()].reduce((sum, share) => sum + share, 0)
  if (total !== 1000) {
    throw new Error(`Le quote degli operatori sommano a ${total}, non 1000`)
  }
  return shares
})()

export function generateUsersAndOperators({ day }: { day: Day }): {
  users: UserRow[]
  operators: OperatorRow[]
} {
  const rng = createRandom("operators")
  const faker = createFaker("operators")
  const users: UserRow[] = []
  const operators: OperatorRow[] = []

  range(ADMIN_COUNT + OPERATORE_COUNT).forEach((position) => {
    const role = position < ADMIN_COUNT ? "ADMIN" : "OPERATORE"
    const id = userIdOf(position)
    const name = faker.person.firstName()
    const surname = faker.person.lastName()
    const createdAt = romeNoon(addDays(day, -rng.int(120, 900)))
    users.push({
      id,
      name: `${name} ${surname}`,
      email: `${slug(name)}.${slug(surname)}.${id.slice(-2)}@${
        role === "ADMIN" ? "mito.test" : "example.com"
      }`,
      emailVerified: createdAt,
      role,
      image: null,
      preferences: null,
    })
    operators.push({
      id: FIRST_OPERATOR_ID + position,
      userId: id,
      name,
      surname,
      createdAt,
      updatedAt: romeNoon(addDays(day, -rng.int(1, 90))),
    })
  })

  // The system operator has no user: it cannot sign in
  const systemAt = romeNoon(addDays(day, -1000))
  operators.push({
    id: SYSTEM_OPERATOR_ID,
    userId: SYSTEM_OPERATOR_USER_ID,
    name: SYSTEM_OPERATOR_NAME,
    surname: null,
    createdAt: systemAt,
    updatedAt: systemAt,
  })

  return { users, operators }
}

/** Largest-remainder split of `total` by per-mille weights (sums to total). */
function splitByShare(total: number, perMille: readonly number[]): number[] {
  const weightSum = perMille.reduce((sum, share) => sum + share, 0)
  const exact = perMille.map((share) => (total * share) / weightSum)
  const counts = exact.map(Math.floor)
  let left = total - counts.reduce((sum, count) => sum + count, 0)
  const byRemainder = range(perMille.length)
    .filter((i) => perMille[i]! > 0)
    .sort((a, b) => exact[b]! - counts[b]! - (exact[a]! - counts[a]!) || a - b)
  for (let k = 0; left > 0; k = (k + 1) % byRemainder.length, left--) {
    counts[byRemainder[k]!]!++
  }
  return counts
}

/**
 * Sets `operatorId` on the customers: 3% without operator, the rest split among
 * the operators by `SHARES_PER_MILLE`, over a seeded shuffle of the customers
 * (not contiguous blocks). Returns new rows.
 */
export function assignCustomers(
  customers: readonly CustomerRow[],
  operators: readonly OperatorRow[]
): CustomerRow[] {
  const rng = createRandom("customer-assignment")
  const operatorIds = operators.map((operator) => operator.id)
  const unassigned = Math.round(customers.length * UNASSIGNED_SHARE)
  const counts = splitByShare(
    customers.length - unassigned,
    operatorIds.map((id) => SHARES_PER_MILLE.get(id) ?? 0)
  )

  const order = rng.shuffle(range(customers.length))
  const assigned: Array<number | null> = customers.map(() => null)
  let cursor = unassigned // the first shuffled customers stay without operator
  counts.forEach((count, i) => {
    for (let k = 0; k < count; k++) assigned[order[cursor++]!] = operatorIds[i]!
  })

  return customers.map((customer, i) => ({
    ...customer,
    operatorId: assigned[i]!,
  }))
}

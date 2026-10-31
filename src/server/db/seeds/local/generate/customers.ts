// Customers of the local seed (AC15, AC16 and the age scenarios U8-U10).
// Pure and seeded: the result depends only on `n` and `day`. Dates are built
// from day strings and `romeNoon`, never from the process time zone.
import { blackListStatus, sourceValues } from "@mito/db/schema/index"
import { LOG_RETENTION_MONTHS } from "@mito/domain/export/period"
import { createHash } from "node:crypto"
import { addDays, romeNoon, subMonthsDay } from "../day"
import type { CustomerRow, Day } from "../types"
import { daysBetween } from "./clock"
import { createFaker, createRandom, range } from "./random"
import { customerScenarioCounts } from "./scenarios"

export const SEED_FILE_NAME = "seed-locale"

/** Months the oldest customer is older than the log retention. */
const CUSTOMER_EXTRA_MONTHS = 24

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const WORK_FIELDS = ["Commercio", "Industria", "Servizi", "Sanita'", "Edilizia"]
const CONTRACTS = ["Indeterminato", "Determinato", "Autonomo", "Pensione"]

const pad = (value: number, length: number) =>
  String(value).padStart(length, "0")

const isLeap = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

/** "MM-dd" of a day. */
const monthDay = (day: Day) => day.slice(5)

/** Slug for an email local part. */
export const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()

type Kind = "person" | "company"

export function generateCustomers({
  n,
  day,
}: {
  n: number
  day: Day
}): CustomerRow[] {
  const rng = createRandom("customers")
  const faker = createFaker("customers")
  const dayYear = Number(day.slice(0, 4))
  const dayMonthDay = monthDay(day)
  const dayBefore = monthDay(addDays(day, -1))
  const dayAfter = monthDay(addDays(day, 1))
  // Customers go back past the log retention, so contacts and log rows that
  // `cleanup-task-event-log` deletes belong to customers that already existed
  const maxAge = daysBetween(
    subMonthsDay(day, LOG_RETENTION_MONTHS + CUSTOMER_EXTRA_MONTHS),
    day
  )

  /** Birth at Rome noon of the given month/day, in a year of 20-80 years ago. */
  const birth = (md: string): { date: Date; year: number } => {
    let year = dayYear - rng.int(20, 80)
    if (md === "02-29") while (!isLeap(year)) year--
    return { date: romeNoon(`${pad(year, 4)}-${md}`), year }
  }
  /** Age on D before the `update` cron adds the birthday of the day. */
  const ageOn = (year: number, md: string) =>
    md < dayMonthDay ? dayYear - year : dayYear - year - 1

  // Coverage first: every source and blacklist value appears, spread over a
  // shuffled order of the customers
  const order = rng.shuffle(range(n))
  const sourceOf: Array<(typeof sourceValues)[number]> = []
  const blacklistOf: Array<(typeof blackListStatus)[number]> = []
  order.forEach((customerIndex, position) => {
    sourceOf[customerIndex] = sourceValues[position % sourceValues.length]!
    blacklistOf[customerIndex] =
      position < blackListStatus.length
        ? blackListStatus[position]!
        : rng.weighted([
            ["whitelisted", 85],
            ["review", 10],
            ["blacklisted", 5],
          ] as const)
  })

  const rows: CustomerRow[] = []
  const kinds: Kind[] = []
  for (let i = 0; i < n; i++) {
    const id = `C${pad(i + 1, 6)}`
    const roll = rng.next()
    // 70% person with fiscal code, 15% person with both, 15% VAT code only
    const kind: Kind = roll < 0.85 ? "person" : "company"
    kinds.push(kind)
    const hasFiscal = roll < 0.85
    const hasVat = roll >= 0.7

    const name = kind === "person" ? faker.person.firstName() : null
    const surname = kind === "person" ? faker.person.lastName() : null
    const city = faker.location.city()
    const fullName =
      kind === "person" ? `${name!} ${surname!}` : faker.company.name()

    let birthdayDate: Date | null = null
    let age: number | null = null
    if (kind === "person" && rng.chance(0.9)) {
      const md = `${pad(rng.int(1, 12), 2)}-${pad(rng.int(1, 28), 2)}`
      const b = birth(md)
      birthdayDate = b.date
      age = rng.chance(0.85) ? ageOn(b.year, md) : null
    } else if (kind === "person" && rng.chance(0.5)) {
      age = rng.int(20, 80)
    }

    const fiscalCode = hasFiscal
      ? [
          ...range(6).map(() => rng.pick([...LETTERS])),
          pad(rng.int(0, 99), 2),
          rng.pick([...LETTERS]),
          pad(rng.int(0, 99), 2),
          rng.pick([...LETTERS]),
          pad(rng.int(0, 999), 3),
          rng.pick([...LETTERS]),
        ].join("")
      : null
    const vatCode = hasVat ? pad(rng.int(0, 99_999_999_999), 11) : null

    const email = rng.chance(0.05)
      ? null
      : kind === "person"
        ? `${slug(name!)}.${slug(surname!)}.${id.toLowerCase()}@${
            rng.chance(0.7) ? "example.com" : "clienti.test"
          }`
        : `info.${id.toLowerCase()}@aziende.test`

    const createdOffset = rng.int(60, maxAge)
    rows.push({
      id,
      fullName,
      name,
      sede: kind === "company" ? city : null,
      surname,
      fiscalCode,
      vatCode,
      email,
      birthdayDate,
      age,
      phoneNumber: `3${rng.int(10, 99)}${pad(rng.int(0, 9_999_999), 7)}`,
      address: faker.location.streetAddress(),
      cap: pad(rng.int(10, 98_999), 5),
      blackListStatus: blacklistOf[i]!,
      comune: city,
      provincia: faker.location.state(),
      tempID: `T${pad(i + 1, 6)}`,
      fileName: SEED_FILE_NAME,
      uniqueHash: createHash("sha256")
        .update(`seed-locale:${id}`)
        .digest("hex"),
      reddito:
        kind === "person" && rng.chance(0.6)
          ? `${rng.int(12, 90) * 1000}.00`
          : null,
      occupazione:
        kind === "person" && rng.chance(0.6) ? faker.person.jobTitle() : null,
      ambitoLavorativo: rng.chance(0.4) ? rng.pick(WORK_FIELDS) : null,
      tipoContratto: rng.chance(0.4) ? rng.pick(CONTRACTS) : null,
      createdAt: romeNoon(addDays(day, -createdOffset)),
      updatedAt: romeNoon(addDays(day, -rng.int(1, 59))),
      lastImportUpdate: romeNoon(addDays(day, -rng.int(32, 92))),
      chatId: null,
      operatorId: null,
      source: sourceOf[i]!,
    })
  }

  // Age scenarios, on customers that are people. A generic customer born on
  // D's month/day by chance is a U8/U9 by rule, which is fine.
  const counts = customerScenarioCounts(n)
  const people = rng.shuffle(range(n).filter((i) => kinds[i] === "person"))
  const queue = (Object.keys(counts) as Array<keyof typeof counts>).flatMap(
    (kind) => range(counts[kind]).map(() => kind)
  )
  if (queue.length > people.length) {
    throw new Error("Troppi scenari di eta' per il numero di clienti")
  }
  queue.forEach((kind, position) => {
    const row = rows[people[position]!]!
    if (kind === "U10c") {
      row.birthdayDate = null
      row.age = position % 2 === 0 ? null : rng.int(20, 80)
      return
    }
    const md =
      kind === "U8" || kind === "U9"
        ? dayMonthDay
        : kind === "U10a"
          ? dayBefore
          : dayAfter
    const b = birth(md)
    row.birthdayDate = b.date
    row.age = kind === "U9" ? null : ageOn(b.year, md)
  })

  return rows
}

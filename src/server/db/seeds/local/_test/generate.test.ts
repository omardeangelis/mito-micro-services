// @vitest-environment node
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { DAYS_PER_RATE } from "@/lib/constants/practice"
import { productMap } from "@/lib/constants/productMap"
import {
  blackListStatus,
  sourceValues,
  stateEnum,
} from "@/server/db/schema/index"
import { customerRoleEnum } from "@/server/db/schema/relations/customerToPratica"
import { addDays, romeDay, romeNoon, subMonthsDay } from "../day"
import { type Dataset, type Day, type PracticeRow } from "../types"
import { generateDataset, MIN_CUSTOMERS } from "../generate"
import { importRates } from "../importRates"

/** An ordinary day, in the past: the tests never depend on today. */
const DAY = "2026-10-14"

/** How many links each customer has. */
const linksPerCustomer = (dataset: Dataset) => {
  const counts = new Map<string, number>()
  for (const customer of dataset.customers) counts.set(customer.id, 0)
  for (const link of dataset.customerToPratica) {
    counts.set(link.customerId, (counts.get(link.customerId) ?? 0) + 1)
  }
  return counts
}

const MS_PER_DAY = 86_400_000
const root = resolve(__dirname, "../../../../../..")

/** Whole days from `from` to `to` (day strings). */
const daysBetween = (from: Day, to: Day) =>
  Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY)

/** Due date of the next rate: what the `update` cron compares with D. */
const dueDay = (p: PracticeRow) =>
  addDays(romeDay(p.dataLiquidazione), p.ratePagate * DAYS_PER_RATE)

/** "MM-dd" of a birthday or any other instant, in Rome. */
const monthDay = (date: Date) => romeDay(date).slice(5)

const isWhole = (value: string | null) =>
  value !== null && /^-?\d+(\.00)?$/.test(value)

const rolesBy = (dataset: Dataset, key: "customerId" | "praticaId") => {
  const map = new Map<string, string[]>()
  for (const link of dataset.customerToPratica) {
    const list = map.get(link[key]) ?? []
    list.push(link.customerRole ?? "")
    map.set(link[key], list)
  }
  return map
}

const count = (items: readonly string[]) => {
  const counts: Record<string, number> = {}
  for (const item of items) counts[item] = (counts[item] ?? 0) + 1
  return counts
}

/** Practices the `update` cron selects on D, and the last import is old. */
const dueOnD = (dataset: Dataset, day: Day) =>
  dataset.practices.filter((p) => dueDay(p) === day)
const importAge = (p: PracticeRow, day: Day) =>
  daysBetween(romeDay(p.lastImportUpdate!), day)

/** The assertions that hold for every N and every D. */
function registerChecks(get: () => Dataset, n: number, day: Day) {
  const six = Math.floor(n / 6)
  const dayMonthDay = day.slice(5)

  it("has the AC8 split of customers by number of links", () => {
    const histogram = { 1: 0, 2: 0, 3: 0 } as Record<number, number>
    for (const links of linksPerCustomer(get()).values()) {
      histogram[links] = (histogram[links] ?? 0) + 1
    }
    expect(histogram).toEqual({
      1: n - six - Math.floor((2 * n) / 6),
      2: Math.floor((2 * n) / 6),
      3: six,
    })
    if (n === 300) expect(histogram).toEqual({ 1: 150, 2: 100, 3: 50 })
  })

  it("splits the single-link customers by role 50% / 25% / rest (AC10)", () => {
    const dataset = get()
    const byCustomer = rolesBy(dataset, "customerId")
    const singles = [...byCustomer.values()].filter((r) => r.length === 1)
    const g = singles.length
    expect(count(singles.map((r) => r[0]!))).toEqual({
      Intestatario: Math.floor(g / 2),
      Coobbligato: Math.floor(g / 4),
      Garante: g - Math.floor(g / 2) - Math.floor(g / 4),
    })
    if (n === 10_000) {
      expect(count(singles.map((r) => r[0]!))).toEqual({
        Intestatario: 2_500,
        Coobbligato: 1_250,
        Garante: 1_251,
      })
    }
  })

  it("gives every practice one Intestatario, at most one Coobbligato and one Garante (AC9)", () => {
    const dataset = get()
    const customerIds = new Set(dataset.customers.map((c) => c.id))
    const practiceIds = new Set(dataset.practices.map((p) => p.praticaId))
    const pairs = new Set<string>()
    for (const link of dataset.customerToPratica) {
      expect(customerIds.has(link.customerId)).toBe(true)
      expect(practiceIds.has(link.praticaId)).toBe(true)
      expect(customerRoleEnum).toContain(link.customerRole)
      pairs.add(`${link.customerId}|${link.praticaId}`)
    }
    expect(pairs.size).toBe(dataset.customerToPratica.length)
    const byPractice = rolesBy(dataset, "praticaId")
    expect(byPractice.size).toBe(dataset.practices.length)
    for (const roles of byPractice.values()) {
      const counts = count(roles)
      expect(counts.Intestatario).toBe(1)
      expect(counts.Coobbligato ?? 0).toBeLessThanOrEqual(1)
      expect(counts.Garante ?? 0).toBeLessThanOrEqual(1)
      expect(roles.length).toBeLessThanOrEqual(3)
    }
  })

  it("mixes the roles of the customers with 2 or 3 links (AC11)", () => {
    const multi = [...rolesBy(get(), "customerId").values()].filter(
      (r) => r.length >= 2
    )
    expect(multi.some((r) => r.every((x) => x === "Intestatario"))).toBe(true)
    expect(
      multi.some(
        (r) =>
          r.includes("Intestatario") &&
          (r.includes("Garante") || r.includes("Coobbligato"))
      )
    ).toBe(true)
    expect(multi.some((r) => !r.includes("Intestatario"))).toBe(true)
  })

  it("has practices of every composition (AC12)", () => {
    const compositions = new Set(
      [...rolesBy(get(), "praticaId").values()].map((r) =>
        [...r].sort().join("+")
      )
    )
    expect(compositions).toContain("Intestatario")
    expect(compositions).toContain("Coobbligato+Intestatario")
    expect(compositions).toContain("Garante+Intestatario")
    expect(compositions).toContain("Coobbligato+Garante+Intestatario")
  })

  it("covers every state, product and is_wave value, with one product row each (AC13)", () => {
    const { practices, products } = get()
    expect(new Set(practices.map((p) => p.state))).toEqual(new Set(stateEnum))
    const codes = [...productMap.keys()]
    expect(new Set(practices.map((p) => p.productId))).toEqual(new Set(codes))
    expect(products.map((p) => p.productCode)).toEqual(codes)
    expect(products.map((p) => p.id)).toEqual(codes.map((_, i) => 1000 + i))
    for (const product of products) {
      const [label, type] = productMap.get(product.productCode as never)!
      expect(product.productLabel).toBe(label)
      expect(product.productType).toBe(type)
      expect(product.createdAt).toBeInstanceOf(Date)
      expect(product.updatedAt).toBeInstanceOf(Date)
    }
    expect(practices.some((p) => p.isWave === true)).toBe(true)
    expect(practices.some((p) => p.isWave === false)).toBe(true)
  })

  it("keeps ids, amounts and nulls of the practices as specified", () => {
    const { practices } = get()
    expect(practices.map((p) => p.id)).toEqual(
      practices.map((_, i) => 1000 + i)
    )
    expect(new Set(practices.map((p) => p.praticaId)).size).toBe(
      practices.length
    )
    for (const p of practices) {
      expect(p.chatId).toBeNull()
      expect(p.operatorId).toBeNull()
      for (const amount of [
        p.importoRata,
        p.importoFinanziato,
        p.importoErogato,
        p.debitoResiduo,
      ]) {
        if (typeof amount === "string") expect(isWhole(amount)).toBe(true)
      }
      expect(Number(p.importoFinanziato)).toBe(
        p.rateTotali * Number(p.importoRata)
      )
      expect(p.dataLiquidazione.getTime()).toBe(
        romeNoon(romeDay(p.dataLiquidazione)).getTime()
      )
    }
  })

  it("computes rate_pagate and debito_residuo like the import outside the scenarios, and never selects a generic practice (AC14)", () => {
    const { practices } = get()
    for (const p of practices) {
      expect(p.ratePagate).toBeLessThanOrEqual(p.rateTotali)
      const due = dueDay(p)
      const rata = Number(p.importoRata)
      if (due === day) {
        // a practice selected by `update`: one of the shapes U1-U6, by rule
        const old = importAge(p, day) >= 32
        const recent = importAge(p, day) <= 28
        expect(old || recent).toBe(true)
        expect(p.ratePagate).toBeGreaterThanOrEqual(1)
        if (p.debitoResiduo === null) {
          expect(old).toBe(true) // U6
        } else if (recent) {
          // U3
          expect(p.debitoResiduo).toBe(
            ((p.rateTotali - p.ratePagate) * rata).toFixed(2)
          )
        } else if (p.state === "Liquidata") {
          if (p.ratePagate === p.rateTotali) {
            expect(Number(p.debitoResiduo)).toBe(rata) // U4
          } else {
            // U1, U2
            expect(Number(p.debitoResiduo)).toBe(
              (p.rateTotali - p.ratePagate) * rata
            )
          }
        } else {
          // U5
          expect(p.state).not.toBe("Liquidata")
          expect(p.ratePagate).toBeLessThan(p.rateTotali)
          expect(Number(p.debitoResiduo)).toBe(
            (p.rateTotali - p.ratePagate) * rata
          )
        }
        continue
      }
      if (
        due === addDays(day, -1) ||
        due === addDays(day, 1) ||
        romeDay(p.dataLiquidazione) === day
      ) {
        // U7a, U7b, U11: exempt from the import's rule, but coherent
        expect(Number(p.debitoResiduo)).toBe(
          (p.rateTotali - p.ratePagate) * rata
        )
        continue
      }
      expect(romeDay(p.dataLiquidazione) <= subMonthsDay(day, 2)).toBe(true)
      const rates = importRates(p.dataLiquidazione, p.rateTotali, rata, day)
      expect(p.ratePagate).toBe(rates.ratePagate)
      expect(p.debitoResiduo).toBe(rates.debitoResiduo)
      if (p.state === "Liquidata")
        expect(p.ratePagate).toBeLessThan(p.rateTotali)
    }
  })

  it("never writes a last import between 29 and 31 days before D", () => {
    const { practices, customers } = get()
    for (const row of [...practices, ...customers]) {
      const last = row.lastImportUpdate!
      const age = daysBetween(romeDay(last), day)
      expect(age).toBeGreaterThanOrEqual(0)
      expect(age < 29 || age > 31).toBe(true)
      expect(last.getTime()).toBe(romeNoon(romeDay(last)).getTime())
    }
  })

  it("has one practice for each scenario of the update cron, U1-U7 and U11", () => {
    const { practices } = get()
    const selected = dueOnD(get(), day)
    const old = (p: PracticeRow) => importAge(p, day) >= 32
    const shapes: Record<string, (p: PracticeRow) => boolean> = {
      U1: (p) =>
        p.state === "Liquidata" &&
        old(p) &&
        p.debitoResiduo !== null &&
        p.ratePagate >= 1 &&
        p.ratePagate < p.rateTotali - 1,
      U2: (p) =>
        p.state === "Liquidata" &&
        old(p) &&
        p.debitoResiduo !== null &&
        p.ratePagate === p.rateTotali - 1,
      U3: (p) => importAge(p, day) <= 28,
      U4: (p) =>
        p.state === "Liquidata" && old(p) && p.ratePagate === p.rateTotali,
      U6: (p) => old(p) && p.debitoResiduo === null,
    }
    for (const [name, shape] of Object.entries(shapes)) {
      expect(selected.some(shape), name).toBe(true)
    }
    for (const state of stateEnum.filter((s) => s !== "Liquidata")) {
      expect(
        selected.some(
          (p) =>
            p.state === state &&
            old(p) &&
            p.debitoResiduo !== null &&
            p.ratePagate < p.rateTotali
        ),
        `U5 ${state}`
      ).toBe(true)
    }
    expect(practices.some((p) => dueDay(p) === addDays(day, -1))).toBe(true) // U7a
    expect(practices.some((p) => dueDay(p) === addDays(day, 1))).toBe(true) // U7b
    expect(
      practices.some(
        (p) => romeDay(p.dataLiquidazione) === day && p.ratePagate >= 1
      )
    ).toBe(true) // U11
    // U11 is not selected: its due date is never D
    for (const p of practices) {
      if (romeDay(p.dataLiquidazione) === day && p.ratePagate >= 1) {
        expect(dueDay(p)).not.toBe(day)
      }
    }
  })

  it("has the customers of the age scenarios U8-U10", () => {
    const { customers } = get()
    const born = (md: string) =>
      customers.filter((c) => c.birthdayDate && monthDay(c.birthdayDate) === md)
    expect(born(dayMonthDay).some((c) => c.age !== null)).toBe(true) // U8
    expect(born(dayMonthDay).some((c) => c.age === null)).toBe(true) // U9
    expect(born(addDays(day, -1).slice(5)).length).toBeGreaterThan(0) // U10a
    expect(born(addDays(day, 1).slice(5)).length).toBeGreaterThan(0) // U10b
    expect(customers.some((c) => c.birthdayDate === null)).toBe(true) // U10c
    for (const c of customers) {
      if (c.birthdayDate) {
        expect(c.birthdayDate.getTime()).toBe(
          romeNoon(romeDay(c.birthdayDate)).getTime()
        )
        const year = Number(romeDay(c.birthdayDate).slice(0, 4))
        if (monthDay(c.birthdayDate) === "02-29") {
          expect((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0).toBe(
            true
          )
        }
      }
    }
  })

  it("has varied, fake and unique customers (AC15, AC16)", () => {
    const { customers } = get()
    expect(new Set(customers.map((c) => c.blackListStatus))).toEqual(
      new Set(blackListStatus)
    )
    expect(new Set(customers.map((c) => c.source))).toEqual(
      new Set(sourceValues)
    )
    expect(customers).toHaveLength(n)
    expect(customers.map((c) => c.id)).toEqual(
      [...customers.map((c) => c.id)].sort()
    )
    for (const key of ["id", "tempID", "uniqueHash"] as const) {
      expect(new Set(customers.map((c) => c[key])).size).toBe(n)
    }
    for (const c of customers) {
      expect(c.fiscalCode !== null || c.vatCode !== null).toBe(true)
      if (c.fiscalCode !== null) expect(c.fiscalCode).toMatch(/^[A-Z0-9]{16}$/)
      if (c.vatCode !== null) expect(c.vatCode).toMatch(/^\d{11}$/)
      if (c.email !== null) {
        expect(c.email).toMatch(/@(example\.com|[a-z-]+\.test)$/)
      }
      expect(c.chatId).toBeNull()
      expect(c.operatorId).toBeNull()
    }
    expect(customers.some((c) => c.fiscalCode === null)).toBe(true)
    expect(customers.some((c) => c.fiscalCode !== null)).toBe(true)
  })

  it("values every timestamp from D, none after D", () => {
    const { customers, practices, products } = get()
    const end = romeNoon(day).getTime()
    for (const row of [...customers, ...practices, ...products]) {
      for (const key of [
        "createdAt",
        "updatedAt",
        "lastImportUpdate",
      ] as const) {
        if (!(key in row)) continue
        const value = (row as Record<string, unknown>)[key]
        expect(value).toBeInstanceOf(Date)
        expect((value as Date).getTime()).toBeLessThanOrEqual(end)
      }
    }
  })

  it("leaves the arrays of later steps empty", () => {
    const dataset = get()
    for (const key of [
      "users",
      "operators",
      "chats",
      "messages",
      "alerts",
      "tasks",
      "taskEventLog",
    ] as const) {
      expect(dataset[key]).toEqual([])
    }
  })
}

describe("generateDataset at N = 10,000", () => {
  let dataset: Dataset

  beforeAll(() => {
    dataset = generateDataset({ n: 10_000, day: DAY })
  }, 120_000)

  it("has 1,666 customers with 3 links, 3,333 with 2 and 5,001 with 1 (AC8)", () => {
    const histogram = { 1: 0, 2: 0, 3: 0 } as Record<number, number>
    for (const count of linksPerCustomer(dataset).values()) {
      histogram[count] = (histogram[count] ?? 0) + 1
    }
    expect(histogram).toEqual({ 1: 5_001, 2: 3_333, 3: 1_666 })
  })

  registerChecks(() => dataset, 10_000, DAY)

  it("has at least 200 practices selected by update and 100 customers born on D's month and day (AC30)", () => {
    expect(dueOnD(dataset, DAY).length).toBeGreaterThanOrEqual(200)
    const born = dataset.customers.filter(
      (c) => c.birthdayDate && monthDay(c.birthdayDate) === DAY.slice(5)
    )
    expect(born.length).toBeGreaterThanOrEqual(100)
  })

  it("generates in a few seconds", () => {
    const started = performance.now()
    generateDataset({ n: 10_000, day: DAY })
    expect(performance.now() - started).toBeLessThan(15_000)
  }, 60_000)
})

describe("generateDataset at N = 300", () => {
  let dataset: Dataset

  beforeAll(() => {
    dataset = generateDataset({ n: MIN_CUSTOMERS, day: DAY })
  }, 60_000)

  registerChecks(() => dataset, 300, DAY)

  it("has 50 customers with 3 links, 100 with 2 and 150 with 1", () => {
    const histogram = { 1: 0, 2: 0, 3: 0 } as Record<number, number>
    for (const links of linksPerCustomer(dataset).values()) {
      histogram[links] = (histogram[links] ?? 0) + 1
    }
    expect(histogram).toEqual({ 1: 150, 2: 100, 3: 50 })
  })
})

describe.each(["2026-05-31", "2028-02-29", "2027-03-01", "2026-03-29"])(
  "generateDataset at N = 300 for D = %s",
  (day) => {
    let dataset: Dataset

    beforeAll(() => {
      dataset = generateDataset({ n: 300, day })
    }, 60_000)

    registerChecks(() => dataset, 300, day)
  }
)

describe("generateDataset arguments", () => {
  it.each([299, 0, -5, 300.5, Number.NaN])("throws for n = %s", (n) => {
    expect(() => generateDataset({ n, day: DAY })).toThrow(/clienti/)
  })

  it("accepts the minimum", () => {
    expect(() => generateDataset({ n: 300, day: DAY })).not.toThrow()
  })
})

describe("generateDataset determinism (AC5)", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("gives the same dataset whatever time the clock reads", () => {
    // 2026-10-14 is CEST (UTC+2): 01:30 Rome is the evening of the 13th in UTC
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-13T23:30:00.000Z"))
    const early = generateDataset({ n: 300, day: DAY })
    vi.setSystemTime(new Date("2026-10-14T21:30:00.000Z"))
    const late = generateDataset({ n: 300, day: DAY })
    expect(late).toEqual(early)
    expect(early.customers.length).toBe(300)
  })

  it("gives the same dataset in processes with another time zone", () => {
    const days = ["2026-10-14", "2026-03-29", "2028-02-29"]
    const run = (tz: string) => {
      const out = execFileSync(
        resolve(root, "node_modules/.bin/tsx"),
        [
          "--tsconfig",
          resolve(root, "tsconfig.json"),
          resolve(__dirname, "generateHashChild.ts"),
          ...days,
        ],
        {
          cwd: root,
          env: { ...process.env, TZ: tz, NODE_ENV: "test" },
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
        }
      )
      const line = out.split("\n").find((l) => l.startsWith("HASHES:"))
      if (!line) throw new Error(`Output del figlio senza HASHES:\n${out}`)
      return JSON.parse(line.slice("HASHES:".length)) as {
        offset: number
        hashes: Record<string, string>
      }
    }
    const rome = run("Europe/Rome")
    const utc = run("UTC")
    expect(rome.offset).toBe(-60) // the child really runs in Europe/Rome
    expect(utc.offset).toBe(0)
    const here = Object.fromEntries(
      days.map((day) => [
        day,
        createHash("sha256")
          .update(JSON.stringify(generateDataset({ n: 300, day })))
          .digest("hex"),
      ])
    )
    expect(rome.hashes).toEqual(here)
    expect(utc.hashes).toEqual(here)
  }, 120_000)
})

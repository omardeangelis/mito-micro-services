// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { SYSTEM_OPERATOR_USER_ID } from "@/lib/constants/operator"
import { romeNoon } from "../day"
import { type Dataset } from "../types"
import { generateDataset } from "../generate"
import {
  ACTIVE_CONTACT_SHARE,
  EMPTY_OPERATOR_ID,
  HEAVY_OPERATOR_ID,
  SYSTEM_OPERATOR_ID,
} from "../generate/operators"

const DAY = "2026-10-14"

describe("users and operators at N = 10,000", () => {
  let dataset: Dataset

  beforeAll(() => {
    dataset = generateDataset({ n: 10_000, day: DAY })
  }, 120_000)

  it("has 25 OPERATORE, 3 ADMIN, 29 operators and one system operator (AC17)", () => {
    const roles = dataset.users.map((user) => user.role)
    expect(roles.filter((role) => role === "OPERATORE")).toHaveLength(25)
    expect(roles.filter((role) => role === "ADMIN")).toHaveLength(3)
    expect(dataset.operators).toHaveLength(29)
    expect(
      dataset.operators.filter((operator) => operator.userId === "system")
    ).toHaveLength(1)
  })
})

/** Customers per operator id (operators without customers are absent). */
const loadOf = (dataset: Dataset) => {
  const counts = new Map<number, number>()
  for (const c of dataset.customers) {
    if (typeof c.operatorId === "number") {
      counts.set(c.operatorId, (counts.get(c.operatorId) ?? 0) + 1)
    }
  }
  return counts
}

describe.each([300, 10_000])(
  "users, operators and assignment at N = %i",
  (n) => {
    let dataset: Dataset

    beforeAll(() => {
      dataset = generateDataset({ n, day: DAY })
    }, 120_000)

    const operatorOf = (userId: string) =>
      dataset.operators.filter((operator) => operator.userId === userId)

    it("has 28 users, 29 operators and the system operator without a user (AC17)", () => {
      const roles = dataset.users.map((user) => user.role)
      expect(roles.filter((role) => role === "OPERATORE")).toHaveLength(25)
      expect(roles.filter((role) => role === "ADMIN")).toHaveLength(3)
      expect(dataset.users).toHaveLength(28)
      expect(dataset.operators).toHaveLength(29)
      expect(new Set(dataset.users.map((u) => u.id)).size).toBe(28)
      expect(new Set(dataset.operators.map((o) => o.userId)).size).toBe(29)
      expect(new Set(dataset.operators.map((o) => o.id)).size).toBe(29)
      expect(dataset.operators.map((o) => o.id)).toEqual(
        Array.from({ length: 29 }, (_, i) => 1000 + i)
      )
      for (const user of dataset.users)
        expect(operatorOf(user.id)).toHaveLength(1)

      expect(dataset.users.some((u) => u.id === SYSTEM_OPERATOR_USER_ID)).toBe(
        false
      )
      const [system] = operatorOf(SYSTEM_OPERATOR_USER_ID)
      expect(system?.id).toBe(SYSTEM_OPERATOR_ID)
      expect(system?.name).toBe("Sistema")
    })

    it("uses only example.com or .test emails and names every user (AC16)", () => {
      for (const user of dataset.users) {
        expect(user.email).toMatch(/@(example\.com|[a-z.-]+\.test)$/)
        expect(user.name).toBeTruthy()
      }
      expect(new Set(dataset.users.map((u) => u.email)).size).toBe(28)
    })

    it("values every timestamp from D, none after D", () => {
      const end = romeNoon(DAY).getTime()
      for (const user of dataset.users) {
        expect(user.emailVerified).toBeInstanceOf(Date)
        expect(user.emailVerified!.getTime()).toBeLessThanOrEqual(end)
      }
      for (const operator of dataset.operators) {
        for (const value of [operator.createdAt, operator.updatedAt]) {
          expect(value).toBeInstanceOf(Date)
          expect(value!.getTime()).toBeLessThanOrEqual(end)
        }
        expect(operator.updatedAt!.getTime()).toBeGreaterThanOrEqual(
          operator.createdAt!.getTime()
        )
      }
    })

    it("leaves 3% of the customers without operator (AC18: at least 2%)", () => {
      const without = dataset.customers.filter((c) => c.operatorId === null)
      expect(Math.abs(without.length - n * 0.03)).toBeLessThanOrEqual(1)
      expect(without.length / n).toBeGreaterThanOrEqual(0.02)
    })

    it("only assigns existing non-system operators", () => {
      const valid = new Set(
        dataset.operators
          .filter((o) => o.userId !== SYSTEM_OPERATOR_USER_ID)
          .map((o) => o.id)
      )
      for (const c of dataset.customers) {
        if (typeof c.operatorId === "number")
          expect(valid.has(c.operatorId)).toBe(true)
      }
      expect(loadOf(dataset).has(SYSTEM_OPERATOR_ID)).toBe(false)
    })

    it("gives one OPERATORE 35%, 18 OPERATORE 2%-8%, one none, an ADMIN some", () => {
      const load = loadOf(dataset)
      const assigned = dataset.customers.filter(
        (c) => typeof c.operatorId === "number"
      )
      const share = (operatorId: number) =>
        (load.get(operatorId) ?? 0) / assigned.length
      const operatore = dataset.operators.filter((operator) => {
        const user = dataset.users.find((u) => u.id === operator.userId)
        return user?.role === "OPERATORE"
      })
      const admins = dataset.operators.filter((operator) => {
        const user = dataset.users.find((u) => u.id === operator.userId)
        return user?.role === "ADMIN"
      })

      expect(share(HEAVY_OPERATOR_ID)).toBeGreaterThanOrEqual(0.349)
      expect(share(HEAVY_OPERATOR_ID)).toBeLessThanOrEqual(0.351)
      expect(
        operatore.filter((o) => share(o.id) >= 0.02 && share(o.id) <= 0.08)
      ).toHaveLength(18)
      const empty = operatore.filter((o) => !load.has(o.id))
      expect(empty.map((o) => o.id)).toEqual([EMPTY_OPERATOR_ID])
      expect(admins.some((o) => load.has(o.id))).toBe(true)
      expect([...load.values()].reduce((a, b) => a + b, 0)).toBe(
        assigned.length
      )
    })

    it("keeps the AC18 loads if active contacts follow the customers", () => {
      // Same share of active contacts for every customer, with or without operator
      expect(ACTIVE_CONTACT_SHARE).toBeGreaterThan(0)
      const load = loadOf(dataset)
      const active = (operatorId: number) =>
        (load.get(operatorId) ?? 0) / dataset.customers.length
      expect(active(HEAVY_OPERATOR_ID)).toBeGreaterThanOrEqual(0.33)
      const medium = [...load.keys()].filter(
        (id) => active(id) >= 0.01 && active(id) <= 0.1
      )
      expect(medium.length).toBeGreaterThanOrEqual(15)
    })

    it("does not assign in contiguous blocks of ids", () => {
      const heavy = dataset.customers
        .map((c, i) => (c.operatorId === HEAVY_OPERATOR_ID ? i : -1))
        .filter((i) => i >= 0)
      const span = heavy[heavy.length - 1]! - heavy[0]! + 1
      expect(span).toBeGreaterThan(heavy.length * 2)
    })
  }
)

describe("users, operators and assignment determinism (AC5)", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("gives the same users, operators and assignment whatever the clock reads", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-13T23:30:00.000Z"))
    const early = generateDataset({ n: 300, day: DAY })
    vi.setSystemTime(new Date("2026-10-14T21:30:00.000Z"))
    const late = generateDataset({ n: 300, day: DAY })
    expect(late.users).toEqual(early.users)
    expect(late.operators).toEqual(early.operators)
    expect(late.customers.map((c) => c.operatorId)).toEqual(
      early.customers.map((c) => c.operatorId)
    )
    expect(late).toEqual(early)
  })
})

// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { SEED_ACCOUNTS } from "@mito/server/betterAuth/devLogin"
import { operatorDayFailures } from "../verify"
import { generateDataset } from "../generate"
import { FULL_DAY, TYPICAL_DAY } from "../generate/homeDay"
import {
  ADMIN_COUNT,
  FULL_DAY_OPERATOR_ID,
  HEAVY_OPERATOR_ID,
  TYPICAL_DAY_OPERATOR_ID,
} from "../generate/operators"
import { romeDay } from "../day"
import type { Dataset } from "../types"

const DAY = "2026-10-14"

describe("the day of the two operators of the home (T14) at N = 10,000", () => {
  let dataset: Dataset

  beforeAll(() => {
    dataset = generateDataset({ n: 10_000, day: DAY })
  }, 120_000)

  const failures = () =>
    operatorDayFailures({
      day: DAY,
      tasks: dataset.tasks,
      alerts: dataset.alerts,
      customers: dataset.customers,
      log: dataset.taskEventLog,
    })

  it("gives the full-day operator its volumes and the typical one its calls", () => {
    expect(failures()).toEqual([])
    const calls = (id: number) =>
      dataset.taskEventLog.filter(
        (row) =>
          row.action === "call" &&
          row.actorOperatorId === id &&
          romeDay(row.createdAt!) === DAY
      ).length
    expect(calls(FULL_DAY_OPERATOR_ID)).toBeGreaterThanOrEqual(FULL_DAY.calls)
    expect(calls(TYPICAL_DAY_OPERATOR_ID)).toBe(TYPICAL_DAY.calls)
  })

  it("gives the team of the admin home people with calls on D, an admin among them, and one with more than 6 overdue", () => {
    const todayCalls = dataset.taskEventLog.filter(
      (row) => row.action === "call" && romeDay(row.createdAt!) === DAY
    )
    const callers = new Set(todayCalls.map((row) => row.actorOperatorId))
    expect(callers.size).toBeGreaterThanOrEqual(5)
    const admins = dataset.operators
      .slice(0, ADMIN_COUNT)
      .map((operator) => operator.id)
    expect(admins.some((id) => callers.has(id))).toBe(true)
    const outcomes = new Set(todayCalls.map((row) => row.outcome))
    expect(outcomes.size).toBeGreaterThanOrEqual(3)
    expect(failures()).toEqual([])
  })

  it("makes the check fail when a volume is missing", () => {
    const withoutCalls = operatorDayFailures({
      day: DAY,
      tasks: dataset.tasks,
      alerts: dataset.alerts,
      customers: dataset.customers,
      log: dataset.taskEventLog.filter((row) => row.action !== "call"),
    })
    expect(withoutCalls.map((each) => each.column)).toEqual([
      "chiamate",
      "chiamate",
    ])
  })

  it("keeps the two operators plain OPERATORE, the heavy one the same share", () => {
    expect(FULL_DAY_OPERATOR_ID).toBe(HEAVY_OPERATOR_ID)
    const roles = new Map(
      dataset.operators.map((o) => [
        o.id,
        dataset.users.find((u) => u.id === o.userId)?.role,
      ])
    )
    expect(roles.get(FULL_DAY_OPERATOR_ID)).toBe("OPERATORE")
    expect(roles.get(TYPICAL_DAY_OPERATOR_ID)).toBe("OPERATORE")
    const share = dataset.customers.filter(
      (c) => c.operatorId === FULL_DAY_OPERATOR_ID
    ).length
    // 35% of the 97% of the customers that have an operator, as before
    expect(share / dataset.customers.length).toBeCloseTo(0.3395, 3)
  })

  it("signs in with the quick login as the operator of the typical day", () => {
    const typical = dataset.operators.find(
      ({ id }) => id === TYPICAL_DAY_OPERATOR_ID
    )

    expect(typical?.userId).toBe(SEED_ACCOUNTS.typicalOperator)
  })

  it("moves the contact with its customer, never its history", () => {
    const customers = new Map(dataset.customers.map((c) => [c.id, c]))
    for (const task of dataset.tasks.filter((t) => t.isActive)) {
      expect(task.operatorId ?? null).toBe(
        customers.get(task.customerId!)!.operatorId ?? null
      )
    }
  })
})

// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { addDays } from "../day"
import { createDayClock } from "../generate/clock"
import { generateDataset } from "../generate"
import {
  ASSIGNED_DEADLINE_DAYS,
  INACTIVE_LAST_CALL_OFFSET,
  INACTIVE_OPERATOR_ID,
  WAVES,
} from "../generate/waves"
import type { Dataset } from "../types"

const DAY = "2026-10-14"
const TO_DO = new Set(["chiamare", "non risponde"])

describe.each([300, 10_000])("the Waves at N = %i", (n) => {
  let dataset: Dataset
  const clock = createDayClock(DAY)

  beforeAll(() => {
    dataset = generateDataset({ n, day: DAY })
  }, 120_000)

  const customerOf = (id: string) =>
    dataset.customers.find((customer) => customer.id === id)!
  const membersOf = (name: keyof typeof WAVES) =>
    dataset.importRunCustomers.filter((row) => row.runId === WAVES[name].id)
  const runOf = (name: keyof typeof WAVES) =>
    dataset.importRuns.find((run) => run.id === WAVES[name].id)!
  const activeOf = (customerId: string) =>
    dataset.tasks.find((t) => t.isActive && t.customerId === customerId)
  const toDoOf = (name: keyof typeof WAVES) =>
    membersOf(name).filter((row) => {
      const task = activeOf(row.customerId)
      return (
        task?.operatorId != null &&
        task.operatorId !== undefined &&
        TO_DO.has(task.state ?? "")
      )
    })

  it("has five completed Wave imports, one row per customer and run", () => {
    expect(dataset.importRuns).toHaveLength(5)
    for (const run of dataset.importRuns) {
      expect(run.format).toBe("wave")
      expect(run.status).toBe("completed")
    }
    const keys = dataset.importRunCustomers.map(
      (row) => `${row.runId}|${row.customerId}`
    )
    expect(new Set(keys).size).toBe(keys.length)
    const ids = new Set(dataset.customers.map((c) => c.id))
    for (const row of dataset.importRunCustomers) {
      expect(ids.has(row.customerId)).toBe(true)
    }
    for (const name of Object.keys(WAVES) as (keyof typeof WAVES)[]) {
      expect(runOf(name).fileName).toBe(WAVES[name].fileName)
      expect(membersOf(name).length).toBeGreaterThan(0)
      expect(membersOf(name).length).toBeLessThanOrEqual(400)
    }
  })

  it("«nuova» has no deadline, new customers without operator and existing ones", () => {
    expect(runOf("nuova").deadline).toBeNull()
    const created = membersOf("nuova").filter((row) => row.created === true)
    expect(created.length).toBeGreaterThan(0)
    for (const row of created) {
      expect(customerOf(row.customerId).operatorId ?? null).toBeNull()
    }
    expect(
      membersOf("nuova").filter((row) => row.created === false).length
    ).toBeGreaterThan(0)
    expect(runOf("nuova").customersCreated).toBe(created.length)
  })

  it("«promo» has no deadline and every customer has an operator", () => {
    expect(runOf("promo").deadline).toBeNull()
    for (const row of membersOf("promo")) {
      expect(customerOf(row.customerId).operatorId ?? null).not.toBeNull()
    }
  })

  it("«assegnata» ends in the future, with to-do over several operators and some customers without operator", () => {
    expect(runOf("assegnata").deadline).toBe(
      addDays(DAY, ASSIGNED_DEADLINE_DAYS)
    )
    const operators = new Set(
      toDoOf("assegnata").map((row) => activeOf(row.customerId)!.operatorId)
    )
    expect(operators.size).toBeGreaterThanOrEqual(n === 300 ? 5 : 15)
    expect(
      membersOf("assegnata").filter(
        (row) => customerOf(row.customerId).operatorId == null
      ).length
    ).toBeGreaterThan(0)
  })

  it("«scaduta» ended yesterday, with to-do of the inactive operator", () => {
    expect(runOf("scaduta").deadline).toBe(addDays(DAY, -1))
    expect(
      toDoOf("scaduta").filter(
        (row) => activeOf(row.customerId)!.operatorId === INACTIVE_OPERATOR_ID
      ).length
    ).toBeGreaterThan(0)
  })

  it("has a rebuilt Wave with `created` NULL and no counts", () => {
    const run = runOf("ricostruita")
    expect(run.deadline).toBeNull()
    expect(run.customersCreated).toBeNull()
    for (const row of membersOf("ricostruita")) expect(row.created).toBeNull()
  })

  it("gives the operators different paces and makes one inactive (T20)", () => {
    const calls = dataset.taskEventLog.filter((row) => row.action === "call")
    const callsByOperator = new Map<number, Map<number, number>>()
    const teamDays = new Set<number>()
    for (const row of calls) {
      const offset = clock.offsetOf(row.createdAt as Date)
      if (offset < 1 || offset > 30) continue
      teamDays.add(offset)
      const days =
        callsByOperator.get(row.actorOperatorId) ?? new Map<number, number>()
      days.set(offset, (days.get(offset) ?? 0) + 1)
      callsByOperator.set(row.actorOperatorId, days)
    }
    // The pace: calls divided by the days with at least one
    const paces = new Set(
      [...callsByOperator.values()].map((days) =>
        Math.round(
          [...days.values()].reduce((sum, c) => sum + c, 0) / days.size
        )
      )
    )
    // Paces follow the operators' loads: more of them with more customers
    expect(paces.size).toBeGreaterThanOrEqual(n === 300 ? 2 : 4)

    const own = callsByOperator.get(INACTIVE_OPERATOR_ID)!
    const last = Math.min(...own.keys())
    expect(last).toBe(INACTIVE_LAST_CALL_OFFSET)
    const workedSince = [...teamDays].filter((offset) => offset < last)
    expect(workedSince.length).toBeGreaterThanOrEqual(7)
  })

  it("keeps the log in time order, numbered without gaps from 1000", () => {
    const log = dataset.taskEventLog
    log.forEach((row, k) => {
      expect(row.id).toBe(1000 + k)
      if (k > 0) {
        expect((row.createdAt as Date).getTime()).toBeGreaterThanOrEqual(
          (log[k - 1]!.createdAt as Date).getTime()
        )
      }
    })
    const requests = log.map((row) => row.requestId).filter(Boolean)
    expect(new Set(requests).size).toBe(requests.length)
  })
})

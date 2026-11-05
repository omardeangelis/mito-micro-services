import { beforeAll, describe, expect, it } from "vitest"
import { eq, inArray } from "drizzle-orm"
import {
  alert,
  customers,
  practices,
  taskEventLog,
} from "@mito/db/schema/index"
import { task } from "@mito/db/schema/task"
import { SYSTEM_OPERATOR_USER_ID } from "@mito/domain/constants/operator"
import { generateDataset } from "../generate"
import { buildManifest } from "../manifest"
import { seedDatabase } from "../seed"
import type { Dataset, Manifest } from "../types"
import {
  formatResults,
  sameAmount,
  verifyManifest,
  type ScenarioResult,
} from "../verify"
import { hasTestDatabase, migrateUpTo, pgDb } from "@/test/pg"

/** A day in the past: the tests never depend on today. */
const DAY = "2026-10-14"

describe.skipIf(!hasTestDatabase)("verifyManifest", () => {
  beforeAll(async () => {
    await migrateUpTo()
  }, 120_000)

  it("fails P1 on a fresh seed, citing its rows, and passes it once they hold 120", async () => {
    const { dataset, manifest } = await seedDatabase(pgDb, { n: 300, day: DAY })
    const p1 = manifest.scenarios.find((scenario) => scenario.id === "P1")!
    const p1Ids = p1.rows.map((row) => Number(row.key))
    expect(p1Ids.length).toBeGreaterThan(0)

    const before = await verifyManifest(pgDb, manifest, dataset)
    const p1Before = before.find((result) => result.id === "P1")!
    expect(p1Before.passed).toBe(false)
    expect(
      p1Before.failures.map((failure) => Number(failure.key)).sort()
    ).toEqual([...p1Ids].sort())

    await pgDb
      .update(task)
      .set({ priority: 120 })
      .where(inArray(task.id, p1Ids))

    const after = await verifyManifest(pgDb, manifest, dataset)
    expect(after.find((result) => result.id === "P1")!.passed).toBe(true)
  }, 120_000)

  it("on a fresh seed fails the scenarios whose outcome differs from the seed, passes the unchanged ones and completeness, and has no volumes", async () => {
    const { dataset, manifest } = await seedDatabase(pgDb, { n: 300, day: DAY })

    const results = await verifyManifest(pgDb, manifest, dataset)

    expect(results.map((result) => result.id)).toEqual([
      ...manifest.scenarios.map((scenario) => scenario.id),
      "completezza",
      "stati",
    ])
    const failing = [
      ...["P1", "P3", "P4", "P6", "P7", "P10", "P13"],
      ...["A1", "A3", "A6", "U1", "U2", "U4", "U5", "U6", "U8", "U9"],
      "L1",
    ]
    const passing = [
      ...["P2", "P8", "P9", "U3", "U7a", "U7b", "U10a", "U10b", "U10c"],
      ...["U11", "A4", "A5", "A7", "L2", "completezza", "stati"],
    ]
    expect(failing.length + passing.length).toBe(results.length)
    for (const id of failing) {
      const result = byId(results, id)
      expect(result.passed, id).toBe(false)
      expect(result.failures.length, id).toBeGreaterThan(0)
    }
    for (const id of passing) {
      expect(byId(results, id).failures, id).toEqual([])
      expect(byId(results, id).passed, id).toBe(true)
    }
    expect(byId(results, "completezza").cron).toBe("completezza")
    expect(results.some((result) => result.id === "volumi")).toBe(false)
  }, 120_000)

  it("fails P2 when one of its rows changes, citing that row", async () => {
    const { dataset, manifest } = await seedDatabase(pgDb, { n: 300, day: DAY })
    const row = scenarioOf(manifest, "P2").rows[0]!
    const id = Number(row.key)
    const seedPriority = row.expected.priority as number
    await pgDb
      .update(task)
      .set({ priority: seedPriority + 1 })
      .where(eq(task.id, id))

    const results = await verifyManifest(pgDb, manifest, dataset)

    const p2 = byId(results, "P2")
    expect(p2.passed).toBe(false)
    expect(new Set(p2.failures.map((failure) => failure.key))).toEqual(
      new Set([id])
    )
    expect(p2.failures).toContainEqual({
      table: "task",
      key: id,
      column: "priority",
      expected: seedPriority,
      found: seedPriority + 1,
    })
    // The row is in no selected scenario: completeness cites it too
    expect(
      byId(results, "completezza").failures.some(
        (failure) => failure.table === "task" && failure.key === id
      )
    ).toBe(true)
  }, 120_000)

  it("fails completeness when a row no scenario selects changes, citing it", async () => {
    const { dataset, manifest } = await seedDatabase(pgDb, { n: 300, day: DAY })
    const listed = scenarioKeys(manifest)
    const customer = dataset.customers.find(
      (each) =>
        typeof each.name === "string" && !listed.has(`customers:${each.id}`)
    )!
    const practice = dataset.practices.find(
      (each) => !listed.has(`practices:${each.praticaId}`)
    )!
    const newState = practice.state === "Stornata" ? "Rinunciata" : "Stornata"
    await pgDb
      .update(customers)
      .set({ name: "Cambiato" })
      .where(eq(customers.id, customer.id))
    await pgDb
      .update(practices)
      .set({ state: newState })
      .where(eq(practices.praticaId, practice.praticaId))

    const results = await verifyManifest(pgDb, manifest, dataset)

    const completeness = byId(results, "completezza")
    expect(completeness.passed).toBe(false)
    expect(completeness.failures).toContainEqual({
      table: "customers",
      key: customer.id,
      column: "name",
      expected: customer.name,
      found: "Cambiato",
    })
    expect(completeness.failures).toContainEqual({
      table: "practices",
      key: practice.praticaId,
      column: "state",
      expected: practice.state,
      found: newState,
    })
    // Only those two rows
    expect(
      new Set(completeness.failures.map((f) => `${f.table}:${f.key}`))
    ).toEqual(
      new Set([`customers:${customer.id}`, `practices:${practice.praticaId}`])
    )
  }, 120_000)

  it("fails completeness on a row that is not in the dataset and no scenario creates", async () => {
    const { dataset, manifest } = await seedDatabase(pgDb, { n: 300, day: DAY })
    const customer = dataset.customers[0]!
    const system = systemOperatorId(dataset)
    const [created] = await pgDb
      .insert(task)
      .values({ customerId: customer.id, state: "chiamare", isActive: false })
      .returning({ id: task.id })
    // An `alert_resolved` row on a contact that is in no A scenario
    const listed = scenarioKeys(manifest)
    const other = dataset.tasks.find(
      (each) => each.customerId != null && !listed.has(`task:${each.id}`)
    )!
    const [log] = await pgDb
      .insert(taskEventLog)
      .values({
        customerId: other.customerId!,
        taskId: other.id,
        actorOperatorId: system,
        action: "alert_resolved",
        source: "cron_alert",
      })
      .returning({ id: taskEventLog.id })

    const results = await verifyManifest(pgDb, manifest, dataset)

    const completeness = byId(results, "completezza")
    expect(completeness.passed).toBe(false)
    expect(
      completeness.failures.map((f) => [f.table, f.key, f.expected])
    ).toEqual(
      expect.arrayContaining([
        ["task", created!.id, "nessuna riga nuova"],
        ["task_event_log", log!.id, "nessuna riga nuova"],
      ])
    )
    expect(completeness.failures).toHaveLength(2)
  }, 120_000)

  /** What the `alert` cron writes on a contact in Richiamo whose alert is due. */
  async function workAlert(
    dataset: Dataset,
    contact: Dataset["tasks"][number],
    extraLog = 0
  ) {
    const system = systemOperatorId(dataset)
    await pgDb
      .update(task)
      .set({ state: "chiamare" })
      .where(eq(task.id, contact.id))
    await pgDb
      .update(customers)
      .set({ updatedAt: new Date() })
      .where(eq(customers.id, contact.customerId!))
    await pgDb.insert(taskEventLog).values(
      Array.from({ length: 1 + extraLog }, () => ({
        customerId: contact.customerId!,
        taskId: contact.id,
        actorOperatorId: system,
        action: "state_change" as const,
        source: "cron_alert" as const,
        fromState: "richiamare" as const,
        toState: "chiamare" as const,
      }))
    )
  }

  it.each(["A3", "A1"])(
    "passes the rows of an %s contact moved to Da chiamare as the cron would, the alert open, and completeness accepts its log row and its customer",
    async (id) => {
      const { dataset, manifest } = await seedDatabase(pgDb, {
        n: 300,
        day: DAY,
      })
      const rows = scenarioOf(manifest, id).rows
      const alertRows = rows.filter((row) => row.table === "alert")
      const alertId = Number(alertRows[0]!.key)
      const contact = dataset.tasks.find((each) => each.alertId === alertId)!
      expect(
        rows.some((row) => row.table === "task" && row.key === contact.id)
      ).toBe(true)

      await workAlert(dataset, contact)

      const results = await verifyManifest(pgDb, manifest, dataset)

      expect(
        byId(results, id).failures.filter(
          (f) =>
            (f.table === "alert" && f.key === alertId) ||
            (f.table === "task" && f.key === contact.id)
        )
      ).toEqual([])
      // The other alerts of the scenario are not worked yet
      if (alertRows.length > 1) expect(byId(results, id).passed).toBe(false)
      expect(byId(results, "completezza").failures).toEqual([])

      // A second row on the contact is neither expected nor allowed
      await workAlert(dataset, contact)
      const again = await verifyManifest(pgDb, manifest, dataset)
      expect(
        byId(again, id).failures.filter(
          (f) => f.table === "task" && f.key === contact.id
        )
      ).toMatchObject([{ column: "newLog" }])
      expect(byId(again, "completezza").failures).toMatchObject([
        { table: "task_event_log", expected: "nessuna riga nuova" },
      ])
    },
    120_000
  )

  it("fails A1 when the cron closes the alert or leaves the contact in Richiamo", async () => {
    const { dataset, manifest } = await seedDatabase(pgDb, { n: 300, day: DAY })
    const a1 = scenarioOf(manifest, "A1")
    const alertId = Number(a1.rows.find((row) => row.table === "alert")!.key)
    const contact = dataset.tasks.find((each) => each.alertId === alertId)!

    // The old cron: the alert resolved, the contact replaced
    await pgDb
      .update(alert)
      .set({ isResolved: true, resolvedBy: systemOperatorId(dataset) })
      .where(eq(alert.id, alertId))

    const results = await verifyManifest(pgDb, manifest, dataset)

    const failures = byId(results, "A1").failures
    expect(
      failures.filter((f) => f.table === "alert" && f.key === alertId)
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column: "isResolved", expected: false }),
      ])
    )
    // The contact is still in Richiamo
    expect(failures).toContainEqual(
      expect.objectContaining({
        table: "task",
        key: contact.id,
        column: "state",
        expected: "chiamare",
        found: "richiamare",
      })
    )
  }, 120_000)

  it("fails `stati` on a contact left in `followup`, `erogata`, `nessuno` or without state, citing it, before and after the runs (AC3)", async () => {
    const { dataset, manifest } = await seedDatabase(pgDb, { n: 300, day: DAY })
    expect(
      byId(await verifyManifest(pgDb, manifest, dataset), "stati")
    ).toEqual({ id: "stati", cron: "stati", passed: true, failures: [] })

    const [a, b, c] = dataset.tasks.filter((each) => each.isActive)
    await pgDb.update(task).set({ state: "followup" }).where(eq(task.id, a!.id))
    await pgDb.update(task).set({ state: "erogata" }).where(eq(task.id, b!.id))
    await pgDb.update(task).set({ state: "nessuno" }).where(eq(task.id, c!.id))

    const stati = byId(await verifyManifest(pgDb, manifest, dataset), "stati")

    expect(stati.passed).toBe(false)
    expect(stati.failures).toEqual(
      expect.arrayContaining([
        {
          table: "task",
          key: a!.id,
          column: "state",
          expected: "uno dei sei stati",
          found: "followup",
        },
        expect.objectContaining({ key: b!.id, found: "erogata" }),
        expect.objectContaining({ key: c!.id, found: "nessuno" }),
      ])
    )
    expect(stati.failures).toHaveLength(3)
  }, 120_000)

  it("checks the volumes only at N = 10,000, against the database and the job counters", async () => {
    const { dataset, manifest } = await seedDatabase(pgDb, { n: 300, day: DAY })
    const at10k: Manifest = { ...structuredClone(manifest), n: 10_000 }

    const withoutRuns = byId(
      await verifyManifest(pgDb, at10k, dataset),
      "volumi"
    )
    expect(withoutRuns.passed).toBe(false)
    expect(
      withoutRuns.failures.map((f) => `${f.table} ${f.key} ${f.column ?? ""}`)
    ).toEqual([
      "task priority ",
      // 300 customers don't hold the days of the two home operators
      "giornata operatore 1003 scaduti",
      "giornata operatore 1003 di oggi",
      "giornata operatore 1003 chiamate",
      "giornata operatore 1026 richiami",
      "giornata operatore 1026 chiamate",
      "runs alert counters.processed",
      "runs update counters.practices",
      "runs update counters.customers",
      "runs cleanup-task-event-log counters.deleted",
    ])

    const at = new Date().toISOString()
    at10k.runs = [
      {
        job: "alert",
        at,
        outcome: "succeeded",
        counters: { processed: 1_000 },
      },
      {
        job: "update",
        at,
        outcome: "succeeded",
        counters: { practices: 200, customers: 100 },
      },
      {
        job: "cleanup-task-event-log",
        at,
        outcome: "failed",
        counters: { deleted: 5_000 },
      },
    ]
    const withRuns = byId(await verifyManifest(pgDb, at10k, dataset), "volumi")
    // 300 customers never reach 5,001 contacts; a failed run doesn't count
    expect(withRuns.failures.map((f) => `${f.table} ${f.key}`)).toEqual([
      "task priority",
      "giornata operatore 1003",
      "giornata operatore 1003",
      "giornata operatore 1003",
      "giornata operatore 1026",
      "giornata operatore 1026",
      "runs cleanup-task-event-log",
    ])
  }, 120_000)

  it("seedDatabase returns the dataset and the manifest of generateDataset and buildManifest", async () => {
    const seeded = await seedDatabase(pgDb, { n: 300, day: DAY })

    const dataset = generateDataset({ n: 300, day: DAY })
    expect(seeded.dataset).toEqual(dataset)
    expect(seeded.manifest).toEqual(buildManifest(dataset, DAY))
  }, 120_000)
})

describe("sameAmount", () => {
  it("compares amounts as numbers with a tolerance of 0.005 (D12)", () => {
    expect(sameAmount(8810, "8810.00")).toBe(true)
    expect(sameAmount(8810, "8810.004")).toBe(true)
    expect(sameAmount(8810, "8810.01")).toBe(false)
    expect(sameAmount(-150, "-150")).toBe(true)
    expect(sameAmount(null, null)).toBe(true)
    expect(sameAmount(0, null)).toBe(false)
    expect(sameAmount(null, "0")).toBe(false)
  })
})

describe("formatResults", () => {
  it("prints one line per scenario and one per failure, in Italian", () => {
    const results: ScenarioResult[] = [
      { id: "P1", cron: "priority", passed: true, failures: [] },
      {
        id: "P2",
        cron: "priority",
        passed: false,
        failures: [
          {
            table: "task",
            key: 7,
            column: "priority",
            expected: 120,
            found: 20,
          },
        ],
      },
    ]
    expect(formatResults(results)).toEqual([
      "P1 passato",
      "P2 fallito",
      "  task 7 priority: atteso 120, trovato 20",
    ])
  })
})

function byId(results: readonly ScenarioResult[], id: string) {
  const found = results.find((result) => result.id === id)
  if (!found) throw new Error(`no result ${id}`)
  return found
}

function scenarioOf(manifest: Manifest, id: string) {
  const found = manifest.scenarios.find((scenario) => scenario.id === id)
  if (!found) throw new Error(`no scenario ${id}`)
  return found
}

/** Every row any scenario lists, selected or not, as "table:key". */
function scenarioKeys(manifest: Manifest) {
  return new Set(
    manifest.scenarios.flatMap((scenario) =>
      scenario.rows.map((row) => `${row.table}:${row.key}`)
    )
  )
}

function systemOperatorId(dataset: Dataset) {
  return dataset.operators.find(
    (operator) => operator.userId === SYSTEM_OPERATOR_USER_ID
  )!.id
}

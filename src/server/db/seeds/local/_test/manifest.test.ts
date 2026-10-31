// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { SYSTEM_OPERATOR_USER_ID } from "@mito/domain/constants/operator"
import { LOG_RETENTION_MONTHS } from "@mito/domain/export/period"
import { addDays, romeDay, romeMidnight, romeNoon, subMonthsDay } from "../day"
import { type CronName, type Dataset, type Day, type Manifest } from "../types"
import { generateDataset } from "../generate"
import { buildManifest } from "../manifest"

const DAY = "2026-10-14"

describe("buildManifest at N = 10,000", () => {
  let dataset: Dataset
  let manifest: Manifest

  beforeAll(() => {
    dataset = generateDataset({ n: 10_000, day: DAY })
    manifest = buildManifest(dataset, DAY)
  }, 120_000)

  it("puts every contact `priority` selects in exactly one P scenario, with a seed priority different from the expected one", () => {
    // The cron's rule, from the spec: active, custom_priority = false, not
    // `chiamare` at 120
    const selected = dataset.tasks.filter(
      (task) =>
        task.isActive &&
        task.customPriority === false &&
        !(task.state === "chiamare" && task.priority === 120)
    )
    expect(selected.length).toBeGreaterThan(5_001)

    const rowsByTask = new Map<
      number,
      { scenario: string; expected: unknown }[]
    >()
    for (const scenario of manifest.scenarios) {
      if (scenario.cron !== "priority") continue
      for (const row of scenario.rows) {
        if (row.table !== "task" || !row.selected) continue
        const list = rowsByTask.get(Number(row.key)) ?? []
        list.push({ scenario: scenario.id, expected: row.expected.priority })
        rowsByTask.set(Number(row.key), list)
      }
    }
    for (const task of selected) {
      const rows = rowsByTask.get(task.id) ?? []
      expect(rows, `task ${task.id}`).toHaveLength(1)
      expect(rows[0]!.scenario).toMatch(/^P\d+$/)
      expect(rows[0]!.expected).not.toBe(task.priority)
    }
  })

  registerChecks(() => ({ dataset, manifest }), DAY)

  it("has the AC30 volumes in the manifest", () => {
    const selectedRows = (cron: CronName, table: string) =>
      manifest.scenarios
        .filter((s) => s.cron === cron)
        .flatMap((s) => s.rows)
        .filter((row) => row.table === table && row.selected)

    // At least 5,001 contacts get the same priority: `priority` splits them
    const byPriority = new Map<number, number>()
    for (const row of selectedRows("priority", "task")) {
      const value = row.expected.priority as number
      byPriority.set(value, (byPriority.get(value) ?? 0) + 1)
    }
    expect(Math.max(...byPriority.values())).toBeGreaterThanOrEqual(5_001)

    const openDue = ["A1", "A2", "A3"].flatMap((id) =>
      scenario(manifest, id).rows.filter((row) => row.table === "alert")
    )
    expect(openDue.length).toBeGreaterThanOrEqual(1_000)
    expect(selectedRows("update", "practices").length).toBeGreaterThanOrEqual(
      200
    )
    expect(selectedRows("update", "customers").length).toBeGreaterThanOrEqual(
      100
    )
    expect(scenario(manifest, "L1").rows.length).toBeGreaterThanOrEqual(1_000)
  })
})

describe("buildManifest at N = 300", () => {
  let dataset: Dataset
  let manifest: Manifest

  beforeAll(() => {
    dataset = generateDataset({ n: 300, day: DAY })
    manifest = buildManifest(dataset, DAY)
  }, 60_000)

  registerChecks(() => ({ dataset, manifest }), DAY)

  /** A copy of the dataset that a test can change. */
  const copy = () => structuredClone(dataset)

  it("throws when a cron writes a column another cron declares on the same row (D13)", () => {
    // A P8 contact (custom priority, declared unchanged with its updated_at)
    // gets an open alert due yesterday: `alert` resolves it as A3 and the
    // database rewrites the contact's updated_at
    const broken = copy()
    const p8 = broken.tasks.find(
      (task) => task.isActive && task.customPriority && task.alertId == null
    )!
    const alertId = Math.max(...broken.alerts.map((a) => a.id)) + 1
    const at = romeNoon(addDays(DAY, -3))
    broken.alerts.push({
      id: alertId,
      createdAt: at,
      updatedAt: at,
      deadline: romeMidnight(addDays(DAY, -1)),
      taskId: p8.id,
      message: null,
      isResolved: false,
      resolvedBy: null,
    })
    p8.alertId = alertId
    expect(() => buildManifest(broken, DAY)).toThrow(
      new RegExp(`task ${p8.id}.*P8.*updatedAt.*\`alert\`.*D13`)
    )
  })

  it("throws on a selected contact whose shape no P scenario describes (D10)", () => {
    // A `richiamare` with closed_at and without an alert (it would be 30)
    const broken = copy()
    const p11 = broken.tasks.find(
      (task) =>
        task.isActive &&
        task.customPriority === false &&
        task.state === "richiamare" &&
        task.closedAt == null &&
        task.alertId == null
    )!
    p11.closedAt = romeNoon(addDays(DAY, -2))
    expect(() => buildManifest(broken, DAY)).toThrow(
      new RegExp(`Contatto ${p11.id}.*D10`)
    )
  })

  it("throws on a selected contact whose seed priority is already the expected one", () => {
    const broken = copy()
    const p3 = broken.tasks.find(
      (task) =>
        task.isActive &&
        task.customPriority === false &&
        task.state === "non interessato" &&
        task.priority !== 120
    )!
    p3.priority = 10
    expect(() => buildManifest(broken, DAY)).toThrow(
      new RegExp(`Contatto ${p3.id}: scenario P3`)
    )
  })

  it("throws on an open alert due on D on a contact without closed_at", () => {
    const broken = copy()
    const tasks = new Map(broken.tasks.map((t) => [t.id, t]))
    const a3 = broken.alerts.find(
      (alert) =>
        !alert.isResolved &&
        romeDay(alert.deadline) < DAY &&
        tasks.get(alert.taskId)!.closedAt == null
    )!
    a3.deadline = romeMidnight(DAY)
    expect(() => buildManifest(broken, DAY)).toThrow(
      new RegExp(`Alert ${a3.id}: scade in D`)
    )
  })

  it("throws on a practice due on D that no U scenario describes (D10)", () => {
    // `rate_pagate` = 0 with the liquidation on D: due on D, updated
    const broken = copy()
    const key = scenario(manifest, "U1").rows[0]!.key
    const u1 = broken.practices.find((p) => p.praticaId === key)!
    u1.ratePagate = 0
    u1.dataLiquidazione = romeNoon(DAY)
    expect(() => buildManifest(broken, DAY)).toThrow(
      new RegExp(`Pratica ${key}.*D10`)
    )
  })

  it("throws on a selected practice imported 29-31 days before D", () => {
    const broken = copy()
    const key = scenario(manifest, "U1").rows[0]!.key
    const u1 = broken.practices.find((p) => p.praticaId === key)!
    u1.lastImportUpdate = romeNoon(addDays(DAY, -30))
    expect(() => buildManifest(broken, DAY)).toThrow(
      new RegExp(`Pratica ${key}.*fra 29 e 31 giorni`)
    )
  })

  it("throws on a log row created on D - LOG_RETENTION_MONTHS", () => {
    const broken = copy()
    const row = broken.taskEventLog[0]!
    row.createdAt = romeNoon(subMonthsDay(DAY, LOG_RETENTION_MONTHS))
    expect(() => buildManifest(broken, DAY)).toThrow(
      new RegExp(`Riga di log ${row.id}:`)
    )
  })
})

// Month ends, a leap day, the day after a February, a DST change, and a
// winter D whose D - LOG_RETENTION_MONTHS is in summer time
describe.each([
  "2026-05-31",
  "2028-02-29",
  "2027-03-01",
  "2026-03-29",
  "2026-11-15",
])("buildManifest at N = 300 for D = %s", (day) => {
  let dataset: Dataset
  let manifest: Manifest

  beforeAll(() => {
    dataset = generateDataset({ n: 300, day })
    manifest = buildManifest(dataset, day)
  }, 60_000)

  registerChecks(() => ({ dataset, manifest }), day)
})

// ---------------------------------------------------------------------------

const SCENARIO_IDS = [
  ...["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11"],
  ...["P12", "P13", "A1", "A2", "A3", "A4", "A5", "A6"],
  ...["U1", "U2", "U3", "U4", "U5", "U6", "U7a", "U7b", "U11"],
  ...["U8", "U9", "U10a", "U10b", "U10c", "L1", "L2"],
]

function scenario(manifest: Manifest, id: string) {
  const found = manifest.scenarios.find((s) => s.id === id)
  if (!found) throw new Error(`no scenario ${id}`)
  return found
}

/**
 * The rows each cron selects, recomputed from the selection rules of the spec
 * (not from the manifest, not from the cron code), as "table:key".
 */
function selectedByRules(dataset: Dataset, day: Day) {
  const tasks = new Map(dataset.tasks.map((task) => [task.id, task]))
  const priority = dataset.tasks
    .filter(
      (task) =>
        task.isActive &&
        task.customPriority === false &&
        !(task.state === "chiamare" && task.priority === 120)
    )
    .map((task) => `task:${task.id}`)

  const alert: string[] = []
  for (const each of dataset.alerts) {
    const task = tasks.get(each.taskId)
    if (
      !each.isResolved &&
      task?.alertId === each.id &&
      romeDay(each.deadline) <= day
    ) {
      alert.push(`alert:${each.id}`, `task:${task.id}`)
    }
  }

  const monthDay = day.slice(5)
  const update = [
    ...dataset.practices
      .filter(
        (p) => addDays(romeDay(p.dataLiquidazione), p.ratePagate * 30) === day
      )
      .map((p) => `practices:${p.praticaId}`),
    ...dataset.customers
      .filter(
        (c) =>
          c.birthdayDate != null &&
          romeDay(c.birthdayDate).slice(5) === monthDay
      )
      .map((c) => `customers:${c.id}`),
  ]

  const cutoff = subMonthsDay(day, LOG_RETENTION_MONTHS)
  const cleanup = dataset.taskEventLog
    .filter((row) => romeDay(row.createdAt!) < cutoff)
    .map((row) => `task_event_log:${row.id}`)

  return {
    priority,
    alert,
    update,
    "cleanup-task-event-log": cleanup,
  } satisfies Record<CronName, string[]>
}

/** The assertions that hold for every N and every D. */
function registerChecks(
  get: () => { dataset: Dataset; manifest: Manifest },
  day: Day
) {
  it("lists every scenario of the spec tables once, with D, N and no runs", () => {
    const { dataset, manifest } = get()
    expect(manifest.day).toBe(day)
    expect(manifest.n).toBe(dataset.customers.length)
    expect(manifest.runs).toEqual([])
    expect(manifest.scenarios.map((s) => s.id)).toEqual(SCENARIO_IDS)
  })

  it("puts every row a cron selects in exactly one scenario of that cron, and lists as selected only those rows (D10)", () => {
    const { dataset, manifest } = get()
    const byRules = selectedByRules(dataset, day)
    for (const cron of Object.keys(byRules) as CronName[]) {
      const scenariosOfRow = new Map<string, string[]>()
      const selected = new Set<string>()
      for (const s of manifest.scenarios) {
        if (s.cron !== cron) continue
        for (const row of s.rows) {
          if (row.table === "runs") continue
          const key = `${row.table}:${row.key}`
          scenariosOfRow.set(key, [...(scenariosOfRow.get(key) ?? []), s.id])
          if (row.selected) selected.add(key)
        }
      }
      for (const [key, ids] of scenariosOfRow) {
        expect(ids, `${cron} ${key}`).toHaveLength(1)
      }
      expect(byRules[cron].length, cron).toBeGreaterThan(0)
      expect([...selected].sort(), cron).toEqual([...byRules[cron]].sort())
    }
  }, 30_000)

  it("marks alert and contact of A1-A3 as selected, of A4 as not selected, and A6 as the alert run that succeeds", () => {
    const { manifest } = get()
    for (const id of ["A1", "A2", "A3", "A4"]) {
      const rows = scenario(manifest, id).rows
      const alerts = rows.filter((row) => row.table === "alert")
      const tasks = rows.filter((row) => row.table === "task")
      expect(alerts.length, id).toBe(tasks.length)
      for (const row of rows) expect(row.selected, id).toBe(id !== "A4")
    }
    for (const row of scenario(manifest, "A4").rows) {
      expect(row.expected).toEqual(
        row.table === "alert"
          ? { isResolved: false, resolvedBy: null }
          : { alertId: expect.any(Number) as number, isActive: true }
      )
    }
    for (const row of scenario(manifest, "A5").rows) {
      expect(row).toMatchObject({
        table: "alert",
        selected: false,
        expected: { isResolved: true },
      })
    }
    expect(scenario(manifest, "A6").rows).toEqual([
      {
        table: "runs",
        key: "alert",
        selected: true,
        expected: { outcome: "succeeded" },
      },
    ])
  })

  it("expects the outcomes of the spec tables", () => {
    const { dataset, manifest } = get()
    const system = dataset.operators.find(
      (o) => o.userId === SYSTEM_OPERATOR_USER_ID
    )!.id
    const tasks = new Map(dataset.tasks.map((t) => [t.id, t]))
    const customers = new Map(dataset.customers.map((c) => [c.id, c]))
    const practices = new Map(dataset.practices.map((p) => [p.praticaId, p]))
    const only = (id: string, table: string) =>
      scenario(manifest, id).rows.filter((row) => row.table === table)

    const priorities: Record<string, number> = {
      P1: 120,
      P3: 10,
      P4: 1,
      P5: 1,
      P6: 50,
      P7: 30,
      P10: 10,
      P11: 0,
      P12: 20,
      P13: 100,
    }
    for (const [id, priority] of Object.entries(priorities)) {
      for (const row of only(id, "task")) {
        expect(row.expected, `${id} ${row.key}`).toEqual({ priority })
      }
    }

    const resolvedLog = (
      taskId: number,
      alertId: number | null | undefined
    ) => ({
      action: "alert_resolved",
      source: "cron_alert",
      actorOperatorId: system,
      taskId,
      alertId,
    })
    for (const id of ["A1", "A2", "A3"]) {
      for (const row of only(id, "alert")) {
        expect(row.expected).toEqual({ isResolved: true, resolvedBy: system })
      }
    }
    for (const id of ["A1", "A2"]) {
      for (const row of only(id, "task")) {
        const task = tasks.get(Number(row.key))!
        const customer = customers.get(task.customerId!)!
        expect(id === "A1").toBe(customer.operatorId != null)
        expect(row.expected).toEqual({
          isActive: false,
          newActiveContact: {
            state: "followup",
            priority: 150,
            customPriority: false,
            operatorId: customer.operatorId ?? null,
            closedAt: task.closedAt!.toISOString(),
            alertId: null,
          },
          newLog: [
            resolvedLog(task.id, task.alertId),
            {
              action: "state_change",
              source: "cron_alert",
              actorOperatorId: system,
              taskId: task.id,
              fromState: "richiamare",
              toState: "followup",
            },
          ],
        })
      }
    }
    for (const row of only("A3", "task")) {
      const task = tasks.get(Number(row.key))!
      expect(row.expected).toEqual({
        isActive: true,
        alertId: null,
        newLog: [resolvedLog(task.id, task.alertId)],
      })
    }

    const debt = (value: string | null | undefined) =>
      value == null ? 0 : Number(value)
    for (const id of ["U1", "U2", "U4", "U5", "U6"]) {
      for (const row of only(id, "practices")) {
        const p = practices.get(String(row.key))!
        expect(row.expected.debitoResiduo, `${id} ${row.key}`).toBe(
          debt(p.debitoResiduo) - Number(p.importoRata)
        )
      }
    }
    for (const row of only("U1", "practices")) {
      const p = practices.get(String(row.key))!
      expect(row.expected.ratePagate).toBe(p.ratePagate + 1)
      expect(row.expected.state).toBe("Liquidata")
    }
    for (const row of only("U2", "practices")) {
      const p = practices.get(String(row.key))!
      expect(row.expected.ratePagate).toBe(p.rateTotali)
      expect(row.expected.state).toBe("Chiusa")
    }
    for (const row of only("U4", "practices")) {
      const p = practices.get(String(row.key))!
      expect(row.expected.ratePagate).toBe(p.ratePagate)
      expect(row.expected.state).toBe("Chiusa")
    }
    for (const row of only("U5", "practices")) {
      const p = practices.get(String(row.key))!
      expect(p.state).not.toBe("Liquidata")
      expect(row.expected.ratePagate).toBe(p.ratePagate + 1)
      expect(row.expected.state).toBe(
        p.ratePagate + 1 === p.rateTotali ? "Chiusa" : p.state
      )
    }
    for (const row of only("U6", "practices")) {
      const p = practices.get(String(row.key))!
      expect(p.debitoResiduo ?? null).toBeNull()
      expect(row.expected.debitoResiduo).toBe(-Number(p.importoRata))
    }
    for (const id of ["U3", "U7a", "U7b", "U11"]) {
      for (const row of only(id, "practices")) {
        const p = practices.get(String(row.key))!
        expect(row.selected).toBe(id === "U3")
        expect(row.expected, `${id} ${row.key}`).toEqual({
          ratePagate: p.ratePagate,
          debitoResiduo:
            p.debitoResiduo == null ? null : Number(p.debitoResiduo),
          state: p.state,
          updatedAt: p.updatedAt!.toISOString(),
        })
      }
    }
    for (const row of only("U8", "customers")) {
      expect(row.expected).toEqual({
        age: customers.get(String(row.key))!.age! + 1,
      })
    }
    for (const row of only("U9", "customers")) {
      expect(customers.get(String(row.key))!.age ?? null).toBeNull()
      expect(row.expected).toEqual({ age: 1 })
    }
    for (const id of ["U10a", "U10b", "U10c"]) {
      for (const row of only(id, "customers")) {
        expect(row.selected).toBe(false)
        expect(row.expected).toEqual({
          age: customers.get(String(row.key))!.age ?? null,
        })
      }
    }
    for (const row of scenario(manifest, "L1").rows) {
      expect(row).toMatchObject({ selected: true, expected: { deleted: true } })
    }
    for (const row of scenario(manifest, "L2").rows) {
      expect(row).toMatchObject({
        selected: false,
        expected: { deleted: false },
      })
    }
  })

  it("covers every case named in the scenario tables (AC27)", () => {
    const { dataset, manifest } = get()
    for (const id of SCENARIO_IDS) {
      expect(scenario(manifest, id).rows.length, id).toBeGreaterThan(0)
    }
    const tasks = new Map(dataset.tasks.map((t) => [t.id, t]))
    const practices = new Map(dataset.practices.map((p) => [p.praticaId, p]))
    const taskRows = (id: string) =>
      scenario(manifest, id)
        .rows.filter((row) => row.table === "task")
        .map((row) => tasks.get(Number(row.key))!)

    for (const state of ["app.to", "caricato", "erogata", "nessuno"]) {
      expect(
        taskRows("P4").some((t) => t.state === state),
        `P4 ${state}`
      ).toBe(true)
    }
    for (const value of [20, 60, 100, 120]) {
      expect(
        taskRows("P8").some((t) => t.priority === value),
        `P8 ${value}`
      ).toBe(true)
    }
    const p9 = taskRows("P9")
    expect(p9.some((t) => t.state === "chiamare" && t.priority === 120)).toBe(
      true
    )
    expect(p9.some((t) => t.state === "richiamare")).toBe(true)

    const u5States = new Set(
      scenario(manifest, "U5").rows.map(
        (row) => practices.get(String(row.key))!.state
      )
    )
    expect(u5States).toEqual(
      new Set([
        "Rifiutata",
        "Chiusa",
        "Estinta anticipata",
        "Rinunciata",
        "Stornata",
      ])
    )

    // L1 and L2 have a row on the day next to the boundary
    const createdDay = new Map(
      dataset.taskEventLog.map((row) => [row.id, romeDay(row.createdAt!)])
    )
    const cutoff = subMonthsDay(day, LOG_RETENTION_MONTHS)
    const daysOf = (id: string) =>
      new Set(
        scenario(manifest, id).rows.map((row) =>
          createdDay.get(Number(row.key))
        )
      )
    expect(daysOf("L1").has(addDays(cutoff, -1))).toBe(true)
    expect(daysOf("L2").has(addDays(cutoff, 1))).toBe(true)
  })

  it("gives every row `priority` selects a seed priority different from the expected one", () => {
    const { dataset, manifest } = get()
    const tasks = new Map(dataset.tasks.map((t) => [t.id, t]))
    for (const s of manifest.scenarios) {
      if (s.cron !== "priority") continue
      for (const row of s.rows.filter((each) => each.selected)) {
        expect(
          tasks.get(Number(row.key))!.priority,
          `${s.id} ${row.key}`
        ).not.toBe(row.expected.priority)
      }
    }
  })

  it("records seed priority and updated_at of P2, P8 and P9 as unchanged", () => {
    const { dataset, manifest } = get()
    const tasks = new Map(dataset.tasks.map((t) => [t.id, t]))
    for (const id of ["P2", "P8", "P9"]) {
      for (const row of scenario(manifest, id).rows) {
        const task = tasks.get(Number(row.key))!
        expect(row.selected).toBe(false)
        expect(row.expected, `${id} ${row.key}`).toEqual({
          priority: task.priority,
          updatedAt: task.updatedAt!.toISOString(),
        })
      }
    }
  })

  it("never expects a timestamp the database writes (D15)", () => {
    const { manifest } = get()
    const unchanged = new Set(["P2", "P8", "P9", "U3", "U7a", "U7b", "U11"])
    for (const s of manifest.scenarios) {
      for (const row of s.rows) {
        const label = `${s.id} ${row.key}`
        expect(row.expected, label).not.toHaveProperty("createdAt")
        if (!unchanged.has(s.id)) {
          expect(row.expected, label).not.toHaveProperty("updatedAt")
        }
      }
    }
  })

  it("is plain JSON and the same at every call", () => {
    const { dataset, manifest } = get()
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest)
    expect(buildManifest(dataset, day)).toEqual(manifest)
  }, 30_000)
}

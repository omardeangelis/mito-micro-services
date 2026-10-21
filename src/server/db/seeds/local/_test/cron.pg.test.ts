import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"
import { task } from "@mito/db/schema/task"
import { addDays, romeNoon } from "../day"
import { runLocalCrons } from "../cron"
import { seedDatabase } from "../seed"
import type { CronName, Dataset, Manifest } from "../types"
import { verifyManifest } from "../verify"
import { hasTestDatabase, migrateUpTo, pgClient, pgDb } from "@/test/pg"

// The runs take their client from the caller: the module's `db`, which reads
// the Supabase variables, must never be reached (AC28a)
const { globalDbCalls } = vi.hoisted(() => ({ globalDbCalls: [] as string[] }))
vi.mock("@mito/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, property) {
        globalDbCalls.push(String(property))
        throw new Error("the global db was used")
      },
    }
  ),
}))

/** A day in the past: the rows the crons insert get the real time (D15). */
const DAY = "2026-10-14"

describe.skipIf(!hasTestDatabase)("runLocalCrons", () => {
  beforeAll(async () => {
    await migrateUpTo()
  }, 120_000)

  afterEach(() => {
    vi.useRealTimers()
  })

  it("passes every scenario after the four runs in order, with the session in UTC and the global db throwing (AC29, AC1a, D14)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(romeNoon(DAY))

    const { dataset, manifest } = await seedDatabase(pgDb, { n: 300, day: DAY })
    const after = await runLocalCrons({
      client: pgDb,
      manifest,
      jobs: ["priority", "alert", "update", "cleanup-task-event-log"],
      now: new Date(),
      onManifest: () => undefined,
    })

    const results = await verifyManifest(pgDb, after, dataset)
    const failed = results.filter((result) => !result.passed)
    expect(failed).toEqual([])
    expect(results.some((result) => result.id === "completezza")).toBe(true)
    expect(globalDbCalls).toEqual([])
  }, 180_000)

  it("refuses to run on another day than the manifest's, or between midnight and 01:00/02:00 in Rome, writing nothing (AC28b)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(romeNoon(DAY))
    const { dataset, manifest } = await seedDatabase(pgDb, { n: 300, day: DAY })
    const p1 = firstP1(manifest, dataset)

    const onManifest = vi.fn()
    const nextDay = romeNoon(addDays(DAY, 1))
    // 00:30 in Rome (summer time) of DAY: still 22:30 UTC of the day before
    const afterMidnight = new Date(`${addDays(DAY, -1)}T22:30:00.000Z`)
    for (const now of [nextDay, afterMidnight]) {
      vi.setSystemTime(now)
      await expect(
        runLocalCrons({
          client: pgDb,
          manifest,
          jobs: ["priority"],
          now,
          onManifest,
        })
      ).rejects.toThrow()
    }

    expect(onManifest).not.toHaveBeenCalled()
    expect(await priorityOf(p1.id)).toBe(p1.seedPriority)
  }, 120_000)

  it("refuses a job already run, a job before one already run, a list out of order and delete-export, before running anything (D6)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(romeNoon(DAY))
    const { dataset, manifest } = await seedDatabase(pgDb, { n: 300, day: DAY })
    const p1 = firstP1(manifest, dataset)
    const now = new Date()
    const run = (from: Manifest, jobs: string[], onManifest = vi.fn()) =>
      runLocalCrons({
        client: pgDb,
        manifest: from,
        jobs: jobs as CronName[],
        now,
        onManifest,
      })

    // Out of order, repeated, or not a seed job: nothing runs
    for (const jobs of [
      ["update", "priority"],
      ["alert", "alert"],
      ["delete-export"],
      ["priority", "delete-export"],
    ]) {
      const onManifest = vi.fn()
      await expect(run(manifest, jobs, onManifest)).rejects.toThrow()
      expect(onManifest, jobs.join(",")).not.toHaveBeenCalled()
    }
    expect(await priorityOf(p1.id)).toBe(p1.seedPriority)

    // `alert` then `priority`: the second comes earlier in the order
    const afterAlert = await run(manifest, ["alert"])
    const onPriority = vi.fn()
    await expect(run(afterAlert, ["priority"], onPriority)).rejects.toThrow(
      /priority/
    )
    expect(onPriority).not.toHaveBeenCalled()
    expect(await priorityOf(p1.id)).toBe(p1.seedPriority)

    // A second `update` after a successful one
    const afterUpdate = await run(afterAlert, ["update"])
    expect(afterUpdate.runs.map((each) => each.outcome)).toEqual([
      "succeeded",
      "succeeded",
    ])
    const onUpdate = vi.fn()
    await expect(run(afterUpdate, ["update"], onUpdate)).rejects.toThrow(
      /update/
    )
    expect(onUpdate).not.toHaveBeenCalled()
  }, 120_000)

  it("records a failed update, rejects, and refuses any later request (D6)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(romeNoon(DAY))
    const { manifest } = await seedDatabase(pgDb, { n: 300, day: DAY })
    const now = new Date()
    const written: Manifest[] = []

    await pgClient.unsafe(`
      CREATE FUNCTION seed_cron_failpoint() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'seed cron failpoint'; END $$;
      CREATE TRIGGER seed_cron_failpoint
        BEFORE UPDATE ON "public"."mito-deutsche_practices"
        FOR EACH ROW EXECUTE FUNCTION seed_cron_failpoint();
    `)
    try {
      await expect(
        runLocalCrons({
          client: pgDb,
          manifest,
          jobs: ["update", "cleanup-task-event-log"],
          now,
          onManifest: (each) => {
            written.push(structuredClone(each))
          },
        })
      ).rejects.toThrow(/update/)
    } finally {
      await pgClient.unsafe(`
        DROP TRIGGER IF EXISTS seed_cron_failpoint
          ON "public"."mito-deutsche_practices";
        DROP FUNCTION IF EXISTS seed_cron_failpoint();
      `)
    }

    // The failure stops the runs: cleanup never started
    expect(written).toHaveLength(2)
    const last = written.at(-1)!
    expect(last.runs).toHaveLength(1)
    expect(last.runs[0]).toMatchObject({ job: "update", outcome: "failed" })
    expect(last.runs[0]!.error).toMatch(/seed cron failpoint/)

    const onManifest = vi.fn()
    await expect(
      runLocalCrons({
        client: pgDb,
        manifest: last,
        jobs: ["cleanup-task-event-log"],
        now,
        onManifest,
      })
    ).rejects.toThrow(/pnpm seed:local/)
    expect(onManifest).not.toHaveBeenCalled()
  }, 120_000)

  it("refuses any request after a run left started, as after a failure (D6)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(romeNoon(DAY))
    const { dataset, manifest } = await seedDatabase(pgDb, { n: 300, day: DAY })
    const p1 = firstP1(manifest, dataset)
    const now = new Date()
    const interrupted: Manifest = {
      ...manifest,
      runs: [{ job: "priority", at: now.toISOString(), outcome: "started" }],
    }

    const onManifest = vi.fn()
    for (const jobs of [
      ["alert"],
      ["update"],
      ["cleanup-task-event-log"],
    ] as CronName[][]) {
      await expect(
        runLocalCrons({
          client: pgDb,
          manifest: interrupted,
          jobs,
          now,
          onManifest,
        })
      ).rejects.toThrow(/pnpm seed:local/)
    }
    expect(onManifest).not.toHaveBeenCalled()
    expect(await priorityOf(p1.id)).toBe(p1.seedPriority)
  }, 120_000)

  it("writes the manifest twice per job, the started run first, and records the counters of each job", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(romeNoon(DAY))
    const { manifest } = await seedDatabase(pgDb, { n: 300, day: DAY })
    const now = new Date()
    const jobs: CronName[] = [
      "priority",
      "alert",
      "update",
      "cleanup-task-event-log",
    ]
    const written: Manifest[] = []

    const after = await runLocalCrons({
      client: pgDb,
      manifest,
      jobs,
      now,
      onManifest: (each) => {
        written.push(structuredClone(each))
      },
    })

    expect(written).toHaveLength(jobs.length * 2)
    jobs.forEach((job, i) => {
      const atStart = written[i * 2]!
      const atEnd = written[i * 2 + 1]!
      expect(atStart.runs).toHaveLength(i + 1)
      expect(atStart.runs[i]).toEqual({
        job,
        at: now.toISOString(),
        outcome: "started",
      })
      expect(atEnd.runs).toHaveLength(i + 1)
      expect(atEnd.runs[i]).toMatchObject({ job, outcome: "succeeded" })
    })
    expect(written.at(-1)).toEqual(after)
    // The input manifest is left as it was
    expect(manifest.runs).toEqual([])

    const counters = Object.fromEntries(
      after.runs.map((run) => [run.job, run.counters])
    )
    expect(counters.priority).toEqual({})
    expect(counters.alert!.processed).toBeGreaterThan(0)
    expect(Object.keys(counters.update!).sort()).toEqual([
      "customers",
      "practices",
    ])
    expect(counters.update!.practices).toBeGreaterThan(0)
    expect(counters.update!.customers).toBeGreaterThan(0)
    expect(Object.keys(counters["cleanup-task-event-log"]!)).toEqual([
      "deleted",
    ])
    expect(counters["cleanup-task-event-log"]!.deleted).toBeGreaterThan(0)
  }, 180_000)
})

/** A task of scenario P1 (priority 120 after `priority`) and its seed priority. */
function firstP1(manifest: Manifest, dataset: Dataset) {
  const key = manifest.scenarios.find((scenario) => scenario.id === "P1")!
    .rows[0]!.key
  const row = dataset.tasks.find((each) => each.id === Number(key))!
  expect(row.priority).not.toBe(120)
  return { id: row.id, seedPriority: row.priority }
}

async function priorityOf(id: number) {
  const [row] = await pgDb
    .select({ priority: task.priority })
    .from(task)
    .where(eq(task.id, id))
  return row!.priority
}

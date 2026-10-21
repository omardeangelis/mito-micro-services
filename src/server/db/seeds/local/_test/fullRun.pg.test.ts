import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { romeNoon } from "../day"
import { runLocalCrons } from "../cron"
import { seedDatabase } from "../seed"
import { verifyManifest } from "../verify"
import { hasTestDatabase, migrateUpTo, pgDb } from "@/test/pg"

// The runs take their client from the caller, never the module's `db`
vi.mock("@mito/db", () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error("the global db was used")
      },
    }
  ),
}))

/** A day in the past (D15). */
const DAY = "2026-10-14"

describe.skipIf(!hasTestDatabase)("full run at N = 10,000 (D2)", () => {
  beforeAll(async () => {
    await migrateUpTo()
  }, 120_000)

  afterEach(() => {
    vi.useRealTimers()
  })

  it("passes every scenario after the four runs, completezza and volumi included", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(romeNoon(DAY))

    const { dataset, manifest } = await seedDatabase(pgDb, {
      n: 10_000,
      day: DAY,
    })
    const after = await runLocalCrons({
      client: pgDb,
      manifest,
      jobs: ["priority", "alert", "update", "cleanup-task-event-log"],
      now: new Date(),
      onManifest: () => undefined,
    })

    const results = await verifyManifest(pgDb, after, dataset)
    expect(results.filter((result) => !result.passed)).toEqual([])
    expect(results.map((result) => result.id)).toEqual(
      expect.arrayContaining(["completezza", "volumi"])
    )
  }, 300_000)
})

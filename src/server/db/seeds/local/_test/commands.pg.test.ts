import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "fs"
import { mkdir } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { addDays, romeNoon } from "../day"
import { seedLocal } from "../commands/seed"
import { cronLocal } from "../commands/cron"
import { verifyLocal } from "../commands/verify"
import type { Manifest } from "../types"
import { pendingMigrations } from "../../../scripts/localDb"
import { hasTestDatabase, migrateUpTo, pgClient, pgDb } from "@/test/pg"

// The commands take their client from the caller: the module's `db`, which
// reads the Supabase variables, must never be reached
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

const DAY = "2026-10-14"
/** The migration before the last one: the database misses one. */
const PREVIOUS_MIGRATION = "20261019142325_blushing_roland_deschain"

describe.skipIf(!hasTestDatabase)("seedLocal", () => {
  beforeAll(async () => {
    await migrateUpTo(PREVIOUS_MIGRATION)
  }, 120_000)

  it("stops before writing on a database with a pending migration, naming `pnpm db:local:migrate` (AC2)", async () => {
    const manifestPath = path.join(
      mkdtempSync(path.join(tmpdir(), "seed-local-")),
      ".local-seed",
      "manifest.json"
    )

    await expect(
      seedLocal({ client: pgDb, now: romeNoon(DAY), n: 300, manifestPath })
    ).rejects.toThrow(/pnpm db:local:migrate/)

    const [row] = await pgClient<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "public"."mito-deutsche_customers"`
    expect(row!.n).toBe(0)
    expect(existsSync(manifestPath)).toBe(false)
  }, 120_000)
})

/** A manifest path in a folder of its own, never the repo's `.local-seed`. */
const tempManifestPath = () =>
  path.join(
    mkdtempSync(path.join(tmpdir(), "seed-local-")),
    ".local-seed",
    "manifest.json"
  )

/** 00:30 in Rome (summer time) of DAY: still 22:30 UTC of the day before. */
const afterMidnight = (day: string) =>
  new Date(`${addDays(day, -1)}T22:30:00.000Z`)

/** An old manifest at `manifestPath`, to see whether a command touches it. */
async function oldManifest(manifestPath: string) {
  await mkdir(path.dirname(manifestPath), { recursive: true })
  const text = JSON.stringify({
    day: "2026-01-01",
    n: 300,
    scenarios: [],
    runs: [],
  })
  writeFileSync(manifestPath, text)
  return text
}

const readJson = (manifestPath: string) =>
  JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest

async function countOf(table: string) {
  const [row] = await pgClient<{ n: number }[]>`
    SELECT count(*)::int AS n FROM ${pgClient(table)}`
  return row!.n
}

/** A fingerprint of every row of a table, to see whether anything changed. */
async function fingerprintOf(table: string) {
  const [row] = await pgClient<{ md5: string | null }[]>`
    SELECT md5(string_agg(t::text, ',' ORDER BY t::text)) AS md5
    FROM ${pgClient(table)} t`
  return row!.md5
}

describe.skipIf(!hasTestDatabase)("the guards of seedLocal", () => {
  beforeAll(async () => {
    // The migration the first describe left out
    await migrateUpTo()
  }, 120_000)

  it("finds no problem on a fully migrated database", async () => {
    expect(await pendingMigrations(pgDb)).toEqual([])
  })

  it("stops before writing when drizzle.__drizzle_migrations has a row the repo doesn't, or a different created_at (AC2)", async () => {
    const manifestPath = tempManifestPath()
    const old = await oldManifest(manifestPath)

    await pgClient`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('not-a-repo-migration', 9999999999999)`
    try {
      expect(await pendingMigrations(pgDb)).toHaveLength(1)
      await expect(
        seedLocal({ client: pgDb, now: romeNoon(DAY), n: 300, manifestPath })
      ).rejects.toThrow(/riga in più[\s\S]*pnpm db:local:migrate/)
    } finally {
      await pgClient`
        DELETE FROM drizzle.__drizzle_migrations
        WHERE hash = 'not-a-repo-migration'`
    }

    await pgClient`
      UPDATE drizzle.__drizzle_migrations SET created_at = created_at + 1
      WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations)`
    try {
      await expect(
        seedLocal({ client: pgDb, now: romeNoon(DAY), n: 300, manifestPath })
      ).rejects.toThrow(/created_at[\s\S]*pnpm db:local:migrate/)
    } finally {
      await pgClient`
        UPDATE drizzle.__drizzle_migrations SET created_at = created_at - 1
        WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations)`
    }

    expect(await pendingMigrations(pgDb)).toEqual([])
    expect(await countOf("mito-deutsche_customers")).toBe(0)
    expect(readFileSync(manifestPath, "utf8")).toBe(old)
  }, 120_000)

  it("stops at 00:30 in Rome with the message of AC4, writing nothing, not even the manifest (AC4)", async () => {
    const manifestPath = tempManifestPath()
    const old = await oldManifest(manifestPath)

    await expect(
      seedLocal({ client: pgDb, now: afterMidnight(DAY), n: 300, manifestPath })
    ).rejects.toThrow(/`alert` calcola il giorno in Europe\/Rome[\s\S]*UTC/)

    expect(await countOf("mito-deutsche_customers")).toBe(0)
    expect(readFileSync(manifestPath, "utf8")).toBe(old)
  }, 120_000)

  it("refuses fewer than 300 customers before connecting", async () => {
    const manifestPath = tempManifestPath()
    await expect(
      seedLocal({ client: pgDb, now: romeNoon(DAY), n: 299, manifestPath })
    ).rejects.toThrow(/300/)
    expect(existsSync(manifestPath)).toBe(false)
  })
})

describe.skipIf(!hasTestDatabase)(
  "seedLocal, cronLocal and verifyLocal",
  () => {
    const manifestPath = tempManifestPath()

    beforeAll(async () => {
      await migrateUpTo()
    }, 120_000)

    afterEach(() => {
      vi.useRealTimers()
    })

    it("seed, the four runs and the verification pass every scenario; a second update is refused (AC29, D6)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(romeNoon(DAY))

      const summary = await seedLocal({
        client: pgDb,
        now: new Date(),
        n: 300,
        manifestPath,
      })
      expect(summary).toMatchObject({ day: DAY, n: 300, manifestPath })
      expect(summary.counts.customers).toBe(300)
      const seeded = readJson(manifestPath)
      expect(seeded).toMatchObject({ day: DAY, n: 300, runs: [] })
      expect(seeded.scenarios.length).toBeGreaterThan(0)

      const after = await cronLocal({
        client: pgDb,
        now: new Date(),
        manifestPath,
      })
      expect(after.runs.map((run) => [run.job, run.outcome])).toEqual([
        ["priority", "succeeded"],
        ["alert", "succeeded"],
        ["update", "succeeded"],
        ["cleanup-task-event-log", "succeeded"],
      ])
      expect(readJson(manifestPath)).toEqual(after)

      const { lines, exitCode } = await verifyLocal({
        client: pgDb,
        now: new Date(),
        manifestPath,
      })
      expect(exitCode).toBe(0)
      expect(lines.length).toBeGreaterThan(0)
      expect(lines.filter((line) => !line.endsWith(" passato"))).toEqual([])

      await expect(
        cronLocal({
          client: pgDb,
          now: new Date(),
          jobs: ["update"],
          manifestPath,
        })
      ).rejects.toThrow(/update/)
      expect(readJson(manifestPath)).toEqual(after)
    }, 180_000)

    it("verifyLocal stops on another day than the manifest's, at 00:30 in Rome, and without the four runs succeeded (AC28b, D6)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] })
      for (const now of [romeNoon(addDays(DAY, 1)), afterMidnight(DAY)]) {
        vi.setSystemTime(now)
        await expect(
          verifyLocal({ client: pgDb, now, manifestPath })
        ).rejects.toThrow(/Roma/)
      }

      vi.setSystemTime(romeNoon(DAY))
      const full = readJson(manifestPath)
      const missing = tempManifestPath()
      await mkdir(path.dirname(missing), { recursive: true })
      writeFileSync(
        missing,
        JSON.stringify({ ...full, runs: full.runs.slice(0, -1) })
      )
      await expect(
        verifyLocal({ client: pgDb, now: new Date(), manifestPath: missing })
      ).rejects.toThrow(/cleanup-task-event-log[\s\S]*pnpm seed:local:cron/)

      const failed = tempManifestPath()
      await mkdir(path.dirname(failed), { recursive: true })
      writeFileSync(
        failed,
        JSON.stringify({
          ...full,
          runs: full.runs.map((run) =>
            run.job === "update" ? { ...run, outcome: "failed" } : run
          ),
        })
      )
      await expect(
        verifyLocal({ client: pgDb, now: new Date(), manifestPath: failed })
      ).rejects.toThrow(/update[\s\S]*pnpm seed:local/)

      await expect(
        verifyLocal({
          client: pgDb,
          now: new Date(),
          manifestPath: tempManifestPath(),
        })
      ).rejects.toThrow(/pnpm seed:local/)
    }, 120_000)

    it('verifyLocal exits with 1 and a "fallito" line when a P1 row doesn\'t hold (AC29)', async () => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(romeNoon(DAY))
      const manifest = readJson(manifestPath)
      const key = manifest.scenarios.find((scenario) => scenario.id === "P1")!
        .rows[0]!.key

      await pgClient`
      UPDATE "public"."mito-deutsche_task" SET priority = priority + 1
      WHERE id = ${Number(key)}`

      const { lines, exitCode } = await verifyLocal({
        client: pgDb,
        now: new Date(),
        manifestPath,
      })
      expect(exitCode).toBe(1)
      expect(lines).toContain("P1 fallito")
      expect(lines.some((line) => line.includes(`task ${key} priority`))).toBe(
        true
      )
    }, 120_000)

    it("a seedLocal that fails while writing leaves the previous seed as it was and no manifest (D6)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(romeNoon(DAY))
      const tables = [
        "mito-deutsche_customers",
        "mito-deutsche_practices",
        "mito-deutsche_task",
        "mito-deutsche_task_event_log",
      ]
      const before = await Promise.all(tables.map(fingerprintOf))
      expect(before.every(Boolean)).toBe(true)
      expect(existsSync(manifestPath)).toBe(true)

      await pgClient.unsafe(`
      CREATE FUNCTION seed_local_failpoint() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'seed local failpoint'; END $$;
      CREATE TRIGGER seed_local_failpoint
        BEFORE INSERT ON "public"."mito-deutsche_task"
        FOR EACH ROW EXECUTE FUNCTION seed_local_failpoint();
    `)
      try {
        await expect(
          seedLocal({ client: pgDb, now: new Date(), n: 300, manifestPath })
        ).rejects.toThrow()
      } finally {
        await pgClient.unsafe(`
        DROP TRIGGER IF EXISTS seed_local_failpoint
          ON "public"."mito-deutsche_task";
        DROP FUNCTION IF EXISTS seed_local_failpoint();
      `)
      }

      expect(await Promise.all(tables.map(fingerprintOf))).toEqual(before)
      expect(existsSync(manifestPath)).toBe(false)
    }, 120_000)
  }
)

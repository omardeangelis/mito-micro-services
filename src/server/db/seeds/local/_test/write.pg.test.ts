import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { localConnection } from "@mito/db/localDsn"
import type { DbClient } from "@mito/server/effect/db"
import { generateDataset } from "../generate"
import { romeNoon } from "../day"
import { writeDataset } from "../write"
import type { Dataset } from "../types"
import {
  hasTestDatabase,
  migrateUpTo,
  pgClient,
  pgDb,
  testDatabaseName,
} from "@/test/pg"

const DAY = "2026-10-14"

/** The table each `Dataset` key is written to. */
const TABLES: Record<keyof Dataset, string> = {
  products: "mito-deutsche_products",
  users: "mito-deutsche_user",
  operators: "mito-deutsche_operator",
  chats: "mito-deutsche_chat",
  messages: "mito-deutsche_messages",
  customers: "mito-deutsche_customers",
  practices: "mito-deutsche_practices",
  customerToPratica: "customers_to_pratiche",
  alerts: "mito-deutsche_alert",
  tasks: "mito-deutsche_task",
  taskEventLog: "mito-deutsche_task_event_log",
}

async function count(table: string) {
  const [{ n }] = await pgClient.unsafe<[{ n: number }]>(
    `SELECT count(*)::int AS n FROM "public"."${table}"`
  )
  return n
}

/** Every row of every table of `public`, as JSON, in a stable order. */
async function dump() {
  const tables = await pgClient<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  const result: Record<string, unknown> = {}
  for (const { tablename } of tables) {
    const [{ rows }] = await pgClient.unsafe<[{ rows: unknown }]>(
      `SELECT coalesce(json_agg(t ORDER BY t::text), '[]') AS rows FROM "public"."${tablename}" t`
    )
    result[tablename] = rows
  }
  return result
}

describe.skipIf(!hasTestDatabase)("writeDataset", () => {
  beforeAll(async () => {
    await migrateUpTo()
  }, 120_000)

  afterAll(() => {
    vi.useRealTimers()
  })

  it("writes the same rows, timestamps included, at two hours of the day (AC5)", async () => {
    const dataset = generateDataset({ n: 300, day: DAY })
    vi.useFakeTimers({ toFake: ["Date"] })

    vi.setSystemTime(new Date(romeNoon(DAY).getTime() - 3 * 3600_000))
    await writeDataset(pgDb, dataset)
    const first = await dump()

    vi.setSystemTime(new Date(romeNoon(DAY).getTime() + 5 * 3600_000))
    await writeDataset(pgDb, dataset)
    const second = await dump()

    vi.useRealTimers()
    expect((first["mito-deutsche_customers"] as unknown[]).length).toBe(300)
    expect(second).toEqual(first)
  }, 120_000)

  it("empties the other tables, sessions and cron runs included (AC3)", async () => {
    const dataset = generateDataset({ n: 300, day: DAY })
    await writeDataset(pgDb, dataset)

    await pgClient.unsafe(`
      INSERT INTO "public"."mito-deutsche_user" (id, email, role)
        VALUES ('stale-admin', 'stale@example.test', 'ADMIN');
      INSERT INTO "public"."mito-deutsche_session" ("sessionToken", "userId", expires)
        VALUES ('stale-token', 'stale-admin', now());
      INSERT INTO "public"."mito-deutsche_cron_run" (job, run_day, status)
        VALUES ('priority', '2026-10-14', 'succeeded');
      INSERT INTO "public"."mito-deutsche_verificationToken" (identifier, token, expires)
        VALUES ('stale@example.test', 'stale-vt', now());
    `)

    await writeDataset(pgDb, dataset)

    expect(await count("mito-deutsche_session")).toBe(0)
    expect(await count("mito-deutsche_cron_run")).toBe(0)
    expect(await count("mito-deutsche_account")).toBe(0)
    expect(await count("mito-deutsche_verificationToken")).toBe(0)
    const users = await pgClient<{ id: string }[]>`
      SELECT id FROM "public"."mito-deutsche_user"`
    expect(users.map((u) => u.id).sort()).toEqual(
      dataset.users.map((u) => u.id).sort()
    )
  }, 120_000)

  it("writes as many rows as the dataset has, one active task per customer at most", async () => {
    const dataset = generateDataset({ n: 300, day: DAY })
    await writeDataset(pgDb, dataset)

    for (const [key, table] of Object.entries(TABLES)) {
      expect(await count(table), table).toBe(
        dataset[key as keyof Dataset].length
      )
    }
    const [{ worst }] = await pgClient.unsafe<[{ worst: number }]>(`
      SELECT coalesce(max(n), 0)::int AS worst FROM (
        SELECT count(*) AS n FROM "public"."mito-deutsche_task"
        WHERE is_active AND customer_id IS NOT NULL GROUP BY customer_id
      ) t`)
    expect(worst).toBeLessThanOrEqual(1)
  }, 120_000)

  it("leaves the identity sequences above the dataset's ids (D8)", async () => {
    const dataset = generateDataset({ n: 300, day: DAY })
    await writeDataset(pgDb, dataset)

    const maxTask = Math.max(...dataset.tasks.map((t) => t.id))
    const [newTask] = await pgClient.unsafe<[{ id: number }]>(
      `INSERT INTO "public"."mito-deutsche_task" DEFAULT VALUES RETURNING id`
    )
    expect(newTask.id).toBeGreaterThan(maxTask)

    const maxMessage = Math.max(...dataset.messages.map((m) => m.id))
    const [newMessage] = await pgClient.unsafe<[{ id: number }]>(
      `INSERT INTO "public"."mito-deutsche_messages" (operator_id, chat_id, content)
       VALUES (${dataset.messages[0]!.operatorId}, ${dataset.messages[0]!.chatId}, 'x')
       RETURNING id`
    )
    expect(newMessage.id).toBeGreaterThan(maxMessage)
  }, 120_000)

  it("rolls everything back when a row is invalid", async () => {
    const dataset = generateDataset({ n: 300, day: DAY })
    await writeDataset(pgDb, dataset)
    const before = await dump()

    const invalid: Dataset = {
      ...dataset,
      tasks: dataset.tasks.map((t, i) =>
        i === 0 ? { ...t, customerId: "customer-that-does-not-exist" } : t
      ),
    }
    await expect(writeDataset(pgDb, invalid)).rejects.toThrow()

    expect(await dump()).toEqual(before)
  }, 120_000)

  it("refuses a database that is not a local one before it truncates anything", async () => {
    const dataset = generateDataset({ n: 300, day: DAY })
    const transaction = vi.fn()
    const execute = vi
      .fn()
      .mockResolvedValue([{ current_database: "mito_dev" }])
    const fake = { execute, transaction } as unknown as DbClient

    await expect(writeDataset(fake, dataset)).rejects.toThrow(/mito_dev/)

    expect(transaction).not.toHaveBeenCalled()
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("fails with a message when another session holds a lock", async () => {
    const dataset = generateDataset({ n: 300, day: DAY })
    await writeDataset(pgDb, dataset)
    const before = await dump()

    const other = postgres({
      ...localConnection(process.env.TEST_DATABASE_URL!),
      database: testDatabaseName,
      max: 1,
      onnotice: () => undefined,
    })
    try {
      await other`BEGIN`
      await other.unsafe(
        `LOCK TABLE "public"."mito-deutsche_customers" IN ACCESS SHARE MODE`
      )

      const started = Date.now()
      await expect(
        writeDataset(pgDb, dataset, { lockTimeoutMs: 500 })
      ).rejects.toThrow(/altra sessione.*lock/)
      expect(Date.now() - started).toBeLessThan(5_000)
    } finally {
      await other`ROLLBACK`
      await other.end({ timeout: 1 })
    }

    expect(await dump()).toEqual(before)
  }, 60_000)

  it("writes 10,000 customers", async () => {
    const dataset = generateDataset({ n: 10_000, day: DAY })

    const started = Date.now()
    await writeDataset(pgDb, dataset)
    console.log(`writeDataset n=10000: ${Date.now() - started} ms`)

    expect(await count("mito-deutsche_customers")).toBe(10_000)
  }, 180_000)
})

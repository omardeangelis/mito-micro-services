import { readFileSync } from "fs"
import path from "path"
import { sql } from "drizzle-orm"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { driverFailure, migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createOperator } from "@/test/factories"

const CUSTOM_MIGRATION_TAG_PART = "calls_registry_milestone"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const milestone = async (name: string) => {
  const { rows } = await testDb.execute<{ name: string; at: Date | string }>(
    sql`SELECT name, at FROM "mito-deutsche_app_milestone" WHERE name = ${name}`
  )
  return rows[0]
}

describe("registro delle chiamate: schema e migrazioni (T2)", () => {
  it("una seconda riga call con lo stesso request_id viola l'indice unico", async () => {
    const operator = await createOperator()
    const customer = await createCustomer()
    const [created] = await testDb
      .insert(task)
      .values({ customerId: customer.id, isActive: true })
      .returning()
    const requestId = "2f6c3a0e-8a3c-4c1e-9d55-0f6f0a1b2c3d"
    const call = {
      customerId: customer.id,
      taskId: created!.id,
      actorOperatorId: operator.id,
      action: "call" as const,
      source: "detail" as const,
      outcome: "non risponde" as const,
      origin: "list" as const,
      requestId,
    }

    await testDb.insert(taskEventLog).values(call)

    await expect(
      driverFailure(testDb.insert(taskEventLog).values(call))
    ).rejects.toMatchObject({ code: "23505" })
  })

  it("le righe senza request_id non si escludono fra loro (indice parziale)", async () => {
    const operator = await createOperator()
    const customer = await createCustomer()
    const row = {
      customerId: customer.id,
      actorOperatorId: operator.id,
      action: "call" as const,
      source: "detail" as const,
    }

    await testDb.insert(taskEventLog).values([row, row])

    const { rows } = await testDb.execute(
      sql`SELECT 1 FROM "mito-deutsche_task_event_log" WHERE request_id IS NULL`
    )
    expect(rows).toHaveLength(2)
  })

  it("un contatto creato senza stato è chiamare", async () => {
    const customer = await createCustomer()

    const [created] = await testDb
      .insert(task)
      .values({ customerId: customer.id })
      .returning()

    expect(created!.state).toBe("chiamare")
  })

  it("dopo le migrazioni calls_registry esiste (dopo il reset, al 9999-12-31)", async () => {
    // beforeEach ha già svuotato le tabelle: la riga c'è per il reset
    const row = await milestone("calls_registry")

    expect(row).toBeDefined()
    expect(new Date(row!.at).toISOString()).toBe("9999-12-31T00:00:00.000Z")
  })

  it("il journal contiene la migrazione personalizzata dell'entrata in uso", () => {
    const journal = JSON.parse(
      readFileSync(
        path.resolve(
          __dirname,
          "../../../packages/db/migrations/meta/_journal.json"
        ),
        "utf8"
      )
    ) as { entries: { tag: string; when: number }[] }

    expect(
      journal.entries.some(({ tag }) => tag.endsWith(CUSTOM_MIGRATION_TAG_PART))
    ).toBe(true)
  })

  it("la migrazione personalizzata scrive calls_registry con now()", () => {
    const migrationsDir = path.resolve(
      __dirname,
      "../../../packages/db/migrations"
    )
    const journal = JSON.parse(
      readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf8")
    ) as { entries: { tag: string }[] }
    const entry = journal.entries.find(({ tag }) =>
      tag.endsWith(CUSTOM_MIGRATION_TAG_PART)
    )

    const text = readFileSync(
      path.join(migrationsDir, `${entry!.tag}.sql`),
      "utf8"
    )

    expect(text).toContain('INSERT INTO "mito-deutsche_app_milestone"')
    expect(text).toContain("'calls_registry'")
    expect(text).toContain("ON CONFLICT DO NOTHING")
  })
})

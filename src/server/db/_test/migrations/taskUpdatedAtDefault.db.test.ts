import { beforeAll, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { task } from "@mito/db/schema/task"
import { CONTATTI_SCHEMA_TAG, migrateUpTo, testClient, testDb } from "@/test/db"
import { createTask } from "@/test/factories"

// The databases in use got task.updated_at from a `drizzle-kit push` of a
// schema that said `.default(new Date())`: the default is the moment of that
// push, a constant. Every snapshot says CURRENT_TIMESTAMP, so `db:generate`
// never emitted the fix. Migrated up to the migration before, given the
// default they have, seeded, then migrated to the end.

// The default of the development database
const FROZEN = new Date("2024-11-16T17:35:42.926Z")

const at = (time: string) => new Date(`2026-09-20T${time}Z`)

const taskById = async (id: number) => {
  const [row] = await testDb.select().from(task).where(eq(task.id, id))
  return row!
}

let frozenId: number
let updatedLaterId: number
let clockSkewId: number

beforeAll(async () => {
  await migrateUpTo(CONTATTI_SCHEMA_TAG)
  await testClient.exec(
    `ALTER TABLE "mito-deutsche_task" ALTER COLUMN "updated_at" SET DEFAULT '${FROZEN.toISOString()}'`
  )

  // Inserted and never updated since, as replaceActiveContact leaves a contact
  const frozen = await createTask({ customerId: null })
  expect(frozen.updatedAt).toEqual(FROZEN)
  frozenId = frozen.id
  const updatedLater = await createTask({
    customerId: null,
    createdAt: at("09:00:00.000"),
    updatedAt: at("15:00:00.000"),
  })
  updatedLaterId = updatedLater.id
  // updated_at is the app's clock, created_at the database's: the app's can
  // be a little behind
  const clockSkew = await createTask({
    customerId: null,
    createdAt: at("09:00:00.000"),
    updatedAt: at("08:59:59.800"),
  })
  clockSkewId = clockSkew.id

  await migrateUpTo()
})

describe("default di task.updated_at", () => {
  it("è il momento dell'inserimento, non una data fissa", async () => {
    const { rows } = await testClient.query<{ column_default: string }>(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'mito-deutsche_task' AND column_name = 'updated_at'`
    )
    expect(rows).toEqual([{ column_default: "CURRENT_TIMESTAMP" }])

    const created = await createTask({ customerId: null })
    expect(created.updatedAt).toEqual(created.createdAt)
    expect(created.updatedAt).not.toEqual(FROZEN)
  })

  it("le task nate con la data fissa prendono la data di creazione", async () => {
    const frozen = await taskById(frozenId)

    expect(frozen.updatedAt).toEqual(frozen.createdAt)
  })

  it("le altre task tengono la loro data", async () => {
    expect((await taskById(updatedLaterId)).updatedAt).toEqual(
      at("15:00:00.000")
    )
    expect((await taskById(clockSkewId)).updatedAt).toEqual(at("08:59:59.800"))
  })
})

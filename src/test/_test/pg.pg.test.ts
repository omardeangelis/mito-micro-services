import fs from "fs"
import path from "path"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createTestCaller } from "@/test/caller"
import { createCustomer, createOperator } from "@/test/factories"
import {
  activeTasksOf,
  hasTestDatabase,
  holdCustomerLock,
  migrateUpTo,
  pgClient,
  resetDb,
  testDatabaseName,
  waitUntilBlocked,
} from "@/test/pg"

const journal = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../server/db/migrations/meta/_journal.json"),
    "utf8"
  )
) as { entries: unknown[] }

describe.skipIf(!hasTestDatabase)("harness su Postgres vero", () => {
  beforeAll(async () => {
    await migrateUpTo()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it("lavora su un database suo, in UTC, con tutte le migrazioni applicate", async () => {
    expect(testDatabaseName).toMatch(/^mito_test_[0-9a-f]{12}$/)
    const [session] = await pgClient`
      SELECT current_database() AS name, current_setting('TimeZone') AS tz`
    expect(session).toEqual({ name: testDatabaseName, tz: "UTC" })
    const [applied] = await pgClient`
      SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`
    expect(applied!.n).toBe(journal.entries.length)
  })

  it("'Crea contatto' via caller lascia un solo contatto attivo", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })

    await createTestCaller(operator).task.createContact({
      customerId: customer.id,
      source: "detail",
    })

    const contacts = await activeTasksOf(customer.id)
    expect(contacts).toHaveLength(1)
    expect(contacts[0]).toMatchObject({
      state: "chiamare",
      operatorId: operator.id,
    })
  })

  it("una chiamata sullo stesso cliente aspetta il lock del test, e finisce quando il test lo rilascia", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const lock = await holdCustomerLock(customer.id)

    let settled = false
    const call = createTestCaller(operator)
      .task.createContact({ customerId: customer.id, source: "detail" })
      .finally(() => {
        settled = true
      })
    await waitUntilBlocked(1)
    expect(settled).toBe(false)
    expect(await activeTasksOf(customer.id)).toHaveLength(0)

    await lock.release()
    await call
    expect(await activeTasksOf(customer.id)).toHaveLength(1)
  })
})

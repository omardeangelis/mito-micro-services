import { drizzle } from "drizzle-orm/postgres-js"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { extraDatabase, hasTestDatabase, reconnect } from "@/test/pg"
import { compareFingerprints, fingerprint } from "../copyCheck"
import { migrateDatabase } from "../localDb"

/** A migrated database with a few rows, and an identical copy of it. */
async function sourceAndCopy() {
  const source = await extraDatabase()
  await migrateDatabase(source.client)
  const db = drizzle(source.client)
  await db.insert(users).values([
    { id: "user-1", email: "a@test.local", role: "ADMIN" },
    { id: "user-2", email: "b@test.local", role: "OPERATORE" },
  ])
  await db.insert(operators).values([
    { userId: "user-1", name: "Ada", surname: "Uno" },
    { userId: "user-2", name: "Bruno", surname: "Due" },
  ])
  await db.insert(customers).values(
    ["customer-1", "customer-2"].map((id) => ({
      id,
      name: "Anna",
      surname: id,
      tempID: id,
      uniqueHash: id,
      source: "inbound" as const,
    }))
  )
  // Postgres copies a database only when nobody is connected to it
  await source.client.end()
  const copy = await extraDatabase({ template: source.name })
  reconnect(source)
  return { source, copy }
}

const differences = async (
  source: Awaited<ReturnType<typeof sourceAndCopy>>["source"],
  copy: Awaited<ReturnType<typeof sourceAndCopy>>["copy"]
) =>
  compareFingerprints(
    await fingerprint(source.client),
    await fingerprint(copy.client)
  )

describe.skipIf(!hasTestDatabase)("verifica della copia del database", () => {
  it("una copia identica non ha differenze, migrazioni comprese", async () => {
    const { source, copy } = await sourceAndCopy()

    const print = await fingerprint(copy.client)
    expect(print.tables["public.mito-deutsche_customers"]?.rows).toBe(2)
    expect(print.tables["drizzle.__drizzle_migrations"]?.rows).toBeGreaterThan(
      0
    )
    expect(await differences(source, copy)).toEqual([])
  })

  it("un valore cambiato, una riga in più e una sequenza avanzata compaiono", async () => {
    const { source, copy } = await sourceAndCopy()
    const db = drizzle(copy.client)

    await db
      .update(customers)
      .set({ name: "Altro" })
      .where(eq(customers.id, "customer-1"))
    await db
      .insert(users)
      .values({ id: "user-3", email: "c@test.local", role: "OPERATORE" })
    await db
      .insert(operators)
      .values({ userId: "user-3", name: "Carla", surname: "Tre" })

    expect(await differences(source, copy)).toEqual([
      "public.mito-deutsche_customers: same 2 rows, different values",
      "public.mito-deutsche_operator: 2 rows, 3 in the copy",
      "public.mito-deutsche_user: 2 rows, 3 in the copy",
      "sequence public.mito-deutsche_operator_id_seq: 1001, 1002 in the copy",
    ])
  })

  it("una tabella, un indice o un'impostazione del database in più compaiono", async () => {
    const { source, copy } = await sourceAndCopy()

    await copy.client`CREATE INDEX extra_idx ON "mito-deutsche_customers" (name)`
    await copy.client`CREATE TABLE extra (id int)`
    await copy.client.unsafe(
      `ALTER DATABASE "${copy.name}" SET TimeZone = 'Europe/Rome'`
    )

    const found = await differences(source, copy)
    expect(found).toContain("public.extra: only in the copy")
    expect(found.some((line) => line.startsWith("schema indexes:"))).toBe(true)
    expect(found.some((line) => line.startsWith("schema columns:"))).toBe(true)
    expect(found).toContain(
      'schema settings: null in the source, {"setting":"TimeZone=Europe/Rome"} in the copy'
    )
  })
})

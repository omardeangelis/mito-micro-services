import { beforeAll, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createPractice, createUser } from "@/test/factories"

// The trace of the clients of a Wave import (spec assegnazione-wave, AC29,
// D14): the migration that creates `import_run_customer` rebuilds it for the
// Wave imports already completed, from `file_name` of customers and practices

const PREVIOUS = "20261102144816_calls_registry_milestone"

const insertRun = async (values: {
  startedBy: string
  fileName: string
  format: "wave" | "standard"
  status?: "completed" | "failed"
  claimedAt?: string | null
  startedAt?: string
}) => {
  const rows = await testDb.execute<{ id: number }>(sql`
    INSERT INTO "mito-deutsche_import_run"
      (started_at, claimed_at, started_by, file_name, format, status,
       rows_total, rows_discarded)
    VALUES (${values.startedAt ?? "2026-11-10T09:00:00Z"},
      ${values.claimedAt === undefined ? "2026-11-10T09:00:30Z" : values.claimedAt},
      ${values.startedBy}, ${values.fileName}, ${values.format},
      ${values.status ?? "completed"}, 10, 0)
    RETURNING id`)
  return Number(rows.rows[0]!.id)
}

const traceOf = async (runId: number) => {
  const rows = await testDb.execute<{
    customer_id: string
    created: boolean | null
  }>(sql`
    SELECT customer_id, created FROM "mito-deutsche_import_run_customer"
    WHERE run_id = ${runId} ORDER BY customer_id`)
  return rows.rows
}

describe("ricostruzione della traccia dei clienti Wave", () => {
  const ids: Record<string, number | string> = {}

  beforeAll(async () => {
    await migrateUpTo(PREVIOUS)
    await resetDb()
    const admin = await createUser({ role: "ADMIN" })

    // Wave of November 2026 (Rome), a month before the same file name
    ids.november = await insertRun({
      startedBy: admin.id,
      fileName: "WAVE-NOV.xlsx",
      format: "wave",
      claimedAt: "2026-11-10T09:00:30Z",
    })
    // The name already carries MMYY: kept as it is
    ids.prefixed = await insertRun({
      startedBy: admin.id,
      fileName: "0926-WAVE-SET.xlsx",
      format: "wave",
      claimedAt: "2026-09-10T09:00:00Z",
    })
    // No claimed_at: the month comes from started_at, 1 October in Rome
    ids.fallback = await insertRun({
      startedBy: admin.id,
      fileName: "WAVE-OTT.xlsx",
      format: "wave",
      claimedAt: null,
      startedAt: "2026-09-30T22:30:00Z",
    })
    // claimed_at wins over started_at: October in Rome by started_at, but
    // November by claimed_at (00:10 of the 1st in Rome)
    ids.boundary = await insertRun({
      startedBy: admin.id,
      fileName: "WAVE-BOUND.xlsx",
      format: "wave",
      startedAt: "2026-10-31T22:50:00Z",
      claimedAt: "2026-10-31T23:10:00Z",
    })
    ids.standard = await insertRun({
      startedBy: admin.id,
      fileName: "WAVE-NOV.xlsx",
      format: "standard",
    })
    ids.failed = await insertRun({
      startedBy: admin.id,
      fileName: "WAVE-NOV.xlsx",
      format: "wave",
      status: "failed",
    })

    ids.byFile = (await createCustomer({ fileName: "1126_WAVE_NOV.xlsx" })).id
    ids.previousMonth = (
      await createCustomer({ fileName: "1026_WAVE_NOV.xlsx" })
    ).id
    // the same customer also has a practice with the same file_name
    await createPractice({
      customerId: ids.byFile,
      fileName: "1126_WAVE_NOV.xlsx",
    })
    ids.boundaryNovember = (
      await createCustomer({ fileName: "1126_WAVE_BOUND.xlsx" })
    ).id
    ids.boundaryOctober = (
      await createCustomer({ fileName: "1026_WAVE_BOUND.xlsx" })
    ).id
    ids.other = (await createCustomer({ fileName: "1126_ALTRO.xlsx" })).id
    ids.noFile = (await createCustomer({ fileName: null })).id
    ids.byPractice = (await createCustomer({ fileName: null })).id
    await createPractice({
      customerId: ids.byPractice,
      fileName: "1126_WAVE_NOV.xlsx",
    })
    ids.fallbackCustomer = (
      await createCustomer({ fileName: "1026_WAVE_OTT.xlsx" })
    ).id
    // 0926-WAVE-SET.xlsx starts with 4 digits: no prefix, dashes become _
    ids.prefixedCustomer = (
      await createCustomer({ fileName: "0926_WAVE_SET.xlsx" })
    ).id

    await migrateUpTo()
  })

  it("un cliente con file_name 1126_WAVE_NOV.xlsx entra nella traccia della Wave WAVE-NOV.xlsx di novembre 2026, con created NULL", async () => {
    const trace = await traceOf(ids.november as number)
    expect(trace).toContainEqual({
      customer_id: ids.byFile,
      created: null,
    })
  })

  it("un cliente di una pratica con file_name uguale entra nella traccia, e solo una volta", async () => {
    const trace = await traceOf(ids.november as number)
    expect(trace.map((row) => row.customer_id).sort()).toEqual(
      [ids.byFile, ids.byPractice].sort()
    )
    // byFile matches by customer and by practice: still one row
    expect(trace.filter((row) => row.customer_id === ids.byFile)).toHaveLength(
      1
    )
    expect(trace.every((row) => row.created === null)).toBe(true)
  })

  it("un cliente di 1026_WAVE_NOV.xlsx, il mese prima, non entra nella traccia di novembre", async () => {
    const trace = await traceOf(ids.november as number)
    expect(trace.map((row) => row.customer_id)).not.toContain(ids.previousMonth)
  })

  it("un nome che inizia con 4 cifre resta com'è, con i trattini al posto dei trattini bassi", async () => {
    const trace = await traceOf(ids.prefixed as number)
    expect(trace.map((row) => row.customer_id)).toEqual([ids.prefixedCustomer])
  })

  it("senza claimed_at il mese di Roma viene da started_at, non quello UTC", async () => {
    const trace = await traceOf(ids.fallback as number)
    expect(trace.map((row) => row.customer_id)).toEqual([ids.fallbackCustomer])
  })

  it("con claimed_at e started_at in mesi diversi a Roma vince claimed_at", async () => {
    const trace = await traceOf(ids.boundary as number)
    expect(trace.map((row) => row.customer_id)).toEqual([ids.boundaryNovember])
  })

  it("un import Standard e un import fallito non hanno traccia", async () => {
    expect(await traceOf(ids.standard as number)).toEqual([])
    expect(await traceOf(ids.failed as number)).toEqual([])
  })
})

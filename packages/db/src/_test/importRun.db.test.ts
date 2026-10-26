import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { driverError } from "@mito/db/driverError"
import {
  importRun,
  importUpload,
  importUploadPart,
} from "@mito/db/schema/importRun"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createUser } from "@/test/factories"

// The tables of the import (spec import-pratiche, T7): the history, one row
// per import, and the rows of the file waiting for the import, in parts

const run = (startedBy: string, status: "running" | "completed") => ({
  startedBy,
  fileName: "0125_import.xlsx",
  format: "wave" as const,
  status,
  rowsTotal: 3,
  rowsDiscarded: 1,
})

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    const cause = driverError(error) as { code?: string } | undefined
    return cause?.code
  }
  return undefined
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("import_run", () => {
  it("una seconda riga 'running' fallisce con 23505: un import alla volta (D7)", async () => {
    const admin = await createUser({ role: "ADMIN" })
    await testDb.insert(importRun).values(run(admin.id, "running"))

    const code = await codeOf(
      testDb.insert(importRun).values(run(admin.id, "running"))
    )

    expect(code).toBe("23505")
  })

  it("gli import finiti non contano: uno in corso e altri completati", async () => {
    const admin = await createUser({ role: "ADMIN" })
    await testDb
      .insert(importRun)
      .values([run(admin.id, "completed"), run(admin.id, "completed")])

    const [inserted] = await testDb
      .insert(importRun)
      .values(run(admin.id, "running"))
      .returning()

    expect(inserted).toMatchObject({
      status: "running",
      claimedAt: null,
      finishedAt: null,
      customersCreated: null,
    })
    expect(inserted?.startedAt).toBeInstanceOf(Date)
  })

  it("un import nasce 'running'", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const { status: _, ...values } = run(admin.id, "running")

    const [inserted] = await testDb.insert(importRun).values(values).returning()

    expect(inserted?.status).toBe("running")
  })
})

describe("import_upload", () => {
  it("cancellare un upload cancella i suoi pezzi", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const [upload] = await testDb
      .insert(importUpload)
      .values({
        createdBy: admin.id,
        fileName: "0125_import.xlsx",
        format: "standard",
        parts: 2,
      })
      .returning()
    await testDb.insert(importUploadPart).values([
      { uploadId: upload!.id, part: 0, data: new Uint8Array([1, 2, 3]) },
      { uploadId: upload!.id, part: 1, data: new Uint8Array([4]) },
    ])

    await testDb.delete(importUpload).where(eq(importUpload.id, upload!.id))

    expect(await testDb.select().from(importUploadPart)).toEqual([])
  })

  it("un pezzo tiene i byte com'erano, uno per numero", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const [upload] = await testDb
      .insert(importUpload)
      .values({
        createdBy: admin.id,
        fileName: "0125_import.xlsx",
        format: "wave",
        parts: 1,
      })
      .returning()
    const bytes = new Uint8Array([0, 255, 31, 139])
    await testDb
      .insert(importUploadPart)
      .values({ uploadId: upload!.id, part: 0, data: bytes })

    const [stored] = await testDb.select().from(importUploadPart)
    const again = await codeOf(
      testDb
        .insert(importUploadPart)
        .values({ uploadId: upload!.id, part: 0, data: bytes })
    )

    expect(upload?.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(upload?.runId).toBeNull()
    expect(upload?.expected).toBeNull()
    expect([...stored!.data]).toEqual([...bytes])
    expect(again).toBe("23505")
  })

  it("un upload si collega al suo import, con le righe confermate", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const [started] = await testDb
      .insert(importRun)
      .values(run(admin.id, "running"))
      .returning()
    const [upload] = await testDb
      .insert(importUpload)
      .values({
        createdBy: admin.id,
        fileName: "0125_import.xlsx",
        format: "wave",
        parts: 1,
        runId: started!.id,
        expected: [2, 3, 5],
      })
      .returning()

    expect(upload?.runId).toBe(started!.id)
    expect(upload?.expected).toEqual([2, 3, 5])
    expect(
      await codeOf(
        testDb.insert(importUpload).values({
          createdBy: admin.id,
          fileName: "0125_import.xlsx",
          format: "wave",
          parts: 1,
          runId: 9999,
        })
      )
    ).toBe("23503")
  })
})

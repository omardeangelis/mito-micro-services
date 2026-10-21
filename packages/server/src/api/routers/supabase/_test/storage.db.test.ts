import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestCaller } from "@/test/caller"

// The bucket is a boundary: one in-memory store shared by every call of this file
vi.mock("../../../../services/storage/layer", async () => {
  const { Effect, Layer } = await import("effect")
  // Not the index: it re-exports this module
  const { Storage } = await import("../../../../services/storage/storage")
  const { makeMemoryStorageLayer } = await import(
    "../../../../services/storage/memory"
  )
  // Built once, so an upload is still there for the next call
  const service = Effect.runSync(
    Effect.provide(Storage, makeMemoryStorageLayer())
  )
  return { StorageLive: Layer.succeed(Storage, service) }
})

const caller = () => createTestCaller({ userId: "user-1" })
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("supabase.createExportUploadUrl", () => {
  it("firma un upload sotto export/ con il content type dell'xlsx", async () => {
    const result = await caller().supabase.createExportUploadUrl({
      filePathName: "export_20/10/2026.xlsx",
    })

    expect(result.contentType).toBe(XLSX)
    expect(result.url).toContain("export/export_20/10/2026.xlsx")
    expect(result.url).toContain("action=write")
  })

  it.each(["", "/root.xlsx", "../segreto.xlsx", "a/../../b.xlsx"])(
    "rifiuta il nome %j",
    async (filePathName) => {
      await expect(
        caller().supabase.createExportUploadUrl({ filePathName })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    }
  )

  it("senza sessione risponde UNAUTHORIZED", async () => {
    const { appRouter } = await import("../../../root")
    const anonymous = appRouter.createCaller({
      session: null,
    } as unknown as Parameters<typeof appRouter.createCaller>[0])

    await expect(
      anonymous.supabase.createExportUploadUrl({ filePathName: "a.xlsx" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })
})

describe("supabase upload e download dell'export", () => {
  it("un file caricato si riscarica con lo stesso contenuto", async () => {
    const saved = await caller().supabase.uploadExportFile({
      filePathName: "report.xlsx",
      buffer: Buffer.from("ciao"),
    })
    expect(saved).toBe("report.xlsx")

    const response = await caller().supabase.downloadExportFile({
      filePathName: "report.xlsx",
    })

    expect(response).not.toBeInstanceOf(Response)
    if (response instanceof Response) return
    expect(response.status).toBe(200)
    expect(Buffer.from(response.buffer).toString()).toBe("ciao")
    expect(response.headers.get("Content-Disposition")).toBe(
      "attachment; filename=report.xlsx"
    )
  })

  it("un file che non c'è risponde 500", async () => {
    const response = await caller().supabase.downloadExportFile({
      filePathName: "manca.xlsx",
    })

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(500)
  })

  it("senza nome risponde 400", async () => {
    const response = await caller().supabase.downloadExportFile({
      filePathName: "",
    })

    expect((response as Response).status).toBe(400)
  })
})

describe("supabase.deleteExportFile", () => {
  it("svuota la cartella export", async () => {
    await caller().supabase.uploadExportFile({
      filePathName: "a.xlsx",
      buffer: Buffer.from("a"),
    })

    await caller().supabase.deleteExportFile()

    const response = await caller().supabase.downloadExportFile({
      filePathName: "a.xlsx",
    })
    expect((response as Response).status).toBe(500)
  })
})

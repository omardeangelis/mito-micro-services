import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestCaller } from "@/test/caller"

// The bucket is a boundary: one in-memory store shared by every call of this file
vi.mock("../../../../services/storage/layer", async () => {
  const { Effect, Layer } = await import("effect")
  // Not the index: it re-exports this module
  const { Storage } = await import("../../../../services/storage/storage")
  const { makeMemoryStorageLayer } =
    await import("../../../../services/storage/memory")
  // Built once, so an upload is still there for the next call
  const service = Effect.runSync(
    Effect.provide(Storage, makeMemoryStorageLayer())
  )
  return { StorageLive: Layer.succeed(Storage, service) }
})

const caller = () => createTestCaller({ userId: "user-1" })

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("supabase upload e download dell'export", () => {
  it("un file caricato si riscarica con lo stesso contenuto", async () => {
    const saved = await caller().supabase.uploadExportFile({
      filePathName: "error-import-23-10-2026.xlsx",
      buffer: Buffer.from("ciao"),
    })
    expect(saved).toBe("error-import-23-10-2026.xlsx")

    const response = await caller().supabase.downloadExportFile({
      filePathName: "error-import-23-10-2026.xlsx",
    })

    expect(response).not.toBeInstanceOf(Response)
    if (response instanceof Response) return
    expect(response.status).toBe(200)
    expect(Buffer.from(response.buffer).toString()).toBe("ciao")
    expect(response.headers.get("Content-Disposition")).toBe(
      "attachment; filename=error-import-23-10-2026.xlsx"
    )
  })

  it("un file che non c'è risponde 500", async () => {
    const response = await caller().supabase.downloadExportFile({
      filePathName: "error-import-01-01-2026.xlsx",
    })

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(500)
  })

  it("un file che non è un errore dell'import risponde 404, anche se c'è", async () => {
    await caller().supabase.uploadExportFile({
      filePathName: "export_chiamate_23-10-2026.xlsx",
      buffer: Buffer.from("note dei clienti"),
    })

    for (const filePathName of [
      "export_chiamate_23-10-2026.xlsx",
      "../error-import-23-10-2026.xlsx",
    ]) {
      const response = await caller().supabase.downloadExportFile({
        filePathName,
      })
      expect((response as Response).status).toBe(404)
    }
  })

  it("senza nome risponde 400", async () => {
    const response = await caller().supabase.downloadExportFile({
      filePathName: "",
    })

    expect((response as Response).status).toBe(400)
  })
})

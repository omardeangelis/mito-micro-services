// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import jwt from "jsonwebtoken"
import { NextRequest } from "next/server"
import { getServerAuthSession } from "@mito/server/auth"
import type {
  StorageService,
  UploadInput,
} from "@mito/server/services/storage/storage"
import { POST } from "../route"

// What importError.test.ts does not try: the token of the cron scripts, which
// authCheck accepts only when it is handed the request. The bucket is one
// in-memory store, with `upload` spied on
const storage = vi.hoisted(() => ({
  upload: vi.fn<[UploadInput], ReturnType<StorageService["upload"]>>(),
  memory: undefined as StorageService | undefined,
}))

vi.mock("@mito/server/services/storage/layer", async () => {
  const { Effect, Layer } = await import("effect")
  // Not the index: it re-exports this module
  const { Storage } = await import("@mito/server/services/storage/storage")
  const { makeMemoryStorageLayer } =
    await import("@mito/server/services/storage/memory")
  const service = Effect.runSync(
    Effect.provide(Storage, makeMemoryStorageLayer())
  )
  storage.memory = service
  return {
    StorageLive: Layer.succeed(Storage, {
      ...service,
      upload: (input: UploadInput) => storage.upload(input),
    }),
  }
})

const SECRET = "test-secret"

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.stubEnv("CRON_SECRET_KEY", SECRET)
  vi.mocked(getServerAuthSession).mockResolvedValue(null)
  storage.upload.mockImplementation((input) => storage.memory!.upload(input))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("export degli errori dell'import, controlli", () => {
  it("il token dei cron senza una sessione risponde 401 e non carica niente", async () => {
    const token = jwt.sign({ role: "cronjob" }, SECRET, { expiresIn: "5m" })

    const response = await POST(
      new NextRequest("http://localhost/api/export/importError", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ practicesWithErrors: [], columnsArray: [] }),
      })
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Unauthorized" })
    expect(storage.upload).not.toHaveBeenCalled()
  })
})

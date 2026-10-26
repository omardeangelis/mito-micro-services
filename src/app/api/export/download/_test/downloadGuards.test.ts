// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import jwt from "jsonwebtoken"
import { NextRequest } from "next/server"
import { type Session } from "next-auth"
import { getServerAuthSession } from "@mito/server/auth"
import type { StorageService } from "@mito/server/services/storage/storage"
import { GET, POST } from "../route"

// What download.test.ts cannot see: whether a refused request reaches the
// bucket, and the bytes of a file the storage gives as a view on a larger
// buffer. The bucket is one in-memory store, with `download` spied on
const storage = vi.hoisted(() => ({
  download: vi.fn<[string], ReturnType<StorageService["download"]>>(),
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
      download: (key: string) => storage.download(key),
    }),
  }
})

const SECRET = "test-secret"
const FILE_NAME = "error-import-23-10-2026.xlsx"
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/** Puts an object in the bucket under exactly this key. */
const putInBucket = (key: string) =>
  Effect.runPromise(
    storage.memory!.upload({
      key,
      body: new TextEncoder().encode("dati dei clienti"),
      contentType: XLSX_CONTENT_TYPE,
    })
  )

const signIn = () =>
  vi.mocked(getServerAuthSession).mockResolvedValue({
    user: { id: "user-1" },
    expires: "2099-01-01T00:00:00.000Z",
  } as Session)

const requestFor = (
  method: string,
  name: string,
  headers: Record<string, string> = {}
) =>
  new NextRequest(
    `http://localhost/api/export/download?n=${encodeURIComponent(name)}`,
    { method, headers }
  )

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.stubEnv("CRON_SECRET_KEY", SECRET)
  vi.mocked(getServerAuthSession).mockResolvedValue(null)
  storage.download.mockImplementation((key) => storage.memory!.download(key))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const methods = [
  ["GET", GET],
  ["POST", POST],
] as const satisfies ReadonlyArray<readonly [string, typeof GET]>

describe.each(methods)(
  "download dell'export (%s), controlli",
  (method, handler) => {
    it("senza sessione risponde 401 senza leggere il bucket", async () => {
      await putInBucket(`export/${FILE_NAME}`)

      const response = await handler(requestFor(method, FILE_NAME))

      expect(response.status).toBe(401)
      expect(storage.download).not.toHaveBeenCalled()
    })

    it("il token dei cron senza una sessione risponde 401 senza leggere il bucket", async () => {
      await putInBucket(`export/${FILE_NAME}`)
      const token = jwt.sign({ role: "cronjob" }, SECRET, { expiresIn: "5m" })

      const response = await handler(
        requestFor(method, FILE_NAME, { Authorization: `Bearer ${token}` })
      )

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: "Unauthorized" })
      expect(storage.download).not.toHaveBeenCalled()
    })

    describe("con una sessione", () => {
      beforeEach(() => {
        signIn()
      })

      it.each([
        "export_chiamate_23-10-2026.xlsx",
        "../error-import-23-10-2026.xlsx",
        "error-import-٢٣-10-2026.xlsx",
        "error-import-23-10-2026.xlsx\n",
        "ERROR-IMPORT-23-10-2026.XLSX",
        "error-import-1-1-2026.xlsx",
        "error-import-23-10-2026_xlsx",
      ])(
        "%j risponde 404 senza leggere il bucket, anche se il file c'è",
        async (name) => {
          await putInBucket(`export/${name}`)

          const response = await handler(requestFor(method, name))

          expect(response.status).toBe(404)
          expect(await response.text()).toBe("File not found")
          expect(storage.download).not.toHaveBeenCalled()
        }
      )

      it("un file che lo storage dà come vista su un buffer più grande si scarica con i suoi soli byte", async () => {
        // As a small Buffer.concat of the GCS client: a view on a shared buffer
        const shared = new Uint8Array([
          9, 9, 0x50, 0x4b, 0x03, 0x04, 0xff, 9, 9,
        ])
        storage.download.mockImplementation(() =>
          Effect.succeed(new Uint8Array(shared.buffer, 2, 5))
        )

        const response = await handler(requestFor(method, FILE_NAME))

        expect(response.status).toBe(200)
        expect(
          Array.from(new Uint8Array(await response.arrayBuffer()))
        ).toEqual([0x50, 0x4b, 0x03, 0x04, 0xff])
      })
    })
  }
)

// @vitest-environment node
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { Effect } from "effect"
import { NextRequest } from "next/server"
import { type Session } from "next-auth"
import { getServerAuthSession } from "@mito/server/auth"
import { StorageLive } from "@mito/server/services/storage/layer"
import { Storage } from "@mito/server/services/storage/storage"
import { migrateUpTo, resetDb } from "@/test/db"
import { createOperator } from "@/test/factories"
import { GET, POST } from "../route"

// The bucket is a boundary: one in-memory store shared by every call of this file
vi.mock("@mito/server/services/storage/layer", async () => {
  const { Effect, Layer } = await import("effect")
  // Not the index: it re-exports this module
  const { Storage } = await import("@mito/server/services/storage/storage")
  const { makeMemoryStorageLayer } =
    await import("@mito/server/services/storage/memory")
  // Built once, so an upload is still there for the next call
  const service = Effect.runSync(
    Effect.provide(Storage, makeMemoryStorageLayer())
  )
  return { StorageLive: Layer.succeed(Storage, service) }
})

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/** Puts a file in the export folder of the bucket, as the import does. */
const putInBucket = (name: string, body: Uint8Array) =>
  Effect.runPromise(
    Effect.flatMap(Storage, (storage) =>
      storage.upload({
        key: `export/${name}`,
        body,
        contentType: XLSX_CONTENT_TYPE,
      })
    ).pipe(Effect.provide(StorageLive))
  )

const signInAs = (userId: string) =>
  vi.mocked(getServerAuthSession).mockResolvedValue({
    user: { id: userId },
    expires: "2099-01-01T00:00:00.000Z",
  } as Session)

const signOut = () => vi.mocked(getServerAuthSession).mockResolvedValue(null)

const requestFor = (method: string, name?: string) =>
  new NextRequest(
    name === undefined
      ? "http://localhost/api/export/download"
      : `http://localhost/api/export/download?n=${encodeURIComponent(name)}`,
    { method }
  )

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const methods = [
  ["GET", GET],
  ["POST", POST],
] as const satisfies ReadonlyArray<readonly [string, typeof GET]>

describe.each(methods)("download dell'export (%s)", (method, handler) => {
  const download = (name?: string) => handler(requestFor(method, name))

  it("senza sessione risponde 401", async () => {
    signOut()

    const response = await download("error-import-23-10-2026.xlsx")

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Unauthorized" })
  })

  describe("con la sessione di un operatore attivo", () => {
    beforeEach(async () => {
      signInAs((await createOperator()).userId)
    })

    it.each([
      ["senza nome", undefined],
      ["con il nome vuoto", ""],
    ])("%s risponde 400", async (_label, name) => {
      const response = await download(name)

      expect(response.status).toBe(400)
      expect(await response.text()).toBe("File name not provided")
    })

    it("un file che non è un errore dell'import risponde 404, anche se c'è", async () => {
      await putInBucket(
        "export_chiamate_23-10-2026.xlsx",
        new TextEncoder().encode("note dei clienti")
      )

      const response = await download("export_chiamate_23-10-2026.xlsx")

      expect(response.status).toBe(404)
      expect(await response.text()).toBe("File not found")
    })

    it("un nome che esce dalla cartella export risponde 404", async () => {
      const response = await download("../error-import-23-10-2026.xlsx")

      expect(response.status).toBe(404)
      expect(await response.text()).toBe("File not found")
    })

    it("un nome con un suffisso dopo .xlsx risponde 404, anche se il file c'è", async () => {
      await putInBucket(
        "error-import-23-10-2026.xlsx.old",
        new TextEncoder().encode("vecchio errore")
      )

      const response = await download("error-import-23-10-2026.xlsx.old")

      expect(response.status).toBe(404)
      expect(await response.text()).toBe("File not found")
    })

    it("un errore dell'import che non c'è nel bucket risponde 500", async () => {
      const response = await download("error-import-01-01-2026.xlsx")

      expect(response.status).toBe(500)
      expect(await response.text()).toBe("Error downloading file")
    })

    it("un errore dell'import che c'è si scarica con gli stessi byte, come allegato", async () => {
      // Not text: a download that goes through a string would alter these
      const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x80, 0xff])
      await putInBucket("error-import-23-10-2026.xlsx", bytes)

      const response = await download("error-import-23-10-2026.xlsx")

      expect(response.status).toBe(200)
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
      expect(response.headers.get("Content-Type")).toBe(
        "application/octet-stream"
      )
      expect(response.headers.get("Content-Disposition")).toBe(
        "attachment; filename=error-import-23-10-2026.xlsx"
      )
    })
  })
})

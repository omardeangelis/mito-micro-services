import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { beforeEach, vi } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import type { StorageConfig } from "../config"
import {
  StorageDeleteError,
  StorageDownloadError,
  StorageListError,
  StorageNotFoundError,
  StorageSignError,
  StorageUploadError,
  StorageValidationError,
} from "../errors"
import { gcsStorageLayer } from "../gcs"
import { createStorageClient } from "../promise"
import { Storage, type StorageService } from "../storage"

// Every call the kit makes to @google-cloud/storage lands in these mocks: no network.
const gcs = vi.hoisted(() => ({
  clientOptions: vi.fn(),
  bucket: vi.fn(),
  file: vi.fn(),
  getFiles: vi.fn(),
  save: vi.fn(),
  download: vi.fn(),
  exists: vi.fn(),
  remove: vi.fn(),
  getSignedUrl: vi.fn(),
}))

vi.mock("@google-cloud/storage", () => ({
  Storage: class FakeStorage {
    constructor(options: unknown) {
      gcs.clientOptions(options)
    }
    bucket(name: string) {
      return gcs.bucket(name) as unknown
    }
  },
}))

const config: StorageConfig = {
  bucket: "test-bucket",
  projectId: "test-project",
}

const withStorage = <A, E>(
  use: (storage: StorageService) => Effect.Effect<A, E>
) => Effect.flatMap(Storage, use)

const runOk = <A, E>(
  program: Effect.Effect<A, E, Storage>,
  cfg: StorageConfig = config
) => Effect.provide(program, gcsStorageLayer(cfg))

const runFail = <E>(
  program: Effect.Effect<unknown, E, Storage>,
  cfg: StorageConfig = config
) => Effect.flip(runOk(program, cfg))

beforeEach(() => {
  vi.resetAllMocks()
  gcs.bucket.mockReturnValue({ file: gcs.file, getFiles: gcs.getFiles })
  gcs.file.mockReturnValue({
    save: gcs.save,
    download: gcs.download,
    exists: gcs.exists,
    delete: gcs.remove,
    getSignedUrl: gcs.getSignedUrl,
  })
  gcs.save.mockResolvedValue(undefined)
  gcs.download.mockResolvedValue([Buffer.from("")])
  gcs.exists.mockResolvedValue([true])
  gcs.remove.mockResolvedValue([undefined])
  gcs.getFiles.mockResolvedValue([[]])
  gcs.getSignedUrl.mockResolvedValue(["https://signed.example/url"])
})

describe("client creation", () => {
  it.effect("creates the GCS client only when the layer is built", () =>
    Effect.gen(function* () {
      const layer = gcsStorageLayer(config)
      expect(gcs.clientOptions).not.toHaveBeenCalled()

      yield* Effect.provide(
        withStorage((s) => s.exists("a.txt")),
        layer
      )
      expect(gcs.clientOptions).toHaveBeenCalledTimes(1)
    })
  )

  it.effect(
    "passes the project and service-account credentials to the client",
    () =>
      Effect.gen(function* () {
        const credentials = {
          client_email: "sa@p.iam.gserviceaccount.com",
          private_key: "KEY",
        }
        yield* runOk(
          withStorage((s) => s.exists("a.txt")),
          { bucket: "b", projectId: "p", credentials }
        )
        expect(gcs.clientOptions).toHaveBeenCalledWith({
          projectId: "p",
          credentials,
        })
      })
  )

  it.effect(
    "uses Application Default Credentials when no credentials are given",
    () =>
      Effect.gen(function* () {
        yield* runOk(
          withStorage((s) => s.exists("a.txt")),
          { bucket: "b" }
        )
        expect(gcs.clientOptions).toHaveBeenCalledWith({})
      })
  )
})

describe("upload", () => {
  it.effect(
    "saves the body with content type, cache control and custom metadata",
    () =>
      Effect.gen(function* () {
        const result = yield* runOk(
          withStorage((s) =>
            s.upload({
              key: "avatars/a.txt",
              body: "hello",
              contentType: "text/plain",
              cacheControl: "public, max-age=60",
              metadata: { owner: "u1" },
            })
          )
        )

        expect(result).toEqual({ key: "avatars/a.txt" })
        expect(gcs.bucket).toHaveBeenCalledWith("test-bucket")
        expect(gcs.file).toHaveBeenCalledWith("avatars/a.txt")
        expect(gcs.save).toHaveBeenCalledWith(Buffer.from("hello"), {
          metadata: {
            contentType: "text/plain",
            cacheControl: "public, max-age=60",
            metadata: { owner: "u1" },
          },
        })
      })
  )

  it.effect("maps a failed save to StorageUploadError carrying the key", () =>
    Effect.gen(function* () {
      gcs.save.mockRejectedValue(new Error("network down"))
      const error = yield* runFail(
        withStorage((s) =>
          s.upload({ key: "a.pdf", body: "x", contentType: "application/pdf" })
        )
      )

      expect(error).toBeInstanceOf(StorageUploadError)
      expect(error.key).toBe("a.pdf")
    })
  )

  it.effect("rejects a body over maxUploadBytes before calling GCS", () =>
    Effect.gen(function* () {
      const error = yield* runFail(
        withStorage((s) =>
          s.upload({
            key: "a.bin",
            body: new Uint8Array(5),
            contentType: "application/octet-stream",
          })
        ),
        { bucket: "b", maxUploadBytes: 4 }
      )

      expect(error).toBeInstanceOf(StorageValidationError)
      expect(gcs.save).not.toHaveBeenCalled()
    })
  )
})

describe("download", () => {
  it.effect("returns the object bytes", () =>
    Effect.gen(function* () {
      gcs.download.mockResolvedValue([Buffer.from("%PDF-1.4")])
      const data = yield* runOk(withStorage((s) => s.download("resume/a.pdf")))

      expect(Buffer.from(data).toString()).toBe("%PDF-1.4")
      expect(gcs.file).toHaveBeenCalledWith("resume/a.pdf")
    })
  )

  it.effect("maps a 404 from GCS to StorageNotFoundError", () =>
    Effect.gen(function* () {
      gcs.download.mockRejectedValue(
        Object.assign(new Error("No such object"), { code: 404 })
      )
      const error = yield* runFail(
        withStorage((s) => s.download("missing.pdf"))
      )

      expect(error).toBeInstanceOf(StorageNotFoundError)
      expect(error.key).toBe("missing.pdf")
    })
  )

  it.effect("maps any other failure to StorageDownloadError", () =>
    Effect.gen(function* () {
      gcs.download.mockRejectedValue(
        Object.assign(new Error("server error"), { code: 500 })
      )
      const error = yield* runFail(withStorage((s) => s.download("a.pdf")))

      expect(error).toBeInstanceOf(StorageDownloadError)
    })
  )
})

describe("exists", () => {
  it.effect("returns the flag reported by GCS", () =>
    Effect.gen(function* () {
      gcs.exists.mockResolvedValueOnce([false])
      expect(yield* runOk(withStorage((s) => s.exists("a.txt")))).toBe(false)
    })
  )
})

describe("remove", () => {
  it.effect(
    "deletes with ignoreNotFound, so a missing object is not an error",
    () =>
      Effect.gen(function* () {
        yield* runOk(withStorage((s) => s.remove("a.pdf")))
        expect(gcs.remove).toHaveBeenCalledWith({ ignoreNotFound: true })
      })
  )

  it.effect("maps a failed delete to StorageDeleteError", () =>
    Effect.gen(function* () {
      gcs.remove.mockRejectedValue(new Error("denied"))
      const error = yield* runFail(withStorage((s) => s.remove("a.pdf")))

      expect(error).toBeInstanceOf(StorageDeleteError)
    })
  )
})

describe("removeByPrefix", () => {
  it.effect.each(["", "/", "   "])(
    "refuses the prefix %j without listing or deleting",
    (prefix) =>
      Effect.gen(function* () {
        const error = yield* runFail(
          withStorage((s) => s.removeByPrefix(prefix))
        )

        expect(error).toBeInstanceOf(StorageValidationError)
        expect(gcs.getFiles).not.toHaveBeenCalled()
      })
  )

  it.effect("deletes every listed object and returns the count", () =>
    Effect.gen(function* () {
      const a = {
        name: "tmp/a",
        delete: vi.fn().mockResolvedValue([undefined]),
      }
      const b = {
        name: "tmp/b",
        delete: vi.fn().mockResolvedValue([undefined]),
      }
      gcs.getFiles.mockResolvedValue([[a, b]])

      const deleted = yield* runOk(withStorage((s) => s.removeByPrefix("tmp/")))

      expect(deleted).toBe(2)
      expect(gcs.getFiles).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: "tmp/" })
      )
      expect(a.delete).toHaveBeenCalledWith({ ignoreNotFound: true })
      expect(b.delete).toHaveBeenCalledWith({ ignoreNotFound: true })
    })
  )

  it.effect(
    "maps a failed delete to StorageDeleteError carrying the object key",
    () =>
      Effect.gen(function* () {
        const a = {
          name: "tmp/a",
          delete: vi.fn().mockRejectedValue(new Error("denied")),
        }
        gcs.getFiles.mockResolvedValue([[a]])
        const error = yield* runFail(
          withStorage((s) => s.removeByPrefix("tmp/"))
        )

        expect(error).toBeInstanceOf(StorageDeleteError)
        expect(error.key).toBe("tmp/a")
      })
  )

  it.effect("maps a failed listing to StorageListError", () =>
    Effect.gen(function* () {
      gcs.getFiles.mockRejectedValue(new Error("unavailable"))
      const error = yield* runFail(withStorage((s) => s.removeByPrefix("tmp/")))

      expect(error).toBeInstanceOf(StorageListError)
    })
  )
})

describe("list", () => {
  it.effect(
    "maps objects to key, size and updated, and passes prefix and limit to GCS",
    () =>
      Effect.gen(function* () {
        gcs.getFiles.mockResolvedValue([
          [
            {
              name: "docs/a.txt",
              metadata: { size: "12", updated: "2026-01-02T03:04:05.000Z" },
            },
          ],
        ])

        const listed = yield* runOk(
          withStorage((s) => s.list("docs/", { limit: 5 }))
        )

        expect(listed).toEqual([
          {
            key: "docs/a.txt",
            size: 12,
            updated: new Date("2026-01-02T03:04:05.000Z"),
          },
        ])
        expect(gcs.getFiles).toHaveBeenCalledWith({
          prefix: "docs/",
          autoPaginate: true,
          maxResults: 5,
        })
      })
  )

  it.effect("never returns more objects than the limit", () =>
    Effect.gen(function* () {
      const page = [{ name: "a" }, { name: "b" }, { name: "c" }].map(
        (file) => ({
          ...file,
          metadata: { size: 1, updated: "2026-01-01T00:00:00.000Z" },
        })
      )
      gcs.getFiles.mockResolvedValue([page])

      const listed = yield* runOk(withStorage((s) => s.list("", { limit: 2 })))
      expect(listed.map((object) => object.key)).toEqual(["a", "b"])
    })
  )

  it.effect("maps a failed listing to StorageListError", () =>
    Effect.gen(function* () {
      gcs.getFiles.mockRejectedValue(new Error("unavailable"))
      const error = yield* runFail(withStorage((s) => s.list("docs/")))

      expect(error).toBeInstanceOf(StorageListError)
    })
  )
})

describe("signed URLs", () => {
  // 2026-01-01T00:00:00Z, the time each test sets on the TestClock.
  const NOW_MS = 1767225600000

  it.effect(
    "signs a V4 read URL that expires after 15 minutes by default",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW_MS)
        const url = yield* runOk(
          withStorage((s) => s.signedDownloadUrl("resume/a.pdf"))
        )

        expect(url).toBe("https://signed.example/url")
        expect(gcs.getSignedUrl).toHaveBeenCalledWith({
          version: "v4",
          action: "read",
          expires: NOW_MS + 900_000,
        })
      })
  )

  it.effect("sets an attachment disposition with the filename", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW_MS)
      yield* runOk(
        withStorage((s) =>
          s.signedDownloadUrl("resume/a.pdf", {
            filename: "Mario Rossi CV.pdf",
          })
        )
      )

      expect(gcs.getSignedUrl).toHaveBeenCalledWith({
        version: "v4",
        action: "read",
        expires: NOW_MS + 900_000,
        responseDisposition: 'attachment; filename="Mario Rossi CV.pdf"',
      })
    })
  )

  it.effect("removes quotes and line breaks from the filename", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW_MS)
      yield* runOk(
        withStorage((s) =>
          s.signedDownloadUrl("resume/a.pdf", { filename: 'ev"il\r\nname.pdf' })
        )
      )

      expect(gcs.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          responseDisposition: 'attachment; filename="evilname.pdf"',
        })
      )
    })
  )

  it.effect("omits the disposition when no filename is given", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW_MS)
      yield* runOk(withStorage((s) => s.signedDownloadUrl("resume/a.pdf")))

      const options = (
        gcs.getSignedUrl.mock.calls[0] as unknown[] | undefined
      )?.[0] as Record<string, unknown>
      expect(options).not.toHaveProperty("responseDisposition")
    })
  )

  it.effect("honours expiresInSeconds", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW_MS)
      yield* runOk(
        withStorage((s) =>
          s.signedDownloadUrl("resume/a.pdf", { expiresInSeconds: 60 })
        )
      )

      expect(gcs.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({ expires: NOW_MS + 60_000 })
      )
    })
  )

  it.effect("signs a V4 write URL bound to the content type", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW_MS)
      yield* runOk(
        withStorage((s) =>
          s.signedUploadUrl("resume/a.pdf", { contentType: "application/pdf" })
        )
      )

      expect(gcs.getSignedUrl).toHaveBeenCalledWith({
        version: "v4",
        action: "write",
        expires: NOW_MS + 900_000,
        contentType: "application/pdf",
      })
    })
  )

  it.effect("maps a signing failure to StorageSignError", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW_MS)
      gcs.getSignedUrl.mockRejectedValue(
        new Error("Max allowed expiration is seven days")
      )
      const error = yield* runFail(
        withStorage((s) =>
          s.signedUploadUrl("a.pdf", { contentType: "application/pdf" })
        )
      )

      expect(error).toBeInstanceOf(StorageSignError)
    })
  )
})

describe("Promise facade", () => {
  it("does not create the GCS client until the first call", async () => {
    const client = createStorageClient(config)
    expect(gcs.clientOptions).not.toHaveBeenCalled()
    await client.dispose()
  })

  it("resolves with the same values as the Effect API", async () => {
    gcs.exists.mockResolvedValueOnce([true])
    const client = createStorageClient(config)
    try {
      expect(await client.exists("a.txt")).toBe(true)
      expect(
        await client.upload({
          key: "a.txt",
          body: "x",
          contentType: "text/plain",
        })
      ).toEqual({
        key: "a.txt",
      })
    } finally {
      await client.dispose()
    }
  })

  it("rejects with the same tagged errors the Effect API fails with", async () => {
    gcs.download.mockRejectedValue(
      Object.assign(new Error("No such object"), { code: 404 })
    )
    const client = createStorageClient(config)
    try {
      const notFound = await client
        .download("missing.pdf")
        .catch((error: unknown) => error)
      expect(notFound).toBeInstanceOf(StorageNotFoundError)
      expect(notFound).toHaveProperty("_tag", "StorageNotFoundError")

      const refused = await client
        .removeByPrefix("/")
        .catch((error: unknown) => error)
      expect(refused).toBeInstanceOf(StorageValidationError)
    } finally {
      await client.dispose()
    }
  })

  it("rejects with the thrown error itself when the GCS client dies", async () => {
    const boom = new Error("bucket exploded")
    gcs.bucket.mockImplementation(() => {
      throw boom
    })
    const client = createStorageClient(config)
    try {
      const rejected = await client.exists("a.txt").catch((e: unknown) => e)
      expect(rejected).toBe(boom)
    } finally {
      await client.dispose()
    }
  })
})

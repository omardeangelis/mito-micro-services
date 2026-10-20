import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
import { makeGcsStorageLayer } from "../gcs"
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
) => Effect.runPromise(Effect.provide(program, makeGcsStorageLayer(cfg)))

const runFail = <E>(
  program: Effect.Effect<unknown, E, Storage>,
  cfg: StorageConfig = config
) =>
  Effect.runPromise(
    Effect.flip(Effect.provide(program, makeGcsStorageLayer(cfg)))
  )

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
  it("creates the GCS client only when the layer is built", async () => {
    const layer = makeGcsStorageLayer(config)
    expect(gcs.clientOptions).not.toHaveBeenCalled()

    await Effect.runPromise(
      Effect.provide(
        withStorage((s) => s.exists("a.txt")),
        layer
      )
    )
    expect(gcs.clientOptions).toHaveBeenCalledTimes(1)
  })

  it("passes the project and service-account credentials to the client", async () => {
    const credentials = {
      client_email: "sa@p.iam.gserviceaccount.com",
      private_key: "KEY",
    }
    await runOk(
      withStorage((s) => s.exists("a.txt")),
      { bucket: "b", projectId: "p", credentials }
    )
    expect(gcs.clientOptions).toHaveBeenCalledWith({
      projectId: "p",
      credentials,
    })
  })

  it("uses Application Default Credentials when no credentials are given", async () => {
    await runOk(
      withStorage((s) => s.exists("a.txt")),
      { bucket: "b" }
    )
    expect(gcs.clientOptions).toHaveBeenCalledWith({})
  })
})

describe("upload", () => {
  it("saves the body with content type, cache control and custom metadata", async () => {
    const result = await runOk(
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

  it("maps a failed save to StorageUploadError carrying the key", async () => {
    gcs.save.mockRejectedValue(new Error("network down"))
    const error = await runFail(
      withStorage((s) =>
        s.upload({ key: "a.pdf", body: "x", contentType: "application/pdf" })
      )
    )

    expect(error).toBeInstanceOf(StorageUploadError)
    expect(error.key).toBe("a.pdf")
  })

  it("rejects a body over maxUploadBytes before calling GCS", async () => {
    const error = await runFail(
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
})

describe("download", () => {
  it("returns the object bytes", async () => {
    gcs.download.mockResolvedValue([Buffer.from("%PDF-1.4")])
    const data = await runOk(withStorage((s) => s.download("resume/a.pdf")))

    expect(Buffer.from(data).toString()).toBe("%PDF-1.4")
    expect(gcs.file).toHaveBeenCalledWith("resume/a.pdf")
  })

  it("maps a 404 from GCS to StorageNotFoundError", async () => {
    gcs.download.mockRejectedValue(
      Object.assign(new Error("No such object"), { code: 404 })
    )
    const error = await runFail(withStorage((s) => s.download("missing.pdf")))

    expect(error).toBeInstanceOf(StorageNotFoundError)
    expect(error.key).toBe("missing.pdf")
  })

  it("maps any other failure to StorageDownloadError", async () => {
    gcs.download.mockRejectedValue(
      Object.assign(new Error("server error"), { code: 500 })
    )
    const error = await runFail(withStorage((s) => s.download("a.pdf")))

    expect(error).toBeInstanceOf(StorageDownloadError)
  })
})

describe("exists", () => {
  it("returns the flag reported by GCS", async () => {
    gcs.exists.mockResolvedValueOnce([false])
    expect(await runOk(withStorage((s) => s.exists("a.txt")))).toBe(false)
  })
})

describe("remove", () => {
  it("deletes with ignoreNotFound, so a missing object is not an error", async () => {
    await runOk(withStorage((s) => s.remove("a.pdf")))
    expect(gcs.remove).toHaveBeenCalledWith({ ignoreNotFound: true })
  })

  it("maps a failed delete to StorageDeleteError", async () => {
    gcs.remove.mockRejectedValue(new Error("denied"))
    const error = await runFail(withStorage((s) => s.remove("a.pdf")))

    expect(error).toBeInstanceOf(StorageDeleteError)
  })
})

describe("removeByPrefix", () => {
  it.each(["", "/", "   "])(
    "refuses the prefix %j without listing or deleting",
    async (prefix) => {
      const error = await runFail(withStorage((s) => s.removeByPrefix(prefix)))

      expect(error).toBeInstanceOf(StorageValidationError)
      expect(gcs.getFiles).not.toHaveBeenCalled()
    }
  )

  it("deletes every listed object and returns the count", async () => {
    const a = { name: "tmp/a", delete: vi.fn().mockResolvedValue([undefined]) }
    const b = { name: "tmp/b", delete: vi.fn().mockResolvedValue([undefined]) }
    gcs.getFiles.mockResolvedValue([[a, b]])

    const deleted = await runOk(withStorage((s) => s.removeByPrefix("tmp/")))

    expect(deleted).toBe(2)
    expect(gcs.getFiles).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "tmp/" })
    )
    expect(a.delete).toHaveBeenCalledWith({ ignoreNotFound: true })
    expect(b.delete).toHaveBeenCalledWith({ ignoreNotFound: true })
  })

  it("maps a failed delete to StorageDeleteError carrying the object key", async () => {
    const a = {
      name: "tmp/a",
      delete: vi.fn().mockRejectedValue(new Error("denied")),
    }
    gcs.getFiles.mockResolvedValue([[a]])
    const error = await runFail(withStorage((s) => s.removeByPrefix("tmp/")))

    expect(error).toBeInstanceOf(StorageDeleteError)
    expect(error.key).toBe("tmp/a")
  })

  it("maps a failed listing to StorageListError", async () => {
    gcs.getFiles.mockRejectedValue(new Error("unavailable"))
    const error = await runFail(withStorage((s) => s.removeByPrefix("tmp/")))

    expect(error).toBeInstanceOf(StorageListError)
  })
})

describe("list", () => {
  it("maps objects to key, size and updated, and passes prefix and limit to GCS", async () => {
    gcs.getFiles.mockResolvedValue([
      [
        {
          name: "docs/a.txt",
          metadata: { size: "12", updated: "2026-01-02T03:04:05.000Z" },
        },
      ],
    ])

    const listed = await runOk(
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

  it("never returns more objects than the limit", async () => {
    const page = [{ name: "a" }, { name: "b" }, { name: "c" }].map((file) => ({
      ...file,
      metadata: { size: 1, updated: "2026-01-01T00:00:00.000Z" },
    }))
    gcs.getFiles.mockResolvedValue([page])

    const listed = await runOk(withStorage((s) => s.list("", { limit: 2 })))
    expect(listed.map((object) => object.key)).toEqual(["a", "b"])
  })

  it("maps a failed listing to StorageListError", async () => {
    gcs.getFiles.mockRejectedValue(new Error("unavailable"))
    const error = await runFail(withStorage((s) => s.list("docs/")))

    expect(error).toBeInstanceOf(StorageListError)
  })
})

describe("signed URLs", () => {
  // 2026-01-01T00:00:00Z. Only Date is faked, so Effect's clock reads this time.
  const NOW_MS = 1767225600000

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW_MS)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("signs a V4 read URL that expires after 15 minutes by default", async () => {
    const url = await runOk(
      withStorage((s) => s.signedDownloadUrl("resume/a.pdf"))
    )

    expect(url).toBe("https://signed.example/url")
    expect(gcs.getSignedUrl).toHaveBeenCalledWith({
      version: "v4",
      action: "read",
      expires: NOW_MS + 900_000,
    })
  })

  it("sets an attachment disposition with the filename", async () => {
    await runOk(
      withStorage((s) =>
        s.signedDownloadUrl("resume/a.pdf", { filename: "Mario Rossi CV.pdf" })
      )
    )

    expect(gcs.getSignedUrl).toHaveBeenCalledWith({
      version: "v4",
      action: "read",
      expires: NOW_MS + 900_000,
      responseDisposition: 'attachment; filename="Mario Rossi CV.pdf"',
    })
  })

  it("removes quotes and line breaks from the filename", async () => {
    await runOk(
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

  it("omits the disposition when no filename is given", async () => {
    await runOk(withStorage((s) => s.signedDownloadUrl("resume/a.pdf")))

    const options = (
      gcs.getSignedUrl.mock.calls[0] as unknown[] | undefined
    )?.[0] as Record<string, unknown>
    expect(options).not.toHaveProperty("responseDisposition")
  })

  it("honours expiresInSeconds", async () => {
    await runOk(
      withStorage((s) =>
        s.signedDownloadUrl("resume/a.pdf", { expiresInSeconds: 60 })
      )
    )

    expect(gcs.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ expires: NOW_MS + 60_000 })
    )
  })

  it("signs a V4 write URL bound to the content type", async () => {
    await runOk(
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

  it("maps a signing failure to StorageSignError", async () => {
    gcs.getSignedUrl.mockRejectedValue(
      new Error("Max allowed expiration is seven days")
    )
    const error = await runFail(
      withStorage((s) =>
        s.signedUploadUrl("a.pdf", { contentType: "application/pdf" })
      )
    )

    expect(error).toBeInstanceOf(StorageSignError)
  })
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
})

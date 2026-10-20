import type { SupabaseClient } from "@supabase/supabase-js"
// jsdom's Blob has no arrayBuffer(); Node's Blob is what the Supabase client returns
import { Blob } from "node:buffer"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { StorageLive } from "../layer"
import {
  makeSupabaseStorageLayer,
  type SupabaseStorageOptions,
} from "../supabase"
import { Storage, type StorageService } from "../storage"

// Every call the layer makes to Supabase lands in these mocks: no network.
const supabase = vi.hoisted(() => ({ createClient: vi.fn() }))
const gcs = vi.hoisted(() => ({ clientOptions: vi.fn() }))

vi.mock("@supabase/supabase-js", () => ({
  createClient: supabase.createClient,
}))

vi.mock("@google-cloud/storage", () => ({
  Storage: class FakeStorage {
    constructor(options: unknown) {
      gcs.clientOptions(options)
    }
    bucket() {
      return {}
    }
  },
}))

const bucket = {
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  createSignedUrl: vi.fn(),
  createSignedUploadUrl: vi.fn(),
}
const from = vi.fn()
const fakeClient = { storage: { from } }

const layerFor = (extra: Partial<SupabaseStorageOptions> = {}) =>
  makeSupabaseStorageLayer({
    client: () => fakeClient as unknown as SupabaseClient,
    bucket: "mito-storage",
    ...extra,
  })

const withStorage = <A, E>(
  use: (storage: StorageService) => Effect.Effect<A, E>
) => Effect.flatMap(Storage, use)

const run = <A, E>(
  program: Effect.Effect<A, E, Storage>,
  extra?: Partial<SupabaseStorageOptions>
) => Effect.runPromise(Effect.provide(program, layerFor(extra)))

const fail = <A, E>(
  program: Effect.Effect<A, E, Storage>,
  extra?: Partial<SupabaseStorageOptions>
) => Effect.runPromise(Effect.flip(Effect.provide(program, layerFor(extra))))

beforeEach(() => {
  vi.resetAllMocks()
  from.mockReturnValue(bucket)
  supabase.createClient.mockReturnValue(fakeClient)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("makeSupabaseStorageLayer", () => {
  it("opens the configured bucket", async () => {
    bucket.list.mockResolvedValue({ data: [], error: null })

    await run(withStorage((storage) => storage.exists("a.xlsx")))

    expect(from).toHaveBeenCalledWith("mito-storage")
  })

  describe("upload", () => {
    it("uploads with upsert and returns the key", async () => {
      bucket.upload.mockResolvedValue({
        data: { path: "export/a.csv" },
        error: null,
      })

      const result = await run(
        withStorage((storage) =>
          storage.upload({
            key: "export/a.csv",
            body: "ciao",
            contentType: "text/csv",
          })
        )
      )

      expect(bucket.upload).toHaveBeenCalledWith("export/a.csv", "ciao", {
        contentType: "text/csv",
        upsert: true,
      })
      expect(result).toEqual({ key: "export/a.csv" })
    })

    it("fails with StorageUploadError when Supabase answers an error", async () => {
      bucket.upload.mockResolvedValue({
        data: null,
        error: { message: "boom", status: 500 },
      })

      const error = await fail(
        withStorage((storage) =>
          storage.upload({
            key: "export/a.csv",
            body: "ciao",
            contentType: "text/csv",
          })
        )
      )

      expect(error._tag).toBe("StorageUploadError")
    })

    it("rejects a body over maxUploadBytes without calling Supabase", async () => {
      const error = await fail(
        withStorage((storage) =>
          storage.upload({
            key: "export/a.csv",
            body: "abcd",
            contentType: "text/csv",
          })
        ),
        { maxUploadBytes: 3 }
      )

      expect(error._tag).toBe("StorageValidationError")
      expect(bucket.upload).not.toHaveBeenCalled()
    })
  })

  describe("download", () => {
    it("returns the object bytes", async () => {
      bucket.download.mockResolvedValue({
        data: new Blob(["ciao"]),
        error: null,
      })

      const bytes = await run(
        withStorage((storage) => storage.download("a.txt"))
      )

      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(bytes).toEqual(new Uint8Array([99, 105, 97, 111]))
    })

    it("fails with StorageNotFoundError for Supabase's 'Object not found'", async () => {
      bucket.download.mockResolvedValue({
        data: null,
        error: { message: "Object not found", status: 400 },
      })

      const error = await fail(
        withStorage((storage) => storage.download("a.txt"))
      )

      expect(error._tag).toBe("StorageNotFoundError")
      expect(error.key).toBe("a.txt")
    })

    it("fails with StorageDownloadError for other Supabase errors", async () => {
      bucket.download.mockResolvedValue({
        data: null,
        error: { message: "boom", status: 500 },
      })

      const error = await fail(
        withStorage((storage) => storage.download("a.txt"))
      )

      expect(error._tag).toBe("StorageDownloadError")
    })
  })

  describe("list", () => {
    it("lists one folder with the limit and maps keys to the full path", async () => {
      bucket.list.mockResolvedValue({ data: [{ name: "a.xlsx" }], error: null })

      const objects = await run(
        withStorage((storage) => storage.list("export/", { limit: 1000 }))
      )

      expect(bucket.list).toHaveBeenCalledWith("export", { limit: 1000 })
      expect(objects.map((object) => object.key)).toEqual(["export/a.xlsx"])
    })

    it("returns an empty array when Supabase answers no data and no error", async () => {
      bucket.list.mockResolvedValue({ data: null, error: null })

      const objects = await run(
        withStorage((storage) => storage.list("export/"))
      )

      expect(objects).toEqual([])
    })

    it("fails with StorageListError keeping the Supabase error as cause", async () => {
      const supabaseError = { message: "boom", status: 500 }
      bucket.list.mockResolvedValue({ data: null, error: supabaseError })

      const error = await fail(
        withStorage((storage) => storage.list("export/"))
      )

      expect(error._tag).toBe("StorageListError")
      expect(error.cause).toBe(supabaseError)
    })

    it("uses the name after the last slash as search and keeps only names starting with it", async () => {
      bucket.list.mockResolvedValue({
        data: [{ name: "a1" }, { name: "ba" }],
        error: null,
      })

      const objects = await run(
        withStorage((storage) => storage.list("export/a"))
      )

      expect(bucket.list).toHaveBeenCalledWith("export", { search: "a" })
      expect(objects.map((object) => object.key)).toEqual(["export/a1"])
    })
  })

  describe("exists", () => {
    it("is true when the folder lists the exact key", async () => {
      bucket.list.mockResolvedValue({ data: [{ name: "a.xlsx" }], error: null })

      const exists = await run(
        withStorage((storage) => storage.exists("export/a.xlsx"))
      )

      expect(exists).toBe(true)
    })

    it("is false when the folder only lists other names", async () => {
      bucket.list.mockResolvedValue({
        data: [{ name: "a.xlsx.bak" }],
        error: null,
      })

      const exists = await run(
        withStorage((storage) => storage.exists("export/a.xlsx"))
      )

      expect(exists).toBe(false)
    })
  })

  describe("remove", () => {
    it("removes the key as a one-element array", async () => {
      bucket.remove.mockResolvedValue({ data: [], error: null })

      await run(withStorage((storage) => storage.remove("export/a.xlsx")))

      expect(bucket.remove).toHaveBeenCalledWith(["export/a.xlsx"])
    })

    it("fails with StorageDeleteError when Supabase answers an error", async () => {
      bucket.remove.mockResolvedValue({
        data: null,
        error: { message: "boom", status: 500 },
      })

      const error = await fail(
        withStorage((storage) => storage.remove("export/a.xlsx"))
      )

      expect(error._tag).toBe("StorageDeleteError")
    })
  })

  describe("removeByPrefix", () => {
    it("refuses an empty prefix without listing or removing", async () => {
      const error = await fail(
        withStorage((storage) => storage.removeByPrefix(""))
      )

      expect(error._tag).toBe("StorageValidationError")
      expect(bucket.list).not.toHaveBeenCalled()
      expect(bucket.remove).not.toHaveBeenCalled()
    })

    it("removes the listed keys in one call and returns how many", async () => {
      bucket.list.mockResolvedValue({
        data: [{ name: "a" }, { name: "b" }],
        error: null,
      })
      bucket.remove.mockResolvedValue({ data: [], error: null })

      const removed = await run(
        withStorage((storage) => storage.removeByPrefix("export/"))
      )

      expect(removed).toBe(2)
      expect(bucket.remove).toHaveBeenCalledTimes(1)
      expect(bucket.remove).toHaveBeenCalledWith(["export/a", "export/b"])
    })

    it("returns 0 and removes nothing when the folder is empty", async () => {
      bucket.list.mockResolvedValue({ data: [], error: null })

      const removed = await run(
        withStorage((storage) => storage.removeByPrefix("export/"))
      )

      expect(removed).toBe(0)
      expect(bucket.remove).not.toHaveBeenCalled()
    })
  })

  describe("signedDownloadUrl", () => {
    it("signs with the expiry and the download filename", async () => {
      bucket.createSignedUrl.mockResolvedValue({
        data: { signedUrl: "https://signed.example/k" },
        error: null,
      })

      const url = await run(
        withStorage((storage) =>
          storage.signedDownloadUrl("k", {
            filename: "f.xlsx",
            expiresInSeconds: 60,
          })
        )
      )

      expect(bucket.createSignedUrl).toHaveBeenCalledWith("k", 60, {
        download: "f.xlsx",
      })
      expect(url).toBe("https://signed.example/k")
    })

    it("uses the default 900 seconds and no options when none are given", async () => {
      bucket.createSignedUrl.mockResolvedValue({
        data: { signedUrl: "https://signed.example/k" },
        error: null,
      })

      await run(withStorage((storage) => storage.signedDownloadUrl("k")))

      expect(bucket.createSignedUrl).toHaveBeenCalledWith("k", 900, undefined)
    })

    it("fails with StorageSignError when Supabase answers an error", async () => {
      bucket.createSignedUrl.mockResolvedValue({
        data: null,
        error: { message: "boom", status: 500 },
      })

      const error = await fail(
        withStorage((storage) => storage.signedDownloadUrl("k"))
      )

      expect(error._tag).toBe("StorageSignError")
    })
  })

  describe("signedUploadUrl", () => {
    it("signs with upsert and returns the URL", async () => {
      bucket.createSignedUploadUrl.mockResolvedValue({
        data: { signedUrl: "https://signed.example/upload" },
        error: null,
      })

      const url = await run(
        withStorage((storage) =>
          storage.signedUploadUrl("k", { contentType: "text/csv" })
        )
      )

      expect(bucket.createSignedUploadUrl).toHaveBeenCalledWith("k", {
        upsert: true,
      })
      expect(url).toBe("https://signed.example/upload")
    })

    it("fails with StorageSignError when Supabase answers an error", async () => {
      bucket.createSignedUploadUrl.mockResolvedValue({
        data: null,
        error: { message: "boom", status: 500 },
      })

      const error = await fail(
        withStorage((storage) =>
          storage.signedUploadUrl("k", { contentType: "text/csv" })
        )
      )

      expect(error._tag).toBe("StorageSignError")
    })
  })
})

describe("StorageLive", () => {
  it("uses GCS and not Supabase when GCS_BUCKET is set", async () => {
    vi.stubEnv("GCS_BUCKET", "b")

    await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(Storage, () => Effect.void),
        StorageLive
      )
    )

    expect(gcs.clientOptions).toHaveBeenCalledTimes(1)
    expect(supabase.createClient).not.toHaveBeenCalled()
  })

  it("uses the Supabase bucket with the environment values when GCS_BUCKET is empty", async () => {
    vi.stubEnv("GCS_BUCKET", "")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co")
    vi.stubEnv("SUPABASE_KEY", "service-key")
    bucket.list.mockResolvedValue({ data: [{ name: "a.xlsx" }], error: null })

    const objects = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(Storage, (storage) => storage.list("export/")),
        StorageLive
      )
    )

    expect(supabase.createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "service-key"
    )
    expect(from).toHaveBeenCalledWith("mito-storage")
    expect(objects.map((object) => object.key)).toEqual(["export/a.xlsx"])
    expect(gcs.clientOptions).not.toHaveBeenCalled()
  })
})

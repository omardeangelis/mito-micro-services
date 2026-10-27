import type { SupabaseClient } from "@supabase/supabase-js"
// jsdom's Blob has no arrayBuffer(); Node's Blob is what the Supabase client returns
import { Blob } from "node:buffer"
import { Effect } from "effect"
import { afterEach, beforeEach, vi } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { storageLayer } from "../layer"
import { supabaseStorageLayer, type SupabaseStorageOptions } from "../supabase"
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
  supabaseStorageLayer({
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
) => Effect.provide(program, layerFor(extra))

const fail = <A, E>(
  program: Effect.Effect<A, E, Storage>,
  extra?: Partial<SupabaseStorageOptions>
) => Effect.flip(Effect.provide(program, layerFor(extra)))

beforeEach(() => {
  vi.resetAllMocks()
  from.mockReturnValue(bucket)
  supabase.createClient.mockReturnValue(fakeClient)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("makeSupabaseStorageLayer", () => {
  it.effect("opens the configured bucket", () =>
    Effect.gen(function* () {
      bucket.list.mockResolvedValue({ data: [], error: null })

      yield* run(withStorage((storage) => storage.exists("a.xlsx")))

      expect(from).toHaveBeenCalledWith("mito-storage")
    })
  )

  describe("upload", () => {
    it.effect("uploads with upsert and returns the key", () =>
      Effect.gen(function* () {
        bucket.upload.mockResolvedValue({
          data: { path: "export/a.csv" },
          error: null,
        })

        const result = yield* run(
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
    )

    it.effect(
      "fails with StorageUploadError when Supabase answers an error",
      () =>
        Effect.gen(function* () {
          bucket.upload.mockResolvedValue({
            data: null,
            error: { message: "boom", status: 500 },
          })

          const error = yield* fail(
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
    )

    it.effect(
      "rejects a body over maxUploadBytes without calling Supabase",
      () =>
        Effect.gen(function* () {
          const error = yield* fail(
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
    )
  })

  describe("download", () => {
    it.effect("returns the object bytes", () =>
      Effect.gen(function* () {
        bucket.download.mockResolvedValue({
          data: new Blob(["ciao"]),
          error: null,
        })

        const bytes = yield* run(
          withStorage((storage) => storage.download("a.txt"))
        )

        expect(bytes).toBeInstanceOf(Uint8Array)
        expect(bytes).toEqual(new Uint8Array([99, 105, 97, 111]))
      })
    )

    it.effect(
      "fails with StorageNotFoundError for Supabase's 'Object not found'",
      () =>
        Effect.gen(function* () {
          bucket.download.mockResolvedValue({
            data: null,
            error: { message: "Object not found", status: 400 },
          })

          const error = yield* fail(
            withStorage((storage) => storage.download("a.txt"))
          )

          expect(error._tag).toBe("StorageNotFoundError")
          expect(error.key).toBe("a.txt")
        })
    )

    it.effect("fails with StorageDownloadError for other Supabase errors", () =>
      Effect.gen(function* () {
        bucket.download.mockResolvedValue({
          data: null,
          error: { message: "boom", status: 500 },
        })

        const error = yield* fail(
          withStorage((storage) => storage.download("a.txt"))
        )

        expect(error._tag).toBe("StorageDownloadError")
      })
    )
  })

  describe("list", () => {
    it.effect(
      "lists one folder with the limit and maps keys to the full path",
      () =>
        Effect.gen(function* () {
          bucket.list.mockResolvedValue({
            data: [{ name: "a.xlsx" }],
            error: null,
          })

          const objects = yield* run(
            withStorage((storage) => storage.list("export/", { limit: 1000 }))
          )

          expect(bucket.list).toHaveBeenCalledWith("export", { limit: 1000 })
          expect(objects.map((object) => object.key)).toEqual(["export/a.xlsx"])
        })
    )

    it.effect(
      "returns an empty array when Supabase answers no data and no error",
      () =>
        Effect.gen(function* () {
          bucket.list.mockResolvedValue({ data: null, error: null })

          const objects = yield* run(
            withStorage((storage) => storage.list("export/"))
          )

          expect(objects).toEqual([])
        })
    )

    it.effect(
      "fails with StorageListError keeping the Supabase error as cause",
      () =>
        Effect.gen(function* () {
          const supabaseError = { message: "boom", status: 500 }
          bucket.list.mockResolvedValue({ data: null, error: supabaseError })

          const error = yield* fail(
            withStorage((storage) => storage.list("export/"))
          )

          expect(error._tag).toBe("StorageListError")
          expect(error.cause).toBe(supabaseError)
        })
    )

    it.effect(
      "uses the name after the last slash as search and keeps only names starting with it",
      () =>
        Effect.gen(function* () {
          bucket.list.mockResolvedValue({
            data: [{ name: "a1" }, { name: "ba" }],
            error: null,
          })

          const objects = yield* run(
            withStorage((storage) => storage.list("export/a"))
          )

          expect(bucket.list).toHaveBeenCalledWith("export", { search: "a" })
          expect(objects.map((object) => object.key)).toEqual(["export/a1"])
        })
    )
  })

  describe("exists", () => {
    it.effect("is true when the folder lists the exact key", () =>
      Effect.gen(function* () {
        bucket.list.mockResolvedValue({
          data: [{ name: "a.xlsx" }],
          error: null,
        })

        const exists = yield* run(
          withStorage((storage) => storage.exists("export/a.xlsx"))
        )

        expect(exists).toBe(true)
      })
    )

    it.effect("is false when the folder only lists other names", () =>
      Effect.gen(function* () {
        bucket.list.mockResolvedValue({
          data: [{ name: "a.xlsx.bak" }],
          error: null,
        })

        const exists = yield* run(
          withStorage((storage) => storage.exists("export/a.xlsx"))
        )

        expect(exists).toBe(false)
      })
    )
  })

  describe("remove", () => {
    it.effect("removes the key as a one-element array", () =>
      Effect.gen(function* () {
        bucket.remove.mockResolvedValue({ data: [], error: null })

        yield* run(withStorage((storage) => storage.remove("export/a.xlsx")))

        expect(bucket.remove).toHaveBeenCalledWith(["export/a.xlsx"])
      })
    )

    it.effect(
      "fails with StorageDeleteError when Supabase answers an error",
      () =>
        Effect.gen(function* () {
          bucket.remove.mockResolvedValue({
            data: null,
            error: { message: "boom", status: 500 },
          })

          const error = yield* fail(
            withStorage((storage) => storage.remove("export/a.xlsx"))
          )

          expect(error._tag).toBe("StorageDeleteError")
        })
    )
  })

  describe("removeByPrefix", () => {
    it.effect("refuses an empty prefix without listing or removing", () =>
      Effect.gen(function* () {
        const error = yield* fail(
          withStorage((storage) => storage.removeByPrefix(""))
        )

        expect(error._tag).toBe("StorageValidationError")
        expect(bucket.list).not.toHaveBeenCalled()
        expect(bucket.remove).not.toHaveBeenCalled()
      })
    )

    it.effect("removes the listed keys in one call and returns how many", () =>
      Effect.gen(function* () {
        bucket.list.mockResolvedValue({
          data: [{ name: "a" }, { name: "b" }],
          error: null,
        })
        bucket.remove.mockResolvedValue({ data: [], error: null })

        const removed = yield* run(
          withStorage((storage) => storage.removeByPrefix("export/"))
        )

        expect(removed).toBe(2)
        expect(bucket.remove).toHaveBeenCalledTimes(1)
        expect(bucket.remove).toHaveBeenCalledWith(["export/a", "export/b"])
      })
    )

    it.effect("returns 0 and removes nothing when the folder is empty", () =>
      Effect.gen(function* () {
        bucket.list.mockResolvedValue({ data: [], error: null })

        const removed = yield* run(
          withStorage((storage) => storage.removeByPrefix("export/"))
        )

        expect(removed).toBe(0)
        expect(bucket.remove).not.toHaveBeenCalled()
      })
    )
  })

  describe("signedDownloadUrl", () => {
    it.effect("signs with the expiry and the download filename", () =>
      Effect.gen(function* () {
        bucket.createSignedUrl.mockResolvedValue({
          data: { signedUrl: "https://signed.example/k" },
          error: null,
        })

        const url = yield* run(
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
    )

    it.effect(
      "uses the default 900 seconds and no options when none are given",
      () =>
        Effect.gen(function* () {
          bucket.createSignedUrl.mockResolvedValue({
            data: { signedUrl: "https://signed.example/k" },
            error: null,
          })

          yield* run(withStorage((storage) => storage.signedDownloadUrl("k")))

          expect(bucket.createSignedUrl).toHaveBeenCalledWith(
            "k",
            900,
            undefined
          )
        })
    )

    it.effect(
      "fails with StorageSignError when Supabase answers an error",
      () =>
        Effect.gen(function* () {
          bucket.createSignedUrl.mockResolvedValue({
            data: null,
            error: { message: "boom", status: 500 },
          })

          const error = yield* fail(
            withStorage((storage) => storage.signedDownloadUrl("k"))
          )

          expect(error._tag).toBe("StorageSignError")
        })
    )
  })

  describe("signedUploadUrl", () => {
    it.effect("signs with upsert and returns the URL", () =>
      Effect.gen(function* () {
        bucket.createSignedUploadUrl.mockResolvedValue({
          data: { signedUrl: "https://signed.example/upload" },
          error: null,
        })

        const url = yield* run(
          withStorage((storage) =>
            storage.signedUploadUrl("k", { contentType: "text/csv" })
          )
        )

        expect(bucket.createSignedUploadUrl).toHaveBeenCalledWith("k", {
          upsert: true,
        })
        expect(url).toBe("https://signed.example/upload")
      })
    )

    it.effect(
      "fails with StorageSignError when Supabase answers an error",
      () =>
        Effect.gen(function* () {
          bucket.createSignedUploadUrl.mockResolvedValue({
            data: null,
            error: { message: "boom", status: 500 },
          })

          const error = yield* fail(
            withStorage((storage) =>
              storage.signedUploadUrl("k", { contentType: "text/csv" })
            )
          )

          expect(error._tag).toBe("StorageSignError")
        })
    )
  })
})

describe("StorageLive", () => {
  it.effect("uses GCS and not Supabase when GCS_BUCKET is set", () =>
    Effect.gen(function* () {
      vi.stubEnv("GCS_BUCKET", "b")

      yield* Effect.provide(
        Effect.flatMap(Storage, () => Effect.void),
        storageLayer
      )

      expect(gcs.clientOptions).toHaveBeenCalledTimes(1)
      expect(supabase.createClient).not.toHaveBeenCalled()
    })
  )

  it.effect(
    "uses the Supabase bucket with the environment values when GCS_BUCKET is empty",
    () =>
      Effect.gen(function* () {
        vi.stubEnv("GCS_BUCKET", "")
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co")
        vi.stubEnv("SUPABASE_KEY", "service-key")
        bucket.list.mockResolvedValue({
          data: [{ name: "a.xlsx" }],
          error: null,
        })

        const objects = yield* Effect.provide(
          Effect.flatMap(Storage, (storage) => storage.list("export/")),
          storageLayer
        )

        expect(supabase.createClient).toHaveBeenCalledWith(
          "https://project.supabase.co",
          "service-key"
        )
        expect(from).toHaveBeenCalledWith("mito-storage")
        expect(objects.map((object) => object.key)).toEqual(["export/a.xlsx"])
        expect(gcs.clientOptions).not.toHaveBeenCalled()
      })
  )
})

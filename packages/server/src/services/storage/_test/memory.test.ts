import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { StorageNotFoundError, StorageValidationError } from "../errors"
import { makeMemoryStorageLayer, type MemoryStorageOptions } from "../memory"
import { Storage } from "../storage"

const run = <A, E>(
  program: Effect.Effect<A, E, Storage>,
  options?: MemoryStorageOptions
) => Effect.runPromise(Effect.provide(program, makeMemoryStorageLayer(options)))

const bytes = (text: string) => new TextEncoder().encode(text)
const text = (data: Uint8Array) => new TextDecoder().decode(data)

describe("memory storage", () => {
  it("uploads and downloads the same bytes", async () => {
    const result = await run(
      Effect.gen(function* () {
        const storage = yield* Storage
        const uploaded = yield* storage.upload({
          key: "resume/a.pdf",
          body: bytes("%PDF-1.4"),
          contentType: "application/pdf",
        })
        const downloaded = yield* storage.download("resume/a.pdf")
        return { uploaded, downloaded }
      })
    )

    expect(result.uploaded).toEqual({ key: "resume/a.pdf" })
    expect(text(result.downloaded)).toBe("%PDF-1.4")
  })

  it("encodes string bodies as UTF-8", async () => {
    const downloaded = await run(
      Effect.gen(function* () {
        const storage = yield* Storage
        yield* storage.upload({
          key: "note.txt",
          body: "perché",
          contentType: "text/plain",
        })
        return yield* storage.download("note.txt")
      })
    )

    expect(downloaded.byteLength).toBe(bytes("perché").byteLength)
    expect(text(downloaded)).toBe("perché")
  })

  it("keeps the stored bytes when the caller later changes its buffer", async () => {
    const body = bytes("abc")
    const downloaded = await run(
      Effect.gen(function* () {
        const storage = yield* Storage
        yield* storage.upload({ key: "a.txt", body, contentType: "text/plain" })
        body[0] = 0
        return yield* storage.download("a.txt")
      })
    )

    expect(text(downloaded)).toBe("abc")
  })

  it("fails with StorageNotFoundError for a missing key", async () => {
    const error = await run(
      Effect.gen(function* () {
        const storage = yield* Storage
        return yield* Effect.flip(storage.download("missing.pdf"))
      })
    )

    expect(error).toBeInstanceOf(StorageNotFoundError)
    expect(error.key).toBe("missing.pdf")
  })

  it("reports existence before and after upload", async () => {
    const [before, after] = await run(
      Effect.gen(function* () {
        const storage = yield* Storage
        const beforeUpload = yield* storage.exists("a.txt")
        yield* storage.upload({
          key: "a.txt",
          body: "x",
          contentType: "text/plain",
        })
        const afterUpload = yield* storage.exists("a.txt")
        return [beforeUpload, afterUpload] as const
      })
    )

    expect(before).toBe(false)
    expect(after).toBe(true)
  })

  it("removes an object, and removing a missing one is not an error", async () => {
    const result = await run(
      Effect.gen(function* () {
        const storage = yield* Storage
        yield* storage.upload({
          key: "a.txt",
          body: "x",
          contentType: "text/plain",
        })
        yield* storage.remove("a.txt")
        yield* storage.remove("a.txt")
        yield* storage.remove("never-existed.txt")
        return yield* storage.exists("a.txt")
      })
    )

    expect(result).toBe(false)
  })

  it("removeByPrefix deletes only matching keys and returns how many", async () => {
    const result = await run(
      Effect.gen(function* () {
        const storage = yield* Storage
        yield* storage.upload({
          key: "tmp/a",
          body: "1",
          contentType: "text/plain",
        })
        yield* storage.upload({
          key: "tmp/b",
          body: "2",
          contentType: "text/plain",
        })
        yield* storage.upload({
          key: "keep/c",
          body: "3",
          contentType: "text/plain",
        })
        const removed = yield* storage.removeByPrefix("tmp/")
        const remaining = yield* storage.list("")
        return { removed, remaining: remaining.map((object) => object.key) }
      })
    )

    expect(result.removed).toBe(2)
    expect(result.remaining).toEqual(["keep/c"])
  })

  it("refuses empty, root and blank prefixes and deletes nothing", async () => {
    const result = await run(
      Effect.gen(function* () {
        const storage = yield* Storage
        yield* storage.upload({
          key: "a.pdf",
          body: "x",
          contentType: "application/pdf",
        })
        const errors: Array<unknown> = []
        for (const prefix of ["", "/", "//", "   "]) {
          errors.push(yield* Effect.flip(storage.removeByPrefix(prefix)))
        }
        const stillThere = yield* storage.exists("a.pdf")
        return { errors, stillThere }
      })
    )

    expect(result.errors).toHaveLength(4)
    for (const error of result.errors)
      expect(error).toBeInstanceOf(StorageValidationError)
    expect(result.stillThere).toBe(true)
  })

  it("lists objects under a prefix sorted by key, with size and limit", async () => {
    const listed = await run(
      Effect.gen(function* () {
        const storage = yield* Storage
        yield* storage.upload({
          key: "docs/b.txt",
          body: "bb",
          contentType: "text/plain",
        })
        yield* storage.upload({
          key: "docs/a.txt",
          body: "a",
          contentType: "text/plain",
        })
        yield* storage.upload({
          key: "other/c.txt",
          body: "c",
          contentType: "text/plain",
        })
        const all = yield* storage.list("docs/")
        const limited = yield* storage.list("docs/", { limit: 1 })
        return { all, limited }
      })
    )

    expect(listed.all.map((object) => [object.key, object.size])).toEqual([
      ["docs/a.txt", 1],
      ["docs/b.txt", 2],
    ])
    expect(listed.all[0]?.updated).toBeInstanceOf(Date)
    expect(listed.limited.map((object) => object.key)).toEqual(["docs/a.txt"])
  })

  it("enforces maxUploadBytes: a body at the limit is stored, one above is rejected", async () => {
    const result = await run(
      Effect.gen(function* () {
        const storage = yield* Storage
        yield* storage.upload({
          key: "ok.bin",
          body: bytes("1234"),
          contentType: "application/octet-stream",
        })
        const error = yield* Effect.flip(
          storage.upload({
            key: "big.bin",
            body: bytes("12345"),
            contentType: "application/octet-stream",
          })
        )
        const bigStored = yield* storage.exists("big.bin")
        const okStored = yield* storage.exists("ok.bin")
        return { error, bigStored, okStored }
      }),
      { maxUploadBytes: 4 }
    )

    expect(result.error).toBeInstanceOf(StorageValidationError)
    expect(result.bigStored).toBe(false)
    expect(result.okStored).toBe(true)
  })

  it("returns deterministic fake signed URLs", async () => {
    const urls = await run(
      Effect.gen(function* () {
        const storage = yield* Storage
        return {
          first: yield* storage.signedDownloadUrl("resume/a.pdf"),
          second: yield* storage.signedDownloadUrl("resume/a.pdf"),
          named: yield* storage.signedDownloadUrl("resume/a.pdf", {
            filename: "Mario Rossi CV.pdf",
            expiresInSeconds: 60,
          }),
          upload: yield* storage.signedUploadUrl("resume/a.pdf", {
            contentType: "application/pdf",
          }),
        }
      }),
      { bucket: "my-bucket" }
    )

    expect(urls.first).toBe(urls.second)
    expect(urls.first).toBe(
      "memory://my-bucket/resume/a.pdf?action=read&expiresInSeconds=900"
    )
    expect(urls.named).toBe(
      "memory://my-bucket/resume/a.pdf?action=read&expiresInSeconds=60&filename=Mario+Rossi+CV.pdf"
    )
    expect(urls.upload).toBe(
      "memory://my-bucket/resume/a.pdf?action=write&contentType=application%2Fpdf&expiresInSeconds=900"
    )
  })

  it("starts empty for each layer built", async () => {
    await run(
      Effect.gen(function* () {
        const storage = yield* Storage
        yield* storage.upload({
          key: "a.txt",
          body: "x",
          contentType: "text/plain",
        })
      })
    )

    const existsInNewLayer = await run(
      Effect.gen(function* () {
        const storage = yield* Storage
        return yield* storage.exists("a.txt")
      })
    )

    expect(existsInNewLayer).toBe(false)
  })
})

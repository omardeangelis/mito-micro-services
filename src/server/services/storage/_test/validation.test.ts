import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { StorageValidationError } from "../errors"
import {
  assertContentType,
  assertDeletablePrefix,
  assertMaxBytes,
  assertPdfMagicBytes,
} from "../validation"

describe("assertMaxBytes", () => {
  it("accepts bodies up to the limit, and any size when the limit is undefined", async () => {
    await Effect.runPromise(assertMaxBytes(new Uint8Array(4), 4))
    await Effect.runPromise(
      assertMaxBytes(new Uint8Array(1_000_000), undefined)
    )
  })

  it("rejects bodies above the limit", async () => {
    const error = await Effect.runPromise(
      Effect.flip(assertMaxBytes(new Uint8Array(5), 4))
    )
    expect(error).toBeInstanceOf(StorageValidationError)
  })

  it("measures strings in UTF-8 bytes", async () => {
    // "è" is two bytes in UTF-8.
    const error = await Effect.runPromise(Effect.flip(assertMaxBytes("è", 1)))
    expect(error).toBeInstanceOf(StorageValidationError)
  })
})

describe("assertContentType", () => {
  it("ignores parameters and letter case", async () => {
    await Effect.runPromise(
      assertContentType("Application/PDF; charset=binary", ["application/pdf"])
    )
  })

  it("rejects a type outside the allow-list", async () => {
    const error = await Effect.runPromise(
      Effect.flip(assertContentType("image/png", ["application/pdf"]))
    )
    expect(error).toBeInstanceOf(StorageValidationError)
  })
})

describe("assertPdfMagicBytes", () => {
  it("accepts bytes and strings that start with %PDF-", async () => {
    await Effect.runPromise(
      assertPdfMagicBytes(new TextEncoder().encode("%PDF-1.7 rest"))
    )
    await Effect.runPromise(assertPdfMagicBytes("%PDF-1.4"))
  })

  it("rejects content that is not a PDF, even if declared as one", async () => {
    const error = await Effect.runPromise(
      Effect.flip(assertPdfMagicBytes("<html>not a pdf</html>"))
    )
    expect(error).toBeInstanceOf(StorageValidationError)
  })
})

describe("assertDeletablePrefix", () => {
  it.each(["", "/", "//", "   "])("refuses the prefix %j", async (prefix) => {
    const error = await Effect.runPromise(
      Effect.flip(assertDeletablePrefix(prefix))
    )
    expect(error).toBeInstanceOf(StorageValidationError)
  })

  it("accepts a regular prefix", async () => {
    await Effect.runPromise(assertDeletablePrefix("tmp/"))
  })
})

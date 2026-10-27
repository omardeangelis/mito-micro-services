import { Effect } from "effect"
import { describe, expect, it } from "@effect/vitest"
import { StorageValidationError } from "../errors"
import {
  assertContentType,
  assertDeletablePrefix,
  assertMaxBytes,
  assertPdfMagicBytes,
} from "../validation"

describe("assertMaxBytes", () => {
  it.effect(
    "accepts bodies up to the limit, and any size when the limit is undefined",
    () =>
      Effect.gen(function* () {
        yield* assertMaxBytes(new Uint8Array(4), 4)
        yield* assertMaxBytes(new Uint8Array(1_000_000), undefined)
      })
  )

  it.effect("rejects bodies above the limit", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(assertMaxBytes(new Uint8Array(5), 4))
      expect(error).toBeInstanceOf(StorageValidationError)
    })
  )

  it.effect("measures strings in UTF-8 bytes", () =>
    Effect.gen(function* () {
      // "è" is two bytes in UTF-8.
      const error = yield* Effect.flip(assertMaxBytes("è", 1))
      expect(error).toBeInstanceOf(StorageValidationError)
    })
  )
})

describe("assertContentType", () => {
  it.effect("ignores parameters and letter case", () =>
    Effect.gen(function* () {
      yield* assertContentType("Application/PDF; charset=binary", [
        "application/pdf",
      ])
    })
  )

  it.effect("rejects a type outside the allow-list", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        assertContentType("image/png", ["application/pdf"])
      )
      expect(error).toBeInstanceOf(StorageValidationError)
    })
  )
})

describe("assertPdfMagicBytes", () => {
  it.effect("accepts bytes and strings that start with %PDF-", () =>
    Effect.gen(function* () {
      yield* assertPdfMagicBytes(new TextEncoder().encode("%PDF-1.7 rest"))
      yield* assertPdfMagicBytes("%PDF-1.4")
    })
  )

  it.effect("rejects content that is not a PDF, even if declared as one", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        assertPdfMagicBytes("<html>not a pdf</html>")
      )
      expect(error).toBeInstanceOf(StorageValidationError)
    })
  )
})

describe("assertDeletablePrefix", () => {
  it.effect.each(["", "/", "//", "   "])("refuses the prefix %j", (prefix) =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(assertDeletablePrefix(prefix))
      expect(error).toBeInstanceOf(StorageValidationError)
    })
  )

  it.effect("accepts a regular prefix", () =>
    Effect.gen(function* () {
      yield* assertDeletablePrefix("tmp/")
    })
  )
})

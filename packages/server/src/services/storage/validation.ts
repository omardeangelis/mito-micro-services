import { Effect } from "effect"
import { StorageValidationError } from "./errors"

/**
 * Optional validators, to compose in front of `upload`. They have no
 * dependencies beyond `effect`.
 */

const encoder = new TextEncoder()

const toBytes = (body: Uint8Array | string): Uint8Array =>
  typeof body === "string" ? encoder.encode(body) : body

/** Fails when the body is larger than `max` bytes. `undefined` means no limit. */
export const assertMaxBytes = (
  body: Uint8Array | string,
  max: number | undefined
): Effect.Effect<void, StorageValidationError> => {
  if (max === undefined) return Effect.void
  const size = toBytes(body).byteLength
  return size <= max
    ? Effect.void
    : Effect.fail(
        new StorageValidationError({
          message: `Body is ${size} bytes, the limit is ${max} bytes`,
        })
      )
}

/** Drops parameters and case: "Application/PDF; charset=binary" is "application/pdf". */
const normalizeMimeType = (value: string): string => {
  const [base = ""] = value.split(";")
  return base.trim().toLowerCase()
}

/** Fails when the content type is not one of `allowed`. */
export const assertContentType = (
  contentType: string,
  allowed: ReadonlyArray<string>
): Effect.Effect<void, StorageValidationError> => {
  const actual = normalizeMimeType(contentType)
  return allowed.some((type) => normalizeMimeType(type) === actual)
    ? Effect.void
    : Effect.fail(
        new StorageValidationError({
          message: `Content type "${actual}" is not allowed`,
        })
      )
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] // "%PDF-"

/** Fails when the body does not start with the `%PDF-` magic bytes, so a renamed file cannot pass as a PDF. */
export const assertPdfMagicBytes = (
  body: Uint8Array | string
): Effect.Effect<void, StorageValidationError> => {
  const bytes = toBytes(body)
  return PDF_MAGIC.every((byte, index) => bytes[index] === byte)
    ? Effect.void
    : Effect.fail(
        new StorageValidationError({
          message: 'Body does not start with the PDF magic bytes "%PDF-"',
        })
      )
}

/**
 * Guards `removeByPrefix`: an empty or root prefix would match the whole bucket,
 * so it is refused.
 */
export const assertDeletablePrefix = (
  prefix: string
): Effect.Effect<void, StorageValidationError> => {
  const trimmed = prefix.trim()
  return trimmed === "" || /^\/+$/.test(trimmed)
    ? Effect.fail(
        new StorageValidationError({
          message: "Refusing to delete with an empty or root prefix",
        })
      )
    : Effect.void
}

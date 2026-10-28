// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  StorageConfigError,
  StorageDeleteError,
  StorageDownloadError,
  StorageListError,
  StorageNotFoundError,
  StorageSignError,
  StorageUploadError,
  StorageValidationError,
} from "../errors"

// AC10: each error builds from the values the adapters pass: `key` and
// `cause` present, absent or undefined, `cause` of any kind

const classes = [
  { Class: StorageConfigError, tag: "StorageConfigError" },
  { Class: StorageUploadError, tag: "StorageUploadError" },
  { Class: StorageDownloadError, tag: "StorageDownloadError" },
  { Class: StorageNotFoundError, tag: "StorageNotFoundError" },
  { Class: StorageDeleteError, tag: "StorageDeleteError" },
  { Class: StorageListError, tag: "StorageListError" },
  { Class: StorageSignError, tag: "StorageSignError" },
  { Class: StorageValidationError, tag: "StorageValidationError" },
]

describe("errori dello storage: costruzione", () => {
  it.each(classes)("$tag porta key, message e cause", ({ Class, tag }) => {
    const cause = new Error("bucket unreachable")
    const error = new Class({
      key: "export/a.xlsx",
      message: 'Upload of "export/a.xlsx" failed',
      cause,
    })
    expect(error).toBeInstanceOf(Class)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe(tag)
    expect(error.key).toBe("export/a.xlsx")
    expect(error.message).toBe('Upload of "export/a.xlsx" failed')
    expect(error.cause).toBe(cause)
    expect({ ...error }).toStrictEqual({ _tag: tag, key: "export/a.xlsx" })
  })

  it.each(classes)("$tag senza key né cause", ({ Class, tag }) => {
    const error = new Class({
      message: "Body is 10 bytes, the limit is 5 bytes",
    })
    expect(error._tag).toBe(tag)
    expect(error.message).toBe("Body is 10 bytes, the limit is 5 bytes")
    expect("key" in error).toBe(false)
    expect(error.key).toBeUndefined()
    expect(error.cause).toBeUndefined()
    expect({ ...error }).toStrictEqual({ _tag: tag })
  })

  it.each(classes)("$tag con key e cause undefined", ({ Class, tag }) => {
    const error = new Class({
      key: undefined,
      message: "STORAGE_BUCKET is required",
      cause: undefined,
    })
    expect(error._tag).toBe(tag)
    expect(error.message).toBe("STORAGE_BUCKET is required")
    expect(error.key).toBeUndefined()
    expect(error.cause).toBeUndefined()
    // A falsy cause isn't the Error's own cause: it stays a plain field
    expect({ ...error }).toStrictEqual({
      _tag: tag,
      key: undefined,
      cause: undefined,
    })
  })

  it.each(classes)("$tag con una cause che non è un Error", ({ Class }) => {
    const cause = { statusCode: "404", message: "Object not found" }
    const error = new Class({ key: "a", message: "No object at a", cause })
    expect(error.cause).toBe(cause)
  })
})

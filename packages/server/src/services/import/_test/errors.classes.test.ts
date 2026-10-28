// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  ImportAlreadyRunning,
  ImportInputInvalid,
  ImportQueueFailed,
  ImportRowRejected,
  ImportTimedOut,
  ImportUnavailable,
  ImportUploadClosed,
  ImportUploadMissing,
} from "../errors"

// AC10: each error builds from the values the import passes

describe("errori dell'import: costruzione", () => {
  it.each([
    { Class: ImportTimedOut, tag: "ImportTimedOut" },
    { Class: ImportUnavailable, tag: "ImportUnavailable" },
  ])("$tag si costruisce senza campi", ({ Class, tag }) => {
    const error = new Class()
    expect(error).toBeInstanceOf(Class)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe(tag)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: tag })
  })

  it("ImportInputInvalid porta il motivo", () => {
    const error = new ImportInputInvalid({ reason: "file vuoto" })
    expect(error).toBeInstanceOf(ImportInputInvalid)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("ImportInputInvalid")
    expect(error.reason).toBe("file vuoto")
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "ImportInputInvalid",
      reason: "file vuoto",
    })
  })

  it("ImportUploadMissing porta l'upload", () => {
    const uploadId = "0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d"
    const error = new ImportUploadMissing({ uploadId })
    expect(error).toBeInstanceOf(ImportUploadMissing)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("ImportUploadMissing")
    expect(error.uploadId).toBe(uploadId)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "ImportUploadMissing",
      uploadId,
    })
  })

  it("ImportUploadClosed porta l'upload", () => {
    const uploadId = "0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d"
    const error = new ImportUploadClosed({ uploadId })
    expect(error).toBeInstanceOf(ImportUploadClosed)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("ImportUploadClosed")
    expect(error.uploadId).toBe(uploadId)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: "ImportUploadClosed", uploadId })
  })

  it("ImportRowRejected porta la riga e la regola", () => {
    const error = new ImportRowRejected({ row: 3, rule: "codice fiscale" })
    expect(error).toBeInstanceOf(ImportRowRejected)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("ImportRowRejected")
    expect(error.row).toBe(3)
    expect(error.rule).toBe("codice fiscale")
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "ImportRowRejected",
      row: 3,
      rule: "codice fiscale",
    })
  })

  it("ImportAlreadyRunning porta chi l'ha avviato e l'ora", () => {
    const error = new ImportAlreadyRunning({
      startedBy: "Mario Rossi",
      time: "10:05",
    })
    expect(error).toBeInstanceOf(ImportAlreadyRunning)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("ImportAlreadyRunning")
    expect(error.startedBy).toBe("Mario Rossi")
    expect(error.time).toBe("10:05")
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "ImportAlreadyRunning",
      startedBy: "Mario Rossi",
      time: "10:05",
    })
  })

  it("ImportQueueFailed porta il motivo", () => {
    const error = new ImportQueueFailed({ reason: "Cloud Tasks answered 503" })
    expect(error).toBeInstanceOf(ImportQueueFailed)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("ImportQueueFailed")
    expect(error.reason).toBe("Cloud Tasks answered 503")
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "ImportQueueFailed",
      reason: "Cloud Tasks answered 503",
    })
  })
})

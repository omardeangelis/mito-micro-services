// @vitest-environment node
import { describe, expect, it } from "vitest"
import { ExportFileNotAllowed } from "../files"

// AC10: the error builds as `downloadExportFile` builds it. Its field `name`
// is the error's own `name`

describe("errori dei file di export: costruzione", () => {
  it("ExportFileNotAllowed porta il nome del file", () => {
    const error = new ExportFileNotAllowed({ name: "../segreti.xlsx" })
    expect(error).toBeInstanceOf(ExportFileNotAllowed)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("ExportFileNotAllowed")
    expect(error.name).toBe("../segreti.xlsx")
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "ExportFileNotAllowed",
      name: "../segreti.xlsx",
    })
  })
})

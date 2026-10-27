// @vitest-environment node
import { gunzipSync } from "node:zlib"
import { describe, expect, test } from "vitest"
import * as XLSX from "xlsx"
import { classifyRows } from "@mito/domain/import/classify"
import { waveColumns } from "@mito/domain/import/formats"
import { fileBodySchema, fromFileBody } from "@mito/domain/import/payload"
import { type CrmState } from "@mito/domain/import/plan"
import {
  compressedBody,
  errorReport,
  previewImport,
  readImport,
} from "../session"
import { waveFile, waveRow, workbook } from "./workbooks"

// What the worker of the import does with a file (T14): the same rows and
// outcomes the server reads again from the body (AC12), the numbers of the
// preview (AC7) and the error report (AC14)

const NOW = new Date("2025-01-15T10:00:00.000Z")
const emptyCrm: CrmState = { customers: [], praticaIds: [], links: [] }

const rowA = waveRow()
const rowB = waveRow({
  "n° Pratica": "900002",
  "Codice NDG": "100002",
  "Codice Fiscale": "VRDLGU75B02F205X",
})
/** No fiscal code nor VAT number: discarded (AC10) */
const noCode = waveRow({
  "n° Pratica": "900003",
  "Codice NDG": "100003",
  "Codice Fiscale": null,
  "CAP Residenza": "00185",
})

const read = (bytes: ArrayBuffer, fileName = "0125_import.xlsx") => {
  const result = readImport(bytes, fileName, NOW)
  if (!result.ok) throw new Error(result.message)
  return result
}

describe("lettura del file nel worker", () => {
  test("un file Wave: formato, chiavi da cercare e numeri di riga come in Excel", () => {
    const { session, keys } = read(waveFile(rowA, rowB, noCode))

    expect(session.format).toBe("wave")
    expect(session.rows.map(({ row }) => row)).toEqual([2, 3, 4])
    expect(keys.fiscalCodes.sort()).toEqual([
      "RSSMRA80A01H501U",
      "VRDLGU75B02F205X",
    ])
    expect(keys.praticaIds.sort()).toEqual(["900001", "900002"])
  })

  test("una riga vuota in mezzo non è una riga: la riga dopo tiene il suo numero (AC8)", () => {
    const { session } = read(waveFile(rowA, {}, rowB))

    expect(session.rows.map(({ row }) => row)).toEqual([2, 4])
  })

  test("l'anteprima su un CRM vuoto: numeri, righe scartate con i motivi, righe attese (AC7, AC8)", () => {
    const { session } = read(waveFile(rowA, rowB, noCode))

    const preview = previewImport(session, emptyCrm)

    expect(preview.counts).toMatchObject({
      rows: 3,
      importable: 2,
      customerOnly: 0,
      discarded: 1,
      customersNew: 2,
      practicesNew: 2,
      linksNew: 2,
    })
    expect(preview.discarded).toEqual([
      {
        row: 4,
        reasons: ["Manca il codice fiscale o la partita IVA del cliente"],
      },
    ])
    expect(preview.expected).toEqual([2, 3])
  })

  test("il corpo compresso è quello che il server legge, e dà le stesse righe (AC12)", async () => {
    const { session } = read(waveFile(rowA, rowB, noCode))

    const body = fileBodySchema.parse(
      JSON.parse(gunzipSync(await compressedBody(session)).toString("utf8"))
    )

    expect(body.columns).toEqual([...waveColumns])
    expect(
      classifyRows("wave", fromFileBody(body), NOW, "0125_import.xlsx")
    ).toEqual(session.classified)
  })

  test("il report ha le righe scartate con i valori del foglio: il CAP 00185 resta 00185 (AC14)", () => {
    const { session } = read(waveFile(rowA, noCode))
    previewImport(session, emptyCrm)

    const { fileName, bytes } = errorReport(session, NOW)

    const book = XLSX.read(bytes, { type: "array" })
    const [header, first] = XLSX.utils.sheet_to_json<unknown[]>(
      book.Sheets[book.SheetNames[0]!]!,
      { header: 1, defval: "" }
    )
    expect(fileName).toBe("errori_import_0125_import_2025-01-15.xlsx")
    expect(header?.slice(0, 3)).toEqual(["Riga", "Errori", waveColumns[0]])
    expect(first?.slice(0, 2)).toEqual([
      3,
      "Manca il codice fiscale o la partita IVA del cliente",
    ])
    expect(first?.[2 + waveColumns.indexOf("CAP Residenza")]).toBe("00185")
  })
})

describe("file che non si importano (AC6)", () => {
  test("colonne mancanti: il formato più vicino e le colonne che gli mancano", () => {
    const columns = waveColumns.filter(
      (column) => column !== "Codice NDG" && column !== "Data Erogazione"
    )

    const result = readImport(workbook(columns, [rowA]), "f.xlsx", NOW)

    expect(result).toEqual({
      ok: false,
      message: "Formato Wave: mancano le colonne Codice NDG, Data Erogazione",
    })
  })

  test("una colonna sola che manca", () => {
    const columns = waveColumns.filter((column) => column !== "Codice NDG")

    expect(readImport(workbook(columns, [rowA]), "f.xlsx", NOW)).toEqual({
      ok: false,
      message: "Formato Wave: manca la colonna Codice NDG",
    })
  })

  test("la prima riga vuota: le intestazioni devono essere nella prima riga", () => {
    const sheet = XLSX.utils.aoa_to_sheet([])
    XLSX.utils.sheet_add_aoa(sheet, [[...waveColumns]], { origin: "A2" })
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, "Foglio1")
    const bytes = XLSX.write(book, {
      type: "array",
      bookType: "xlsx",
    }) as ArrayBuffer

    expect(readImport(bytes, "f.xlsx", NOW)).toEqual({
      ok: false,
      message: "Le intestazioni devono essere nella prima riga",
    })
  })
})

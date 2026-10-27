// @vitest-environment node
import { describe, expect, test } from "vitest"
import * as XLSX from "xlsx"
import { buildErrorReport } from "../errorReport"

// The error report of the preview (T15, AC13–AC15, D16): built in the browser
// from the sheet's values as text, never uploaded

const headers = ["PRATICA", "CLIENTE", "CAP", "NOTE"]
const sheetRows = new Map<number, readonly string[]>([
  [2, ["P1", "C1", "00184", ""]],
  [6, ["P5", "C5", "00185", "da richiamare"]],
  [9, ["P8", "", "", ""]],
])

/** The report's cells as text, header row first. */
const readBack = (bytes: Uint8Array) => {
  const book = XLSX.read(bytes, { type: "array" })
  expect(book.SheetNames).toHaveLength(1)
  return XLSX.utils.sheet_to_json<unknown[]>(
    book.Sheets[book.SheetNames[0]!]!,
    {
      header: 1,
      raw: true,
      defval: "",
    }
  )
}

describe("report errori", () => {
  test("con la riga 6 del file scartata per due motivi, la riga 2 del report ha 'Riga' = 6 e 'Errori' = 'motivo 1; motivo 2'", () => {
    const { bytes } = buildErrorReport({
      headers,
      sheetRows,
      discarded: [{ row: 6, reasons: ["motivo 1", "motivo 2"] }],
      fileName: "0125_import.xlsx",
      today: new Date("2026-10-25T10:00:00.000Z"),
    })

    const rows = readBack(bytes)
    expect(rows[1]?.slice(0, 2)).toEqual([6, "motivo 1; motivo 2"])
  })

  test("intestazioni: Riga, Errori, poi le colonne del file nel loro ordine (AC14)", () => {
    const { bytes } = buildErrorReport({
      headers,
      sheetRows,
      discarded: [{ row: 2, reasons: ["motivo"] }],
      fileName: "0125_import.xlsx",
      today: new Date("2026-10-25T10:00:00.000Z"),
    })

    expect(readBack(bytes)[0]).toEqual([
      "Riga",
      "Errori",
      "PRATICA",
      "CLIENTE",
      "CAP",
      "NOTE",
    ])
  })

  test("una riga per riga scartata, nell'ordine dato, con i valori del foglio come testo: il CAP 00185 resta 00185", () => {
    const { bytes } = buildErrorReport({
      headers,
      sheetRows,
      discarded: [
        { row: 6, reasons: ["motivo"] },
        { row: 9, reasons: ["altro motivo"] },
      ],
      fileName: "0125_import.xlsx",
      today: new Date("2026-10-25T10:00:00.000Z"),
    })

    expect(readBack(bytes).slice(1)).toEqual([
      [6, "motivo", "P5", "C5", "00185", "da richiamare"],
      [9, "altro motivo", "P8", "", "", ""],
    ])
  })

  test("le colonne in più del file restano, con i loro valori", () => {
    const { bytes } = buildErrorReport({
      headers: ["PRATICA", "Colonna mia"],
      sheetRows: new Map([[3, ["P2", "nota"]]]),
      discarded: [{ row: 3, reasons: ["motivo"] }],
      fileName: "0125_import.xlsx",
      today: new Date("2026-10-25T10:00:00.000Z"),
    })

    expect(readBack(bytes)).toEqual([
      ["Riga", "Errori", "PRATICA", "Colonna mia"],
      [3, "motivo", "P2", "nota"],
    ])
  })

  test.each([
    ["0125_import.xlsx", "errori_import_0125_import_2026-10-25.xlsx"],
    ["clienti.ottobre.csv", "errori_import_clienti.ottobre_2026-10-25.xlsx"],
    ["senza estensione", "errori_import_senza estensione_2026-10-25.xlsx"],
  ])("il report di %s si chiama %s (AC14)", (fileName, expected) => {
    expect(
      buildErrorReport({
        headers,
        sheetRows,
        discarded: [{ row: 2, reasons: ["motivo"] }],
        fileName,
        today: new Date("2026-10-25T10:00:00.000Z"),
      }).fileName
    ).toBe(expected)
  })

  test("la data del nome è il giorno di Roma: alle 23:30 UTC del 25 ottobre a Roma è già il 26", () => {
    expect(
      buildErrorReport({
        headers,
        sheetRows,
        discarded: [{ row: 2, reasons: ["motivo"] }],
        fileName: "0125_import.xlsx",
        today: new Date("2026-10-25T23:30:00.000Z"),
      }).fileName
    ).toBe("errori_import_0125_import_2026-10-26.xlsx")
  })
})

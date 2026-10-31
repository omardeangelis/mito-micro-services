import { afterEach, describe, expect, it, vi } from "vitest"
import * as XLSX from "xlsx"
import {
  allFileName,
  downloadBlob,
  exportAllSummary,
  exportHeader,
  fileName,
  toCsv,
  toTsv,
  toWorkbook,
  type ExportContext,
} from "../export"
import { type ChartResult } from "../results"

const october = { from: "2026-10-01", to: "2026-10-30" }

const branches: ChartResult<unknown> = {
  id: "branches",
  title: "Finanziato per sede",
  question: "Quali sedi portano il finanziato, e quanto pesa ciascuna?",
  status: { kind: "ready" },
  kpi: { value: 9, format: "count", caption: "sedi", delta: null },
  points: [],
  table: {
    columns: [
      { header: "Sede", format: "text" },
      { header: "Pratiche", format: "count" },
      { header: "Finanziato (€)", format: "euro" },
      { header: "Quota (%)", format: "percent" },
    ],
    rows: [
      ["Roma", 3, 12_500.5, 54],
      ["Senza sede", 1, 10_649.5, 46],
    ],
  },
  notes: [],
  scope: null,
}

/** The cells of a sheet, without its `!ref` and the other `!` keys. */
const cellsOf = (sheet: XLSX.WorkSheet | undefined): XLSX.CellObject[] =>
  Object.entries(sheet ?? {})
    .filter(([address]) => !address.startsWith("!"))
    .map(([, cell]) => cell as XLSX.CellObject)

const context: ExportContext = {
  window: october,
  comparison: { from: "2026-09-01", to: "2026-09-30" },
  compare: "previous",
  group: null,
  dataOf: "tutta la rete",
  extractedAt: new Date("2026-10-30T11:00:00.000Z"),
}

describe("fileName (AC7, AC30, AC32)", () => {
  it("is mito_<chart>_<from>_<to>.<ext>", () => {
    expect(fileName("branches", october, "csv")).toBe(
      "mito_finanziato-per-sede_2026-10-01_2026-10-30.csv"
    )
    expect(fileName("average", october, "xlsx")).toBe(
      "mito_finanziato-medio-per-pratica_2026-10-01_2026-10-30.xlsx"
    )
    expect(fileName("appointments", october, "csv")).toBe(
      "mito_tasso-di-appuntamento_2026-10-01_2026-10-30.csv"
    )
  })

  it("has only today for the contacts with an outcome", () => {
    expect(
      fileName("progress", { from: "2026-10-30", to: "2026-10-30" }, "csv")
    ).toBe("mito_contatti-con-esito_2026-10-30.csv")
  })

  it("names the workbook of every chart", () => {
    expect(allFileName(october)).toBe("mito_analisi_2026-10-01_2026-10-30.xlsx")
  })
})

describe("exportHeader (AC30)", () => {
  it("has title, question, window, comparison, whose data and when", () => {
    const header = exportHeader(branches, context)
    const labels = header.map(([label]) => label)
    expect(labels).toEqual(
      expect.arrayContaining([
        "Grafico",
        "Domanda",
        "Finestra",
        "Confronto",
        "Dati di",
        "Estratto il",
      ])
    )
    expect(header).toContainEqual(["Grafico", "Finanziato per sede"])
    expect(header).toContainEqual(["Finestra", "1 – 30 ott 2026"])
    expect(header).toContainEqual(["Dati di", "tutta la rete"])
  })

  it("says «Adesso» instead of window, comparison and grouping for the contacts (AC7)", () => {
    const header = exportHeader(
      { ...branches, id: "progress", title: "Contatti con esito" },
      { ...context, group: "week" }
    )
    const labels = header.map(([label]) => label)
    expect(labels).not.toContain("Confronto")
    expect(labels).not.toContain("Raggruppamento")
    expect(header).toContainEqual(["Finestra", "Adesso"])
    expect(header.flat()).not.toContain("Dati")
  })
})

describe("toCsv (AC27, AC30)", () => {
  it("starts with the BOM, separates with ; and writes Italian decimals", () => {
    const csv = toCsv(exportHeader(branches, context), branches.table)
    expect(csv.startsWith("﻿")).toBe(true)
    const lines = csv.slice(1).split("\r\n")
    expect(lines).toContain("Sede;Pratiche;Finanziato (€);Quota (%)")
    expect(lines).toContain("Roma;3;12.500,50;54,0%")
    // The rows of the table, in its order, after the column names
    const columns = lines.indexOf("Sede;Pratiche;Finanziato (€);Quota (%)")
    expect(lines.slice(columns + 1, columns + 3)).toEqual([
      "Roma;3;12.500,50;54,0%",
      "Senza sede;1;10.649,50;46,0%",
    ])
  })

  it("writes «—» for a value that doesn't exist (AC24) and quotes a ;", () => {
    const csv = toCsv([["Note", "a; b"]], {
      columns: [{ header: "Tasso (%)", format: "percent" }],
      rows: [[null]],
    })
    expect(csv).toContain('Note;"a; b"')
    expect(csv.split("\r\n")).toContain("—")
  })
})

describe("toTsv (AC29)", () => {
  it("has the header rows, then the column names, then the rows", () => {
    const tsv = toTsv(exportHeader(branches, context), branches.table)
    expect(tsv.startsWith("Grafico\tFinanziato per sede")).toBe(true)
    expect(tsv).toContain("Sede\tPratiche\tFinanziato (€)\tQuota (%)")
    expect(tsv).toContain("Roma\t3\t12.500,50\t54,0%")
  })
})

describe("toWorkbook (AC28, AC32)", () => {
  it("has a sheet per chart, with numbers as numbers", async () => {
    const workbook = await toWorkbook([
      {
        name: "Finanziato per sede",
        header: exportHeader(branches, context),
        table: branches.table,
      },
      {
        name: "Contatti con esito",
        header: [["Grafico", "Contatti con esito"]],
        table: {
          columns: [{ header: "Stato", format: "text" }],
          rows: [["Con esito"]],
        },
      },
    ])
    const read = XLSX.read(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" })
    )
    expect(read.SheetNames).toEqual([
      "Finanziato per sede",
      "Contatti con esito",
    ])
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      read.Sheets["Finanziato per sede"]!,
      { header: 1 }
    )
    expect(rows).toContainEqual(["Roma", 3, 12_500.5, 54])
  })

  it("rounds the numbers to what the table shows, keeping them numbers (AC28)", async () => {
    const workbook = await toWorkbook([
      {
        name: "Sedi",
        header: [],
        table: {
          columns: [
            { header: "Sede", format: "text" },
            { header: "Pratiche", format: "count" },
            { header: "Finanziato (€)", format: "euro" },
            { header: "Quota (%)", format: "percent" },
          ],
          rows: [["Roma", 3.4, 12_500.456, 24.04912]],
        },
      },
    ])
    const sheet = workbook.Sheets.Sedi
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet!, { header: 1 })
    expect(rows).toContainEqual(["Roma", 3, 12_500.46, 24])
    // «24,0%» in the table: 24, still a number
    expect(cellsOf(sheet).find((cell) => cell.v === 24)?.t).toBe("n")
  })

  it("keeps a formula-like string as a string cell, with no formula (AC28)", async () => {
    const workbook = await toWorkbook([
      {
        name: "Sedi",
        header: [["Dati di", "=1+1"]],
        table: {
          columns: [{ header: "Sede", format: "text" }],
          rows: [["=1+1"], ['"=1+1"'], ["@SUM(1)"], ["+1+1"], ["-1+1"]],
        },
      },
    ])
    const read = XLSX.read(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" })
    )
    const cells = cellsOf(read.Sheets.Sedi)
    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) {
      expect(cell.f).toBeUndefined()
      expect(["s", "str"]).toContain(cell.t)
    }
  })
})

describe("exportAllSummary (AC32)", () => {
  it("counts the charts with data and names the one missing", () => {
    const empty: ChartResult<unknown> = {
      ...branches,
      status: {
        kind: "empty",
        title: "Nessuna pratica liquidata",
        reason: "Nessuna pratica nella finestra.",
        action: null,
      },
    }
    const ready = (id: ChartResult<unknown>["id"], title: string) => ({
      ...branches,
      id,
      title,
    })
    const summary = exportAllSummary([
      ready("financed", "Finanziato totale"),
      ready("average", "Finanziato medio per pratica"),
      empty,
      ready("progress", "Contatti con esito"),
      ready("calls", "Risposte per operatore"),
      ready("appointments", "Tasso di appuntamento"),
    ])
    expect(summary.label).toBe("Esporta tutto 5/6")
    expect(summary.exported.map((r) => r.id)).toEqual([
      "financed",
      "average",
      "progress",
      "calls",
      "appointments",
    ])
    expect(summary.toast).toBe(
      'Esportati 5 grafici su 6: "Finanziato per sede" non ha dati da esportare.'
    )
  })

  it("has no toast when every chart has data", () => {
    expect(exportAllSummary([branches]).toast).toBeNull()
  })
})

describe("exportHeader details (AC30)", () => {
  it("writes the comparison in the three ways", () => {
    const row = (overrides: Partial<ExportContext>) =>
      exportHeader(branches, { ...context, ...overrides }).find(
        ([label]) => label === "Confronto"
      )
    expect(row({})).toEqual([
      "Confronto",
      "Periodo precedente: 1 – 30 set 2026",
    ])
    expect(
      row({
        compare: "last-year",
        comparison: { from: "2025-10-01", to: "2025-10-30" },
      })
    ).toEqual(["Confronto", "Stesso periodo, anno prima: 1 – 30 ott 2025"])
    expect(row({ compare: "none", comparison: null })).toEqual([
      "Confronto",
      "Nessuno",
    ])
  })

  it("writes the grouping only when there is one", () => {
    const grouped = exportHeader(branches, { ...context, group: "week" })
    expect(grouped).toContainEqual(["Raggruppamento", "per settimana"])
    expect(exportHeader(branches, context).map(([l]) => l)).not.toContain(
      "Raggruppamento"
    )
  })

  it("writes «Estratto il» on the clock of Rome", () => {
    // 11:00 UTC on 30 October is 12:00 in Rome (CET, winter time)
    expect(exportHeader(branches, context)).toContainEqual([
      "Estratto il",
      "30/10/2026 12:00",
    ])
    // 22:30 UTC on 15 July is 00:30 of the 16th in Rome (CEST, summer time)
    expect(
      exportHeader(branches, {
        ...context,
        extractedAt: new Date("2026-07-15T22:30:00.000Z"),
      })
    ).toContainEqual(["Estratto il", "16/07/2026 00:30"])
  })

  it("writes a row for each note, the missing delta and the scope", () => {
    const header = exportHeader(
      {
        ...branches,
        notes: ["Le pratiche senza sede sono in una riga a parte."],
        kpi: {
          ...branches.kpi,
          delta: { kind: "none", note: "Nessun dato nel confronto." },
        },
        scope: "Solo i tuoi dati",
      },
      context
    )
    expect(header.filter(([label]) => label === "Nota")).toEqual([
      ["Nota", "Le pratiche senza sede sono in una riga a parte."],
      ["Nota", "Nessun dato nel confronto."],
      ["Nota", "Solo i tuoi dati"],
    ])
  })
})

describe("exportAllSummary with several missing (AC32)", () => {
  it("lists the charts left out with commas and «e»", () => {
    const empty = (id: ChartResult<unknown>["id"], title: string) => ({
      ...branches,
      id,
      title,
      status: {
        kind: "empty" as const,
        title: "Nessun dato",
        reason: "",
        action: null,
      },
    })
    const ready = { ...branches, id: "financed" as const, title: "Totale" }
    expect(
      exportAllSummary([ready, empty("branches", "A"), empty("calls", "B")])
        .toast
    ).toBe('Esportato 1 grafico su 3: "A" e "B" non hanno dati da esportare.')
    expect(
      exportAllSummary([
        ready,
        ready,
        empty("branches", "A"),
        empty("calls", "B"),
        empty("progress", "C"),
      ]).toast
    ).toBe(
      'Esportati 2 grafici su 5: "A", "B" e "C" non hanno dati da esportare.'
    )
  })

  it("exports a number-only chart", () => {
    const kpiOnly: ChartResult<unknown> = {
      ...branches,
      status: { kind: "kpiOnly", title: "t", reason: "r", action: null },
    }
    expect(exportAllSummary([kpiOnly]).exported).toHaveLength(1)
  })
})

describe("downloadBlob (AC32)", () => {
  // Saved to be put back: jsdom has no `createObjectURL`, the tests stub it
  /* eslint-disable @typescript-eslint/unbound-method */
  const original = {
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
  }
  /* eslint-enable @typescript-eslint/unbound-method */

  afterEach(() => {
    URL.createObjectURL = original.create
    URL.revokeObjectURL = original.revoke
    vi.restoreAllMocks()
  })

  it("clicks a link named after the file and returns true", () => {
    URL.createObjectURL = vi.fn(() => "blob:file")
    URL.revokeObjectURL = vi.fn()
    const downloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloads.push(this.download)
    })
    expect(downloadBlob(new Blob(["a"]), "mito_analisi.xlsx")).toBe(true)
    expect(downloads).toEqual(["mito_analisi.xlsx"])
  })

  it("returns false instead of throwing when the browser refuses", () => {
    URL.createObjectURL = vi.fn(() => {
      throw new Error("refused")
    })
    expect(downloadBlob(new Blob(["a"]), "x.xlsx")).toBe(false)
  })
})

describe("a name that looks like a formula", () => {
  it("stays text in the CSV and in the clipboard", () => {
    const table = {
      columns: [{ header: "Sede", format: "text" as const }],
      rows: [['=HYPERLINK("x")'], ["-Roma"]],
    }
    expect(toCsv([], table)).toContain("'=HYPERLINK")
    expect(toTsv([], table)).toContain("'-Roma")
  })

  it("stays text in the header rows too", () => {
    const table = {
      columns: [{ header: "Sede", format: "text" as const }],
      rows: [["Roma"]],
    }
    const header = [["Dati di", "=cmd|' /C calc'!A0"]]
    expect(toCsv(header, table)).toContain("Dati di;'=cmd")
    expect(toTsv(header, table)).toContain("Dati di\t'=cmd")
  })
})

describe.each(["=", "+", "-", "@", "\t", "\r"])(
  "a text starting with %j (AC27, AC29)",
  (trigger) => {
    const value = `${trigger}1+1`
    const table = {
      columns: [{ header: "Sede", format: "text" as const }],
      rows: [[value]],
    }
    const header = [["Dati di", value]]
    const isGuarded = (cell: string) => !/^(?:[\t\r]|\s*[=+\-@])/.test(cell)

    it("is not a formula in a cell or a header row of the CSV", () => {
      const lines = toCsv(header, table).slice(1).split("\r\n")
      // A text with a CR is quoted, so a row can span lines: read the values back
      const cells = lines
        .join("\n")
        .split(/[;\n]/)
        .map((cell) => cell.replace(/^"|"$/g, ""))
      for (const cell of cells.filter((c) => c.includes("1+1"))) {
        expect(isGuarded(cell)).toBe(true)
      }
      expect(cells.filter((c) => c.includes("1+1"))).toHaveLength(2)
    })

    it("is not a formula in a cell or a header row of the clipboard", () => {
      const cells = toTsv(header, table)
        .split("\n")
        .flatMap((line) => line.split("\t"))
      const guarded = cells.filter((c) => c.includes("1+1"))
      expect(guarded).toHaveLength(2)
      for (const cell of guarded) expect(isGuarded(cell)).toBe(true)
    })
  }
)

describe("a name with quotes in the clipboard (AC29)", () => {
  it('is quoted, so a pasted «"=1+1"» keeps its quotes and runs nothing', () => {
    const tsv = toTsv([], {
      columns: [{ header: "Sede", format: "text" }],
      rows: [['"=1+1"']],
    })
    // The value is read back as text, quotes included, not as a formula
    const read = XLSX.read(tsv, { type: "string", FS: "\t" })
    const cells = cellsOf(read.Sheets[read.SheetNames[0]!])
    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) expect(cell.f).toBeUndefined()
    const found = cells.find((cell) => String(cell.v).includes("1+1"))
    expect(found?.v).toBe('"=1+1"')
  })

  it("doubles the inner quotes like the CSV", () => {
    const tsv = toTsv([], {
      columns: [{ header: "Sede", format: "text" }],
      rows: [['Roma "centro"']],
    })
    expect(tsv.split("\n")).toContain('"Roma ""centro"""')
  })

  it("turns a tab, a line break or a lone CR into a space, then guards the text", () => {
    const tsv = toTsv([], {
      columns: [{ header: "Sede", format: "text" }],
      rows: [["a\n=b"], ["a\r=b"], ["\t=b"]],
    })
    const lines = tsv.split("\n")
    expect(lines.filter((line) => line === "a =b")).toHaveLength(2)
    expect(lines).toContain("' =b")
  })
})

describe("a name that would break out of its CSV cell", () => {
  const hostile = ['"=1+1"', "x\r\n=1+1", "x\r=1+1", "x\n=1+1", 'x";"=1+1']

  it("stays one text cell, read back as it was, with no formula (AC27)", () => {
    const csv = toCsv([], {
      columns: [{ header: "Sede", format: "text" }],
      rows: hostile.map((name) => [name]),
    })
    const read = XLSX.read(csv.slice(1), { type: "string", FS: ";" })
    const cells = cellsOf(read.Sheets[read.SheetNames[0]!])
    for (const cell of cells) expect(cell.f).toBeUndefined()
    // The column name and one cell per name: no row split, no cell split
    expect(cells.map((cell) => cell.v)).toEqual(["Sede", ...hostile])
  })
})

describe("a negative number", () => {
  it("stays a number in the CSV", () => {
    const csv = toCsv([], {
      columns: [{ header: "Variazione", format: "count" }],
      rows: [[-5]],
    })
    expect(csv.split("\r\n")).toContain("-5")
  })
})

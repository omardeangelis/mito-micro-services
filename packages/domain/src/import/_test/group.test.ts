import { describe, expect, test } from "vitest"
import { type Cells, classifyRows } from "../classify"
import { type ImportFormat } from "../formats"
import { groupRows, lookupKeys } from "../group"
import { standardCells, waveCells } from "./cells"

// How the rows of a file become customers, practices and links (AC38, AC37)

const NOW = new Date("2025-01-15T11:00:00.000Z")
const FILE_NAME = "0125_import.xlsx"

const group = (format: ImportFormat, ...rows: Cells[]) =>
  groupRows(
    classifyRows(
      format,
      rows.map((cells, index) => ({ row: index + 2, cells })),
      NOW,
      FILE_NAME
    )
  )
const wave = (...rows: Cells[]) =>
  group("wave", ...rows.map((row) => waveCells(row)))

describe("clienti del file (AC38)", () => {
  test("tre righe con lo stesso CF e lo stesso codice cliente, la seconda con l'email vuota e la terza con un'email diversa, danno un cliente con l'email della terza", () => {
    const { customers } = wave(
      { "n° Pratica": "1", Email: "primo@example.com" },
      { "n° Pratica": "2", Email: null },
      { "n° Pratica": "3", Email: "terzo@example.com" }
    )

    expect(customers).toHaveLength(1)
    expect(customers[0]).toMatchObject({
      customer: { email: "terzo@example.com" },
      rows: [2, 3, 4],
    })
  })

  test("un valore vuoto non cancella quello di una riga prima", () => {
    const { customers } = wave(
      { Email: "primo@example.com", Occupazione: "IMPIEGATO" },
      { Email: null, Occupazione: "OPERAIO" }
    )

    expect(customers[0]?.customer).toMatchObject({
      email: "primo@example.com",
      occupazione: "Operaio",
    })
  })

  test("stesso CF e codici cliente diversi danno due clienti", () => {
    const { customers } = wave({ "Codice NDG": "1" }, { "Codice NDG": "2" })

    expect(customers.map((c) => c.customer.tempID)).toEqual(["1", "2"])
  })

  test("senza CF, stessa partita IVA e stesso codice danno un cliente", () => {
    const { customers } = group(
      "standard",
      standardCells({ CODICE_FISCALE_CLI: "01234567890", PRATICA: "1" }),
      standardCells({ CODICE_FISCALE_CLI: "01234567890", PRATICA: "2" })
    )

    expect(customers).toHaveLength(1)
    expect(customers[0]?.customer).toMatchObject({
      fiscalCode: null,
      vatCode: "01234567890",
    })
  })

  test("stesso codice cliente con CF diversi dà due clienti", () => {
    const { customers } = wave(
      { "Codice Fiscale": "RSSMRA80A01H501U" },
      { "Codice Fiscale": "VRDLGU75B02F205X" }
    )

    expect(customers).toHaveLength(2)
  })
})

describe("pratiche del file (AC38)", () => {
  test("stesso ID pratica su tre righe dà una pratica con l'ultimo valore non vuoto di ogni campo", () => {
    const { practices } = wave(
      { Region: "LAZIO", "Modalità di Pagamento": "SDD" },
      { Region: null, "Modalità di Pagamento": "RID" },
      { Region: "LOMBARDIA", "Modalità di Pagamento": null }
    )

    expect(practices).toHaveLength(1)
    expect(practices[0]).toMatchObject({
      practice: {
        praticaId: "900001",
        region: "LOMBARDIA",
        paymentMethod: "RID",
      },
      rows: [2, 3, 4],
    })
  })
})

describe("legami (AC37)", () => {
  test("un cliente con pratiche in punti diversi del file ha un legame per pratica", () => {
    const { links } = wave(
      { "Codice NDG": "A", "n° Pratica": "1" },
      {
        "Codice NDG": "B",
        "Codice Fiscale": "VRDLGU75B02F205X",
        "n° Pratica": "2",
        Garante: "SI",
      },
      { "Codice NDG": "A", "n° Pratica": "3" }
    )

    expect(links).toEqual([
      { customer: 0, praticaId: "1", role: "Intestatario" },
      { customer: 1, praticaId: "2", role: "Garante" },
      { customer: 0, praticaId: "3", role: "Intestatario" },
    ])
  })

  test("lo stesso cliente e la stessa pratica su due righe: un legame, col ruolo della prima", () => {
    const { links } = wave({ Garante: "NO" }, { Garante: "SI" })

    expect(links).toEqual([
      { customer: 0, praticaId: "900001", role: "Intestatario" },
    ])
  })
})

describe("righe", () => {
  test("ogni riga del file è importabile, solo cliente o scartata, e le vuote non contano (AC8)", () => {
    const blank = Object.fromEntries(
      Object.keys(waveCells()).map((column) => [column, null])
    )
    const grouped = group(
      "wave",
      waveCells(),
      waveCells({ "Importo Rata": null }),
      blank,
      waveCells({ "Codice NDG": null })
    )

    expect(grouped.rows).toEqual([
      { row: 2, kind: "importable", customer: 0, praticaId: "900001" },
      { row: 3, kind: "customerOnly", customer: 0 },
    ])
    expect(grouped.discarded).toEqual([
      { row: 5, reasons: ['Manca il dato "Codice NDG"'] },
    ])
    expect(grouped.practices).toHaveLength(1)
    expect(grouped.links).toHaveLength(1)
  })
})

describe("chiavi da cercare nel CRM", () => {
  test("codici fiscali, partite IVA, codici cliente e ID pratica, senza doppioni e in ordine", () => {
    const keys = lookupKeys(
      group(
        "standard",
        standardCells({ CLIENTE: "9", PRATICA: "B" }),
        standardCells({
          CLIENTE: "1",
          CODICE_FISCALE_CLI: "01234567890",
          PRATICA: "A",
        }),
        standardCells({ CLIENTE: "9", PRATICA: "A" }),
        standardCells({ CLIENTE: "5", CODICE_FISCALE_CLI: null })
      )
    )

    expect(keys).toEqual({
      fiscalCodes: ["RSSMRA80A01H501U"],
      vatCodes: ["01234567890"],
      customerCodes: ["1", "9"],
      praticaIds: ["A", "B"],
    })
  })
})

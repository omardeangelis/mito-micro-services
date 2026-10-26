// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { processFile } from "@/lib/workers/import/service/process"
import { standardImportFileKeys } from "@/app/api/import/_constants"
import { EmptyHeadersImportError } from "@/lib/types/errors"
import {
  standardFile as standardBytes,
  standardRow,
  waveFile as waveBytes,
  waveRow,
  workbook,
  type Row,
} from "@/lib/import/_test/workbooks"

// Characterization of today's import (spec import-pratiche, T1): what
// `processFile` does with the converted rows, defects included: validation,
// rows with the customer only, errors, merge within the file. The values of
// one row are in src/lib/import/_test/characterization.test.ts (moved in T4).
// The rewrite must keep these results until a separate PR fixes the defects
// (OQ2).

// 12:00 in Rome
const NOW = new Date("2025-01-15T11:00:00.000Z")

const asFile = (bytes: ArrayBuffer) => new File([bytes], "import.xlsx")
const waveFile = (...rows: Row[]) => asFile(waveBytes(...rows))
const standardFile = (...rows: Row[]) => asFile(standardBytes(...rows))

const convert = async (file: File, fileName = "0125_import.xlsx") => {
  const result = await processFile(file, fileName)
  if (!result.created || !result.errors)
    throw new Error("The file was not converted")
  return {
    customers: result.created.customerToCreate,
    practices: result.created.practicesToCreate,
    links: result.created.customerToPraticaToCreate,
    errors: result.errors.practicesWithErrors,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
  // The conversion logs its counts
  vi.spyOn(console, "log").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("file Wave", () => {
  test("una riga senza i dati della pratica ma con CF e codice NDG crea solo il cliente, senza errori", async () => {
    const { customers, practices, links, errors } = await convert(
      waveFile(waveRow({ "Importo Rata": null }))
    )

    expect(customers).toHaveLength(1)
    expect(practices).toEqual([])
    expect(links).toEqual([])
    expect(errors).toEqual([])
  })

  test("una riga senza i dati della pratica e senza CF finisce tra gli errori, con il motivo", async () => {
    const { customers, practices, errors } = await convert(
      waveFile(
        waveRow(),
        waveRow({
          "n° Pratica": "900002",
          "Codice NDG": "100002",
          "Codice Fiscale": null,
          "Importo Rata": null,
        })
      )
    )

    expect(customers).toHaveLength(1)
    expect(practices).toHaveLength(1)
    expect(errors).toHaveLength(1)
    const [index, row, issues] = errors[0]!
    expect(index).toBe(1)
    expect(row).toMatchObject({ "n° Pratica": "900002" })
    expect(issues.map((issue) => issue.message)).toEqual(["Manca Importo Rata"])
  })

  test("una riga senza 'Garante' né 'Cliente Coobbligato' è letta come Standard e finisce tra gli errori", async () => {
    const { customers, practices, errors } = await convert(
      waveFile(
        waveRow(),
        waveRow({
          "n° Pratica": "900002",
          Garante: null,
          "Cliente Coobbligato": null,
        })
      )
    )

    expect(customers).toHaveLength(1)
    expect(practices).toHaveLength(1)
    expect(errors).toHaveLength(1)
    expect(errors[0]![2].map((issue) => issue.message)).toEqual([
      "Manca ID Pratica",
      "Manca Importo Finanziato",
      "Manca Codice Identificativo Cliente o Codice NDG",
      "Manca Importo Richiesto",
      "Manca Importo Rata",
      "Manca Numero Rate",
      "Manca Data Erogazione o Data Liquidazione",
    ])
  })

  test("righe della stessa pratica e dello stesso cliente nel file: un cliente per CF e codice NDG, una pratica per numero, un legame per coppia con il ruolo", async () => {
    const { customers, practices, links } = await convert(
      waveFile(
        waveRow(),
        waveRow({
          "Codice NDG": "100002",
          "Codice Fiscale": "VRDLGU70A01H501X",
          Nome: "LUIGI",
          Cognome: "VERDI",
          Garante: "SI",
          "Descrizione Stato Pratica": "CHIUSA",
        }),
        waveRow({
          "n° Pratica": "900002",
          Email: "nuova@example.com",
          "Cliente Coobbligato": "si",
        }),
        // Same fiscal code, another NDG code: another customer
        waveRow({ "n° Pratica": "900003", "Codice NDG": "100003" })
      )
    )

    expect(customers.map((c) => [c.tempID, c.fiscalCode, c.email])).toEqual([
      ["100001", "RSSMRA80A01H501U", "nuova@example.com"],
      ["100002", "VRDLGU70A01H501X", "mario.rossi@example.com"],
      ["100003", "RSSMRA80A01H501U", "mario.rossi@example.com"],
    ])
    // The last row of a practice overwrites the fields it has
    expect(practices.map((p) => [p.praticaId, p.state])).toEqual([
      ["900001", "Chiusa"],
      ["900002", "Liquidata"],
      ["900003", "Liquidata"],
    ])
    const [mario, luigi, mario2] = customers
    expect(links).toEqual([
      {
        customerId: mario!.id,
        praticaId: "900001",
        customerRole: "Intestatario",
        _internal_sort: 0,
      },
      {
        customerId: luigi!.id,
        praticaId: "900001",
        customerRole: "Garante",
        _internal_sort: 1,
      },
      {
        customerId: mario!.id,
        praticaId: "900002",
        customerRole: "Coobbligato",
        _internal_sort: 2,
      },
      {
        customerId: mario2!.id,
        praticaId: "900003",
        customerRole: "Intestatario",
        _internal_sort: 3,
      },
    ])
  })

  test("se tutte le righe hanno errori la conversione si ferma con l'errore 'all'", async () => {
    const result = processFile(
      waveFile(waveRow({ "Codice Fiscale": null, "Importo Rata": null })),
      "0125_import.xlsx"
    )

    await expect(result).rejects.toBeInstanceOf(EmptyHeadersImportError)
    await expect(result).rejects.toMatchObject({ code: "all" })
  })
})

describe("file Standard", () => {
  test.each([
    { format: "testo illeggibile", value: "non so" },
    { format: "testo GG/MM/AAAA", value: "15/01/2024" },
  ])(
    "'DATA_LIQUIDAZIONE' come $format: la pratica sparisce, il cliente resta, nessun errore",
    async ({ value }) => {
      const { customers, practices, links, errors } = await convert(
        standardFile(standardRow({ DATA_LIQUIDAZIONE: value }))
      )

      // Defect: the rates paid come out NaN and the practice fails validation
      expect(customers).toHaveLength(1)
      expect(practices).toEqual([])
      expect(links).toEqual([])
      expect(errors).toEqual([])
    }
  )

  test("una riga senza CF né P.IVA sparisce: nessun cliente, nessuna pratica, nessun errore", async () => {
    const { customers, practices, links, errors } = await convert(
      standardFile(standardRow({ CODICE_FISCALE_CLI: null }))
    )

    expect(customers).toEqual([])
    expect(practices).toEqual([])
    expect(links).toEqual([])
    expect(errors).toEqual([])
  })

  test("righe della stessa pratica: una pratica, un legame per cliente, tutti Intestatario", async () => {
    const { customers, practices, links } = await convert(
      standardFile(
        standardRow(),
        standardRow({
          CLIENTE: "5002",
          DES_CLIENTE: "VERDI LUIGI",
          CODICE_FISCALE_CLI: "VRDLGU70A01H501X",
        })
      )
    )

    expect(customers).toHaveLength(2)
    expect(practices).toHaveLength(1)
    expect(links.map((link) => link.customerRole)).toEqual([
      "Intestatario",
      "Intestatario",
    ])
  })

  test("una riga senza i dati obbligatori finisce tra gli errori, con i motivi", async () => {
    const { errors } = await convert(
      standardFile(
        standardRow(),
        standardRow({
          PRATICA: "000124",
          IMPORTO_RATA: null,
          NUMERO_RATE: null,
        })
      )
    )

    expect(errors).toHaveLength(1)
    expect(errors[0]![0]).toBe(1)
    expect(errors[0]![2].map((issue) => issue.message)).toEqual([
      "Manca Importo Rata",
      "Manca Numero Rate",
    ])
  })

  test("se tutte le righe hanno errori la conversione restituisce l'errore 'all'", async () => {
    const result = await processFile(
      standardFile(standardRow({ IMPORTO_RATA: null })),
      "0125_import.xlsx"
    )

    expect("error" in result && result.error).toBeInstanceOf(
      EmptyHeadersImportError
    )
    expect(result).toMatchObject({ error: { code: "all" } })
  })

  test("se mancano colonne la conversione restituisce l'errore 'headers'", async () => {
    const result = await processFile(
      asFile(workbook(standardImportFileKeys.slice(1), [standardRow()])),
      "0125_import.xlsx"
    )

    expect(result).toMatchObject({ error: { code: "headers" } })
  })
})

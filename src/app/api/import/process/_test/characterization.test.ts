// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import * as XLSX from "xlsx"
import SparkMD5 from "spark-md5"
import { processFile } from "@/lib/workers/import/service/process"
import {
  standardImportFileKeys,
  waveFileKeys,
} from "@/app/api/import/_constants"
import { EmptyHeadersImportError } from "@/lib/types/errors"

// Characterization of today's conversion (spec import-pratiche, T1): what
// `processFile` turns a file into, defects included. The rewrite must keep
// these results until a separate PR fixes the defects (OQ2).
//
// The browser runs `processFile` in Europe/Rome; vitest runs in UTC
// (vitest.config.ts) and a test file can't change its time zone, so the
// dates are asserted in local time: `new Date(2024, 1, 15)` is the local
// midnight the code builds, Rome's in the browser.

const NOW = new Date(2025, 0, 15, 12, 0, 0)

type Value = string | number | null | XLSX.CellObject
type Row = Record<string, Value>

// A date cell as Excel saves it: a serial number with a date format, which
// the CSV shows as "m/d/yy"
const dateCell = (year: number, month: number, day: number) =>
  ({
    t: "n",
    v: (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000,
    z: "m/d/yy",
  }) satisfies XLSX.CellObject

const numberCell = (value: number, format: string) =>
  ({ t: "n", v: value, z: format }) satisfies XLSX.CellObject

const workbook = (headers: readonly string[], rows: Row[]) => {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...headers],
    ...rows.map((row) => headers.map((header) => row[header] ?? null)),
  ])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, "Foglio1")
  const bytes = XLSX.write(book, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer
  return new File([bytes], "import.xlsx")
}

const waveFile = (...rows: Row[]) => workbook(waveFileKeys, rows)
const standardFile = (...rows: Row[]) => workbook(standardImportFileKeys, rows)

const waveRow = (row: Row = {}): Row => ({
  "n° Pratica": "900001",
  "Codice NDG": "100001",
  "Codice Fiscale": "RSSMRA80A01H501U",
  Nome: "MARIO",
  Cognome: "ROSSI",
  "Data di Nascita": dateCell(1980, 1, 1),
  Età: 45,
  "CAP Residenza": "00184",
  "Indirizzo di residenza": "VIA ROMA 1",
  "Comune di residenza": "ROMA",
  "Provincia di residenza": "RM",
  "Telefono Definitivo": 3331234567,
  Email: "Mario.Rossi@Example.COM",
  "Descrizione PdV": "Roma - Eur",
  Region: "LAZIO",
  "Data Erogazione": dateCell(2024, 1, 15),
  "Descrizione Stato Pratica": "40 Erogata",
  "Importo Richiesto": 2000,
  "Importo Finanziato": 2200,
  "N° rate pratica": 24,
  "Importo Rata": 100,
  "Tasso Pratica": 7.5,
  "Modalità di Pagamento": "SDD",
  "Codice Prodotto Pratica": 1,
  Garante: "NO",
  "Cliente Coobbligato": "NO",
  Reddito: 1500,
  Occupazione: "IMPIEGATO",
  "Ambito lavorativo (ex 'Dip Pub')": "PRIVATO",
  "Tipo Contratto": "TEMPO INDETERMINATO",
  ...row,
})

const standardRow = (row: Row = {}): Row => ({
  PRATICA: "000123",
  REGIONE: "LAZIO",
  PUNTO_VENDITA: 10,
  DES_PUNTO_VENDITA: "ROMA EUR",
  CONVENZIONATO: 20,
  DES_CONVENZIONATO: "CONCESSIONARIA SRL",
  SUBAGENTE: 30,
  DES_SUBAGENTE: "AGENZIA - Roma Eur",
  AGENTE: 40,
  DES_AGENTE: "AGENTE SPA",
  SITUAZIONE: "LIQUIDATA",
  CLIENTE: "5001",
  DES_CLIENTE: "ROSSI MARIO",
  CODICE_FISCALE_CLI: "RSSMRA80A01H501U",
  PRODOTTO: 24,
  TABELLA_FINANZ: "T1",
  NUMERO_RATE: 24,
  IMPORTO_RATA: 100,
  IMPORTO_FINANZIATO: 2200,
  IMPORTO_NETTO_EROGATO: 2000,
  DATA_CARICAMENTO: dateCell(2024, 1, 10),
  DATA_LIQUIDAZIONE: dateCell(2024, 1, 15),
  MOD_PAGAMENTO: "SDD",
  INDIRIZZO_CLI: "VIA ROMA 1",
  CAP_CLIENTE: "00184",
  LOCALITA_CLI: "ROMA",
  PROVINCIA_CLI: "RM",
  ...row,
})

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

const convertOne = async (file: File) => {
  const { customers, practices } = await convert(file)
  expect(customers).toHaveLength(1)
  expect(practices).toHaveLength(1)
  return { customer: customers[0]!, practice: practices[0]! }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
  // The conversion logs every column and every count
  vi.spyOn(console, "log").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("file Wave", () => {
  test("una riga Wave con 'Data Erogazione' 15/01/2024 dà la data di liquidazione salvata 15/02/2024 alla mezzanotte locale e le rate pagate calcolate da quella data", async () => {
    const { practice } = await convertOne(waveFile(waveRow()))

    // Defect (OQ2): the conversion adds one month to the date it stores
    expect(practice.dataLiquidazione).toEqual(new Date(2024, 1, 15))
    // From 15/02/2024 to today (15/01/2025 12:00): 336 days, 30 per rate
    expect(practice.ratePagate).toBe(11)
    expect(practice.debitoResiduo).toBe("1300.00")
  })

  test("pratica: importi, stato, prodotto, sede e date", async () => {
    const { practice } = await convertOne(waveFile(waveRow()))

    expect(practice).toEqual({
      praticaId: "900001",
      region: "LAZIO",
      desPuntoVendita: "roma",
      desConvenzionato: null,
      paymentMethod: "SDD",
      isWave: true,
      operatorId: null,
      fileName: "0125_import.xlsx",
      dataLiquidazione: new Date(2024, 1, 15),
      // Defect (OQ2): no 'Data Estinzione' in the file gives today
      dataEstinzione: NOW,
      rateTotali: 24,
      ratePagate: 11,
      debitoResiduo: "1300.00",
      importoRata: "100.00",
      // Rates times the rate amount, not a column of the file
      importoErogato: "2400.00",
      importoRichiesto: "2000.00",
      importoFinanziato: "2200.00",
      tassoPratica: "7.50",
      productId: "01",
      state: "Liquidata",
      _internal_sort: 0,
    })
  })

  test("cliente: nome in maiuscolo/minuscolo, email in minuscolo, sede, codice NDG", async () => {
    const { customer } = await convertOne(
      waveFile(
        waveRow({
          Nome: "maria GRAZIA",
          Cognome: "DE LUCA",
          Email: "Maria.DeLuca@Example.COM",
        })
      )
    )

    // A new nanoid, which the hash ties to the customer code
    expect(customer.id).toMatch(/^[\w-]{21}$/)
    expect(customer).toEqual({
      id: customer.id,
      uniqueHash: SparkMD5.hash(`100001-${customer.id}`),
      tempID: "100001",
      fullName: "Maria Grazia De Luca",
      name: "Maria Grazia",
      surname: "De Luca",
      email: "maria.deluca@example.com",
      birthdayDate: new Date(1980, 0, 1),
      age: 45,
      phoneNumber: "3331234567",
      address: "Via Roma 1",
      // Defect: the CAP is read as a number and loses its leading zeros
      cap: "184",
      comune: "Roma",
      provincia: "RM",
      fileName: "0125_import.xlsx",
      reddito: "1500.00",
      occupazione: "Impiegato",
      ambitoLavorativo: "Privato",
      tipoContratto: "Tempo Indeterminato",
      sede: "roma",
      source: "wave",
      fiscalCode: "RSSMRA80A01H501U",
      vatCode: null,
      _internal_sort: 0,
    })
  })

  test("una rata già scaduta per ogni 30 giorni, fino al numero di rate", async () => {
    const { practice } = await convertOne(
      waveFile(
        waveRow({
          "Data Erogazione": dateCell(2020, 1, 15),
          "Descrizione Stato Pratica": "STATO SCONOSCIUTO",
        })
      )
    )

    expect(practice.ratePagate).toBe(24)
    expect(practice.debitoResiduo).toBe("0.00")
    expect(practice.state).toBe("Chiusa")
  })

  test("'Data Estinzione' presente nel file", async () => {
    const { practice } = await convertOne(
      waveFile(waveRow({ "Data Estinzione": dateCell(2024, 6, 30) }))
    )

    expect(practice.dataEstinzione).toEqual(new Date(2024, 5, 30))
  })

  test.each([
    {
      format: "data AAAAMMGG",
      value: 20240115,
      stored: new Date(2024, 1, 15),
      paid: 11,
    },
    {
      // Defect (OQ2): a serial without a date format lands one day later
      format: "numero seriale di Excel senza formato data",
      value: 45306,
      stored: new Date(2024, 1, 16),
      paid: 11,
    },
    {
      // Defect: the day comes first in Italy, the code reads it as the month
      format: "testo GG/MM/AAAA",
      value: "15/01/2024",
      stored: new Date(2025, 3, 1),
      paid: 2,
    },
    {
      // Defect (OQ2): an unreadable date gives today, one month later
      format: "testo illeggibile",
      value: "non so",
      stored: new Date(2025, 1, 15, 12, 0, 0),
      paid: 1,
    },
  ])("'Data Erogazione' come $format", async ({ value, stored, paid }) => {
    const { practice } = await convertOne(
      waveFile(waveRow({ "Data Erogazione": value }))
    )

    expect(practice.dataLiquidazione).toEqual(stored)
    expect(practice.ratePagate).toBe(paid)
  })

  test.each([
    { code: 24, productId: "24" },
    { code: 5, productId: "05" },
    { code: null, productId: "01" },
  ])("codice prodotto $code → $productId", async ({ code, productId }) => {
    const { practice } = await convertOne(
      waveFile(waveRow({ "Codice Prodotto Pratica": code }))
    )

    expect(practice.productId).toBe(productId)
  })

  test.each([
    { value: "01234567890", fiscalCode: null, vatCode: "01234567890" },
    // Defect: a fiscal code in lower case is saved as a VAT number
    {
      value: "rssmra80a01h501u",
      fiscalCode: null,
      vatCode: "rssmra80a01h501u",
    },
  ])(
    "'Codice Fiscale' $value → CF $fiscalCode, P.IVA $vatCode",
    async ({ value, fiscalCode, vatCode }) => {
      const { customer } = await convertOne(
        waveFile(waveRow({ "Codice Fiscale": value }))
      )

      expect(customer.fiscalCode).toBe(fiscalCode)
      expect(customer.vatCode).toBe(vatCode)
    }
  )

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
  test("pratica: le rate pagate partono da un mese dopo la liquidazione, la data salvata no", async () => {
    const { practice } = await convertOne(standardFile(standardRow()))

    expect(practice).toEqual({
      praticaId: "000123",
      region: "LAZIO",
      desPuntoVendita: "romaeur",
      desConvenzionato: "CONCESSIONARIA SRL",
      subagente: "30",
      state: "Liquidata",
      dataLiquidazione: new Date(2024, 0, 15),
      dataEstinzione: null,
      rateTotali: 24,
      fileName: "0125_import.xlsx",
      ratePagate: 11,
      importoRata: "100.00",
      importoFinanziato: "2200.00",
      importoErogato: "2000.00",
      debitoResiduo: "1300.00",
      paymentMethod: "SDD",
      tassoPratica: null,
      importoRichiesto: null,
      isWave: false,
      operatorId: null,
      _internal_sort: 0,
      productId: "24",
    })
  })

  test("cliente: cognome prima del nome, nessun maiuscolo/minuscolo, sede dall'ultima parte del subagente", async () => {
    const { customer } = await convertOne(standardFile(standardRow()))

    // A new nanoid, which the hash ties to the customer code
    expect(customer.id).toMatch(/^[\w-]{21}$/)
    expect(customer).toEqual({
      id: customer.id,
      fullName: "ROSSI MARIO",
      name: "MARIO",
      sede: "romaeur",
      surname: "ROSSI",
      fiscalCode: "RSSMRA80A01H501U",
      vatCode: null,
      email: null,
      phoneNumber: null,
      tempID: "5001",
      fileName: "0125_import.xlsx",
      uniqueHash: SparkMD5.hash(`5001-${customer.id}`),
      // Defect: the CAP is read as a number and loses its leading zeros
      cap: "184",
      comune: "ROMA",
      provincia: "RM",
      reddito: null,
      occupazione: null,
      ambitoLavorativo: null,
      tipoContratto: null,
      address: "VIA ROMA 1",
      source: "internal",
      _internal_sort: 0,
    })
  })

  test.each([
    { fullName: "DE LUCA MARIO", surname: "DE LUCA", name: "MARIO" },
    { fullName: "ROSSI", surname: "ROSSI", name: undefined },
  ])(
    "'DES_CLIENTE' $fullName → cognome $surname, nome $name",
    async ({ fullName, surname, name }) => {
      const { customer } = await convertOne(
        standardFile(standardRow({ DES_CLIENTE: fullName }))
      )

      expect(customer.surname).toBe(surname)
      expect(customer.name).toBe(name)
    }
  )

  test.each([
    { situazione: "40 Erogata", state: "Liquidata" },
    { situazione: "Perfezionata", state: "Liquidata" },
    { situazione: "LIQUIDATA", state: "Liquidata" },
    { situazione: "RIFIUTATA", state: "Rifiutata" },
    { situazione: "CHIUSA", state: "Chiusa" },
    { situazione: "ESTINTA ANTICIP.", state: "Estinta anticipata" },
    { situazione: "05 Rinunciata", state: "Rinunciata" },
    { situazione: "30 Rinunciata", state: "Rinunciata" },
    { situazione: "45 Stornata/Revocata", state: "Stornata" },
    { situazione: "ALTRO", state: "Liquidata" },
    { situazione: null, state: "Liquidata" },
  ])("'SITUAZIONE' $situazione → $state", async ({ situazione, state }) => {
    const { practice } = await convertOne(
      standardFile(standardRow({ SITUAZIONE: situazione }))
    )

    expect(practice.state).toBe(state)
  })

  test("tutte le rate pagate: debito residuo '0' e stato Chiusa se 'SITUAZIONE' non è nota", async () => {
    const { practice } = await convertOne(
      standardFile(
        standardRow({
          DATA_LIQUIDAZIONE: dateCell(2020, 1, 15),
          SITUAZIONE: "ALTRO",
        })
      )
    )

    expect(practice.ratePagate).toBe(24)
    expect(practice.debitoResiduo).toBe("0")
    expect(practice.state).toBe("Chiusa")
  })

  test.each([
    {
      // Defect: the rates are counted from 1970, so they are all paid
      format: "data AAAAMMGG",
      value: 20240115,
      stored: new Date(2024, 0, 15),
    },
    {
      // Defect: as above, and the stored date lands one day later (OQ2)
      format: "numero seriale di Excel senza formato data",
      value: 45306,
      stored: new Date(2024, 0, 16),
    },
  ])(
    "'DATA_LIQUIDAZIONE' come $format: rate tutte pagate",
    async ({ value, stored }) => {
      const { practice } = await convertOne(
        standardFile(
          standardRow({ DATA_LIQUIDAZIONE: value, SITUAZIONE: null })
        )
      )

      expect(practice.dataLiquidazione).toEqual(stored)
      expect(practice.ratePagate).toBe(24)
      expect(practice.debitoResiduo).toBe("0")
      expect(practice.state).toBe("Chiusa")
    }
  )

  test.each([
    { format: "numero", value: 1234.5, amount: "1234.50" },
    {
      format: "numero con separatore delle migliaia",
      value: numberCell(1234.5, "#,##0.00"),
      amount: "1234.50",
    },
    // Defect: amounts typed as Italian text lose their decimal comma
    { format: "testo 1.234,50", value: "1.234,50", amount: "1.23" },
    { format: "testo 1234,50", value: "1234,50", amount: "123450.00" },
  ])(
    "'IMPORTO_FINANZIATO' come $format → $amount",
    async ({ value, amount }) => {
      const { practice } = await convertOne(
        standardFile(standardRow({ IMPORTO_FINANZIATO: value }))
      )

      expect(practice.importoFinanziato).toBe(amount)
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
      workbook(standardImportFileKeys.slice(1), [standardRow()]),
      "0125_import.xlsx"
    )

    expect(result).toMatchObject({ error: { code: "headers" } })
  })
})

describe("nome del file", () => {
  test("i trattini diventano trattini bassi e, senza MMAA all'inizio, si aggiunge il mese di oggi", async () => {
    const { customers, practices } = await convert(
      standardFile(standardRow()),
      "report-gennaio.xlsx"
    )

    expect(customers[0]!.fileName).toBe("0125_report_gennaio.xlsx")
    expect(practices[0]!.fileName).toBe("0125_report_gennaio.xlsx")
  })

  test("con MMAA all'inizio il nome resta, a parte i trattini", async () => {
    const { practices } = await convert(
      standardFile(standardRow()),
      "0924_report-settembre.xlsx"
    )

    expect(practices[0]!.fileName).toBe("0924_report_settembre.xlsx")
  })
})

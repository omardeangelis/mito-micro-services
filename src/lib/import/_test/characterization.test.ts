// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  standardCustomer,
  standardPractice,
} from "@mito/domain/import/convert/standard"
import { waveCustomer, wavePractice } from "@mito/domain/import/convert/wave"
import { parseFileName } from "@mito/domain/import/convert/fileName"
import {
  type StandardRow,
  type WaveRow,
} from "@mito/domain/import/convert/rows"
import { parseWorkbook } from "../parseWorkbook"
import {
  type Row,
  dateCell,
  numberCell,
  standardFile,
  standardRow,
  waveFile,
  waveRow,
} from "./workbooks"

// Characterization of the conversion of one row (spec import-pratiche, T1
// moved in T4): the values today's import gives a browser in Rome, defects
// included, on `parseWorkbook` and the domain. vitest.workspace.ts runs this
// file in UTC and in Europe/Rome: the dates are Rome's in both (AC33).
// What the old import did with the converted rows (validation, merge, errors)
// was fixed in src/app/api/import/process/_test/characterization.test.ts,
// removed with it (T20): the new rules are the domain's (classify, group, plan).

// 12:00 in Rome
const NOW = new Date("2025-01-15T11:00:00.000Z")
const FILE_NAME = "0125_import.xlsx"

const firstRow = (bytes: ArrayBuffer) => {
  const { rows, errors } = parseWorkbook(bytes)
  expect(errors).toEqual([])
  return rows[0]!
}

const convertWave = (row: Row) => {
  const cells = firstRow(waveFile(row)) as WaveRow
  return {
    customer: waveCustomer(cells, FILE_NAME, NOW),
    practice: wavePractice(cells, FILE_NAME, NOW),
  }
}

const convertStandard = (row: Row) => {
  const cells = firstRow(standardFile(row)) as StandardRow
  return {
    customer: standardCustomer(cells, FILE_NAME),
    practice: standardPractice(cells, FILE_NAME, NOW),
  }
}

describe("file Wave", () => {
  test("una riga Wave con 'Data Erogazione' 15/01/2024 dà la data di liquidazione salvata 15/02/2024 alla mezzanotte di Roma e le rate pagate calcolate da quella data", () => {
    const { practice } = convertWave(waveRow())

    // Defect (OQ2): the conversion adds one month to the date it stores
    expect(practice.dataLiquidazione).toEqual(
      new Date("2024-02-14T23:00:00.000Z")
    )
    // From 15/02/2024 to today (15/01/2025 12:00): 336 days, 30 per rate
    expect(practice.ratePagate).toBe(11)
    expect(practice.debitoResiduo).toBe("1300.00")
  })

  test("pratica: importi, stato, prodotto, sede e date", () => {
    const { practice } = convertWave(waveRow())

    expect(practice).toEqual({
      praticaId: "900001",
      region: "LAZIO",
      desPuntoVendita: "roma",
      desConvenzionato: null,
      paymentMethod: "SDD",
      isWave: true,
      operatorId: null,
      fileName: FILE_NAME,
      dataLiquidazione: new Date("2024-02-14T23:00:00.000Z"),
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
    })
  })

  test("cliente: nome in maiuscolo/minuscolo, email in minuscolo, sede, codice NDG", () => {
    const { customer } = convertWave(
      waveRow({
        Nome: "maria GRAZIA",
        Cognome: "DE LUCA",
        Email: "Maria.DeLuca@Example.COM",
      })
    )

    expect(customer).toEqual({
      tempID: "100001",
      fullName: "Maria Grazia De Luca",
      name: "Maria Grazia",
      surname: "De Luca",
      email: "maria.deluca@example.com",
      birthdayDate: new Date("1979-12-31T23:00:00.000Z"),
      age: 45,
      phoneNumber: "3331234567",
      address: "Via Roma 1",
      // Defect: the CAP is read as a number and loses its leading zeros
      cap: "184",
      comune: "Roma",
      provincia: "RM",
      fileName: FILE_NAME,
      reddito: "1500.00",
      occupazione: "Impiegato",
      ambitoLavorativo: "Privato",
      tipoContratto: "Tempo Indeterminato",
      sede: "roma",
      source: "wave",
      fiscalCode: "RSSMRA80A01H501U",
      vatCode: null,
    })
  })

  test("una rata già scaduta per ogni 30 giorni, fino al numero di rate", () => {
    const { practice } = convertWave(
      waveRow({
        "Data Erogazione": dateCell(2020, 1, 15),
        "Descrizione Stato Pratica": "STATO SCONOSCIUTO",
      })
    )

    expect(practice.ratePagate).toBe(24)
    expect(practice.debitoResiduo).toBe("0.00")
    expect(practice.state).toBe("Chiusa")
  })

  test("'Data Estinzione' presente nel file", () => {
    const { practice } = convertWave(
      waveRow({ "Data Estinzione": dateCell(2024, 6, 30) })
    )

    expect(practice.dataEstinzione).toEqual(
      new Date("2024-06-29T22:00:00.000Z")
    )
  })

  test.each([
    {
      format: "data AAAAMMGG",
      value: 20240115,
      stored: "2024-02-14T23:00:00.000Z",
      paid: 11,
    },
    {
      // Defect (OQ2): a serial without a date format lands one day later
      format: "numero seriale di Excel senza formato data",
      value: 45306,
      stored: "2024-02-15T23:00:00.000Z",
      paid: 11,
    },
    {
      // Defect: the day comes first in Italy, the code reads it as the month
      // (01/03/2025, then one month later)
      format: "testo GG/MM/AAAA",
      value: "15/01/2024",
      stored: "2025-03-31T22:00:00.000Z",
      paid: 2,
    },
    {
      // Defect (OQ2): an unreadable date gives today, one month later
      format: "testo illeggibile",
      value: "non so",
      stored: "2025-02-15T11:00:00.000Z",
      paid: 1,
    },
  ])("'Data Erogazione' come $format", ({ value, stored, paid }) => {
    const { practice } = convertWave(waveRow({ "Data Erogazione": value }))

    expect(practice.dataLiquidazione).toEqual(new Date(stored))
    expect(practice.ratePagate).toBe(paid)
  })

  test.each([
    { code: 24, productId: "24" },
    { code: 5, productId: "05" },
    { code: null, productId: "01" },
  ])("codice prodotto $code → $productId", ({ code, productId }) => {
    const { practice } = convertWave(
      waveRow({ "Codice Prodotto Pratica": code })
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
    ({ value, fiscalCode, vatCode }) => {
      const { customer } = convertWave(waveRow({ "Codice Fiscale": value }))

      expect(customer.fiscalCode).toBe(fiscalCode)
      expect(customer.vatCode).toBe(vatCode)
    }
  )
})

describe("file Standard", () => {
  test("pratica: le rate pagate partono da un mese dopo la liquidazione, la data salvata no", () => {
    const { practice } = convertStandard(standardRow())

    expect(practice).toEqual({
      praticaId: "000123",
      region: "LAZIO",
      desPuntoVendita: "romaeur",
      desConvenzionato: "CONCESSIONARIA SRL",
      subagente: "30",
      state: "Liquidata",
      dataLiquidazione: new Date("2024-01-14T23:00:00.000Z"),
      dataEstinzione: null,
      rateTotali: 24,
      fileName: FILE_NAME,
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
      productId: "24",
    })
  })

  test("cliente: cognome prima del nome, nessun maiuscolo/minuscolo, sede dall'ultima parte del subagente", () => {
    const { customer } = convertStandard(standardRow())

    expect(customer).toEqual({
      fullName: "ROSSI MARIO",
      name: "MARIO",
      sede: "romaeur",
      surname: "ROSSI",
      fiscalCode: "RSSMRA80A01H501U",
      vatCode: null,
      email: null,
      phoneNumber: null,
      tempID: "5001",
      fileName: FILE_NAME,
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
    })
  })

  test.each([
    { fullName: "DE LUCA MARIO", surname: "DE LUCA", name: "MARIO" },
    { fullName: "ROSSI", surname: "ROSSI", name: undefined },
  ])(
    "'DES_CLIENTE' $fullName → cognome $surname, nome $name",
    ({ fullName, surname, name }) => {
      const { customer } = convertStandard(
        standardRow({ DES_CLIENTE: fullName })
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
  ])("'SITUAZIONE' $situazione → $state", ({ situazione, state }) => {
    const { practice } = convertStandard(
      standardRow({ SITUAZIONE: situazione })
    )

    expect(practice.state).toBe(state)
  })

  test("tutte le rate pagate: debito residuo '0' e stato Chiusa se 'SITUAZIONE' non è nota", () => {
    const { practice } = convertStandard(
      standardRow({
        DATA_LIQUIDAZIONE: dateCell(2020, 1, 15),
        SITUAZIONE: "ALTRO",
      })
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
      stored: "2024-01-14T23:00:00.000Z",
    },
    {
      // Defect: as above, and the stored date lands one day later (OQ2)
      format: "numero seriale di Excel senza formato data",
      value: 45306,
      stored: "2024-01-15T23:00:00.000Z",
    },
  ])(
    "'DATA_LIQUIDAZIONE' come $format: rate tutte pagate",
    ({ value, stored }) => {
      const { practice } = convertStandard(
        standardRow({ DATA_LIQUIDAZIONE: value, SITUAZIONE: null })
      )

      expect(practice.dataLiquidazione).toEqual(new Date(stored))
      expect(practice.ratePagate).toBe(24)
      expect(practice.debitoResiduo).toBe("0")
      expect(practice.state).toBe("Chiusa")
    }
  )

  test.each([
    {
      format: "testo illeggibile",
      value: "non so",
      stored: "2025-01-15T11:00:00.000Z",
    },
    {
      format: "testo GG/MM/AAAA",
      value: "15/01/2024",
      stored: "2025-02-28T23:00:00.000Z",
    },
  ])(
    "'DATA_LIQUIDAZIONE' come $format: rate pagate NaN, che la validazione poi scarta",
    ({ value, stored }) => {
      const { practice } = convertStandard(
        standardRow({ DATA_LIQUIDAZIONE: value })
      )

      // Defect: `new Date()` doesn't read the text, the rates come out NaN
      expect(practice.ratePagate).toBeNaN()
      expect(practice.debitoResiduo).toBe("NaN")
      expect(practice.dataLiquidazione).toEqual(new Date(stored))
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
  ])("'IMPORTO_FINANZIATO' come $format → $amount", ({ value, amount }) => {
    const { practice } = convertStandard(
      standardRow({ IMPORTO_FINANZIATO: value })
    )

    expect(practice.importoFinanziato).toBe(amount)
  })
})

describe("nome del file", () => {
  test("i trattini diventano trattini bassi e, senza MMAA all'inizio, si aggiunge il mese di Roma", () => {
    expect(parseFileName("report-gennaio.xlsx", NOW)).toBe(
      "0125_report_gennaio.xlsx"
    )
    // 1 February at 00:30 in Rome, still January in UTC
    expect(
      parseFileName("report.xlsx", new Date("2025-01-31T23:30:00.000Z"))
    ).toBe("0225_report.xlsx")
  })

  test("con MMAA all'inizio il nome resta, a parte i trattini", () => {
    expect(parseFileName("0924_report-settembre.xlsx", NOW)).toBe(
      "0924_report_settembre.xlsx"
    )
  })
})

describe("parseWorkbook", () => {
  test("la prima riga com'è nel foglio, le righe con i codici come testo e i numeri come numeri", () => {
    const { headers, rows } = parseWorkbook(standardFile(standardRow()))

    expect(headers).toContain("CODICE_FISCALE_CLI")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      PRATICA: "000123",
      CLIENTE: "5001",
      NUMERO_RATE: 24,
      DATA_LIQUIDAZIONE: "1/15/24",
    })
  })
})

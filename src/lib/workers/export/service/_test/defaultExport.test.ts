import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { type Customer, type Practice } from "@/lib/types/schemas"
import { generateDefaultWorkbook } from "../defaultExport"

// The rows as the dialog gets them from fetchDefault: JSON, so decimals and
// dates are text. The workbook is read back from the file, as Excel reads it.

const practice = (values: Record<string, unknown> = {}) =>
  ({
    praticaId: "P-1",
    importoFinanziato: "12000.50",
    importoErogato: "10000.00",
    rateTotali: 84,
    ratePagate: 12,
    importoRata: "190.00",
    debitoResiduo: "9500.25",
    // Midnight of 30/09/2026 in Italy
    dataLiquidazione: "2026-09-29T22:00:00.000Z",
    importoRichiesto: "11000.00",
    tassoPratica: "7.5",
    paymentMethod: "RID",
    state: "Liquidata",
    productId: "01",
    ...values,
  }) as unknown as Practice

const customer = (values: Record<string, unknown> = {}) =>
  ({
    name: "Anna",
    surname: "Bianchi",
    fiscalCode: "BNCNNA75C44H501X",
    vatCode: null,
    age: 51,
    email: "anna@test.local",
    phoneNumber: "0612345678",
    // Midnight of 04/03/1975 in Italy
    birthdayDate: "1975-03-03T23:00:00.000Z",
    address: "Via Roma 1",
    cap: "00184",
    comune: "Roma",
    provincia: "RM",
    reddito: "28000.00",
    occupazione: "Impiegata",
    ambitoLavorativo: "Privato",
    ...values,
  }) as unknown as Customer

type Row = Record<string, unknown>

/** Each sheet's rows by header: the values of the cells, and their text. */
function readBack(workbook: XLSX.WorkBook) {
  const file = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer
  const read = XLSX.read(file, { type: "array" })
  const rows = (sheet: string, raw: boolean) =>
    XLSX.utils.sheet_to_json<Row>(read.Sheets[sheet]!, { raw })
  return {
    sheets: read.SheetNames,
    customers: rows("Clienti", true),
    customersText: rows("Clienti", false),
    practices: rows("Pratiche", true),
    practicesText: rows("Pratiche", false),
  }
}

describe("generateDefaultWorkbook", () => {
  it("mette ogni valore della pratica sotto la propria intestazione", () => {
    const { sheets, practices } = readBack(
      generateDefaultWorkbook([], [practice()])
    )

    expect(sheets).toEqual(["Clienti", "Pratiche"])
    expect(practices).toEqual([
      {
        Id: "P-1",
        "Importo finanziato": 12000.5,
        "Importo erogato": 10000,
        "Rate totali": 84,
        "Rate pagate": 12,
        "Importo rata": 190,
        "Debito residuo": 9500.25,
        "Data liquidazione": expect.any(Number) as number,
        "Importo richiesto": 11000,
        "Tasso pratica": 7.5,
        "Metodo di pagamento": "RID",
        "Stato pratica": "Liquidata",
        Prodotto: "PRESTITO PERSONALE",
      },
    ])
  })

  it("scrive le date col giorno che hanno in Italia, come date di Excel", () => {
    const { practicesText, customersText } = readBack(
      generateDefaultWorkbook(
        [customer()],
        [
          practice(),
          // Winter time: midnight in Italy is 23:00 UTC of the day before
          practice({
            praticaId: "P-2",
            dataLiquidazione: "2025-01-09T23:00:00.000Z",
          }),
        ]
      )
    )

    expect(practicesText.map((row) => row["Data liquidazione"])).toEqual([
      "30/09/2026",
      "10/01/2025",
    ])
    expect(customersText[0]!["Data di nascita"]).toBe("04/03/1975")
  })

  it("scrive il reddito come numero e lascia testo CAP, telefono e codice fiscale", () => {
    const { customers } = readBack(generateDefaultWorkbook([customer()], []))

    expect(customers).toEqual([
      {
        Nome: "Anna",
        Cognome: "Bianchi",
        "Codice fiscale": "BNCNNA75C44H501X",
        Età: 51,
        Email: "anna@test.local",
        "Numero di telefono": "0612345678",
        "Data di nascita": expect.any(Number) as number,
        Indirizzo: "Via Roma 1",
        CAP: "00184",
        Comune: "Roma",
        Provincia: "RM",
        Reddito: 28000,
        Occupazione: "Impiegata",
        "Ambito lavorativo": "Privato",
      },
    ])
  })

  it("lascia vuoto un valore che manca e com'è uno che non è un numero o una data", () => {
    const { practices, customers } = readBack(
      generateDefaultWorkbook(
        [customer({ reddito: null, birthdayDate: null })],
        [
          practice({
            // Some imported rows hold NaN
            debitoResiduo: "NaN",
            importoRichiesto: null,
            tassoPratica: null,
          }),
        ]
      )
    )

    expect(practices[0]).toMatchObject({ "Debito residuo": "NaN" })
    expect(practices[0]).not.toHaveProperty("Importo richiesto")
    expect(practices[0]).not.toHaveProperty("Tasso pratica")
    expect(customers[0]).not.toHaveProperty("Reddito")
    expect(customers[0]).not.toHaveProperty("Data di nascita")
  })

  it("senza clienti o pratiche scrive l'avviso sotto le intestazioni", () => {
    const { customers, practices } = readBack(generateDefaultWorkbook([], []))

    expect(customers).toEqual([
      { Nome: "Non ci sono clienti da esportare per il periodo selezionato" },
    ])
    expect(practices).toEqual([
      { Id: "Non ci sono pratiche da esportare per il periodo selezionato" },
    ])
  })
})

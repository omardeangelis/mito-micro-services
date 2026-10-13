import { getProductLabel, type ProductMapKey } from "@/lib/constants/productMap"
import { type Customer, type Practice } from "@/lib/types/schemas"
import * as XLSX from "xlsx"
import { amountCell, dateCell, numberCell } from "./cells"

export const generateDefaultWorkbook = (
  dbCustomers: Customer[],
  dbPractices: Practice[]
) => {
  const workbook = XLSX.utils.book_new()
  const customerData =
    dbCustomers.length > 0
      ? [
          customerSheetHeader,
          ...dbCustomers.map((item) => [
            item.name,
            item.surname,
            item.fiscalCode,
            item.vatCode,
            item.age,
            item.email,
            item.phoneNumber,
            dateCell(item.birthdayDate),
            item.address,
            item.cap,
            item.comune,
            item.provincia,
            amountCell(item.reddito),
            item.occupazione,
            item.ambitoLavorativo,
          ]),
        ]
      : [
          customerSheetHeader,
          ["Non ci sono clienti da esportare per il periodo selezionato"],
        ]

  const practiceData =
    dbPractices.length > 0
      ? [
          practicesSheetHeader,
          ...dbPractices.map((item) => {
            const product = getProductLabel(item.productId as ProductMapKey)
            return [
              // In the order of practicesSheetHeader
              item.praticaId,
              amountCell(item.importoFinanziato),
              amountCell(item.importoErogato),
              item.rateTotali,
              item.ratePagate,
              amountCell(item.importoRata),
              amountCell(item.debitoResiduo),
              dateCell(item.dataLiquidazione),
              amountCell(item.importoRichiesto),
              numberCell(item.tassoPratica),
              item.paymentMethod,
              item.state,
              product,
            ]
          }),
        ]
      : [
          practicesSheetHeader,
          ["Non ci sono pratiche da esportare per il periodo selezionato"],
        ]

  const customerSheet = XLSX.utils.aoa_to_sheet(customerData)
  const practiceSheet = XLSX.utils.aoa_to_sheet(practiceData)

  // console.log("workbookBefore", workbook)

  XLSX.utils.book_append_sheet(workbook, customerSheet, "Clienti")
  XLSX.utils.book_append_sheet(workbook, practiceSheet, "Pratiche")

  return workbook
}

export const customerSheetHeader = [
  "Nome",
  "Cognome",
  "Codice fiscale",
  "Partita iva",
  "Età",
  "Email",
  "Numero di telefono",
  "Data di nascita",
  "Indirizzo",
  "CAP",
  "Comune",
  "Provincia",
  "Reddito",
  "Occupazione",
  "Ambito lavorativo",
]

export const practicesSheetHeader = [
  "Id",
  "Importo finanziato",
  "Importo erogato",
  "Rate totali",
  "Rate pagate",
  "Importo rata",
  "Debito residuo",
  "Data liquidazione",
  "Importo richiesto",
  "Tasso pratica",
  "Metodo di pagamento",
  "Stato pratica",
  "Prodotto",
]

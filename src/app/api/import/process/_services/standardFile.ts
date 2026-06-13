import { type StandardImportFile } from "../../_types"
import {
  calculateDebitoResiduo,
  getFiscalData,
  mergePraticaState,
  parseDecimal,
  parseFullName,
  standardizeSede,
} from "../../_utils"
import {
  type ProductMapKey,
  createCompatibleProductKey,
} from "@/lib/constants/productMap"
import { nanoid } from "nanoid"
import { createHashForCustomer, parseDateInput } from "@/lib/utils"
import type {
  CustomerWriteWithInternalSort,
  PracticeWriteWithInternalSort,
} from "./type"

export function createPracticeObject(
  row: StandardImportFile,
  fileName: string,
  _internal_sort: number
): PracticeWriteWithInternalSort {
  const { ratePagate, debitoResiduo } = calculateDebitoResiduo(
    row.DATA_LIQUIDAZIONE ? new Date(row.DATA_LIQUIDAZIONE) : null,
    row.NUMERO_RATE,
    row.IMPORTO_RATA
  )

  const rateTotali = row.NUMERO_RATE ?? 0
  return {
    praticaId: row.PRATICA!.toString(),
    region: row.REGIONE,
    desPuntoVendita: standardizeSede({
      sede: row.DES_SUBAGENTE,
      reverse: true,
    }),
    desConvenzionato: row.DES_CONVENZIONATO,
    subagente: row.SUBAGENTE?.toString(),
    state: mergePraticaState(row?.SITUAZIONE, row.NUMERO_RATE ?? 0, ratePagate),
    dataLiquidazione: row.DATA_LIQUIDAZIONE
      ? (parseDateInput(row.DATA_LIQUIDAZIONE) ?? new Date())
      : new Date(),
    dataEstinzione: null,
    rateTotali: row.NUMERO_RATE ?? 0,
    fileName,
    ratePagate: ratePagate >= rateTotali ? rateTotali : ratePagate,
    importoRata: parseDecimal(row.IMPORTO_RATA),
    importoFinanziato: parseDecimal(row.IMPORTO_FINANZIATO),
    importoErogato: parseDecimal(row.IMPORTO_NETTO_EROGATO),
    debitoResiduo: ratePagate >= rateTotali ? "0" : debitoResiduo,
    paymentMethod: row.MOD_PAGAMENTO,
    tassoPratica: null,
    importoRichiesto: null,
    isWave: false,
    operatorId: null,
    _internal_sort,
    productId: row.PRODOTTO
      ? createCompatibleProductKey(row.PRODOTTO.toString() as ProductMapKey)
          .toString()
          .trim()
      : "01",
  }
}

export function createCustomerObject(
  row: StandardImportFile,
  fileName: string,
  _internal_sort: number
): CustomerWriteWithInternalSort {
  const { name, surname } = parseFullName(row.DES_CLIENTE)
  const { fiscalCode, vatCode } = getFiscalData(
    row.CODICE_FISCALE_CLI ? row.CODICE_FISCALE_CLI : null
  )
  const customerId = nanoid()
  return {
    id: customerId,
    fullName: row.DES_CLIENTE,
    name: name,
    sede: standardizeSede({ sede: row.DES_SUBAGENTE, reverse: true }),
    surname: surname,
    fiscalCode,
    vatCode,
    email: null,
    phoneNumber: null,
    tempID: row.CLIENTE!.toString(),
    fileName,
    uniqueHash: createHashForCustomer({
      id: customerId,
      tempID: row.CLIENTE!.toString(),
    }),
    cap: row.CAP_CLIENTE ? row.CAP_CLIENTE.toString().trim() : null,
    comune: row.LOCALITA_CLI,
    provincia: row.PROVINCIA_CLI,
    reddito: null,
    occupazione: null,
    ambitoLavorativo: null,
    tipoContratto: null,
    address: row.INDIRIZZO_CLI,
    source: "internal",
    _internal_sort,
  }
}

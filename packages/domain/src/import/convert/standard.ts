import { type PracticeWrite } from "../../schemas"
import {
  type ProductMapKey,
  createCompatibleProductKey,
} from "../../constants/productMap"
import { parseDateInput } from "../../utils/dates"
import { romeParseDate } from "../../utils/romeClock"
import { type StandardRow } from "./rows"
import {
  calculateDebitoResiduo,
  getFiscalData,
  mergePraticaState,
  parseDecimal,
  parseFullName,
  standardizeSede,
} from "./values"
import { type ConvertedCustomer } from "./wave"

/** The practice of a Standard row that has all the practice's required columns. */
export function standardPractice(
  row: StandardRow,
  fileName: string,
  now: Date
): PracticeWrite {
  // Defect kept: the rates start from the date as `new Date()` reads it, so
  // a number (AAAAMMGG, serial) is milliseconds from 1970
  const { ratePagate, debitoResiduo } = calculateDebitoResiduo(
    row.DATA_LIQUIDAZIONE ? romeParseDate(row.DATA_LIQUIDAZIONE) : null,
    row.NUMERO_RATE,
    row.IMPORTO_RATA,
    now
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
      ? (parseDateInput(row.DATA_LIQUIDAZIONE, now) ?? new Date(now))
      : new Date(now),
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
    productId: row.PRODOTTO
      ? createCompatibleProductKey(row.PRODOTTO.toString() as ProductMapKey)
          .toString()
          .trim()
      : "01",
  }
}

/** The customer of a Standard row that has a "CLIENTE". */
export function standardCustomer(
  row: StandardRow,
  fileName: string
): ConvertedCustomer {
  const { name, surname } = parseFullName(row.DES_CLIENTE)
  const { fiscalCode, vatCode } = getFiscalData(
    row.CODICE_FISCALE_CLI ? row.CODICE_FISCALE_CLI : null
  )
  return {
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
    cap: row.CAP_CLIENTE ? row.CAP_CLIENTE.toString().trim() : null,
    comune: row.LOCALITA_CLI,
    provincia: row.PROVINCIA_CLI,
    reddito: null,
    occupazione: null,
    ambitoLavorativo: null,
    tipoContratto: null,
    address: row.INDIRIZZO_CLI,
    source: "internal",
  }
}

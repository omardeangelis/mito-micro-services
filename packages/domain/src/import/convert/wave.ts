import { type CustomerWrite, type PracticeWrite } from "../../schemas"
import {
  type ProductMapKey,
  createCompatibleProductKey,
} from "../../constants/productMap"
import { parseDateInput } from "../../utils/dates"
import { type WaveRow } from "./rows"
import {
  calculateDebitoResiduo,
  capitalizeFirstLetterEachWord,
  emailToLowercase,
  getFiscalData,
  mergePraticaState,
  parseDecimal,
  standardizeSede,
} from "./values"

/** A customer of a converted row: `id` and `uniqueHash` come at insert. */
export type ConvertedCustomer = Omit<CustomerWrite, "id" | "uniqueHash">

type ParsedPratica = Pick<
  PracticeWrite,
  | "dataLiquidazione"
  | "dataEstinzione"
  | "rateTotali"
  | "ratePagate"
  | "debitoResiduo"
  | "importoRata"
  | "importoErogato"
  | "importoRichiesto"
  | "importoFinanziato"
  | "tassoPratica"
  | "productId"
  | "state"
>

/** The practice of a Wave row that has all the practice's required columns. */
export function wavePractice(
  row: WaveRow,
  fileName: string,
  now: Date
): PracticeWrite {
  const parsedPratica = praticaWaveParser(row, now)
  return {
    praticaId: row["n° Pratica"]!.toString(),
    region: row.Region?.toString().trim(),
    desPuntoVendita: standardizeSede({ sede: row["Descrizione PdV"] }),
    desConvenzionato: null,
    paymentMethod: row["Modalità di Pagamento"]?.toString().trim(),
    isWave: true,
    operatorId: null,
    fileName,
    ...parsedPratica,
  }
}

/** The customer of a Wave row that has a "Codice NDG". */
export function waveCustomer(
  row: WaveRow,
  fileName: string,
  now: Date
): ConvertedCustomer {
  const fiscalData = getFiscalData(row["Codice Fiscale"])
  return {
    tempID: row["Codice NDG"]!.toString(),
    fullName: capitalizeFirstLetterEachWord(
      `${row.Nome} ${row.Cognome}`.trim()
    ),
    name: capitalizeFirstLetterEachWord(row.Nome?.toString().trim()),
    surname: capitalizeFirstLetterEachWord(row.Cognome?.toString().trim()),
    email: emailToLowercase(row.Email?.toString().trim()),
    birthdayDate: row["Data di Nascita"]
      ? parseDateInput(row["Data di Nascita"], now)
      : null,
    age: row.Età,
    phoneNumber: row["Telefono Definitivo"]?.toString().trim(),
    address: capitalizeFirstLetterEachWord(
      row["Indirizzo di residenza"]?.toString().trim()
    ),
    cap: row["CAP Residenza"]?.toString().trim(),
    comune: capitalizeFirstLetterEachWord(
      row["Comune di residenza"]?.toString().trim()
    ),
    provincia: row["Provincia di residenza"]?.toString().trim(),
    fileName,
    reddito: parseDecimal(row.Reddito),
    occupazione: capitalizeFirstLetterEachWord(
      row.Occupazione?.toString().trim()
    ),
    ambitoLavorativo: capitalizeFirstLetterEachWord(
      row["Ambito lavorativo (ex 'Dip Pub')"]?.toString().trim()
    ),
    tipoContratto: capitalizeFirstLetterEachWord(
      row["Tipo Contratto"]?.toString().trim()
    ),
    sede: standardizeSede({ sede: row["Descrizione PdV"] }),
    source: "wave",
    ...fiscalData,
  }
}

function praticaWaveParser(row: WaveRow, now: Date): ParsedPratica {
  let dataLiquidazione = new Date(now)
  if (row["Data Erogazione"]) {
    dataLiquidazione =
      parseDateInput(row["Data Erogazione"].toString(), now) ?? new Date(now)
  }

  // Defect kept (OQ2): no date in the file is the day of the import
  let dataEstinzione = new Date(now)

  if (row["Data Estinzione"]) {
    dataEstinzione =
      parseDateInput(row["Data Estinzione"].toString(), now) ?? new Date(now)
  }

  const rateTotali = row["N° rate pratica"] ?? 0
  const importoRata = parseDecimal(row["Importo Rata"])
  const importoErogato = parseDecimal(rateTotali * Number(importoRata))
  const importoRichiesto = parseDecimal(row["Importo Richiesto"])
  const importoFinanziato = parseDecimal(row["Importo Finanziato"])
  const tassoPratica = parseDecimal(row["Tasso Pratica"])

  const { ratePagate, debitoResiduo, start } = calculateDebitoResiduo(
    dataLiquidazione,
    rateTotali,
    Number(importoRata),
    now
  )

  const state = mergePraticaState(
    row["Descrizione Stato Pratica"],
    rateTotali,
    ratePagate
  )

  const productId = row["Codice Prodotto Pratica"]
    ? createCompatibleProductKey(
        row["Codice Prodotto Pratica"].toString() as ProductMapKey
      )
        .toString()
        .trim()
    : "01"
  return {
    // Defect kept (OQ2): the rates start one month later, and so does the
    // date Wave saves
    dataLiquidazione: start ?? dataLiquidazione,
    dataEstinzione,
    rateTotali,
    ratePagate,
    debitoResiduo,
    importoRata,
    importoErogato,
    importoRichiesto,
    importoFinanziato,
    tassoPratica,
    productId,
    state,
  }
}

import { type WaveFile } from "../../_types"
import { type CustomerWrite, type PracticeWrite } from "@/lib/types/schemas"
import {
  calculateDebitoResiduo,
  emailToLowercase,
  getFiscalData,
  mergePraticaState,
  parseDecimal,
  standardizeSede,
  capitalizeFirstLetterEachWord,
} from "../../_utils"
import {
  type ProductMapKey,
  createCompatibleProductKey,
} from "@/lib/constants/productMap"

import { nanoid } from "nanoid"
import { createHashForCustomer, parseDateInput } from "@/lib/utils"

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

export function createWavePracticeObject(
  row: WaveFile,
  fileName: string,
  _internal_sort: number
): PracticeWrite & { _internal_sort: number } {
  const parsedPratica = praticaWaveParser(row)
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
    _internal_sort,
  }
}

export function createWaveCustomerObject(
  row: WaveFile,
  fileName: string,
  _internal_sort: number
): CustomerWrite & { _internal_sort: number } {
  const fiscalData = getFiscalData(row["Codice Fiscale"])
  const customerId = nanoid()
  return {
    id: customerId,
    uniqueHash: createHashForCustomer({
      tempID: row["Codice NDG"]!.toString(),
      id: customerId,
    }),
    tempID: row["Codice NDG"]!.toString(),
    fullName: capitalizeFirstLetterEachWord(
      `${row.Nome} ${row.Cognome}`.trim()
    ),
    name: capitalizeFirstLetterEachWord(row.Nome?.toString().trim()),
    surname: capitalizeFirstLetterEachWord(row.Cognome?.toString().trim()),
    email: emailToLowercase(row.Email?.toString().trim()),
    birthdayDate: row["Data di Nascita"]
      ? parseDateInput(row["Data di Nascita"])
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
    _internal_sort,
  }
}

function praticaWaveParser(row: WaveFile): ParsedPratica {
  let dataLiquidazione = new Date()
  if (row["Data Erogazione"]) {
    dataLiquidazione =
      parseDateInput(row["Data Erogazione"].toString()) ?? new Date()
  }

  let dataEstinzione = new Date()

  if (row["Data Estinzione"]) {
    dataEstinzione =
      parseDateInput(row["Data Estinzione"].toString()) ?? new Date()
  }

  const rateTotali = row["N° rate pratica"] ?? 0
  const importoRata = parseDecimal(row["Importo Rata"])
  const importoErogato = parseDecimal(rateTotali * Number(importoRata))
  const importoRichiesto = parseDecimal(row["Importo Richiesto"])
  const importoFinanziato = parseDecimal(row["Importo Finanziato"])
  const tassoPratica = parseDecimal(row["Tasso Pratica"])

  const { ratePagate, debitoResiduo } = calculateDebitoResiduo(
    dataLiquidazione,
    rateTotali,
    Number(importoRata)
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
    dataLiquidazione,
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

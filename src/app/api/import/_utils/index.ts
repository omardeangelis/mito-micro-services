import { fiscalCodeRegex } from "@/lib/constants/regex"
import { waveFileKeys } from "../_constants"
import {
  type WaveImportType,
  type WaveFile,
  type WaveFileKeys,
  type StandardImportFile,
} from "../_types"
import * as Paparenzo from "papaparse"
import { type PraticaState } from "@/app/dashboard/pratiche/_types/pratiche"
import { type Nullable } from "@/lib/types"
import {
  type CustomerToPraticaWrite,
  type PracticeWrite,
  type CustomerWrite,
} from "@/lib/types/schemas"
import { type CustomerRole } from "@/server/db/schema/relations/customerToPratica"
import { DAYS_PER_RATE } from "../../_utils"

//write a functions that infer if the type of the header is a WaveFile or a StandardImportFile
export const isWave = (headers: unknown[]): headers is WaveFileKeys[] => {
  return waveFileKeys.every((key) => headers.includes(key.trim()))
}

//write a fucntion that parse a new csv file
// that accept a Generic type T
export const parseCsv = <T>(file: string): Paparenzo.ParseResult<T> => {
  return Paparenzo.parse<T>(file, {
    header: true,
    dynamicTyping: (field) => {
      console.log(field)
      if (field === "Codice NDG") return false
      if (field === "CLIENTE") return false
      if (field === "CODICE_FISCALE_CLI") return false
      if (field === "Codice Fiscale") return false
      if (field === "n° Pratica") return false
      if (field === "PRATICA") return false
      return true
    },
  })
}

export const getFiscalData = (cfOrVatCode: string | number | null) => {
  const fiscalData = {
    fiscalCode: null,
    vatCode: null,
  } as { fiscalCode: string | null; vatCode: string | null }

  if (!cfOrVatCode) return fiscalData

  if (fiscalCodeRegex.test(cfOrVatCode.toString())) {
    fiscalData.fiscalCode = cfOrVatCode.toString()
  } else {
    fiscalData.vatCode = cfOrVatCode.toString()
  }

  return fiscalData
}

export const parseDecimal = (importo?: string | number | null) => {
  if (typeof importo === "number") return importo.toFixed(2)
  return invertCommaAndDot(importo)?.toFixed(2) ?? "0"
}

export function mergePraticaState(
  state: Nullable<string>,
  rateTotali: number,
  ratePagate: number
): PraticaState {
  switch (state) {
    case "40 Erogata":
    case "Perfezionata":
    case "LIQUIDATA":
      return "Liquidata"
    case "RIFIUTATA":
      return "Rifiutata"
    case "CHIUSA":
      return "Chiusa"
    case "ESTINTA ANTICIP.":
      return "Estinta anticipata"
    case "05 Rinunciata":
    case "30 Rinunciata":
      return "Rinunciata"
    case "45 Stornata/Revocata":
      return "Stornata"
    default:
      return rateTotali === ratePagate ? "Chiusa" : "Liquidata"
  }
}

export function calculateDebitoResiduo(
  startDate?: Date | null,
  rateTotali?: number | null,
  importoRata?: number | null
) {
  if (!startDate || !rateTotali || !importoRata)
    return { ratePagate: 0, rateResidue: 0, debitoResiduo: null }
  const today = new Date(Date.now())
  //Add 1 month to the start date
  const initialDate = new Date(startDate.setMonth(startDate.getMonth() + 1))
  const diffTime = Math.abs(today.getTime() - initialDate.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  let ratePagate = Math.floor(diffDays / DAYS_PER_RATE)
  let rateResidue = 0
  if (ratePagate > rateTotali) {
    rateResidue = 0
    ratePagate = rateTotali
  } else rateResidue = rateTotali - ratePagate
  return {
    ratePagate,
    rateResidue,
    debitoResiduo: importoRata ? (rateResidue * importoRata).toFixed(2) : null,
  }
}

export const parseFullName = (fullName?: string | null) => {
  if (!fullName) return { name: "", surname: "" }
  const parts = fullName.split(" ")
  if (parts.length > 2) {
    const surname = parts.slice(0, -1).join(" ")
    const name = parts.pop()
    return { name, surname }
  }
  const [surname, name] = parts
  return { name, surname }
}

export function splitArray<T>(array: T[], size: number): T[][] {
  const res = [] as T[][]
  for (let i = 0; i < array.length; i += size) {
    res.push(array.slice(i, i + size))
  }
  return res
}

export function splitPracticeArrayByUniqueId<T extends PracticeWrite>(
  arr: T[],
  size: number
) {
  const result = [] as T[][]
  let currentBatch = [] as T[]

  for (const item of arr) {
    const newItem = {
      ...item,
      dataLiquidazione: new Date(
        Date.parse(item.dataLiquidazione as unknown as string)
      ),
      dataEstinzione: item.dataEstinzione
        ? new Date(Date.parse(item.dataEstinzione as unknown as string))
        : null,
    } as T
    if (currentBatch.length >= size) {
      result.push(currentBatch)
      currentBatch = []
    }
    const index = currentBatch.findIndex(
      (obj) => obj.praticaId === item.praticaId
    )

    if (index === -1) {
      currentBatch.push(newItem)
    } else {
      result.push(currentBatch)
      currentBatch = []
      currentBatch.push(newItem)
    }
  }

  if (currentBatch.length > 0) {
    result.push(currentBatch)
  }
  return result
}

export function splitCustomersArrayByUniqueId<T extends CustomerWrite>(
  arr: T[],
  size: number
) {
  const result = [] as T[][]
  let currentBatch = [] as T[]

  for (const item of arr) {
    const newItem = {
      ...item,
      birthdayDate: item.birthdayDate
        ? new Date(Date.parse(item.birthdayDate as unknown as string))
        : null,
    } as T
    if (currentBatch.length >= size) {
      result.push(currentBatch)
      currentBatch = []
    }
    const index = currentBatch.findIndex((obj) => obj.id === item.id)
    if (index === -1) {
      currentBatch.push(newItem)
    } else {
      result.push(currentBatch)
      currentBatch = []
      currentBatch.push(newItem)
    }
  }

  if (currentBatch.length > 0) {
    result.push(currentBatch)
  }

  return result
}

export function splitCustomerToPraticaArrayByUniqueId<
  T extends CustomerToPraticaWrite,
>(arr: T[], size: number) {
  const result = [] as T[][]
  let currentBatch = [] as T[]

  for (const item of arr) {
    if (currentBatch.length >= size) {
      result.push(currentBatch)
      currentBatch = []
    }
    const index = currentBatch.findIndex(
      (obj) => obj.customerId === item.customerId
    )
    if (index === -1) {
      currentBatch.push(item)
    } else {
      result.push(currentBatch)
      currentBatch = []
      currentBatch.push(item)
    }
  }

  if (currentBatch.length > 0) {
    result.push(currentBatch)
  }

  return result
}

function invertCommaAndDot(input?: string | null): number | null {
  if (!input) return null
  let tempInput = input.replace(/,/g, "@")
  // Step 2: Sostituisci tutti i punti (`.`) con le virgole (`,`)
  tempInput = tempInput.replace(/\./g, ",")
  // Step 3: Sostituisci il carattere temporaneo (`@`) con i punti (`.`)
  tempInput = tempInput.replace(/@/g, ".")
  // Step 4: Rimuovi i separatori delle migliaia
  let numberString = tempInput.replace(/\./g, "")
  numberString = numberString.replace(/,/g, ".")
  const number = parseFloat(numberString)
  return number
}

type StandardizeSedeProps = {
  sede?: string | null
  reverse?: boolean
}

export function standardizeSede(input: StandardizeSedeProps): string | null {
  if (!input.sede) return null
  const sedeStandardized = input.sede.replace(/\s|\./g, "").trim().toLowerCase()
  const sedeArray = sedeStandardized.split("-")
  if (sedeArray.length === 1) return sedeStandardized
  if (input.reverse) {
    return sedeArray.reverse()[0]!
  }
  return sedeArray[0]!
}

type RoleValidatorStatement = "si" | "no"

export function getCustomerRole(row: WaveFile | null): CustomerRole {
  if (!row) return "Intestatario"
  const garante = row.Garante?.toLowerCase() as RoleValidatorStatement
  const coobligato = row[
    "Cliente Coobbligato"
  ]?.toLowerCase() as RoleValidatorStatement
  if (garante === "si") return "Garante"
  if (coobligato === "si") return "Coobbligato"
  return "Intestatario"
}

export function isWaveRow(
  row: WaveFile | StandardImportFile
): row is WaveImportType {
  return !!(
    typeof (row as WaveImportType).Garante === "string" ||
    typeof (row as WaveImportType)["Cliente Coobbligato"] === "string"
  )
}

export const capitalizeFirstLetterEachWord = (str: string | undefined) => {
  if (!str) {
    return str
  }
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

export const emailToLowercase = (email: string | undefined) => {
  if (!email) {
    return email
  }
  return email.toLowerCase()
}

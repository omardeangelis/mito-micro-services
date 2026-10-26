import { type stateEnum } from "@mito/db/schema/pratiche"
import { type CustomerRole } from "@mito/db/schema/relations/customerToPratica"
import { DAYS_PER_RATE } from "../../constants/practice"
import { fiscalCodeRegex } from "../../constants/regex"
import { addRomeMonth } from "../../utils/romeClock"
import { type WaveRow } from "./rows"

// The value rules of today's import (AC32), moved without changes: only the
// clock is an argument, and the dates are Rome's in any process (AC33)

type PraticaState = (typeof stateEnum)[number]

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
  state: string | null | undefined,
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

/**
 * Rates paid since one month after `startDate`, one every 30 days up to the
 * rates of the practice, and the debt left. `start` is that shifted date, or
 * null when nothing was computed: Wave stores it as the liquidation date (OQ2).
 */
export function calculateDebitoResiduo(
  startDate: Date | null | undefined,
  rateTotali: number | null | undefined,
  importoRata: number | null | undefined,
  now: Date
) {
  if (!startDate || !rateTotali || !importoRata)
    return { ratePagate: 0, rateResidue: 0, debitoResiduo: null, start: null }
  const initialDate = addRomeMonth(startDate)
  const diffTime = Math.abs(now.getTime() - initialDate.getTime())
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
    start: initialDate,
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

function invertCommaAndDot(input?: string | null): number | null {
  if (!input) return null
  let tempInput = input.replace(/,/g, "@")
  tempInput = tempInput.replace(/\./g, ",")
  tempInput = tempInput.replace(/@/g, ".")
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

export function getCustomerRole(row: WaveRow | null): CustomerRole {
  if (!row) return "Intestatario"
  const garante = row.Garante?.toLowerCase() as RoleValidatorStatement
  const coobligato = row[
    "Cliente Coobbligato"
  ]?.toLowerCase() as RoleValidatorStatement
  if (garante === "si") return "Garante"
  if (coobligato === "si") return "Coobbligato"
  return "Intestatario"
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

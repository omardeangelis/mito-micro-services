import { waveFileKeys } from "../_constants"
import {
  type WaveImportType,
  type WaveFile,
  type WaveFileKeys,
  type StandardImportFile,
} from "../_types"
import {
  type CustomerToPraticaWrite,
  type PracticeWrite,
  type CustomerWrite,
} from "@mito/domain/schemas"
import { calculateDebitoResiduo as calculateRates } from "@mito/domain/import/convert/values"

//write a functions that infer if the type of the header is a WaveFile or a StandardImportFile
export const isWave = (headers: unknown[]): headers is WaveFileKeys[] => {
  return waveFileKeys.every((key) => headers.includes(key.trim()))
}

export { parseImportCsv as parseCsv } from "@/lib/import/parseWorkbook"

// The value rules are the domain's since T4
export { getCustomerRole } from "@mito/domain/import/convert/values"

/** Today's signature, for the seed's check of `importRates` */
export function calculateDebitoResiduo(
  startDate?: Date | null,
  rateTotali?: number | null,
  importoRata?: number | null
) {
  const { start: _, ...rates } = calculateRates(
    startDate,
    rateTotali,
    importoRata,
    new Date(Date.now())
  )
  return rates
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

export function isWaveRow(
  row: WaveFile | StandardImportFile
): row is WaveImportType {
  return !!(
    typeof (row as WaveImportType).Garante === "string" ||
    typeof (row as WaveImportType)["Cliente Coobbligato"] === "string"
  )
}

import type * as Paparenzo from "papaparse"
import { isWaveRow } from "../../_utils"
import {
  type StandardImportFile,
  type WaveFile,
  type StandardImportType,
} from "../../_types"
import { type ProcessedFile } from "../../_types"
import { type CustomerWrite, type PracticeWrite } from "@/lib/types/schemas"
import { getCustomerRole } from "../../_utils"
import {
  insertCustomerSchemaWithVatOfFc,
  insertCustomerSchema,
  insertPracticeSchema,
  insertCustomerToPraticaSchema,
} from "@/lib/types/schemas"
import { z, type ZodIssue } from "zod"
import { createPracticeObject, createCustomerObject } from "./standardFile"
import { createWaveCustomerObject, createWavePracticeObject } from "./waveFile"
import {
  mergeDuplicateCustomers,
  mergeDuplicateCustomerToPratica,
  mergeDuplicatePractices,
} from "../../_utils/merge"
import { filterPratica } from "../../_utils/nullable"
import { standardImportNotNullKeys, waveNotNullKeys } from "../../_constants"
import {
  type CustomerToPraticaWriteWithInternalSort,
  type CustomerWriteWithInternalSort,
  type PracticeWriteWithInternalSort,
} from "./type"

const validCustomerSchema = insertCustomerSchemaWithVatOfFc(
  insertCustomerSchema.extend({
    _internal_sort: z.number(),
  })
)

const customInsertPraticaSchema = insertPracticeSchema.extend({
  _internal_sort: z.number(),
})

const customCTPSchema = insertCustomerToPraticaSchema.extend({
  _internal_sort: z.number(),
})

export const parseFileName = (fileName: string) => {
  const fileNameWithNoDash = fileName.replace(/-/g, "_")
  return addMMYYToFileName(fileNameWithNoDash)
}

const addMMYYToFileName = (fileName: string) => {
  const fileNameFirst4Chars = fileName.slice(0, 4)
  const isNumber = !isNaN(Number(fileNameFirst4Chars))
  if (isNumber) {
    return fileName
  }
  const date = new Date()
  const romeDate = new Date(
    date.toLocaleString("en-US", { timeZone: "Europe/Rome" })
  )
  const mm = String(romeDate.getMonth() + 1).padStart(2, "0")
  const yy = romeDate.getFullYear().toString().slice(-2)
  return `${mm}${yy}_${fileName}`
}

export function parsePratica<T extends StandardImportFile | WaveFile>(
  file: Paparenzo.ParseResult<T>,
  fileName: string
) {
  const { practiceInitialError, practiceToProcess } = filterPratica(file.data)

  findPracticesWithValidCustomer(practiceToProcess, practiceInitialError)

  const {
    practicesToCreate,
    customerToCreate,
    practicesWithErrors,
    customerToPraticaToCreate,
  } = practiceToProcess.reduce(
    (acc, row, index) => {
      let practice: PracticeWrite | null = null
      let customer: CustomerWrite
      if (isWaveRow(row)) {
        if (
          waveNotNullKeys.every(
            (key) => row[key] !== null && row[key] !== undefined
          )
        ) {
          practice = createWavePracticeObject(row, fileName, index)
        }
        customer = createWaveCustomerObject(row, fileName, index)
      } else {
        if (
          standardImportNotNullKeys.every(
            (key) =>
              (row as StandardImportFile)[key] !== null &&
              (row as StandardImportFile)[key] !== undefined
          )
        ) {
          practice = createPracticeObject(
            row as StandardImportType,
            fileName,
            index
          )
        }
        customer = createCustomerObject(
          row as StandardImportType,
          fileName,
          index
        )
      }

      const customerWithVatOrFc = validCustomerSchema.safeParse(customer)
      const practiceValidation = customInsertPraticaSchema.safeParse(practice)
      if (!customerWithVatOrFc.success && !practiceValidation.success) {
        const issues =
          customerWithVatOrFc.error?.issues ??
          practiceValidation.error?.issues ??
          []
        acc.practicesWithErrors.push([index, row, issues])
        return acc
      } else {
        if (customerWithVatOrFc.success && practiceValidation.success) {
          const customerID = mergeDuplicateCustomers(
            acc.customerToCreate,
            customerWithVatOrFc.data
          )
          const praticaID = mergeDuplicatePractices(
            acc.practicesToCreate,
            practiceValidation.data
          )
          const customerToPratica = {
            customerId: customerID,
            praticaId: praticaID ?? practiceValidation.data.praticaId,
            _internal_sort: index,
            customerRole: isWaveRow(row)
              ? getCustomerRole(row)
              : "Intestatario",
          } satisfies CustomerToPraticaWriteWithInternalSort
          const customerToPraticaValidation =
            customCTPSchema.safeParse(customerToPratica)
          if (customerToPraticaValidation.success) {
            mergeDuplicateCustomerToPratica(
              acc.customerToPraticaToCreate,
              customerToPratica
            )
          }
        } else if (customerWithVatOrFc.success && !practiceValidation.success) {
          mergeDuplicateCustomers(
            acc.customerToCreate,
            customerWithVatOrFc.data
          )
        }
      }

      return acc
    },
    {
      practicesToCreate: [] as PracticeWriteWithInternalSort[],
      customerToCreate: [] as CustomerWriteWithInternalSort[],
      practicesWithErrors: [] as [number, T, ZodIssue[]][],
      customerToPraticaToCreate: [] as CustomerToPraticaWriteWithInternalSort[],
    }
  )

  const processErrors = practiceInitialError.concat(practicesWithErrors)
  console.log("all", file.data.length)
  console.log("process", practiceToProcess.length)
  console.log("processErrors", processErrors.length)

  console.log("practicesToCreate", practicesToCreate.length)
  console.log("customerToCreate", customerToCreate.length)
  console.log("practicesWithErrors", practicesWithErrors.length)
  console.log("customerToPraticaToCreate", customerToPraticaToCreate.length)

  return {
    practicesToCreate,
    customerToCreate,
    practicesWithErrors: processErrors,
    customerToPraticaToCreate,
  } satisfies ProcessedFile<T>
}

const findPracticesWithValidCustomer = <
  T extends StandardImportFile | WaveFile,
>(
  practiceToProcess: T[],
  practiceInitialError: [number, T, ZodIssue[]][]
) => {
  const indicesToRemove = [] as number[]

  practiceInitialError.forEach((row, index) => {
    if (isWaveRow(row[1])) {
      if (row[1]["Codice Fiscale"] && row[1]["Codice NDG"]) {
        practiceToProcess.push(row[1])
        indicesToRemove.push(index)
      } else if (row[1]["Codice Fiscale"] && row[1]["Codice NDG"]) {
        practiceToProcess.push(row[1])
        indicesToRemove.push(index)
      }
    }
  })

  // Rimuovi gli elementi dall'array practiceInitialError in ordine inverso
  for (let i = indicesToRemove.length - 1; i >= 0; i--) {
    practiceInitialError.splice(indicesToRemove[i]!, 1)
  }
}

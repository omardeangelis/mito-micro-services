import {
  type CustomerToPraticaWrite,
  type CustomerWrite,
  type PracticeWrite,
} from "@mito/domain/schemas"
import { type NullableAllObjectKeys } from "@/lib/types"
import { type ZodIssue } from "zod"
import {
  type CustomerToPraticaWriteWithInternalSort,
  type CustomerWriteWithInternalSort,
  type PracticeWriteWithInternalSort,
} from "../process/_services/type"
import type {
  StandardImportType,
  WaveImportType,
} from "@mito/domain/import/convert/rows"

export type { StandardImportType, WaveImportType }

export type StandardImportFile = NullableAllObjectKeys<StandardImportType>

export type StandardImportFileKeys = keyof StandardImportFile
export type ProcessedFile<T> = {
  practicesToCreate: PracticeWrite[]
  customerToCreate: CustomerWrite[]
  practicesWithErrors: [number, T, ZodIssue[]][]
  customerToPraticaToCreate: CustomerToPraticaWrite[]
}

export type ProcessAPIResponse = {
  message: string
  created: {
    customerToCreate: CustomerWriteWithInternalSort[]
    practicesToCreate: PracticeWriteWithInternalSort[]
    customerToPraticaToCreate: CustomerToPraticaWriteWithInternalSort[]
  }
  errors: {
    practicesWithErrors: [number, StandardImportFile, ZodIssue[]][]
  }
  headers: string[]
}

export type WaveFile = NullableAllObjectKeys<WaveImportType>

export type WaveFileKeys = keyof WaveFile

export type PracticeWithError<T extends StandardImportFile | WaveFile> = [
  number,
  T,
  ZodIssue[],
]

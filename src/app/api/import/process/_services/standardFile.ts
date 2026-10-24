import { type StandardImportFile } from "../../_types"
import {
  standardCustomer,
  standardPractice,
} from "@mito/domain/import/convert/standard"
import { nanoid } from "nanoid"
import { createHashForCustomer } from "@/lib/utils"
import type {
  CustomerWriteWithInternalSort,
  PracticeWriteWithInternalSort,
} from "./type"

// The conversion is the domain's (T4); the old import adds its ids

export function createPracticeObject(
  row: StandardImportFile,
  fileName: string,
  _internal_sort: number
): PracticeWriteWithInternalSort {
  return { ...standardPractice(row, fileName, new Date()), _internal_sort }
}

export function createCustomerObject(
  row: StandardImportFile,
  fileName: string,
  _internal_sort: number
): CustomerWriteWithInternalSort {
  const customer = standardCustomer(row, fileName)
  const customerId = nanoid()
  return {
    id: customerId,
    uniqueHash: createHashForCustomer({
      id: customerId,
      tempID: customer.tempID,
    }),
    ...customer,
    _internal_sort,
  }
}

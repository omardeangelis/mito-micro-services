import { type WaveFile } from "../../_types"
import { type CustomerWrite, type PracticeWrite } from "@mito/domain/schemas"
import { waveCustomer, wavePractice } from "@mito/domain/import/convert/wave"
import { nanoid } from "nanoid"
import { createHashForCustomer } from "@/lib/utils"

// The conversion is the domain's (T4); the old import adds its ids

export function createWavePracticeObject(
  row: WaveFile,
  fileName: string,
  _internal_sort: number
): PracticeWrite & { _internal_sort: number } {
  return { ...wavePractice(row, fileName, new Date()), _internal_sort }
}

export function createWaveCustomerObject(
  row: WaveFile,
  fileName: string,
  _internal_sort: number
): CustomerWrite & { _internal_sort: number } {
  const customer = waveCustomer(row, fileName, new Date())
  const customerId = nanoid()
  return {
    id: customerId,
    uniqueHash: createHashForCustomer({
      tempID: customer.tempID,
      id: customerId,
    }),
    ...customer,
    _internal_sort,
  }
}

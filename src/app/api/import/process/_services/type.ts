import {
  type CustomerToPraticaWrite,
  type CustomerWrite,
  type PracticeWrite,
} from "@mito/domain/schemas"

export type PracticeWriteWithInternalSort = PracticeWrite & {
  _internal_sort: number
}

export type CustomerWriteWithInternalSort = CustomerWrite & {
  _internal_sort: number
}

export type CustomerToPraticaWriteWithInternalSort = CustomerToPraticaWrite & {
  _internal_sort: number
}

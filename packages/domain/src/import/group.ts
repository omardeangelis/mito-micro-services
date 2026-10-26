import { type CustomerRole } from "@mito/db/schema/relations/customerToPratica"
import { type PracticeWrite } from "../schemas"
import { cleanObject } from "../utils/object"
import { type NumberedRow } from "./classify"
import { type ConvertedCustomer } from "./convert/wave"
import { type LookupKeys } from "./payload"

// The rows of a file that write something, put together as today's import
// does (AC38): one customer per fiscal code (or VAT number without it) and
// customer code, one practice per practice ID, for each field the last value
// that isn't empty, the rows of the customer only last; one link per customer
// and practice, with the first role.

export type FileCustomer = {
  customer: ConvertedCustomer
  /** The rows that write it */
  rows: number[]
}

export type FilePractice = {
  practice: PracticeWrite
  rows: number[]
}

export type FileLink = {
  /** Index in `customers` */
  customer: number
  praticaId: string
  role: CustomerRole
}

/** A row that writes: its customer (index in `customers`) and practice. */
export type FileRow =
  | { row: number; kind: "importable"; customer: number; praticaId: string }
  | { row: number; kind: "customerOnly"; customer: number }

export type GroupedRows = {
  customers: FileCustomer[]
  practices: FilePractice[]
  links: FileLink[]
  rows: FileRow[]
  discarded: { row: number; reasons: string[] }[]
}

/** The same customer of the file: fiscal code, or VAT number, and code. */
const customerKey = ({ fiscalCode, vatCode, tempID }: ConvertedCustomer) =>
  JSON.stringify(
    fiscalCode ? ["cf", fiscalCode, tempID] : ["vat", vatCode, tempID]
  )

export function groupRows(rows: readonly NumberedRow[]): GroupedRows {
  const grouped: GroupedRows = {
    customers: [],
    practices: [],
    links: [],
    rows: [],
    discarded: [],
  }
  const customers = new Map<string, number>()
  const practices = new Map<string, number>()
  const links = new Set<string>()

  const addCustomer = (customer: ConvertedCustomer, row: number) => {
    const key = customerKey(customer)
    const index = customers.get(key)
    if (index === undefined) {
      customers.set(key, grouped.customers.length)
      grouped.customers.push({ customer, rows: [row] })
      return grouped.customers.length - 1
    }
    const found = grouped.customers[index]!
    found.customer = { ...found.customer, ...cleanObject(customer) }
    found.rows.push(row)
    return index
  }

  const addPractice = (practice: PracticeWrite, row: number) => {
    const index = practices.get(practice.praticaId)
    if (index === undefined) {
      practices.set(practice.praticaId, grouped.practices.length)
      grouped.practices.push({ practice, rows: [row] })
    } else {
      const found = grouped.practices[index]!
      found.practice = { ...found.practice, ...cleanObject(practice) }
      found.rows.push(row)
    }
    return practice.praticaId
  }

  // Today's import merges the rows of the customer only after the others
  const ordered = [
    ...rows.filter((row) => row.kind !== "customerOnly"),
    ...rows.filter((row) => row.kind === "customerOnly"),
  ]
  for (const row of ordered) {
    if (row.kind === "discarded") {
      grouped.discarded.push({ row: row.row, reasons: row.reasons })
      continue
    }
    const customer = addCustomer(row.customer, row.row)
    if (row.kind === "customerOnly") {
      grouped.rows.push({ row: row.row, kind: "customerOnly", customer })
      continue
    }
    const praticaId = addPractice(row.practice, row.row)
    const link = JSON.stringify([customer, praticaId])
    if (!links.has(link)) {
      links.add(link)
      grouped.links.push({ customer, praticaId, role: row.role })
    }
    grouped.rows.push({ row: row.row, kind: "importable", customer, praticaId })
  }
  grouped.rows.sort((a, b) => a.row - b.row)
  for (const { rows } of grouped.customers) rows.sort((a, b) => a - b)
  return grouped
}

const sortedUnique = (values: (string | null | undefined)[]) =>
  [...new Set(values.filter((value): value is string => !!value))].sort()

/** The codes to look up in the CRM (`import.lookup`). */
export function lookupKeys({ customers, practices }: GroupedRows): LookupKeys {
  return {
    fiscalCodes: sortedUnique(customers.map((c) => c.customer.fiscalCode)),
    vatCodes: sortedUnique(customers.map((c) => c.customer.vatCode)),
    customerCodes: sortedUnique(customers.map((c) => c.customer.tempID)),
    praticaIds: sortedUnique(practices.map((p) => p.practice.praticaId)),
  }
}

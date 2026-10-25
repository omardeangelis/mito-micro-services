import { type CustomerRole } from "@mito/db/schema/relations/customerToPratica"
import { type PracticeWrite } from "../schemas"
import { type NumberedRow } from "./classify"
import { type ConvertedCustomer } from "./convert/wave"
import { type GroupedRows, groupRows } from "./group"
import { reasons } from "./messages"

// What an import of the file does to the CRM as it is: the numbers of the
// preview (AC7), the rows discarded and why, the rows the admin expects to be
// written (D10) and the writes. Pure: the browser computes it for the
// preview, the server again inside the import's transaction (AC12).

/** A customer of the CRM that a row can recognize or update. */
export type CrmCustomer = {
  id: string
  fiscalCode: string | null
  vatCode: string | null
  tempID: string
}

/** What `import.lookup` reads of the CRM for the file's keys. */
export type CrmState = {
  /**
   * The customers with a fiscal code, VAT number or customer code of the file,
   * and those with the fiscal code or VAT number of the first ones recognized,
   * in the database's order of `id`: the first one recognized is the row's
   * customer (D11)
   */
  customers: readonly CrmCustomer[]
  /** The file's practices that exist */
  praticaIds: readonly string[]
  /** The links of those practices */
  links: readonly { customerId: string; praticaId: string }[]
}

/** The customer of a new link: one of the CRM, or one of `customersNew`. */
export type LinkCustomer = { id: string } | { newCustomer: number }

export type ImportPlan = {
  /** The numbers of the preview (AC7) */
  counts: {
    rows: number
    importable: number
    customerOnly: number
    discarded: number
    customersNew: number
    /** Distinct customers of the CRM */
    customersToUpdate: number
    practicesNew: number
    practicesToUpdate: number
    linksNew: number
  }
  /** In the order of the file, with all their reasons (AC13) */
  discarded: { row: number; reasons: string[] }[]
  /** The rows importable or customer only: what the admin expects (D10) */
  expected: number[]
  customersNew: ConvertedCustomer[]
  /**
   * The row where each of `customersNew` and `practicesNew` first appears: a
   * write of theirs that fails at the import names it (AC19b)
   */
  newRows: { customers: number[]; practices: number[] }
  /** A customer of the file recognized in the CRM, and the customers it updates */
  customerUpdates: { customer: ConvertedCustomer; ids: string[] }[]
  practicesNew: PracticeWrite[]
  practiceUpdates: PracticeWrite[]
  linksNew: { customer: LinkCustomer; praticaId: string; role: CustomerRole }[]
}

/** Where each code is among the customers of the CRM, by position. */
type CrmIndex = {
  /** The customers with that fiscal code */
  byFiscalCode: Map<string, number[]>
  /** The customers with that VAT number */
  byVatCode: Map<string, number[]>
  /** The customers without a fiscal code and with that VAT number */
  byVatCodeOnly: Map<string, number[]>
  byTempID: Map<string, number[]>
}

const add = (map: Map<string, number[]>, key: string, position: number) => {
  const positions = map.get(key)
  if (positions) positions.push(position)
  else map.set(key, [position])
}

const indexes = new WeakMap<CrmState, CrmIndex>()

/**
 * The positions of the CRM's customers by code, built once per state: a file
 * of 20,000 rows on as many customers would otherwise compare each row with
 * each customer (AC25).
 */
function indexOf(crm: CrmState): CrmIndex {
  const cached = indexes.get(crm)
  if (cached) return cached
  const index: CrmIndex = {
    byFiscalCode: new Map(),
    byVatCode: new Map(),
    byVatCodeOnly: new Map(),
    byTempID: new Map(),
  }
  crm.customers.forEach((existing, position) => {
    if (existing.fiscalCode) {
      add(index.byFiscalCode, existing.fiscalCode, position)
    } else if (existing.vatCode) {
      add(index.byVatCodeOnly, existing.vatCode, position)
    }
    if (existing.vatCode) add(index.byVatCode, existing.vatCode, position)
    add(index.byTempID, existing.tempID, position)
  })
  indexes.set(crm, index)
  return index
}

/**
 * Today's rule (OQ1): a customer of the CRM with a fiscal code is the row's if
 * the fiscal codes match, one without if the VAT numbers do; the first wins.
 */
function recognize(customer: ConvertedCustomer, crm: CrmState) {
  const index = indexOf(crm)
  const byFiscalCode = customer.fiscalCode
    ? index.byFiscalCode.get(customer.fiscalCode)?.[0]
    : undefined
  const byVatCode = customer.vatCode
    ? index.byVatCodeOnly.get(customer.vatCode)?.[0]
    : undefined
  const first = Math.min(byFiscalCode ?? Infinity, byVatCode ?? Infinity)
  return first === Infinity ? undefined : crm.customers[first]
}

/**
 * Today's rule (D11): the row updates every customer with its customer code,
 * or with its fiscal code or VAT number, or else the first one's.
 */
function updatedBy(
  customer: ConvertedCustomer,
  first: CrmCustomer,
  crm: CrmState
): string[] {
  const index = indexOf(crm)
  const fiscalCode = customer.fiscalCode ?? first.fiscalCode
  const vatCode = customer.vatCode ?? first.vatCode
  const positions = new Set([
    ...(index.byTempID.get(customer.tempID) ?? []),
    ...((fiscalCode && index.byFiscalCode.get(fiscalCode)) || []),
    ...((vatCode && index.byVatCode.get(vatCode)) || []),
  ])
  return [...positions]
    .sort((a, b) => a - b)
    .map((position) => crm.customers[position]!.id)
}

/**
 * The rows that would create a customer with a customer code the CRM already
 * has, or that another new customer of the file has: all of them (AC11b).
 */
function conflictingRows(grouped: GroupedRows, crm: CrmState) {
  const crmCodes = new Set(crm.customers.map((customer) => customer.tempID))
  const newByCode = new Map<string, number[][]>()
  for (const { customer, rows } of grouped.customers) {
    if (recognize(customer, crm)) continue
    newByCode.set(customer.tempID, [
      ...(newByCode.get(customer.tempID) ?? []),
      rows,
    ])
  }
  const conflicts = new Set<number>()
  for (const [code, customers] of newByCode) {
    if (!crmCodes.has(code) && customers.length === 1) continue
    for (const row of customers.flat()) conflicts.add(row)
  }
  return conflicts
}

export function planRows(
  rows: readonly NumberedRow[],
  crm: CrmState
): ImportPlan {
  let grouped = groupRows(rows)
  const conflicts = conflictingRows(grouped, crm)
  if (conflicts.size > 0) {
    // Grouped again, so that what they'd merge into the others is gone too
    grouped = groupRows(
      rows.map((row) =>
        conflicts.has(row.row)
          ? {
              row: row.row,
              kind: "discarded",
              reasons: [reasons.duplicateCustomerCode],
            }
          : row
      )
    )
  }

  const firsts = grouped.customers.map(({ customer }) =>
    recognize(customer, crm)
  )
  const customersNew: ConvertedCustomer[] = []
  const newRows: ImportPlan["newRows"] = { customers: [], practices: [] }
  const newIndex = new Map<number, number>()
  const customerUpdates: ImportPlan["customerUpdates"] = []
  const updated = new Set<string>()
  grouped.customers.forEach(({ customer, rows }, index) => {
    const first = firsts[index]
    if (!first) {
      newIndex.set(index, customersNew.length)
      customersNew.push(customer)
      newRows.customers.push(rows[0]!)
      return
    }
    const ids = updatedBy(customer, first, crm)
    for (const id of ids) updated.add(id)
    customerUpdates.push({ customer, ids })
  })

  const existingPractices = new Set(crm.praticaIds)
  const practicesNew: PracticeWrite[] = []
  for (const { practice, rows } of grouped.practices) {
    if (existingPractices.has(practice.praticaId)) continue
    practicesNew.push(practice)
    newRows.practices.push(rows[0]!)
  }
  const practiceUpdates = grouped.practices
    .filter(({ practice }) => existingPractices.has(practice.praticaId))
    .map(({ practice }) => practice)

  // A link that exists stays as it is, role included (AC37)
  const links = new Set(
    crm.links.map(({ customerId, praticaId }) =>
      JSON.stringify([{ id: customerId }, praticaId])
    )
  )
  const linksNew: ImportPlan["linksNew"] = []
  for (const { customer, praticaId, role } of grouped.links) {
    const first = firsts[customer]
    const linked: LinkCustomer = first
      ? { id: first.id }
      : { newCustomer: newIndex.get(customer)! }
    const key = JSON.stringify([linked, praticaId])
    if (links.has(key)) continue
    links.add(key)
    linksNew.push({ customer: linked, praticaId, role })
  }

  const discarded = [...grouped.discarded].sort((a, b) => a.row - b.row)
  const importable = grouped.rows.filter(
    (row) => row.kind === "importable"
  ).length
  return {
    counts: {
      rows: grouped.rows.length + discarded.length,
      importable,
      customerOnly: grouped.rows.length - importable,
      discarded: discarded.length,
      customersNew: customersNew.length,
      customersToUpdate: updated.size,
      practicesNew: practicesNew.length,
      practicesToUpdate: practiceUpdates.length,
      linksNew: linksNew.length,
    },
    discarded,
    expected: grouped.rows.map(({ row }) => row),
    customersNew,
    newRows,
    customerUpdates,
    practicesNew,
    practiceUpdates,
    linksNew,
  }
}

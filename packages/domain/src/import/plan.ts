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
  /** A customer of the file recognized in the CRM, and the customers it updates */
  customerUpdates: { customer: ConvertedCustomer; ids: string[] }[]
  practicesNew: PracticeWrite[]
  practiceUpdates: PracticeWrite[]
  linksNew: { customer: LinkCustomer; praticaId: string; role: CustomerRole }[]
}

/**
 * Today's rule (OQ1): a customer of the CRM with a fiscal code is the row's if
 * the fiscal codes match, one without if the VAT numbers do; the first wins.
 */
function recognize(customer: ConvertedCustomer, crm: CrmState) {
  return crm.customers.find((existing) =>
    existing.fiscalCode
      ? existing.fiscalCode === customer.fiscalCode
      : !!existing.vatCode && existing.vatCode === customer.vatCode
  )
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
  const fiscalCode = customer.fiscalCode ?? first.fiscalCode
  const vatCode = customer.vatCode ?? first.vatCode
  return crm.customers
    .filter(
      (existing) =>
        existing.tempID === customer.tempID ||
        (!!fiscalCode && existing.fiscalCode === fiscalCode) ||
        (!!vatCode && existing.vatCode === vatCode)
    )
    .map((existing) => existing.id)
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
  const newIndex = new Map<number, number>()
  const customerUpdates: ImportPlan["customerUpdates"] = []
  const updated = new Set<string>()
  grouped.customers.forEach(({ customer }, index) => {
    const first = firsts[index]
    if (!first) {
      newIndex.set(index, customersNew.length)
      customersNew.push(customer)
      return
    }
    const ids = updatedBy(customer, first, crm)
    for (const id of ids) updated.add(id)
    customerUpdates.push({ customer, ids })
  })

  const existingPractices = new Set(crm.praticaIds)
  const practicesNew = grouped.practices
    .filter(({ practice }) => !existingPractices.has(practice.praticaId))
    .map(({ practice }) => practice)
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
    customerUpdates,
    practicesNew,
    practiceUpdates,
    linksNew,
  }
}

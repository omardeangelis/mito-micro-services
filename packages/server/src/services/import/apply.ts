import "server-only"
import { nanoid } from "nanoid"
import { sql, type SQL } from "drizzle-orm"
import { type PgColumn } from "drizzle-orm/pg-core"
import { Clock, Effect } from "effect"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { type Cells, classifyRows } from "@mito/domain/import/classify"
import { type ConvertedCustomer } from "@mito/domain/import/convert/wave"
import { type ImportFormat } from "@mito/domain/import/formats"
import { groupRows, lookupKeys } from "@mito/domain/import/group"
import { reasons } from "@mito/domain/import/messages"
import { planRows } from "@mito/domain/import/plan"
import { type PracticeWrite } from "@mito/domain/schemas"
import { cleanObject } from "@mito/domain/utils/object"
import { createHashForCustomer } from "@mito/domain/utils/customerHash"
import { Tx, query } from "../../effect/db"
import { ImportConfig } from "./config"
import { ImportInputInvalid, ImportRowRejected, ImportTimedOut } from "./errors"
import { lookupExisting } from "./lookup"

export type ImportInput = {
  format: ImportFormat
  fileName: string
  /** The rows of the file, as papaparse gave them */
  rows: readonly { row: number; cells: Cells }[]
  /** The rows the preview gave as importable or customer only (D10) */
  expected: readonly number[]
  /** The time of the import: the "today" of the conversion */
  now: Date
  /** When it stops, in epoch milliseconds (D8) */
  deadline: number
}

/** What an import wrote (AC23, AC28). */
export type ImportCounts = {
  rowsTotal: number
  rowsDiscarded: number
  customersCreated: number
  customersUpdated: number
  practicesCreated: number
  practicesUpdated: number
  linksCreated: number
}

/** A row the admin didn't confirm: the preview discarded it. */
const notConfirmed = "La riga non era tra quelle confermate"

// What the import writes on a customer or a practice that exists (AC35,
// AC36): the fields of the conversion. Never the customer code, the operator,
// the chat, the blacklist, the creation date; nor a practice's total rates
const customerFields = [
  "fullName",
  "name",
  "surname",
  "sede",
  "fiscalCode",
  "vatCode",
  "email",
  "birthdayDate",
  "age",
  "phoneNumber",
  "address",
  "cap",
  "comune",
  "provincia",
  "fileName",
  "reddito",
  "occupazione",
  "ambitoLavorativo",
  "tipoContratto",
  "source",
] as const satisfies readonly (keyof typeof customers.$inferInsert)[]

const practiceFields = [
  "region",
  "desPuntoVendita",
  "desConvenzionato",
  "subagente",
  "importoFinanziato",
  "importoErogato",
  "importoRata",
  "ratePagate",
  "debitoResiduo",
  "dataLiquidazione",
  "dataEstinzione",
  "importoRichiesto",
  "paymentMethod",
  "tassoPratica",
  "state",
  "isWave",
  "fileName",
  "productId",
] as const satisfies readonly (keyof typeof practices.$inferInsert)[]

/** The type of `column` in SQL; an enum's name is quoted, it can have capitals. */
const sqlType = (column: PgColumn) =>
  column.columnType === "PgEnumColumn"
    ? `"${column.getSQLType()}"`
    : column.getSQLType()

/**
 * `rows` as a relation `v` of the columns named by `key` and `fields`, with
 * the names and types the table gives them, from one JSON parameter: a field
 * a row lacks is NULL. One parameter per batch, however many rows.
 */
const recordset = (
  columns: Record<string, PgColumn>,
  key: string,
  fields: readonly string[],
  rows: readonly Record<string, unknown>[]
) => {
  const names = [key, ...fields]
  const definition = names
    .map((name) => `"${columns[name]!.name}" ${sqlType(columns[name]!)}`)
    .join(", ")
  const json = rows.map((row) =>
    Object.fromEntries(names.map((name) => [columns[name]!.name, row[name]]))
  )
  return sql`jsonb_to_recordset(${JSON.stringify(json)}::jsonb) AS v(${sql.raw(definition)})`
}

/** `v`'s value for `column`, or the one the row has when `v`'s is NULL. */
const keepIfEmpty = (column: PgColumn) =>
  sql`COALESCE(${sql.raw(`v."${column.name}"`)}, ${column})`

const chunks = <T>(items: readonly T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => ({
    start: index * size,
    batch: items.slice(index * size, (index + 1) * size),
  }))

/** The values of the row an import writes on what exists: only the non-empty ones. */
const nonEmpty = <K extends string>(
  values: Partial<Record<K, unknown>>,
  fields: readonly K[]
) =>
  cleanObject(
    Object.fromEntries(fields.map((field) => [field, values[field]]))
  ) as Partial<Record<K, unknown>>

/**
 * Imports the rows inside the transaction of `executeImport` (D5, D9, D10).
 *
 * - Classifies the rows again: the server applies the rules whatever the
 *   preview said (AC12). A row the preview gave as importable or customer
 *   only and now discarded fails the import with `ImportRowRejected`
 *   (AC19b); a row it discarded stays discarded.
 * - Reads and locks what the CRM has for the file, customers then practices,
 *   and plans on it: a customer or practice that appeared in the meantime
 *   changes only the numbers (AC23).
 * - Writes in batches of `batchSize`: new customers without operator (AC34),
 *   the customers the rows update with the non-empty values only (AC35, D11),
 *   new practices, the practices that exist (AC36), the missing links (AC37).
 *   Nothing else: no contact, no chat (AC39).
 * - Fails with `ImportTimedOut` once past `deadline`, checked between the
 *   batches, and the database stops a statement that would run past it.
 */
export const applyImport = (input: ImportInput) =>
  Effect.gen(function* () {
    yield* Tx
    const { batchSize } = yield* ImportConfig

    // Before each step: the time to the deadline, the timeout of the
    // statements that follow (D8)
    const timeLeft = Effect.gen(function* () {
      const left = input.deadline - (yield* Clock.currentTimeMillis)
      if (left <= 0) return yield* new ImportTimedOut()
      yield* query((client) =>
        client.execute(
          sql.raw(`SET LOCAL statement_timeout = ${Math.ceil(left)}`)
        )
      )
    })
    yield* timeLeft
    yield* query((client) =>
      client.execute(
        sql.raw(`SET LOCAL idle_in_transaction_session_timeout = '60s'`)
      )
    )

    const expected = new Set(input.expected)
    const classified = classifyRows(
      input.format,
      input.rows,
      input.now,
      input.fileName
    )
    const present = new Set(classified.map(({ row }) => row))
    const absent = input.expected.find((row) => !present.has(row))
    if (absent !== undefined) {
      return yield* new ImportInputInvalid({
        reason: `La riga ${absent} attesa non è tra le righe del file`,
      })
    }
    const confirmed = classified.map((row) =>
      row.kind === "discarded" || expected.has(row.row)
        ? row
        : { row: row.row, kind: "discarded" as const, reasons: [notConfirmed] }
    )

    const crm = yield* lookupExisting(lookupKeys(groupRows(confirmed)), {
      lock: true,
    })
    const plan = planRows(confirmed, crm)
    const rejected = plan.discarded.find(({ row }) => expected.has(row))
    if (rejected) {
      return yield* new ImportRowRejected({
        row: rejected.row,
        rule: rejected.reasons.join("; "),
      })
    }

    // New customers, with the id and the hash of today's import. A customer
    // code taken in the meantime fails the import on its row
    const newIds = plan.customersNew.map(() => nanoid())
    let customersCreated = 0
    for (const { start, batch } of chunks(plan.customersNew, batchSize)) {
      yield* timeLeft
      const values = batch.map((customer: ConvertedCustomer, index) => {
        const id = newIds[start + index]!
        return {
          ...customer,
          id,
          uniqueHash: createHashForCustomer({ id, tempID: customer.tempID }),
        }
      })
      const inserted = yield* query((client) =>
        client
          .insert(customers)
          .values(values)
          .onConflictDoNothing({ target: customers.tempID })
          .returning({ tempID: customers.tempID })
      )
      if (inserted.length < values.length) {
        const saved = new Set(inserted.map(({ tempID }) => tempID))
        const index = batch.findIndex(({ tempID }) => !saved.has(tempID))
        return yield* new ImportRowRejected({
          row: plan.newRows.customers[start + index]!,
          rule: reasons.duplicateCustomerCode,
        })
      }
      customersCreated += inserted.length
    }

    // A customer two rows update gets the values of both, the later on top
    const updates = new Map<string, Record<string, unknown>>()
    for (const { customer, ids } of plan.customerUpdates) {
      const values = nonEmpty(customer, customerFields)
      for (const id of ids) updates.set(id, { ...updates.get(id), ...values })
    }
    let customersUpdated = 0
    const customerColumns = customers as unknown as Record<string, PgColumn>
    for (const { batch } of chunks([...updates], batchSize)) {
      yield* timeLeft
      const updated = yield* query((client) =>
        client
          .update(customers)
          .set({
            ...(Object.fromEntries(
              customerFields.map((field) => [
                field,
                keepIfEmpty(customers[field]),
              ])
            ) as Record<(typeof customerFields)[number], SQL>),
            lastImportUpdate: input.now,
            updatedAt: input.now,
          })
          .from(
            recordset(
              customerColumns,
              "id",
              customerFields,
              batch.map(([id, values]) => ({ ...values, id }))
            )
          )
          .where(sql`${customers.id} = v."id"`)
          .returning({ id: customers.id })
      )
      customersUpdated += updated.length
    }

    // New practices; one created in the meantime fails the import on its row
    let practicesCreated = 0
    for (const { start, batch } of chunks(plan.practicesNew, batchSize)) {
      yield* timeLeft
      const inserted = yield* query((client) =>
        client
          .insert(practices)
          .values(batch.map((practice: PracticeWrite) => practice))
          .onConflictDoNothing({ target: practices.praticaId })
          .returning({ praticaId: practices.praticaId })
      )
      if (inserted.length < batch.length) {
        const saved = new Set(inserted.map(({ praticaId }) => praticaId))
        const index = batch.findIndex(({ praticaId }) => !saved.has(praticaId))
        return yield* new ImportRowRejected({
          row: plan.newRows.practices[start + index]!,
          rule: "La pratica è stata creata da un altro mentre l'import partiva",
        })
      }
      practicesCreated += inserted.length
    }

    // `last_import_update` moves only with the paid rates (AC36)
    let practicesUpdated = 0
    const practiceColumns = practices as unknown as Record<string, PgColumn>
    for (const { batch } of chunks(plan.practiceUpdates, batchSize)) {
      yield* timeLeft
      const updated = yield* query((client) =>
        client
          .update(practices)
          .set({
            ...(Object.fromEntries(
              practiceFields.map((field) => [
                field,
                keepIfEmpty(practices[field]),
              ])
            ) as Record<(typeof practiceFields)[number], SQL>),
            lastImportUpdate: sql`CASE WHEN v."rate_pagate" IS DISTINCT FROM ${practices.ratePagate} THEN ${input.now.toISOString()}::timestamptz ELSE ${practices.lastImportUpdate} END`,
            // As today: the import doesn't move it on a practice that exists
            updatedAt: sql`${practices.updatedAt}`,
          })
          .from(
            recordset(
              practiceColumns,
              "praticaId",
              practiceFields,
              batch.map((practice) => ({
                ...nonEmpty(practice, practiceFields),
                praticaId: practice.praticaId,
              }))
            )
          )
          .where(sql`${practices.praticaId} = v."pratica_id"`)
          .returning({ praticaId: practices.praticaId })
      )
      practicesUpdated += updated.length
    }

    // A link that exists stays as it is, role included (AC37)
    let linksCreated = 0
    for (const { batch } of chunks(plan.linksNew, batchSize)) {
      yield* timeLeft
      const inserted = yield* query((client) =>
        client
          .insert(customerToPratica)
          .values(
            batch.map(({ customer, praticaId, role }) => ({
              customerId:
                "id" in customer ? customer.id : newIds[customer.newCustomer]!,
              praticaId,
              customerRole: role,
            }))
          )
          .onConflictDoNothing()
          .returning({ praticaId: customerToPratica.praticaId })
      )
      linksCreated += inserted.length
    }

    return {
      rowsTotal: plan.counts.rows,
      rowsDiscarded: plan.counts.discarded,
      customersCreated,
      customersUpdated,
      practicesCreated,
      practicesUpdated,
      linksCreated,
    } satisfies ImportCounts
  })

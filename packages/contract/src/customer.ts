import { Schema, SchemaTransformation } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import {
  CustomerAssignmentForbidden,
  CustomerNotFound,
  HandoverSameOperator,
  OperatorNotFound,
} from "./errors"
import { AdminOnly, Authenticated } from "./middleware"

/*
 * The group `customer` (3.1 of brain/chore/migrazione-frontend-react.md): the
 * 18 procedures of the tRPC router `customer`, each with its name (H8). The
 * enums are those of @mito/db, written again here because the contract
 * doesn't import it (H5): a test of the server compares them.
 */

/** `blackListStatus` of @mito/db/schema/customers. */
export const BlackListStatus = Schema.Literals([
  "blacklisted",
  "whitelisted",
  "review",
])
export type BlackListStatus = typeof BlackListStatus.Type

/** `sourceValues` of @mito/db/schema/customers. */
export const CustomerSource = Schema.Literals([
  "spontaneo",
  "passaparola",
  "inbound",
  "outbound",
  "call center",
  "post vendita",
  "digital",
  "banca",
  "mito",
  "wave",
  "internal",
])
export type CustomerSource = typeof CustomerSource.Type

/** `customerRoleEnum` of @mito/db/schema/relations/customerToPratica. */
export const CustomerRole = Schema.Literals([
  "Intestatario",
  "Coobbligato",
  "Garante",
])
export type CustomerRole = typeof CustomerRole.Type

/** `stateEnum` of @mito/db/schema/pratiche. */
export const PracticeState = Schema.Literals([
  "Liquidata",
  "Rifiutata",
  "Chiusa",
  "Estinta anticipata",
  "Rinunciata",
  "Stornata",
])
export type PracticeState = typeof PracticeState.Type

/** `customerSearchBy` of @mito/domain/constants/customerSearch. */
export const CustomerSearchBy = Schema.Literals([
  "fiscalCode",
  "name",
  "surname",
  "email",
  "phoneNumber",
  "comune",
])
export type CustomerSearchBy = typeof CustomerSearchBy.Type

const Text = Schema.NullOr(Schema.String)
const Count = Schema.NullOr(Schema.Number)

/** A customer row, as `select().from(customers)`. */
export const Customer = Schema.Struct({
  id: Schema.String,
  fullName: Text,
  name: Text,
  sede: Text,
  surname: Text,
  fiscalCode: Text,
  vatCode: Text,
  email: Text,
  birthdayDate: Schema.NullOr(Schema.Date),
  age: Count,
  phoneNumber: Text,
  address: Text,
  cap: Text,
  blackListStatus: BlackListStatus,
  comune: Text,
  provincia: Text,
  tempID: Schema.String,
  fileName: Text,
  uniqueHash: Schema.String,
  /** A decimal column: its digits, as the driver reads them */
  reddito: Text,
  occupazione: Text,
  ambitoLavorativo: Text,
  tipoContratto: Text,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  lastImportUpdate: Schema.Date,
  chatId: Count,
  operatorId: Count,
  source: CustomerSource,
})
export type Customer = typeof Customer.Type

/** The operator of a row, from a left join: null when it has none. */
const RowOperator = Schema.NullOr(
  Schema.Struct({ id: Schema.Number, name: Text, surname: Text })
)

/** A row of the customers list (`listCustomers`). */
export const CustomerListRow = Schema.Struct({
  id: Schema.String,
  name: Text,
  surname: Text,
  fiscalCode: Text,
  email: Text,
  phoneNumber: Text,
  comune: Text,
  vatCode: Text,
  birthdayDate: Schema.NullOr(Schema.Date),
  blackListStatus: BlackListStatus,
  sede: Text,
  ambitoLavorativo: Text,
  occupazione: Text,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  operatore: RowOperator,
  signedPractices: Schema.Number,
})
export type CustomerListRow = typeof CustomerListRow.Type

/** A practice a customer signed, with their role in it. */
export const CustomerPractice = Schema.Struct({
  id: Schema.Number,
  praticaId: Schema.String,
  productId: Text,
  state: PracticeState,
  dataLiquidazione: Schema.Date,
  customerRole: Schema.NullOr(CustomerRole),
})

/** A customer of a practice, with its operator and their role in it. */
export const PracticeCustomer = Schema.Struct({
  id: Schema.String,
  name: Text,
  surname: Text,
  email: Text,
  fiscalCode: Text,
  vatCode: Text,
  phoneNumber: Text,
  blackListStatus: BlackListStatus,
  operatorId: Count,
  operatorName: Text,
  operatorSurname: Text,
  customerRole: Schema.NullOr(CustomerRole),
})

/** A customer in review or blacklisted (`listCustomersUnderReview`). */
export const CustomerUnderReview = Schema.Struct({
  id: Schema.String,
  name: Text,
  surname: Text,
  fiscalCode: Text,
  vatCode: Text,
  birthdayDate: Schema.NullOr(Schema.Date),
  blackListStatus: BlackListStatus,
  operatore: RowOperator,
  signedPractices: Schema.Number,
})

/** The id a write returns, in an array as `returning` gives it. */
const ReturnedIds = Schema.Array(Schema.Struct({ id: Schema.String }))

/** A string column of `length` characters at most, null or left out. */
const column = (length: number) =>
  Schema.optional(
    Schema.NullOr(Schema.String.check(Schema.isMaxLength(length)))
  )

/**
 * The columns of a customer the client may write, with the limits of
 * `insertCustomerSchema` (drizzle-zod): `tempID`, `uniqueHash` and `source`
 * required, the others optional
 */
const customerColumns = {
  fullName: column(255),
  name: column(255),
  sede: column(255),
  surname: column(255),
  fiscalCode: column(16),
  vatCode: column(255),
  email: column(255),
  birthdayDate: Schema.optional(Schema.NullOr(Schema.Date)),
  age: Schema.optional(Count),
  phoneNumber: column(20),
  address: column(255),
  cap: column(5),
  blackListStatus: Schema.optional(BlackListStatus),
  comune: column(100),
  provincia: column(100),
  tempID: Schema.String.check(Schema.isMaxLength(255)),
  fileName: column(255),
  uniqueHash: Schema.String.check(Schema.isMaxLength(255)),
  reddito: Schema.optional(Text),
  occupazione: column(255),
  ambitoLavorativo: column(255),
  tipoContratto: column(255),
  createdAt: Schema.optional(Schema.Date),
  updatedAt: Schema.optional(Schema.Date),
  lastImportUpdate: Schema.optional(Schema.Date),
  chatId: Schema.optional(Count),
  source: CustomerSource,
}

/**
 * A new customer: the client passes the id (the database default is a
 * constant). No `operatorId`: the operator is whoever creates it
 */
export const NewCustomer = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  ...customerColumns,
})
export type NewCustomer = typeof NewCustomer.Type

/**
 * The master data the form of the detail saves. No `operatorId`: it changes
 * only through `handover` (D13)
 */
export const CustomerProfile = Schema.Struct({
  name: customerColumns.name,
  surname: customerColumns.surname,
  email: customerColumns.email,
  phoneNumber: customerColumns.phoneNumber,
  address: customerColumns.address,
  cap: customerColumns.cap,
  comune: customerColumns.comune,
  provincia: customerColumns.provincia,
  birthdayDate: customerColumns.birthdayDate,
  reddito: customerColumns.reddito,
  occupazione: customerColumns.occupazione,
  ambitoLavorativo: customerColumns.ambitoLavorativo,
  sede: customerColumns.sede,
  source: customerColumns.source,
})
export type CustomerProfile = typeof CustomerProfile.Type

/** A string the server trims, as `z.string().trim()`: the client sends it as is. */
const Trimmed = Schema.String.pipe(Schema.decode(SchemaTransformation.trim()))

/** The codes `getCustomersByFiscalCodeOrVatCode` looks for: at least one. */
export const CustomerCodes = Schema.Struct({
  fiscalCode: Schema.optional(Trimmed),
  vatCode: Schema.optional(Trimmed),
  tempID: Schema.optional(Schema.String),
}).check(
  Schema.makeFilter(
    (codes) => !!codes.fiscalCode || !!codes.vatCode || !!codes.tempID,
    { message: "Either fiscalCode, vatCode or tempID must be provided" }
  )
)

/** A filter of the advanced popover: free strings, as `advancedFilterSchema`. */
export const AdvancedFilter = Schema.Struct({
  field: Schema.String,
  op: Schema.String,
  value: Schema.String,
})

/**
 * One page of the customers list, as `getAllCustomersInput`. Without
 * `searchBy` the search is by fiscal code; an unknown `orderBy` gives the
 * default order; extra keys (the `sqlFilter` of an old frontend) are dropped
 */
export const CustomerListQuery = Schema.Struct({
  page: Schema.Number,
  perPage: Schema.Number,
  searchBy: Schema.optional(CustomerSearchBy),
  q: Schema.optional(Schema.String),
  onlyMe: Schema.optional(Schema.Boolean),
  showDM: Schema.optional(Schema.Boolean),
  orderBy: Schema.optional(Schema.String),
  sortedBy: Schema.optional(Schema.Literals(["asc", "desc"])),
  filterBy: Schema.optional(
    Schema.Struct({
      operatore: Schema.optional(Schema.Number),
      sede: Schema.optional(Schema.Array(Schema.String)),
      ambito: Schema.optional(Schema.Array(Schema.String)),
      jobs: Schema.optional(Schema.Array(Schema.String)),
      file: Schema.optional(Schema.String),
    })
  ),
  advancedFilters: Schema.optional(Schema.Array(AdvancedFilter)),
})
export type CustomerListQuery = typeof CustomerListQuery.Type

const CustomerId = { id: Schema.String.check(Schema.isMinLength(1)) }

/**
 * The procedures of the router `customer`, as H8 maps them:
 *
 * | procedure                          | method and path                            |
 * | ---------------------------------- | ------------------------------------------ |
 * | getAllCustomers                    | POST /customer/search                      |
 * | getCustomersByFiscalCodeOrVatCode  | GET /customer/by-code                      |
 * | getAllCustomerForPratica           | GET /customer/by-practice/:id              |
 * | getCustomerUnderReview             | GET /customer/under-review                 |
 * | getAllAvailableComune              | GET /customer/options/comuni               |
 * | getAllAvaliableSede                | GET /customer/options/sedi                 |
 * | getAllAvailableAmbito              | GET /customer/options/ambiti               |
 * | getAllAvailableJobs                | GET /customer/options/jobs                 |
 * | getAllFileName                     | GET /customer/options/file-names?table=    |
 * | getCustomerById                    | GET /customer/:id                          |
 * | getAllPraticaByCustomer            | GET /customer/:id/practices                |
 * | insertCustomer                     | POST /customer                             |
 * | updateCustomerFromDashboard        | PATCH /customer/:id                        |
 * | handleCustomerBlackList            | POST /customer/:id/blacklist-status        |
 * | handover                           | POST /customer/:id/handover                |
 * | assignToYourself                   | POST /customer/:id/assign-to-yourself      |
 * | updateLastEdit                     | POST /customer/:id/mark-updated            |
 * | bulkUpdateCustomers (admin)        | POST /customer/bulk-assign                 |
 *
 * The static paths win over `/customer/:id`: a customer id is a nanoid of 21
 * characters, never one of them
 */
export class CustomerGroup extends HttpApiGroup.make("customer")
  .add(
    HttpApiEndpoint.post("getAllCustomers", "/customer/search", {
      payload: CustomerListQuery,
      success: Schema.Struct({
        allCustomers: Schema.Array(CustomerListRow),
        total: Schema.Number,
      }),
    })
  )
  .add(
    HttpApiEndpoint.get(
      "getCustomersByFiscalCodeOrVatCode",
      "/customer/by-code",
      { query: CustomerCodes, success: Schema.Array(Customer) }
    )
  )
  .add(
    HttpApiEndpoint.get(
      "getAllCustomerForPratica",
      "/customer/by-practice/:id",
      {
        params: { id: Schema.String },
        success: Schema.Array(PracticeCustomer),
      }
    )
  )
  .add(
    HttpApiEndpoint.get("getCustomerUnderReview", "/customer/under-review", {
      success: Schema.Array(CustomerUnderReview),
    })
  )
  .add(
    HttpApiEndpoint.get("getAllAvailableComune", "/customer/options/comuni", {
      success: Schema.Array(Schema.Struct({ comune: Text })),
    })
  )
  .add(
    HttpApiEndpoint.get("getAllAvaliableSede", "/customer/options/sedi", {
      success: Schema.Array(Schema.Struct({ sede: Text })),
    })
  )
  .add(
    HttpApiEndpoint.get("getAllAvailableAmbito", "/customer/options/ambiti", {
      success: Schema.Array(Schema.Struct({ ambito: Text })),
    })
  )
  .add(
    HttpApiEndpoint.get("getAllAvailableJobs", "/customer/options/jobs", {
      success: Schema.Array(Schema.Struct({ job: Text })),
    })
  )
  .add(
    HttpApiEndpoint.get("getAllFileName", "/customer/options/file-names", {
      query: { table: Schema.Literals(["customers", "practices"]) },
      success: Schema.Array(Schema.Struct({ fileName: Text })),
    })
  )
  .add(
    HttpApiEndpoint.get("getCustomerById", "/customer/:id", {
      params: CustomerId,
      // No customer is null, as the procedure's `undefined`
      success: Schema.NullOr(Customer),
    })
  )
  .add(
    HttpApiEndpoint.get("getAllPraticaByCustomer", "/customer/:id/practices", {
      params: { id: Schema.String },
      success: Schema.Array(CustomerPractice),
    })
  )
  .add(
    HttpApiEndpoint.post("insertCustomer", "/customer", {
      payload: NewCustomer,
      success: ReturnedIds,
    })
  )
  .add(
    HttpApiEndpoint.patch("updateCustomerFromDashboard", "/customer/:id", {
      params: CustomerId,
      payload: CustomerProfile,
      success: ReturnedIds,
    })
  )
  .add(
    HttpApiEndpoint.post(
      "handleCustomerBlackList",
      "/customer/:id/blacklist-status",
      {
        params: CustomerId,
        payload: Schema.Struct({ blackListStatus: BlackListStatus }),
      }
    )
  )
  .add(
    HttpApiEndpoint.post("handover", "/customer/:id/handover", {
      params: { id: Schema.String },
      payload: Schema.Struct({
        toOperatorId: Schema.Number.check(Schema.isInt()),
      }),
      success: Schema.Struct({ contactMoved: Schema.Boolean }),
      error: [
        CustomerNotFound,
        CustomerAssignmentForbidden,
        OperatorNotFound,
        HandoverSameOperator,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post(
      "assignToYourself",
      "/customer/:id/assign-to-yourself",
      {
        params: { id: Schema.String },
        error: [
          CustomerNotFound,
          CustomerAssignmentForbidden,
          OperatorNotFound,
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.post("updateLastEdit", "/customer/:id/mark-updated", {
      params: CustomerId,
    })
  )
  .add(
    HttpApiEndpoint.post("bulkUpdateCustomers", "/customer/bulk-assign", {
      payload: Schema.Struct({
        operatorId: Schema.Number,
        customerIds: Schema.Array(Schema.String),
      }),
      error: [CustomerNotFound, CustomerAssignmentForbidden, OperatorNotFound],
    }).middleware(AdminOnly)
  )
  .middleware(Authenticated) {}

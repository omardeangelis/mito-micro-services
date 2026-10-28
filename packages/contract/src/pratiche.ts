import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { AdvancedFilter, CustomerSource, PracticeState, Text } from "./customer"
import {
  CustomerExists,
  CustomerMissing,
  PracticeExists,
  PracticeNotFound,
} from "./errors"
import { Authenticated } from "./middleware"
import { IntegerId } from "./schemas"

/** A string of `length` characters at most. */
const upTo = (length: number) => Schema.String.check(Schema.isMaxLength(length))

/** A string column of `length` characters at most, null or left out. */
const column = (length: number) => Schema.optional(Schema.NullOr(upTo(length)))

/** A decimal column: its digits as a string, null or left out. */
const decimal = Schema.optional(Text)

/**
 * The columns of a practice the "Nuova pratica" form writes, with the limits
 * of `insertPracticeSchema` (drizzle-zod): no `id`, no operator, no file
 */
export const NewPracticeValues = Schema.Struct({
  praticaId: upTo(255),
  productId: column(2),
  state: PracticeState,
  importoFinanziato: Schema.String,
  importoErogato: Schema.String,
  importoRichiesto: decimal,
  dataLiquidazione: Schema.Date,
  dataEstinzione: Schema.optional(Schema.NullOr(Schema.Date)),
  importoRata: Schema.String,
  // A number, as `z.number()`: NaN never reaches the integer columns
  rateTotali: Schema.Finite,
  ratePagate: Schema.Finite,
  tassoPratica: decimal,
  desPuntoVendita: column(255),
  desConvenzionato: column(255),
  region: column(100),
})
export type NewPracticeValues = typeof NewPracticeValues.Type

/** The address `z.string().email()` of zod 3 accepts. */
export const emailPattern =
  /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i

const Email = Schema.String.check(
  Schema.isPattern(emailPattern, { message: "Invalid email" })
)

/**
 * A new customer the practice adds, with its role: the columns of the form,
 * with the limits of `insertCustomerSchema`. It goes to whoever creates the
 * practice
 */
export const RelatedCustomer = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  name: column(255),
  surname: column(255),
  phoneNumber: column(20),
  fiscalCode: column(16),
  vatCode: column(255),
  email: Email,
  tempID: upTo(255),
  uniqueHash: upTo(255),
  source: CustomerSource,
  role: Schema.Literals(["Coobbligato", "Garante"]),
})
export type RelatedCustomer = typeof RelatedCustomer.Type

/** The "Nuova pratica" form: the practice, its holder and the new customers. */
export const NewPratica = Schema.Struct({
  pratica: NewPracticeValues,
  /** The holder, an existing customer. */
  customerId: Schema.String.check(Schema.isMinLength(1)),
  relatedCustomers: Schema.Array(RelatedCustomer),
})
export type NewPratica = typeof NewPratica.Type

/** An integer, as `z.number().int()`. */
const Integer = Schema.Number.check(Schema.isInt())

/**
 * One page of the practices list, as `getAllPraticheInput` of
 * @mito/domain/practice/listInput: without `orderBy`, `sortedBy` and
 * `searchBy` the handler gives the procedure's defaults; an unknown `orderBy`
 * gives the default order; extra keys (the `sqlFilter` of an old frontend)
 * are dropped
 */
export const PracticeListQuery = Schema.Struct({
  page: Integer,
  perPage: Integer,
  orderBy: Schema.optional(Schema.String),
  sortedBy: Schema.optional(Schema.Literals(["asc", "desc"])),
  searchBy: Schema.optional(Schema.Literals(["praticaId"])),
  filterBy: Schema.optional(
    Schema.Struct({
      state: Schema.optional(PracticeState),
      productId: Schema.optional(Schema.String),
      file: Schema.optional(Schema.String),
      onlyMe: Schema.optional(Schema.Boolean),
    })
  ),
  q: Schema.optional(Schema.String),
  advancedFilters: Schema.optional(Schema.Array(AdvancedFilter)),
})
export type PracticeListQuery = typeof PracticeListQuery.Type

/** A row of the practices list (`listPractices`). */
export const PracticeListRow = Schema.Struct({
  id: Schema.Number,
  praticaId: Schema.String,
  productId: Text,
  /** `cast(… as numeric)`: its digits, as the driver reads a numeric */
  importoFinanziato: Schema.String,
  importoErogato: Schema.String,
  dataLiquidazione: Schema.Date,
  stato: PracticeState,
  importoRata: Schema.String,
  rateTotali: Schema.Number,
  ratePagate: Schema.Number,
  updatedAt: Schema.Date,
  createdAt: Schema.Date,
  operatore: Text,
})
export type PracticeListRow = typeof PracticeListRow.Type

/** A practice, with its operator (`getPracticeById`). */
export const Practice = Schema.Struct({
  id: Schema.Number,
  praticaId: Schema.String,
  productId: Text,
  state: PracticeState,
  importoFinanziato: Schema.String,
  importoErogato: Schema.String,
  dataLiquidazione: Schema.Date,
  importoRata: Schema.String,
  rateTotali: Schema.Number,
  ratePagate: Schema.Number,
  chatId: Schema.NullOr(Schema.Number),
  updatedAt: Schema.Date,
  desPuntoVendita: Text,
  // From a left join: null when the practice has no operator
  operator: Schema.NullOr(
    Schema.Struct({ id: Schema.Number, name: Text, surname: Text })
  ),
})
export type Practice = typeof Practice.Type

/**
 * The email and the phone number of a customer of a practice, with the limits
 * of `insertCustomerSchema`: at least one of the two
 */
export const CustomerPreview = Schema.Struct({
  email: column(255),
  phoneNumber: column(20),
}).check(
  Schema.makeFilter(
    (values) => values.email !== undefined || values.phoneNumber !== undefined,
    { message: "Serve almeno uno fra email e telefono" }
  )
)
export type CustomerPreview = typeof CustomerPreview.Type

/**
 * The group `pratiche`: the procedures of the tRPC router `pratiche`, each
 * with its name (H8).
 *
 * | procedure                  | method and path                       |
 * | -------------------------- | ------------------------------------- |
 * | getAllPratiche             | POST /pratiche/search                 |
 * | getAllAvailableRegion      | GET /pratiche/regions                 |
 * | getPraticaById             | GET /pratiche/by-pratica-id/:id       |
 * | createPratica              | POST /pratiche                        |
 * | updatePraticaFromDashboard | PATCH /pratiche/:id/state             |
 * | updateCustomerPreview      | PATCH /pratiche/customer-preview/:id  |
 *
 * The practice of `getPraticaById` is its `praticaId`, a free string: it has
 * a path of its own, so no `praticaId` is taken for `regions`. The one of
 * `updatePraticaFromDashboard` is the integer `id`; the one of
 * `updateCustomerPreview` is the customer's
 */
export class PraticheGroup extends HttpApiGroup.make("pratiche")
  .add(
    HttpApiEndpoint.post("getAllPratiche", "/pratiche/search", {
      payload: PracticeListQuery,
      // `total` is the array `[{ total }]` of the procedure
      success: Schema.Struct({
        total: Schema.Array(Schema.Struct({ total: Schema.Number })),
        data: Schema.Array(PracticeListRow),
      }),
    })
  )
  .add(
    HttpApiEndpoint.get("getAllAvailableRegion", "/pratiche/regions", {
      // The regions of the practices, null among them when one has none
      success: Schema.Array(Schema.Struct({ region: Text })),
    })
  )
  .add(
    HttpApiEndpoint.post("createPratica", "/pratiche", {
      payload: NewPratica,
      success: Schema.Struct({ praticaId: Schema.String }),
      // `CustomerMissing`: the holder doesn't exist, and nothing is written
      error: [PracticeExists, CustomerExists, CustomerMissing],
    })
  )
  .add(
    HttpApiEndpoint.get("getPraticaById", "/pratiche/by-pratica-id/:id", {
      params: { id: Schema.String },
      success: Practice,
      error: PracticeNotFound,
    })
  )
  .add(
    HttpApiEndpoint.patch("updatePraticaFromDashboard", "/pratiche/:id/state", {
      params: { id: IntegerId },
      payload: Schema.Struct({ state: PracticeState }),
      // The practice written: none when the id isn't one
      success: Schema.Array(Schema.Struct({ id: Schema.Number })),
    })
  )
  .add(
    HttpApiEndpoint.patch(
      "updateCustomerPreview",
      "/pratiche/customer-preview/:id",
      {
        params: { id: Schema.String.check(Schema.isMinLength(1)) },
        payload: CustomerPreview,
      }
    )
  )
  .middleware(Authenticated) {}

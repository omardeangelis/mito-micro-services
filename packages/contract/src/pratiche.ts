import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { CustomerSource, PracticeState, Text } from "./customer"
import { CustomerExists, CustomerMissing, PracticeExists } from "./errors"
import { Authenticated } from "./middleware"

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
  rateTotali: Schema.Number,
  ratePagate: Schema.Number,
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

/**
 * The group `pratiche` (3.1 of brain/chore/migrazione-frontend-react.md), as
 * far as the pages already in React need it: the procedures of the tRPC
 * router `pratiche`, each with its name (H8).
 *
 * | procedure             | method and path        |
 * | --------------------- | ---------------------- |
 * | getAllAvailableRegion | GET /pratiche/regions  |
 * | createPratica         | POST /pratiche         |
 */
export class PraticheGroup extends HttpApiGroup.make("pratiche")
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
  .middleware(Authenticated) {}

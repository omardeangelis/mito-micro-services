import { Schema } from "effect"
import { parseInputValue, parseStringToNumber } from "@mito/client/format"

// The pieces of the customer forms of the Next.js app (new customer, the
// master data of the detail), written as `Schema` for their resolver

/** A string column of `length` characters at most, null or left out */
export const column = (length: number) =>
  Schema.optional(
    Schema.NullOr(Schema.String.check(Schema.isMaxLength(length)))
  )

/**
 * The reddito as the user types it, "10000", "1000.50" or "1000,50": empty,
 * or a number. `sanitizeRedditoValue` turns it into the decimal point
 */
export const redditoValue = Schema.optional(
  Schema.NullOr(
    Schema.String.check(
      Schema.makeFilter(
        (val) => {
          // Se è vuoto, è valido (campo opzionale)
          if (val === "") return true
          // Prova a parsare il valore: se dopo il parsing è vuoto, non era un
          // numero valido
          const parsed = parseInputValue(val)
          if (!parsed || parsed === "") return false
          const num = parseStringToNumber(parsed)
          return !isNaN(num) && isFinite(num)
        },
        { message: "Il reddito deve essere un numero valido" }
      )
    )
  )
)

const CODE_REQUIRED = "Uno tra Partita Iva e Codice Fiscale è obbligatorio"

/** One between the VAT code and the fiscal code: the issue goes on both */
export const codeIssues = Schema.makeFilter(
  (customer: {
    vatCode?: string | undefined
    fiscalCode?: string | undefined
  }) =>
    !customer.vatCode && !customer.fiscalCode
      ? [
          { path: ["vatCode"], issue: CODE_REQUIRED },
          { path: ["fiscalCode"], issue: CODE_REQUIRED },
        ]
      : undefined
)

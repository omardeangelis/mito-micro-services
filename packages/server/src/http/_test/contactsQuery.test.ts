import { Exit, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { ContactsQuery } from "@mito/contract/task"
import { getContactsInput } from "@mito/domain/contact/listInput"

/** The payload as the backend decodes it, or null when it doesn't pass. */
const decoded = (input: unknown) => {
  const exit = Schema.decodeUnknownExit(ContactsQuery)(input)
  return Exit.isSuccess(exit) ? exit.value : null
}

const tooLong = (length: number) => "a".repeat(length)

// The contract writes the limits of `getContactsInput` again, since it
// doesn't import @mito/domain (H5): the two must accept the same inputs
const inputs: Array<[string, unknown]> = [
  ["vuoto", {}],
  [
    "tutto",
    {
      page: 3,
      perPage: 50,
      orderBy: "customer",
      sortedBy: "asc",
      operatorIds: [0, 7],
      onlyMe: true,
      states: ["chiamare", "app.to"],
      priorities: ["low", "urgent"],
      customerQuery: "  Rossi ",
      customerId: "abc",
      dateField: "nextAlert",
      from: "2026-02-28",
      to: "2100-12-31",
      hasAlert: true,
      includeInactive: true,
    },
  ],
  ["pagina 0", { page: 0 }],
  ["pagina 10.000", { page: 10_000 }],
  ["pagina 10.001", { page: 10_001 }],
  ["pagina non intera", { page: 1.5 }],
  ["pagina come testo", { page: "1" }],
  ["perPage 500", { perPage: 500 }],
  ["perPage 30", { perPage: 30 }],
  ["orderBy sconosciuto", { orderBy: "name" }],
  ["sortedBy sconosciuto", { sortedBy: "up" }],
  ["operatore negativo", { operatorIds: [-1] }],
  ["operatore oltre l'intero", { operatorIds: [2_147_483_648] }],
  ["operatore all'intero", { operatorIds: [2_147_483_647] }],
  ["100 operatori", { operatorIds: Array.from({ length: 100 }, (_, i) => i) }],
  ["101 operatori", { operatorIds: Array.from({ length: 101 }, (_, i) => i) }],
  ["stato sconosciuto", { states: ["boh"] }],
  [
    "tutti gli stati",
    {
      states: [
        "chiamare",
        "non interessato",
        "app.to",
        "caricato",
        "richiamare",
        "non risponde",
        "erogata",
        "nessuno",
        "followup",
      ],
    },
  ],
  [
    "uno stato di troppo",
    { states: Array.from({ length: 10 }, () => "chiamare") },
  ],
  ["fascia sconosciuta", { priorities: ["max"] }],
  ["una fascia di troppo", { priorities: ["low", "low", "low", "low", "low"] }],
  ["testo di 100", { customerQuery: tooLong(100) }],
  ["testo di 101", { customerQuery: tooLong(101) }],
  ["testo di 100 con spazi", { customerQuery: `  ${tooLong(100)}  ` }],
  ["testo con NUL", { customerQuery: "a\u0000b" }],
  ["cliente di 64", { customerId: tooLong(64) }],
  ["cliente di 65", { customerId: tooLong(65) }],
  ["cliente con NUL", { customerId: "a\u0000" }],
  ["dateField sconosciuto", { dateField: "updatedAt" }],
  ["giorno che non esiste", { from: "2026-02-30" }],
  ["giorno del 1999", { from: "1999-12-31" }],
  ["giorno del 2101", { to: "2101-01-01" }],
  ["giorno con l'ora", { from: "2026-02-01T00:00" }],
  ["onlyMe come testo", { onlyMe: "true" }],
  ["chiave in più", { page: 1, sqlFilter: "1=1" }],
  ["non un oggetto", "page=1"],
]

describe("ContactsQuery del contratto", () => {
  it.each(inputs)(
    "accetta quello che getContactsInput accetta: %s",
    (_, input) => {
      expect(decoded(input) !== null).toBe(
        getContactsInput.safeParse(input).success
      )
    }
  )

  it.each(inputs)(
    "con i default di getContactsInput dà gli stessi filtri: %s",
    (_, input) => {
      const payload = decoded(input)
      if (payload === null) return
      expect(getContactsInput.parse(payload)).toEqual(
        getContactsInput.parse(input)
      )
    }
  )
})

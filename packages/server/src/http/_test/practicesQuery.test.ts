import { Exit, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { PracticeListQuery } from "@mito/contract/pratiche"
import { getAllPraticheInput } from "@mito/domain/practice/listInput"

/** The payload as the backend decodes it, or null when it doesn't pass. */
const decoded = (input: unknown) => {
  const exit = Schema.decodeUnknownExit(PracticeListQuery)(input)
  return Exit.isSuccess(exit) ? exit.value : null
}

// The contract writes `getAllPraticheInput` again, since it doesn't import
// @mito/domain (H5): the two must accept the same inputs
const inputs: Array<[string, unknown]> = [
  ["solo la pagina", { page: 1, perPage: 30 }],
  [
    "tutto",
    {
      page: 2,
      perPage: 50,
      orderBy: "importoFinanziato",
      sortedBy: "desc",
      searchBy: "praticaId",
      filterBy: {
        state: "Liquidata",
        productId: "CQS-PP",
        file: "import.xlsx",
        onlyMe: true,
      },
      q: "123",
      advancedFilters: [{ field: "importoFinanziato", op: "gt", value: "5" }],
    },
  ],
  ["vuoto", {}],
  ["senza perPage", { page: 1 }],
  ["pagina non intera", { page: 1.5, perPage: 30 }],
  ["pagina come testo", { page: "1", perPage: 30 }],
  ["orderBy sconosciuto", { page: 1, perPage: 30, orderBy: "boh" }],
  ["sortedBy sconosciuto", { page: 1, perPage: 30, sortedBy: "up" }],
  ["searchBy sconosciuto", { page: 1, perPage: 30, searchBy: "customer" }],
  [
    "stato sconosciuto",
    { page: 1, perPage: 30, filterBy: { state: "Erogata" } },
  ],
  ["filterBy vuoto", { page: 1, perPage: 30, filterBy: {} }],
  ["onlyMe come testo", { page: 1, perPage: 30, filterBy: { onlyMe: "true" } }],
  [
    "filtro avanzato incompleto",
    { page: 1, perPage: 30, advancedFilters: [{ field: "a", op: "eq" }] },
  ],
  ["chiave in più", { page: 1, perPage: 30, sqlFilter: "1=1" }],
  ["non un oggetto", "page=1"],
]

describe("PracticeListQuery del contratto", () => {
  it.each(inputs)(
    "accetta quello che getAllPraticheInput accetta: %s",
    (_, input) => {
      expect(decoded(input) !== null).toBe(
        getAllPraticheInput.safeParse(input).success
      )
    }
  )

  it.each(inputs)(
    "con i default di getAllPraticheInput dà gli stessi filtri: %s",
    (_, input) => {
      const payload = decoded(input)
      if (payload === null) return
      expect(getAllPraticheInput.parse(payload)).toEqual(
        getAllPraticheInput.parse(input)
      )
    }
  )
})

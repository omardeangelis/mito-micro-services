import { describe, expect, test } from "vitest"
import {
  MAX_ROWS,
  expectedRowsSchema,
  fileBodySchema,
  fromFileBody,
  lookupKeysSchema,
  toFileBody,
} from "../payload"

// The bodies the browser sends and the server parses (D3, D10)

describe("corpo delle righe", () => {
  const rows = [
    { row: 2, cells: { PRATICA: "000123", NUMERO_RATE: 24, NOTE: "" } },
    { row: 4, cells: { PRATICA: "000124", NUMERO_RATE: null } },
  ]
  const columns = ["PRATICA", "NUMERO_RATE", "NOTE"]

  test("dalle righe al corpo compatto e ritorno: le celle che mancano sono null", () => {
    const body = toFileBody(columns, rows)

    expect(body).toEqual({
      columns,
      rows: [
        [2, ["000123", 24, ""]],
        [4, ["000124", null, null]],
      ],
    })
    expect(fileBodySchema.parse(body)).toEqual(body)
    expect(fromFileBody(body)).toEqual([
      rows[0],
      { row: 4, cells: { PRATICA: "000124", NUMERO_RATE: null, NOTE: null } },
    ])
  })

  test.each([
    {
      name: "una riga con meno celle delle colonne",
      body: { columns, rows: [[2, ["000123", 24]]] },
    },
    {
      name: "numeri di riga che non crescono",
      body: {
        columns,
        rows: [
          [3, ["a", 1, null]],
          [3, ["b", 2, null]],
        ],
      },
    },
    {
      name: "la riga 1, che è delle intestazioni",
      body: { columns, rows: [[1, ["a", 1, null]]] },
    },
    { name: "colonne ripetute", body: { columns: ["A", "A"], rows: [] } },
    { name: "nessuna colonna", body: { columns: [], rows: [] } },
    {
      name: "una cella oggetto",
      body: { columns: ["A"], rows: [[2, [{ v: 1 }]]] },
    },
    {
      name: "una cella più lunga di quanto Excel permette",
      body: { columns: ["A"], rows: [[2, ["x".repeat(32_768)]]] },
    },
  ])("rifiuta $name", ({ body }) => {
    expect(fileBodySchema.safeParse(body).success).toBe(false)
  })

  test(`al massimo ${MAX_ROWS} righe`, () => {
    const many = (count: number) => ({
      columns: ["A"],
      rows: Array.from({ length: count }, (_, i) => [i + 2, [i]]),
    })

    expect(fileBodySchema.safeParse(many(MAX_ROWS)).success).toBe(true)
    expect(fileBodySchema.safeParse(many(MAX_ROWS + 1)).success).toBe(false)
  })
})

describe("chiavi ed esito atteso", () => {
  test("le chiavi sono testi non vuoti di al massimo 255 caratteri", () => {
    const keys = {
      fiscalCodes: ["RSSMRA80A01H501U"],
      vatCodes: [],
      customerCodes: ["5001"],
      praticaIds: ["000123"],
    }

    expect(lookupKeysSchema.parse(keys)).toEqual(keys)
    expect(
      lookupKeysSchema.safeParse({ ...keys, customerCodes: [""] }).success
    ).toBe(false)
    expect(
      lookupKeysSchema.safeParse({ ...keys, praticaIds: ["x".repeat(256)] })
        .success
    ).toBe(false)
  })

  test("l'esito atteso sono numeri di riga del foglio", () => {
    expect(expectedRowsSchema.parse({ rows: [2, 3, 10] })).toEqual({
      rows: [2, 3, 10],
    })
    expect(expectedRowsSchema.safeParse({ rows: [1.5] }).success).toBe(false)
  })
})

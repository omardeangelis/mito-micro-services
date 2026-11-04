import { describe, expect, it } from "vitest"
import { properNames } from "../../_lib/text"
import {
  defaultWhich,
  giversOf,
  selectionOf,
  whichCounts,
} from "../_lib/selection"

const names = new Map([
  [1, { name: "Carla Bianchi", userId: "u1" }],
  [2, { name: "Dario Verdi", userId: "u2" }],
])

const givers = giversOf(
  [1, 2],
  [
    {
      operatorId: 1,
      contacts: [
        { taskId: 10, state: "noAnswer" },
        { taskId: 11, state: "toCall" },
        { taskId: 12, state: "toCall" },
        { taskId: 13, state: "noAnswer" },
      ],
    },
    { operatorId: 2, contacts: [{ taskId: 20, state: "toCall" }] },
  ],
  names
)

describe("La selezione di «Quali e quanti contatti» (AC24, D7)", () => {
  it("somma le opzioni sugli scelti e sceglie la prima non a 0", () => {
    expect(whichCounts(givers)).toEqual({ both: 5, toCall: 3, noAnswer: 2 })
    expect(defaultWhich({ both: 0, toCall: 0, noAnswer: 0 })).toBe("both")
    expect(defaultWhich(whichCounts(givers.slice(1)))).toBe("both")
  })

  it("prende i primi «Da spostare» di ognuno, nell'ordine dei candidati, del tipo scelto", () => {
    const selection = selectionOf({
      givers,
      which: "toCall",
      howMany: "each",
      written: "1",
    })
    expect(selection.contacts).toEqual([
      { fromOperatorId: 1, taskIds: [11] },
      { fromOperatorId: 2, taskIds: [20] },
    ])
    expect(selection.total).toBe(2)
  })

  it("il campo parte dal suo massimo e un numero fuori intervallo non è valido", () => {
    expect(
      selectionOf({ givers, which: "both", howMany: "each", written: null })
    ).toMatchObject({ max: 4, text: "4", valid: true, total: 5 })
    expect(
      selectionOf({ givers, which: "both", howMany: "total", written: "6" })
    ).toMatchObject({ max: 5, valid: false, total: 0, contacts: [] })
  })

  it("chi non è più nel team esce", () => {
    expect(giversOf([1, 3], [], names).map((g) => g.operatorId)).toEqual([1])
  })
})

describe("I nomi propri nei testi (Definizioni)", () => {
  it("dice il nome proprio, e nome e cognome a chi lo condivide", () => {
    expect(properNames(["Carla Bianchi", "Dario Verdi"])).toBe("Carla e Dario")
    expect(properNames(["Carla Bianchi", "Carla Neri", "Dario Verdi"])).toBe(
      "Carla Bianchi, Carla Neri e Dario"
    )
    expect(properNames(["Ada Lovelace"])).toBe("Ada")
  })
})

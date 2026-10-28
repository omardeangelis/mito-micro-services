import { describe, expect, it } from "vitest"
import {
  type ContactsListState,
  activeFilters,
  customerContactsState,
  defaultState,
  detailHref,
  parse,
  returnHref,
  seeContactsHref,
  serialize,
  toContactsInput,
  withFilterChange,
} from "@/app/dashboard/contatti/_lib/searchParams"
import { DEFAULT_PER_PAGE, PER_PAGES } from "@mito/domain/constants/pagination"
import {
  MAX_OPERATOR_IDS,
  getContactsInput,
} from "@mito/domain/contact/listInput"
import { priorityBands } from "@mito/domain/contact/priority"
import { allStates } from "@mito/domain/contact/status"

/** What Next hands a page for an address: its query string, as a record. */
const toRecord = (query: string) =>
  Object.fromEntries(new URLSearchParams(query))

/** A state with every filter set and every list in its fixed order. */
const everything: ContactsListState = {
  q: "mario rossi",
  operatorIds: [0, 3, 12],
  states: ["chiamare", "nessuno", "followup"],
  priorities: ["low", "high", "urgent"],
  dateField: "nextAlert",
  from: "2026-01-10",
  to: "2026-02-20",
  onlyMe: true,
  hasAlert: true,
  includeInactive: true,
  customerId: "c1a2-b3",
  orderBy: "updatedAt",
  sortedBy: "asc",
  page: 3,
  perPage: 100,
}

describe("parse", () => {
  it("drops an invalid value without touching the valid ones, nor the parameters next to it (AC18)", () => {
    const state = parse({ stato: "chiamare,inesistente", operatore: "abc" })

    expect(state.states).toEqual(["chiamare"])
    expect(state.operatorIds).toEqual([])
  })

  it("drops a page size that PER_PAGES lacks and keeps the page next to it (AC18)", () => {
    const state = parse({ per_pagina: "7", pagina: "3" })

    expect(state.perPage).toBe(DEFAULT_PER_PAGE)
    expect(state.page).toBe(3)
  })

  it("drops a sort column that doesn't exist and keeps the direction next to it (AC18)", () => {
    const state = parse({ ordina: "inesistente", verso: "asc" })

    expect(state.orderBy).toBe("priority")
    expect(state.sortedBy).toBe("asc")
  })

  it("drops a priority band that doesn't exist and keeps the flag next to it (AC18)", () => {
    const state = parse({ priorita: "critica", alert: "1" })

    expect(state.priorities).toEqual([])
    expect(state.hasAlert).toBe(true)
  })

  it("drops a date field that doesn't exist and keeps the search text next to it (AC18)", () => {
    const state = parse({ data: "boh", q: "mario" })

    expect(state.dateField).toBe("closedAt")
    expect(state.q).toBe("mario")
  })

  it("drops a day that doesn't exist and keeps the other end of the range (AC18)", () => {
    const state = parse({ dal: "2026-02-30", al: "2026-03-01" })

    expect(state.from).toBeUndefined()
    expect(state.to).toBe("2026-03-01")
  })

  it.each(["miei", "alert", "precedenti"] as const)(
    "reads the flag %s as set only when it is 1 (AC18)",
    (flag) => {
      const read = (value: string) => parse({ [flag]: value })
      const fields = {
        miei: "onlyMe",
        alert: "hasAlert",
        precedenti: "includeInactive",
      } as const

      expect(read("1")[fields[flag]]).toBe(true)
      for (const value of ["0", "si", "true", "", "11"]) {
        expect(read(value)[fields[flag]]).toBe(false)
      }
    }
  )

  it("drops both ends of a range that runs backwards and keeps the customer next to it (AC18)", () => {
    const state = parse({
      dal: "2026-03-02",
      al: "2026-03-01",
      cliente: "abc",
    })

    expect(state.from).toBeUndefined()
    expect(state.to).toBeUndefined()
    expect(state.customerId).toBe("abc")
  })

  it("drops a flag that isn't 1 and keeps the flag next to it (AC18)", () => {
    const state = parse({ miei: "si", precedenti: "1" })

    expect(state.onlyMe).toBe(false)
    expect(state.includeInactive).toBe(true)
  })

  it.each(["0", "99999"])(
    "drops page %s, out of range, and keeps the page size next to it (AC18)",
    (pagina) => {
      const state = parse({ pagina, per_pagina: "50" })

      expect(state.page).toBe(1)
      expect(state.perPage).toBe(50)
    }
  )

  it("reads an empty customer or a blank search as no filter at all (AC18)", () => {
    const state = parse({ cliente: "", q: "   ", stato: "chiamare" })

    expect(state.customerId).toBeUndefined()
    expect(state.q).toBeUndefined()
    expect(state.states).toEqual(["chiamare"])
  })

  it("reads the operator ids in ascending order, once each, and drops what a column can't take (AC18)", () => {
    const state = parse({ operatore: "5,0,abc,5,3,-1,1.5,2147483648" })

    expect(state.operatorIds).toEqual([0, 3, 5])
  })

  it("drops a parameter that is repeated, whole, and keeps the ones next to it (AC18)", () => {
    const state = parse({ stato: ["chiamare", "richiamare"], pagina: "2" })

    expect(state.states).toEqual([])
    expect(state.page).toBe(2)
  })

  it("gives the defaults when nothing is asked: priority descending, page 1, no filter", () => {
    expect(parse({})).toEqual({
      q: undefined,
      operatorIds: [],
      states: [],
      priorities: [],
      dateField: "closedAt",
      from: undefined,
      to: undefined,
      onlyMe: false,
      hasAlert: false,
      includeInactive: false,
      customerId: undefined,
      orderBy: "priority",
      sortedBy: "desc",
      page: 1,
      perPage: DEFAULT_PER_PAGE,
    })
  })

  it("ignores a parameter it doesn't know, and a missing query string", () => {
    expect(parse({ boh: "1", pagina: "2" }).page).toBe(2)
    expect(parse({ boh: "1" })).toEqual(parse({}))
    expect(parse(undefined)).toEqual(parse({}))
  })

  it("holds the search text to 100 characters and the customer id to 64, with no NUL (AC18)", () => {
    expect(parse({ q: "x".repeat(100) }).q).toBe("x".repeat(100))
    expect(parse({ q: "x".repeat(101) }).q).toBeUndefined()
    expect(parse({ q: "  mario  " }).q).toBe("mario")
    expect(parse({ q: "ma\u0000rio" }).q).toBeUndefined()
    expect(parse({ cliente: "c".repeat(64) }).customerId).toBe("c".repeat(64))
    expect(parse({ cliente: "c".repeat(65) }).customerId).toBeUndefined()
    expect(parse({ cliente: "c\u0000" }).customerId).toBeUndefined()
  })

  it.each<[string, number[]]>([
    ["5,,3", [3, 5]],
    [",5,", [5]],
    [",", []],
    ["3.0", []],
    ["5,3.0,7", [5, 7]],
    ["1e1", []],
    ["5,0x10,3", [3, 5]],
    [" 5", []],
    ["+5", []],
  ])(
    "reads operatore=%s as the ids made of digits only and keeps the page next to it (AC18)",
    (operatore, operatorIds) => {
      const state = parse({ operatore, pagina: "2" })

      expect(state.operatorIds).toEqual(operatorIds)
      expect(state.page).toBe(2)
    }
  )

  it.each(["0x10", "1e1", " 5", "+5", "5.0", "5 "])(
    "drops pagina=%j, which isn't digits only, and keeps the page size next to it (AC18)",
    (pagina) => {
      const state = parse({ pagina, per_pagina: "50" })

      expect(state.page).toBe(1)
      expect(state.perPage).toBe(50)
    }
  )

  it.each(["5e1", "0x32", " 50", "+50", "50.0", "50 "])(
    "drops per_pagina=%j, which isn't digits only, and keeps the page next to it (AC18)",
    (per_pagina) => {
      const state = parse({ per_pagina, pagina: "2" })

      expect(state.perPage).toBe(DEFAULT_PER_PAGE)
      expect(state.page).toBe(2)
    }
  )

  it("keeps at most MAX_OPERATOR_IDS operators, the lowest ids, whatever the order of the address", () => {
    const ids = Array.from({ length: 150 }, (_, index) => index + 1)
    const descending = [...ids].reverse().join(",")

    const state = parse({ operatore: descending, pagina: "2" })

    expect(state.operatorIds).toHaveLength(MAX_OPERATOR_IDS)
    expect(state.operatorIds).toEqual(ids.slice(0, MAX_OPERATOR_IDS))
    expect(state.page).toBe(2)
    expect(getContactsInput.safeParse(toContactsInput(state)).success).toBe(
      true
    )
  })

  it("keeps all the operators of an address that has exactly MAX_OPERATOR_IDS", () => {
    const ids = Array.from({ length: MAX_OPERATOR_IDS }, (_, index) => index)

    const state = parse({ operatore: ids.join(",") })

    expect(state.operatorIds).toEqual(ids)
    expect(getContactsInput.safeParse(toContactsInput(state)).success).toBe(
      true
    )
  })

  it("counts an operator once and ignores what isn't one when it holds the operators to MAX_OPERATOR_IDS", () => {
    const ids = Array.from({ length: MAX_OPERATOR_IDS }, (_, index) => index)
    const noisy = [...ids, ...ids, "abc", "", "-1"].join(",")

    expect(parse({ operatore: noisy }).operatorIds).toEqual(ids)
  })

  it("holds the operators of the address a return leads to as well", () => {
    const ids = Array.from({ length: 150 }, (_, index) => index + 1)

    expect(returnHref(`operatore=${ids.join(",")}`)).toBe(
      `/dashboard/contatti?operatore=${ids.slice(0, MAX_OPERATOR_IDS).join(",")}`
    )
  })
})

describe("serialize", () => {
  it("writes nothing for the default state", () => {
    expect(serialize(defaultState)).toBe("")
  })

  it("writes only what differs from the default, in a fixed order", () => {
    const state = {
      ...defaultState,
      perPage: 50,
      page: 2,
      states: ["richiamare" as const],
    }

    expect(serialize(state)).toBe("?stato=richiamare&pagina=2&per_pagina=50")
  })

  it("writes the sort column and the direction together when either differs", () => {
    expect(serialize({ ...defaultState, orderBy: "createdAt" })).toBe(
      "?ordina=creato&verso=desc"
    )
    expect(serialize({ ...defaultState, sortedBy: "asc" })).toBe(
      "?ordina=priorita&verso=asc"
    )
    expect(
      serialize({ ...defaultState, orderBy: "customer", sortedBy: "asc" })
    ).toBe("?ordina=cliente&verso=asc")
  })

  it("writes every parameter in the fixed order", () => {
    const state: ContactsListState = {
      q: "mario rossi",
      operatorIds: [0, 3],
      states: ["chiamare", "followup"],
      priorities: ["high", "urgent"],
      dateField: "createdAt",
      from: "2026-01-10",
      to: "2026-02-20",
      onlyMe: true,
      hasAlert: true,
      includeInactive: true,
      customerId: "abc",
      orderBy: "updatedAt",
      sortedBy: "asc",
      page: 3,
      perPage: 100,
    }

    expect(serialize(state)).toBe(
      "?q=mario+rossi&operatore=0,3&stato=chiamare,followup&priorita=alta,urgente" +
        "&data=creato&dal=2026-01-10&al=2026-02-20&miei=1&alert=1&cliente=abc" +
        "&precedenti=1&ordina=aggiornato&verso=asc&pagina=3&per_pagina=100"
    )
  })

  it("writes a list in a fixed order, once each item", () => {
    const state: ContactsListState = {
      ...defaultState,
      operatorIds: [5, 0, 5],
      states: ["richiamare", "chiamare", "richiamare"],
      priorities: ["urgent", "low", "urgent"],
    }

    expect(serialize(state)).toBe(
      "?operatore=0,5&stato=chiamare,richiamare&priorita=bassa,urgente"
    )
  })
})

describe("parse and serialize together", () => {
  it.each<[string, ContactsListState]>([
    ["the default state", defaultState],
    ["a state with every filter", everything],
    [
      "a search with the characters an address treats as its own",
      { ...defaultState, q: "è & = # % + , ? / ü 😀" },
    ],
    [
      "a customer id with a slash and a space",
      { ...defaultState, customerId: "a/b c" },
    ],
    ["a single day", { ...defaultState, from: "2026-03-01", to: "2026-03-01" }],
    ["page 10000", { ...defaultState, page: 10_000 }],
    ["the last page size", { ...defaultState, perPage: 500 }],
    ["every state at once", { ...defaultState, states: [...allStates] }],
    [
      "every priority band at once",
      { ...defaultState, priorities: [...priorityBands] },
    ],
  ])("reads back the state it wrote: %s", (_name, state) => {
    expect(parse(toRecord(serialize(state)))).toEqual(state)
  })

  it.each(allStates)("round-trips the state %s", (stato) => {
    const state = { ...defaultState, states: [stato] }

    expect(parse(toRecord(serialize(state)))).toEqual(state)
  })

  it.each([
    "priority",
    "closedAt",
    "nextAlert",
    "createdAt",
    "updatedAt",
    "customer",
  ] as const)(
    "round-trips the sort column %s in both directions",
    (orderBy) => {
      for (const sortedBy of ["asc", "desc"] as const) {
        const state = { ...defaultState, orderBy, sortedBy }

        expect(parse(toRecord(serialize(state)))).toEqual(state)
      }
    }
  )

  it.each(["closedAt", "nextAlert", "createdAt"] as const)(
    "round-trips the date field %s",
    (dateField) => {
      const state = { ...defaultState, dateField }

      expect(parse(toRecord(serialize(state)))).toEqual(state)
    }
  )

  it("writes one address for the same state, whatever the order of the parameters (AC16)", () => {
    const one = parse({
      stato: "richiamare,chiamare,chiamare",
      pagina: "2",
      operatore: "5,0",
      miei: "1",
    })
    const other = parse({
      miei: "1",
      operatore: "0,5",
      pagina: "2",
      stato: "chiamare,richiamare",
    })

    expect(serialize(one)).toBe(serialize(other))
    expect(serialize(one)).toBe(
      "?operatore=0,5&stato=chiamare,richiamare&miei=1&pagina=2"
    )
  })

  it("settles an address with dirt in it into one that reads back as itself (AC18)", () => {
    const dirty = {
      stato: "chiamare,inesistente",
      operatore: "abc",
      pagina: "0",
      boh: "1",
      dal: "2026-03-02",
      al: "2026-03-01",
    }
    const state = parse(dirty)

    expect(serialize(state)).toBe("?stato=chiamare")
    expect(parse(toRecord(serialize(state)))).toEqual(state)
  })
})

describe("withFilterChange", () => {
  it("applies the change and goes back to page 1 (AC17)", () => {
    const state = { ...defaultState, page: 3, perPage: 50 }

    const next = withFilterChange(state, { states: ["richiamare"] })

    expect(next.states).toEqual(["richiamare"])
    expect(next.page).toBe(1)
    expect(next.perPage).toBe(50)
    expect(state.page).toBe(3)
    expect(serialize(next)).toBe("?stato=richiamare&per_pagina=50")
  })

  it("goes back to page 1 for a change of order too, and whatever page the change carries (AC17)", () => {
    const state = { ...defaultState, page: 3 }

    expect(
      withFilterChange(state, { orderBy: "createdAt", sortedBy: "asc" }).page
    ).toBe(1)
    expect(withFilterChange(state, { onlyMe: true, page: 5 }).page).toBe(1)
  })

  it("clears a filter the change sets to undefined", () => {
    const state = { ...defaultState, q: "mario", page: 2 }

    expect(withFilterChange(state, { q: undefined }).q).toBeUndefined()
  })
})

describe("toContactsInput", () => {
  it("turns the words of the address into the values getContacts takes", () => {
    const state = parse({
      q: "  rossi ",
      operatore: "3,0",
      stato: "richiamare,nessuno",
      priorita: "bassa,urgente",
      data: "alert",
      dal: "2026-01-10",
      al: "2026-02-20",
      miei: "1",
      alert: "1",
      cliente: "c1a2",
      precedenti: "1",
      ordina: "cliente",
      verso: "asc",
      pagina: "4",
      per_pagina: "50",
    })

    expect(toContactsInput(state)).toEqual({
      customerQuery: "rossi",
      operatorIds: [0, 3],
      states: ["richiamare", "nessuno"],
      priorities: ["low", "urgent"],
      dateField: "nextAlert",
      from: "2026-01-10",
      to: "2026-02-20",
      onlyMe: true,
      hasAlert: true,
      customerId: "c1a2",
      includeInactive: true,
      orderBy: "customer",
      sortedBy: "asc",
      page: 4,
      perPage: 50,
    })
  })

  it("turns the default state into the defaults of getContacts, with no text and no customer", () => {
    expect(toContactsInput(defaultState)).toEqual({
      customerQuery: "",
      operatorIds: [],
      states: [],
      priorities: [],
      dateField: "closedAt",
      onlyMe: false,
      hasAlert: false,
      includeInactive: false,
      orderBy: "priority",
      sortedBy: "desc",
      page: 1,
      perPage: DEFAULT_PER_PAGE,
    })
  })
})

describe("the contract with getContacts (T5.1)", () => {
  /** The input `getContactsInput` accepts for the state, or the test fails. */
  const accepted = (state: ContactsListState) =>
    getContactsInput.parse(toContactsInput(state))

  it("accepts the default state, and reads it as the defaults", () => {
    expect(accepted(defaultState)).toEqual(getContactsInput.parse({}))
  })

  it("accepts a state with every filter, and gives back what the state holds", () => {
    const state: ContactsListState = {
      q: "mario rossi",
      operatorIds: [0, 3, 12],
      states: ["chiamare", "nessuno", "followup"],
      priorities: ["low", "high", "urgent"],
      dateField: "nextAlert",
      from: "2026-01-10",
      to: "2026-02-20",
      onlyMe: true,
      hasAlert: true,
      includeInactive: true,
      customerId: "c1a2-b3",
      orderBy: "updatedAt",
      sortedBy: "asc",
      page: 3,
      perPage: 100,
    }

    expect(accepted(state)).toEqual({
      customerQuery: "mario rossi",
      operatorIds: [0, 3, 12],
      states: ["chiamare", "nessuno", "followup"],
      priorities: ["low", "high", "urgent"],
      dateField: "nextAlert",
      from: "2026-01-10",
      to: "2026-02-20",
      onlyMe: true,
      hasAlert: true,
      includeInactive: true,
      customerId: "c1a2-b3",
      orderBy: "updatedAt",
      sortedBy: "asc",
      page: 3,
      perPage: 100,
    })
  })

  it.each(allStates)("accepts the state %s", (stato) => {
    expect(accepted({ ...defaultState, states: [stato] }).states).toEqual([
      stato,
    ])
  })

  it.each(priorityBands)("accepts the priority band %s", (band) => {
    expect(
      accepted({ ...defaultState, priorities: [band] }).priorities
    ).toEqual([band])
  })

  it.each(["closedAt", "nextAlert", "createdAt"] as const)(
    "accepts the date field %s",
    (dateField) => {
      expect(accepted({ ...defaultState, dateField }).dateField).toBe(dateField)
    }
  )

  it.each([
    "priority",
    "closedAt",
    "nextAlert",
    "createdAt",
    "updatedAt",
    "customer",
  ] as const)("accepts the sort column %s in both directions", (orderBy) => {
    for (const sortedBy of ["asc", "desc"] as const) {
      const input = accepted({ ...defaultState, orderBy, sortedBy })

      expect([input.orderBy, input.sortedBy]).toEqual([orderBy, sortedBy])
    }
  })

  it.each(PER_PAGES)("accepts the page size %i", (perPage) => {
    expect(accepted({ ...defaultState, perPage }).perPage).toBe(perPage)
  })

  it("accepts the ends of every range the address allows", () => {
    const input = accepted({
      ...defaultState,
      q: "q".repeat(100),
      customerId: "c".repeat(64),
      operatorIds: [0, 2_147_483_647],
      from: "2000-01-01",
      to: "2100-12-31",
      page: 10_000,
    })

    expect(input.operatorIds).toEqual([0, 2_147_483_647])
    expect(input.from).toBe("2000-01-01")
    expect(input.to).toBe("2100-12-31")
    expect(input.page).toBe(10_000)
  })

  it("accepts whatever parse makes of an address with the limits crossed (AC18)", () => {
    const hostile: Record<string, string | string[]>[] = [
      { pagina: "99999", per_pagina: "7", ordina: "x", verso: "x" },
      { operatore: "2147483648,-1,1.5,abc,,", stato: "x,,chiamare" },
      { priorita: "critica", data: "boh", miei: "si", alert: "0" },
      { q: "x".repeat(101), cliente: "c".repeat(65) },
      { q: "a\u0000b", cliente: "a\u0000b" },
      { dal: "1999-12-31", al: "2101-01-01" },
      { dal: "2026-02-30", al: "2026-13-01" },
      { dal: "2026-03-02", al: "2026-03-01" },
      { dal: "2026-3-2", al: " 2026-03-02" },
      { stato: ["chiamare", "richiamare"], pagina: ["1", "2"] },
    ]

    for (const searchParams of hostile) {
      expect(() => accepted(parse(searchParams))).not.toThrow()
    }
  })

  /** Every subset of the items, in the order of the items. */
  const subsets = <T>(list: readonly T[]): T[][] =>
    Array.from({ length: 2 ** list.length }, (_, mask) =>
      list.filter((_item, index) => (mask & (1 << index)) !== 0)
    )

  /** Whether two states hold the same value in every field, and no other. */
  const sameState = (one: ContactsListState, other: ContactsListState) => {
    const fields = Object.keys(defaultState) as (keyof ContactsListState)[]

    return (
      Object.keys(one).length === fields.length &&
      Object.keys(other).length === fields.length &&
      fields.every(
        (field) => JSON.stringify(one[field]) === JSON.stringify(other[field])
      )
    )
  }

  /**
   * What is wrong with a state, if anything: the address it is written to
   * must read back as the state, writing that state again must give the same
   * address, and the server must take the input made of it.
   */
  const problemsOf = (state: ContactsListState): string[] => {
    const address = serialize(state)
    const back = parse(toRecord(address))
    const problems: string[] = []

    if (!sameState(back, state)) problems.push("does not read back")
    if (serialize(back) !== address) problems.push("is not idempotent")
    if (!getContactsInput.safeParse(toContactsInput(state)).success) {
      problems.push("is refused by getContactsInput")
    }
    return problems.map((problem) => `${address || "(default)"} ${problem}`)
  }

  // Walking all 32,768 sets of states, bands and flags takes about 1.7 s, most
  // of it in `serialize`. Every STEPth one is enough: an odd step is coprime
  // with every size of the product (all powers of two), so each state, band
  // and flag, and every pair of them, still turns up in a set. 1 walks them all.
  const STEP = 3

  it("reads back, writes again and passes the server, for the sets of states, bands and flags (every third)", () => {
    const flags = subsets(["onlyMe", "hasAlert", "includeInactive"] as const)
    const problems: string[] = []
    let index = 0
    let walked = 0

    for (const states of subsets(allStates)) {
      for (const priorities of subsets(priorityBands)) {
        for (const set of flags) {
          if (index++ % STEP !== 0) continue
          problems.push(
            ...problemsOf({
              ...defaultState,
              states,
              priorities,
              onlyMe: set.includes("onlyMe"),
              hasAlert: set.includes("hasAlert"),
              includeInactive: set.includes("includeInactive"),
            })
          )
          walked += 1
        }
      }
    }

    expect(index).toBe(2 ** allStates.length * 2 ** priorityBands.length * 8)
    expect(walked).toBe(Math.ceil(index / STEP))
    expect(problems).toEqual([])
  })

  it("reads back, writes again and passes the server, for every order, date field, page size and page, at the ends of the ranges", () => {
    const orderBys = [
      "priority",
      "closedAt",
      "nextAlert",
      "createdAt",
      "updatedAt",
      "customer",
    ] as const
    const problems: string[] = []
    let walked = 0

    for (const orderBy of orderBys) {
      for (const sortedBy of ["asc", "desc"] as const) {
        for (const dateField of [
          "closedAt",
          "nextAlert",
          "createdAt",
        ] as const) {
          for (const perPage of PER_PAGES) {
            for (const page of [1, 2, 10_000]) {
              problems.push(
                ...problemsOf({
                  ...defaultState,
                  orderBy,
                  sortedBy,
                  dateField,
                  perPage,
                  page,
                  from: "2000-01-01",
                  to: "2100-12-31",
                  q: "q".repeat(100),
                  customerId: "c".repeat(64),
                })
              )
              walked += 1
            }
          }
        }
      }
    }

    expect(walked).toBe(orderBys.length * 2 * 3 * PER_PAGES.length * 3)
    expect(problems).toEqual([])
  })

  it("writes and passes on the lists of a state built by hand in a fixed order, once each item", () => {
    const state: ContactsListState = {
      ...defaultState,
      // Twice each, backwards first: 18 states and 8 bands are more than the
      // server takes as they are, and 200 ids are twice what it takes
      states: [...allStates].reverse().concat(allStates),
      priorities: [...priorityBands].reverse().concat(priorityBands),
      operatorIds: Array.from({ length: 200 }, (_, index) => 12 - (index % 13)),
    }
    const canonical = {
      operatorIds: Array.from({ length: 13 }, (_, index) => index),
      states: [...allStates],
      priorities: [...priorityBands],
    }

    expect(toContactsInput(state)).toMatchObject(canonical)
    expect(getContactsInput.safeParse(toContactsInput(state)).success).toBe(
      true
    )
    expect(serialize(state)).toBe(serialize({ ...state, ...canonical }))
    expect(serialize(state)).toBe(
      "?operatore=0,1,2,3,4,5,6,7,8,9,10,11,12" +
        "&stato=chiamare,non+interessato,app.to,caricato,richiamare,non+risponde,erogata,nessuno,followup" +
        "&priorita=bassa,media,alta,urgente"
    )
  })
})

describe("seeContactsHref", () => {
  it("opens the list on one customer, previous contacts included, newest created first (AC21)", () => {
    const href = seeContactsHref("c1a2")

    expect(href).toBe(
      "/dashboard/contatti?cliente=c1a2&precedenti=1&ordina=creato&verso=desc"
    )
    expect(parse(toRecord(new URL(href, "https://mito.test").search))).toEqual({
      ...defaultState,
      customerId: "c1a2",
      includeInactive: true,
      orderBy: "createdAt",
      sortedBy: "desc",
    })
  })

  it("encodes the id, so any id reads back as itself", () => {
    const href = seeContactsHref("a/b c&d=e")

    expect(href.startsWith("/dashboard/contatti?")).toBe(true)
    expect(
      parse(toRecord(new URL(href, "https://mito.test").search)).customerId
    ).toBe("a/b c&d=e")
  })
})

describe("returnHref", () => {
  it.each([
    ["with the question mark", "?stato=richiamare&pagina=2"],
    ["without the question mark", "stato=richiamare&pagina=2"],
    [
      "in another order, with a duplicate",
      "pagina=2&stato=richiamare,richiamare",
    ],
  ])("gives back the list on the state da carries, %s (AC25)", (_name, da) => {
    expect(returnHref(da)).toBe("/dashboard/contatti?stato=richiamare&pagina=2")
  })

  it.each<[string, string | string[] | undefined]>([
    ["absent", undefined],
    ["empty", ""],
    ["an external address", "https://evil.example"],
    ["an address without a scheme", "//evil.example"],
    ["a script", "javascript:alert(1)"],
    ["a path", "/dashboard/contatti?stato=richiamare"],
    [
      "an external address with parameters",
      "https://evil.example?stato=richiamare",
    ],
    ["a repeated parameter", ["stato=richiamare", "pagina=2"]],
    ["an empty array", []],
  ])(
    "falls back to the plain list when da is %s, and never leaves the app (AC18)",
    (_name, da) => {
      const href = returnHref(da)

      expect(href).toBe("/dashboard/contatti")
      expect(new URL(href, "https://mito.test").origin).toBe(
        "https://mito.test"
      )
    }
  )

  it("keeps the valid parameters of a dirty da and drops the others (AC18)", () => {
    expect(
      returnHref("?stato=chiamare,x&pagina=0&boh=1&miei=si&per_pagina=50")
    ).toBe("/dashboard/contatti?stato=chiamare&per_pagina=50")
  })

  it("reads a parameter da repeats as absent, and keeps the rest", () => {
    expect(returnHref("stato=chiamare&stato=richiamare&pagina=2")).toBe(
      "/dashboard/contatti?pagina=2"
    )
  })
})

describe("detailHref", () => {
  /** The `da` Next gives the detail page for an address. */
  const daOf = (href: string) =>
    new URL(href, "https://mito.test").searchParams.get("da") ?? undefined

  it("opens the contact and carries the state of the list in da, without the question mark (AC25)", () => {
    const href = detailHref(42, {
      ...defaultState,
      states: ["richiamare"],
      page: 2,
    })

    expect(href).toBe(
      "/dashboard/contatti/42?da=stato%3Drichiamare%26pagina%3D2"
    )
    expect(daOf(href)).toBe("stato=richiamare&pagina=2")
  })

  it("carries no da for the default state, and takes the largest safe integer as an id", () => {
    expect(detailHref(42, defaultState)).toBe("/dashboard/contatti/42")
    expect(detailHref(1, defaultState)).toBe("/dashboard/contatti/1")
    expect(detailHref(Number.MAX_SAFE_INTEGER, defaultState)).toBe(
      `/dashboard/contatti/${Number.MAX_SAFE_INTEGER}`
    )
  })

  it("opens the contact with the state of the list for a valid id", () => {
    expect(
      detailHref(1234, { ...defaultState, states: ["chiamare"], page: 2 })
    ).toBe("/dashboard/contatti/1234?da=stato%3Dchiamare%26pagina%3D2")
  })

  describe("an id that isn't a positive safe integer", () => {
    // What the type forbids, passed anyway: a value that reaches the path
    // would leave it ("." and ".." resolve to the parent, "%2e%2e" too)
    const wrongIds: [string, unknown][] = [
      ["two dots", ".."],
      ["a dot", "."],
      ["an empty string", ""],
      ["a lone surrogate", "\uD800"],
      ["an encoded dot", "%2e%2e"],
      ["a segment with a slash", "4/2?x#y"],
      ["a number as a string", "42"],
      ["zero", 0],
      ["a negative number", -3],
      ["negative zero", -0],
      ["a fraction", 1.5],
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
      ["-Infinity", Number.NEGATIVE_INFINITY],
      ["the first unsafe integer", Number.MAX_SAFE_INTEGER + 1],
      ["null", null],
      ["undefined", undefined],
    ]

    it.each(wrongIds)(
      "leads to the list with the same state, and doesn't throw: %s",
      (_name, id) => {
        const state: ContactsListState = {
          ...defaultState,
          states: ["richiamare"],
          page: 2,
        }
        const href = detailHref(id as number, state)
        const url = new URL(href, "https://mito.test")

        expect(href).toBe("/dashboard/contatti?stato=richiamare&pagina=2")
        expect(url.pathname).toBe("/dashboard/contatti")
        expect(detailHref(id as number, defaultState)).toBe(
          "/dashboard/contatti"
        )
      }
    )
  })

  it.each<[string, ContactsListState]>([
    ["a state with every filter", everything],
    [
      "a search with the characters an address treats as its own",
      { ...defaultState, q: "è & = # % + , ? / ü 😀", page: 2 },
    ],
    [
      "a customer id with a slash and a space",
      { ...defaultState, customerId: "a/b c" },
    ],
    [
      "a change of order",
      { ...defaultState, orderBy: "customer", sortedBy: "asc" },
    ],
    ["the default state", defaultState],
  ])("is undone by returnHref: %s (AC25)", (_name, state) => {
    const href = returnHref(daOf(detailHref(42, state)))

    expect(parse(toRecord(new URL(href, "https://mito.test").search))).toEqual(
      state
    )
    expect(href).toBe("/dashboard/contatti" + serialize(state))
  })
})

describe("the shape of every address the module builds (AC18, AC25)", () => {
  const ORIGIN = "https://app.test"

  /** What a reader or an attacker may put in a parameter or in `da`. */
  const hostileTexts = [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "///evil.example",
    "javascript:alert(1)",
    " javascript:alert(1)",
    "\tjavascript:alert(1)",
    "\t//evil.example",
    "\n//evil.example",
    " //evil.example",
    "data:text/html,x",
    "%2F%2Fevil.example",
    "%252F%252Fevil.example",
    "..%2F..%2Fevil",
    "/dashboard/contatti/../../evil",
    "stato=chiamare#/x",
    "abc#frag&miei=1",
    "q=a#b",
    "q=%00",
    "pagina=2&pagina=3",
    "a b\u0000ü😀",
    "x".repeat(100_000),
  ]
  // Each one as it is and with a leading question mark, as a query string
  const texts = hostileTexts.flatMap((text) => [text, `?${text}`])

  /** The path of the list or of a contact, a query string of these characters. */
  const formQuery = /^\/dashboard\/contatti(\?[A-Za-z0-9*\-._+%=&,]*)?$/
  /** The detail: `da` is `encodeURIComponent` of a query string. */
  const detailQuery =
    /^\/dashboard\/contatti(\/[0-9]+)?(\?da=[A-Za-z0-9\-_.!~*'()%]*)?$/

  const label = (value: unknown) =>
    (JSON.stringify(value) ?? "undefined").slice(0, 40)

  /**
   * What is wrong with an address: it must keep its characters to `shape`,
   * stay in the app, in `path`, with no fragment, and carry only the
   * parameters `keysOk` accepts.
   */
  const problemsOf = (
    kind: string,
    input: unknown,
    href: string,
    rules: { shape: RegExp; path: RegExp; keysOk: (keys: string[]) => boolean }
  ): string[] => {
    const url = new URL(href, ORIGIN)
    const keys = [...url.searchParams.keys()]
    const problems: string[] = []

    if (!rules.shape.test(href))
      problems.push("has characters it must not have")
    if (url.origin !== ORIGIN) problems.push(`leaves the app for ${url.origin}`)
    if (!rules.path.test(url.pathname)) {
      problems.push(`leaves its path for ${url.pathname.slice(0, 40)}`)
    }
    if (url.hash !== "") problems.push("carries a fragment")
    if (!rules.keysOk(keys)) problems.push(`has the parameters ${keys.join()}`)
    return problems.map((problem) => `${kind}(${label(input)}) ${problem}`)
  }

  it("makes returnHref lead to the list, inside the app, whatever da holds", () => {
    const inputs: (string | string[] | undefined)[] = [
      ...texts,
      ["a", "b"],
      undefined,
    ]
    const problems = inputs.flatMap((da) =>
      problemsOf("returnHref", da, returnHref(da), {
        shape: formQuery,
        path: /^\/dashboard\/contatti$/,
        keysOk: () => true,
      })
    )

    expect(problems).toEqual([])
  })

  it("makes seeContactsHref lead to the list, inside the app, with the customer in its own parameter", () => {
    const problems = texts.flatMap((customerId) =>
      problemsOf("seeContactsHref", customerId, seeContactsHref(customerId), {
        shape: formQuery,
        path: /^\/dashboard\/contatti$/,
        keysOk: (keys) => keys.join() === "cliente,precedenti,ordina,verso",
      })
    )

    expect(problems).toEqual([])
  })

  it("makes detailHref lead to the contact, inside the app, whatever the state holds", () => {
    const fields = [...texts, undefined]
    const states = fields.flatMap((text) => [
      { ...defaultState, q: text },
      { ...defaultState, customerId: text },
      { ...defaultState, q: text, customerId: text },
    ])
    const problems = states.flatMap((state) =>
      problemsOf(
        "detailHref",
        [state.q, state.customerId],
        detailHref(1234, state),
        {
          shape: detailQuery,
          path: /^\/dashboard\/contatti\/1234$/,
          keysOk: (keys) => keys.every((key) => key === "da"),
        }
      )
    )

    expect(problems).toEqual([])
  })
})

describe("activeFilters", () => {
  it("lists nothing for the default state", () => {
    expect(activeFilters(defaultState)).toEqual([])
  })

  it("lists every filter that is applied, in a fixed order (AC20)", () => {
    expect(activeFilters({ ...everything, includeInactive: true })).toEqual([
      "q",
      "operatore",
      "stato",
      "priorita",
      "data",
      "miei",
      "alert",
      "cliente",
      "precedenti",
    ])
  })

  it("lists only miei when it is the only filter, so the list can say nothing is assigned", () => {
    expect(activeFilters(parse({ miei: "1" }))).toEqual(["miei"])
    expect(activeFilters(parse({ miei: "1", pagina: "2" }))).toEqual(["miei"])
  })

  it("doesn't count the order, the page or the page size as filters", () => {
    const state: ContactsListState = {
      ...defaultState,
      orderBy: "customer",
      sortedBy: "asc",
      page: 3,
      perPage: 50,
    }

    expect(activeFilters(state)).toEqual([])
  })

  it("counts the date as one filter when there is a day, and as none when there is only the field", () => {
    const field = { ...defaultState, dateField: "nextAlert" as const }

    expect(activeFilters(field)).toEqual([])
    expect(activeFilters({ ...field, from: "2026-01-10" })).toEqual(["data"])
    expect(activeFilters({ ...field, to: "2026-01-10" })).toEqual(["data"])
    expect(
      activeFilters({ ...field, from: "2026-01-10", to: "2026-02-20" })
    ).toEqual(["data"])
  })

  it("counts a filter an address crossed the limits of as none (AC18)", () => {
    const state = parse({
      q: "   ",
      operatore: "abc",
      stato: "inesistente",
      priorita: "critica",
      miei: "si",
      cliente: "",
      dal: "2026-02-30",
    })

    expect(activeFilters(state)).toEqual([])
  })
})

describe("customerContactsState", () => {
  it("is the state of 'Vedi contatti': the customer, previous contacts included, newest created first (D28)", () => {
    expect(customerContactsState("c1a2")).toEqual({
      ...defaultState,
      customerId: "c1a2",
      includeInactive: true,
      orderBy: "createdAt",
      sortedBy: "desc",
    })
  })

  it("is the state 'Vedi contatti' links to, so the two links can't diverge", () => {
    expect(seeContactsHref("c1a2")).toBe(
      `/dashboard/contatti${serialize(customerContactsState("c1a2"))}`
    )
  })

  it("is also the state the detail of a contact carries to come back to that list (AC25)", () => {
    const href = detailHref(42, customerContactsState("c1a2"))

    expect(
      returnHref(
        new URL(href, "https://mito.test").searchParams.get("da") ?? undefined
      )
    ).toBe(seeContactsHref("c1a2"))
  })
})

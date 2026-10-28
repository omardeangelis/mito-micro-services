import { describe, expect, it } from "vitest"
import { addressable, dateProblemOf } from "../addressable"
import {
  defaultState,
  type ContactsListState,
} from "@mito/client/contact/searchParams"

const withDays = (
  from: string | undefined,
  to: string | undefined,
  rest: Partial<ContactsListState> = {}
): ContactsListState => ({ ...defaultState, ...rest, from, to })

describe("dateProblemOf", () => {
  it("is null for no days, one day, or a range in order", () => {
    expect(dateProblemOf(withDays(undefined, undefined))).toBeNull()
    expect(dateProblemOf(withDays("2026-10-01", undefined))).toBeNull()
    expect(dateProblemOf(withDays("2026-10-01", "2026-10-01"))).toBeNull()
    expect(dateProblemOf(withDays("2026-10-01", "2026-10-20"))).toBeNull()
  })

  it("says 'backwards' for a range that ends before it starts", () => {
    expect(dateProblemOf(withDays("2026-10-20", "2026-10-01"))).toBe(
      "backwards"
    )
  })

  it.each([
    // A date input hands back every year it passes through while it is typed
    ["0002-10-01"],
    ["0026-10-01"],
    ["1999-12-31"],
    ["2101-01-01"],
    // A day that is not on the calendar
    ["2026-02-30"],
  ])("says 'refused' for %s, a day the server doesn't take", (day) => {
    expect(dateProblemOf(withDays(day, undefined))).toBe("refused")
    expect(dateProblemOf(withDays(undefined, day))).toBe("refused")
  })

  it("says 'refused' before 'backwards': a refused day can't be compared", () => {
    expect(dateProblemOf(withDays("2026-10-20", "0002-10-01"))).toBe("refused")
  })
})

describe("addressable", () => {
  const address = withDays("2026-10-01", "2026-10-20", { states: ["chiamare"] })

  it("leaves a state the address can carry as it is", () => {
    const next = withDays("2026-10-05", "2026-10-25", { hasAlert: true })

    expect(addressable(next, address)).toBe(next)
  })

  it("keeps the day the address has while a day being typed is refused, and the other filters go through", () => {
    const next = withDays("0026-10-01", "2026-10-20", { hasAlert: true })

    expect(addressable(next, address)).toEqual({
      ...next,
      from: "2026-10-01",
      to: "2026-10-20",
    })
  })

  it("does the same with the end of the range", () => {
    const next = withDays("2026-10-01", "0020-10-20", { onlyMe: true })

    expect(addressable(next, address)).toEqual({
      ...next,
      from: "2026-10-01",
      to: "2026-10-20",
    })
  })

  it("with no day in the address, a refused day is no day", () => {
    const next = withDays("0002-10-01", undefined, { hasAlert: true })

    expect(addressable(next, defaultState)).toEqual({
      ...next,
      from: undefined,
      to: undefined,
    })
  })

  it("a range that runs backwards stays as the address has it, both ends", () => {
    const next = withDays("2026-10-25", "2026-10-20", { hasAlert: true })

    expect(addressable(next, address)).toEqual({
      ...next,
      from: "2026-10-01",
      to: "2026-10-20",
    })
  })

  it("a refused end can leave the other end behind the address's: then the range is the address's", () => {
    // from is new and valid, to is refused so it is the address's (10-20), and
    // the new from (10-25) is after it
    const next = withDays("2026-10-25", "0020-10-20")

    expect(addressable(next, address)).toEqual({
      ...next,
      from: "2026-10-01",
      to: "2026-10-20",
    })
  })
})

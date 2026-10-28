import { act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  defaultState,
  withFilterChange,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { useContactsNavigation } from "../../_components/ContactsListShell"
import { renderHookInShell } from "../../_test/shell"
import { useContactFilters } from "../useContactFilters"

// As the tests of `useContactFilters` of the Next.js app, on a router in
// memory: a navigation lands where it went, and `land` is an address that
// comes from elsewhere (a link, "Indietro", "Azzera filtri")

const useFilters = (address: ContactsListState) => {
  const filters = useContactFilters(address)
  // The other controls of the list navigate through the same shell
  const navigation = useContactsNavigation()
  return { ...filters, navigation }
}

const setup = (initial: ContactsListState = defaultState) =>
  renderHookInShell(useFilters, initial)

/** Runs `change` and lets the navigation it sends land */
const run = (change: () => void) =>
  act(async () => {
    change()
  })

/** Lets the timers run `ms`, and the navigation they send land */
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useContactFilters: apply", () => {
  it("shows the change at once, goes back to page 1 and pushes the new address (AC16, AC17)", async () => {
    const { result, navigations } = setup({ ...defaultState, page: 3 })

    await run(() => result.current.apply({ states: ["richiamare"] }))

    expect(result.current.filters.states).toEqual(["richiamare"])
    expect(result.current.filters.page).toBe(1)
    expect(navigations).toEqual(["PUSH /dashboard/contatti?stato=richiamare"])
  })

  it("keeps the filters already applied", async () => {
    const { result, navigations } = setup({
      ...defaultState,
      hasAlert: true,
      onlyMe: true,
    })

    await run(() => result.current.apply({ priorities: ["urgent"] }))

    expect(navigations).toEqual([
      "PUSH /dashboard/contatti?priorita=urgente&miei=1&alert=1",
    ])
  })

  it("starts from what the address says, not from what the controls showed before", () => {
    const { result } = setup({ ...defaultState, states: ["chiamare"] })

    expect(result.current.filters).toEqual({
      ...defaultState,
      states: ["chiamare"],
    })
  })
})

describe("useContactFilters: a date range that runs backwards (AC18)", () => {
  const range: ContactsListState = {
    ...defaultState,
    from: "2026-10-01",
    to: "2026-10-10",
  }

  it("is shown but not applied: nothing is pushed", async () => {
    const { result, navigations } = setup(range)

    await run(() => result.current.apply({ from: "2026-10-20" }))

    expect(result.current.filters.from).toBe("2026-10-20")
    expect(result.current.dateProblem).toBe("backwards")
    expect(navigations).toEqual([])
  })

  it("is applied as soon as it is fixed", async () => {
    const { result, navigations } = setup(range)
    await run(() => result.current.apply({ from: "2026-10-20" }))

    await run(() => result.current.apply({ to: "2026-10-25" }))

    expect(result.current.dateProblem).toBeNull()
    expect(navigations).toEqual([
      "PUSH /dashboard/contatti?dal=2026-10-20&al=2026-10-25",
    ])
  })

  it("is not backwards with one end only, or the same day twice", async () => {
    const { result, navigations } = setup(range)

    await run(() => result.current.apply({ to: undefined }))
    expect(result.current.dateProblem).toBeNull()

    await run(() =>
      result.current.apply({ from: "2026-10-10", to: "2026-10-10" })
    )
    expect(result.current.dateProblem).toBeNull()
    expect(navigations.at(-1)).toBe(
      "PUSH /dashboard/contatti?dal=2026-10-10&al=2026-10-10"
    )
  })
})

describe("useContactFilters: a day the server would refuse", () => {
  // Typing a year in a date input passes through 0002, 0020, 0202 before 2026
  it("is shown while it is typed, and applied once it is a day the server takes", async () => {
    const { result, navigations } = setup()

    await run(() => result.current.apply({ from: "0002-10-05" }))
    await run(() => result.current.apply({ from: "0202-10-05" }))

    expect(result.current.filters.from).toBe("0202-10-05")
    expect(result.current.dateProblem).toBe("refused")
    expect(navigations).toEqual([])

    await run(() => result.current.apply({ from: "2026-10-05" }))

    expect(result.current.dateProblem).toBeNull()
    expect(navigations).toEqual(["PUSH /dashboard/contatti?dal=2026-10-05"])
  })
})

describe("useContactFilters: search", () => {
  it("shows the text at once and replaces the address once, after 300 ms of quiet", async () => {
    const { result, navigations } = setup({ ...defaultState, page: 4 })

    await run(() => result.current.search("ro"))
    await wait(200)
    await run(() => result.current.search("ros"))
    expect(result.current.filters.q).toBe("ros")

    await wait(299)
    expect(navigations).toEqual([])
    await wait(1)

    // Page 1 again, and a replace: typing leaves no history behind
    expect(navigations).toEqual(["REPLACE /dashboard/contatti?q=ros"])
  })

  it("applies the text trimmed, and an empty text is no filter", async () => {
    const { result, navigations } = setup({ ...defaultState, q: "ros" })

    await run(() => result.current.search("  "))
    expect(result.current.filters.q).toBe("  ")
    await wait(300)

    expect(navigations).toEqual(["REPLACE /dashboard/contatti"])
  })

  it("a filter changed meanwhile carries the text and takes the pending replace over", async () => {
    const { result, navigations } = setup()
    await run(() => result.current.search("ros"))

    await run(() => result.current.apply({ hasAlert: true }))
    await wait(1000)

    expect(navigations).toEqual(["PUSH /dashboard/contatti?q=ros&alert=1"])
  })

  it("goes through while a range that runs backwards is on screen, with the range the address has (M7)", async () => {
    const { result, navigations } = setup({
      ...defaultState,
      from: "2026-10-01",
      to: "2026-10-10",
    })
    await run(() => result.current.apply({ from: "2026-10-20" }))
    expect(result.current.dateProblem).toBe("backwards")

    await run(() => result.current.search("ros"))
    await wait(300)

    expect(navigations).toEqual([
      "REPLACE /dashboard/contatti?q=ros&dal=2026-10-01&al=2026-10-10",
    ])
    // The reader still sees what was typed
    expect(result.current.filters.from).toBe("2026-10-20")
  })

  it("goes through while a day the server refuses is on screen (M7)", async () => {
    const { result, navigations } = setup()
    await run(() => result.current.apply({ from: "0026-10-01" }))

    await run(() => result.current.search("verdi"))
    await wait(300)

    expect(navigations).toEqual(["REPLACE /dashboard/contatti?q=verdi"])
    expect(result.current.filters.from).toBe("0026-10-01")
    expect(result.current.dateProblem).toBe("refused")
  })

  it("does not navigate after the list is gone", async () => {
    const { result, navigations, unmount } = setup()
    await run(() => result.current.search("ros"))

    unmount()
    await vi.advanceTimersByTimeAsync(1000)

    expect(navigations).toEqual([])
  })
})

describe("useContactFilters: the text being typed", () => {
  it("keeps the spaces typed when the address of the text without them arrives", async () => {
    const { result } = setup()

    await run(() => result.current.search("mario "))
    // The address spells the text trimmed
    await wait(300)

    // "mario" + "rossi" would be one word if the space were taken away
    expect(result.current.filters.q).toBe("mario ")
  })

  it("follows 'Azzera filtri' once the search has landed", async () => {
    const { result, land } = setup()
    await run(() => result.current.search("ros"))
    await wait(300)

    await land(defaultState)

    expect(result.current.filters.q).toBeUndefined()
  })

  it("follows a new address after a search that was never sent (typed and taken back)", async () => {
    const { result, navigations, land } = setup({ ...defaultState, q: "ros" })
    await run(() => result.current.search("ro"))
    await run(() => result.current.search("ros"))
    await wait(300)
    // The address already has "ros": there was nothing to send
    expect(navigations).toEqual([])

    await land(defaultState)

    expect(result.current.filters.q).toBeUndefined()
  })
})

describe("useContactFilters: a new address", () => {
  it("is what the controls show again (a link, 'Indietro', 'Azzera filtri')", async () => {
    const { result, land } = setup({
      ...defaultState,
      states: ["chiamare"],
    })
    await run(() => result.current.apply({ hasAlert: true }))

    await land({ ...defaultState, hasAlert: true })
    expect(result.current.filters).toEqual({ ...defaultState, hasAlert: true })

    await land(defaultState)
    expect(result.current.filters).toEqual(defaultState)
  })

  it("does not take the text away while the user is typing", async () => {
    const { result, land } = setup()
    await run(() => result.current.search("ro"))
    await wait(300)
    await run(() => result.current.search("ros"))

    // The address of "ro" arrives while "ros" is on screen
    await land({ ...defaultState, q: "ro" })
    expect(result.current.filters.q).toBe("ros")

    // The address of "ros" arrives: they agree, nothing to keep any more
    await wait(300)
    expect(result.current.filters.q).toBe("ros")

    // Later, with no key waiting, the reader goes back: the text follows the address
    await land(defaultState)
    expect(result.current.filters.q).toBeUndefined()
  })
})

describe("useContactFilters: a day the address can't carry doesn't block the rest (M7)", () => {
  it("another filter goes through, and the typed day stays on screen", async () => {
    const { result, navigations } = setup()
    await run(() => result.current.apply({ from: "0026-10-01" }))
    expect(navigations).toEqual([])

    await run(() => result.current.apply({ hasAlert: true }))

    expect(navigations).toEqual(["PUSH /dashboard/contatti?alert=1"])
    expect(result.current.filters.from).toBe("0026-10-01")
    expect(result.current.dateProblem).toBe("refused")
  })

  it("a backwards range: another filter goes through with the range the address has", async () => {
    const { result, navigations } = setup({
      ...defaultState,
      from: "2026-10-01",
      to: "2026-10-10",
    })
    await run(() => result.current.apply({ from: "2026-10-20" }))

    await run(() => result.current.apply({ onlyMe: true }))

    expect(navigations).toEqual([
      "PUSH /dashboard/contatti?dal=2026-10-01&al=2026-10-10&miei=1",
    ])
    expect(result.current.dateProblem).toBe("backwards")
  })
})

describe("useContactFilters: another control of the list navigates (M6)", () => {
  it("the text typed and not sent yet goes with it, and the timer has nothing left to send", async () => {
    const { result, navigations } = setup()
    await run(() => result.current.search("verdi"))

    await run(() => {
      result.current.navigation.navigateWith(defaultState, (base) =>
        withFilterChange(base, { orderBy: "createdAt", sortedBy: "desc" })
      )
    })

    expect(navigations).toHaveLength(1)
    expect(navigations[0]).toMatch(/^PUSH /)
    expect(navigations[0]).toContain("q=verdi")
    expect(navigations[0]).toContain("ordina=")
    // That address landed, and then the 300 ms run out: nothing left to send
    await wait(300)
    expect(navigations).toHaveLength(1)
  })

  it("a filter chosen and not landed yet goes with it", async () => {
    const { result, navigations } = setup()
    await run(() => {
      result.current.apply({ states: ["richiamare"] })
      result.current.navigation.navigateWith(defaultState, (base) =>
        withFilterChange(base, { orderBy: "createdAt", sortedBy: "desc" })
      )
    })

    expect(navigations.at(-1)).toContain("stato=richiamare")
    expect(navigations.at(-1)).toContain("ordina=")
  })

  it("an address that lands with nothing else under way is the last word: 'Azzera filtri' before the text landed doesn't leave the text in the box", async () => {
    const { result, land } = setup()
    await run(() => result.current.search("verdi"))
    await wait(300)

    // 'Azzera filtri' landed after the address of the text
    await land(defaultState)

    expect(result.current.filters.q).toBeUndefined()
  })

  it("while a key is waiting the text stays", async () => {
    const { result, land } = setup()
    await run(() => result.current.search("verdi"))

    // An address lands while the reader is still typing
    await land({ ...defaultState, states: ["chiamare"] })

    expect(result.current.filters.q).toBe("verdi")
    expect(result.current.filters.states).toEqual(["chiamare"])
  })
})

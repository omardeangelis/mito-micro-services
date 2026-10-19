import { act, renderHook } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  ContactsListShell,
  useContactsNavigation,
} from "../../_components/ContactsListShell"
import {
  defaultState,
  parse,
  withFilterChange,
  type ContactsListState,
} from "../searchParams"
import { useContactFilters } from "../useContactFilters"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  // What the page does when the router navigates: set by `setup`
  land: (_href: string) => undefined as void,
}))

// The tests look at the address; the options of the navigation are the
// business of ContactsListShell.test.tsx
const router = {
  push: (href: string) => {
    mocks.push(href)
    mocks.land(href)
  },
  replace: (href: string) => {
    mocks.replace(href)
    mocks.land(href)
  },
  refresh: mocks.refresh,
}
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ContactsListShell>{children}</ContactsListShell>
)

const parseHref = (href: string) =>
  parse(Object.fromEntries(new URL(href, "http://x").searchParams))

/**
 * The list with its filters. By default a navigation lands where it went, in
 * the same transition, as in the app: the address of the page is then the one
 * navigated to. `land: false` leaves the address to the test (`rerender`).
 */
const setup = (
  parsed: ContactsListState = defaultState,
  { land = true } = {}
) => {
  const hook = renderHook(
    ({
      parsed: external,
      nonce,
    }: {
      parsed: ContactsListState
      nonce: number
    }) => {
      const [landed, setLanded] = useState<{
        nonce: number
        state: ContactsListState
      } | null>(null)
      mocks.land = land
        ? (href) => setLanded({ nonce, state: parseHref(href) })
        : () => undefined
      // An address the test sets (a new `nonce`) wins over a landed one
      const current =
        landed !== null && landed.nonce === nonce ? landed.state : external
      const filters = useContactFilters(current)
      // The other controls of the list navigate through the same shell
      const navigation = useContactsNavigation()
      return { ...filters, navigation }
    },
    { wrapper, initialProps: { parsed, nonce: 0 } }
  )
  let nonce = 0
  return {
    result: hook.result,
    unmount: hook.unmount,
    /** The address of the page becomes `parsed`, whatever landed before */
    rerender: ({ parsed }: { parsed: ContactsListState }) =>
      hook.rerender({ parsed, nonce: ++nonce }),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.push.mockClear()
  mocks.replace.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useContactFilters: apply", () => {
  it("shows the change at once, goes back to page 1 and pushes the new address (AC16, AC17)", () => {
    const { result } = setup({ ...defaultState, page: 3 })

    act(() => result.current.apply({ states: ["richiamare"] }))

    expect(result.current.filters.states).toEqual(["richiamare"])
    expect(result.current.filters.page).toBe(1)
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/contatti?stato=richiamare"
    )
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("keeps the filters already applied", () => {
    const { result } = setup({ ...defaultState, hasAlert: true, onlyMe: true })

    act(() => result.current.apply({ priorities: ["urgent"] }))

    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/contatti?priorita=urgente&miei=1&alert=1"
    )
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

  it("is shown but not applied: nothing is pushed", () => {
    const { result } = setup(range)

    act(() => result.current.apply({ from: "2026-10-20" }))

    expect(result.current.filters.from).toBe("2026-10-20")
    expect(result.current.dateProblem).toBe("backwards")
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it("is applied as soon as it is fixed", () => {
    const { result } = setup(range)
    act(() => result.current.apply({ from: "2026-10-20" }))

    act(() => result.current.apply({ to: "2026-10-25" }))

    expect(result.current.dateProblem).toBeNull()
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/contatti?dal=2026-10-20&al=2026-10-25"
    )
  })

  it("is not backwards with one end only, or the same day twice", () => {
    const { result } = setup(range)

    act(() => result.current.apply({ to: undefined }))
    expect(result.current.dateProblem).toBeNull()

    act(() => result.current.apply({ from: "2026-10-10", to: "2026-10-10" }))
    expect(result.current.dateProblem).toBeNull()
    expect(mocks.push).toHaveBeenLastCalledWith(
      "/dashboard/contatti?dal=2026-10-10&al=2026-10-10"
    )
  })
})

describe("useContactFilters: a day the server would refuse", () => {
  // Typing a year in a date input passes through 0002, 0020, 0202 before 2026
  it("is shown while it is typed, and applied once it is a day the server takes", () => {
    const { result } = setup()

    act(() => result.current.apply({ from: "0002-10-05" }))
    act(() => result.current.apply({ from: "0202-10-05" }))

    expect(result.current.filters.from).toBe("0202-10-05")
    expect(result.current.dateProblem).toBe("refused")
    expect(mocks.push).not.toHaveBeenCalled()

    act(() => result.current.apply({ from: "2026-10-05" }))

    expect(result.current.dateProblem).toBeNull()
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/contatti?dal=2026-10-05"
    )
  })
})

describe("useContactFilters: search", () => {
  it("shows the text at once and replaces the address once, after 300 ms of quiet", () => {
    const { result } = setup({ ...defaultState, page: 4 })

    act(() => result.current.search("ro"))
    act(() => {
      vi.advanceTimersByTime(200)
    })
    act(() => result.current.search("ros"))
    expect(result.current.filters.q).toBe("ros")

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(mocks.replace).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(mocks.replace).toHaveBeenCalledTimes(1)
    // Page 1 again, and a replace: typing leaves no history behind
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard/contatti?q=ros")
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it("applies the text trimmed, and an empty text is no filter", () => {
    const { result } = setup({ ...defaultState, q: "ros" })

    act(() => result.current.search("  "))
    expect(result.current.filters.q).toBe("  ")
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(mocks.replace).toHaveBeenCalledWith("/dashboard/contatti")
  })

  it("a filter changed meanwhile carries the text and takes the pending replace over", () => {
    const { result } = setup()
    act(() => result.current.search("ros"))

    act(() => result.current.apply({ hasAlert: true }))
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/contatti?q=ros&alert=1")
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("goes through while a range that runs backwards is on screen, with the range the address has (M7)", () => {
    const { result } = setup({
      ...defaultState,
      from: "2026-10-01",
      to: "2026-10-10",
    })
    act(() => result.current.apply({ from: "2026-10-20" }))
    expect(result.current.dateProblem).toBe("backwards")

    act(() => result.current.search("ros"))
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(mocks.replace).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith(
      "/dashboard/contatti?q=ros&dal=2026-10-01&al=2026-10-10"
    )
    // The reader still sees what was typed
    expect(result.current.filters.from).toBe("2026-10-20")
  })

  it("goes through while a day the server refuses is on screen (M7)", () => {
    const { result } = setup()
    act(() => result.current.apply({ from: "0026-10-01" }))

    act(() => result.current.search("verdi"))
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(mocks.replace).toHaveBeenCalledWith("/dashboard/contatti?q=verdi")
    expect(result.current.filters.from).toBe("0026-10-01")
    expect(result.current.dateProblem).toBe("refused")
  })

  it("does not navigate after the list is gone", () => {
    const { result, unmount } = setup()
    act(() => result.current.search("ros"))

    unmount()
    vi.advanceTimersByTime(1000)

    expect(mocks.replace).not.toHaveBeenCalled()
  })
})

describe("useContactFilters: the text being typed", () => {
  it("keeps the spaces typed when the address of the text without them arrives", () => {
    const { result, rerender } = setup()

    act(() => result.current.search("mario "))
    act(() => {
      vi.advanceTimersByTime(300)
    })
    // The address spells the text trimmed
    rerender({ parsed: { ...defaultState, q: "mario" } })

    // "mario" + "rossi" would be one word if the space were taken away
    expect(result.current.filters.q).toBe("mario ")
  })

  it("follows 'Azzera filtri' once the search has landed", () => {
    const { result, rerender } = setup()
    act(() => result.current.search("ros"))
    act(() => {
      vi.advanceTimersByTime(300)
    })
    rerender({ parsed: { ...defaultState, q: "ros" } })

    rerender({ parsed: defaultState })

    expect(result.current.filters.q).toBeUndefined()
  })

  it("follows a new address after a search that was never sent (typed and taken back)", () => {
    const { result, rerender } = setup({ ...defaultState, q: "ros" })
    act(() => result.current.search("ro"))
    act(() => result.current.search("ros"))
    act(() => {
      vi.advanceTimersByTime(300)
    })
    // The address already has "ros": there was nothing to send
    expect(mocks.replace).not.toHaveBeenCalled()

    rerender({ parsed: defaultState })

    expect(result.current.filters.q).toBeUndefined()
  })
})

describe("useContactFilters: a new address", () => {
  it("is what the controls show again (a link, 'Indietro', 'Azzera filtri')", () => {
    const { result, rerender } = setup({
      ...defaultState,
      states: ["chiamare"],
    })
    act(() => result.current.apply({ hasAlert: true }))

    rerender({ parsed: { ...defaultState, hasAlert: true } })
    expect(result.current.filters).toEqual({ ...defaultState, hasAlert: true })

    rerender({ parsed: defaultState })
    expect(result.current.filters).toEqual(defaultState)
  })

  it("does not take the text away while the user is typing", () => {
    const { result, rerender } = setup()
    act(() => result.current.search("ro"))
    act(() => {
      vi.advanceTimersByTime(300)
    })
    act(() => result.current.search("ros"))

    // The address of "ro" arrives while "ros" is on screen
    rerender({ parsed: { ...defaultState, q: "ro" } })
    expect(result.current.filters.q).toBe("ros")

    // The address of "ros" arrives: they agree, nothing to keep any more
    rerender({ parsed: { ...defaultState, q: "ros" } })
    expect(result.current.filters.q).toBe("ros")

    // Later, with no key waiting, the reader goes back: the text follows the address
    act(() => {
      vi.advanceTimersByTime(300)
    })
    rerender({ parsed: defaultState })
    expect(result.current.filters.q).toBeUndefined()
  })
})

describe("useContactFilters: a day the address can't carry doesn't block the rest (M7)", () => {
  it("another filter goes through, and the typed day stays on screen", () => {
    const { result } = setup()
    act(() => result.current.apply({ from: "0026-10-01" }))
    expect(mocks.push).not.toHaveBeenCalled()

    act(() => result.current.apply({ hasAlert: true }))

    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/contatti?alert=1")
    expect(result.current.filters.from).toBe("0026-10-01")
    expect(result.current.dateProblem).toBe("refused")
  })

  it("a backwards range: another filter goes through with the range the address has", () => {
    const { result } = setup({
      ...defaultState,
      from: "2026-10-01",
      to: "2026-10-10",
    })
    act(() => result.current.apply({ from: "2026-10-20" }))

    act(() => result.current.apply({ onlyMe: true }))

    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/contatti?dal=2026-10-01&al=2026-10-10&miei=1"
    )
    expect(result.current.dateProblem).toBe("backwards")
  })
})

describe("useContactFilters: another control of the list navigates (M6)", () => {
  it("the text typed and not sent yet goes with it, and the timer has nothing left to send", () => {
    const { result, rerender } = setup()
    act(() => result.current.search("verdi"))

    act(() => {
      result.current.navigation.navigateWith(defaultState, (base) =>
        withFilterChange(base, { orderBy: "createdAt", sortedBy: "desc" })
      )
    })

    expect(mocks.push).toHaveBeenCalledTimes(1)
    const sorted = (mocks.push.mock.calls[0] as string[])[0]!
    expect(sorted).toContain("q=verdi")
    expect(sorted).toContain("ordina=")
    // That address lands, and then the 300 ms run out: nothing left to send
    rerender({
      parsed: withFilterChange(
        { ...defaultState, q: "verdi" },
        { orderBy: "createdAt", sortedBy: "desc" }
      ),
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("a filter chosen and not landed yet goes with it", () => {
    const { result } = setup()
    act(() => result.current.apply({ states: ["richiamare"] }))

    act(() => {
      result.current.navigation.navigateWith(defaultState, (base) =>
        withFilterChange(base, { orderBy: "createdAt", sortedBy: "desc" })
      )
    })

    expect(mocks.push).toHaveBeenLastCalledWith(
      expect.stringContaining("stato=richiamare")
    )
  })

  it("an address that lands with nothing else under way is the last word: 'Azzera filtri' before the text landed doesn't leave the text in the box", () => {
    const { result, rerender } = setup()
    act(() => result.current.search("verdi"))
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // 'Azzera filtri' landed instead of the address of the text
    rerender({ parsed: defaultState })

    expect(result.current.filters.q).toBeUndefined()
  })

  it("while a key is waiting the text stays", () => {
    const { result, rerender } = setup()
    act(() => result.current.search("verdi"))

    // An address lands while the reader is still typing
    rerender({ parsed: { ...defaultState, states: ["chiamare"] } })

    expect(result.current.filters.q).toBe("verdi")
    expect(result.current.filters.states).toEqual(["chiamare"])
  })
})

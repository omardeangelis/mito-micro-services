import { act, render, renderHook, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { listHref } from "../../_lib/listHref"
import {
  defaultState,
  withFilterChange,
} from "@mito/client/contact/searchParams"
import { ContactsListShell, useContactsNavigation } from "../ContactsListShell"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  // What the page does when the router navigates: set by the harness
  onNavigate: () => undefined as void,
}))

const router = {
  push: mocks.push,
  replace: mocks.replace,
  refresh: mocks.refresh,
}
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ContactsListShell>{children}</ContactsListShell>
)

beforeEach(() => {
  mocks.push.mockReset()
  mocks.replace.mockReset()
  mocks.push.mockImplementation(() => mocks.onNavigate())
  mocks.replace.mockImplementation(() => mocks.onNavigate())
  mocks.onNavigate = () => undefined
})

describe("la navigazione condivisa della lista", () => {
  it("fa un push e non sposta né lo scorrimento né il focus: chi scrive in un filtro lo tiene", () => {
    const { result } = renderHook(() => useContactsNavigation(), { wrapper })

    result.current.navigate("/dashboard/contatti?stato=chiamare")

    // Without `scroll: false` Next moves the focus to the top of the page
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/contatti?stato=chiamare",
      {
        scroll: false,
      }
    )
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("con replace sostituisce l'indirizzo, allo stesso modo", () => {
    const { result } = renderHook(() => useContactsNavigation(), { wrapper })

    result.current.navigate("/dashboard/contatti?q=ros", { replace: true })

    expect(mocks.replace).toHaveBeenCalledWith("/dashboard/contatti?q=ros", {
      scroll: false,
    })
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it("lascia a chi la chiede la scelta di far scorrere e portare il focus", () => {
    const { result } = renderHook(() => useContactsNavigation(), { wrapper })

    result.current.navigate("/dashboard/contatti/101", { scroll: true })

    expect(mocks.push).toHaveBeenCalledWith("/dashboard/contatti/101", {
      scroll: true,
    })
  })

  it("non si usa fuori dal guscio", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    expect(() => renderHook(() => useContactsNavigation())).toThrow()
    expect(() => render(<ContactsListShell>x</ContactsListShell>)).not.toThrow()

    spy.mockRestore()
  })
})

describe("il focus quando il controllo usato non c'è più (B3, P17)", () => {
  /**
   * A list on page 2: "Precedente" goes to page 1, where the link is gone. The
   * router mock changes the page inside the transition, as Next does.
   */
  function Page({ goesTo = "/dashboard/contatti" }: { goesTo?: string }) {
    const { navigate } = useContactsNavigation()
    const [page, setPage] = useState(2)
    mocks.onNavigate = () => setPage(1)

    return (
      <>
        <table data-contacts-table="" tabIndex={-1}>
          <tbody>
            <tr>
              <td>riga</td>
            </tr>
          </tbody>
        </table>
        {page > 1 ? (
          <a
            href={goesTo}
            onClick={(event) => {
              event.preventDefault()
              navigate(goesTo)
            }}
          >
            Precedente
          </a>
        ) : null}
        <button type="button" onClick={() => navigate("/dashboard/contatti")}>
          Altro
        </button>
      </>
    )
  }

  const setup = (goesTo?: string) => {
    const user = userEvent.setup()
    render(
      <ContactsListShell>
        <Page goesTo={goesTo} />
      </ContactsListShell>
    )
    return user
  }

  it("da tastiera, se il controllo si toglie con la nuova pagina, il focus va alla tabella e non su body", async () => {
    const user = setup()
    await user.tab()
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Precedente" })
    )

    await user.keyboard("{Enter}")

    expect(screen.queryByRole("link", { name: "Precedente" })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("table"))
  })

  it("se il controllo resta, il focus resta dov'è", async () => {
    const user = setup()
    const other = screen.getByRole("button", { name: "Altro" })
    other.focus()

    await user.keyboard("{Enter}")

    expect(document.activeElement).toBe(other)
  })

  it("se nel frattempo il lettore ha portato il focus altrove, non glielo toglie", async () => {
    const user = setup()
    await user.tab()
    const other = screen.getByRole("button", { name: "Altro" })
    const onNavigate = mocks.onNavigate
    mocks.onNavigate = () => {
      other.focus()
      onNavigate()
    }

    await user.keyboard("{Enter}")

    expect(screen.queryByRole("link", { name: "Precedente" })).toBeNull()
    expect(document.activeElement).toBe(other)
  })

  it("non tocca il focus se la navigazione esce dalla lista (il dettaglio ha il suo)", async () => {
    const user = setup("/dashboard/contatti/101?da=pagina%3D2")
    await user.tab()

    await user.keyboard("{Enter}")

    expect(screen.queryByRole("link", { name: "Precedente" })).toBeNull()
    expect(document.activeElement).not.toBe(screen.getByRole("table"))
  })
})

describe("navigateWith: lo stato verso cui va la lista (M6, M7)", () => {
  const setup = () =>
    renderHook(() => useContactsNavigation(), { wrapper }).result

  const hrefOf = (state: Parameters<typeof listHref>[0]) => listHref(state)

  it("senza altro stato parte dall'indirizzo", () => {
    const nav = setup()

    act(() => {
      nav.current.navigateWith(
        { ...defaultState, states: ["chiamare"] },
        (base) => withFilterChange(base, { orderBy: "createdAt" })
      )
    })

    expect(mocks.push).toHaveBeenCalledWith(
      hrefOf({ ...defaultState, states: ["chiamare"], orderBy: "createdAt" }),
      { scroll: false }
    )
  })

  it("parte da quello che il lettore ha già scelto o scritto e non è ancora nell'indirizzo", () => {
    const nav = setup()
    nav.current.intent.current = { ...defaultState, q: "verdi" }

    act(() => {
      nav.current.navigateWith(defaultState, (base) =>
        withFilterChange(base, { orderBy: "createdAt" })
      )
    })

    expect(mocks.push).toHaveBeenCalledWith(
      hrefOf({ ...defaultState, q: "verdi", orderBy: "createdAt" }),
      { scroll: false }
    )
    // And what the next control starts from now has the sort too
    expect(nav.current.intent.current?.orderBy).toBe("createdAt")
  })

  it("un giorno che l'indirizzo non può portare resta com'è nell'indirizzo, il resto passa", () => {
    const nav = setup()
    const address = { ...defaultState, from: "2026-10-01" }
    nav.current.intent.current = { ...address, from: "0026-10-01" }

    act(() => {
      nav.current.navigateWith(address, (base) =>
        withFilterChange(base, { hasAlert: true })
      )
    })

    expect(mocks.push).toHaveBeenCalledWith(
      hrefOf({ ...address, hasAlert: true }),
      { scroll: false }
    )
    // The controls keep what was typed
    expect(nav.current.intent.current?.from).toBe("0026-10-01")
  })

  it("se l'indirizzo non cambierebbe e niente è in corso, non naviga", () => {
    const nav = setup()
    const address = { ...defaultState, from: "2026-10-01" }

    act(() => {
      nav.current.navigateWith(address, (base) => ({
        ...base,
        from: "0002-10-01",
      }))
    })

    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("dice se ha navigato o se l'indirizzo era già quello della pagina", () => {
    const nav = setup()
    let status: string | undefined

    act(() => {
      status = nav.current.navigateWith(defaultState, (base) =>
        withFilterChange(base, { hasAlert: true })
      ).status
    })
    expect(status).toBe("sent")

    // The address landed: asking for the same state again says nothing new
    act(() => {
      status = nav.current.navigateWith(
        { ...defaultState, hasAlert: true },
        (base) => base
      ).status
    })
    expect(status).toBe("unchanged")
  })

  it("con replace sostituisce l'indirizzo, come navigate", () => {
    const nav = setup()

    act(() => {
      nav.current.navigateWith(
        defaultState,
        (base) => withFilterChange(base, { q: "ros" }),
        { replace: true }
      )
    })

    expect(mocks.replace).toHaveBeenCalledWith(
      hrefOf({ ...defaultState, q: "ros" }),
      { scroll: false }
    )
    expect(mocks.push).not.toHaveBeenCalled()
  })
})

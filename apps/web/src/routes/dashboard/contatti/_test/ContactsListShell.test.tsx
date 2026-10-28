import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter, RouterProvider, useRouteError } from "react-router"
import { describe, expect, it, vi } from "vitest"
import {
  defaultState,
  withFilterChange,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import {
  ContactsListShell,
  useContactsNavigation,
} from "../_components/ContactsListShell"
import { listHref } from "../_lib/listHref"
import { renderHookInShell, renderInShell } from "./shell"

// The one navigation of the list, as the tests of `ContactsListShell` of the
// Next.js app, on a router in memory

const useNavigation = () => useContactsNavigation()

describe("la navigazione condivisa della lista", () => {
  it("fa un push e non sposta né lo scorrimento né il focus: chi scrive in un filtro lo tiene", async () => {
    const { result, navigations, options } = renderHookInShell(useNavigation)

    await act(async () => {
      result.current.navigate("/dashboard/contatti?stato=chiamare")
    })

    expect(navigations).toEqual(["PUSH /dashboard/contatti?stato=chiamare"])
    expect(options[0]?.preventScrollReset).toBe(true)
  })

  it("con replace sostituisce l'indirizzo, allo stesso modo", async () => {
    const { result, navigations, options } = renderHookInShell(useNavigation)

    await act(async () => {
      result.current.navigate("/dashboard/contatti?q=ros", { replace: true })
    })

    expect(navigations).toEqual(["REPLACE /dashboard/contatti?q=ros"])
    expect(options[0]?.preventScrollReset).toBe(true)
  })

  it("lascia a chi la chiede la scelta di far scorrere e portare il focus", async () => {
    const { result, navigations, options } = renderHookInShell(useNavigation)

    await act(async () => {
      result.current.navigate("/dashboard/contatti/101", { scroll: true })
    })

    expect(navigations).toEqual(["PUSH /dashboard/contatti/101"])
    expect(options[0]?.preventScrollReset).toBe(false)
  })

  it("non si usa fuori dal guscio", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    function Outside() {
      useContactsNavigation()
      return <p>dentro</p>
    }
    function Failure() {
      const error = useRouteError()
      return <p>{error instanceof Error ? error.message : "?"}</p>
    }
    const renderAt = (element: React.ReactNode) =>
      render(
        <RouterProvider
          router={createMemoryRouter([
            { path: "/", element, errorElement: <Failure /> },
          ])}
        />
      )

    const outside = renderAt(<Outside />)
    expect(
      await screen.findByText(
        "useContactsNavigation must be used inside ContactsListShell"
      )
    ).toBeTruthy()
    outside.unmount()
    renderAt(
      <ContactsListShell listPending={false} shownAddress="">
        <Outside />
      </ContactsListShell>
    )
    expect(await screen.findByText("dentro")).toBeTruthy()

    spy.mockRestore()
  })
})

describe("il focus quando il controllo usato non c'è più (B3, P17)", () => {
  /** A list on page 2: "Precedente" goes to page 1, where the link is gone */
  function Page({
    address,
    goesTo,
  }: {
    address: ContactsListState
    goesTo: string
  }) {
    const { navigate } = useContactsNavigation()

    return (
      <>
        <table data-contacts-table="" tabIndex={-1}>
          <tbody>
            <tr>
              <td>riga</td>
            </tr>
          </tbody>
        </table>
        {address.page > 1 ? (
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
        <button
          type="button"
          onClick={() => navigate(listHref({ ...address, hasAlert: true }))}
        >
          Altro
        </button>
      </>
    )
  }

  const setup = (goesTo = "/dashboard/contatti") => {
    const user = userEvent.setup()
    const view = renderInShell(
      (address) => <Page address={address} goesTo={goesTo} />,
      { ...defaultState, page: 2 }
    )
    return { user, ...view }
  }

  it("da tastiera, se il controllo si toglie con la nuova pagina, il focus va alla tabella e non su body", async () => {
    const { user } = setup()
    await user.tab()
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Precedente" })
    )

    await user.keyboard("{Enter}")

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Precedente" })).toBeNull()
    )
    expect(document.activeElement).toBe(screen.getByRole("table"))
  })

  it("se il controllo resta, il focus resta dov'è", async () => {
    const { user, navigations } = setup()
    const other = screen.getByRole("button", { name: "Altro" })
    other.focus()

    await user.keyboard("{Enter}")

    await waitFor(() => expect(navigations).toHaveLength(1))
    expect(document.activeElement).toBe(other)
  })

  it("se nel frattempo il lettore ha portato il focus altrove, non glielo toglie", async () => {
    const { user, router } = setup()
    screen.getByRole("link", { name: "Precedente" }).focus()
    const other = screen.getByRole("button", { name: "Altro" })
    // The reader moves on as soon as the navigation starts
    const unsubscribe = router.subscribe(() => other.focus())

    await user.keyboard("{Enter}")
    unsubscribe()

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Precedente" })).toBeNull()
    )
    expect(document.activeElement).toBe(other)
  })

  it("non tocca il focus se la navigazione esce dalla lista (il dettaglio ha il suo)", async () => {
    const { user } = setup("/dashboard/contatti/101?da=pagina%3D2")
    screen.getByRole("link", { name: "Precedente" }).focus()

    await user.keyboard("{Enter}")

    expect(await screen.findByText("altra pagina")).toBeTruthy()
    expect(screen.queryByRole("table")).toBeNull()
    expect(document.activeElement).toBe(document.body)
  })
})

describe("navigateWith: lo stato verso cui va la lista (M6, M7)", () => {
  it("senza altro stato parte dall'indirizzo", async () => {
    const { result, navigations } = renderHookInShell(useNavigation)

    await act(async () => {
      result.current.navigateWith(
        { ...defaultState, states: ["chiamare"] },
        (base) => withFilterChange(base, { orderBy: "createdAt" })
      )
    })

    expect(navigations).toEqual([
      `PUSH ${listHref({ ...defaultState, states: ["chiamare"], orderBy: "createdAt" })}`,
    ])
  })

  it("parte da quello che il lettore ha già scelto o scritto e non è ancora nell'indirizzo", async () => {
    const { result, navigations } = renderHookInShell(useNavigation)
    result.current.intent.current = { ...defaultState, q: "verdi" }

    await act(async () => {
      result.current.navigateWith(defaultState, (base) =>
        withFilterChange(base, { orderBy: "createdAt" })
      )
    })

    expect(navigations).toEqual([
      `PUSH ${listHref({ ...defaultState, q: "verdi", orderBy: "createdAt" })}`,
    ])
    // And what the next control starts from now has the sort too
    expect(result.current.intent.current?.orderBy).toBe("createdAt")
  })

  it("un giorno che l'indirizzo non può portare resta com'è nell'indirizzo, il resto passa", async () => {
    const address = { ...defaultState, from: "2026-10-01" }
    const { result, navigations } = renderHookInShell(useNavigation, address)
    result.current.intent.current = { ...address, from: "0026-10-01" }

    await act(async () => {
      result.current.navigateWith(address, (base) =>
        withFilterChange(base, { hasAlert: true })
      )
    })

    expect(navigations).toEqual([
      `PUSH ${listHref({ ...address, hasAlert: true })}`,
    ])
    // The controls keep what was typed
    expect(result.current.intent.current?.from).toBe("0026-10-01")
  })

  it("se l'indirizzo non cambierebbe e niente è in corso, non naviga", async () => {
    const address = { ...defaultState, from: "2026-10-01" }
    const { result, navigations } = renderHookInShell(useNavigation, address)

    await act(async () => {
      result.current.navigateWith(address, (base) => ({
        ...base,
        from: "0002-10-01",
      }))
    })

    expect(navigations).toEqual([])
  })

  it("dice se ha navigato o se l'indirizzo era già quello della pagina", async () => {
    const { result } = renderHookInShell(useNavigation)
    let status: string | undefined

    await act(async () => {
      status = result.current.navigateWith(defaultState, (base) =>
        withFilterChange(base, { hasAlert: true })
      ).status
    })
    expect(status).toBe("sent")

    // The address landed: asking for the same state again says nothing new
    await act(async () => {
      status = result.current.navigateWith(
        { ...defaultState, hasAlert: true },
        (base) => base
      ).status
    })
    expect(status).toBe("unchanged")
  })

  it("con replace sostituisce l'indirizzo, come navigate", async () => {
    const { result, navigations } = renderHookInShell(useNavigation)

    await act(async () => {
      result.current.navigateWith(
        defaultState,
        (base) => withFilterChange(base, { q: "ros" }),
        { replace: true }
      )
    })

    expect(navigations).toEqual([
      `REPLACE ${listHref({ ...defaultState, q: "ros" })}`,
    ])
  })
})

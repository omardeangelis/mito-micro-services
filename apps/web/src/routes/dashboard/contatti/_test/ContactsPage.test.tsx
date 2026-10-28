import { act, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { type ContactsQuery } from "@mito/contract/task"
import { contactCustomer, contactRow, fakeContacts } from "@/test/contacts"
import { currentHref, findTable, renderContacts } from "./page"

// The page of the list, as `contatti/page.tsx`, `ContactsTableSection` and
// `contatti/error.tsx` of the Next.js app: what it asks the backend, the
// skeleton, the error of the route, and the page it keeps on screen while the
// next one loads

/** A gate the test opens: until then what waits on it waits */
const gate = () => {
  let open!: () => void
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

const mario = contactRow()
const anna = contactRow({
  id: 102,
  customer: contactCustomer({ id: "c2", name: "Anna", surname: "Verdi" }),
})

/** The rows of a page: Mario on the first, Anna on the others */
const pageOf = (query: ContactsQuery) => {
  const rows = (query.page ?? 1) === 1 ? [mario] : [anna]
  return { contacts: rows, total: 45, previous: [], customerFilter: null }
}

const table = () => screen.getByRole("table", { name: "Contatti" })

describe("la pagina dei contatti", () => {
  it("chiede al backend la pagina dell'indirizzo, con i filtri che il link applica davvero", async () => {
    const backend = fakeContacts()
    renderContacts(
      "/dashboard/contatti?stato=chiamare,inesistente&pagina=2&q=%20ros%20&ordina=creato&verso=asc&miei=1",
      backend
    )
    await findTable()

    expect(backend.state.queries).toEqual([
      expect.objectContaining({
        page: 2,
        states: ["chiamare"],
        customerQuery: "ros",
        orderBy: "createdAt",
        sortedBy: "asc",
        onlyMe: true,
      }),
    ])
  })

  it("un parametro ripetuto vale come assente, come nell'app Next.js", async () => {
    const backend = fakeContacts()
    renderContacts("/dashboard/contatti?stato=chiamare&stato=erogata", backend)
    await findTable()

    expect(backend.state.queries[0]?.states ?? []).toEqual([])
  })

  it("mostra lo scheletro finché la pagina non arriva", async () => {
    const backend = fakeContacts()
    const list = gate()
    backend.state.listGate = list.promise
    renderContacts("/dashboard/contatti", backend)

    await waitFor(() => expect(backend.state.queries).toHaveLength(1))
    expect(screen.queryByRole("table", { name: "Contatti" })).toBeNull()
    list.open()
    await findTable()
    expect(screen.getByRole("link", { name: "Rossi Mario" })).toBeTruthy()
  })

  it("lascia sotto la barra della paginazione lo spazio che serve a un controllo col focus (WCAG 2.4.11)", async () => {
    const { container } = renderContacts("/dashboard/contatti", fakeContacts())
    await findTable()

    // The bar is `sticky bottom-0`, about 56 px: scrolling to a focused control
    // must stop above it. CSS cannot be measured here; the class is the contract
    const layout = container.querySelector(".dashbaord-layout")!
    expect(layout.classList.contains("scroll-pb-16")).toBe(true)
  })
})

describe("la pagina mentre arriva la successiva", () => {
  it("tiene la pagina e i controlli dell'indirizzo di prima, occupata, finché la nuova non arriva", async () => {
    const backend = fakeContacts()
    backend.state.page = pageOf
    const { user } = renderContacts("/dashboard/contatti", backend)
    await findTable()
    const list = gate()
    backend.state.listGate = list.promise

    await user.click(screen.getByRole("link", { name: "Pagina successiva" }))

    await waitFor(() =>
      expect(currentHref()).toBe("/dashboard/contatti?pagina=2")
    )
    await waitFor(() => expect(table().getAttribute("aria-busy")).toBe("true"))
    // The rows and the counter still speak of page 1
    expect(screen.getByRole("link", { name: "Rossi Mario" })).toBeTruthy()
    expect(screen.getByText(/1 - 20 di 45/)).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Pagina precedente" })).toBeNull()

    list.open()

    expect(await screen.findByRole("link", { name: "Verdi Anna" })).toBeTruthy()
    expect(table().getAttribute("aria-busy")).toBe("false")
    expect(screen.getByText(/21 - 40 di 45/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Pagina precedente" })).toBeTruthy()
  })

  it("una pagina già letta torna subito, poi si rilegge", async () => {
    const backend = fakeContacts()
    backend.state.page = pageOf
    const { user } = renderContacts("/dashboard/contatti", backend)
    await findTable()
    await user.click(screen.getByRole("link", { name: "Pagina successiva" }))
    await screen.findByRole("link", { name: "Verdi Anna" })

    await user.click(screen.getByRole("link", { name: "Pagina precedente" }))

    expect(
      await screen.findByRole("link", { name: "Rossi Mario" })
    ).toBeTruthy()
    await waitFor(() => expect(backend.state.queries).toHaveLength(3))
  })
})

describe("quando il backend non risponde", () => {
  it("se la prima pagina fallisce la lista mostra il suo errore, senza il testo dell'errore", async () => {
    const backend = fakeContacts()
    backend.state.failingList = true
    renderContacts("/dashboard/contatti", backend)

    const alert = await screen.findByRole("alert")
    expect(
      within(alert).getByText("Non è stato possibile caricare i contatti")
    ).toBeTruthy()
    expect(screen.queryByText(/backend down/)).toBeNull()
  })

  it("'Riprova' chiede di nuovo la pagina e mostra la lista", async () => {
    const backend = fakeContacts()
    backend.state.failingList = true
    const { user } = renderContacts("/dashboard/contatti", backend)
    await screen.findByText("Non è stato possibile caricare i contatti")
    const asked = backend.state.queries.length

    backend.state.failingList = false
    await user.click(screen.getByRole("button", { name: "Riprova" }))

    await findTable()
    expect(backend.state.queries.length).toBeGreaterThan(asked)
    expect(screen.getByRole("link", { name: "Rossi Mario" })).toBeTruthy()
    expect(currentHref()).toBe("/dashboard/contatti")
  })

  it("se fallisce una pagina dopo, la lista resta a schermo con il toast", async () => {
    const backend = fakeContacts()
    backend.state.page = pageOf
    const { user } = renderContacts("/dashboard/contatti", backend)
    await findTable()
    backend.state.failingList = true

    await user.click(screen.getByRole("link", { name: "Pagina successiva" }))

    expect(
      await screen.findByText("Il servizio non risponde, riprova tra poco")
    ).toBeTruthy()
    expect(screen.getByRole("link", { name: "Rossi Mario" })).toBeTruthy()
    expect(table().getAttribute("aria-busy")).toBe("false")
    expect(
      screen.queryByText("Non è stato possibile caricare i contatti")
    ).toBeNull()
  })

  it("se gli operatori del filtro non arrivano la lista mostra il suo errore", async () => {
    const backend = fakeContacts()
    backend.state.failingOperators = true
    renderContacts("/dashboard/contatti", backend)

    expect(
      await screen.findByText("Non è stato possibile caricare i contatti")
    ).toBeTruthy()
  })
})

describe("i dati della lista dopo una modifica altrove", () => {
  it("una pagina di nuovo a fuoco si rilegge, come la lista di Next.js dopo router.refresh", async () => {
    const backend = fakeContacts()
    renderContacts("/dashboard/contatti", backend)
    await findTable()
    const asked = backend.state.queries.length

    await act(async () => {
      window.dispatchEvent(new Event("visibilitychange"))
      window.dispatchEvent(new Event("focus"))
    })

    await waitFor(() =>
      expect(backend.state.queries.length).toBeGreaterThan(asked)
    )
  })
})

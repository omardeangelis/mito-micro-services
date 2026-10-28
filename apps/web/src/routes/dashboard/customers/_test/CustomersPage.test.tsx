import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { seeContactsHref } from "@mito/client/contact/searchParams"
import { customerRow, fakeCustomers } from "@/test/customers"
import { currentParams, renderCustomers } from "./page"

// The customers list on a backend in memory: the query of the address, the
// sort and the columns of the table, the actions of the rows and the bulk
// assignment, as the tests of `CustomersTable` and `CustomerColumns` of the
// Next.js app

/** The value of the cookie `name` in the browser, as the page wrote it. */
const cookie = (name: string) =>
  document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1)

const clearCookies = () => {
  for (const entry of document.cookie.split("; ")) {
    const name = entry.split("=")[0]
    if (name) document.cookie = `${name}=; path=/; max-age=0`
  }
}

/** The headers of the table, as they read */
const headers = () =>
  screen.getAllByRole("columnheader").map((header) => header.textContent)

const showRows = async () => {
  await screen.findByText("RSSMRA80A01H501U")
}

beforeEach(clearCookies)
afterEach(clearCookies)

describe("CustomersPage, la lista", () => {
  it("mostra lo skeleton, poi le righe della pagina che chiede l'indirizzo", async () => {
    const backend = fakeCustomers()
    renderCustomers(
      "/dashboard/customers?q=Roma&search_by=comune&filter_by=[sede]=Roma-Milano&page=2",
      backend
    )

    expect(document.querySelector('[data-slot="skeleton"]')).not.toBeNull()
    expect(screen.queryByText("RSSMRA80A01H501U")).toBeNull()
    await showRows()

    expect(backend.state.searches[0]).toMatchObject({
      page: 2,
      q: "Roma",
      searchBy: "comune",
      filterBy: { sede: ["Roma", "Milano"] },
      orderBy: "updatedAt",
      sortedBy: "desc",
      onlyMe: false,
      showDM: false,
    })
  })

  it("una riga porta al suo cliente", async () => {
    const user = userEvent.setup()
    renderCustomers("/dashboard/customers", fakeCustomers())
    await showRows()

    await user.click(screen.getByText("RSSMRA80A01H501U"))

    expect(await screen.findByText("altra pagina")).toBeTruthy()
    expect(window.location.pathname).toBe("/dashboard/customers/customer-1")
  })

  it("se la prima pagina non arriva mostra l'errore della rotta", async () => {
    const backend = fakeCustomers()
    backend.state.failingList = true
    renderCustomers("/dashboard/customers", backend)

    expect(await screen.findByText("errore della rotta")).toBeTruthy()
  })

  it("se non arriva una pagina dopo la prima, la tabella resta con il toast", async () => {
    const backend = fakeCustomers()
    const { router } = renderCustomers("/dashboard/customers", backend)
    await showRows()

    backend.state.failingList = true
    await act(() => router.navigate("/dashboard/customers?page=2"))

    expect(
      await screen.findByText("Il servizio non risponde, riprova tra poco")
    ).toBeTruthy()
    expect(screen.getByText("RSSMRA80A01H501U")).toBeTruthy()
    expect(screen.queryByText("errore della rotta")).toBeNull()
  })
})

// L'ordinamento nasce dall'URL e lo riscrive nell'URL: una colonna tolta
// (`contattato`, `priority`) o che non c'è conta come assente e dà quello di
// default, per ultima modifica (AC59, AC60)
describe("CustomersPage, ordinamento", () => {
  it("senza ordinamento nell'URL ordina per ultima modifica, dalla più recente", async () => {
    renderCustomers("/dashboard/customers", fakeCustomers())
    await showRows()

    await waitFor(() =>
      expect(currentParams().get("order_by")).toBe("updatedAt")
    )
    expect(currentParams().get("sorted_by")).toBe("desc")
  })

  it.each([
    ["?order_by=contattato&sorted_by=asc"],
    ["?order_by=priority&sorted_by=asc"],
    ["?order_by=priority"],
    ["?order_by=colonnachenonc'e&sorted_by=asc"],
    // A list of columns with one that is gone: the whole sort is the default
    ["?order_by=name,priority&sorted_by=asc,desc"],
    ["?order_by=contattato,name&sorted_by=asc,asc"],
  ])(
    "con %s riparte dal default e non riscrive i parametri tolti",
    async (search) => {
      renderCustomers(`/dashboard/customers${search}`, fakeCustomers())
      await showRows()

      await waitFor(() =>
        expect(currentParams().get("order_by")).toBe("updatedAt")
      )
      expect(currentParams().get("sorted_by")).toBe("desc")
    }
  )

  it("un ordinamento che esiste resta, con la sua direzione", async () => {
    const backend = fakeCustomers()
    renderCustomers("/dashboard/customers?order_by=name&sorted_by=asc", backend)
    await showRows()

    expect(currentParams().get("order_by")).toBe("name")
    expect(currentParams().get("sorted_by")).toBe("asc")
    expect(backend.state.searches.at(-1)).toMatchObject({
      orderBy: "name",
      sortedBy: "asc",
    })
  })

  it("cliccare una colonna ordina per lei e rilegge la lista", async () => {
    const user = userEvent.setup()
    const backend = fakeCustomers()
    renderCustomers(
      "/dashboard/customers?order_by=updatedAt&sorted_by=desc",
      backend
    )
    await showRows()

    await user.click(screen.getByRole("button", { name: "Nome" }))

    await waitFor(() =>
      expect(backend.state.searches.at(-1)).toMatchObject({
        orderBy: "name",
        sortedBy: "asc",
      })
    )
    expect(currentParams().get("order_by")).toBe("name")
  })
})

describe("CustomersPage, colonne", () => {
  it("non ha più 'Stato Chiamate', 'Contattato il' e 'Priorità'", async () => {
    renderCustomers("/dashboard/customers", fakeCustomers())
    await showRows()

    for (const header of ["Chiamate", "Contattato il", "Priorità"]) {
      expect(headers().join(" ")).not.toContain(header)
    }
    expect(headers()).toContain("Nome")
  })

  it("le colonne nascoste vengono dalle preferenze, e una colonna tolta non svuota la tabella (AC32)", async () => {
    renderCustomers("/dashboard/customers", fakeCustomers(), {
      preferences: {
        customerTableVisibleColumns: [
          "Stato Chiamate",
          "Contattato il",
          "Sede",
        ],
      },
    })
    await showRows()

    expect(headers()).toContain("Nome")
    expect(headers()).not.toContain("Sede")
    expect(screen.getByText("Mario")).toBeTruthy()
  })

  it("nascondere una colonna la toglie e scrive il cookie, senza nessuna fetch (AC31)", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const user = userEvent.setup()
    renderCustomers("/dashboard/customers", fakeCustomers())
    await showRows()
    expect(headers()).toContain("Email")
    // Showing the table writes nothing
    expect(cookie("mito-pref-ct")).toBeUndefined()

    await user.click(screen.getByRole("button", { name: "Colonne" }))
    await user.click(screen.getByRole("menuitemcheckbox", { name: "email" }))

    await waitFor(() => expect(headers()).not.toContain("Email"))
    const saved = cookie("mito-pref-ct")
    expect(saved).toBeDefined()
    expect(JSON.parse(decodeURIComponent(saved!))).toContain("email")
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("la selezione è solo dell'ADMIN", async () => {
    renderCustomers("/dashboard/customers", fakeCustomers(), {
      role: "OPERATORE",
    })
    await showRows()

    expect(screen.queryByRole("checkbox", { name: "Select all" })).toBeNull()
    expect(screen.queryByRole("checkbox", { name: "Select row" })).toBeNull()
  })
})

describe("CustomersPage, il menu azioni della riga", () => {
  it("offre 'Vedi contatti': Contatti filtrata sul cliente, con i precedenti, dal più recente (AC21, AC62)", async () => {
    const user = userEvent.setup()
    renderCustomers("/dashboard/customers", fakeCustomers())
    await showRows()

    await user.click(screen.getByRole("button", { name: "Open menu" }))

    const link = screen.getByRole("menuitem", { name: "Vedi contatti" })
    expect(link.getAttribute("href")).toBe(seeContactsHref("customer-1"))
    expect(link.getAttribute("href")).toBe(
      "/dashboard/contatti?cliente=customer-1&precedenti=1&ordina=creato&verso=desc"
    )
  })

  it("'Aggiungi alla BlackList' manda il cliente in revisione e rilegge la lista", async () => {
    const user = userEvent.setup()
    const backend = fakeCustomers()
    renderCustomers("/dashboard/customers", backend)
    await showRows()
    const reads = backend.state.searches.length

    await user.click(screen.getByRole("button", { name: "Open menu" }))
    await user.click(
      screen.getByRole("menuitem", { name: "Aggiungi alla BlackList" })
    )

    await waitFor(() =>
      expect(backend.state.blackListed).toEqual([
        { id: "customer-1", blackListStatus: "review" },
      ])
    )
    await waitFor(() =>
      expect(backend.state.searches.length).toBeGreaterThan(reads)
    )
    // The row didn't open its customer
    expect(window.location.pathname).toBe("/dashboard/customers")
  })

  it("un cliente già in blacklist o in revisione non ha la voce", async () => {
    const user = userEvent.setup()
    renderCustomers(
      "/dashboard/customers",
      fakeCustomers({ rows: [customerRow({ blackListStatus: "review" })] })
    )
    await showRows()

    await user.click(screen.getByRole("button", { name: "Open menu" }))

    expect(screen.getByRole("menuitem", { name: "Vedi contatti" })).toBeTruthy()
    expect(
      screen.queryByRole("menuitem", { name: "Aggiungi alla BlackList" })
    ).toBeNull()
  })
})

describe("CustomersPage, assegnazione massiva", () => {
  it("'Assegna Clienti' assegna i clienti selezionati all'operatore e rilegge la lista", async () => {
    const user = userEvent.setup()
    const backend = fakeCustomers({
      rows: [
        customerRow(),
        customerRow({ id: "customer-2", fiscalCode: "BNCLRA85B41F205X" }),
      ],
    })
    renderCustomers("/dashboard/customers", backend)
    await showRows()
    const reads = backend.state.searches.length

    const [first, second] = screen.getAllByRole("checkbox", {
      name: "Select row",
    })
    await user.click(first!)
    await user.click(second!)
    await user.click(screen.getByRole("button", { name: "Edit" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", { name: /Assegna Clienti/ })
    )
    await user.click(screen.getByRole("combobox", { name: "Operatore" }))
    await user.click(await screen.findByRole("option", { name: "Anna Verdi" }))
    await user.click(screen.getByRole("button", { name: "Assegna clienti" }))

    expect(await screen.findByText("Clienti assegnati")).toBeTruthy()
    expect(
      backend.state.assigned.flatMap((call) => call.customerIds).sort()
    ).toEqual(["customer-1", "customer-2"])
    expect(backend.state.assigned.every((call) => call.operatorId === 1)).toBe(
      true
    )
    await waitFor(() =>
      expect(backend.state.searches.length).toBeGreaterThan(reads)
    )
  })
})

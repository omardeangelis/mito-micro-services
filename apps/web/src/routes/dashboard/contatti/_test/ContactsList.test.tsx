import { act, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { type ContactsQuery } from "@mito/contract/task"
import {
  defaultState,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { contactRow, fakeContacts } from "@/test/contacts"
import { listHref } from "../_lib/listHref"
import { currentHref, findTable, renderContacts } from "./page"

// The list as the page puts it together, as the tests of `ContactsList` of
// the Next.js app: the filters bar and the table, on a backend in memory.
// What each control leaves on screen is what these tests look at

/** 3 pages of 20; "Con alert" matches nothing, the other filters keep the rows */
const TOTAL = 45

const row = contactRow({
  operator: { id: 9, name: "Giulia", surname: "Bianchi" },
})

const pageOf = (query: ContactsQuery) => {
  const empty = query.hasAlert === true || (query.page ?? 1) > 3
  return {
    contacts: empty ? [] : [row],
    total: query.hasAlert === true ? 0 : TOTAL,
    previous: [],
    customerFilter:
      query.customerId === undefined
        ? null
        : {
            found: true as const,
            name: "Mario",
            surname: "Rossi",
            totalContacts: TOTAL,
          },
  }
}

const setup = async (initial: ContactsListState = defaultState) => {
  const backend = fakeContacts()
  backend.state.page = pageOf
  const view = renderContacts(listHref(initial), backend)
  await findTable()
  return view
}

const table = () => screen.getByRole("table", { name: "Contatti" })

/** Waits until the list shows the page of the address it is on */
const settled = (href: string) =>
  waitFor(() => {
    expect(currentHref()).toBe(href)
    expect(table().closest("[aria-busy=true]")).toBeNull()
  })

// Longer than the quiet time of the search (300 ms)
const afterTheSearchDelay = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 400)))

describe("il focus quando il controllo usato si toglie da solo (B3, P17)", () => {
  it("'Precedente' verso la prima pagina: il focus va alla tabella", async () => {
    const { user } = await setup({ ...defaultState, page: 2 })
    screen.getByRole("link", { name: "Pagina precedente" }).focus()

    await user.keyboard("{Enter}")

    await settled("/dashboard/contatti")
    expect(screen.queryByRole("link", { name: "Pagina precedente" })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(table()))
  })

  it("'Successiva' verso l'ultima pagina: il focus va alla tabella", async () => {
    const { user } = await setup({ ...defaultState, page: 2 })
    screen.getByRole("link", { name: "Pagina successiva" }).focus()

    await user.keyboard("{Enter}")

    await settled("/dashboard/contatti?pagina=3")
    expect(screen.queryByRole("link", { name: "Pagina successiva" })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(table()))
  })

  it("'Rimuovi il filtro cliente': il focus va alla tabella", async () => {
    const { user } = await setup({ ...defaultState, customerId: "c1" })
    screen.getByRole("button", { name: "Rimuovi il filtro cliente" }).focus()

    await user.keyboard("{Enter}")

    await settled("/dashboard/contatti")
    expect(
      screen.queryByRole("button", { name: "Rimuovi il filtro cliente" })
    ).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(table()))
  })

  it("'Azzera filtri': il focus va alla tabella", async () => {
    const { user } = await setup({ ...defaultState, hasAlert: true })
    screen.getByRole("link", { name: "Azzera filtri" }).focus()

    await user.keyboard("{Enter}")

    await settled("/dashboard/contatti")
    expect(screen.queryByRole("link", { name: "Azzera filtri" })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(table()))
  })

  it("'Vai alla prima pagina': il focus va alla tabella", async () => {
    const { user } = await setup({ ...defaultState, page: 5 })
    screen.getByRole("link", { name: "Vai alla prima pagina" }).focus()

    await user.keyboard("{Enter}")

    await settled("/dashboard/contatti")
    expect(
      screen.queryByRole("link", { name: "Vai alla prima pagina" })
    ).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(table()))
  })

  it("un controllo che resta (1 verso 2) tiene il focus", async () => {
    const { user } = await setup({ ...defaultState, page: 1 })
    screen.getByRole("link", { name: "Pagina successiva" }).focus()

    await user.keyboard("{Enter}")

    await settled("/dashboard/contatti?pagina=2")
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Pagina successiva" })
    )
  })
})

describe("la ricerca scritta e non ancora inviata, con un altro controllo (M6)", () => {
  const type = async (
    user: Awaited<ReturnType<typeof setup>>["user"],
    text: string
  ) => {
    await user.click(screen.getByRole("searchbox", { name: "Cerca cliente" }))
    await user.keyboard(text)
  }

  it("l'ordinamento di una colonna porta con sé la ricerca e la lista resta filtrata", async () => {
    const { user, navigations } = await setup()
    await type(user, "verdi")

    await user.click(screen.getByRole("button", { name: "Creato" }))

    await waitFor(() => expect(navigations).toHaveLength(1))
    expect(navigations[0]).toMatch(/^PUSH /)
    expect(navigations[0]).toContain("q=verdi")
    expect(navigations[0]).toContain("ordina=creato")
    // The 300 ms run out afterwards: nothing more goes to the address
    await afterTheSearchDelay()
    expect(navigations).toHaveLength(1)
    expect(
      screen.getByRole<HTMLInputElement>("searchbox", { name: "Cerca cliente" })
        .value
    ).toBe("verdi")
  })

  it("'Successiva' porta con sé la ricerca", async () => {
    const { user, navigations } = await setup()
    await type(user, "verdi")

    await user.click(screen.getByRole("link", { name: "Pagina successiva" }))

    await waitFor(() => expect(navigations).toHaveLength(1))
    expect(navigations[0]).toMatch(/^PUSH /)
    expect(navigations[0]).toContain("q=verdi")
    expect(navigations[0]).toContain("pagina=2")
  })

  it("il numero di righe porta con sé la ricerca", async () => {
    const { user, navigations } = await setup()
    await type(user, "verdi")

    await user.click(screen.getByRole("combobox", { name: "Righe per pagina" }))
    await user.click(screen.getByRole("option", { name: "50" }))

    await waitFor(() => expect(navigations).toHaveLength(1))
    expect(navigations[0]).toMatch(/^PUSH /)
    expect(navigations[0]).toContain("q=verdi")
    expect(navigations[0]).toContain("per_pagina=50")
  })

  it("'Azzera filtri' toglie anche il testo che nessun indirizzo ha ancora", async () => {
    const { user, navigations } = await setup({
      ...defaultState,
      hasAlert: true,
    })
    await type(user, "verdi")

    await user.click(screen.getByRole("link", { name: "Azzera filtri" }))
    await afterTheSearchDelay()

    expect(
      screen.getByRole<HTMLInputElement>("searchbox", { name: "Cerca cliente" })
        .value
    ).toBe("")
    expect(navigations.some((href) => href.includes("q=verdi"))).toBe(false)
  })
})

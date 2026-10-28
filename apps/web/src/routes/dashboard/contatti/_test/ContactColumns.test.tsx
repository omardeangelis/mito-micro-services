import { act, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { contactRow, fakeContacts } from "@/test/contacts"
import { findTable, renderContacts } from "./page"

// The "Colonne" menu of the bar and the columns of the table, as the tests of
// `ContactColumnsMenu`, `ContactColumnsMenu.cookie` and
// `ContactsTable.columns` of the Next.js app: hiding a column writes the
// cookie and the store, and nothing goes to the backend

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

/** The list with one row, the columns in `hidden` hidden */
const renderList = async (hidden?: string[]) => {
  const backend = fakeContacts({ rows: [contactRow()] })
  const view = renderContacts("/dashboard/contatti", backend, {
    preferences:
      hidden === undefined ? undefined : { contactTableVisibleColumns: hidden },
  })
  await findTable()
  return { ...view, backend }
}

const openMenu = (user: Awaited<ReturnType<typeof renderList>>["user"]) =>
  user.click(screen.getByRole("button", { name: "Colonne" }))

const headers = () =>
  screen
    .getAllByRole("columnheader")
    .map((header) => header.textContent?.trim())

beforeEach(() => {
  clearCookies()
})

describe("la voce per nascondere le colonne (AC5)", () => {
  it("offre Telefono e CF, spuntati quando sono visibili", async () => {
    const { user } = await renderList(["CF"])

    await openMenu(user)

    const items = screen.getAllByRole("menuitemcheckbox")
    expect(items.map((item) => item.textContent)).toEqual(["Telefono", "CF"])
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
    ])
  })

  it("nascondere una colonna: la tabella lo sa subito, lo store e il cookie pure, senza nessuna richiesta al backend (AC31)", async () => {
    const { user, store, backend } = await renderList([])
    const read = backend.state.queries.length
    await openMenu(user)

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Telefono" }))

    expect(headers()).not.toContain("Telefono")
    expect(store.getState().preferences?.contactTableVisibleColumns).toEqual([
      "Telefono",
    ])
    expect(JSON.parse(decodeURIComponent(cookie("mito-pref-cot")!))).toEqual([
      "Telefono",
    ])
    expect(cookie("mito-pref-ct")).toBeUndefined()
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))
    expect(backend.state.queries).toHaveLength(read)
  })

  it("mostrare una colonna nascosta la toglie dall'elenco, senza toccare le altre", async () => {
    const { user, store } = await renderList(["Telefono", "CF"])
    await openMenu(user)

    await user.click(screen.getByRole("menuitemcheckbox", { name: "CF" }))

    expect(store.getState().preferences?.contactTableVisibleColumns).toEqual([
      "Telefono",
    ])
  })

  it("conserva i nomi che non conosce (una colonna di domani)", async () => {
    const { user, store } = await renderList(["colonna-futura"])
    await openMenu(user)

    await user.click(screen.getByRole("menuitemcheckbox", { name: "CF" }))

    expect(store.getState().preferences?.contactTableVisibleColumns).toEqual([
      "colonna-futura",
      "CF",
    ])
  })
})

describe("il focus del menu delle colonne (P17)", () => {
  it("Esc chiude il menu e riporta il focus sul pulsante 'Colonne', non su body", async () => {
    const { user } = await renderList()
    const trigger = screen.getByRole("button", { name: "Colonne" })

    await openMenu(user)
    expect(screen.getAllByRole("menuitemcheckbox")).toHaveLength(2)
    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(screen.queryAllByRole("menuitemcheckbox")).toHaveLength(0)
    )
    expect(document.activeElement).toBe(trigger)
  })

  it("dopo aver scelto una colonna il menu resta aperto e Esc riporta comunque il focus sul pulsante", async () => {
    const { user } = await renderList()
    const trigger = screen.getByRole("button", { name: "Colonne" })
    await openMenu(user)

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Telefono" }))
    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(screen.queryAllByRole("menuitemcheckbox")).toHaveLength(0)
    )
    expect(document.activeElement).toBe(trigger)
  })
})

describe("nascondere Telefono e CF dalla tabella (AC5)", () => {
  it("la colonna sparisce subito e torna quando si rimostra", async () => {
    const { user } = await renderList()
    expect(headers()).toContain("Telefono")

    await openMenu(user)
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Telefono" }))

    expect(headers()).not.toContain("Telefono")
    expect(headers()).toContain("CF")
    expect(screen.queryByText("333 1234567")).toBeNull()

    await user.keyboard("{Escape}")
    await openMenu(user)
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Telefono" }))

    expect(headers()).toContain("Telefono")
    expect(screen.getByText("333 1234567")).toBeTruthy()
  })

  it("parte dalle colonne che l'operatore aveva già nascoste", async () => {
    const { user } = await renderList(["CF"])

    expect(headers()).not.toContain("CF")
    await openMenu(user)
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "CF" })
        .getAttribute("aria-checked")
    ).toBe("false")
  })

  it("le prende anche dal cookie del browser, che vince sulle preferenze", async () => {
    document.cookie = `mito-pref-cot=${encodeURIComponent(JSON.stringify(["Telefono"]))}; path=/`

    await renderList(["CF"])

    expect(headers()).not.toContain("Telefono")
    expect(headers()).toContain("CF")
  })
})

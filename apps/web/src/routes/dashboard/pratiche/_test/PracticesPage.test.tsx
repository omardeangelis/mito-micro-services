import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakePratiche, practiceRow } from "@/test/pratiche"
import { currentParams, renderPratiche } from "./page"

// The practices list on a backend in memory: the query of the address, the
// sort, the columns and the search, as the tests of `PracticesTable`,
// `TableFilterSection` and `pratiche/page.tsx` of the Next.js app

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
  await screen.findByText("PR-2026-1")
}

/** The search of the list: its field and its badge */
const searchField = () => screen.getByPlaceholderText("Cerca Pratica ID")
const badge = () => document.querySelector(".badge-with-close")?.textContent

beforeEach(clearCookies)
afterEach(clearCookies)

describe("PracticesPage, la lista", () => {
  it("mostra lo skeleton, poi le righe della pagina che chiede l'indirizzo", async () => {
    const backend = fakePratiche({
      rows: [
        practiceRow(),
        practiceRow({ id: 1002, praticaId: "PR-2026-2", productId: "37" }),
      ],
    })
    const filterBy = encodeURIComponent("[state]=Chiusa")
    renderPratiche(
      `/dashboard/pratiche?q=PR-2026&search_by=praticaId&filter_by=${filterBy}&page=2&filter=importo_rata:gt:150`,
      backend
    )

    expect(document.querySelector('[data-slot="skeleton"]')).not.toBeNull()
    await showRows()

    expect(backend.state.searches[0]).toMatchObject({
      page: 2,
      q: "PR-2026",
      searchBy: "praticaId",
      filterBy: { state: "Chiusa" },
      orderBy: "updatedAt",
      sortedBy: "asc",
      advancedFilters: [{ field: "importo_rata", op: "gt", value: "150" }],
    })
    // The amount in euro, the dates as the Next.js app
    expect(screen.getAllByText("12.000,50 €")).toHaveLength(2)
    expect(screen.getAllByText("15/1/2026")).toHaveLength(2)
    // The label of the product, and none for a practice without one
    expect(screen.getAllByText("cqs parapubblico")).toHaveLength(1)
  })

  it("una riga porta alla sua pratica, con l'ID codificato nell'indirizzo", async () => {
    const user = userEvent.setup()
    renderPratiche(
      "/dashboard/pratiche",
      fakePratiche({ rows: [practiceRow({ praticaId: "AB/1 ?x" })] })
    )
    await screen.findByText("AB/1 ?x")

    await user.click(screen.getByText("AB/1 ?x"))

    await waitFor(() =>
      expect(window.location.pathname).toBe("/dashboard/pratiche/AB%2F1%20%3Fx")
    )
  })

  it("senza pratiche dice 'No results.'", async () => {
    renderPratiche("/dashboard/pratiche", fakePratiche({ rows: [] }))

    expect(await screen.findByText("No results.")).toBeTruthy()
  })

  it("se la prima pagina non arriva mostra l'errore della rotta", async () => {
    const backend = fakePratiche()
    backend.state.failingList = true
    renderPratiche("/dashboard/pratiche", backend)

    expect(await screen.findByText("errore della rotta")).toBeTruthy()
    expect(
      screen.queryByText("Il servizio non risponde, riprova tra poco")
    ).toBeNull()
  })

  it("se non arriva una pagina dopo la prima, la tabella resta con il toast", async () => {
    const backend = fakePratiche()
    const { router } = renderPratiche("/dashboard/pratiche", backend)
    await showRows()

    backend.state.failingList = true
    await act(() => router.navigate("/dashboard/pratiche?page=2"))

    await waitFor(() =>
      expect(
        screen.getAllByText("Il servizio non risponde, riprova tra poco")
      ).toHaveLength(1)
    )
    expect(screen.getByText("PR-2026-1")).toBeTruthy()
    expect(screen.queryByText("errore della rotta")).toBeNull()
  })
})

describe("PracticesPage, ordinamento", () => {
  it("senza ordinamento nell'URL ordina per ultima modifica, dalla meno recente", async () => {
    renderPratiche("/dashboard/pratiche", fakePratiche())
    await showRows()

    await waitFor(() =>
      expect(currentParams().get("order_by")).toBe("updatedAt")
    )
    expect(currentParams().get("sorted_by")).toBe("asc")
  })

  it("un ordinamento che esiste resta, con la sua direzione", async () => {
    const backend = fakePratiche()
    renderPratiche(
      "/dashboard/pratiche?order_by=importoFinanziato&sorted_by=desc",
      backend
    )
    await showRows()

    expect(currentParams().get("order_by")).toBe("importoFinanziato")
    expect(currentParams().get("sorted_by")).toBe("desc")
    expect(backend.state.searches.at(-1)).toMatchObject({
      orderBy: "importoFinanziato",
      sortedBy: "desc",
    })
  })

  it("cliccare una colonna ordina per lei e rilegge la lista", async () => {
    const user = userEvent.setup()
    const backend = fakePratiche()
    renderPratiche(
      "/dashboard/pratiche?order_by=updatedAt&sorted_by=asc",
      backend
    )
    await showRows()

    await user.click(screen.getByRole("button", { name: "Rate Totali" }))

    await waitFor(() =>
      expect(backend.state.searches.at(-1)).toMatchObject({
        orderBy: "rateTotali",
        sortedBy: "asc",
      })
    )
    expect(currentParams().get("order_by")).toBe("rateTotali")
  })
})

// Le colonne nascoste di Pratiche restano nel browser, in un cookie (AC31,
// AC32)
describe("PracticesPage, colonne nascoste nel cookie", () => {
  it("le colonne nascoste vengono dalle preferenze", async () => {
    renderPratiche("/dashboard/pratiche", fakePratiche(), {
      preferences: { practicesTableVisibleColumns: ["Prodotto"] },
    })
    await showRows()

    expect(headers()).not.toContain("Prodotto")
    expect(headers()).toContain("ID")
  })

  it("nascondere una colonna la toglie e scrive il cookie, senza nessuna fetch", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const user = userEvent.setup()
    renderPratiche("/dashboard/pratiche", fakePratiche())
    await showRows()
    expect(headers()).toContain("Prodotto")
    // Showing the table writes nothing
    expect(cookie("mito-pref-pt")).toBeUndefined()

    await user.click(screen.getByRole("button", { name: "Colonne" }))
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Prodotto" }))

    await waitFor(() => expect(headers()).not.toContain("Prodotto"))
    const saved = cookie("mito-pref-pt")
    expect(saved).toBeDefined()
    expect(JSON.parse(decodeURIComponent(saved!))).toContain("Prodotto")
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

// Il campo di ricerca e il badge mentre l'URL cambia senza rimontare la pagina
describe("PracticesPage, ricerca", () => {
  it("con back e avanti segue l'URL", async () => {
    const { router } = renderPratiche(
      "/dashboard/pratiche?q=PR-1&search_by=praticaId",
      fakePratiche()
    )
    await showRows()
    expect(badge()).toBe("ID Pratica: PR-1")
    expect(searchField()).toHaveProperty("value", "PR-1")

    await act(() =>
      router.navigate("/dashboard/pratiche?q=PR-2&search_by=praticaId")
    )
    await waitFor(() => expect(badge()).toBe("ID Pratica: PR-2"))
    expect(searchField()).toHaveProperty("value", "PR-2")

    await act(() => router.navigate("/dashboard/pratiche"))
    await waitFor(() => expect(badge()).toBeUndefined())
    expect(searchField()).toHaveProperty("value", "")
  })

  it("cerca dal campo e si toglie dal badge", async () => {
    const user = userEvent.setup()
    const backend = fakePratiche()
    renderPratiche("/dashboard/pratiche", backend)
    await showRows()

    await user.type(searchField(), "PR-7")
    await user.click(screen.getByRole("button", { name: "Cerca" }))

    await waitFor(() => expect(currentParams().get("q")).toBe("PR-7"))
    expect(currentParams().get("search_by")).toBe("praticaId")
    await waitFor(() => expect(badge()).toBe("ID Pratica: PR-7"))
    await waitFor(() =>
      expect(backend.state.searches.at(-1)).toMatchObject({ q: "PR-7" })
    )

    await user.click(document.querySelector<HTMLElement>(".badge-with-close")!)

    await waitFor(() => expect(currentParams().get("q")).toBeNull())
    expect(badge()).toBeUndefined()
    expect(searchField()).toHaveProperty("value", "")
  })
})

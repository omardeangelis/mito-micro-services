import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { fakeHome } from "@/test/home"
import { practiceRow } from "@/test/pratiche"
import { renderHome } from "./page"

// The home of the dashboard on a backend in memory: the time frame of the
// address, the cards of each role, the link to the import and the practices
// updated last, as the tests of `dashboard/page.tsx`, `DataSection`,
// `ImportLink` and `CallsSection` of the Next.js app

/** The titles of the cards, in their order */
const cardTitles = () =>
  screen
    .getAllByRole("heading", { level: 2 })
    .map((title) => title.textContent)
    .filter((title) => /^(Finanziato|Contatti)/.test(title ?? ""))

/** The dates of the windows the cards show */
const dates = () =>
  screen.getAllByText(/^\d{1,2}\/\d{2}\/\d{4}$/).map((date) => date.textContent)

const showCards = async () => {
  await screen.findByText("Contatti con esito")
}

/** The time frame the selector shows */
const selector = () => screen.getByRole("combobox").textContent

describe("HomePage, il periodo dell'indirizzo (AC11)", () => {
  it.each([
    ["/dashboard?tf=7d", "30d"],
    ["/dashboard", "30d"],
    ["/dashboard?tf=90d&tf=365d", "30d"],
    ["/dashboard?tf=365d", "365d"],
  ])("%s: le card e il selettore usano %s", async (path, timeframe) => {
    const backend = fakeHome()
    renderHome(path, backend)
    await showCards()

    expect(backend.state.totalReads).toEqual([timeframe])
    expect(backend.state.averageReads).toEqual([timeframe])
    expect(selector()).toBe(timeframe)
  })

  it("scegliere un periodo lo scrive nell'indirizzo e rilegge le card", async () => {
    const user = userEvent.setup()
    const backend = fakeHome()
    renderHome("/dashboard", backend)
    await showCards()

    await user.click(screen.getByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "90d" }))

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("tf")).toBe("90d")
    )
    await waitFor(() => expect(backend.state.totalReads).toContain("90d"))
    expect(backend.state.averageReads).toContain("90d")
    await waitFor(() => expect(selector()).toBe("90d"))
  })

  it("con indietro torna al periodo di prima", async () => {
    const backend = fakeHome()
    const { router } = renderHome("/dashboard?tf=90d", backend)
    await showCards()

    await act(() => router.navigate("/dashboard?tf=365d"))
    await waitFor(() => expect(selector()).toBe("365d"))
    await act(() => router.navigate(-1))

    await waitFor(() => expect(selector()).toBe("90d"))
    expect(backend.state.totalReads.at(-1)).toBe("90d")
  })
})

describe("HomePage, le card dell'admin", () => {
  it('le intestazioni delle card sono, in ordine, "Finanziato medio per pratica", "Contatti con esito" e "Finanziato totale per sede"', async () => {
    const backend = fakeHome()
    renderHome("/dashboard", backend, { role: "ADMIN" })
    await showCards()

    const titles = [
      "Finanziato medio per pratica",
      "Contatti con esito",
      "Finanziato totale per sede",
    ]
    expect(cardTitles()).toEqual(titles)
    // The admin's cards: no total, but the points of sale
    expect(backend.state.totalReads).toEqual([])
    expect(backend.state.branchReads).toEqual(["30d"])
  })

  it("la card della media mostra le date delle finestre della risposta", async () => {
    renderHome("/dashboard", fakeHome(), { role: "ADMIN" })
    await showCards()

    expect(dates()).toEqual(["10/01/2026", "10/02/2026", "12/03/2026"])
  })

  it("mostra i contatti con esito e il finanziato della sede", async () => {
    renderHome(
      "/dashboard",
      fakeHome({
        progress: { done: 3, todo: 1 },
        branches: [{ data: "Roma", total: 150_000 }],
      }),
      { role: "ADMIN" }
    )
    await showCards()

    expect(screen.getByText("3/4 (75%)")).toBeTruthy()
    expect(screen.getByText("Roma")).toBeInTheDocument()
  })
})

describe("HomePage, le card dell'operatore", () => {
  it('le intestazioni delle card sono, in ordine, "Finanziato totale", "Contatti con esito" e "Finanziato medio per pratica"', async () => {
    const backend = fakeHome()
    renderHome("/dashboard", backend)
    await showCards()

    expect(cardTitles()).toEqual([
      "Finanziato totale",
      "Contatti con esito",
      "Finanziato medio per pratica",
    ])
    // Not the points of sale, which are the admin's
    expect(backend.state.branchReads).toEqual([])
  })

  it("le due card degli importi mostrano le date delle finestre della risposta", async () => {
    renderHome("/dashboard", fakeHome())
    await showCards()

    expect(dates()).toEqual([
      "10/01/2026",
      "10/02/2026",
      "12/03/2026",
      "10/01/2026",
      "10/02/2026",
      "12/03/2026",
    ])
  })

  it("se le card non arrivano mostra l'errore della rotta", async () => {
    const backend = fakeHome()
    backend.state.failingCards = true
    renderHome("/dashboard", backend)

    expect(await screen.findByText("errore della rotta")).toBeTruthy()
  })
})

describe("HomePage, Nuovo import e chiamate (AC1, AC6, AC28)", () => {
  it("un operatore non vede né il link all'import né le chiamate", async () => {
    const backend = fakeHome()
    renderHome("/dashboard", backend)
    await showCards()

    expect(screen.queryByRole("link", { name: "Nuovo import" })).toBeNull()
    expect(screen.queryByText("Chiamate per operatore")).toBeNull()
    expect(backend.state.callReads).toEqual([])
  })

  it("un admin va all'import dal link e vede le chiamate", async () => {
    const user = userEvent.setup()
    renderHome("/dashboard", fakeHome(), { role: "ADMIN" })
    await showCards()

    expect(screen.getByText("Chiamate per operatore")).toBeTruthy()
    expect(await screen.findByText("Chiamate effettuate")).toBeTruthy()
    await user.click(screen.getByRole("link", { name: "Nuovo import" }))

    expect(await screen.findByText("altra pagina")).toBeTruthy()
    expect(window.location.pathname).toBe("/dashboard/import")
  })
})

describe("HomePage, ultime pratiche aggiornate", () => {
  it("chiede le 6 aggiornate per ultime, di tutti, e le mostra", async () => {
    const backend = fakeHome({
      rows: [practiceRow(), practiceRow({ id: 1002, praticaId: "PR-2026-2" })],
    })
    renderHome("/dashboard", backend)

    expect(await screen.findByText("PR-2026-2")).toBeTruthy()
    expect(backend.state.searches).toEqual([
      {
        page: 1,
        perPage: 6,
        orderBy: "updatedAt",
        sortedBy: "desc",
        filterBy: { onlyMe: false },
      },
    ])
  })

  it("una riga porta alla sua pratica, con l'ID codificato nell'indirizzo", async () => {
    const user = userEvent.setup()
    renderHome(
      "/dashboard",
      fakeHome({ rows: [practiceRow({ praticaId: "AB/1 ?x" })] })
    )

    await user.click(await screen.findByText("AB/1 ?x"))

    expect(await screen.findByText("altra pagina")).toBeTruthy()
    expect(window.location.pathname).toBe("/dashboard/pratiche/AB%2F1%20%3Fx")
  })

  it("senza pratiche dice 'No results.'", async () => {
    renderHome("/dashboard", fakeHome({ rows: [] }))

    expect(await screen.findByText("No results.")).toBeTruthy()
  })
})

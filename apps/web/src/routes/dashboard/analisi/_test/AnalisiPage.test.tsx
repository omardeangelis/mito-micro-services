import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { fakeAnalisi } from "@/test/analisi"
import { renderAnalisi } from "./page"

const tabNames = () =>
  within(screen.getByRole("tablist", { name: "Indicatori" }))
    .getAllByRole("tab")
    .map((tab) => tab.getAttribute("aria-label") ?? tab.textContent)

describe("the indicators (AC3, AC36)", () => {
  it("are five tabs for the operator, without the branches", async () => {
    renderAnalisi("/dashboard/analisi", fakeAnalisi(), { role: "OPERATORE" })

    const tablist = await screen.findByRole("tablist", { name: "Indicatori" })
    const tabs = within(tablist).getAllByRole("tab")
    expect(tabs).toHaveLength(5)
    expect(tablist).not.toHaveTextContent("Finanziato per sede")
  })

  it("are six tabs for the admin, in the order of the spec, one selected", async () => {
    renderAnalisi("/dashboard/analisi", fakeAnalisi(), { role: "ADMIN" })

    const tablist = await screen.findByRole("tablist", { name: "Indicatori" })
    const tabs = within(tablist).getAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      expect.stringContaining("Finanziato totale"),
      expect.stringContaining("Finanziato medio per pratica"),
      expect.stringContaining("Finanziato per sede"),
      expect.stringContaining("Contatti con esito"),
      expect.stringContaining("Risposte per operatore"),
      expect.stringContaining("Tasso di appuntamento"),
    ])
    expect(
      tabs.filter((tab) => tab.getAttribute("aria-selected") === "true")
    ).toHaveLength(1)
    expect(tabNames()).toHaveLength(6)
  })

  it("names the panel after the chart selected", async () => {
    renderAnalisi("/dashboard/analisi?chart=average", fakeAnalisi(), {
      role: "ADMIN",
    })

    expect(
      await screen.findByRole("tabpanel", {
        name: "Finanziato medio per pratica",
      })
    ).toBeInTheDocument()
  })

  it("moves with the arrows and Home/End, focus included", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi?chart=financed", fakeAnalisi(), {
      role: "ADMIN",
    })
    const first = await screen.findByRole("tab", {
      name: /Finanziato totale/,
    })
    first.focus()

    await user.keyboard("{ArrowDown}")
    const second = screen.getByRole("tab", {
      name: /Finanziato medio per pratica/,
    })
    expect(second).toHaveAttribute("aria-selected", "true")
    expect(second).toHaveFocus()

    await user.keyboard("{End}")
    const last = screen.getByRole("tab", { name: /Tasso di appuntamento/ })
    expect(last).toHaveAttribute("aria-selected", "true")
    expect(last).toHaveFocus()

    await user.keyboard("{Home}")
    expect(first).toHaveAttribute("aria-selected", "true")
  })
})

describe("the address (AC14)", () => {
  it("writes the whole state when the page opens, without a new entry in the history", async () => {
    const length = window.history.length
    renderAnalisi("/dashboard/analisi", fakeAnalisi(), { role: "ADMIN" })

    await screen.findByRole("tablist", { name: "Indicatori" })
    await waitFor(() =>
      expect(window.location.search).toBe(
        "?chart=financed&range=30d&compare=previous&group=auto"
      )
    )
    expect(window.history.length).toBe(length)
  })

  it("follows the tab chosen, replacing the entry", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi", fakeAnalisi(), { role: "ADMIN" })
    await screen.findByRole("tablist", { name: "Indicatori" })
    const length = window.history.length

    await user.click(screen.getByRole("tab", { name: /Contatti con esito/ }))

    await waitFor(() =>
      expect(window.location.search).toContain("chart=progress")
    )
    expect(window.history.length).toBe(length)
  })

  it("opens the first allowed chart when the operator asks for the branches", async () => {
    renderAnalisi("/dashboard/analisi?chart=branches", fakeAnalisi(), {
      role: "OPERATORE",
    })

    expect(
      await screen.findByRole("tabpanel", { name: "Finanziato totale" })
    ).toBeInTheDocument()
  })
})

describe("the panel (AC6, AC7, AC41)", () => {
  it("adds no landmark main of its own", async () => {
    renderAnalisi("/dashboard/analisi", fakeAnalisi(), { role: "ADMIN" })

    await screen.findByRole("tabpanel")
    expect(screen.queryAllByRole("main")).toHaveLength(0)
  })

  it("says whose numbers the operator sees", async () => {
    renderAnalisi("/dashboard/analisi?chart=financed", fakeAnalisi(), {
      role: "OPERATORE",
    })

    expect(
      await screen.findByText("Numeri dei clienti assegnati a te")
    ).toBeInTheDocument()
  })

  it("opens the tooltip of «Adesso» from a button", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi?chart=progress", fakeAnalisi(), {
      role: "ADMIN",
    })
    const panel = await screen.findByRole("tabpanel", {
      name: "Contatti con esito",
    })

    await user.click(within(panel).getByRole("button", { name: /Adesso/ }))

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      /non segue la finestra/
    )
  })
})

describe("a role changed with the page open (AC23)", () => {
  it("drops the admin-only tab without an error box, and shows the operator's calls", async () => {
    const backend = fakeAnalisi()
    // The page opened as ADMIN; the server already answers as OPERATORE, and
    // `GET /me` says so from its second read on, whenever that comes
    const { me } = renderAnalisi("/dashboard/analisi?chart=calls", backend, {
      role: "ADMIN",
      serverRole: "OPERATORE",
    })
    Object.defineProperty(me.state, "role", {
      get: () => (me.state.reads <= 1 ? "ADMIN" : "OPERATORE"),
    })

    await waitFor(() => expect(tabNames()).toHaveLength(5))
    expect(
      screen.queryByText(
        "Non è stato possibile caricare questo grafico. Gli altri sono aggiornati."
      )
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole("tabpanel", { name: "Risposte per operatore" })
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(backend.state.myCallsReads.length).toBeGreaterThan(0)
    )
    expect(
      await screen.findByText("Quante chiamate fai, e quante trovano risposta?")
    ).toBeInTheDocument()
  })
})

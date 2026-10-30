import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { fakeAnalisi } from "@/test/analisi"
import { renderAnalisi } from "./page"

const FAILED =
  "Non è stato possibile caricare questo grafico. Gli altri sono aggiornati."

describe("a chart that fails (AC20, AC21)", () => {
  it("keeps the error in its panel, and the other charts stay usable", async () => {
    const user = userEvent.setup()
    const backend = fakeAnalisi()
    backend.state.failing.add("branches")
    renderAnalisi("/dashboard/analisi?chart=branches", backend, {
      role: "ADMIN",
    })

    const panel = await screen.findByRole("tabpanel", {
      name: "Finanziato per sede",
    })
    expect(await within(panel).findByText(FAILED)).toBeInTheDocument()
    expect(screen.queryByText("errore della rotta")).not.toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: /Finanziato totale/ }))
    const financed = await screen.findByRole("tabpanel", {
      name: "Finanziato totale",
    })
    expect(within(financed).queryByText(FAILED)).not.toBeInTheDocument()
    await waitFor(() =>
      expect(financed.querySelector(".recharts-surface")).not.toBeNull()
    )
  })

  it("stays failed after «Riprova» fails again, with the focus on the title (AC20, AC42)", async () => {
    const user = userEvent.setup()
    const backend = fakeAnalisi()
    backend.state.failing.add("branches")
    renderAnalisi("/dashboard/analisi?chart=branches", backend, {
      role: "ADMIN",
    })
    const panel = await screen.findByRole("tabpanel", {
      name: "Finanziato per sede",
    })
    await within(panel).findByText(FAILED)
    const reads = backend.state.branchReads.length

    await user.click(within(panel).getByRole("button", { name: "Riprova" }))

    await waitFor(() =>
      expect(backend.state.branchReads.length).toBeGreaterThan(reads)
    )
    expect(await within(panel).findByText(FAILED)).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(panel).getByRole("heading", { name: "Finanziato per sede" })
      ).toHaveFocus()
    )
  })

  it("marks its tab «Errore» (AC2)", async () => {
    const backend = fakeAnalisi()
    backend.state.failing.add("branches")
    renderAnalisi("/dashboard/analisi?chart=financed", backend, {
      role: "ADMIN",
    })

    const tab = await screen.findByRole("tab", { name: /Finanziato per sede/ })
    await waitFor(() => expect(tab).toHaveTextContent("Errore"))
  })
})

describe("an empty chart (AC15, AC19, AC42)", () => {
  it("widens to 90 days keeping the comparison, and moves the focus to the title", async () => {
    const user = userEvent.setup()
    const backend = fakeAnalisi({ financed: { days: [], comparisonDays: [] } })
    renderAnalisi(
      "/dashboard/analisi?chart=financed&range=30d&compare=none",
      backend,
      { role: "ADMIN" }
    )
    const panel = await screen.findByRole("tabpanel", {
      name: "Finanziato totale",
    })
    expect(
      await within(panel).findByText("Nessuna pratica liquidata")
    ).toBeInTheDocument()

    await user.click(
      within(panel).getByRole("button", { name: "Allarga a 90 giorni" })
    )

    await waitFor(() =>
      expect(window.location.search).toBe(
        "?chart=financed&range=90d&compare=none&group=auto"
      )
    )
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("tabpanel", { name: "Finanziato totale" })
        ).getByRole("heading", { name: "Finanziato totale" })
      ).toHaveFocus()
    )
  })
})

describe("while the new window loads (AC19, AC26)", () => {
  it("shows the skeleton, never the numbers of the window before", async () => {
    const backend = fakeAnalisi()
    backend.state.failing.add("branches")
    renderAnalisi(
      "/dashboard/analisi?chart=financed&range=30d&compare=none",
      backend,
      { role: "ADMIN" }
    )
    const panel = await screen.findByRole("tabpanel", {
      name: "Finanziato totale",
    })
    await waitFor(() =>
      expect(panel.querySelector(".recharts-surface")).not.toBeNull()
    )

    const release = backend.hold("financed")
    // An empty state's action changes the window: here the widening of the
    // address, as a reload would
    await act(async () => {
      window.history.replaceState(
        null,
        "",
        "/dashboard/analisi?chart=financed&range=90d&compare=none&group=auto"
      )
      window.dispatchEvent(new PopStateEvent("popstate"))
    })

    await waitFor(() =>
      expect(panel.querySelector(".recharts-surface")).toBeNull()
    )
    expect(within(panel).getByTestId("chart-skeleton")).toBeInTheDocument()
    release()
    await waitFor(() =>
      expect(panel.querySelector(".recharts-surface")).not.toBeNull()
    )
  })
})

describe("offline (AC22)", () => {
  const setOnline = (online: boolean) => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => online,
    })
    window.dispatchEvent(new Event(online ? "online" : "offline"))
  }
  const goOffline = () => act(async () => setOnline(false))
  // Back online for the next test, query client included: offline, its
  // queries wait for the network
  afterEach(() => act(async () => setOnline(true)))

  it("says so instead of leaving a skeleton alone", async () => {
    const backend = fakeAnalisi()
    backend.hold("financed")
    renderAnalisi("/dashboard/analisi?chart=financed", backend, {
      role: "ADMIN",
    })
    await screen.findByRole("tabpanel", { name: "Finanziato totale" })

    await goOffline()

    expect(
      await screen.findByText(
        "Sei offline: i grafici si aggiornano quando torna la connessione."
      )
    ).toBeInTheDocument()
  })

  it("stops every pulse offline, and each has a reduced-motion path (AC8)", async () => {
    const backend = fakeAnalisi()
    backend.hold("financed")
    const { container } = renderAnalisi(
      "/dashboard/analisi?chart=financed",
      backend,
      { role: "ADMIN" }
    )
    await screen.findByRole("tabpanel", { name: "Finanziato totale" })
    const pulses = () =>
      Array.from(container.querySelectorAll('[data-slot="skeleton"]'))

    // The tab number and the panel's three bars
    await waitFor(() => expect(pulses().length).toBeGreaterThanOrEqual(4))
    for (const pulse of pulses()) {
      expect(pulse).toHaveClass("animate-pulse", "motion-reduce:animate-none")
    }

    await goOffline()

    for (const pulse of pulses()) {
      expect(pulse).not.toHaveClass("animate-pulse")
    }
  })
})

import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect, Layer } from "effect"
import { describe, expect, it, onTestFinished, vi } from "vitest"
import { Unauthorized } from "@mito/contract/errors"
import { Authenticated, CurrentUser } from "@mito/contract/middleware"
import { ChartPanel } from "../_components/ChartPanel"
import { PanelBoundary } from "../_components/PanelBoundary"
import { type ChartView } from "../_components/useAnalisi"
import { type ChartResult } from "../_lib/results"
import { ada } from "@/test/api"
import { fakeAnalisi } from "@/test/analisi"
import { renderAnalisi } from "./page"

const FAILED =
  "Non è stato possibile caricare questo grafico. Gli altri sono aggiornati."
const SESSION = "Sessione scaduta: accedi di nuovo"
const OFFLINE =
  "Sei offline: i grafici si aggiornano quando torna la connessione."

const setOnLine = (online: boolean) =>
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  })

describe("a chart that throws while drawing (D10, AC21)", () => {
  it("stays in its box with «Riprova», and draws again when it can", async () => {
    const user = userEvent.setup()
    let broken = true
    const Chart = () => {
      if (broken) throw new Error("recharts")
      return <p>grafico disegnato</p>
    }
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined)
    render(
      <PanelBoundary
        fallback={(reset) => <button onClick={reset}>Riprova</button>}
      >
        <Chart />
      </PanelBoundary>
    )
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument()

    broken = false
    await user.click(screen.getByRole("button", { name: "Riprova" }))

    expect(screen.getByText("grafico disegnato")).toBeInTheDocument()
    quiet.mockRestore()
  })

  it("shows the box of the chart in its panel, not the page's error", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined)
    // A ranking whose points are broken: the drawing throws
    const result = {
      id: "branches",
      title: "Finanziato per sede",
      question: "Quali sedi portano il finanziato, e quanto pesa ciascuna?",
      status: { kind: "ready" },
      kpi: { value: 3, format: "count", caption: "3 sedi", delta: null },
      points: [null],
      table: { columns: [], rows: [] },
      notes: [],
      scope: null,
    } as unknown as ChartResult<never>
    const view: ChartView = {
      id: "branches",
      title: "Finanziato per sede",
      inTime: false,
      question: result.question,
      scope: null,
      state: {
        kind: "result",
        window: { from: "2026-01-01", to: "2026-01-31" },
        comparison: null,
        shape: "branches",
        result,
      },
    }

    render(
      <ChartPanel
        view={view}
        panelId="p"
        page={{ compare: "none", group: "auto", dataOf: "tutta la rete" }}
        onRange={() => undefined}
      />
    )

    const panel = screen.getByRole("tabpanel", { name: "Finanziato per sede" })
    expect(within(panel).getByText(FAILED)).toBeInTheDocument()
    expect(
      within(panel).getByRole("button", { name: "Riprova" })
    ).toBeInTheDocument()
    quiet.mockRestore()
  })
})

describe("the legend and the notes of a ranking (AC2, AC19, D10)", () => {
  const MORE =
    "Il grafico mostra i primi 8 operatori su 12: la tabella e il file li elencano tutti."
  /** «Risposte per operatore» of the ADMIN, with `status` and `points` */
  const callsPanel = (status: unknown, points: unknown[]) => {
    const result = {
      id: "calls",
      title: "Risposte per operatore",
      question: "Quante chiamate fa ognuno, e quante trovano risposta?",
      status,
      kpi: { value: 3, format: "count", caption: "chiamate", delta: null },
      points,
      table: { columns: [], rows: [] },
      notes: [MORE],
      scope: null,
    } as unknown as ChartResult<never>
    const view: ChartView = {
      id: "calls",
      title: "Risposte per operatore",
      inTime: false,
      question: result.question,
      scope: null,
      state: {
        kind: "result",
        window: { from: "2026-01-01", to: "2026-01-31" },
        comparison: null,
        shape: "adminCalls",
        result,
      },
    }
    render(
      <ChartPanel
        view={view}
        panelId="p"
        page={{ compare: "none", group: "auto", dataOf: "tutta la rete" }}
        onRange={() => undefined}
      />
    )
    return screen.getByRole("tabpanel", { name: "Risposte per operatore" })
  }

  it("go with the chart when its drawing throws: the error box alone", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const panel = callsPanel({ kind: "ready" }, [null])

    expect(within(panel).getByText(FAILED)).toBeInTheDocument()
    expect(within(panel).queryByText("Con risposta")).not.toBeInTheDocument()
    expect(within(panel).queryByText(MORE)).not.toBeInTheDocument()
    quiet.mockRestore()
  })

  it("leave no legend on an empty chart", () => {
    const panel = callsPanel(
      {
        kind: "empty",
        title: "Nessuna chiamata registrata",
        reason: "Nessuna chiamata.",
        action: null,
      },
      []
    )

    expect(within(panel).getByText("Nessuna chiamata registrata")).toBeVisible()
    expect(within(panel).queryByText("Con risposta")).not.toBeInTheDocument()
  })
})

describe("an expired session (AC23, D10)", () => {
  /** Signed in for `GET /me`, `Unauthorized` on every endpoint of the analysis */
  const expiredOnAnalytics = Layer.succeed(Authenticated)(
    (endpoint, { group }) =>
      group.identifier === "analytics"
        ? Effect.fail(new Unauthorized())
        : Effect.provideService(endpoint, CurrentUser, {
            operator: ada,
            actor: { operatorId: ada.id, role: "ADMIN" },
          })
  )

  it("is no chart error: the panel says it, with no «Riprova», and one toast", async () => {
    renderAnalisi("/dashboard/analisi?chart=branches", fakeAnalisi(), {
      role: "ADMIN",
      auth: expiredOnAnalytics,
    })
    const panel = await screen.findByRole("tabpanel", {
      name: "Finanziato per sede",
    })
    expect(await within(panel).findByText(SESSION)).toBeInTheDocument()

    const tabs = within(
      screen.getByRole("tablist", { name: "Indicatori" })
    ).getAllByRole("tab")
    await waitFor(() =>
      tabs.forEach((tab) => expect(tab).toHaveTextContent("—"))
    )
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Riprova" })
    ).not.toBeInTheDocument()
    tabs.forEach((tab) => expect(tab).not.toHaveTextContent("Errore"))
    // The panel's line and the app's single toast
    expect(screen.getAllByText(SESSION)).toHaveLength(2)
  })
})

describe("a chart with only its number (AC15, AC19, AC42)", () => {
  const oneDay =
    "/dashboard/analisi?chart=financed&range=custom&from=2026-10-02&to=2026-10-02&compare=none"

  it("keeps the number, says why, and «Mostra 7 giorni» changes only the dates", async () => {
    const user = userEvent.setup()
    renderAnalisi(oneDay, fakeAnalisi(), { role: "ADMIN" })
    const panel = await screen.findByRole("tabpanel", {
      name: "Finanziato totale",
    })

    expect(await within(panel).findByText("Un solo intervallo")).toBeVisible()
    expect(within(panel).getByText(/pratic/)).toBeInTheDocument()
    expect(panel.querySelector(".recharts-surface")).toBeNull()
    expect(
      screen.getByRole("tab", { name: /Finanziato totale/ })
    ).toHaveTextContent("Solo numero")

    await user.click(
      within(panel).getByRole("button", { name: "Mostra 7 giorni" })
    )

    await waitFor(() =>
      expect(window.location.search).toBe(
        "?chart=financed&range=7d&compare=none&group=auto"
      )
    )
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Finanziato totale" })
      ).toHaveFocus()
    )
  })

  it("has no action for the branches: «Una sola sede»", async () => {
    renderAnalisi(
      "/dashboard/analisi?chart=branches",
      fakeAnalisi({
        branchRows: [{ branch: "Roma", practices: 3, amount: 12_000 }],
      }),
      { role: "ADMIN" }
    )
    const panel = await screen.findByRole("tabpanel", {
      name: "Finanziato per sede",
    })

    expect(await within(panel).findByText("Una sola sede")).toBeVisible()
    // No action of the state: the buttons of «Dati del grafico» stay (AC27)
    expect(
      within(panel).queryByRole("button", { name: /Allarga|Mostra/ })
    ).not.toBeInTheDocument()
  })
})

describe("an empty ranking (AC19)", () => {
  it("says so, offers to widen, and marks its tab «Vuoto»", async () => {
    renderAnalisi(
      "/dashboard/analisi?chart=branches&range=30d",
      fakeAnalisi({ branchRows: [] }),
      { role: "ADMIN" }
    )
    const panel = await screen.findByRole("tabpanel", {
      name: "Finanziato per sede",
    })

    expect(
      await within(panel).findByText("Nessuna pratica liquidata")
    ).toBeVisible()
    expect(
      within(panel).getByRole("button", { name: "Allarga a 90 giorni" })
    ).toBeVisible()
    expect(
      screen.getByRole("tab", { name: /Finanziato per sede/ })
    ).toHaveTextContent("Vuoto")
  })
})

describe("the loading tabs and panel (AC19, AC24)", () => {
  it("show a skeleton and no number, and the question is already there", async () => {
    const backend = fakeAnalisi()
    backend.hold("financed")
    renderAnalisi("/dashboard/analisi?chart=financed", backend, {
      role: "OPERATORE",
    })
    const panel = await screen.findByRole("tabpanel", {
      name: "Finanziato totale",
    })

    expect(within(panel).getByTestId("chart-skeleton")).toBeInTheDocument()
    expect(
      within(panel).getByText(
        "Quanto è stato liquidato nella finestra, e com'è andata rispetto al confronto?"
      )
    ).toBeInTheDocument()
    expect(
      within(panel).getByText("Numeri dei clienti assegnati a te")
    ).toBeVisible()
    const tab = screen.getByRole("tab", { name: /Finanziato totale/ })
    expect(tab).not.toHaveTextContent("€")
    expect(tab.querySelector("[data-slot=skeleton]")).not.toBeNull()
    expect(tab).not.toHaveTextContent("0")
  })

  it("reserve the question of the operator's own call charts", async () => {
    const backend = fakeAnalisi()
    backend.hold("myCalls")
    renderAnalisi("/dashboard/analisi?chart=calls", backend, {
      role: "OPERATORE",
    })

    expect(
      await screen.findByText("Quante chiamate fai, e quante trovano risposta?")
    ).toBeInTheDocument()
  })
})

describe("offline, then online (AC22)", () => {
  it("says so once, near the header, and stops saying it when the connection returns", async () => {
    const backend = fakeAnalisi()
    backend.hold("financed")
    renderAnalisi("/dashboard/analisi?chart=financed", backend, {
      role: "ADMIN",
    })
    const panel = await screen.findByRole("tabpanel", {
      name: "Finanziato totale",
    })
    expect(screen.queryByText(OFFLINE)).not.toBeInTheDocument()
    onTestFinished(() => {
      setOnLine(true)
    })

    await act(async () => {
      setOnLine(false)
      window.dispatchEvent(new Event("offline"))
    })

    expect(screen.getAllByText(OFFLINE)).toHaveLength(1)
    expect(screen.getByRole("status")).toHaveTextContent(OFFLINE)
    // The skeleton that waits points at that message
    expect(within(panel).getByTestId("chart-skeleton")).toHaveAttribute(
      "aria-describedby",
      screen.getByText(OFFLINE).id
    )

    await act(async () => {
      setOnLine(true)
      window.dispatchEvent(new Event("online"))
    })

    expect(screen.queryByText(OFFLINE)).not.toBeInTheDocument()
  })
})

describe("the note of a missing variation (AC12, AC19)", () => {
  it("is with the notes under the chart, inside its box, so nothing moves when it arrives", async () => {
    const backend = fakeAnalisi({ comparisonTotal: 0 })
    renderAnalisi("/dashboard/analisi?chart=branches", backend, {
      role: "ADMIN",
    })
    const panel = await screen.findByRole("tabpanel", {
      name: "Finanziato per sede",
    })
    const note = await within(panel).findByText(
      "Il confronto è a zero: la variazione non si calcola"
    )
    const area = panel.querySelector('[data-slot="chart-area"]')!
    // Inside the box as tall as the skeleton: arriving, it moves nothing below
    expect(area).toHaveClass("h-80")
    expect(area.contains(note)).toBe(true)
    expect(note.closest("ul")).not.toBeNull()
  })
})

describe("a ranking with more than 8 operators (AC3, AC19)", () => {
  it("is as tall as its skeleton with legend and notes, and leaves the others to the table", async () => {
    const callRows = Array.from({ length: 12 }, (_, i) => ({
      operatorId: i + 1,
      name: `Op${String(i + 1).padStart(2, "0")}`,
      surname: "Rossi",
      calls: 100 - i,
      answered: 60,
      noAnswer: 40 - i,
      appointments: 30 - i,
    }))
    const backend = fakeAnalisi({ callRows })
    const release = backend.hold("calls")
    renderAnalisi("/dashboard/analisi?chart=calls", backend, { role: "ADMIN" })
    const panel = await screen.findByRole("tabpanel", {
      name: "Risposte per operatore",
    })
    const skeleton = within(panel).getByTestId("chart-skeleton")
    expect(skeleton.querySelector(".h-80")).not.toBeNull()

    release()

    const note = await within(panel).findByText(
      "Il grafico mostra i primi 8 operatori su 12: la tabella e il file li elencano tutti."
    )
    const area = panel.querySelector('[data-slot="chart-area"]')!
    expect(area).toHaveClass("h-80")
    // The ranking fills the area, with no height of its own by the rows
    const chart = area.querySelector(
      ".recharts-responsive-container"
    )!.parentElement!
    expect(chart).toHaveClass("h-full")
    expect(chart.style.height).toBe("")
    expect(area.contains(note)).toBe(true)
    // A column as tall as the skeleton: legend on top and notes at the
    // bottom keep their height, the chart takes what is left (AC19)
    expect(area).toHaveClass("flex", "flex-col")
    const [legend, body, notes] = Array.from(area.children)
    expect(legend).toHaveClass("shrink-0", "empty:hidden")
    expect(legend).not.toHaveClass("hidden")
    // Only there: in the number row it would wrap and move the page
    expect(
      within(area.previousElementSibling as HTMLElement).queryByText(
        "Con risposta"
      )
    ).not.toBeInTheDocument()
    expect(
      within(legend as HTMLElement).getByText("Con risposta")
    ).toBeVisible()
    expect(body).toHaveClass("min-h-0", "flex-1")
    expect(body?.contains(chart)).toBe(true)
    expect(notes).toHaveClass("shrink-0")
    expect(notes?.contains(note)).toBe(true)
    expect(
      within(panel).getByRole("cell", { name: "Op12 Rossi" })
    ).toBeVisible()
  })
})

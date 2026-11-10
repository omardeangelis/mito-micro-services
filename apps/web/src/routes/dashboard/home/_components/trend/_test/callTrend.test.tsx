import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { type CallTrend } from "@mito/contract/home"
import { callTrend, fakeAdminHome } from "@/test/adminHome"
import { Component as HomePage } from "../../../HomePage"
import { renderHome } from "../../../_test/page"

// «Andamento delle chiamate» on the admin's home (spec andamenti-chiamate,
// AC1–AC8, AC10–AC12, D7, D8)

// jsdom measures nothing, and the observer of test/setup.ts never calls back:
// this one gives every chart a size as soon as it observes it, as in Analisi
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [
            {
              target,
              contentRect: { width: 600, height: 192 },
            } as unknown as ResizeObserverEntry,
          ],
          this
        )
      }
      unobserve = () => undefined
      disconnect = () => undefined
    }
  )
})

afterAll(() => {
  vi.unstubAllGlobals()
})

const TITLE = "Andamento delle chiamate"
const LOADING = "Caricamento dell'andamento delle chiamate"
const ERROR = "Non è stato possibile caricare l'andamento delle chiamate."
/** The rate of the fake's 7 days above «Tasso di risposta» */
const RATE_7D = "66,7% · 6 risposte su 9 chiamate"

const section = () => screen.findByRole("region", { name: TITLE })

const period = (name: string) =>
  within(screen.getByRole("radiogroup", { name: "Periodo" })).getByRole(
    "radio",
    { name }
  )

const analisiLinks = (root: HTMLElement) =>
  within(root)
    .getAllByRole("link", { name: "Dettaglio in Analisi" })
    .map((link) => link.getAttribute("href"))

/** The surfaces of the two charts, once drawn */
const charts = async () => {
  await waitFor(() =>
    expect(screen.getAllByRole("application")).toHaveLength(2)
  )
  return screen.getAllByRole("application")
}

/** A trend with no call, for every period */
const noCalls = (p: CallTrend["period"], now: Date): CallTrend => {
  const trend = callTrend(p, now)
  return {
    ...trend,
    days: trend.days.map((row) => ({
      ...row,
      calls: 0,
      answered: 0,
      noAnswer: 0,
      appointments: 0,
    })),
    hours:
      trend.hours?.map((hour) => ({
        ...hour,
        calls: 0,
        answered: 0,
        noAnswer: 0,
        appointments: 0,
      })) ?? null,
  }
}

describe("«Andamento delle chiamate», la sezione (AC1, AC2, AC3)", () => {
  it("prende il posto di «Chiamate per operatore», dopo «Dettaglio giornaliero»", async () => {
    renderHome("/dashboard", fakeAdminHome(), { role: "ADMIN" })

    const trend = await section()

    expect(
      screen
        .getByRole("region", { name: "Dettaglio giornaliero" })
        .compareDocumentPosition(trend) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(screen.queryByText("Chiamate per operatore")).toBeNull()
  })

  it("un operatore non la vede e non la legge", async () => {
    const backend = fakeAdminHome({ role: "OPERATORE" })
    renderHome("/dashboard", backend, { role: "OPERATORE" })

    expect(await screen.findByText("Il mio oggi")).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: TITLE })).toBeNull()
    expect(backend.state.callTrendReads).toEqual([])
  })

  it("i quattro periodi in ordine; si riapre su «7 giorni» dopo «30 giorni»", async () => {
    const backend = fakeAdminHome()
    // The home comes and goes on the same cache, as with a navigation
    function Toggle() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(!open)}>
            {open ? "Chiudi" : "Apri"}
          </button>
          {open ? <HomePage /> : null}
        </>
      )
    }
    renderHome("/dashboard", backend, { role: "ADMIN", page: <Toggle /> })
    const user = userEvent.setup()
    await section()

    expect(
      within(screen.getByRole("radiogroup", { name: "Periodo" }))
        .getAllByRole("radio")
        .map((item) => item.textContent)
    ).toEqual(["Oggi", "7 giorni", "30 giorni", "90 giorni"])
    expect(period("7 giorni")).toBeChecked()

    await user.click(period("30 giorni"))
    expect(period("30 giorni")).toBeChecked()
    // A click on the chosen one doesn't empty the choice
    await user.click(period("30 giorni"))
    expect(period("30 giorni")).toBeChecked()

    await user.click(screen.getByRole("button", { name: "Chiudi" }))
    expect(screen.queryByRole("region", { name: TITLE })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Apri" }))

    await section()
    expect(period("7 giorni")).toBeChecked()
    await waitFor(() =>
      expect(backend.state.callTrendReads).toEqual(["7d", "30d", "7d"])
    )
  })
})

describe("«Andamento delle chiamate», i grafici (AC4–AC8, D7)", () => {
  it("con «Oggi» scrive le ore che copre", async () => {
    renderHome("/dashboard", fakeAdminHome(), { role: "ADMIN" })
    await section()
    expect(screen.queryByText(/^Oggi, /)).toBeNull()

    await userEvent.setup().click(period("Oggi"))

    expect(await screen.findByText("Oggi, 08:00–15:20")).toBeInTheDocument()
  })

  it("i due grafici in ordine, col tasso del periodo sopra", async () => {
    renderHome("/dashboard", fakeAdminHome(), { role: "ADMIN" })
    const trend = await section()

    expect(await within(trend).findByText(RATE_7D)).toBeInTheDocument()
    expect(
      within(trend)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent)
    ).toEqual(["Tasso di risposta", "Tasso di appuntamento"])
    expect(
      within(trend).getByText("33,3% · 2 appuntamenti su 6 risposte")
    ).toBeInTheDocument()
  })

  it("ogni grafico ha un nome; col fuoco e le frecce il tooltip dice l'intervallo, anche un vuoto", async () => {
    renderHome("/dashboard", fakeAdminHome(), { role: "ADMIN" })
    const [answer, appointment] = await charts()
    expect(answer).toHaveAccessibleName("Tasso di risposta, 7 giorni")
    expect(appointment).toHaveAccessibleName("Tasso di appuntamento, 7 giorni")
    const user = userEvent.setup()

    while (document.activeElement !== answer) await user.tab()

    expect(
      await screen.findByText("Mer 4 nov · 75% · 3 risposte su 4 chiamate")
    ).toBeInTheDocument()
    await user.keyboard("{ArrowRight}")
    expect(
      await screen.findByText("Gio 5 nov · nessuna chiamata")
    ).toBeInTheDocument()
  })

  it("un giorno senza chiamate è un vuoto: 2 barre su 7 giorni", async () => {
    renderHome("/dashboard", fakeAdminHome(), { role: "ADMIN" })
    const surfaces = await charts()

    for (const surface of surfaces) {
      await waitFor(() =>
        expect(
          surface.querySelectorAll(".recharts-bar-rectangle")
        ).toHaveLength(2)
      )
    }
  })
})

describe("«Andamento delle chiamate», i collegamenti (AC10, AC11)", () => {
  it.each([
    ["Oggi", "today", "hour"],
    ["7 giorni", "7d", "day"],
    ["30 giorni", "30d", "week"],
    ["90 giorni", "90d", "week"],
  ] as const)(
    "%s apre Analisi sullo stesso periodo e sugli stessi intervalli",
    async (name, range, group) => {
      renderHome("/dashboard", fakeAdminHome(), { role: "ADMIN" })
      const trend = await section()
      await userEvent.setup().click(period(name))

      await waitFor(() =>
        expect(analisiLinks(trend)).toEqual([
          `/dashboard/analisi?range=${range}&group=${group}&chart=calls`,
          `/dashboard/analisi?range=${range}&group=${group}&chart=appointments`,
        ])
      )
    }
  )

  it("senza chiamate dice «Nessuna chiamata nel periodo», e i collegamenti restano", async () => {
    renderHome("/dashboard", fakeAdminHome({ trend: noCalls }), {
      role: "ADMIN",
    })
    const trend = await section()

    expect(
      await within(trend).findByText("Nessuna chiamata nel periodo")
    ).toBeInTheDocument()
    expect(within(trend).queryAllByRole("application")).toHaveLength(0)
    expect(analisiLinks(trend)).toEqual([
      "/dashboard/analisi?range=7d&group=day&chart=calls",
      "/dashboard/analisi?range=7d&group=day&chart=appointments",
    ])
  })

  it("con «Oggi» prima delle 08 dice quando inizia la giornata, con «Vedi ieri»", async () => {
    renderHome(
      "/dashboard",
      fakeAdminHome({ now: new Date("2026-11-10T07:15:00+01:00") }),
      { role: "ADMIN" }
    )
    const trend = await section()
    await userEvent.setup().click(period("Oggi"))

    expect(
      await within(trend).findByText("La giornata di lavoro inizia alle 8")
    ).toBeInTheDocument()
    expect(
      within(trend).getByRole("link", { name: "Vedi ieri" })
    ).toHaveAttribute(
      "href",
      "/dashboard/analisi?range=today&group=hour&compare=previous&chart=calls"
    )
    expect(within(trend).queryByText(/^Oggi, /)).toBeNull()
    expect(analisiLinks(trend)).toEqual([
      "/dashboard/analisi?range=today&group=hour&chart=calls",
      "/dashboard/analisi?range=today&group=hour&chart=appointments",
    ])
  })
})

describe("«Andamento delle chiamate», carica e fallisce da sola (AC12, D8)", () => {
  it("mentre carica, uno scheletro alto quanto i grafici", async () => {
    const backend = fakeAdminHome()
    const release = backend.hold("getCallTrend")
    renderHome("/dashboard", backend, { role: "ADMIN" })
    const trend = await section()

    const status = await within(trend).findByRole("status")
    expect(status).toHaveTextContent(LOADING)
    const skeletonHeight = status.querySelector<HTMLElement>(
      "[data-slot=skeleton]"
    )?.style.height

    act(() => release())
    const heading = await within(trend).findByRole("heading", {
      name: "Tasso di risposta",
    })
    expect(skeletonHeight).toBeDefined()
    // The panel is at least that tall: as tall with each row on one line
    expect(heading.parentElement!.parentElement!.style.minHeight).toBe(
      skeletonHeight
    )
  })

  it("un cambio di periodo mostra lo scheletro, non i numeri di prima", async () => {
    const backend = fakeAdminHome()
    renderHome("/dashboard", backend, { role: "ADMIN" })
    const trend = await section()
    await within(trend).findByText(RATE_7D)

    backend.hold("getCallTrend")
    await userEvent.setup().click(period("30 giorni"))

    expect(await within(trend).findByText(LOADING)).toBeInTheDocument()
    expect(within(trend).queryByText(RATE_7D)).toBeNull()
  })

  it("in errore, «Riprova» rilegge solo questa sezione", async () => {
    const backend = fakeAdminHome()
    backend.failWith("getCallTrend")
    renderHome("/dashboard", backend, { role: "ADMIN" })
    const trend = await section()
    const message = await within(trend).findByText(ERROR)
    await waitFor(() => expect(screen.queryAllByRole("status")).toHaveLength(0))
    const reads = { ...backend.state.reads }
    const trendReads = backend.state.callTrendReads.length

    backend.clearFailure("getCallTrend")
    await userEvent
      .setup()
      .click(
        within(message.closest<HTMLElement>("[role=alert]")!).getByRole(
          "button",
          { name: "Riprova" }
        )
      )

    expect(await within(trend).findByText(RATE_7D)).toBeInTheDocument()
    expect(backend.state.reads).toEqual({
      ...reads,
      getCallTrend: reads.getCallTrend + 1,
    })
    expect(backend.state.callTrendReads).toHaveLength(trendReads + 1)
  })
})

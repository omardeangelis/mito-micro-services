import { render, screen } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import {
  BadgeDelta,
  BarChart,
  chartColor,
  DeltaBar,
  DonutChart,
  ProgressCircle,
} from ".."

// jsdom measures nothing, and the observer of test/setup.ts never calls back:
// this one gives the chart a size as soon as it observes it
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
              contentRect: { width: 320, height: 200 },
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

describe("chartColor", () => {
  it("dà l'hex di Tremor, e il 500 per un nome senza tonalità", () => {
    expect(chartColor("blue-500")).toBe("#3b82f6")
    expect(chartColor("emerald")).toBe("#10b981")
    expect(chartColor("pink-300")).toBe("#6b7280")
  })
})

describe("ProgressCircle", () => {
  it("riempie il cerchio per la percentuale, con le misure di Tremor", () => {
    render(<ProgressCircle value={75} size="xl" color="green" />)

    const progress = screen.getByTestId("progress")
    // xl: raggio 80, tratto 10, quindi r = 75
    const circumference = 2 * Math.PI * 75
    expect(progress).toHaveAttribute("r", "75")
    expect(Number(progress.getAttribute("stroke-dashoffset"))).toBeCloseTo(
      circumference * 0.25
    )
    expect(progress).toHaveAttribute("stroke", "#22c55e")
  })

  it("oltre 100 resta pieno", () => {
    render(<ProgressCircle value={140} />)

    expect(
      Number(screen.getByTestId("progress").getAttribute("stroke-dashoffset"))
    ).toBe(0)
  })
})

describe("DeltaBar", () => {
  it("un valore positivo va a destra, in verde", () => {
    render(<DeltaBar value={30} />)

    expect(screen.getByTestId("delta-positive")).toHaveStyle({ width: "30%" })
    expect(screen.queryByTestId("delta-negative")).toBeNull()
  })

  it("un valore negativo va a sinistra, in rosso, fino a -100", () => {
    render(<DeltaBar value={-140} />)

    expect(screen.getByTestId("delta-negative")).toHaveStyle({
      width: "100%",
    })
    expect(screen.queryByTestId("delta-positive")).toBeNull()
  })
})

describe("BadgeDelta", () => {
  it("mostra la freccia del tipo e il testo", () => {
    const { container } = render(
      <BadgeDelta deltaType="decrease">-12%</BadgeDelta>
    )

    expect(screen.getByText("-12%")).toBeInTheDocument()
    expect(container.querySelector("[data-delta]")).toHaveAttribute(
      "data-delta",
      "decrease"
    )
  })
})

describe("DonutChart", () => {
  it("senza dati mostra il testo", () => {
    render(
      <DonutChart
        data={[]}
        category="total"
        index="name"
        colors={[]}
        noDataText="Nessun importo nel periodo"
      />
    )

    expect(screen.getByText("Nessun importo nel periodo")).toBeInTheDocument()
  })

  it("disegna una fetta per riga, con i suoi colori", () => {
    const { container } = render(
      <DonutChart
        data={[
          { name: "Bari", total: 600 },
          { name: "Lecce", total: 400 },
        ]}
        category="total"
        index="name"
        colors={["blue-500", "amber-600"]}
      />
    )

    const fills = [
      ...container.querySelectorAll(".recharts-pie-sector path"),
    ].map((path) => path.getAttribute("fill"))
    expect(fills).toEqual(["#3b82f6", "#d97706"])
  })
})

describe("BarChart", () => {
  it("mostra la legenda delle serie, nei loro colori", () => {
    render(
      <BarChart
        data={[{ Operatore: "Rossi", Risposte: 3, "Non risposte": 1 }]}
        index="Operatore"
        categories={["Risposte", "Non risposte"]}
        colors={["emerald", "rose"]}
        stack
      />
    )

    expect(screen.getByText("Risposte")).toBeInTheDocument()
    expect(screen.getByText("Non risposte")).toBeInTheDocument()
  })

  it("senza dati mostra il testo", () => {
    render(
      <BarChart
        data={[]}
        index="Operatore"
        categories={["Risposte"]}
        colors={["emerald"]}
        noDataText="Nessuna chiamata"
      />
    )

    expect(screen.getByText("Nessuna chiamata")).toBeInTheDocument()
  })
})

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

// The color of a mark: a property of its style or a fill-/stroke- class, never
// an SVG attribute with var() (D11 of design-system-web)
const paint = (el: Element, prop: "fill" | "stroke") => {
  expect(el.getAttribute(prop) ?? "").not.toContain("var(")
  const style = new RegExp(`(^|;)\\s*${prop}:\\s*([^;]+)`).exec(
    el.getAttribute("style") ?? ""
  )?.[2]
  if (style !== undefined) return style.trim()
  const token = (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .find((c) => c.startsWith(`${prop}-`))
  return token === undefined
    ? el.getAttribute(prop)
    : `var(--color-${token.slice(prop.length + 1)})`
}

describe("chartColor", () => {
  it("dà il token del punto del tono, e quello neutral per un nome sconosciuto", () => {
    expect(chartColor("blue")).toBe("var(--color-tag-blue-dot)")
    expect(chartColor("chart-1")).toBe("var(--color-chart-1)")
    expect(chartColor("pink-300")).toBe("var(--color-tag-neutral-dot)")
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
    expect(paint(progress, "stroke")).toBe("var(--color-tag-green-dot)")
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
        colors={["blue", "amber"]}
      />
    )

    const fills = [
      ...container.querySelectorAll(".recharts-pie-sector path"),
    ].map((path) => paint(path, "fill"))
    expect(fills).toEqual([
      "var(--color-tag-blue-dot)",
      "var(--color-tag-amber-dot)",
    ])
  })
})

describe("BarChart", () => {
  it("mostra la legenda delle serie, nei loro colori", () => {
    render(
      <BarChart
        data={[{ Operatore: "Rossi", Risposte: 3, "Non risposte": 1 }]}
        index="Operatore"
        categories={["Risposte", "Non risposte"]}
        colors={["green", "orange"]}
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
        colors={["green"]}
        noDataText="Nessuna chiamata"
      />
    )

    expect(screen.getByText("Nessuna chiamata")).toBeInTheDocument()
  })
})

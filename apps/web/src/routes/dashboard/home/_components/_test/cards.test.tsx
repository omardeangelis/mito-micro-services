import { render, screen, within } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { formatBigNumber } from "@mito/client/format"
import { CircleCard } from "../CircleCard"
import { DonutCard } from "../DonutCard"
import { FinanceCard } from "../FinanceCard"

// The cards of "Analisi Andamento" on the charts of the app, read from what
// they draw, as the tests of `CircleCard`, `FinanceCard` and `DonutCard` of
// the Next.js app read the props of the charts of Tremor

// jsdom measures nothing: this observer gives the donut a size as soon as it
// observes it, so recharts draws it
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
              contentRect: { width: 128, height: 128 },
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

/** The token of the dot of a tone (appendix B of design-system-web) */
const dot = (tone: string) => `var(--color-tag-${tone}-dot)`

// The color of a mark: a property of its style or a fill-/stroke-/bg- class,
// never an SVG attribute with var() (D11 of design-system-web)
const paint = (el: Element, prop: "fill" | "stroke" | "background-color") => {
  if (prop !== "background-color")
    expect(el.getAttribute(prop) ?? "").not.toContain("var(")
  const style = new RegExp(`(^|;)\\s*${prop}:\\s*([^;]+)`).exec(
    el.getAttribute("style") ?? ""
  )?.[2]
  if (style !== undefined) return style.trim()
  const prefix = prop === "background-color" ? "bg" : prop
  const token = (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .find((c) => c.startsWith(`${prefix}-`))
  return token === undefined
    ? el.getAttribute(prop)
    : `var(--color-${token.slice(prefix.length + 1)})`
}

describe("CircleCard: il colore segue la percentuale mostrata (AC22)", () => {
  const renderCard = (done: number, todo: number) => {
    const { container } = render(<CircleCard done={done} todo={todo} />)
    return {
      stroke: paint(screen.getByTestId("progress"), "stroke"),
      shown: container.querySelector(".text-xs")?.textContent,
    }
  }

  it.each([
    { done: 0, todo: 0, shown: "0%", color: "red" },
    { done: 25, todo: 75, shown: "25%", color: "red" },
    { done: 26, todo: 74, shown: "26%", color: "amber" },
    { done: 50, todo: 50, shown: "50%", color: "amber" },
    { done: 51, todo: 49, shown: "51%", color: "blue" },
    { done: 76, todo: 24, shown: "76%", color: "green" },
    // 75,4% si mostra 75%: blu, non verde
    { done: 754, todo: 246, shown: "75%", color: "blue" },
    // 75,6% si mostra 76%: verde
    { done: 756, todo: 244, shown: "76%", color: "green" },
  ] as const)(
    "con $done completati e $todo da fare mostra $shown ed è $color",
    ({ done, todo, shown, color }) => {
      expect(renderCard(done, todo)).toEqual({ stroke: dot(color), shown })
    }
  )

  it("accanto all'anello mostra la stessa percentuale arrotondata", () => {
    render(<CircleCard done={756} todo={244} />)

    expect(screen.getByText("756/1000 (76%)")).toBeTruthy()
  })
})

const windows = {
  comparison: {
    start: new Date("2026-01-10T12:00:00Z"),
    end: new Date("2026-02-10T12:00:00Z"),
  },
  reference: {
    start: new Date("2026-02-10T12:00:00Z"),
    end: new Date("2026-03-12T12:00:00Z"),
  },
}

/** The badge, its arrow and the bar of a `FinanceCard` */
const renderFinance = (reference: number, comparison: number) => {
  const { container } = render(
    <FinanceCard
      title="Finanziato totale"
      referencePeriod={{ total: reference }}
      comparisonPeriod={{ total: comparison }}
      windows={windows}
    />
  )
  const arrow = container.querySelector("[data-delta]")!
  const positive = screen.queryByTestId("delta-positive")
  const negative = screen.queryByTestId("delta-negative")
  return {
    badge: arrow.parentElement!.textContent,
    deltaType: arrow.getAttribute("data-delta"),
    bar: positive ? positive.style.width : `-${negative!.style.width}`,
  }
}

describe("FinanceCard: la variazione", () => {
  it("con un confronto a 0 il badge mostra `—`, `unchanged`, e il perché ai lettori di schermo (AC21)", () => {
    expect(renderFinance(150_000, 0)).toEqual({
      badge: "—",
      deltaType: "unchanged",
      bar: "0%",
    })
    expect(screen.getByText("—").getAttribute("aria-hidden")).toBe("true")
    expect(
      screen.getByText("Variazione non calcolabile: periodo di confronto a 0")
    ).toHaveClass("sr-only")
  })

  it("con riferimento e confronto a 0 il badge mostra `0%`", () => {
    expect(renderFinance(0, 0)).toEqual({
      badge: "0%",
      deltaType: "unchanged",
      bar: "0%",
    })
  })

  it("da 100 a 150 mostra `50%` in aumento", () => {
    expect(renderFinance(150, 100)).toEqual({
      badge: "50%",
      deltaType: "increase",
      bar: "50%",
    })
  })

  it("da 100 a 50 mostra `-50%` in calo", () => {
    expect(renderFinance(50, 100)).toEqual({
      badge: "-50%",
      deltaType: "decrease",
      bar: "-50%",
    })
  })

  it("oltre il 999% il badge mostra `> 999%` e la barra si ferma a 100", () => {
    expect(renderFinance(160_464, 1)).toEqual({
      badge: "> 999%",
      deltaType: "increase",
      bar: "100%",
    })
  })

  it.each([
    [100.4, 100],
    [99.6, 100],
  ])(
    "da %s a %s, che arrotondato è 0, mostra `0%` unchanged",
    (reference, comparison) => {
      const { badge, deltaType } = renderFinance(reference, comparison)
      expect({ badge, deltaType }).toEqual({
        badge: "0%",
        deltaType: "unchanged",
      })
    }
  )
})

describe("FinanceCard: le date delle finestre in ora di Roma (AC10)", () => {
  // The process runs in UTC: the instants between midnight UTC and midnight
  // in Rome tell the two time zones apart, in winter and in summer
  const datesOf = (shown: typeof windows) => {
    render(
      <FinanceCard
        title="Finanziato totale"
        referencePeriod={{ total: 150_000 }}
        comparisonPeriod={{ total: 100_000 }}
        windows={shown}
      />
    )
    return screen
      .getAllByText(/^\d{1,2}\/\d{2}\/\d{4}$/)
      .map((date) => date.textContent)
  }

  it("d'inverno alle 23:30 UTC è già il giorno dopo", () => {
    expect(
      datesOf({
        comparison: {
          start: new Date("2025-11-15T23:30:00Z"),
          end: new Date("2025-12-15T23:30:00Z"),
        },
        reference: {
          start: new Date("2025-12-15T23:30:00Z"),
          end: new Date("2026-01-14T23:30:00Z"),
        },
      })
    ).toEqual(["16/11/2025", "16/12/2025", "15/01/2026"])
  })

  it("d'inverno alle 22:30 UTC è ancora lo stesso giorno", () => {
    expect(
      datesOf({
        comparison: {
          start: new Date("2025-11-15T22:30:00Z"),
          end: new Date("2025-12-15T22:30:00Z"),
        },
        reference: {
          start: new Date("2025-12-15T22:30:00Z"),
          end: new Date("2026-01-14T22:30:00Z"),
        },
      })
    ).toEqual(["15/11/2025", "15/12/2025", "14/01/2026"])
  })

  it("d'estate alle 22:30 UTC è già il giorno dopo", () => {
    expect(
      datesOf({
        comparison: {
          start: new Date("2026-05-15T22:30:00Z"),
          end: new Date("2026-06-14T22:30:00Z"),
        },
        reference: {
          start: new Date("2026-06-14T22:30:00Z"),
          end: new Date("2026-07-14T22:30:00Z"),
        },
      })
    ).toEqual(["16/05/2026", "15/06/2026", "15/07/2026"])
  })
})

// Come le manda il server: in ordine di sede, con la sede `null`
const sedi = [
  { data: "Ancona", total: 100_000 },
  { data: "Bari", total: 600_000 },
  { data: "Como", total: 50_000 },
  { data: null, total: 300_000 },
  { data: "Lecce", total: 500_000 },
  { data: "Pisa", total: 25_000 },
  { data: "Roma", total: 400_000 },
]

describe("DonutCard: le fette", () => {
  const legend = () =>
    within(screen.getByRole("list"))
      .getAllByRole("listitem")
      .map((item) => item.textContent)

  it("con 7 sedi mostra le 5 con gli importi più alti e `Altre` con la somma delle altre due", () => {
    render(<DonutCard data={sedi} />)

    // Il formato compatto cambia con il CLDR di Node: il test controlla
    // l'ordine e le somme, non il formato
    const rows: [string, number][] = [
      ["Bari", 600_000],
      ["Lecce", 500_000],
      ["Roma", 400_000],
      ["Nessuna", 300_000],
      ["Ancona", 100_000],
      ["Altre", 75_000],
    ]
    expect(legend()).toEqual(
      rows.map(([name, total]) => `${name}€ ${formatBigNumber(total)}`)
    )
  })

  it("con 6 sedi le mostra tutte, per importo", () => {
    const { container } = render(
      <DonutCard data={sedi.filter((s) => s.data !== "Pisa")} />
    )
    expect(
      [...container.querySelectorAll(".recharts-pie-sector path")].map((path) =>
        paint(path, "fill")
      )
    ).toEqual(["blue", "orange", "indigo", "teal", "magenta", "amber"].map(dot))

    expect(legend().map((row) => row?.split("€")[0])).toEqual([
      "Bari",
      "Lecce",
      "Roma",
      "Nessuna",
      "Ancona",
      "Como",
    ])
  })

  it("ogni fetta ha un colore suo, lo stesso del suo pallino nella legenda", () => {
    const { container } = render(<DonutCard data={sedi} />)

    const slices = [
      ...container.querySelectorAll(".recharts-pie-sector path"),
    ].map((path) => paint(path, "fill"))
    const dots = within(screen.getByRole("list"))
      .getAllByRole("listitem")
      .map((item) => paint(item.querySelector("span")!, "background-color"))
    // The named slices in the order of appendix B, then `Altre`
    expect(slices).toEqual(
      ["blue", "orange", "indigo", "teal", "magenta", "neutral"].map(dot)
    )
    expect(dots).toEqual(slices)
  })

  it("senza importi dice `Nessun importo nel periodo` e non c'è legenda", () => {
    render(<DonutCard data={[]} />)

    expect(screen.getByText("Nessun importo nel periodo")).toBeTruthy()
    expect(screen.queryByRole("list")).toBeNull()
  })

  it("la ciambella non dà tab stop", async () => {
    const { container } = render(<DonutCard data={sedi} />)

    // recharts draws the donut after it measured its container
    await vi.waitFor(() =>
      expect(container.querySelector(".recharts-pie-sector")).not.toBeNull()
    )
    expect(container.querySelector('[tabindex="0"]')).toBeNull()
  })
})

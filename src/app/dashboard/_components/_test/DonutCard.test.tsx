import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { formatBigNumber } from "@mito/client/format"
import { DonutCard } from "../DonutCard"

// Recharts ha bisogno di un contenitore misurato, che jsdom non ha: la
// ciambella finta espone le fette, i colori e il testo senza dati che riceve
vi.mock("@tremor/react", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  DonutChart: (props: {
    data: Record<string, unknown>[]
    index: string
    colors: string[]
    noDataText?: string
  }) => (
    <div
      data-testid="donut"
      data-names={JSON.stringify(props.data.map((d) => d[props.index]))}
      data-colors={JSON.stringify(props.colors.slice(0, props.data.length))}
      data-no-data={props.noDataText}
    />
  ),
}))

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

const donut = () => {
  const { names, colors, noData } = screen.getByTestId("donut").dataset
  return {
    names: JSON.parse(names ?? "[]") as string[],
    colors: JSON.parse(colors ?? "[]") as string[],
    noData,
  }
}

const legend = () =>
  within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((item) => item.textContent)

describe("DonutCard: le fette", () => {
  it("con 7 sedi mostra le 5 con gli importi più alti e `Altre` con la somma delle altre due", () => {
    render(<DonutCard data={sedi} />)

    const names = ["Bari", "Lecce", "Roma", "Nessuna", "Ancona", "Altre"]
    expect(donut().names).toEqual(names)
    // Il formato compatto cambia con il CLDR di Node ("600.000" o "600K"):
    // il test controlla l'ordine e le somme, non il formato
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
    render(<DonutCard data={sedi.filter((s) => s.data !== "Pisa")} />)

    expect(donut().names).toEqual([
      "Bari",
      "Lecce",
      "Roma",
      "Nessuna",
      "Ancona",
      "Como",
    ])
  })

  it("ogni fetta ha un colore suo", () => {
    render(<DonutCard data={sedi} />)

    expect(new Set(donut().colors).size).toBe(6)
  })

  it("senza importi, la ciambella dice `Nessun importo nel periodo` e non c'è legenda", () => {
    render(<DonutCard data={[]} />)

    expect(donut().noData).toBe("Nessun importo nel periodo")
    expect(screen.queryByRole("list")).toBeNull()
  })
})

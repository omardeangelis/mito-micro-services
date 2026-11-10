import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PartsLegend, PartsTrack } from "../PartsBar"

// The shared bar of the Wave page and of the admin home (spec home-admin,
// AC37, AC31, D9): flexbox keeps the minimum of a small segment, the empty
// part is an elastic element with no colour, and each page names it its way

const parts = (values: Partial<Parts> = {}): Parts => ({
  worked: 0,
  calledNoOutcome: 0,
  neverCalled: 0,
  unassigned: 0,
  noContact: 0,
  ...values,
})
type Parts = {
  worked: number
  calledNoOutcome: number
  neverCalled: number
  unassigned: number
  noContact: number
}

const segmentsOf = (bar: HTMLElement) =>
  [...bar.querySelectorAll<HTMLElement>("[data-part]")].map((el) => ({
    part: el.dataset.part,
    grow: Number(el.style.flexGrow),
  }))

describe("PartsTrack", () => {
  it("con 9.099 lavorati e 1 senza operatore rende due segmenti che sommano 9.100", () => {
    render(
      <PartsTrack
        parts={parts({ worked: 9099, unassigned: 1 })}
        role="img"
        label="Barra"
      />
    )

    const segments = segmentsOf(screen.getByRole("img", { name: "Barra" }))
    expect(segments).toStrictEqual([
      { part: "worked", grow: 9099 },
      { part: "unassigned", grow: 1 },
    ])
  })

  it("mette i contatti mancanti in una parte vuota senza colore, che conta nella base", () => {
    render(
      <PartsTrack
        parts={parts({ neverCalled: 3, noContact: 7 })}
        role="img"
        label="Barra"
      />
    )

    const bar = screen.getByRole("img", { name: "Barra" })
    expect(segmentsOf(bar)).toStrictEqual([{ part: "neverCalled", grow: 3 }])
    const empty = bar.querySelector<HTMLElement>("[data-empty]")
    expect(empty?.style.flexGrow).toBe("7")
  })

  it("come indicatore ha nome, testo e valore del criterio AC31", () => {
    render(
      <PartsTrack
        parts={parts({ worked: 2, neverCalled: 8 })}
        role="meter"
        label="Avanzamento della WAVE"
        valueText="2 lavorati, 0 chiamati senza esito, 8 mai chiamati, 0 senza operatore, su 10 clienti"
      />
    )

    const meter = screen.getByRole("meter", { name: "Avanzamento della WAVE" })
    expect(meter).toHaveAttribute("aria-valuenow", "2")
    expect(meter).toHaveAttribute("aria-valuemin", "0")
    expect(meter).toHaveAttribute("aria-valuemax", "10")
    expect(meter).toHaveAttribute(
      "aria-valuetext",
      "2 lavorati, 0 chiamati senza esito, 8 mai chiamati, 0 senza operatore, su 10 clienti"
    )
  })

  it("una Wave con 0 clienti ha la barra vuota", () => {
    render(<PartsTrack parts={parts()} role="img" label="Barra" />)

    expect(segmentsOf(screen.getByRole("img", { name: "Barra" }))).toEqual([])
  })
})

describe("PartsLegend", () => {
  it("scrive «Chiamati, senza esito», con i numeri quando li riceve", () => {
    render(<PartsLegend parts={parts({ calledNoOutcome: 1234 })} />)

    const legend = screen.getByRole("list", { name: "Legenda della barra" })
    expect(within(legend).getByText("Chiamati, senza esito")).toBeVisible()
    expect(within(legend).getByText("1.234")).toBeVisible()
  })

  it("senza `parts` ha le quattro voci e nessun numero", () => {
    render(<PartsLegend />)

    const items = within(
      screen.getByRole("list", { name: "Legenda della barra" })
    ).getAllByRole("listitem")
    expect(items.map((item) => item.textContent)).toStrictEqual([
      "Lavorati",
      "Chiamati, senza esito",
      "Mai chiamati",
      "Senza operatore",
    ])
  })
})

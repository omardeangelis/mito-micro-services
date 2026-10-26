import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FinanceCard } from "../FinanceCard"

// Le tre date della card sono gli estremi delle finestre su cui il server ha
// contato, in ora di Roma (AC10). Il test gira nei progetti `utc` e `rome`
// (`timeZoneTests` di vitest.config.ts): gli istanti stanno fra la mezzanotte
// UTC e quella di Roma, quindi il fuso del processo non deve contare, e
// lontani da oggi, così le finestre calcolate al caricamento del modulo non
// danno per caso le stesse date. D'inverno e d'estate: un fuso fisso a +1 ora
// darebbe le stesse date di Roma solo d'inverno

const windows = {
  comparison: {
    start: new Date("2025-11-15T23:30:00Z"),
    end: new Date("2025-12-15T23:30:00Z"),
  },
  reference: {
    start: new Date("2025-12-15T23:30:00Z"),
    end: new Date("2026-01-14T23:30:00Z"),
  },
}

const summer = {
  comparison: {
    start: new Date("2026-05-15T22:30:00Z"),
    end: new Date("2026-06-14T22:30:00Z"),
  },
  reference: {
    start: new Date("2026-06-14T22:30:00Z"),
    end: new Date("2026-07-14T22:30:00Z"),
  },
}

const datesShown = (shown = windows) => {
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

describe("FinanceCard: le date delle finestre in ora di Roma (AC10)", () => {
  it("`FinanceCard` con una finestra che finisce a `2026-01-14T23:30:00Z` mostra `15/01/2026` come fine del riferimento", () => {
    expect(datesShown().at(-1)).toBe("15/01/2026")
  })

  it("mostra inizio del confronto, inizio del riferimento e fine del riferimento, in quest'ordine", () => {
    expect(datesShown()).toEqual(["16/11/2025", "16/12/2025", "15/01/2026"])
  })

  it("d'estate, con una finestra che finisce a `2026-07-14T22:30:00Z`, mostra `15/07/2026` come fine del riferimento", () => {
    expect(datesShown(summer)).toEqual([
      "16/05/2026",
      "15/06/2026",
      "15/07/2026",
    ])
  })
})

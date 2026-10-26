import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AdminDataSection } from "../AdminDataSection"
import { OperatorDataSection } from "../OperatorDataSection"

// Le due sezioni di "Analisi Andamento": i titoli delle card nell'ordine di
// AC16, gli importi e le date delle finestre come arrivano dal server
// (AC10, AC20). Gli istanti stanno a mezzogiorno UTC: lo stesso giorno in
// tutti e due i fusi, e lontano da oggi, così le date non coincidono per caso
// con quelle delle finestre calcolate al caricamento del modulo

const mocks = vi.hoisted(() => {
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
  return { windows }
})

vi.mock("@/trpc/server", () => ({
  api: {
    analytics: {
      getFinancedTotal: {
        query: async () => ({
          reference: 150_000,
          comparison: 100_000,
          windows: mocks.windows,
        }),
      },
      getFinancedAverage: {
        query: async () => ({
          reference: 5_000,
          comparison: 4_000,
          windows: mocks.windows,
        }),
      },
      getFinancedByBranch: {
        query: async () => [{ data: "Roma", total: 150_000 }],
      },
      getContactProgress: { query: async () => ({ done: 3, todo: 1 }) },
    },
  },
}))

// Recharts ha bisogno di un contenitore misurato, che jsdom non ha
vi.mock("@tremor/react", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  DonutChart: () => null,
  Legend: () => null,
}))

const titles = () =>
  screen
    .getAllByText(/^(Finanziato|Contatti)/)
    .map((title) => title.textContent)

const dates = () =>
  screen.getAllByText(/^\d{1,2}\/\d{2}\/\d{4}$/).map((date) => date.textContent)

describe("sezione dell'admin", () => {
  it('le card sono, in ordine, "Finanziato medio per pratica", "Contatti con esito" e "Finanziato totale per sede"', async () => {
    render(await AdminDataSection({ timeframe: "30d" }))

    expect(titles()).toEqual([
      "Finanziato medio per pratica",
      "Contatti con esito",
      "Finanziato totale per sede",
    ])
  })

  it("la card della media mostra le date delle finestre della risposta", async () => {
    render(await AdminDataSection({ timeframe: "30d" }))

    expect(dates()).toEqual(["10/01/2026", "10/02/2026", "12/03/2026"])
  })
})

describe("sezione dell'operatore", () => {
  it('le card sono, in ordine, "Finanziato totale", "Contatti con esito" e "Finanziato medio per pratica"', async () => {
    render(await OperatorDataSection({ timeframe: "30d" }))

    expect(titles()).toEqual([
      "Finanziato totale",
      "Contatti con esito",
      "Finanziato medio per pratica",
    ])
  })

  it("le due card degli importi mostrano le date delle finestre della risposta", async () => {
    render(await OperatorDataSection({ timeframe: "30d" }))

    expect(dates()).toEqual([
      "10/01/2026",
      "10/02/2026",
      "12/03/2026",
      "10/01/2026",
      "10/02/2026",
      "12/03/2026",
    ])
  })
})

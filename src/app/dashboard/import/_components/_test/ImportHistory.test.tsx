import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type ImportSummary } from "../format"
import { ImportHistory } from "../ImportHistory"

const run = (overrides: Partial<ImportSummary> = {}): ImportSummary => ({
  id: 1,
  startedAt: new Date("2026-10-25T09:05:00Z"),
  finishedAt: new Date("2026-10-25T09:07:05Z"),
  startedBy: "Anna Rossi",
  fileName: "wave_ottobre.xlsx",
  format: "wave",
  status: "completed",
  failureReason: null,
  rowsTotal: 120,
  rowsDiscarded: 3,
  customersCreated: 40,
  customersUpdated: 12_000,
  practicesCreated: 50,
  practicesUpdated: 67,
  linksCreated: 90,
  durationMs: 125_000,
  ...overrides,
})

type Result = {
  data?: { imports: ImportSummary[]; total: number }
  isLoading?: boolean
  isError?: boolean
}

const mocks = vi.hoisted(() => ({
  result: {} as Result,
  pages: [] as number[],
}))

vi.mock("@/trpc/react", () => ({
  api: {
    import: {
      list: {
        useQuery: ({ page }: { page: number }) => {
          mocks.pages.push(page)
          return { isLoading: false, isError: false, ...mocks.result }
        },
      },
    },
  },
}))

beforeEach(() => {
  mocks.result = { data: { imports: [run()], total: 1 } }
  mocks.pages = []
})

const rowOf = (fileName: string) =>
  screen.getByRole("cell", { name: fileName }).closest("tr")!

describe("ImportHistory", () => {
  it("shows who, when, which file, how it ended and the counts (AC28)", () => {
    render(<ImportHistory />)
    const cells = within(rowOf("wave_ottobre.xlsx"))
      .getAllByRole("cell")
      .map((cell) => cell.textContent)
    expect(cells).toEqual([
      "25/10/2026, 10:05",
      "Anna Rossi",
      "wave_ottobre.xlsx",
      "Wave",
      "Completato",
      "2 min 5 s",
      "40",
      "12.000",
      "50",
      "67",
      "90",
      "3",
    ])
  })

  it("names each state in Italian", () => {
    mocks.result = {
      data: {
        imports: [
          run({
            id: 1,
            fileName: "a.xlsx",
            status: "running",
            durationMs: null,
          }),
          run({ id: 2, fileName: "b.xlsx", status: "completed" }),
          run({ id: 3, fileName: "c.csv", status: "failed" }),
          run({ id: 4, fileName: "d.csv", status: "interrupted" }),
        ],
        total: 4,
      },
    }
    render(<ImportHistory />)
    const states = ["a.xlsx", "b.xlsx", "c.csv", "d.csv"].map(
      (fileName) => within(rowOf(fileName)).getAllByRole("cell")[4]!.textContent
    )
    expect(states).toEqual(["In corso", "Completato", "Fallito", "Interrotto"])
    expect(within(rowOf("a.xlsx")).getAllByRole("cell")[5]!.textContent).toBe(
      "—"
    )
  })

  it("shows why an import failed, with nothing written (AC29)", () => {
    mocks.result = {
      data: {
        imports: [
          run({
            status: "failed",
            failureReason: "Errore del database (codice 40001)",
            customersCreated: null,
            customersUpdated: null,
            practicesCreated: null,
            practicesUpdated: null,
            linksCreated: null,
          }),
        ],
        total: 1,
      },
    }
    render(<ImportHistory />)
    const cells = within(rowOf("wave_ottobre.xlsx")).getAllByRole("cell")
    expect(cells[4]!.textContent).toBe(
      "FallitoErrore del database (codice 40001)"
    )
    expect(cells.slice(6, 11).map((cell) => cell.textContent)).toEqual([
      "—",
      "—",
      "—",
      "—",
      "—",
    ])
  })

  it("shows an import past its time as interrupted (AC30)", () => {
    mocks.result = {
      data: {
        imports: [
          run({
            status: "interrupted",
            failureReason: "L'import non è finito entro 30 minuti dall'inizio",
            durationMs: null,
          }),
        ],
        total: 1,
      },
    }
    render(<ImportHistory />)
    expect(
      within(rowOf("wave_ottobre.xlsx")).getAllByRole("cell")[4]!.textContent
    ).toBe("InterrottoL'import non è finito entro 30 minuti dall'inizio")
  })

  it("goes through the imports 20 at a time (AC28)", () => {
    mocks.result = { data: { imports: [run()], total: 45 } }
    render(<ImportHistory />)
    expect(mocks.pages.at(-1)).toBe(1)
    expect(screen.getByText("Pagina 1 di 3")).toBeTruthy()
    expect(
      screen
        .getByRole("button", { name: "Precedente" })
        .hasAttribute("disabled")
    ).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Successiva" }))
    fireEvent.click(screen.getByRole("button", { name: "Successiva" }))

    expect(mocks.pages.at(-1)).toBe(3)
    expect(screen.getByText("Pagina 3 di 3")).toBeTruthy()
    expect(
      screen
        .getByRole("button", { name: "Successiva" })
        .hasAttribute("disabled")
    ).toBe(true)
  })

  it("has no pages with 20 imports or fewer", () => {
    mocks.result = { data: { imports: [run()], total: 20 } }
    render(<ImportHistory />)
    expect(screen.queryByRole("navigation")).toBeNull()
  })

  it("says when there is no import yet", () => {
    mocks.result = { data: { imports: [], total: 0 } }
    render(<ImportHistory />)
    expect(screen.getByText("Nessun import")).toBeTruthy()
  })

  it("says when the history doesn't load", () => {
    mocks.result = { data: undefined, isError: true }
    render(<ImportHistory />)
    expect(screen.getByRole("alert").textContent).toBe(
      "Lo storico degli import non si carica: riprova tra poco"
    )
  })
})

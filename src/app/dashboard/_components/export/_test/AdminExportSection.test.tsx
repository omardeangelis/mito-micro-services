import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CallStats } from "@mito/domain/export/calls"
import type { ExportPeriod } from "@mito/domain/export/period"
import { AdminExportSection } from "../AdminExportSection"

const stats: CallStats = {
  rows: [
    {
      operatorId: 1,
      name: "Anna",
      surname: "Rossi",
      calls: 4,
      answered: 3,
      appointments: 1,
      noAnswer: 1,
    },
  ],
  totals: { calls: 4, answered: 3, appointments: 1, noAnswer: 1 },
}

const empty: CallStats = {
  rows: [],
  totals: { calls: 0, answered: 0, appointments: 0, noAnswer: 0 },
}

const mocks = vi.hoisted(() => ({
  data: undefined as CallStats | undefined,
  isError: false,
  refetch: vi.fn(),
  calls: [] as Array<{ input: ExportPeriod; enabled: boolean }>,
}))

vi.mock("@/trpc/react", () => ({
  api: {
    export: {
      callStats: {
        useQuery: (input: ExportPeriod, options: { enabled: boolean }) => {
          mocks.calls.push({ input, enabled: options.enabled })
          return {
            data: mocks.data,
            isLoading: false,
            isError: mocks.isError,
            refetch: mocks.refetch,
          }
        },
      },
    },
  },
}))

vi.mock("../ExportCharts", () => ({
  ExportCharts: () => <div>grafici</div>,
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-23T10:00:00Z"))
  mocks.data = stats
  mocks.calls = []
  mocks.isError = false
  mocks.refetch.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

const from = () => screen.getByLabelText("Dal")
const to = () => screen.getByLabelText("Al")

describe("AdminExportSection", () => {
  it("opens on the last 30 days, inside the selectable days (AC11b)", () => {
    render(<AdminExportSection />)
    expect((from() as HTMLInputElement).value).toBe("2026-09-24")
    expect((to() as HTMLInputElement).value).toBe("2026-10-23")
    expect(from().getAttribute("min")).toBe("2026-07-24")
    expect(to().getAttribute("max")).toBe("2026-10-23")
    expect(mocks.calls.at(-1)).toEqual({
      input: { from: "2026-09-24", to: "2026-10-23" },
      enabled: true,
    })
  })

  it("warns that the data is complete only from 15/09/2026 (AC11b)", () => {
    render(<AdminExportSection />)
    expect(screen.queryByText(/Dati completi/)).toBeNull()

    fireEvent.change(from(), { target: { value: "2026-09-10" } })

    expect(screen.getByText("Dati completi solo dal 15/09/2026")).toBeTruthy()
  })

  it("shows the totals of the one request of the period (AC16, AC19)", () => {
    render(<AdminExportSection />)
    const kpis = screen.getByText("Chiamate effettuate").closest("dl")!
    const values = within(kpis)
      .getAllByRole("definition")
      .map((node) => node.textContent)
    expect(values).toEqual(["4", "3", "1", "1"])
    expect(screen.getByText("grafici")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Scarica Excel" })).toBeTruthy()
    expect(
      new Set(mocks.calls.map((call) => JSON.stringify(call.input))).size
    ).toBe(1)
  })

  it("without calls says so and offers no file (AC14)", () => {
    mocks.data = empty
    render(<AdminExportSection />)
    expect(screen.getByText("Nessuna chiamata nel periodo")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Scarica Excel" })).toBeNull()
    expect(screen.queryByText("grafici")).toBeNull()
  })

  it("does not ask for a period outside the selectable days", () => {
    render(<AdminExportSection />)
    fireEvent.change(from(), { target: { value: "2026-07-01" } })
    expect(mocks.calls.at(-1)?.enabled).toBe(false)
    expect(screen.getByRole("alert").textContent).toBe(
      "Scegli un periodo tra il 24/07/2026 e il 23/10/2026"
    )
  })

  it("when the request fails says so and offers to retry", () => {
    mocks.data = undefined
    mocks.isError = true
    render(<AdminExportSection />)
    expect(screen.getByRole("alert").textContent).toContain(
      "Non è stato possibile caricare le chiamate del periodo"
    )
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })

  it("after midnight in Rome today becomes selectable without a reload", () => {
    const { rerender } = render(<AdminExportSection />)
    vi.setSystemTime(new Date("2026-10-23T22:30:00Z")) // 00:30 of the 24th in Rome
    rerender(<AdminExportSection />)
    expect(to().getAttribute("max")).toBe("2026-10-24")
  })
})

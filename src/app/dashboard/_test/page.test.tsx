import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import DashboardHome from "../page"

// La pagina legge il periodo dell'URL una volta, con `parseTimeFrame`, e lo
// passa a `DataSection` e al selettore (AC11): i numeri e il periodo mostrato
// sono sempre gli stessi. Le sezioni, che chiamano il server, sono finte
vi.mock("../_components/DataSection", () => ({
  DataSection: (props: { timeframe?: string }) => (
    <div data-testid="data-section">{props.timeframe}</div>
  ),
}))
vi.mock("../_components/AdminDataSection", () => ({
  DataSectionSkeleton: () => null,
}))
vi.mock("../_components/LastUpdatedTableSection", () => ({
  LastUpdatedTableSection: () => null,
}))
vi.mock("../_components/ImportLink", () => ({ ImportLink: () => null }))
vi.mock("../_components/export/CallsSection", () => ({
  CallsSection: () => null,
}))
vi.mock("@/components/custom/date-picker", () => ({
  TimeFrameSelector: (props: { timeframe?: string }) => (
    <div data-testid="selector">{props.timeframe}</div>
  ),
}))

/** Il periodo che ricevono `DataSection` e il selettore. */
const timeframeShown = async (
  searchParams?: Record<string, string | string[] | undefined>
) => {
  render(await DashboardHome({ params: {} as { x: never }, searchParams }))
  return {
    dataSection: screen.getByTestId("data-section").textContent,
    selector: screen.getByTestId("selector").textContent,
  }
}

const both = (timeframe: string) => ({
  dataSection: timeframe,
  selector: timeframe,
})

describe("pagina della dashboard: il periodo dell'URL", () => {
  it("con `?tf=7d`, la pagina della dashboard passa `30d` a `DataSection` e al selettore", async () => {
    expect(await timeframeShown({ tf: "7d" })).toEqual(both("30d"))
  })

  it("senza `tf` nella query, passa `30d` a tutti e due", async () => {
    expect(await timeframeShown({})).toEqual(both("30d"))
  })

  it("senza query, passa `30d` a tutti e due", async () => {
    expect(await timeframeShown(undefined)).toEqual(both("30d"))
  })

  it("con `tf` ripetuto nell'URL, passa `30d` a tutti e due", async () => {
    expect(await timeframeShown({ tf: ["90d", "365d"] })).toEqual(both("30d"))
  })

  it("con `?tf=365d`, passa `365d` a tutti e due", async () => {
    expect(await timeframeShown({ tf: "365d" })).toEqual(both("365d"))
  })
})

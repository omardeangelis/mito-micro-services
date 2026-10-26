import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import DashboardHome from "../page"

// La pagina passa a `DataSection` il periodo dell'URL, letto con
// `parseTimeFrame` (AC11). Le sezioni, che chiamano il server, sono finte
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
  TimeFrameSelector: () => null,
}))

const timeframeShown = async (
  searchParams?: Record<string, string | string[] | undefined>
) => {
  render(await DashboardHome({ params: {} as { x: never }, searchParams }))
  return screen.getByTestId("data-section").textContent
}

describe("pagina della dashboard: il periodo dell'URL", () => {
  it("con `?tf=7d`, la pagina della dashboard passa `30d` a `DataSection`", async () => {
    expect(await timeframeShown({ tf: "7d" })).toBe("30d")
  })

  it("senza `tf` nella query, passa `30d`", async () => {
    expect(await timeframeShown({})).toBe("30d")
  })

  it("senza query, passa `30d`", async () => {
    expect(await timeframeShown(undefined)).toBe("30d")
  })

  it("con `tf` ripetuto nell'URL, passa `30d`", async () => {
    expect(await timeframeShown({ tf: ["90d", "365d"] })).toBe("30d")
  })

  it("con `?tf=365d`, passa `365d`", async () => {
    expect(await timeframeShown({ tf: "365d" })).toBe("365d")
  })
})

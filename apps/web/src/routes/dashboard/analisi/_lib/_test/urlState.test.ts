import { describe, expect, it } from "vitest"
import { chartsFor } from "../charts"
import {
  readState,
  withCompare,
  withCustom,
  withGroup,
  withPreset,
  writeState,
} from "../urlState"

const today = "2026-10-30"

describe("chartsFor (AC3)", () => {
  it("gives the admin six charts and the operator five, without the branches", () => {
    expect(chartsFor("ADMIN")).toEqual([
      "financed",
      "average",
      "branches",
      "progress",
      "calls",
      "appointments",
    ])
    expect(chartsFor("OPERATORE")).toEqual([
      "financed",
      "average",
      "progress",
      "calls",
      "appointments",
    ])
  })
})

describe("readState (AC14)", () => {
  it("opens on the last 30 days, the previous period, automatic grouping and the first chart", () => {
    expect(readState("", today, "ADMIN")).toEqual({
      chart: "financed",
      range: "30d",
      window: { from: "2026-10-01", to: "2026-10-30" },
      compare: "previous",
      group: "auto",
    })
  })

  it("opens the first allowed chart when the role can't see the one asked", () => {
    expect(
      readState("?chart=branches&range=30d", today, "OPERATORE").chart
    ).toBe("financed")
    expect(readState("?chart=branches&range=30d", today, "ADMIN").chart).toBe(
      "branches"
    )
  })

  it("reads the example of the spec, and writes it back the same", () => {
    const search =
      "?chart=calls&range=custom&from=2026-09-01&to=2026-09-30&compare=previous&group=week"
    const state = readState(search, today, "ADMIN")
    expect(state).toEqual({
      chart: "calls",
      range: "custom",
      window: { from: "2026-09-01", to: "2026-09-30" },
      compare: "previous",
      group: "week",
    })
    expect(`?${writeState(state)}`).toBe(search)
  })

  it("writes a ready-made window without its dates", () => {
    expect(writeState(readState("?range=ytd", today, "ADMIN"))).toBe(
      "chart=financed&range=ytd&compare=last-year&group=auto"
    )
  })

  it("takes the initial comparison of the window when the address has none (AC9)", () => {
    expect(readState("?range=ytd", today, "ADMIN").compare).toBe("last-year")
    expect(readState("?range=ytd&compare=none", today, "ADMIN").compare).toBe(
      "none"
    )
  })

  it.each([
    ["chart=foo", { chart: "financed" }],
    ["range=2y", { range: "30d" }],
    ["compare=foo", { compare: "previous" }],
    ["group=year", { group: "auto" }],
  ])("goes back to the initial value for %s", (search, expected) => {
    expect(readState(`?${search}`, today, "ADMIN")).toMatchObject(expected)
  })

  it.each([
    ["after today", "from=2026-10-01&to=2026-10-31"],
    ["367 days", "from=2025-10-29&to=2026-10-30"],
    ["inverted", "from=2026-10-10&to=2026-10-01"],
    ["no dates", ""],
  ])("goes back to the initial window for a custom one %s", (_, dates) => {
    expect(readState(`?range=custom&${dates}`, today, "ADMIN")).toMatchObject({
      range: "30d",
      window: { from: "2026-10-01", to: "2026-10-30" },
    })
  })

  it("goes back to automatic when the grouping isn't allowed for the window (AC13)", () => {
    expect(readState("?range=30d&group=month", today, "ADMIN").group).toBe(
      "auto"
    )
    expect(readState("?range=90d&group=month", today, "ADMIN").group).toBe(
      "month"
    )
  })
})

describe("transitions", () => {
  const opened = readState("?chart=average&range=ytd", today, "ADMIN")

  it("keeps the comparison chosen when the window changes (AC9)", () => {
    const next = withPreset(opened, "30d", today)
    expect(next).toMatchObject({
      range: "30d",
      window: { from: "2026-10-01", to: "2026-10-30" },
      compare: "last-year",
      chart: "average",
    })
  })

  it("drops a grouping the new window doesn't allow (AC13)", () => {
    const monthly = withGroup(withPreset(opened, "90d", today), "month")
    expect(monthly.group).toBe("month")
    expect(withPreset(monthly, "30d", today).group).toBe("auto")
  })

  it("applies dates picked by hand", () => {
    expect(
      withCustom(opened, { from: "2026-09-01", to: "2026-09-30" })
    ).toMatchObject({
      range: "custom",
      window: { from: "2026-09-01", to: "2026-09-30" },
      compare: "last-year",
    })
  })

  it("changes the comparison", () => {
    expect(withCompare(opened, "none").compare).toBe("none")
  })
})

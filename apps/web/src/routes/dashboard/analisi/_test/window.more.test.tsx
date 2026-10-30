import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { fakeAnalisi } from "@/test/analisi"
import { renderAnalisi } from "./page"

const CALENDAR_BUTTON = /^Date: .*, scegli dal calendario$/

/** The calendar's button: its name says the dates of the window */
const calendarButton = () =>
  screen.findByRole("button", { name: CALENDAR_BUTTON })

/** The search of the address, as the page wrote it */
const address = () => new URLSearchParams(window.location.search)

/** A day of the open calendar, by its button */
const day = (name: RegExp) => screen.getByRole("button", { name })

describe("the menu of the periods (AC9)", () => {
  it("keeps the comparison chosen when the period changes", async () => {
    const user = userEvent.setup()
    renderAnalisi(
      "/dashboard/analisi?range=30d&compare=previous",
      fakeAnalisi(),
      { role: "ADMIN" }
    )
    await calendarButton()

    await user.click(screen.getByRole("combobox", { name: "Periodo" }))
    await user.click(
      await screen.findByRole("option", { name: "L'anno in corso" })
    )

    await waitFor(() => expect(address().get("range")).toBe("ytd"))
    expect(address().get("compare")).toBe("previous")
    expect(
      screen.getByRole("combobox", { name: "Confronto" })
    ).toHaveTextContent("Periodo precedente")
  })

  it("opens «L'anno in corso» without a comparison in the address on the year before", async () => {
    renderAnalisi("/dashboard/analisi?range=ytd", fakeAnalisi(), {
      role: "ADMIN",
    })
    await calendarButton()

    expect(
      screen.getByRole("combobox", { name: "Confronto" })
    ).toHaveTextContent("Stesso periodo, anno prima")
    await waitFor(() => expect(address().get("compare")).toBe("last-year"))
  })

  it("lists the five periods and «Date personalizzate…», which opens the calendar", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi", fakeAnalisi(), { role: "ADMIN" })
    await calendarButton()
    const period = screen.getByRole("combobox", { name: "Periodo" })
    expect(period).toHaveTextContent("Gli ultimi 30 giorni")

    await user.click(period)
    const names = (await screen.findAllByRole("option")).map(
      (option) => option.textContent
    )
    expect(names).toEqual([
      "Gli ultimi 7 giorni",
      "Gli ultimi 30 giorni",
      "Gli ultimi 90 giorni",
      "L'anno in corso",
      "Gli ultimi 12 mesi",
      "Date personalizzate…",
    ])
    await user.click(
      screen.getByRole("option", { name: "Date personalizzate…" })
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })

  it("says «Date personalizzate» when the dates were picked by hand, and opens the calendar again", async () => {
    const user = userEvent.setup()
    renderAnalisi(
      "/dashboard/analisi?range=custom&from=2026-09-01&to=2026-09-30",
      fakeAnalisi(),
      { role: "ADMIN" }
    )
    await screen.findByRole("button", {
      name: "Date: 1 – 30 set 2026, scegli dal calendario",
    })
    const period = screen.getByRole("combobox", { name: "Periodo" })
    expect(period).toHaveTextContent("Date personalizzate")

    await user.click(period)
    await user.click(
      await screen.findByRole("option", { name: "Date personalizzate…" })
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })
})

describe("the calendar, more (AC9, AC42)", () => {
  it("applies 1–30 September and the whole page follows", async () => {
    const user = userEvent.setup()
    const backend = fakeAnalisi()
    renderAnalisi("/dashboard/analisi", backend, { role: "ADMIN" })
    const button = await calendarButton()

    await user.click(button)
    const dialog = await screen.findByRole("dialog")
    // The months of the window: September and October
    await user.click(
      within(dialog).getByRole("button", { name: /\b1 settembre 2026/ })
    )
    // September's last days are also the outside days of October's grid
    const [lastOfSeptember] = within(dialog).getAllByRole("button", {
      name: /\b30 settembre 2026/,
    })
    await user.click(lastOfSeptember!)
    expect(
      within(dialog).getByText("1 – 30 set 2026 · 30 giorni")
    ).toHaveAttribute("aria-live", "polite")
    await user.click(within(dialog).getByRole("button", { name: "Applica" }))

    await waitFor(() => expect(address().get("range")).toBe("custom"))
    expect(address().get("from")).toBe("2026-09-01")
    expect(address().get("to")).toBe("2026-09-30")
    expect(address().get("compare")).toBe("previous")
    await waitFor(() =>
      expect(backend.state.financedReads).toContainEqual({
        from: "2026-09-01",
        to: "2026-09-30",
        compare: "previous",
      })
    )
    expect(
      await screen.findByRole("button", {
        name: "Date: 1 – 30 set 2026, scegli dal calendario",
      })
    ).toHaveFocus()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Periodo" })).toHaveTextContent(
      "Date personalizzate"
    )
    expect(
      screen.getByText("1 – 30 set 2026 · confronto: 1 – 31 ago 2026")
    ).toBeInTheDocument()
  })

  it("takes a window of 366 days and not one of 367", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi", fakeAnalisi(), { role: "ADMIN" })
    await user.click(await calendarButton())
    const dialog = await screen.findByRole("dialog")
    // The buttons of the months are drawn again after a click on a day
    const months = async (name: RegExp, count: number) => {
      for (let month = 0; month < count; month++)
        await user.click(within(dialog).getByRole("button", { name }))
    }
    const pick = (name: RegExp) =>
      user.click(within(dialog).getByRole("button", { name }))
    // From September-October 2026 to September-October 2025, and back
    await months(/mese precedente/, 12)
    await pick(/\b30 ottobre 2025/)
    await months(/mese successivo/, 12)

    // 30 October 2025 – 30 October 2026 are 366 days
    await pick(/\b30 ottobre 2026/)
    expect(
      within(dialog).getByText("30 ott 2025 – 30 ott 2026 · 366 giorni")
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole("button", { name: "Applica" })
    ).toBeEnabled()

    // From the day before, the same end is the 367th day
    await months(/mese precedente/, 12)
    await pick(/\b29 ottobre 2025/)
    await months(/mese successivo/, 12)
    expect(
      within(dialog).getByRole("button", { name: /\b30 ottobre 2026/ })
    ).toBeDisabled()
    expect(
      within(dialog).getByRole("button", { name: /\b29 ottobre 2026/ })
    ).toBeEnabled()
    expect(
      within(dialog).getByRole("button", { name: "Applica" })
    ).toBeDisabled()

    await pick(/\b29 ottobre 2026/)
    await user.click(within(dialog).getByRole("button", { name: "Applica" }))
    await waitFor(() => expect(address().get("from")).toBe("2025-10-29"))
    expect(address().get("to")).toBe("2026-10-29")
    // Two months of clicks in the calendar: slow under the load of the whole
    // suite, so more time than the default 5 s
  }, 20_000)

  it("closes when its button is clicked again, and «Applica» gives the focus back to it", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi", fakeAnalisi(), { role: "ADMIN" })
    const button = await calendarButton()

    await user.click(button)
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(button).toHaveAttribute("aria-expanded", "true")
    await user.click(button)

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(button).toHaveAttribute("aria-expanded", "false")

    await user.click(button)
    await user.click(await screen.findByRole("button", { name: "Applica" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(button).toHaveFocus()
  })

  it("has no day after today", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi", fakeAnalisi(), { role: "ADMIN" })
    await user.click(await calendarButton())

    expect(day(/\b30 ottobre 2026/)).toBeEnabled()
    expect(day(/\b31 ottobre 2026/)).toBeDisabled()
  })

  it("has «Applica» off until the window has its two ends", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi", fakeAnalisi(), { role: "ADMIN" })
    await user.click(await calendarButton())

    await user.click(day(/\b10 ottobre 2026/))

    expect(screen.getByRole("button", { name: "Applica" })).toBeDisabled()
    await user.click(day(/\b12 ottobre 2026/))
    expect(screen.getByText("10 – 12 ott 2026 · 3 giorni")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Applica" })).toBeEnabled()
  })
})

describe("«Raggruppa per», more (AC13)", () => {
  it("disables «Per mese» on 30 days and regroups without asking the server again", async () => {
    const user = userEvent.setup()
    const backend = fakeAnalisi()
    renderAnalisi("/dashboard/analisi?chart=financed", backend, {
      role: "ADMIN",
    })
    const group = await screen.findByRole("combobox", { name: /Raggruppa per/ })
    await waitFor(() =>
      expect(backend.state.financedReads.length).toBeGreaterThan(0)
    )
    const reads = backend.state.financedReads.length

    await user.click(group)
    expect(
      await screen.findByRole("option", { name: "Per mese" })
    ).toHaveAttribute("aria-disabled", "true")
    expect(
      screen.getByRole("option", { name: "Per settimana" })
    ).not.toHaveAttribute("aria-disabled")
    await user.click(screen.getByRole("option", { name: "Per settimana" }))

    await waitFor(() => expect(address().get("group")).toBe("week"))
    expect(group).toHaveTextContent("Per settimana")
    expect(backend.state.financedReads).toHaveLength(reads)
  })
})

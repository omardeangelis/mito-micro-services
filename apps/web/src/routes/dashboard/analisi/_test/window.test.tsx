import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { fakeAnalisi } from "@/test/analisi"
import { renderAnalisi } from "./page"

describe("the calendar (AC9, AC42)", () => {
  it("is named after the dates of the window", async () => {
    renderAnalisi("/dashboard/analisi", fakeAnalisi(), { role: "ADMIN" })

    expect(
      await screen.findByRole("button", {
        name: "Date: 1 – 30 ott 2026, scegli dal calendario",
      })
    ).toBeInTheDocument()
  })

  it("closes with Esc without changing the window", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi", fakeAnalisi(), { role: "ADMIN" })
    const button = await screen.findByRole("button", {
      name: "Date: 1 – 30 ott 2026, scegli dal calendario",
    })
    await waitFor(() => expect(window.location.search).not.toBe(""))
    const before = window.location.search

    await user.click(button)
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(window.location.search).toBe(before)
    expect(button).toHaveFocus()
  })
})

describe("«Raggruppa per» (AC13)", () => {
  it("is only on the charts in time", async () => {
    renderAnalisi("/dashboard/analisi?chart=progress", fakeAnalisi(), {
      role: "ADMIN",
    })
    await screen.findByRole("tabpanel", { name: "Contatti con esito" })

    expect(
      screen.queryByRole("combobox", { name: /Raggruppa per/ })
    ).not.toBeInTheDocument()
  })
})

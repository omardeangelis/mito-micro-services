import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { fakeAnalisi } from "@/test/analisi"
import { renderAnalisi } from "./page"

// «Oggi» in the address and the controls (spec andamenti-chiamate, AC18, AC19)

/** The search of the address, as the page wrote it */
const address = () => new URLSearchParams(window.location.search)

describe("«Oggi» on the Analysis page", () => {
  it("asks every read with a window for range=today, and groups only by hour", async () => {
    const user = userEvent.setup()
    const backend = fakeAnalisi()
    renderAnalisi("/dashboard/analisi?chart=financed", backend, {
      role: "ADMIN",
    })
    await screen.findByRole("combobox", { name: "Periodo" })

    await user.click(screen.getByRole("combobox", { name: "Periodo" }))
    await user.click(await screen.findByRole("option", { name: "Oggi" }))

    await waitFor(() => expect(address().get("range")).toBe("today"))
    expect(address().get("group")).toBe("hour")
    await waitFor(() =>
      expect(backend.state.financedReads.at(-1)?.range).toBe("today")
    )

    await user.click(screen.getByRole("combobox", { name: /Raggruppa per/ }))
    const groups = (await screen.findAllByRole("option")).filter(
      (option) => option.getAttribute("aria-disabled") !== "true"
    )
    expect(groups.map((option) => option.textContent)).toEqual(["Per ora"])
  })

  it("opens on «Oggi» with the previous period as the comparison (AC18, AC20)", async () => {
    renderAnalisi("/dashboard/analisi?range=today", fakeAnalisi(), {
      role: "ADMIN",
    })
    expect(
      await screen.findByRole("combobox", { name: "Periodo" })
    ).toHaveTextContent("Oggi")
    expect(
      screen.getByRole("combobox", { name: "Confronto" })
    ).toHaveTextContent("Periodo precedente")
  })

  it("gives the grouping back its initial value when the period leaves «Oggi» (AC19)", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi?range=today", fakeAnalisi(), {
      role: "ADMIN",
    })
    await screen.findByRole("combobox", { name: "Periodo" })
    await waitFor(() => expect(address().get("group")).toBe("hour"))

    await user.click(screen.getByRole("combobox", { name: "Periodo" }))
    await user.click(
      await screen.findByRole("option", { name: "Gli ultimi 7 giorni" })
    )

    await waitFor(() => expect(address().get("range")).toBe("7d"))
    expect(address().get("group")).toBe("auto")
  })

  it("asks the calls of the operators for range=today, as the admin (AC18)", async () => {
    const backend = fakeAnalisi()
    renderAnalisi("/dashboard/analisi?chart=calls&range=today", backend, {
      role: "ADMIN",
    })
    await waitFor(() =>
      expect(backend.state.callsReads.at(-1)?.range).toBe("today")
    )
  })

  it("asks the call series of the operator for range=today (AC18)", async () => {
    const backend = fakeAnalisi()
    renderAnalisi("/dashboard/analisi?chart=calls&range=today", backend, {
      role: "OPERATORE",
    })
    await waitFor(() =>
      expect(backend.state.myCallsReads.at(-1)?.range).toBe("today")
    )
  })
})

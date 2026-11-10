import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { fakeAdminHome } from "@/test/adminHome"
import { renderHome } from "./page"

// «Andamento delle chiamate» on the admin's home (spec andamenti-chiamate,
// AC3, AC5, AC8)

describe("«Andamento delle chiamate»", () => {
  it("opens on «7 giorni» with the rate of the period above «Tasso di risposta»", async () => {
    renderHome("/dashboard", fakeAdminHome(), { role: "ADMIN" })

    const section = await screen.findByRole("region", {
      name: "Andamento delle chiamate",
    })
    expect(
      within(section).getByRole("radio", { name: "7 giorni" })
    ).toBeChecked()
    // The fake's 7 days: 6 answers on 9 calls
    expect(
      await within(section).findByText("66,7% · 6 risposte su 9 chiamate")
    ).toBeInTheDocument()
    expect(within(section).getByText("Tasso di risposta")).toBeInTheDocument()
  })
})

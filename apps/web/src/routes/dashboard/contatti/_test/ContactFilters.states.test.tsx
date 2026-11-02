import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { activeOperator, fakeContacts } from "@/test/contacts"
import { findTable, renderContacts } from "./page"

// Il filtro «Stato» della lista mostra i sei stati con le loro etichette, mai
// i valori del database (AC1, AC2)

const operators = [activeOperator({ id: 7, name: "Mario", surname: "Rossi" })]

const renderBar = async () => {
  const view = renderContacts(
    "/dashboard/contatti",
    fakeContacts({ operators })
  )
  await findTable()
  return view
}

describe("il filtro degli stati", () => {
  it("offre sei stati, con le etichette, e nessun valore del database", async () => {
    const { user } = await renderBar()

    await user.click(screen.getByRole("button", { name: "Stato" }))

    expect(screen.getAllByRole("checkbox")).toHaveLength(6)
    for (const label of [
      "Da chiamare",
      "Non risponde",
      "Richiamo",
      "Appuntamento",
      "Pratica caricata",
      "Non interessato",
    ]) {
      expect(screen.getByRole("checkbox", { name: label })).toBeTruthy()
    }
    for (const value of [
      "followup",
      "nessuno",
      "erogata",
      "app.to",
      "richiamare",
      "caricato",
    ]) {
      expect(screen.queryByRole("checkbox", { name: value })).toBeNull()
    }
  })
})

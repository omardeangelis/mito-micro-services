import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"
import { CustomerContactSummary } from "../CustomerContactSummary"

// Lo stato del contatto attivo nella scheda cliente si legge con la sua
// etichetta, e il richiamo con il giorno dell'alert (AC1, AC30)

const giulia = { id: 9, name: "Giulia", surname: "Bianchi" }

const show = (
  state: "app.to" | "followup" | "richiamare",
  alert: { deadline: Date } | null = null
) =>
  render(
    <MemoryRouter>
      <CustomerContactSummary
        customerId="customer-1"
        contact={{ id: 321, state, priority: 120, operator: giulia }}
        alert={alert}
      />
    </MemoryRouter>
  )

describe("CustomerContactSummary, le etichette degli stati", () => {
  it("app.to si legge Appuntamento", () => {
    show("app.to")

    expect(screen.getByText("Appuntamento")).toBeTruthy()
    expect(screen.queryByText("app.to")).toBeNull()
  })

  it("un valore vecchio si legge con l'etichetta del suo stato nuovo", () => {
    show("followup")

    expect(screen.getByText("Da chiamare")).toBeTruthy()
    expect(screen.queryByText("followup")).toBeNull()
  })

  it("un richiamo con alert mostra il giorno dell'alert", () => {
    show("richiamare", { deadline: new Date("2026-11-05T09:00:00Z") })

    expect(screen.getByText("Richiamo · 05/11")).toBeTruthy()
  })
})

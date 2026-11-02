import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ContactStateSelect } from "../ContactStateSelect"

// Il selettore mostra l'etichetta dello stato, e il giorno del richiamo, mai il
// valore del database (AC1, AC30)

describe("ContactStateSelect, le etichette", () => {
  it("il pulsante dice l'etichetta di app.to, e il suo nome la dice", () => {
    render(<ContactStateSelect value="app.to" onChange={vi.fn()} />)

    expect(screen.getByText("Appuntamento")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Appuntamento, cambia stato" })
    ).toBeTruthy()
  })

  it("un valore vecchio si legge con l'etichetta del suo stato nuovo", () => {
    render(<ContactStateSelect value="followup" onChange={vi.fn()} />)

    expect(screen.getByText("Da chiamare")).toBeTruthy()
    expect(screen.queryByText("followup")).toBeNull()
    expect(
      screen.getByRole("button", { name: "Da chiamare, cambia stato" })
    ).toBeTruthy()
  })

  it("un richiamo mostra il giorno dell'alert aperto", () => {
    render(
      <ContactStateSelect
        value="richiamare"
        alertDay="2026-11-05"
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText("Richiamo · 05/11")).toBeTruthy()
  })

  it("le voci del menu si leggono con le etichette", async () => {
    const user = userEvent.setup()
    render(<ContactStateSelect value="app.to" onChange={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /cambia stato$/ }))

    expect(
      screen.getByRole("menuitemradio", { name: "Pratica caricata" })
    ).toBeTruthy()
    expect(screen.queryByRole("menuitemradio", { name: "caricato" })).toBeNull()
  })
})

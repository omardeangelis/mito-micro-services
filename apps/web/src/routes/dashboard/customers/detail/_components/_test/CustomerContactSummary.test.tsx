import { type ComponentProps } from "react"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"
import {
  customerContactsState,
  detailHref,
} from "@mito/client/contact/searchParams"
import { CustomerContactSummary } from "../CustomerContactSummary"

// La scheda cliente mostra il contatto attivo in sola lettura (AC64): lo stato,
// l'operatore, la priorità e il prossimo alert, e un link al dettaglio. Da qui
// non si cambia più niente (AC65). I test di CustomerContactSummary dell'app
// Next.js

const giulia = { id: 9, name: "Giulia", surname: "Bianchi" }

const contact = {
  id: 321,
  state: "richiamare" as const,
  priority: 120,
  operator: giulia,
}

const alert = { deadline: new Date("2026-11-05T09:00:00Z") }

const show = (
  props: Partial<ComponentProps<typeof CustomerContactSummary>> = {}
) =>
  render(
    <MemoryRouter>
      <CustomerContactSummary
        customerId="customer-1"
        contact={contact}
        alert={alert}
        {...props}
      />
    </MemoryRouter>
  )

describe("CustomerContactSummary", () => {
  it("mostra stato, operatore, priorità e prossimo alert del contatto", () => {
    show()

    expect(screen.getByText("richiamare")).not.toBeNull()
    expect(screen.getByText("Giulia Bianchi")).not.toBeNull()
    // La priorità si dice anche a parole: il badge è solo un'icona
    expect(screen.getByText("Urgente")).not.toBeNull()
    expect(screen.getByText("5/11/2026")).not.toBeNull()
  })

  it("etichetta ogni dato", () => {
    show()

    for (const label of ["Stato", "Operatore", "Priorità", "Prossimo alert"]) {
      expect(screen.getByText(label)).not.toBeNull()
    }
  })

  it("senza alert dice 'Nessun alert'", () => {
    show({ alert: null })

    expect(screen.getByText("Nessun alert")).not.toBeNull()
  })

  it("senza operatore dice 'Non assegnato'", () => {
    show({ contact: { ...contact, operator: null } })

    expect(screen.getByText("Non assegnato")).not.toBeNull()
  })

  it("senza priorità o stato mostra quelli di default: bassa e nessuno", () => {
    show({ contact: { ...contact, priority: null, state: null } })

    expect(screen.getByText("Bassa")).not.toBeNull()
    expect(screen.getByText("nessuno")).not.toBeNull()
  })

  it("'Gestisci contatto' apre il dettaglio con la lista filtrata sul cliente (D28)", () => {
    show()

    const link = screen.getByRole("link", { name: "Gestisci contatto" })
    expect(link.getAttribute("href")).toBe(
      detailHref(321, customerContactsState("customer-1"))
    )
    // Il selettore con cui "Crea contatto" gli porta il focus
    expect(link.hasAttribute("data-contact-manage-link")).toBe(true)
  })

  it("è in sola lettura: nessun selettore, pulsante o campo (AC65)", () => {
    const { container } = show()

    expect(screen.queryAllByRole("button")).toHaveLength(0)
    expect(screen.queryAllByRole("combobox")).toHaveLength(0)
    expect(container.querySelector("[data-contact-state-trigger]")).toBeNull()
    expect(container.querySelector("input, select, textarea")).toBeNull()
  })
})

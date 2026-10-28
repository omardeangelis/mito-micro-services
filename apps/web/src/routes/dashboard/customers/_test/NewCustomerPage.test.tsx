import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { customerOf, fakeCustomers } from "@/test/customers"
import { Component as NewCustomerPage } from "../NewCustomerPage"
import { renderCustomers } from "./page"

// "Nuovo cliente" on a backend in memory: the checks of the form, the codes
// already used, the save and the sheet of the new customer

const ROUTE = "/dashboard/customers/new"

const setup = (backend = fakeCustomers()) => {
  const user = userEvent.setup()
  renderCustomers(ROUTE, backend, { ui: <NewCustomerPage />, route: ROUTE })
  const field = (label: string) => screen.getByLabelText(label)
  return {
    user,
    backend,
    type: async (label: string, text: string) => {
      await user.type(field(label), text)
    },
    pickSource: async (source: string) => {
      await user.click(screen.getByRole("combobox", { name: "Provenienza" }))
      await user.click(await screen.findByRole("option", { name: source }))
    },
    save: () => user.click(screen.getByRole("button", { name: "Salva" })),
  }
}

describe("NewCustomerPage", () => {
  it("salva il cliente con il reddito al punto decimale, e apre la sua scheda", async () => {
    const page = setup(fakeCustomers({ customers: [] }))
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled()

    await page.type("Nome", "Luca")
    await page.type("Cognome", "Bianchi")
    await page.type("Codice Fiscale", "BNCLCU80A01H501U")
    await page.type("Sede", "Roma")
    await page.type("Codice Cliente (NDG)", "NDG-9")
    await page.type("Reddito", "1000,50")
    await page.pickSource("passaparola")
    await page.save()

    await screen.findByText("altra pagina")
    const [saved] = page.backend.state.inserted
    expect(saved).toMatchObject({
      name: "Luca",
      surname: "Bianchi",
      fiscalCode: "BNCLCU80A01H501U",
      sede: "Roma",
      tempID: "NDG-9",
      reddito: "1000.50",
      source: "passaparola",
      fileName: "Nessuno",
    })
    expect(saved!.id).toHaveLength(21)
    expect(saved!.uniqueHash).toHaveLength(21)
    expect(window.location.pathname).toBe(`/dashboard/customers/${saved!.id}`)
  })

  it("senza sede e provenienza non salva", async () => {
    const page = setup()

    await page.type("Nome", "Luca")
    await page.save()

    expect(await screen.findAllByText("Required")).toHaveLength(3)
    expect(page.backend.state.inserted).toEqual([])
  })

  it("senza codice fiscale né partita IVA lo dice sotto tutti e due, e non salva", async () => {
    const page = setup()

    await page.type("Sede", "Roma")
    await page.type("Codice Cliente (NDG)", "NDG-9")
    await page.pickSource("inbound")
    await page.save()

    expect(
      await screen.findAllByText(
        "Uno tra Partita Iva e Codice Fiscale è obbligatorio"
      )
    ).toHaveLength(2)
    expect(page.backend.state.inserted).toEqual([])
  })

  it("un codice fiscale corto o un reddito che non è un numero hanno il loro messaggio", async () => {
    const page = setup()

    await page.type("Codice Fiscale", "ABC")
    await page.type("Reddito", "mille")
    await page.save()

    expect(await screen.findByText("Almeno 16 caratteri")).toBeTruthy()
    expect(
      screen.getByText("Il reddito deve essere un numero valido")
    ).toBeTruthy()
    expect(page.backend.state.inserted).toEqual([])
  })

  it("un codice già di un cliente dice 'Cliente già esistente' e non salva", async () => {
    const page = setup(
      fakeCustomers({
        customers: [customerOf({ fiscalCode: "BNCLCU80A01H501U" })],
      })
    )

    await page.type("Codice Fiscale", "BNCLCU80A01H501U")
    await page.type("Sede", "Roma")
    await page.type("Codice Cliente (NDG)", "NDG-9")
    await page.pickSource("inbound")
    await page.save()

    expect(await screen.findByText("Cliente già esistente")).toBeTruthy()
    expect(page.backend.state.inserted).toEqual([])
  })

  it("se il backend non salva il toast dice il motivo e il modulo resta", async () => {
    const backend = fakeCustomers({ customers: [] })
    backend.state.insertFails = true
    const page = setup(backend)

    await page.type("Codice Fiscale", "BNCLCU80A01H501U")
    await page.type("Sede", "Roma")
    await page.type("Codice Cliente (NDG)", "NDG-9")
    await page.pickSource("inbound")
    await page.save()

    expect(
      await screen.findByText("Il servizio non risponde, riprova tra poco")
    ).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Salva" })).toBeEnabled()
    )
    expect(window.location.pathname).toBe(ROUTE)
  })
})

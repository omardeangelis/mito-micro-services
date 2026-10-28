import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { PracticeExists } from "@mito/contract/errors"
import { customerOf, fakeCustomers } from "@/test/customers"
import { Component as ConnectCustomerPage } from "../ConnectCustomerPage"
import { renderCustomers } from "./page"

// "Aggiungi Pratica" (`customers/[id]/connect` of the Next.js app) on a
// backend in memory: the practice of the customer, the customers it adds,
// the checks of the two forms and the errors of the backend

const PATH = "/dashboard/customers/customer-1/connect"

const setup = async (backend = fakeCustomers()) => {
  const user = userEvent.setup()
  renderCustomers(PATH, backend, {
    ui: <ConnectCustomerPage />,
    route: "/dashboard/customers/:id/connect",
  })
  // The form waits for the sedi and the regions
  await screen.findByRole("button", { name: "Aggiungi Pratica" })
  const pick = async (name: string, option: string) => {
    await user.click(screen.getByRole("combobox", { name }))
    await user.click(await screen.findByRole("option", { name: option }))
  }
  return {
    user,
    backend,
    type: (label: string, text: string) =>
      user.type(screen.getByLabelText(label), text),
    pick,
    /** The practice with what the backend requires */
    fillPractice: async () => {
      await user.type(screen.getByLabelText("ID Pratica"), "P-9")
      await pick("Tipo di Prodotto", "PRESTITO PERSONALE")
      await pick("Stato", "Liquidata")
      await user.type(screen.getByLabelText("Importo Finanziato"), "10000")
      await user.type(screen.getByLabelText("Importo Erogato"), "9500")
      await user.type(screen.getByLabelText("Importo Rata"), "250.5")
      await user.type(screen.getByLabelText("Rate Totali"), "48")
      await user.type(screen.getByLabelText("Importo Richiesto"), "10000")
    },
    submit: () =>
      user.click(screen.getByRole("button", { name: "Aggiungi Pratica" })),
  }
}

/** The form of the `index`-th customer added to the practice */
const relatedForm = (index = 0) =>
  screen
    .getAllByRole("heading", { name: "Aggiungi Cliente" })
    [index]!.closest("form")!

describe("ConnectCustomerPage, la pratica", () => {
  it("salva la pratica del cliente con il codice del prodotto e le rate, e torna alla scheda", async () => {
    const page = await setup()

    await page.fillPractice()
    await page.pick("Punto Vendita", "Milano")
    await page.pick("Regione", "Lombardia")
    await page.submit()

    await screen.findByText("altra pagina")
    expect(window.location.pathname).toBe("/dashboard/customers/customer-1")
    expect(page.backend.state.createdPratiche).toHaveLength(1)
    const [created] = page.backend.state.createdPratiche
    expect(created).toMatchObject({
      customerId: "customer-1",
      relatedCustomers: [],
      pratica: {
        praticaId: "P-9",
        productId: "01",
        state: "Liquidata",
        importoFinanziato: "10000",
        importoErogato: "9500",
        importoRata: "250.5",
        importoRichiesto: "10000",
        rateTotali: 48,
        ratePagate: 0,
        desPuntoVendita: "Milano",
        region: "Lombardia",
      },
    })
    expect(created!.pratica.dataLiquidazione).toBeInstanceOf(Date)
  })

  it("senza i campi obbligatori non salva", async () => {
    const page = await setup()

    await page.type("ID Pratica", "P-9")
    await page.submit()

    // Product, state, the three amounts, the instalment and the total
    expect(await screen.findAllByText("Required")).toHaveLength(7)
    expect(page.backend.state.createdPratiche).toEqual([])
  })

  it("se la pratica esiste già lo dice sotto l'ID, senza toast, e resta", async () => {
    const backend = fakeCustomers()
    backend.state.createPraticaError = new PracticeExists()
    const page = await setup(backend)

    await page.fillPractice()
    await page.submit()

    expect(
      await screen.findAllByText("Questa pratica esiste già")
    ).toHaveLength(1)
    expect(window.location.pathname).toBe(PATH)
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Aggiungi Pratica" })
      ).toBeEnabled()
    )
  })
})

describe("ConnectCustomerPage, i clienti aggiunti", () => {
  const fillCustomer = async (
    user: ReturnType<typeof userEvent.setup>,
    form: HTMLElement,
    fiscalCode: string
  ) => {
    const field = (label: string) => within(form).getByLabelText(label)
    await user.type(field("Nome"), "Luca")
    await user.type(field("Email"), "luca@example.com")
    await user.type(field("Codice Fiscale"), fiscalCode)
    await user.type(field("Codice Cliente (NDG)"), `NDG-${fiscalCode}`)
    await user.click(within(form).getByRole("combobox", { name: "Ruolo" }))
    await user.click(await screen.findByRole("option", { name: "Coobbligato" }))
  }

  it("un cliente salvato va con la pratica, spontaneo e con il suo ruolo", async () => {
    const page = await setup()

    await page.user.click(screen.getByRole("button", { name: "Nuovo Cliente" }))
    await fillCustomer(page.user, relatedForm(), "BNCLCU80A01H501U")
    await page.user.click(
      within(relatedForm()).getByRole("button", { name: "Salva" })
    )
    expect(await screen.findByText("BNCLCU80A01H501U")).toBeTruthy()
    await page.fillPractice()
    await page.submit()

    await screen.findByText("altra pagina")
    const [{ relatedCustomers }] = page.backend.state.createdPratiche as [
      (typeof page.backend.state.createdPratiche)[number],
    ]
    expect(relatedCustomers).toHaveLength(1)
    expect(relatedCustomers[0]).toMatchObject({
      name: "Luca",
      email: "luca@example.com",
      fiscalCode: "BNCLCU80A01H501U",
      tempID: "NDG-BNCLCU80A01H501U",
      role: "Coobbligato",
      source: "spontaneo",
    })
    expect(relatedCustomers[0]!.uniqueHash).toHaveLength(21)
  })

  it("un cliente con un codice già usato dice 'Cliente già presente'", async () => {
    const page = await setup(
      fakeCustomers({
        customers: [customerOf({ fiscalCode: "BNCLCU80A01H501U" })],
      })
    )

    await page.user.click(screen.getByRole("button", { name: "Nuovo Cliente" }))
    await fillCustomer(page.user, relatedForm(), "BNCLCU80A01H501U")
    await page.user.click(
      within(relatedForm()).getByRole("button", { name: "Salva" })
    )

    expect(await screen.findAllByText("Cliente già presente")).toHaveLength(3)
  })

  it("senza codice fiscale né partita IVA il cliente non si salva", async () => {
    const page = await setup()

    await page.user.click(screen.getByRole("button", { name: "Nuovo Cliente" }))
    const form = relatedForm()
    await page.user.type(within(form).getByLabelText("Email"), "luca@x.it")
    await page.user.type(
      within(form).getByLabelText("Codice Cliente (NDG)"),
      "NDG-1"
    )
    await page.user.click(within(form).getByRole("combobox", { name: "Ruolo" }))
    await page.user.click(
      await screen.findByRole("option", { name: "Garante" })
    )
    await page.user.click(within(form).getByRole("button", { name: "Salva" }))

    expect(
      await screen.findAllByText(
        "Uno tra Partita Iva e Codice Fiscale è obbligatorio"
      )
    ).toHaveLength(2)
  })

  it("un cliente aggiunto e non salvato ferma la pratica", async () => {
    const page = await setup()

    await page.user.click(screen.getByRole("button", { name: "Nuovo Cliente" }))
    await page.fillPractice()
    await page.submit()

    expect(
      await screen.findByText("Salva o rimuovi i clienti aggiunti")
    ).toBeTruthy()
    expect(page.backend.state.createdPratiche).toEqual([])
  })

  it("'Rimuovi' toglie il suo cliente, non quello dopo", async () => {
    const page = await setup()
    const add = screen.getByRole("button", { name: "Nuovo Cliente" })

    await page.user.click(add)
    await page.user.click(add)
    await page.user.type(within(relatedForm(1)).getByLabelText("Nome"), "Anna")
    await page.user.click(
      within(relatedForm(0)).getByRole("button", { name: "Rimuovi" })
    )

    expect(
      screen.getAllByRole("heading", { name: "Aggiungi Cliente" })
    ).toHaveLength(1)
    expect(within(relatedForm()).getByLabelText("Nome")).toHaveValue("Anna")
  })
})

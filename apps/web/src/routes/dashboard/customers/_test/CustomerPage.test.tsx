import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { type Role } from "@mito/contract/schemas"
import { ContactForbidden } from "@mito/contract/errors"
import { ada } from "@/test/api"
import {
  contactDetailOf,
  customerOf,
  fakeCustomers,
  operatorWithRole,
  taskOf,
} from "@/test/customers"
import { Component as CustomerPage } from "../CustomerPage"
import { renderCustomers } from "./page"

// The customer sheet on a backend in memory, as the tests of
// `customers/[id]` of the Next.js app: the master data, the active contact,
// "Crea contatto", the handover, "Assegna a te" and the practices

const PATH = "/dashboard/customers/customer-1"

const operators = [
  operatorWithRole(ada.id, "Ada", "Lovelace"),
  operatorWithRole(1, "Anna", "Verdi"),
]

const backendWith = (
  initial: Parameters<typeof fakeCustomers>[0] = {}
): ReturnType<typeof fakeCustomers> => fakeCustomers({ operators, ...initial })

/** The customer with an active contact of Ada, in `state` */
const withContact = (state: "chiamare" | "caricato" = "chiamare") => {
  const customer = customerOf()
  const task = taskOf({ state })
  return backendWith({
    customers: [customer],
    tasks: [task],
    contacts: {
      [String(task.id)]: contactDetailOf(task, customer, {
        id: ada.id,
        name: "Ada",
        surname: "Lovelace",
      }),
    },
  })
}

const open = async (backend = backendWith(), role: Role = "ADMIN") => {
  const user = userEvent.setup()
  renderCustomers(PATH, backend, {
    ui: <CustomerPage />,
    route: "/dashboard/customers/:id",
    role,
  })
  // The form waits for the operators
  await screen.findByRole("button", { name: "Salva" })
  return { user, backend }
}

/**
 * The input of a field of the master data: most of them have no
 * `FormControl`, so their label names no input, as in the Next.js app
 */
const fieldOf = (label: string) =>
  within(
    screen
      .getAllByText(label, { selector: "label" })
      // The id of the customer is a hidden field labelled "Nome"
      .find((element) => element.closest("[hidden]") === null)!
      .closest<HTMLElement>('[data-slot="form-item"]')!
  ).getByRole("textbox")

describe("CustomerPage, la scheda", () => {
  it("mostra l'anagrafica, l'operatore e le pratiche del cliente", async () => {
    await open()

    expect(fieldOf("Nome")).toHaveValue("Mario")
    expect(fieldOf("Email")).toHaveValue("mario@example.com")
    expect(
      screen.getByRole("paragraph", { name: "Operatore" })
    ).toHaveTextContent("Ada Lovelace")
    expect(
      await screen.findByText("Il Cliente non ha ancora nessuna pratica")
    ).toBeTruthy()
    // No active contact: the practice waits for one in caricato or erogata
    expect(
      screen.getByRole("button", { name: "Aggiungi Pratica" })
    ).toBeDisabled()
  })

  it("un cliente che non esiste dà l'errore della rotta", async () => {
    renderCustomers(PATH, backendWith({ customers: [] }), {
      ui: <CustomerPage />,
      route: "/dashboard/customers/:id",
    })

    expect(await screen.findByText("errore della rotta")).toBeTruthy()
  })

  it("le pratiche del cliente aprono la loro pagina", async () => {
    const { user } = await open(
      backendWith({
        practices: {
          "customer-1": [
            {
              id: 1001,
              praticaId: "P-1",
              productId: "01",
              state: "Liquidata",
              dataLiquidazione: new Date("2026-03-01T10:00:00Z"),
              customerRole: "Intestatario",
            },
          ],
        },
      })
    )

    await user.click(await screen.findByText("P-1"))

    expect(await screen.findByText("altra pagina")).toBeTruthy()
    expect(window.location.pathname).toBe("/dashboard/pratiche/P-1")
  })

  it("chiudere la scheda senza una pagina prima porta alla lista", async () => {
    const { user } = await open()

    await user.keyboard("{Escape}")

    expect(await screen.findByText("altra pagina")).toBeTruthy()
    expect(window.location.pathname).toBe("/dashboard/customers")
  })
})

describe("CustomerPage, il contatto attivo", () => {
  it("mostra il riepilogo del contatto, con il link per gestirlo", async () => {
    await open(withContact("caricato"))

    const link = await screen.findByRole("link", { name: "Gestisci contatto" })
    expect(link.getAttribute("href")).toContain("/dashboard/contatti/1000")
    expect(screen.queryByRole("button", { name: "Crea contatto" })).toBeNull()
    // A contact in caricato lets the practice in
    expect(
      await screen.findByRole("button", { name: "Aggiungi Pratica" })
    ).toBeEnabled()
  })

  it("'Crea contatto' crea il contatto e al suo posto mostra il riepilogo", async () => {
    const { user, backend } = await open()

    await user.click(screen.getByRole("button", { name: "Crea contatto" }))

    expect(
      await screen.findByRole("link", { name: "Gestisci contatto" })
    ).toBeTruthy()
    expect(backend.state.createdContacts).toEqual([
      { customerId: "customer-1", source: "detail" },
    ])
    expect(screen.queryByRole("button", { name: "Crea contatto" })).toBeNull()
  })

  it("se il backend rifiuta 'Crea contatto' il toast dice perché", async () => {
    const backend = backendWith()
    backend.state.createContactError = new ContactForbidden({
      assignee: "Anna Verdi",
    })
    const { user } = await open(backend, "OPERATORE")

    await user.click(screen.getByRole("button", { name: "Crea contatto" }))

    expect(
      await screen.findByText(
        "Non puoi modificare questo contatto: è assegnato a Anna Verdi"
      )
    ).toBeTruthy()
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Crea contatto" })
      ).not.toHaveAttribute("aria-busy", "true")
    )
  })

  it("'Crea contatto' non c'è per l'operatore di un cliente non suo", async () => {
    await open(
      backendWith({ customers: [customerOf({ operatorId: 1 })] }),
      "OPERATORE"
    )

    expect(screen.queryByRole("button", { name: "Crea contatto" })).toBeNull()
  })
})

describe("CustomerPage, l'anagrafica", () => {
  it("salva l'anagrafica cambiata: i campi vuoti restano, il toast lo conferma", async () => {
    const { user, backend } = await open()
    const save = screen.getByRole("button", { name: "Salva" })
    expect(save).toBeDisabled()

    await user.clear(fieldOf("Email"))
    await user.type(fieldOf("Email"), "rossi@example.com")
    await user.type(screen.getByLabelText("Reddito"), "25000,5")
    await user.click(save)

    expect(
      await screen.findByText("Cliente aggiornato con successo")
    ).toBeTruthy()
    expect(backend.state.updated).toHaveLength(1)
    const [{ id, profile }] = backend.state.updated as [
      (typeof backend.state.updated)[number],
    ]
    expect(id).toBe("customer-1")
    expect(profile).toMatchObject({
      name: "Mario",
      email: "rossi@example.com",
      reddito: "25000.5",
      source: "inbound",
      birthdayDate: null,
    })
    // The empty fields keep their value, as `cleanObject` did
    expect(profile).not.toHaveProperty("address")
    await waitFor(() => expect(save).toBeDisabled())
  })

  it("un reddito che non è un numero non si salva", async () => {
    const { user, backend } = await open()

    await user.type(screen.getByLabelText("Reddito"), "tanti")
    await user.click(screen.getByRole("button", { name: "Salva" }))

    expect(
      await screen.findByText("Il reddito deve essere un numero valido")
    ).toBeTruthy()
    expect(backend.state.updated).toEqual([])
  })
})

describe("CustomerPage, l'operatore del cliente", () => {
  it("il passaggio di consegne passa il cliente e il contatto al nuovo operatore", async () => {
    const { user, backend } = await open(withContact())

    await user.click(
      screen.getByRole("button", { name: "Passaggio di consegne" })
    )
    const dialog = await screen.findByRole("dialog", {
      name: "Passaggio di consegne",
    })
    expect(dialog).toHaveTextContent("Anche il contatto attivo (chiamare")
    await user.click(
      within(dialog).getByRole("combobox", { name: "Nuovo operatore" })
    )
    await user.click(await screen.findByRole("option", { name: "Anna Verdi" }))
    await user.click(
      within(dialog).getByRole("button", { name: "Passa le consegne" })
    )

    await waitFor(() =>
      expect(
        screen.getByRole("paragraph", { name: "Operatore" })
      ).toHaveTextContent("Anna Verdi")
    )
    expect(backend.state.handovers).toEqual([
      { id: "customer-1", toOperatorId: 1 },
    ])
  })

  it("'Assegna a te' prende un cliente senza operatore", async () => {
    const { user, backend } = await open(
      backendWith({ customers: [customerOf({ operatorId: null })] }),
      "OPERATORE"
    )
    expect(
      screen.getByRole("paragraph", { name: "Operatore" })
    ).toHaveTextContent("Non assegnato")

    await user.click(screen.getByRole("button", { name: "Assegna a te" }))

    await waitFor(() =>
      expect(
        screen.getByRole("paragraph", { name: "Operatore" })
      ).toHaveTextContent("Ada Lovelace")
    )
    expect(backend.state.selfAssigned).toEqual(["customer-1"])
    expect(screen.queryByRole("button", { name: "Assegna a te" })).toBeNull()
  })
})

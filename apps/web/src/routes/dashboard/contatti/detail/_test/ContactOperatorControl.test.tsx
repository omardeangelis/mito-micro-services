import { screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { ContactForbidden, OperatorNotFound } from "@mito/contract/errors"
import {
  activeOperator,
  contactDetail,
  fakeContacts,
  superseded,
} from "@/test/contacts"
import { detailHrefFromDa } from "../../_lib/detailHrefFromDa"
import { DA, holdWrites, lastAlert, openDetail, toastLink } from "./detail"

// The operator of the contact in the detail, for an administrator, as the
// tests of `ContactOperatorControl` of the Next.js app, on the page with a
// backend in memory

const operators = [
  activeOperator({ id: 7, name: "Mario", surname: "Rossi" }),
  activeOperator({ id: 9, name: "Giulia", surname: "Bianchi" }),
  activeOperator({ id: 12, name: "Anna", surname: "Verdi" }),
]

const names = {
  7: { id: 7, name: "Mario", surname: "Rossi" },
  9: { id: 9, name: "Giulia", surname: "Bianchi" },
} as const

/** The detail, for the admin, of the contact of `operatorId` */
const setup = (operatorId: 7 | 9 | null) => {
  const detail = contactDetail({
    contact: { operator: operatorId === null ? null : names[operatorId] },
    canReassign: true,
  })
  return openDetail([detail], {
    role: "ADMIN",
    backend: fakeContacts({ details: { 101: detail }, operators }),
  })
}

const select = () => screen.getByRole("combobox", { name: "Cambia operatore" })

beforeEach(() => {
  sessionStorage.clear()
})

describe("l'operatore del contatto, per l'amministratore (AC47, AC50)", () => {
  it("mostra l'operatore attuale", async () => {
    await setup(9)

    expect(select().textContent).toContain("Giulia Bianchi")
  })

  it("senza operatore dice 'Non assegnato'", async () => {
    await setup(null)

    expect(select().textContent).toContain("Non assegnato")
  })

  it("offre gli operatori, senza 'Non assegnato'", async () => {
    const { user } = await setup(9)

    await user.click(select())

    expect(
      screen.getAllByRole("option").map((option) => option.textContent)
    ).toEqual(["Anna Verdi", "Giulia Bianchi", "Mario Rossi"])
  })

  it("per chi non è amministratore è un testo, e gli operatori non si leggono", async () => {
    const detail = contactDetail({ contact: { operator: names[9] } })
    const backend = fakeContacts({ details: { 101: detail }, operators })
    // Nobody but the admin pays the query: a failing one would show
    backend.state.failingOperators = true

    await openDetail([detail], { backend })

    expect(
      screen.queryByRole("combobox", { name: "Cambia operatore" })
    ).toBeNull()
    expect(screen.getByText("Giulia Bianchi")).toBeTruthy()
  })

  it("sceglierne un altro lo salva e mostra il valore salvato finché non arriva il nuovo", async () => {
    const { user, backend } = await setup(9)
    const open = holdWrites(backend)
    await user.click(select())

    await user.click(screen.getByRole("option", { name: "Anna Verdi" }))

    await waitFor(() =>
      expect(select().getAttribute("aria-disabled")).toBe("true")
    )
    expect(select().textContent).toContain("Giulia Bianchi")
    open()
    await waitFor(() => expect(select().textContent).toContain("Anna Verdi"))
    expect(backend.state.reassigns).toEqual([{ taskId: 101, operatorId: 12 }])
  })

  it("il rifiuto del server: toast con il motivo, lo stesso testo dentro la finestra e l'operatore salvato resta", async () => {
    const { user, backend } = await setup(9)
    backend.state.reassignAnswer = () => ({
      rejected: new ContactForbidden({ assignee: null }),
    })
    await user.click(select())

    await user.click(screen.getByRole("option", { name: "Mario Rossi" }))

    const reason = "Non puoi modificare questo contatto: non è assegnato"
    await waitFor(() => expect(lastAlert()).toBe(reason))
    expect(screen.getAllByText(reason)).toHaveLength(2)
    await waitFor(() =>
      expect(select().getAttribute("aria-disabled")).not.toBe("true")
    )
    expect(select().textContent).toContain("Giulia Bianchi")
  })

  it("un operatore che il server non conosce è 'Operatore non valido'", async () => {
    const { user, backend } = await setup(9)
    backend.state.reassignAnswer = () => ({
      rejected: new OperatorNotFound(),
    })
    await user.click(select())

    await user.click(screen.getByRole("option", { name: "Mario Rossi" }))

    await waitFor(() => expect(lastAlert()).toBe("Operatore non valido"))
  })

  it("contatto sostituito nel frattempo: il toast offre il contatto attivo, con la vista della lista (AC52)", async () => {
    const { user, backend } = await setup(9)
    backend.state.reassignAnswer = () => ({ rejected: superseded(303) })
    await user.click(select())

    await user.click(screen.getByRole("option", { name: "Mario Rossi" }))

    await waitFor(() =>
      expect(lastAlert()).toBe(
        "Questo contatto è stato sostituito da uno più recente"
      )
    )
    expect(toastLink("Vai al contatto attivo").getAttribute("href")).toBe(
      detailHrefFromDa(303, DA)
    )
  })
})

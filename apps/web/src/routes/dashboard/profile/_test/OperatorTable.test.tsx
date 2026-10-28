import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { LastAdmin, OperatorNotFound } from "@mito/contract/errors"
import { ada } from "@/test/api"
import { fakeProfile, operatorRow } from "@/test/profile"
import { renderProfile } from "./page"

// Il tab Admin: ruoli (AC20a) e azione "Disattiva" per riga (AC21), come
// i test di OperatorTable del Next.js app

const anna = operatorRow(1, "Anna", "ADMIN")
const bruno = operatorRow(2, "Bruno", "OPERATORE")
const carla = operatorRow(3, "Carla", "OPERATORE")

type User = ReturnType<typeof userEvent.setup>

/** The admin tab, signed in as the operator `me` of the table */
const openAdmin = async (me: number, operators = [anna, bruno, carla]) => {
  const backend = fakeProfile({
    me: { ...ada, id: me },
    operators,
  })
  const page = renderProfile(backend, { path: "/dashboard/profile?tab=admin" })
  await screen.findByRole("heading", { name: "Gestisci operatori" })
  return { backend, ...page }
}

const roleSelects = () => screen.getAllByRole("combobox")
const saveButton = () => screen.getByRole("button", { name: "Salva" })

/** The role of the `index`th row */
const chooseRole = async (user: User, index: number, role: string) => {
  await user.click(roleSelects()[index]!)
  await user.click(await screen.findByRole("option", { name: role }))
}

const changeRoleAndSave = async (user: User) => {
  // Row of Anna: ADMIN -> OPERATORE
  await chooseRole(user, 0, "Operatore")
  await user.click(saveButton())
}

const deactivateBruno = async (user: User) => {
  await user.click(screen.getByRole("button", { name: "Disattiva Bruno Test" }))
  const dialog = await screen.findByRole("dialog")
  await within(dialog).findByText("3 clienti")
  await user.click(screen.getByRole("combobox", { name: "Passa a" }))
  await user.click(await screen.findByRole("option", { name: "Carla Test" }))
  await user.click(screen.getByRole("button", { name: "Conferma" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
}

describe("il tab Admin", () => {
  it("mostra nome, cognome e ruolo di ogni operatore", async () => {
    await openAdmin(3)

    const rows = screen.getAllByRole("row").slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      "AnnaTestadmin",
      "BrunoTestoperatoreDisattiva",
      "CarlaTestoperatore",
    ])
  })

  it("senza operatori lo dice", async () => {
    await openAdmin(3, [])

    expect(screen.getByText("No results.")).toBeInTheDocument()
  })

  it("mostra Disattiva solo sulle righe OPERATORE diverse dall'utente corrente", async () => {
    await openAdmin(3)

    expect(
      screen.getByRole("button", { name: "Disattiva Bruno Test" })
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Disattiva Anna Test" })).toBe(
      null
    )
    expect(screen.queryByRole("button", { name: "Disattiva Carla Test" })).toBe(
      null
    )
  })

  it("con LastAdmin mostra l'errore e non il toast di successo", async () => {
    const user = userEvent.setup()
    const { backend } = await openAdmin(3)
    backend.state.roleRejected = new LastAdmin()

    await changeRoleAndSave(user)

    expect(
      await screen.findByText("Deve restare almeno un admin")
    ).toBeInTheDocument()
    expect(screen.queryByText("Ruoli aggiornati")).toBeNull()
    // The edits stay, so the admin can retry
    expect(roleSelects()[0]).toHaveTextContent("Operatore")
    expect(saveButton()).toBeEnabled()
  })

  it("con OperatorNotFound mostra il suo messaggio", async () => {
    const user = userEvent.setup()
    const { backend } = await openAdmin(3)
    backend.state.roleRejected = new OperatorNotFound()

    await changeRoleAndSave(user)

    expect(await screen.findByText("Operatore non trovato")).toBeInTheDocument()
  })

  it("se il backend non risponde mostra il titolo generico e Salva torna attivo", async () => {
    const user = userEvent.setup()
    const { backend } = await openAdmin(3)
    backend.state.failingRoles = true

    await changeRoleAndSave(user)

    expect(
      await screen.findByText("Errore durante l'aggiornamento dei ruoli")
    ).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it("con successo manda i ruoli, mostra Ruoli aggiornati e la tabella i ruoli nuovi", async () => {
    const user = userEvent.setup()
    const { backend } = await openAdmin(3)

    await chooseRole(user, 1, "Admin")
    await changeRoleAndSave(user)

    expect(await screen.findByText("Ruoli aggiornati")).toBeInTheDocument()
    expect(backend.state.roleUpdates).toEqual([
      [
        { id: 2, role: "ADMIN" },
        { id: 1, role: "OPERATORE" },
      ],
    ])
    // The operators read again, with no edit left
    expect(roleSelects()[0]).toHaveTextContent("operatore")
    expect(roleSelects()[1]).toHaveTextContent("admin")
    expect(saveButton()).toBeDisabled()
    // Bruno is an admin now: he can't be deactivated
    expect(screen.queryByRole("button", { name: "Disattiva Bruno Test" })).toBe(
      null
    )
  })

  it("scegliere due volte il ruolo di una riga manda l'ultimo", async () => {
    const user = userEvent.setup()
    const { backend } = await openAdmin(3)

    await chooseRole(user, 1, "Admin")
    await chooseRole(user, 1, "Operatore")
    await user.click(saveButton())

    await screen.findByText("Ruoli aggiornati")
    expect(backend.state.roleUpdates).toEqual([[{ id: 2, role: "OPERATORE" }]])
  })

  it("disattivare un operatore toglie la sua modifica di ruolo in sospeso", async () => {
    const user = userEvent.setup()
    const { backend } = await openAdmin(1)
    // Row of Bruno: OPERATORE -> ADMIN, not saved
    await chooseRole(user, 1, "Admin")

    await deactivateBruno(user)

    expect(backend.state.deactivations).toEqual([
      { operatorId: 2, toOperatorId: 3 },
    ])
    await waitFor(() => expect(roleSelects()).toHaveLength(2))
    expect(saveButton()).toBeDisabled()
  })

  it("dopo una disattivazione il focus va al titolo e la riga sparisce", async () => {
    const user = userEvent.setup()
    await openAdmin(1)

    await deactivateBruno(user)

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Gestisci operatori" })
      )
    )
    await waitFor(() =>
      expect(screen.queryByRole("cell", { name: "Bruno" })).toBeNull()
    )
    expect(
      await screen.findByText(
        "Operatore disattivato: 3 clienti, 2 contatti, 1 pratica passati a Carla Test"
      )
    ).toBeInTheDocument()
  })

  it("quando una riga sparisce la modifica in sospeso non passa alla riga dopo", async () => {
    const user = userEvent.setup()
    const { backend, queryClient } = await openAdmin(1)
    // Row of Bruno: OPERATORE -> ADMIN, not saved
    await chooseRole(user, 1, "Admin")

    // Bruno deactivated elsewhere: the operators come back without his row
    backend.state.operators = [anna, carla]
    await queryClient.invalidateQueries({ queryKey: ["operator"] })

    await waitFor(() => expect(roleSelects()).toHaveLength(2))
    // The row of Carla shows her role, not Bruno's pending one
    expect(roleSelects()[1]!.textContent).toBe("operatore")
  })

  it("disattivare un operatore lascia le modifiche in sospeso degli altri", async () => {
    const user = userEvent.setup()
    const { backend } = await openAdmin(1)
    // Carla and Bruno: OPERATORE -> ADMIN, not saved
    await chooseRole(user, 2, "Admin")
    await chooseRole(user, 1, "Admin")

    await deactivateBruno(user)
    await waitFor(() => expect(roleSelects()).toHaveLength(2))
    await user.click(saveButton())

    await screen.findByText("Ruoli aggiornati")
    expect(backend.state.roleUpdates).toEqual([[{ id: 3, role: "ADMIN" }]])
  })

  it("con la sola modifica di una riga sparita Salva resta spento", async () => {
    const user = userEvent.setup()
    const { backend, queryClient } = await openAdmin(1)
    await chooseRole(user, 1, "Admin")

    backend.state.operators = [anna, carla]
    await queryClient.invalidateQueries({ queryKey: ["operator"] })

    await waitFor(() => expect(roleSelects()).toHaveLength(2))
    expect(saveButton()).toBeDisabled()
  })

  it("una modifica di una riga sparita non torna quando la riga ricompare", async () => {
    const user = userEvent.setup()
    const { backend, queryClient } = await openAdmin(1)
    await chooseRole(user, 1, "Admin")

    // Bruno deactivated elsewhere, then re-enabled by hand
    backend.state.operators = [anna, carla]
    await queryClient.invalidateQueries({ queryKey: ["operator"] })
    await waitFor(() => expect(roleSelects()).toHaveLength(2))
    backend.state.operators = [anna, bruno, carla]
    await queryClient.invalidateQueries({ queryKey: ["operator"] })
    await waitFor(() => expect(roleSelects()).toHaveLength(3))

    expect(roleSelects()[1]!.textContent).toBe("operatore")
    expect(saveButton()).toBeDisabled()
  })

  it("se gli operatori non arrivano va all'errore della rotta", async () => {
    const backend = fakeProfile({ operators: [anna] })
    backend.state.failingOperators = true
    renderProfile(backend, { path: "/dashboard/profile?tab=admin" })

    expect(await screen.findByText("errore della rotta")).toBeInTheDocument()
  })
})

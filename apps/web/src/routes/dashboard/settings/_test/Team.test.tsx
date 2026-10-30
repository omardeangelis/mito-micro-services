import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { LastAdmin, OperatorNotFound } from "@mito/contract/errors"
import { ada } from "@/test/api"
import { fakeProfile, operatorRow } from "@/test/profile"
import { renderSettings } from "./page"

// Le pagine Team e del singolo membro: la lista, il ruolo (AC20a), il
// portafoglio e quando si può disattivare (AC21)

const anna = operatorRow(1, "Anna", "ADMIN")
const bruno = operatorRow(2, "Bruno", "OPERATORE")
const me = { ...operatorRow(9, "Ada", "ADMIN"), surname: "Lovelace" }

type User = ReturnType<typeof userEvent.setup>

const backendOf = () =>
  fakeProfile({ me: { ...ada, id: 9 }, operators: [anna, bruno, me] })

const openMember = async (id: number, backend = backendOf()) => {
  const page = renderSettings(backend, `/dashboard/settings/team/${id}`)
  await screen.findByRole("heading", { level: 1, name: /Test|Lovelace/ })
  return { backend, ...page }
}

const pickRole = async (user: User, role: string) => {
  await user.click(screen.getByRole("combobox", { name: "Ruolo" }))
  await user.click(await screen.findByRole("option", { name: role }))
}

const save = () => screen.getByRole("button", { name: "Salva" })

describe("la pagina Team", () => {
  it("mostra ogni membro con email e ruolo, e chi sei tu", async () => {
    renderSettings(backendOf(), "/dashboard/settings/team")

    const list = await screen.findByRole("list", { name: "Membri del team" })
    const rows = within(list).getAllByRole("link")
    expect(rows.map((row) => row.textContent)).toEqual([
      "Anna Testuser-1@mito.testAdmin",
      "Bruno Testuser-2@mito.testOperatore",
      "Ada Lovelace (tu)user-9@mito.testAdmin",
    ])
    expect(screen.getByText("3 membri")).toBeInTheDocument()
  })

  it("un membro apre la sua pagina", async () => {
    const user = userEvent.setup()
    const { router } = renderSettings(backendOf(), "/dashboard/settings/team")

    await user.click(await screen.findByRole("link", { name: /Bruno Test/ }))

    expect(
      await screen.findByRole("heading", { level: 1, name: "Bruno Test" })
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/dashboard/settings/team/2")
  })

  it("un operatore va al suo profilo", async () => {
    const { router } = renderSettings(
      fakeProfile({ role: "OPERATORE" }),
      "/dashboard/settings/team"
    )

    expect(
      await screen.findByRole("heading", { name: "Profilo" })
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/dashboard/settings/profile")
  })

  it("se la lista non arriva va all'errore della rotta", async () => {
    const backend = backendOf()
    backend.state.failingOperators = true
    renderSettings(backend, "/dashboard/settings/team")

    expect(await screen.findByText("errore della rotta")).toBeInTheDocument()
  })
})

describe("la pagina del membro", () => {
  it("mostra email, ruolo, portafoglio e Disattiva per un operatore", async () => {
    await openMember(2)

    expect(screen.getByText("user-2@mito.test")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Ruolo" })).toHaveTextContent(
      "Operatore"
    )
    await screen.findByText("Clienti")
    expect(screen.getByText("Clienti").nextSibling).toHaveTextContent("3")
    expect(screen.getByText("Contatti attivi").nextSibling).toHaveTextContent(
      "2"
    )
    expect(screen.getByText("Pratiche").nextSibling).toHaveTextContent("1")
    expect(
      screen.getByRole("button", { name: "Disattiva Bruno Test" })
    ).toBeInTheDocument()
  })

  it("un admin non si disattiva: lo spiega", async () => {
    await openMember(1)

    expect(
      screen.getByText(/Un admin non si può disattivare/)
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Disattiva/ })).toBeNull()
  })

  it("non si disattiva se stessi", async () => {
    await openMember(9)

    expect(
      screen.getByText("Non puoi disattivare te stesso.")
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Disattiva/ })).toBeNull()
  })

  it("un id che non è nel team dice che il membro non c'è", async () => {
    renderSettings(backendOf(), "/dashboard/settings/team/42")

    expect(
      await screen.findByRole("heading", { name: "Membro non trovato" })
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Team" })).toHaveAttribute(
      "href",
      "/dashboard/settings/team"
    )
  })

  it("Salva è spento finché il ruolo non cambia, poi lo salva", async () => {
    const user = userEvent.setup()
    const { backend } = await openMember(2)
    expect(save()).toBeDisabled()

    await pickRole(user, "Admin")
    await user.click(save())

    expect(await screen.findByText("Ruolo aggiornato")).toBeInTheDocument()
    expect(backend.state.roleUpdates).toEqual([[{ id: 2, role: "ADMIN" }]])
    // The team is read again: the badge says the new role
    await waitFor(() =>
      expect(
        screen.queryByText(/Un admin non si può disattivare/)
      ).toBeInTheDocument()
    )
    expect(save()).toBeDisabled()
  })

  it.each([
    ["LastAdmin", new LastAdmin(), "Deve restare almeno un admin"],
    ["OperatorNotFound", new OperatorNotFound(), "Operatore non trovato"],
  ])("con %s mostra il suo messaggio", async (_, error, message) => {
    const user = userEvent.setup()
    const { backend } = await openMember(1)
    backend.state.roleRejected = error

    await pickRole(user, "Operatore")
    await user.click(save())

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.queryByText("Ruolo aggiornato")).toBeNull()
    // The choice stays, so the admin can retry
    expect(save()).toBeEnabled()
  })

  it("se il backend non risponde mostra il titolo generico", async () => {
    const user = userEvent.setup()
    const { backend } = await openMember(2)
    backend.state.failingRoles = true

    await pickRole(user, "Admin")
    await user.click(save())

    expect(
      await screen.findByText("Errore durante l'aggiornamento del ruolo")
    ).toBeInTheDocument()
    await waitFor(() => expect(save()).toBeEnabled())
  })

  it("se il portafoglio non arriva lo dice e Riprova lo richiede", async () => {
    const user = userEvent.setup()
    const backend = backendOf()
    backend.state.failingImpact = true
    await openMember(2, backend)

    expect(
      await screen.findByText("Impossibile caricare il portafoglio")
    ).toBeInTheDocument()

    backend.state.failingImpact = false
    await user.click(screen.getByRole("button", { name: "Riprova" }))

    await waitFor(() =>
      expect(screen.getByText("Clienti").nextSibling).toHaveTextContent("3")
    )
  })
})

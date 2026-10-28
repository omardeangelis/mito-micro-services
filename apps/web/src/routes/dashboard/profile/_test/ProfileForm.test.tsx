import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { ada } from "@/test/api"
import { fakeProfile } from "@/test/profile"
import { renderProfile } from "./page"

// Il tab Profile: nome e cognome dell'operatore corrente (ProfileForm)

const nameField = () => screen.findByLabelText("Nome Operatore")
const surnameField = () => screen.getByLabelText("Cognome Operatore")
const save = () => screen.getByRole("button", { name: "Aggiorna" })

describe("il profilo", () => {
  it("mostra nome e cognome, e Aggiorna è spento finché non cambiano", async () => {
    const user = userEvent.setup()
    renderProfile(fakeProfile({ role: "OPERATORE" }))

    expect(await nameField()).toHaveValue("Ada")
    expect(
      screen.getByRole("heading", { name: "Aggiorna le tue informazioni" })
    ).toBeInTheDocument()
    expect(surnameField()).toHaveValue("Lovelace")
    expect(save()).toBeDisabled()

    await user.type(surnameField(), " King")

    expect(save()).toBeEnabled()
  })

  it("salva nome e cognome, lo dice e la pagina mostra i nuovi", async () => {
    const user = userEvent.setup()
    const backend = fakeProfile({ role: "OPERATORE" })
    renderProfile(backend)
    await user.clear(await nameField())
    await user.type(await nameField(), "Augusta")

    await user.click(save())

    expect(
      await screen.findByText("Operator updated successfully")
    ).toBeInTheDocument()
    expect(backend.state.profileUpdates).toEqual([
      { name: "Augusta", surname: "Lovelace" },
    ])
    // The current user is read again: the form has nothing left to save
    await waitFor(() => expect(save()).toBeDisabled())
    expect(await nameField()).toHaveValue("Augusta")
  })

  it("al primo accesso, salvati, apre la dashboard", async () => {
    const user = userEvent.setup()
    const backend = fakeProfile({
      me: { ...ada, name: null, surname: null },
      role: "OPERATORE",
    })
    const { router } = renderProfile(backend, {
      path: "/dashboard/profile?firstTime=true",
    })
    await user.type(await nameField(), "Ada")
    await user.type(surnameField(), "Lovelace")

    await user.click(save())

    expect(await screen.findByText("la dashboard")).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/dashboard")
    expect(screen.queryByText("Operator updated successfully")).toBeNull()
  })

  it("un nome di un carattere non si salva e dice perché", async () => {
    const user = userEvent.setup()
    const backend = fakeProfile({ role: "OPERATORE" })
    renderProfile(backend)
    await user.clear(await nameField())
    await user.type(await nameField(), "A")

    await user.click(save())

    expect(await screen.findByText("Almeno 2 caratteri")).toBeInTheDocument()
    expect(backend.state.profileUpdates).toEqual([])
  })

  it("se il salvataggio fallisce lo dice e i valori restano", async () => {
    const user = userEvent.setup()
    const backend = fakeProfile({ role: "OPERATORE" })
    backend.state.failingProfile = true
    renderProfile(backend, { path: "/dashboard/profile?firstTime=true" })
    await user.clear(await nameField())
    await user.type(await nameField(), "Augusta")

    await user.click(save())

    expect(
      await screen.findByText("Il servizio non risponde, riprova tra poco")
    ).toBeInTheDocument()
    expect(await nameField()).toHaveValue("Augusta")
    expect(save()).toBeEnabled()
    expect(screen.queryByText("la dashboard")).toBeNull()
  })
})

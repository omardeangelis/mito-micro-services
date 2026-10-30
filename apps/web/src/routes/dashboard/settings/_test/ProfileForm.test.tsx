import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { ada } from "@/test/api"
import { fakeProfile } from "@/test/profile"
import { renderSettings } from "./page"

// La pagina Profilo: nome e cognome dell'operatore corrente (ProfileForm),
// il ruolo e l'uscita

const nameField = () => screen.findByLabelText("Nome")
const surnameField = () => screen.getByLabelText("Cognome")
const save = () => screen.getByRole("button", { name: /^Salva/ })

describe("il profilo", () => {
  it("mostra nome, cognome e ruolo, e Salva è spento finché non cambiano", async () => {
    const user = userEvent.setup()
    renderSettings(fakeProfile({ role: "OPERATORE" }))

    expect(await nameField()).toHaveValue("Ada")
    expect(screen.getByRole("heading", { name: "Profilo" })).toBeInTheDocument()
    expect(screen.getByText("Operatore")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Esci dal gestionale" })
    ).toBeInTheDocument()
    expect(surnameField()).toHaveValue("Lovelace")
    expect(save()).toBeDisabled()

    await user.type(surnameField(), " King")

    expect(save()).toBeEnabled()
  })

  it("salva nome e cognome, lo dice e la pagina mostra i nuovi", async () => {
    const user = userEvent.setup()
    const backend = fakeProfile({ role: "OPERATORE" })
    renderSettings(backend)
    await user.clear(await nameField())
    await user.type(await nameField(), "Augusta")

    await user.click(save())

    expect(await screen.findByText("Profilo aggiornato")).toBeInTheDocument()
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
    const { router } = renderSettings(
      backend,
      "/dashboard/settings/profile?firstTime=true"
    )
    expect(screen.getByText(/È il tuo primo accesso/)).toBeInTheDocument()
    await user.type(await nameField(), "Ada")
    await user.type(surnameField(), "Lovelace")

    await user.click(screen.getByRole("button", { name: "Salva ed entra" }))

    expect(await screen.findByText("la dashboard")).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/dashboard")
    expect(screen.queryByText("Profilo aggiornato")).toBeNull()
  })

  it("un nome di un carattere non si salva e dice perché", async () => {
    const user = userEvent.setup()
    const backend = fakeProfile({ role: "OPERATORE" })
    renderSettings(backend)
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
    renderSettings(backend, "/dashboard/settings/profile?firstTime=true")
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

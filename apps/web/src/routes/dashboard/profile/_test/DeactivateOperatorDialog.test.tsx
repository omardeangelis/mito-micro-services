import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import {
  CannotDeactivateSelf,
  HandoverSameOperator,
  OperatorIsAdmin,
  OperatorNotFound,
} from "@mito/contract/errors"
import { ada } from "@/test/api"
import { fakeProfile, operatorRow } from "@/test/profile"
import { renderProfile } from "./page"

// Il dialog "Disattiva" del tab Admin: impatto, errori, successo e tastiera
// (gestione-operatori, AC21–AC23), come i test del Next.js app

const mario = { ...operatorRow(1, "Mario", "OPERATORE"), surname: "Rossi" }
const luca = { ...operatorRow(2, "Luca", "OPERATORE"), surname: "Bianchi" }

type User = ReturnType<typeof userEvent.setup>

/** The admin tab, with Mario to deactivate and Luca to take his customers */
const setup = async () => {
  const user = userEvent.setup()
  const backend = fakeProfile({
    me: { ...ada, id: 9 },
    operators: [mario, luca],
  })
  const page = renderProfile(backend, { path: "/dashboard/profile?tab=admin" })
  await screen.findByRole("heading", { name: "Gestisci operatori" })
  return { user, backend, ...page }
}

const rowButton = () =>
  screen.getByRole("button", { name: "Disattiva Mario Rossi" })

const openDialog = async (user: User) => {
  await user.click(rowButton())
  return screen.findByRole("dialog", { name: "Disattiva Mario Rossi" })
}

const openAndPick = async (user: User) => {
  await openDialog(user)
  await screen.findByText("3 clienti")
  await user.click(screen.getByRole("combobox", { name: "Passa a" }))
  await user.click(await screen.findByRole("option", { name: "Luca Bianchi" }))
}

const confirm = () => screen.getByRole("button", { name: "Conferma" })

describe("il dialog Disattiva", () => {
  it("Conferma è spento finché non si sceglie una destinazione", async () => {
    const { user } = await setup()

    await openDialog(user)

    expect(confirm()).toBeDisabled()
  })

  it("mostra quanti clienti, contatti attivi e pratiche passeranno", async () => {
    const { user } = await setup()
    await openDialog(user)

    expect(await screen.findByText("3 clienti")).toBeInTheDocument()
    expect(screen.getByText("2 contatti attivi")).toBeInTheDocument()
    expect(screen.getByText("1 pratica")).toBeInTheDocument()
  })

  it("chiede l'impatto solo quando si apre", async () => {
    const { user, backend } = await setup()

    expect(backend.state.impactReads).toBe(0)
    await openDialog(user)

    await screen.findByText("3 clienti")
    expect(backend.state.impactReads).toBe(1)
  })

  it.each([
    [
      "OperatorIsAdmin",
      new OperatorIsAdmin(),
      "Declassa l'admin a operatore prima di disattivarlo",
    ],
    [
      "CannotDeactivateSelf",
      new CannotDeactivateSelf(),
      "Non puoi disattivare te stesso",
    ],
    ["OperatorNotFound", new OperatorNotFound(), "Operatore non trovato"],
    [
      "HandoverSameOperator",
      new HandoverSameOperator(),
      "Il cliente è già assegnato a questo operatore",
    ],
  ])(
    "con %s mostra il messaggio e il dialog resta aperto",
    async (_, error, message) => {
      const { user, backend } = await setup()
      backend.state.deactivateRejected = error
      await openAndPick(user)

      await user.click(confirm())

      expect((await screen.findByRole("alert")).textContent).toBe(message)
      expect(screen.getByRole("dialog")).toBeInTheDocument()
      expect(screen.queryByText(/Operatore disattivato/)).toBeNull()
      // The row stays, behind the dialog
      expect(
        screen.getByRole("button", {
          name: "Disattiva Mario Rossi",
          hidden: true,
        })
      ).toBeInTheDocument()
    }
  )

  it("dopo la conferma chiude il dialog e mostra i conteggi", async () => {
    const { user, backend } = await setup()
    await openAndPick(user)

    await user.click(confirm())

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(backend.state.deactivations).toEqual([
      { operatorId: 1, toOperatorId: 2 },
    ])
    expect(
      await screen.findByText(
        "Operatore disattivato: 3 clienti, 2 contatti, 1 pratica passati a Luca Bianchi"
      )
    ).toBeInTheDocument()
  })

  it("se il backend non risponde mostra l'errore e il dialog si chiude con Esc", async () => {
    const { user, backend } = await setup()
    backend.state.failingDeactivate = true
    await openAndPick(user)

    await user.click(confirm())

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Il servizio non risponde, riprova tra poco"
    )
    expect(confirm()).toBeEnabled()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(rowButton()).toBeInTheDocument()
  })

  it("se la destinazione scelta non è più nella lista lo dice e la toglie", async () => {
    const { user, backend, queryClient } = await setup()
    await openAndPick(user)
    // A read again while the dialog is open: Luca is no longer a destination
    backend.state.targets = [{ id: 3, name: "Sara", surname: "Verdi" }]
    await queryClient.invalidateQueries({
      queryKey: ["operator", "getOperatorsForDeactivation"],
    })

    await user.click(confirm())

    expect((await screen.findByRole("alert")).textContent).toBe(
      "L'operatore scelto non è più disponibile: scegline un altro"
    )
    expect(backend.state.deactivations).toEqual([])
    expect(confirm()).toBeDisabled()
  })

  it("scegliere un'altra destinazione toglie il messaggio d'errore", async () => {
    const { user, backend, queryClient } = await setup()
    await openAndPick(user)
    backend.state.targets = [{ id: 3, name: "Sara", surname: "Verdi" }]
    await queryClient.invalidateQueries({
      queryKey: ["operator", "getOperatorsForDeactivation"],
    })
    await user.click(confirm())
    await screen.findByRole("alert")

    await user.click(screen.getByRole("combobox", { name: "Passa a" }))
    await user.click(await screen.findByRole("option", { name: "Sara Verdi" }))

    expect(screen.queryByRole("alert")).toBeNull()
    expect(confirm()).toBeEnabled()
  })

  it("se i dati non arrivano lo dice e Riprova li richiede", async () => {
    const { user, backend } = await setup()
    backend.state.failingImpact = true
    await openDialog(user)

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Impossibile caricare i dati dell'operatore"
    )
    expect(screen.queryByText("Caricamento...")).toBeNull()

    backend.state.failingImpact = false
    await user.click(screen.getByRole("button", { name: "Riprova" }))

    expect(await screen.findByText("3 clienti")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("all'apertura il focus è sul select della destinazione", async () => {
    const { user } = await setup()

    await openDialog(user)

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("combobox", { name: "Passa a" })
      )
    )
  })

  it("Esc chiude il dialog e il focus torna al bottone della riga", async () => {
    const { user } = await setup()
    await openDialog(user)

    await user.keyboard("{Escape}")

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(rowButton())
  })
})

import { screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { CallbackChanged, ContactForbidden } from "@mito/contract/errors"
import { type TaskStatus } from "@mito/contract/task"
import { contactDetail, superseded } from "@/test/contacts"
import { detailHrefFromDa } from "../../_lib/detailHrefFromDa"
import { currentHref } from "../../_test/page"
import {
  DA,
  detailPath,
  holdWrites,
  lastAlert,
  openDetail,
  toastLink,
} from "./detail"

// «Togli il richiamo» in the detail (esiti-richiami-stati AC22): the "X" of the
// open alert asks for the new state of the contact, on the page with a backend
// in memory

const alert = {
  id: 5,
  deadline: new Date("2026-10-20T22:00:00Z"),
  message: "Richiamare dopo le 15",
}

/** The detail of the contact of `contactRow` in `state`, with an open alert */
const setup = (state: TaskStatus = "richiamare") =>
  openDetail([contactDetail({ contact: { state }, alert })])

const removeButton = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: "Togli il richiamo" })

const dialog = () => screen.getByRole("dialog", { name: "Togli il richiamo" })

const confirmButton = () =>
  within(dialog()).getByRole<HTMLButtonElement>("button", { name: "Conferma" })

const openSection = () => screen.getByRole("region", { name: "Prossimo alert" })

const trigger = () =>
  document.querySelector<HTMLButtonElement>("[data-contact-state-trigger]")!

/** Opens the dialog and picks the choice labelled `label` */
const pick = async (
  user: Awaited<ReturnType<typeof setup>>["user"],
  label: string
) => {
  await user.click(removeButton())
  await user.click(
    within(await screen.findByRole("dialog")).getByLabelText(label)
  )
}

beforeEach(() => {
  sessionStorage.clear()
})

describe("«Togli il richiamo» si apre senza una scelta (AC22)", () => {
  it("la X apre il dialogo con il giorno e il messaggio, senza una scelta, e Conferma è disattivato", async () => {
    const { user, backend } = await setup()

    await user.click(removeButton())

    const open = await screen.findByRole("dialog", {
      name: "Togli il richiamo",
    })
    expect(within(open).getByText(/21\/10\/2026/)).toBeTruthy()
    expect(within(open).getByText("Richiamare dopo le 15")).toBeTruthy()
    const choices = within(open).getAllByRole("radio")
    expect(
      choices.map((choice) => choice.getAttribute("aria-checked"))
    ).toEqual(["false", "false", "false", "false", "false"])
    expect(confirmButton().disabled).toBe(true)
    // Nothing is sent by opening it
    expect(backend.state.removals).toHaveLength(0)
  })

  it("offre i cinque stati, mai Richiamo", async () => {
    const { user } = await setup()

    await user.click(removeButton())

    await screen.findByRole("dialog", { name: "Togli il richiamo" })
    expect(within(dialog()).getAllByRole("radio")).toHaveLength(5)
    for (const label of [
      "Da chiamare",
      "Non risponde",
      "Appuntamento",
      "Pratica caricata",
      "Non interessato",
    ]) {
      expect(within(dialog()).getByLabelText(label)).toBeTruthy()
    }
    expect(within(dialog()).queryByLabelText("Richiamo")).toBeNull()
  })

  it("Conferma resta disattivato finché non si sceglie, e Invio non invia nulla", async () => {
    const { user, backend } = await setup()
    await user.click(removeButton())
    await screen.findByRole("dialog")

    await user.click(confirmButton())

    expect(backend.state.removals).toHaveLength(0)
    expect(confirmButton().disabled).toBe(true)

    await user.click(within(dialog()).getByLabelText("Appuntamento"))

    expect(confirmButton().disabled).toBe(false)
  })

  it("Annulla non cambia nulla e riporta il focus sulla X", async () => {
    const { user, backend } = await setup()
    await pick(user, "Appuntamento")

    await user.click(within(dialog()).getByRole("button", { name: "Annulla" }))

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Togli il richiamo" })
      ).toBeNull()
    )
    expect(backend.state.removals).toHaveLength(0)
    expect(
      within(openSection()).getByText("Richiamare dopo le 15")
    ).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(removeButton()))
  })

  it("riaprendolo, la scelta di prima non c'è più", async () => {
    const { user } = await setup()
    await pick(user, "Appuntamento")
    await user.click(within(dialog()).getByRole("button", { name: "Annulla" }))
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Togli il richiamo" })
      ).toBeNull()
    )

    await user.click(removeButton())

    await screen.findByRole("dialog", { name: "Togli il richiamo" })
    expect(confirmButton().disabled).toBe(true)
  })
})

describe("confermando (AC22, AC23)", () => {
  it("manda alert, contatto e stato scelto, e dice che sta salvando", async () => {
    const { user, backend } = await setup()
    const open = holdWrites(backend)
    await pick(user, "Appuntamento")

    await user.click(confirmButton())

    await waitFor(() =>
      expect(removeButton().getAttribute("aria-busy")).toBe("true")
    )
    // The alert stays until the page without it is on screen
    expect(
      within(openSection()).getByText("Richiamare dopo le 15")
    ).toBeTruthy()
    open()
    await waitFor(() =>
      expect(
        within(openSection()).getByText("Nessun alert aperto")
      ).toBeTruthy()
    )
    expect(backend.state.removals).toEqual([
      { alertId: 5, taskId: 101, state: "app.to" },
    ])
  })

  it("il contatto è lo stesso, con lo stato scelto: stesso indirizzo, anche con lo stesso stato di prima", async () => {
    const { user, backend } = await setup("richiamare")
    await pick(user, "Non risponde")

    await user.click(confirmButton())

    await waitFor(() =>
      expect(trigger().getAttribute("aria-label")).toBe(
        "Non risponde, cambia stato"
      )
    )
    expect(currentHref()).toBe(detailPath(101, DA))
    expect(backend.state.removals).toEqual([
      { alertId: 5, taskId: 101, state: "non risponde" },
    ])
    expect(within(openSection()).getByText("Nessun alert aperto")).toBeTruthy()
  })

  it("non si invia due volte durante il salvataggio", async () => {
    const { user, backend } = await setup()
    const open = holdWrites(backend)
    await pick(user, "Pratica caricata")

    await user.click(confirmButton())
    // The dialog is closed and the "X" waits: it opens nothing
    await user.click(removeButton())
    expect(
      screen.queryByRole("dialog", { name: "Togli il richiamo" })
    ).toBeNull()
    open()

    await waitFor(() =>
      expect(
        within(openSection()).getByText("Nessun alert aperto")
      ).toBeTruthy()
    )
    expect(backend.state.removals).toHaveLength(1)
  })

  it("dopo la chiusura il focus va al titolo della sezione, mai su body", async () => {
    const { user } = await setup()
    await pick(user, "Da chiamare")

    await user.click(confirmButton())

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Prossimo alert" })
      )
    )
  })
})

describe("quando il server rifiuta (AC49, AC52)", () => {
  it("toast con il motivo e lo stesso testo dentro la finestra; l'alert resta e il pulsante torna attivo", async () => {
    const { user, backend } = await setup()
    backend.state.removeAnswer = () => ({
      rejected: new ContactForbidden({ assignee: "Giulia Bianchi" }),
    })
    await pick(user, "Appuntamento")

    await user.click(confirmButton())

    const reason =
      "Non puoi modificare questo contatto: è assegnato a Giulia Bianchi"
    await waitFor(() => expect(lastAlert()).toBe(reason))
    expect(screen.getAllByText(reason)).toHaveLength(2)
    await waitFor(() =>
      expect(removeButton().getAttribute("aria-busy")).not.toBe("true")
    )
    expect(
      within(openSection()).getByText("Richiamare dopo le 15")
    ).toBeTruthy()
  })

  it("contatto sostituito nel frattempo: il toast offre il contatto attivo, con la vista della lista (AC52)", async () => {
    const { user, backend } = await setup()
    backend.state.removeAnswer = () => ({ rejected: superseded(303) })
    await pick(user, "Appuntamento")

    await user.click(confirmButton())

    await waitFor(() =>
      expect(lastAlert()).toBe(
        "Questo contatto è stato sostituito da uno più recente"
      )
    )
    expect(toastLink("Vai al contatto attivo").getAttribute("href")).toBe(
      detailHrefFromDa(303, DA)
    )
  })

  it("richiamo cambiato nel frattempo: si legge di nuovo il contatto e lo si mostra com'è, con il motivo", async () => {
    const { user, backend } = await setup()
    // A colleague replaced the callback: the contact read again has the new one
    backend.state.removeAnswer = () => {
      backend.state.details = {
        ...backend.state.details,
        101: contactDetail({
          contact: { state: "richiamare" },
          alert: {
            id: 6,
            deadline: new Date("2026-10-25T22:00:00Z"),
            message: "Nuovo richiamo di una collega",
          },
        }),
      }
      return { rejected: new CallbackChanged() }
    }
    await pick(user, "Appuntamento")

    await user.click(confirmButton())

    const reason = "Il richiamo è cambiato nel frattempo: controlla il contatto"
    await waitFor(() => expect(lastAlert()).toBe(reason))
    await waitFor(() =>
      expect(
        within(openSection()).getByText("Nuovo richiamo di una collega")
      ).toBeTruthy()
    )
    expect(
      screen.queryByRole("dialog", { name: "Togli il richiamo" })
    ).toBeNull()
    expect(trigger().getAttribute("aria-label")).toBe(
      "Richiamo · 25/10, cambia stato"
    )
  })
})

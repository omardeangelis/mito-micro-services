import { screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { ContactForbidden } from "@mito/contract/errors"
import { type TaskStatus } from "@mito/contract/task"
import { contactDetail, superseded } from "@/test/contacts"
import { detailHrefFromDa } from "../../_lib/detailHrefFromDa"
import { DA, holdWrites, lastAlert, openDetail, toastLink } from "./detail"

// The "X" of the open alert in the detail, as the tests of
// `ContactAlertCloseButton` of the Next.js app, on the page with a backend in
// memory

const alert = {
  id: 5,
  deadline: new Date("2026-10-20T22:00:00Z"),
  message: "Richiamare dopo le 15",
}

/**
 * The detail of the contact of `contactRow` in `state`, with an open alert:
 * "Imposta richiamo" is there with an outcome, not with `chiamare`
 */
const setup = (state: TaskStatus = "richiamare") =>
  openDetail([contactDetail({ contact: { state }, alert })])

const closeButton = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: "Chiudi il richiamo" })

const openSection = () => screen.getByRole("region", { name: "Prossimo alert" })

beforeEach(() => {
  sessionStorage.clear()
})

describe("la X dell'alert aperto (AC29)", () => {
  it("chiude l'alert con la sorgente 'detail' e dice che sta salvando", async () => {
    const { user, backend } = await setup()
    const open = holdWrites(backend)

    await user.click(closeButton())

    await waitFor(() =>
      expect(closeButton().getAttribute("aria-busy")).toBe("true")
    )
    expect(closeButton().getAttribute("aria-disabled")).toBe("true")
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
    expect(backend.state.resolves).toEqual([{ alertId: 5, source: "detail" }])
  })

  it("non si invia due volte durante il salvataggio", async () => {
    const { user, backend } = await setup()
    const open = holdWrites(backend)

    await user.click(closeButton())
    await user.click(closeButton())
    open()

    await waitFor(() =>
      expect(
        within(openSection()).getByText("Nessun alert aperto")
      ).toBeTruthy()
    )
    expect(backend.state.resolves).toHaveLength(1)
  })

  it("dopo la chiusura il focus va a 'Imposta richiamo'", async () => {
    const { user } = await setup("richiamare")

    await user.click(closeButton())

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Imposta richiamo" })
      )
    )
  })

  it("senza 'Imposta richiamo' il focus va al titolo della sezione, mai su body", async () => {
    const { user } = await setup("chiamare")

    await user.click(closeButton())

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
    backend.state.resolveAnswer = () => ({
      rejected: new ContactForbidden({ assignee: "Giulia Bianchi" }),
    })

    await user.click(closeButton())

    const reason =
      "Non puoi modificare questo contatto: è assegnato a Giulia Bianchi"
    await waitFor(() => expect(lastAlert()).toBe(reason))
    expect(screen.getAllByText(reason)).toHaveLength(2)
    await waitFor(() =>
      expect(closeButton().getAttribute("aria-busy")).not.toBe("true")
    )
    expect(
      within(openSection()).getByText("Richiamare dopo le 15")
    ).toBeTruthy()
  })

  it("contatto sostituito nel frattempo: il toast offre il contatto attivo, con la vista della lista (AC52)", async () => {
    const { user, backend } = await setup()
    backend.state.resolveAnswer = () => ({ rejected: superseded(303) })

    await user.click(closeButton())

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

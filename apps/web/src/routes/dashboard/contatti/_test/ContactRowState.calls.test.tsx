import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  AlertConfirmationRequired,
  CallAlreadyWorked,
  CallNotAllowed,
} from "@mito/contract/errors"
import { type ContactRow } from "@mito/contract/task"
import { contactRow, fakeContacts } from "@/test/contacts"
import { findTable, renderContacts } from "./page"

// «Registra chiamata» from the state cell of a row (esiti-richiami-stati
// AC18): the four outcomes in its menu, with the rules of the detail

// 12:00 of 15/10/2026 in Rome. Only the clock is faked: timers stay real
const NOW = new Date("2026-10-15T10:00:00Z")

/** An open alert due on the 20th in Rome: a future one */
const futureAlert = {
  id: 5,
  deadline: new Date("2026-10-19T22:00:00Z"),
  message: "Richiamare dopo le 15",
}

/** An open alert due yesterday in Rome */
const expiredAlert = {
  id: 6,
  deadline: new Date("2026-10-13T22:00:00Z"),
  message: "Era per ieri",
}

const UNCERTAIN =
  "Non sappiamo se la chiamata è stata registrata. Controlla lo Storico: se non c'è, registrala di nuovo."

const setup = async (contact: ContactRow = contactRow()) => {
  const backend = fakeContacts({ rows: [contact] })
  const view = renderContacts("/dashboard/contatti", backend)
  await findTable()
  return { ...view, backend }
}

const trigger = () =>
  document.querySelector<HTMLButtonElement>("[data-contact-state-trigger]")!

/** Opens the menu of the row and presses the outcome `name` */
const press = async (
  user: Awaited<ReturnType<typeof setup>>["user"],
  name: string
) => {
  await user.click(trigger())
  await user.click(await screen.findByRole("menuitem", { name }))
}

/** The button of `day` of the month shown, not of the days around it */
const dayButton = (day: number) =>
  within(screen.getByRole("grid"))
    .getAllByRole("button")
    .find(
      (button) =>
        button.textContent === String(day) && !button.closest("[data-outside]")
    )!

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("gli esiti nella cella dello stato (AC18)", () => {
  it("«Non risponde» da una riga in Da chiamare registra con origine lista", async () => {
    const { user, backend } = await setup()

    await press(user, "Non risponde")

    await waitFor(() => expect(backend.state.calls).toHaveLength(1))
    expect(backend.state.calls[0]).toMatchObject({
      taskId: 101,
      outcome: "non risponde",
      source: "list",
    })
  })

  it("manda l'alert aperto della riga come alert lavorato (AC13)", async () => {
    const { user, backend } = await setup(
      contactRow({ state: "chiamare", alert: expiredAlert })
    )

    await press(user, "Non risponde")

    await waitFor(() => expect(backend.state.calls).toHaveLength(1))
    expect(backend.state.calls[0]).toMatchObject({
      source: "list",
      workingAlertId: 6,
    })
  })

  it("la riga mostra lo stato nuovo senza ricaricare la lista", async () => {
    const { user } = await setup()

    await press(user, "Appuntamento")

    await waitFor(() =>
      expect(trigger().getAttribute("aria-label")).toBe(
        "Appuntamento, cambia stato"
      )
    )
  })

  it("con uno stato che non ammette chiamate non ci sono gli esiti (AC12)", async () => {
    const { user } = await setup(contactRow({ state: "app.to" }))

    await user.click(trigger())

    await screen.findByRole("menuitemradio", { name: "Pratica caricata" })
    expect(screen.queryByRole("menuitem", { name: "Non risponde" })).toBeNull()
  })

  it("su un contatto non attivo non ci sono gli esiti", async () => {
    await setup(contactRow({ isActive: false }))

    expect(trigger()).toBeNull()
  })
})

describe("la conferma di un alert futuro (AC14)", () => {
  it("«Appuntamento» chiede prima conferma; confermando manda l'alert confermato", async () => {
    const { user, backend } = await setup(
      contactRow({ state: "richiamare", alert: futureAlert })
    )

    await press(user, "Appuntamento")

    const dialog = await screen.findByRole("dialog", {
      name: "Chiudere il richiamo?",
    })
    expect(within(dialog).getByText("Richiamare dopo le 15")).toBeTruthy()
    expect(backend.state.calls).toHaveLength(0)
    await user.click(
      within(dialog).getByRole("button", { name: "Cambia stato" })
    )

    await waitFor(() => expect(backend.state.calls).toHaveLength(1))
    expect(backend.state.calls[0]).toMatchObject({
      outcome: "app.to",
      source: "list",
      workingAlertId: 5,
      confirmedAlertId: 5,
    })
  })

  it("annullando non succede nulla", async () => {
    const { user, backend } = await setup(
      contactRow({ state: "richiamare", alert: futureAlert })
    )

    await press(user, "Non interessato")
    const dialog = await screen.findByRole("dialog", {
      name: "Chiudere il richiamo?",
    })
    await user.click(within(dialog).getByRole("button", { name: "Annulla" }))

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Chiudere il richiamo?" })
      ).toBeNull()
    )
    expect(backend.state.calls).toHaveLength(0)
  })

  it("«Non risponde» non chiede conferma", async () => {
    const { user, backend } = await setup(
      contactRow({ state: "richiamare", alert: futureAlert })
    )

    await press(user, "Non risponde")

    await waitFor(() => expect(backend.state.calls).toHaveLength(1))
    expect(backend.state.calls[0]).not.toHaveProperty("confirmedAlertId", 5)
  })

  it("«Richiamare» apre il riquadro che dice quale richiamo sostituisce, e salvare è la conferma", async () => {
    const { user, backend } = await setup(
      contactRow({ state: "richiamare", alert: futureAlert })
    )

    await press(user, "Richiamare")

    expect(screen.getByText("Sostituisce il richiamo del 20/10")).toBeTruthy()
    await user.click(dayButton(22))
    await user.click(
      screen.getByRole("button", { name: "Salva richiamo del 22/10" })
    )

    await waitFor(() => expect(backend.state.calls).toHaveLength(1))
    expect(backend.state.calls[0]).toMatchObject({
      outcome: "richiamare",
      source: "list",
      workingAlertId: 5,
      confirmedAlertId: 5,
      callback: { day: "2026-10-22" },
    })
  })
})

describe("durante l'invio (AC33)", () => {
  it("il doppio clic su un esito manda una sola registrazione", async () => {
    const { user, backend } = await setup()
    let open!: () => void
    backend.state.writeGate = new Promise<void>((resolve) => {
      open = resolve
    })

    await user.click(trigger())
    await user.dblClick(
      await screen.findByRole("menuitem", { name: "Appuntamento" })
    )
    await user.click(trigger())
    expect(screen.queryByRole("menuitem")).toBeNull()

    open()
    await waitFor(() =>
      expect(trigger().getAttribute("aria-label")).toBe(
        "Appuntamento, cambia stato"
      )
    )
    expect(backend.state.calls).toHaveLength(1)
  })

  it("il riquadro di Richiamare dice «Registro…» e due salvataggi mandano una sola registrazione", async () => {
    const { user, backend } = await setup()
    let open!: () => void
    backend.state.writeGate = new Promise<void>((resolve) => {
      open = resolve
    })

    await press(user, "Richiamare")
    await user.click(dayButton(22))
    await user.dblClick(
      screen.getByRole("button", { name: "Salva richiamo del 22/10" })
    )

    expect(screen.getByRole("button", { name: "Registro…" })).toBeTruthy()
    open()
    await waitFor(() =>
      expect(trigger().getAttribute("aria-label")).toBe(
        "Richiamo · 22/10, cambia stato"
      )
    )
    expect(backend.state.calls).toHaveLength(1)
  })
})

describe("i rifiuti e l'esito incerto (AC13, AC15)", () => {
  it("un rifiuto dice il motivo con le etichette e la riga torna com'è", async () => {
    const { user, backend } = await setup()
    backend.state.callAnswer = () => ({
      rejected: new CallAlreadyWorked({
        by: "Giulia Bianchi",
        at: new Date("2026-10-15T09:30:00Z"),
      }),
    })

    await press(user, "Non interessato")

    await screen.findByText("Già lavorato da Giulia Bianchi alle 11:30")
    expect(trigger().getAttribute("aria-label")).toBe(
      "Da chiamare, cambia stato"
    )
  })

  it("lo stato che non ammette chiamate lo dice con le etichette", async () => {
    const { user, backend } = await setup()
    backend.state.callAnswer = () => ({
      rejected: new CallNotAllowed({ state: "app.to" }),
    })

    await press(user, "Non risponde")

    await screen.findByText(
      "Con lo stato Appuntamento non si registrano chiamate: riporta il contatto a Da chiamare per richiamarlo."
    )
  })

  it("un alert futuro impostato nel frattempo chiede la conferma di quell'alert", async () => {
    const { user, backend } = await setup()
    backend.state.callAnswer = (call) =>
      call.confirmedAlertId === futureAlert.id
        ? { saved: true }
        : { rejected: new AlertConfirmationRequired({ alert: futureAlert }) }

    await press(user, "Non interessato")

    const dialog = await screen.findByRole("dialog", {
      name: "Chiudere il richiamo?",
    })
    await user.click(
      within(dialog).getByRole("button", { name: "Cambia stato" })
    )
    await waitFor(() => expect(backend.state.calls).toHaveLength(2))
    expect(backend.state.calls[1]).toMatchObject({
      outcome: "non interessato",
      confirmedAlertId: 5,
    })
  })

  it("l'esito incerto non dice che la chiamata non è registrata e il blocco finisce", async () => {
    const { user, backend } = await setup()
    backend.state.callAnswer = () => "down"

    await press(user, "Non risponde")

    await screen.findByText(UNCERTAIN)
    await waitFor(() =>
      expect(trigger().getAttribute("aria-busy")).toBe("false")
    )
  })

  it("per Richiamare un rifiuto lascia il riquadro aperto con la bozza e il motivo", async () => {
    const { user, backend } = await setup()
    backend.state.callAnswer = () => "down"

    await press(user, "Richiamare")
    await user.click(dayButton(22))
    await user.click(
      screen.getByRole("button", { name: "Salva richiamo del 22/10" })
    )

    await waitFor(() =>
      expect(
        within(screen.getByRole("dialog")).getByRole("alert").textContent
      ).toBe(UNCERTAIN)
    )
    expect(
      screen.getByRole("button", { name: "Salva richiamo del 22/10" })
    ).toBeTruthy()
  })
})

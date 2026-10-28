import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DeadlineInPast } from "@mito/contract/errors"
import { type TaskStatus } from "@mito/contract/task"
import { formatDeadline } from "@mito/client/format"
import { contactDetail } from "@/test/contacts"
import { holdWrites, lastAlert, openDetail } from "./detail"

// "Imposta richiamo" in the detail, as the tests of `ContactCallbackForm` of
// the Next.js app, on the page with a backend in memory

// 12:00 of 15/10/2026 in Rome. Only the clock is faked: timers stay real
const NOW = new Date("2026-10-15T10:00:00Z")

const openAlert = {
  id: 5,
  deadline: new Date("2026-10-20T22:00:00Z"),
  message: "Richiamare dopo le 15",
}

/** The detail of the contact of `contactRow` in `state`, with `alert` open */
const setup = ({
  state = "app.to",
  alert = null,
}: {
  state?: TaskStatus | null
  alert?: typeof openAlert | null
} = {}) => openDetail([contactDetail({ contact: { state }, alert })])

type User = Awaited<ReturnType<typeof setup>>["user"]

const openForm = (user: User) =>
  user.click(screen.getByRole("button", { name: "Imposta richiamo" }))

/** The button of `day` of the month shown, not of the days around it */
const dayButton = (day: number) =>
  within(screen.getByRole("grid"))
    .getAllByRole("button")
    .find(
      (button) =>
        button.textContent === String(day) && !button.closest("[data-outside]")
    )!

const pickDay = async (user: User, day: number) => {
  await user.click(screen.getByRole("button", { name: /Imposta scadenza/ }))
  await user.click(dayButton(day))
}

const saveButton = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: "Salva richiamo" })

/** The note of the form on the alert it replaces */
const formStatus = () =>
  screen.getAllByRole("status").find((node) => node.closest("form") !== null)!

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW })
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("'Imposta richiamo' è disponibile solo con un esito o nessuno (AC46)", () => {
  it.each([
    "app.to",
    "caricato",
    "erogata",
    "non interessato",
    "richiamare",
    "nessuno",
    null,
  ] as const)("con lo stato %s", async (state) => {
    await setup({ state })

    expect(
      screen.getByRole("button", { name: "Imposta richiamo" })
    ).toBeTruthy()
  })

  it.each(["chiamare", "followup"] as const)(
    "con lo stato %s non c'è",
    async (state) => {
      await setup({ state })

      expect(
        screen.queryByRole("button", { name: "Imposta richiamo" })
      ).toBeNull()
    }
  )
})

describe("il modulo (AC44)", () => {
  it("dice quale richiamo sostituisce, in un nodo che si annuncia", async () => {
    const { user } = await setup({ alert: openAlert })

    await openForm(user)

    const note = formStatus()
    expect(note.textContent).toContain(
      `Sostituisce il richiamo del ${formatDeadline(openAlert.deadline)}`
    )
    expect(note.textContent).toContain("Richiamare dopo le 15")
  })

  it("senza un alert aperto non sostituisce niente", async () => {
    const { user } = await setup()

    await openForm(user)

    expect(screen.queryByText(/Sostituisce il richiamo/)).toBeNull()
  })

  it("non offre oggi né i giorni passati, secondo l'ora italiana, ma da domani sì (D22)", async () => {
    const { user } = await setup()
    await openForm(user)
    await user.click(screen.getByRole("button", { name: /Imposta scadenza/ }))

    expect((dayButton(14) as HTMLButtonElement).disabled).toBe(true)
    expect((dayButton(15) as HTMLButtonElement).disabled).toBe(true)
    expect((dayButton(16) as HTMLButtonElement).disabled).toBe(false)
  })

  it("non si salva senza una data", async () => {
    const { user } = await setup()

    await openForm(user)

    expect(saveButton().disabled).toBe(true)
  })
})

describe("il salvataggio (AC44, AC45)", () => {
  it("manda il giorno, il messaggio e l'alert sostituito, e non si invia due volte", async () => {
    const { user, backend } = await setup({ alert: openAlert })
    const open = holdWrites(backend)
    await openForm(user)
    await pickDay(user, 20)
    await user.type(
      screen.getByPlaceholderText("Messaggio"),
      "  Richiamare alle 15  "
    )

    await user.click(saveButton())
    await user.click(saveButton())

    expect(saveButton().getAttribute("aria-busy")).toBe("true")
    open()
    await waitFor(() => expect(backend.state.callbacks).toHaveLength(1))
    const [sent] = backend.state.callbacks
    expect(sent!.taskId).toBe(101)
    // Trimmed before it is sent, and by the server too
    expect(sent!.message).toBe("Richiamare alle 15")
    expect(sent!.replacesAlertId).toBe(5)
    expect(sent!.deadline.toDateString()).toBe(
      new Date(2026, 9, 20).toDateString()
    )
  })

  it("un messaggio vuoto non crea un testo vuoto", async () => {
    const { user, backend } = await setup()
    await openForm(user)
    await pickDay(user, 20)
    await user.type(screen.getByPlaceholderText("Messaggio"), "   ")

    await user.click(saveButton())

    await waitFor(() => expect(backend.state.callbacks).toHaveLength(1))
    expect(backend.state.callbacks[0]!.message).toBeNull()
    expect(backend.state.callbacks[0]!.replacesAlertId).toBeNull()
  })

  it("riuscito: chiude il modulo, senza toast, e il richiamo nuovo è nella pagina", async () => {
    const { user } = await setup()
    await openForm(user)
    await pickDay(user, 20)
    await user.type(screen.getByPlaceholderText("Messaggio"), "Alle 15")

    await user.click(saveButton())

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Salva richiamo" })
      ).toBeNull()
    )
    const section = screen.getByRole("region", { name: "Prossimo alert" })
    await waitFor(() =>
      expect(within(section).getByText("Alle 15")).toBeTruthy()
    )
    expect(lastAlert()).toBe("")
  })
})

describe("quando il server non salva", () => {
  it("un collega ha impostato un altro richiamo: il modulo resta aperto con i dati e mostra quello attuale, senza toast (AC44)", async () => {
    const { user, backend } = await setup({ alert: openAlert })
    const current = {
      id: 9,
      deadline: new Date("2026-10-25T22:00:00Z"),
      message: "Impostato da un collega",
    }
    backend.state.callbackAnswer = ({ replacesAlertId }) =>
      replacesAlertId === current.id ? { saved: true } : { alert: current }
    await openForm(user)
    await pickDay(user, 20)
    await user.type(
      screen.getByPlaceholderText("Messaggio"),
      "Il mio messaggio"
    )

    await user.click(saveButton())

    await waitFor(() =>
      expect(formStatus().textContent).toContain(
        `Sostituisce il richiamo del ${formatDeadline(current.deadline)}`
      )
    )
    expect(formStatus().textContent).toContain("Impostato da un collega")
    expect(
      screen.getByPlaceholderText<HTMLInputElement>("Messaggio").value
    ).toBe("Il mio messaggio")
    expect(lastAlert()).toBe("")
    expect(
      screen.queryByText("Il contatto ha un richiamo aperto da confermare")
    ).toBeNull()

    // Saving again replaces the alert the form now names
    await waitFor(() =>
      expect(saveButton().getAttribute("aria-busy")).not.toBe("true")
    )
    await user.click(saveButton())
    await waitFor(() => expect(backend.state.callbacks).toHaveLength(2))
    expect(backend.state.callbacks[1]!.replacesAlertId).toBe(9)
  })

  it("una data oggi mandata fuori dall'interfaccia: toast 'da domani' e lo stesso testo dentro la finestra", async () => {
    const { user, backend } = await setup()
    backend.state.callbackAnswer = () => ({ rejected: new DeadlineInPast() })
    await openForm(user)
    await pickDay(user, 20)

    await user.click(saveButton())

    await waitFor(() =>
      expect(lastAlert()).toBe("Il richiamo si imposta da domani")
    )
    expect(
      screen.getAllByText("Il richiamo si imposta da domani")
    ).toHaveLength(2)
  })

  it("il backend che non risponde dice 'Modifica non salvata, riprova' e il modulo si può riprovare", async () => {
    const { user, backend } = await setup()
    backend.state.callbackAnswer = () => "down"
    await openForm(user)
    await pickDay(user, 20)

    await user.click(saveButton())

    await waitFor(() =>
      expect(lastAlert()).toBe("Modifica non salvata, riprova")
    )
    await waitFor(() =>
      expect(saveButton().getAttribute("aria-busy")).not.toBe("true")
    )
    expect(saveButton()).toBeTruthy()
  })
})

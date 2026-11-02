import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  AlertConfirmationRequired,
  CallAlreadyWorked,
  CallNotAllowed,
  ContactForbidden,
  ContactNotFound,
  DeadlineInPast,
  MessageTooLong,
  RequestIdConflict,
} from "@mito/contract/errors"
import { type ContactDetail, type TaskStatus } from "@mito/contract/task"
import { contactDetail, superseded } from "@/test/contacts"
import { holdWrites, lastAlert, openDetail } from "./detail"

// «Registra chiamata» in the detail (esiti-richiami-stati AC7, AC12–AC16,
// AC33), on the page with a backend in memory

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

/** The detail of the contact of `contactRow` in `state`, with `alert` open */
const setup = ({
  state = "chiamare",
  alert = null,
  ...rest
}: {
  state?: TaskStatus | null
  alert?: ContactDetail["alert"]
} & Partial<Omit<ContactDetail, "contact" | "alert">> = {}) =>
  openDetail([contactDetail({ contact: { state }, alert, ...rest })])

const outcomes = () =>
  screen.getByRole("group", { name: "Esito della chiamata a Mario Rossi" })

const outcome = (name: string) =>
  within(outcomes()).getByRole<HTMLButtonElement>("button", { name })

const storico = () => screen.getByRole("region", { name: "Storico" })

/** The entries of the Storico, newest first */
const storicoItems = () => within(storico()).queryAllByRole("listitem")

/** The button of `day` of the month shown, not of the days around it */
const dayButton = (day: number) =>
  within(screen.getByRole("grid"))
    .getAllByRole("button")
    .find(
      (button) =>
        button.textContent === String(day) && !button.closest("[data-outside]")
    )!

const UNCERTAIN =
  "Non sappiamo se la chiamata è stata registrata. Controlla lo Storico: se non c'è, registrala di nuovo."

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW })
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("«Registra chiamata» nel dettaglio (AC7, AC16)", () => {
  it("in Da chiamare, «Non risponde» manda una registrazione e lo Storico mostra in cima «Non risponde» con l'ora", async () => {
    const { user, backend } = await setup()

    await user.click(outcome("Non risponde"))

    await waitFor(() => expect(backend.state.calls).toHaveLength(1))
    expect(backend.state.calls[0]).toMatchObject({
      taskId: 101,
      outcome: "non risponde",
      source: "detail",
    })
    await waitFor(() =>
      expect(storicoItems()[0]?.textContent).toContain("Non risponde")
    )
    expect(storicoItems()[0]?.textContent).toContain("12:00")
  })

  it("i quattro esiti, con gli stessi testi e lo stesso ordine della home", async () => {
    await setup()

    expect(
      within(outcomes())
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["Non risponde", "Richiamare", "Appuntamento", "Non interessato"])
    expect(
      screen.queryByRole("button", { name: "Imposta richiamo" })
    ).toBeNull()
  })

  it("riuscita: lo stato nuovo, l'alert chiuso e la chiamata in cima allo Storico, senza ricaricare la pagina", async () => {
    const { user, backend } = await setup({
      state: "non risponde",
      alert: expiredAlert,
    })

    await user.click(outcome("Appuntamento"))

    const open = screen.getByRole("region", { name: "Prossimo alert" })
    await waitFor(() =>
      expect(within(open).getByText("Nessun alert aperto")).toBeTruthy()
    )
    // An expired alert closes with the outcome, no confirmation (AC14)
    expect(
      screen.queryByRole("dialog", { name: "Chiudere il richiamo?" })
    ).toBeNull()
    expect(backend.state.calls[0]).toMatchObject({
      outcome: "app.to",
      workingAlertId: 6,
    })
    expect(backend.state.calls[0]).not.toHaveProperty("confirmedAlertId", 6)
    const [first, second] = storicoItems()
    expect(first?.textContent).toContain("Appuntamento")
    expect(first?.textContent).toContain("Ada Lovelace")
    expect(second?.textContent).toContain("Era per ieri")
    expect(second?.textContent).toContain(
      "Chiuso da Ada Lovelace il 15/10 alle 12:00"
    )
    // With Appuntamento no call can be registered (AC12)
    await waitFor(() =>
      expect(
        screen.getByText(
          "Con lo stato Appuntamento non si registrano chiamate: riporta il contatto a Da chiamare per richiamarlo."
        )
      ).toBeTruthy()
    )
    expect(lastAlert()).toBe("")
  })

  it("«Richiamare» manda il giorno e il messaggio, e lo Storico dice il giorno", async () => {
    const { user, backend } = await setup({ alert: expiredAlert })

    await user.click(outcome("Richiamare"))
    await user.click(dayButton(22))
    await user.type(screen.getByRole("textbox", { name: "Messaggio" }), "Sera")
    await user.click(
      screen.getByRole("button", { name: "Salva richiamo del 22/10" })
    )

    await waitFor(() => expect(backend.state.calls).toHaveLength(1))
    expect(backend.state.calls[0]).toMatchObject({
      outcome: "richiamare",
      source: "detail",
      workingAlertId: 6,
      callback: { day: "2026-10-22", message: "Sera" },
    })
    await waitFor(() =>
      expect(storicoItems()[0]?.textContent).toContain("Richiamo · 22/10")
    )
  })
})

describe("la conferma di un alert futuro (AC14)", () => {
  it.each([
    ["Appuntamento", "app.to"],
    ["Non interessato", "non interessato"],
  ] as const)(
    "«%s» chiede prima conferma; confermando manda l'alert confermato",
    async (name, value) => {
      const { user, backend } = await setup({
        state: "richiamare",
        alert: futureAlert,
      })

      await user.click(outcome(name))

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
        outcome: value,
        workingAlertId: 5,
        confirmedAlertId: 5,
      })
    }
  )

  it("annullando non succede nulla", async () => {
    const { user, backend } = await setup({
      state: "richiamare",
      alert: futureAlert,
    })

    await user.click(outcome("Non interessato"))
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
    const { user, backend } = await setup({
      state: "richiamare",
      alert: futureAlert,
    })

    await user.click(outcome("Non risponde"))

    await waitFor(() => expect(backend.state.calls).toHaveLength(1))
    expect(backend.state.calls[0]).not.toHaveProperty("confirmedAlertId", 5)
  })

  it("«Richiamare» dice quale richiamo sostituisce, e salvare è la conferma", async () => {
    const { user, backend } = await setup({
      state: "richiamare",
      alert: futureAlert,
    })

    await user.click(outcome("Richiamare"))
    expect(screen.getByText("Sostituisce il richiamo del 20/10")).toBeTruthy()
    await user.click(dayButton(22))
    await user.click(
      screen.getByRole("button", { name: "Salva richiamo del 22/10" })
    )

    await waitFor(() => expect(backend.state.calls).toHaveLength(1))
    expect(backend.state.calls[0]).toMatchObject({
      outcome: "richiamare",
      workingAlertId: 5,
      confirmedAlertId: 5,
    })
  })
})

describe("durante l'invio (AC33)", () => {
  it("il pulsante premuto dice «Registro…», gli altri non mandano, e il doppio clic manda una sola registrazione", async () => {
    const { user, backend } = await setup()
    const open = holdWrites(backend)

    await user.click(outcome("Appuntamento"))
    await user.click(outcome("Registro…"))
    await user.click(outcome("Non risponde"))

    expect(outcome("Registro…").disabled).toBe(true)
    expect(outcome("Non risponde").disabled).toBe(true)
    open()
    await waitFor(() =>
      expect(storicoItems()[0]?.textContent).toContain("Appuntamento")
    )
    expect(backend.state.calls).toHaveLength(1)
  })
})

describe("il riquadro «Richiamare» durante l'invio (home-operatore AC20)", () => {
  it("resta aperto con «Registro…» fino alla risposta, poi si chiude", async () => {
    const { user, backend } = await setup()
    const open = holdWrites(backend)

    await user.click(outcome("Richiamare"))
    await user.click(dayButton(22))
    await user.click(
      screen.getByRole("button", { name: "Salva richiamo del 22/10" })
    )

    const saving = await screen.findAllByRole<HTMLButtonElement>("button", {
      name: "Registro…",
    })
    expect(saving.some((button) => button.closest("form") !== null)).toBe(true)
    await user.keyboard("{Escape}")
    expect(screen.getByRole("textbox", { name: "Messaggio" })).toBeTruthy()
    open()
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Messaggio" })).toBeNull()
    )
    expect(backend.state.calls).toHaveLength(1)
  })

  it("rifiutato perché lo stato non ammette chiamate, il motivo resta nella sezione", async () => {
    const { user, backend } = await setup()
    backend.state.callAnswer = () => ({
      rejected: new CallNotAllowed({ state: "app.to" }),
    })

    await user.click(outcome("Richiamare"))
    await user.click(dayButton(22))
    await user.click(
      screen.getByRole("button", { name: "Salva richiamo del 22/10" })
    )

    const text =
      "Con lo stato Appuntamento non si registrano chiamate: riporta il contatto a Da chiamare per richiamarlo."
    await waitFor(() => expect(lastAlert()).toBe(text))
    expect(
      within(
        screen.getByRole("region", { name: "Registra chiamata" })
      ).getByText(text)
    ).toBeTruthy()
  })
})

describe("quando il server rifiuta (AC13, AC15)", () => {
  it.each([
    ["il contatto non esiste", new ContactNotFound(), "Contatto non trovato"],
    [
      "il contatto è stato sostituito",
      superseded(202),
      "Questo contatto è stato sostituito da uno più recente",
    ],
    [
      "il contatto è passato a un collega",
      new ContactForbidden({ assignee: "Giulia Bianchi" }),
      "Non puoi modificare questo contatto: è assegnato a Giulia Bianchi",
    ],
    [
      "l'alert è già stato lavorato",
      new CallAlreadyWorked({
        by: "Carla Bianchi",
        at: new Date("2026-10-15T07:15:00Z"),
      }),
      "Già lavorato da Carla Bianchi alle 09:15",
    ],
    [
      "lo stato non ammette chiamate",
      new CallNotAllowed({ state: "app.to" }),
      "Con lo stato Appuntamento non si registrano chiamate: riporta il contatto a Da chiamare per richiamarlo.",
    ],
    [
      "la richiesta è già stata usata",
      new RequestIdConflict(),
      "La registrazione non è andata a buon fine: premi di nuovo l'esito",
    ],
  ])(
    "%s: lo dice con le etichette, e gli esiti tornano attivi",
    async (_, error, text) => {
      const { user, backend } = await setup()
      backend.state.callAnswer = () => ({ rejected: error })

      await user.click(outcome("Non interessato"))

      await waitFor(() => expect(lastAlert()).toBe(text))
      expect(
        within(
          screen.getByRole("region", { name: "Registra chiamata" })
        ).getByText(text)
      ).toBeTruthy()
      await waitFor(() =>
        expect(outcome("Non interessato").disabled).toBe(false)
      )
    }
  )

  it.each([
    [new DeadlineInPast(), "Il richiamo si imposta da domani"],
    [new MessageTooLong(), "Il messaggio supera i 500 caratteri"],
  ])(
    "per «Richiamare» il riquadro torna aperto con la bozza e il motivo (%s)",
    async (error, text) => {
      const { user, backend } = await setup()
      backend.state.callAnswer = () => ({ rejected: error })

      await user.click(outcome("Richiamare"))
      await user.click(dayButton(22))
      await user.type(
        screen.getByRole("textbox", { name: "Messaggio" }),
        "La mia bozza"
      )
      await user.click(
        screen.getByRole("button", { name: "Salva richiamo del 22/10" })
      )

      // The panel says it, next to the draft
      await waitFor(() =>
        expect(
          screen
            .getAllByRole("alert")
            .find((node) => node.closest("form") !== null)?.textContent
        ).toBe(text)
      )
      expect(
        screen.getByRole<HTMLInputElement>("textbox", { name: "Messaggio" })
          .value
      ).toBe("La mia bozza")
    }
  )

  it("un alert futuro da confermare (caso 7): ricarica il contatto e chiede la conferma dell'alert attuale", async () => {
    const { user, backend } = await setup({ alert: expiredAlert })
    const current = {
      id: 9,
      deadline: new Date("2026-10-24T22:00:00Z"),
      message: "Impostato da un collega",
    }
    backend.state.callAnswer = (call) =>
      call.confirmedAlertId === current.id
        ? { saved: true }
        : { rejected: new AlertConfirmationRequired({ alert: current }) }
    backend.state.details = {
      101: contactDetail({
        contact: { state: "richiamare" },
        alert: current,
      }),
    }
    const reads = backend.state.detailReads.length

    await user.click(outcome("Non interessato"))

    const dialog = await screen.findByRole("dialog", {
      name: "Chiudere il richiamo?",
    })
    expect(within(dialog).getByText("Impostato da un collega")).toBeTruthy()
    expect(backend.state.detailReads.length).toBeGreaterThan(reads)
    await user.click(
      within(dialog).getByRole("button", { name: "Cambia stato" })
    )

    await waitFor(() => expect(backend.state.calls).toHaveLength(2))
    expect(backend.state.calls[1]).toMatchObject({
      outcome: "non interessato",
      workingAlertId: 9,
      confirmedAlertId: 9,
    })
  })
})

describe("l'esito incerto (AC15)", () => {
  it("non dice che la chiamata non è registrata: lo dice incerto e ricarica il contatto", async () => {
    const { user, backend } = await setup()
    backend.state.callAnswer = () => "down"
    const reads = backend.state.detailReads.length

    await user.click(outcome("Non risponde"))

    await waitFor(() => expect(lastAlert()).toBe(UNCERTAIN))
    expect(
      within(
        screen.getByRole("region", { name: "Registra chiamata" })
      ).getByText(UNCERTAIN)
    ).toBeTruthy()
    await waitFor(() =>
      expect(backend.state.detailReads.length).toBeGreaterThan(reads)
    )
    await waitFor(() => expect(outcome("Non risponde").disabled).toBe(false))
  })
})

describe("dove non si registrano chiamate (AC12)", () => {
  it.each([
    ["app.to", "Appuntamento"],
    ["caricato", "Pratica caricata"],
    ["erogata", "Pratica caricata"],
    ["non interessato", "Non interessato"],
  ] as const)(
    "con lo stato %s c'è la frase al posto degli esiti",
    async (state, label) => {
      await setup({ state })

      expect(
        screen.getByText(
          `Con lo stato ${label} non si registrano chiamate: riporta il contatto a Da chiamare per richiamarlo.`
        )
      ).toBeTruthy()
      expect(
        screen.queryByRole("group", {
          name: "Esito della chiamata a Mario Rossi",
        })
      ).toBeNull()
    }
  )

  it("un contatto sostituito non ha gli esiti", async () => {
    await openDetail([
      contactDetail({
        contact: { isActive: false },
        editability: { kind: "superseded" },
        activeTaskId: 202,
      }),
    ])

    expect(
      screen.queryByRole("group", {
        name: "Esito della chiamata a Mario Rossi",
      })
    ).toBeNull()
    expect(
      screen.queryByRole("region", { name: "Registra chiamata" })
    ).toBeNull()
  })

  it("un contatto di un collega non ha gli esiti", async () => {
    await setup({
      editability: { kind: "not_owner", assignee: "Giulia Bianchi" },
    })

    expect(
      screen.queryByRole("region", { name: "Registra chiamata" })
    ).toBeNull()
  })
})

describe("lo Storico (AC16, AC23, AC30)", () => {
  it("mostra chiamate e chiusure con chi e quando, la più recente in cima; un alert chiuso dal sistema lo dice", async () => {
    await setup({
      history: [
        {
          id: 3,
          deadline: new Date("2026-09-25T22:00:00Z"),
          message: "Prima chiamata",
          updatedAt: new Date("2026-09-26T09:30:00Z"),
          resolvedByName: null,
          resolvedBySurname: null,
        },
      ],
      closures: [
        {
          alertId: 3,
          closedAt: new Date("2026-09-26T09:30:00Z"),
          resolution: "system",
        },
      ],
      calls: [
        {
          id: 40,
          outcome: "richiamare",
          at: new Date("2026-10-01T08:00:00Z"),
          operatorName: "Anna",
          operatorSurname: "Verdi",
          callbackDeadline: null,
        },
        {
          id: 39,
          outcome: "followup",
          at: new Date("2026-09-20T08:00:00Z"),
          operatorName: "Anna",
          operatorSurname: "Verdi",
          callbackDeadline: null,
        },
      ],
    })

    const [first, second, third] = storicoItems().map(
      (item) => item.textContent
    )
    // An old Richiamare has no day; `followup` is Da chiamare (AC30)
    expect(first).toContain("Richiamo")
    expect(first).not.toContain("Richiamo ·")
    expect(first).toContain("Anna Verdi")
    expect(first).toContain("01/10 alle 10:00")
    expect(second).toContain("Chiuso dal sistema il 26/09 alle 11:30")
    expect(third).toContain("Da chiamare")
  })
})

import { act, screen, waitFor, within } from "@testing-library/react"
import { type UserEvent } from "@testing-library/user-event"
import { addDays, format, startOfDay } from "date-fns"
import { describe, expect, it } from "vitest"
import { type MyCallback } from "@mito/contract/home"
import {
  CallAlreadyWorked,
  ContactForbidden,
  ContactNotFound,
  ContactSuperseded,
  DeadlineInPast,
  Unauthorized,
} from "@mito/contract/errors"
import { fakeLavoro, myCallback } from "@/test/lavoro"
import { renderLavoro } from "./page"

const romeTime = (date: Date) =>
  new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)

const linkOf = (alertId: number) =>
  document.querySelector<HTMLElement>(`[data-callback-link="${alertId}"]`)!

const rowOf = (alertId: number) => linkOf(alertId).closest("tr")!

const outcome = (alertId: number, name: string) =>
  within(
    within(rowOf(alertId)).getByRole("group")
  ).getByRole<HTMLButtonElement>("button", { name })

const box = (title: string) =>
  screen.getByText(title, { selector: "dt" }).parentElement!

const toasts = () => document.querySelectorAll("[data-sonner-toast]")

/** Renders the rows and waits for the table */
const renderRows = async (...rows: Partial<MyCallback>[]) => {
  const backend = fakeLavoro({
    toCall: 5,
    callbacks: rows.map((row, index) =>
      myCallback({ alertId: index + 1, taskId: 101 + index, ...row })
    ),
  })
  const page = renderLavoro("/dashboard", backend)
  await waitFor(() =>
    expect(document.querySelector("[data-callback-link]")).not.toBeNull()
  )
  return { backend, ...page }
}

const openPanel = async (user: UserEvent, alertId: number) => {
  await user.click(outcome(alertId, "Richiamare"))
  return screen.findByRole("dialog")
}

/** The panel of the row with a day and a message, saved */
const saveCallback = async (user: UserEvent, alertId: number) => {
  const panel = await openPanel(user, alertId)
  const day = addDays(startOfDay(new Date()), 1)
  await user.click(
    panel.querySelector(`[data-day="${day.toLocaleDateString()}"]`)!
  )
  await user.type(
    within(panel).getByRole("textbox", { name: "Messaggio" }),
    "Dopo le 18"
  )
  await user.click(
    within(panel).getByRole("button", { name: /^Salva richiamo/ })
  )
  return { panel, save: `Salva richiamo del ${format(day, "dd/MM")}` }
}

const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))

describe("una registrazione rifiutata", () => {
  it("`ContactForbidden` con assegnatario dice «Chiamata non registrata» e «Ora è di Bruno Neri…» con «Apri il contatto», e la riga resta aperta", async () => {
    const backend = fakeLavoro({
      callbacks: [
        myCallback({
          alertId: 1,
          taskId: 101,
          name: "Anna",
          surname: "Bianchi",
        }),
      ],
    })
    backend.failWith(
      "registerCall",
      new ContactForbidden({ assignee: "Bruno Neri" })
    )
    const { user } = renderLavoro("/dashboard", backend)
    const group = await screen.findByRole("group", {
      name: "Esito della chiamata a Anna Bianchi",
    })

    await user.click(
      within(group).getByRole("button", { name: "Appuntamento" })
    )

    expect(await screen.findByText("Chiamata non registrata")).toBeTruthy()
    expect(
      screen.getByText("Ora è di Bruno Neri: la chiamata non è registrata.")
    ).toBeTruthy()
    expect(screen.getByRole("link", { name: "Apri il contatto" })).toBeTruthy()
    await waitFor(() =>
      expect(backend.state.reads.getMyCallbacks).toBeGreaterThan(1)
    )
    expect(
      within(group).getByRole("button", { name: "Appuntamento" })
    ).toBeTruthy()
    expect(screen.getByText("1 di oggi")).toBeTruthy()
  })

  it("la riga, «Fatti oggi» e i numeri restano come prima, con un avviso solo e il fuoco sul controllo (AC26, AC27)", async () => {
    const { backend, user } = await renderRows({}, {})
    await screen.findByText("Nessuna chiamata ancora")
    await waitFor(() => expect(box("Da chiamare").textContent).toContain("5"))
    const text = rowOf(1).textContent
    backend.failWith(
      "registerCall",
      new ContactForbidden({ assignee: "Bruno Neri" })
    )

    await user.click(outcome(1, "Appuntamento"))

    await screen.findByText("Chiamata non registrata")
    await waitFor(() =>
      expect(backend.state.reads.getMyCallbacks).toBeGreaterThan(1)
    )
    await settle()
    expect(toasts()).toHaveLength(1)
    expect(rowOf(1).textContent).toBe(text)
    expect(document.activeElement).toBe(outcome(1, "Appuntamento"))
    expect(screen.getByText("2 di oggi")).toBeTruthy()
    expect(backend.state.calls).toHaveLength(0)
    expect(box("Il mio oggi").textContent).toContain("Nessuna chiamata ancora")
    expect(box("Da chiamare").textContent).toContain("5")
  })

  it("dopo la ricarica una riga non più dell'utente si chiude e il fuoco va avanti (AC23, AC26, AC27)", async () => {
    const { backend, user } = await renderRows({}, {})
    backend.failWith(
      "registerCall",
      new ContactForbidden({ assignee: "Bruno Neri" })
    )
    backend.writeElsewhere({ alertId: 1 })

    await user.click(outcome(1, "Non risponde"))

    await within(rowOf(1)).findByText("Non è più fra i tuoi richiami")
    await settle()
    expect(document.activeElement).toBe(linkOf(2))
    expect(screen.getByText("1 di oggi")).toBeTruthy()
  })

  it("con il fuoco portato altrove la ricarica non lo sposta (AC26)", async () => {
    const { backend, user } = await renderRows({}, {}, {})
    backend.failWith(
      "registerCall",
      new ContactForbidden({ assignee: "Bruno Neri" })
    )
    backend.writeElsewhere({ alertId: 1 })
    const release = backend.hold("registerCall")

    await user.click(outcome(1, "Non risponde"))
    await within(rowOf(1)).findByRole("button", { name: "Registro…" })
    act(() => linkOf(3).focus())
    release()

    await within(rowOf(1)).findByText("Non è più fra i tuoi richiami")
    await settle()
    expect(document.activeElement).toBe(linkOf(3))
  })

  it("il riquadro di Richiamare resta aperto con il giorno e il messaggio, e il fuoco sul salvataggio (AC20, AC26)", async () => {
    const { backend, user } = await renderRows({})
    backend.failWith(
      "registerCall",
      new ContactForbidden({ assignee: "Bruno Neri" })
    )

    const { panel, save } = await saveCallback(user, 1)

    await screen.findByText("Chiamata non registrata")
    await settle()
    expect(screen.getByRole("dialog")).toBe(panel)
    expect(
      within(panel).getByRole<HTMLInputElement>("textbox", {
        name: "Messaggio",
      }).value
    ).toBe("Dopo le 18")
    const button = within(panel).getByRole("button", { name: save })
    expect(document.activeElement).toBe(button)
  })

  it("una nuova pressione che riesce dopo un rifiuto chiude il riquadro e la riga (AC20)", async () => {
    const { backend, user } = await renderRows({})
    backend.failWith(
      "registerCall",
      new ContactForbidden({ assignee: "Bruno Neri" })
    )
    const { panel, save } = await saveCallback(user, 1)
    await screen.findByText("Chiamata non registrata")

    backend.recover("registerCall")
    await user.click(within(panel).getByRole("button", { name: save }))

    await within(rowOf(1)).findByText(/^Richiamo il .* registrato alle /)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("il giorno già passato non dà avvisi e non ricarica: il riquadro resta con il testo sotto il calendario (AC27)", async () => {
    const { backend, user } = await renderRows({})
    backend.failWith("registerCall", new DeadlineInPast())

    const { panel } = await saveCallback(user, 1)

    const text = "Il richiamo si imposta da domani: scegli un altro giorno"
    await within(panel).findByText(text)
    await settle()
    expect(toasts()).toHaveLength(0)
    expect(backend.state.reads.getMyCallbacks).toBe(1)
    expect(screen.getByRole("dialog")).toBe(panel)
    expect(
      within(panel).getByRole<HTMLInputElement>("textbox", {
        name: "Messaggio",
      }).value
    ).toBe("Dopo le 18")
  })

  it("una nuova pressione dopo il rifiuto toglie il testo sotto il calendario (AC27)", async () => {
    const { backend, user } = await renderRows({})
    backend.failWith("registerCall", new DeadlineInPast())
    const { panel, save } = await saveCallback(user, 1)
    const text = "Il richiamo si imposta da domani: scegli un altro giorno"
    await within(panel).findByText(text)

    const release = backend.hold("registerCall")
    await user.click(within(panel).getByRole("button", { name: save }))

    await within(panel).findByRole("button", { name: "Registro…" })
    expect(within(panel).queryByText(text)).toBeNull()
    release()
    await within(panel).findByText(text)
  })

  it("già lavorato dall'utente stesso, senza un esito incerto sulla riga, avvisa: la chiamata è di un'altra pagina (AC27)", async () => {
    const at = new Date("2026-11-05T16:41:00.000Z")
    const { backend, user } = await renderRows({}, {})
    backend.failWith(
      "registerCall",
      new CallAlreadyWorked({ by: "Ada Lovelace", at })
    )

    await user.click(outcome(1, "Appuntamento"))

    const text = `Già lavorato da Ada Lovelace alle ${romeTime(at)}`
    await within(rowOf(1)).findByText(text)
    await settle()
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0]!.textContent).toContain(text)
  })

  it("la sessione scaduta dice «Accedi», senza link al contatto e senza ricarica (AC27)", async () => {
    const { backend, router, user } = await renderRows({})
    backend.failWith("registerCall", new Unauthorized())

    await user.click(outcome(1, "Appuntamento"))

    const notice = await screen.findByText("Sessione scaduta: accedi di nuovo")
    await settle()
    expect(toasts()).toHaveLength(1)
    expect(screen.queryByRole("link", { name: /Apri il contatto/ })).toBeNull()
    expect(backend.state.reads.getMyCallbacks).toBe(1)
    expect(screen.queryByText("Chiamata non registrata")).toBeNull()
    expect(notice).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Accedi" }))

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"))
  })

  it("già lavorato da un collega chiude la riga, senza stile di errore e senza link: i conteggi scendono e il fuoco avanza (AC27)", async () => {
    const at = new Date("2026-11-05T16:41:00.000Z")
    const { backend, user } = await renderRows({}, {})
    backend.failWith(
      "registerCall",
      new CallAlreadyWorked({ by: "Bruno Neri", at })
    )

    await user.click(outcome(1, "Appuntamento"))

    const text = `Già lavorato da Bruno Neri alle ${romeTime(at)}`
    await within(rowOf(1)).findByText(text)
    expect(within(rowOf(1)).queryByRole("group")).toBeNull()
    expect(screen.getByText("1 di oggi")).toBeTruthy()
    await waitFor(() =>
      expect(backend.state.reads.getMyCallbacks).toBeGreaterThan(1)
    )
    await settle()
    expect(document.activeElement).toBe(linkOf(2))
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0]!.textContent).toContain(text)
    expect(toasts()[0]!.getAttribute("data-type")).not.toBe("error")
    expect(within(toasts()[0] as HTMLElement).queryByRole("link")).toBeNull()
    expect(backend.state.calls).toHaveLength(0)
  })

  it("«Apri il contatto» apre sopra la home il contatto della riga e chiude l'avviso", async () => {
    const { backend, router, user } = await renderRows({}, { taskId: 321 })
    backend.failWith(
      "registerCall",
      new ContactForbidden({ assignee: "Bruno Neri" })
    )

    await user.click(outcome(2, "Appuntamento"))
    await user.click(
      await screen.findByRole("link", { name: "Apri il contatto" })
    )

    await waitFor(() =>
      expect(router.state.location.search).toBe("?contatto=321")
    )
    expect(router.state.location.pathname).toBe("/dashboard")
    await waitFor(() =>
      expect(screen.queryByText("Chiamata non registrata")).toBeNull()
    )
  })

  it("il sostituito apre sopra la home il contatto attuale", async () => {
    const { backend, router, user } = await renderRows({})
    backend.failWith(
      "registerCall",
      new ContactSuperseded({ activeTaskId: 555 })
    )

    await user.click(outcome(1, "Non risponde"))
    await user.click(
      await screen.findByRole("link", { name: "Apri il contatto attuale" })
    )

    await waitFor(() =>
      expect(router.state.location.search).toBe("?contatto=555")
    )
    expect(router.state.location.pathname).toBe("/dashboard")
  })

  it("il contatto che non esiste più non ha link", async () => {
    const { backend, user } = await renderRows({})
    backend.failWith("registerCall", new ContactNotFound())

    await user.click(outcome(1, "Appuntamento"))

    await screen.findByText("Il contatto non esiste più.")
    expect(toasts()).toHaveLength(1)
    expect(within(toasts()[0] as HTMLElement).queryByRole("link")).toBeNull()
  })
})

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { type UserEvent } from "@testing-library/user-event"
import { addDays, startOfDay } from "date-fns"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CallAlreadyWorked } from "@mito/contract/errors"
import { type MyCallback } from "@mito/contract/home"
import { homeKeys } from "@/api/home"
import { REGISTER_CALL_TIMEOUT_MS } from "@/api/task"
import { fakeLavoro, myCall, myCallback } from "@/test/lavoro"
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

const toasts = () => document.querySelectorAll("[data-sonner-toast]")

const diary = () => screen.getByRole("region", { name: "Fatti oggi" })

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

const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))

const WRITTEN = { unavailable: true, written: true } as const
const UNCERTAIN = "Non sappiamo se la chiamata è stata registrata"
const GONE = "Non è più fra i tuoi richiami"

afterEach(() => {
  vi.useRealTimers()
})

/** The panel of the row with a day and a message, saved */
const saveCallback = async (user: UserEvent, alertId: number) => {
  await user.click(outcome(alertId, "Richiamare"))
  const panel = await screen.findByRole("dialog")
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
  return panel
}

describe("un esito incerto", () => {
  it("con la risposta persa e la chiamata scritta avvisa senza dire che non è registrata, e la riga si chiude con l'ora di «Fatti oggi»", async () => {
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
    backend.failWith("registerCall", { unavailable: true, written: true })
    const { user } = renderLavoro("/dashboard", backend)
    const group = await screen.findByRole("group", {
      name: "Esito della chiamata a Anna Bianchi",
    })

    await user.click(
      within(group).getByRole("button", { name: "Appuntamento" })
    )

    expect(
      await screen.findByText("Non sappiamo se la chiamata è stata registrata")
    ).toBeTruthy()
    expect(
      screen.getByText(
        "Controlla in Fatti oggi: se non c'è, registrala di nuovo."
      )
    ).toBeTruthy()
    const written = backend.state.calls[0]!
    expect(
      await screen.findByText(
        `Appuntamento registrato alle ${romeTime(written.at)}`
      )
    ).toBeTruthy()
    expect(screen.queryByText("Chiamata non registrata")).toBeNull()
    expect(backend.state.calls).toHaveLength(1)
  })

  it("con la chiamata scritta il diario ne ha una sola, «Il mio oggi» la conta, e l'avviso è uno solo e non di errore (AC8, AC48)", async () => {
    const { backend, user } = await renderRows({ name: "Anna" })
    backend.failWith("registerCall", WRITTEN)

    await user.click(outcome(1, "Appuntamento"))

    await within(rowOf(1)).findByText(/^Appuntamento registrato alle /)
    await settle()
    const rows = await within(diary()).findAllByRole("row")
    expect(rows.slice(1)).toHaveLength(1)
    await waitFor(() =>
      expect(
        screen.getByText("Il mio oggi", { selector: "dt" }).parentElement!
          .textContent
      ).toContain("1 chiamata")
    )
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0]!.getAttribute("data-type")).not.toBe("error")
    expect(screen.queryByText(/non registrata/)).toBeNull()
  })

  it("non scritta: la riga resta aperta e una nuova pressione è una chiamata nuova (AC48)", async () => {
    const { backend, user } = await renderRows({})
    backend.failWith("registerCall", "unavailable")

    await user.click(outcome(1, "Appuntamento"))

    await screen.findByText(UNCERTAIN)
    await waitFor(() =>
      expect(backend.state.reads.getMyCallbacks).toBeGreaterThan(1)
    )
    await settle()
    expect(rowOf(1).textContent).not.toContain(GONE)
    expect(document.activeElement).toBe(outcome(1, "Appuntamento"))
    expect(screen.getByText("1 di oggi")).toBeTruthy()

    backend.recover("registerCall")
    await user.click(outcome(1, "Appuntamento"))

    await within(rowOf(1)).findByText(/^Appuntamento registrato alle /)
    const [first, second] = backend.state.sent
    expect(second!.requestId).not.toBe(first!.requestId)
  })

  it("un Non risponde scritto lascia la riga aperta con «tentato», dalle righe rilette", async () => {
    const { backend, user } = await renderRows({})
    backend.failWith("registerCall", WRITTEN)

    await user.click(outcome(1, "Non risponde"))

    await within(rowOf(1)).findByText("Non risponde", {
      selector: "[data-slot=badge]",
    })
    await within(rowOf(1)).findByText(
      `tentato alle ${romeTime(backend.state.calls[0]!.at)}`
    )
    expect(within(rowOf(1)).getAllByRole("button")).toHaveLength(4)
  })

  it("con l'alert chiuso altrove e il diario in errore la riga dice «Non è più fra i tuoi richiami» (AC48)", async () => {
    const { backend, user } = await renderRows({})
    backend.failWith("registerCall", "unavailable")
    backend.failWith("getMyCalls", "unavailable")
    backend.writeElsewhere({ alertId: 1 })

    await user.click(outcome(1, "Appuntamento"))

    await within(rowOf(1)).findByText(GONE, undefined, { timeout: 3000 })
  })

  it("scritta, con la rilettura delle righe fallita e il diario riletto: la riga si chiude con il proprio esito (AC48)", async () => {
    const { backend, user } = await renderRows({})
    backend.failWith("registerCall", WRITTEN)
    backend.failWith("getMyCallbacks", "unavailable")

    await user.click(outcome(1, "Appuntamento"))

    await within(rowOf(1)).findByText(
      /^Appuntamento registrato alle /,
      undefined,
      { timeout: 3000 }
    )
  })

  it("con il diario fermo e le righe già rilette non si chiude come sparita; finito il diario si chiude con il proprio esito (D8)", async () => {
    const { backend, user } = await renderRows({})
    await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(1))
    backend.failWith("registerCall", WRITTEN)
    const release = backend.hold("getMyCalls")

    await user.click(outcome(1, "Appuntamento"))
    await screen.findByText(UNCERTAIN)
    await waitFor(() =>
      expect(backend.state.reads.getMyCallbacks).toBeGreaterThan(1)
    )
    await settle()
    expect(rowOf(1).textContent).not.toContain(GONE)
    expect(rowOf(1).textContent).not.toContain("registrato alle")

    release()

    await within(rowOf(1)).findByText(/^Appuntamento registrato alle /)
  })

  it("il diario letto prima della scrittura e le righe dopo: la riga passa a sparita, e «Riprova» sul diario la chiude con il proprio esito (AC23, AC48)", async () => {
    const { backend, user } = await renderRows({})
    backend.failWith("registerCall", "unavailable")
    backend.failWith("getMyCalls", "unavailable")
    backend.writeElsewhere({ alertId: 1 })

    await user.click(outcome(1, "Appuntamento"))
    await within(rowOf(1)).findByText(GONE, undefined, { timeout: 3000 })

    const at = new Date()
    backend.writeElsewhere({
      call: myCall({
        id: 5,
        requestId: backend.state.sent[0]!.requestId,
        outcome: "app.to",
        at,
      }),
    })
    backend.recover("getMyCalls")
    await user.click(
      await within(diary()).findByRole(
        "button",
        { name: "Riprova" },
        { timeout: 3000 }
      )
    )

    await within(rowOf(1)).findByText(
      `Appuntamento registrato alle ${romeTime(at)}`
    )
    expect(rowOf(1).textContent).not.toContain(GONE)
  })

  it("due righe: il diario riletto per B ha la chiamata di A, e A si chiude anche se le ricariche seguenti falliscono (AC48)", async () => {
    const { backend, queryClient, user } = await renderRows({}, {})
    await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(1))
    backend.failWith("registerCall", WRITTEN)
    backend.failWith("getMyCallbacks", "unavailable")
    const release = backend.hold("getMyCalls")

    await user.click(outcome(1, "Appuntamento"))
    await screen.findByText(UNCERTAIN)
    backend.recover("registerCall")
    await user.click(outcome(2, "Non interessato"))
    await within(rowOf(2)).findByText(/^Non interessato registrato alle /)
    expect(rowOf(1).textContent).not.toContain("registrato alle")

    release()

    await within(rowOf(1)).findByText(/^Appuntamento registrato alle /)
    backend.failWith("getMyCalls", "unavailable")
    await act(() =>
      queryClient.invalidateQueries({ queryKey: homeKeys.today() })
    )
    await settle()
    expect(rowOf(1).textContent).toContain("Appuntamento registrato alle")
  })

  it("stessa riga: con la seconda pressione in corso il diario non la chiude; la seconda è «già lavorato» dall'utente stesso, e vince il proprio esito, senza quell'avviso (AC23, AC48)", async () => {
    const { backend, user } = await renderRows({}, {})
    await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(1))
    backend.failWith("registerCall", WRITTEN)
    const releaseDiary = backend.hold("getMyCalls")

    await user.click(outcome(1, "Appuntamento"))
    await screen.findByText(UNCERTAIN)
    const written = backend.state.calls[0]!

    backend.failWith(
      "registerCall",
      new CallAlreadyWorked({ by: "Ada Lovelace", at: written.at })
    )
    const releaseSecond = backend.hold("registerCall")
    await user.click(outcome(1, "Appuntamento"))
    await within(rowOf(1)).findByRole("button", { name: "Registro…" })

    releaseDiary()
    await within(diary()).findByRole("row", { name: /Mario/ })
    await settle()
    expect(
      within(rowOf(1)).getByRole("button", { name: "Registro…" })
    ).toBeTruthy()
    expect(rowOf(1).textContent).not.toContain("registrato alle")

    releaseSecond()

    await within(rowOf(1)).findByText(
      `Appuntamento registrato alle ${romeTime(written.at)}`
    )
    await settle()
    expect(screen.queryByText(/Già lavorato/)).toBeNull()
    expect(backend.state.calls).toHaveLength(1)
  })

  it("incerta e non scritta, poi lavorata da un collega: la nuova pressione avvisa «Già lavorato da Bruno Neri…» (AC27)", async () => {
    const { backend, user } = await renderRows({})
    backend.failWith("registerCall", "unavailable")
    await user.click(outcome(1, "Appuntamento"))
    await screen.findByText(UNCERTAIN)
    await waitFor(() =>
      expect(backend.state.reads.getMyCallbacks).toBeGreaterThan(1)
    )
    await settle()

    const at = new Date()
    backend.failWith(
      "registerCall",
      new CallAlreadyWorked({ by: "Bruno Neri", at })
    )
    await user.click(outcome(1, "Appuntamento"))

    const text = `Già lavorato da Bruno Neri alle ${romeTime(at)}`
    await within(rowOf(1)).findByText(text)
    await settle()
    expect(
      [...toasts()].filter((toast) => toast.textContent?.includes(text))
    ).toHaveLength(1)
  })

  it("con `/me` in errore il nome dell'utente non si conosce, e l'avviso «Già lavorato» compare (AC27)", async () => {
    const backend = fakeLavoro({
      toCall: 5,
      callbacks: [myCallback({ alertId: 1, taskId: 101 })],
    })
    backend.failWith("getCurrentUser", "unavailable")
    backend.failWith("registerCall", "unavailable")
    const { user } = renderLavoro("/dashboard", backend)
    await waitFor(() =>
      expect(document.querySelector("[data-callback-link]")).not.toBeNull()
    )
    await waitFor(() => expect(backend.state.reads.getCurrentUser).toBe(4))
    await user.click(outcome(1, "Appuntamento"))
    await screen.findByText(UNCERTAIN)
    await settle()

    const at = new Date()
    backend.failWith(
      "registerCall",
      new CallAlreadyWorked({ by: "Ada Lovelace", at })
    )
    await user.click(outcome(1, "Appuntamento"))

    await within(rowOf(1)).findByText(
      `Già lavorato da Ada Lovelace alle ${romeTime(at)}`
    )
    await settle()
    expect(
      [...toasts()].filter((toast) =>
        toast.textContent?.includes("Già lavorato da Ada Lovelace")
      )
    ).toHaveLength(1)
  })

  it("una risposta dopo i 15 secondi non cambia la pagina (AC48)", async () => {
    const { backend } = await renderRows({})
    const release = backend.hold("registerCall")
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout"],
      shouldAdvanceTime: true,
    })

    fireEvent.click(outcome(1, "Appuntamento"))
    await within(rowOf(1)).findByRole("button", { name: "Registro…" })
    await act(() =>
      vi.advanceTimersByTimeAsync(REGISTER_CALL_TIMEOUT_MS - 1000)
    )
    expect(screen.queryByText(UNCERTAIN)).toBeNull()

    await act(() => vi.advanceTimersByTimeAsync(1000))

    await screen.findByText(UNCERTAIN)
    await waitFor(() =>
      expect(within(rowOf(1)).queryByText("Registro…")).toBeNull()
    )
    const text = rowOf(1).textContent

    release()
    await act(() => vi.advanceTimersByTimeAsync(1000))

    expect(rowOf(1).textContent).toBe(text)
    expect(screen.getAllByText(UNCERTAIN)).toHaveLength(1)
    expect(screen.queryByText(/Registrato:/)).toBeNull()
  })

  it("su Richiamare il riquadro resta con la bozza e il fuoco; se la ricarica chiude la riga si chiude con lei e il fuoco va avanti (AC20, AC26)", async () => {
    const { backend, user } = await renderRows({}, {})
    await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(1))
    backend.failWith("registerCall", WRITTEN)
    const release = backend.hold("getMyCalls")

    const panel = await saveCallback(user, 1)

    await screen.findByText(UNCERTAIN)
    await settle()
    expect(screen.getByRole("dialog")).toBe(panel)
    expect(
      within(panel).getByRole<HTMLInputElement>("textbox", {
        name: "Messaggio",
      }).value
    ).toBe("Dopo le 18")
    expect(document.activeElement).toBe(
      within(panel).getByRole("button", { name: /^Salva richiamo/ })
    )

    release()

    await within(rowOf(1)).findByText(/^Richiamo il .* registrato alle /)
    expect(screen.queryByRole("dialog")).toBeNull()
    await settle()
    expect(document.activeElement).toBe(linkOf(2))
  })
})

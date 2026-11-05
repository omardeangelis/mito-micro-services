import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { type UserEvent } from "@testing-library/user-event"
import { addDays, format, startOfDay } from "date-fns"
import { describe, expect, it } from "vitest"
import { type MyCallback } from "@mito/contract/home"
import { homeKeys } from "@/api/home"
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

const badge = (alertId: number, name: string) =>
  within(rowOf(alertId)).findByText(name, { selector: "[data-slot=badge]" })

const box = (title: string) =>
  screen.getByText(title, { selector: "dt" }).parentElement!

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

const tomorrow = () => addDays(startOfDay(new Date()), 1)
const dayMonth = (day: Date) => format(day, "dd/MM")

const openPanel = async (user: UserEvent, alertId: number) => {
  await user.click(outcome(alertId, "Richiamare"))
  return screen.findByRole("dialog")
}

const pickTomorrow = (user: UserEvent, panel: HTMLElement) =>
  user.click(
    panel.querySelector(`[data-day="${tomorrow().toLocaleDateString()}"]`)!
  )

/** The time for a focus Radix gives back late: it does it in a timeout */
const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))

describe("registrare un esito", () => {
  it("premuto «Appuntamento», la riga dice «Appuntamento registrato alle HH:mm», i conteggi scendono e il fuoco va al cliente della riga aperta seguente", async () => {
    const { user } = renderLavoro(
      "/dashboard",
      fakeLavoro({
        callbacks: [
          myCallback({
            alertId: 1,
            taskId: 101,
            name: "Anna",
            surname: "Bianchi",
          }),
          myCallback({
            alertId: 2,
            taskId: 102,
            name: "Carlo",
            surname: "Verdi",
          }),
        ],
      })
    )
    const group = await screen.findByRole("group", {
      name: "Esito della chiamata a Anna Bianchi",
    })

    await user.click(
      within(group).getByRole("button", { name: "Appuntamento" })
    )

    expect(
      await screen.findByText(
        `Appuntamento registrato alle ${romeTime(new Date())}`
      )
    ).toBeTruthy()
    expect(screen.getByText("1 di oggi")).toBeTruthy()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("link", { name: "Carlo Verdi" })
      )
    )
  })

  it.each([
    ["Appuntamento", "app.to"],
    ["Non interessato", "non interessato"],
    ["Non risponde", "non risponde"],
  ])(
    "«%s» registra con un clic, senza conferma, sul contatto della riga (AC17)",
    async (name, value) => {
      const { backend, user } = await renderRows({}, {})

      await user.click(outcome(2, name))

      await waitFor(() => expect(backend.state.sent).toHaveLength(1))
      expect(backend.state.sent[0]).toMatchObject({
        taskId: 102,
        outcome: value,
        source: "list",
        workingAlertId: 2,
      })
      expect(screen.queryByRole("dialog")).toBeNull()
      expect(screen.queryByRole("alertdialog")).toBeNull()
    }
  )

  it("dopo «Non risponde» la riga resta aperta con il badge e «tentato alle HH:mm», i conteggi non scendono e il fuoco resta lì (AC22, AC26)", async () => {
    const { backend, user } = await renderRows({}, {})
    const pressed = outcome(1, "Non risponde")

    await user.click(pressed)

    await badge(1, "Non risponde")
    const at = backend.state.calls[0]!.at
    expect(
      within(rowOf(1)).getByText(`tentato alle ${romeTime(at)}`)
    ).toBeTruthy()
    expect(within(rowOf(1)).getAllByRole("button")).toHaveLength(4)
    expect(screen.getByText("2 di oggi")).toBeTruthy()
    expect(document.activeElement).toBe(outcome(1, "Non risponde"))
    expect(backend.state.reads.getMyCallbacks).toBe(1)
  })

  it("dopo «Appuntamento» la riga si chiude al suo posto: esiti non raggiungibili, conteggi −1, diario, «Il mio oggi» e «Da chiamare» riletti, righe no (AC23, AC35)", async () => {
    const { backend, user } = await renderRows(
      { name: "Anna", surname: "Bianchi" },
      { name: "Carlo", surname: "Verdi" }
    )
    await screen.findByText("Nessuna chiamata ancora")
    await waitFor(() => expect(box("Da chiamare").textContent).toContain("5"))

    await user.click(outcome(1, "Appuntamento"))

    await badge(1, "Appuntamento")
    const at = backend.state.calls[0]!.at
    expect(
      within(rowOf(1)).getByText(`Appuntamento registrato alle ${romeTime(at)}`)
    ).toBeTruthy()
    expect(within(rowOf(1)).queryByRole("group")).toBeNull()
    expect(within(rowOf(1)).queryByRole("button")).toBeNull()
    expect(screen.getByText("1 di oggi")).toBeTruthy()
    expect(document.querySelectorAll("[data-callback-link]")).toHaveLength(2)

    await waitFor(() =>
      expect(box("Il mio oggi").textContent).toContain("1 chiamata")
    )
    await waitFor(() => expect(box("Da chiamare").textContent).toContain("4"))
    const first = await within(diary()).findByRole("row", { name: /Anna/ })
    expect(within(diary()).getAllByRole("row")[1]).toBe(first)
    expect(first.textContent).toContain("Appuntamento")
    expect(backend.state.reads.getMyCallbacks).toBe(1)

    act(() => linkOf(1).focus())
    await user.tab()
    expect(document.activeElement).toBe(linkOf(2))
  })

  it("«Non interessato» chiude la riga con il suo testo e il suo badge (AC23)", async () => {
    const { backend, user } = await renderRows({})

    await user.click(outcome(1, "Non interessato"))

    await badge(1, "Non interessato")
    expect(
      within(rowOf(1)).getByText(
        `Non interessato registrato alle ${romeTime(backend.state.calls[0]!.at)}`
      )
    ).toBeTruthy()
  })

  it("Richiamare con giorno e messaggio registra, chiude riquadro e riga, e lo dice nell'avviso e nel diario (AC20, AC23, AC25, AC30)", async () => {
    const { backend, user } = await renderRows(
      { name: "Anna", surname: "Bianchi" },
      { name: "Carlo", surname: "Verdi" }
    )
    const day = dayMonth(tomorrow())

    const panel = await openPanel(user, 1)
    await pickTomorrow(user, panel)
    await user.type(
      within(panel).getByRole("textbox", { name: "Messaggio" }),
      "Dopo le 18"
    )
    await user.click(
      within(panel).getByRole("button", { name: `Salva richiamo del ${day}` })
    )

    await badge(1, `Richiamo · ${day}`)
    expect(backend.state.sent[0]).toMatchObject({
      taskId: 101,
      outcome: "richiamare",
      source: "list",
      workingAlertId: 1,
      callback: {
        day: format(tomorrow(), "yyyy-MM-dd"),
        message: "Dopo le 18",
      },
    })
    expect(
      within(rowOf(1)).getByText(
        `Richiamo il ${day} registrato alle ${romeTime(backend.state.calls[0]!.at)}`
      )
    ).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByText("1 di oggi")).toBeTruthy()

    const notice = await screen.findByText(
      `Registrato: richiamo il ${day} · Anna Bianchi`
    )
    expect(notice.closest("[data-sonner-toast]")!.textContent).toContain(
      "Dopo le 18"
    )

    const call = await within(diary()).findByRole("row", { name: /Anna/ })
    expect(call.textContent).toContain(`Richiamo · ${day}`)
    expect(call.textContent).toContain("Dopo le 18")

    await settle()
    expect(document.activeElement).toBe(linkOf(2))
  })

  it("un messaggio di soli spazi vale come assente, anche nell'avviso (AC20, AC25)", async () => {
    const { backend, user } = await renderRows({})
    const day = dayMonth(tomorrow())

    const panel = await openPanel(user, 1)
    await pickTomorrow(user, panel)
    await user.type(
      within(panel).getByRole("textbox", { name: "Messaggio" }),
      "   "
    )
    await user.click(
      within(panel).getByRole("button", { name: `Salva richiamo del ${day}` })
    )

    const notice = await screen.findByText(
      `Registrato: richiamo il ${day} · Mario Rossi`
    )
    expect(backend.state.sent[0]).toMatchObject({
      callback: { message: null },
    })
    expect(
      notice.closest("[data-sonner-toast]")!.querySelector("[data-description]")
    ).toBeNull()
  })

  it.each([
    ["Non risponde", "Registrato: Non risponde · Mario Rossi"],
    ["Appuntamento", "Registrato: Appuntamento · Mario Rossi"],
    ["Non interessato", "Registrato: Non interessato · Mario Rossi"],
  ])("«%s» dà un solo avviso, «%s» (AC25)", async (name, text) => {
    const { user } = await renderRows({})

    await user.click(outcome(1, name))

    await screen.findByText(text)
    await settle()
    expect(screen.getAllByText(text)).toHaveLength(1)
    expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(1)
  })

  it("con tutte le righe chiuse la tabella resta, con «· 0» nei gruppi e «0 di oggi» in testata (AC12, AC13, AC23)", async () => {
    const { user } = await renderRows({ daysLate: 2 }, { daysLate: 0 })
    expect(screen.getByText("1 scaduto · 1 di oggi")).toBeTruthy()

    await user.click(outcome(1, "Appuntamento"))
    await badge(1, "Appuntamento")
    await user.click(outcome(2, "Non interessato"))
    await badge(2, "Non interessato")

    expect(
      screen.getByRole("columnheader", { name: "Scaduti · 0" })
    ).toBeTruthy()
    expect(
      screen.getByRole("columnheader", { name: "Di oggi · 0" })
    ).toBeTruthy()
    expect(screen.getByText("0 di oggi")).toBeTruthy()
    expect(screen.queryByText("Nessun richiamo da fare.")).toBeNull()
  })
})

describe("le letture attorno a una registrazione (D8)", () => {
  it("una lettura delle righe partita prima di un Non risponde e finita dopo non toglie badge e «tentato» (AC22)", async () => {
    const { backend, queryClient, user } = await renderRows({})

    const release = backend.hold("getMyCallbacks", { snapshot: true })
    void queryClient.invalidateQueries({ queryKey: homeKeys.rows() })
    await waitFor(() => expect(backend.state.reads.getMyCallbacks).toBe(2))

    await user.click(outcome(1, "Non risponde"))
    await badge(1, "Non risponde")
    const text = rowOf(1).textContent

    release()
    await waitFor(() =>
      expect(queryClient.getQueryState(homeKeys.callbacks())?.fetchStatus).toBe(
        "idle"
      )
    )
    await settle()

    await badge(1, "Non risponde")
    expect(rowOf(1).textContent).toBe(text)
    expect(rowOf(1).textContent).toContain("tentato alle")
  })

  it("con le righe già lette e il diario fermo, la fine del diario dopo un Non risponde non toglie badge e «tentato» (AC22)", async () => {
    const { backend, queryClient, user } = await renderRows({})
    await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(1))

    const release = backend.hold("getMyCalls")
    void queryClient.invalidateQueries({ queryKey: homeKeys.calls() })
    await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(2))

    await user.click(outcome(1, "Non risponde"))
    await badge(1, "Non risponde")

    release()
    await within(diary()).findByRole("row", { name: /Mario/ })
    await settle()

    await badge(1, "Non risponde")
    expect(rowOf(1).textContent).toContain("tentato alle")
  })

  it("con un invio in corso una lettura delle righe non tocca la riga: la chiamata scritta non la fa risultare sparita (AC23)", async () => {
    const { backend, queryClient, user } = await renderRows({})
    const release = backend.hold("registerCall", { afterWrite: true })

    await user.click(outcome(1, "Appuntamento"))
    await waitFor(() => expect(backend.state.calls).toHaveLength(1))
    await act(() =>
      queryClient.invalidateQueries({ queryKey: homeKeys.rows() })
    )
    await waitFor(() => expect(backend.state.reads.getMyCallbacks).toBe(2))
    await settle()

    expect(rowOf(1).textContent).not.toContain("Non è più fra i tuoi richiami")
    expect(
      within(rowOf(1)).getByRole("button", { name: "Registro…" })
    ).toBeTruthy()

    release()
    await badge(1, "Appuntamento")
    expect(rowOf(1).textContent).toContain("Appuntamento registrato alle")
  })
})

describe("il riquadro «Richiamare» sulla riga", () => {
  it("ha il titolo, il testo e il salvataggio dei criteri (AC18, AC19)", async () => {
    const { user } = await renderRows({ name: "Anna", surname: "Bianchi" })

    const panel = await openPanel(user, 1)

    expect(within(panel).getByText("Richiamare Anna Bianchi")).toBeTruthy()
    expect(
      within(panel).getByText(
        "Ha risposto e vuole essere richiamato. Se non ha risposto, usa Non risponde."
      )
    ).toBeTruthy()
    expect(
      within(panel).getByRole<HTMLButtonElement>("button", {
        name: "Scegli il giorno",
      }).disabled
    ).toBe(true)

    await pickTomorrow(user, panel)

    expect(
      within(panel).getByRole("button", {
        name: `Salva richiamo del ${dayMonth(tomorrow())}`,
      })
    ).toBeTruthy()
  })

  it("il messaggio si ferma a 500 caratteri (AC47)", async () => {
    const { user } = await renderRows({})

    const panel = await openPanel(user, 1)
    await user.click(within(panel).getByRole("textbox", { name: "Messaggio" }))
    await user.paste("a".repeat(600))

    expect(
      within(panel).getByRole<HTMLInputElement>("textbox", {
        name: "Messaggio",
      }).value
    ).toHaveLength(500)
    expect(within(panel).getByText("Massimo 500 caratteri")).toBeTruthy()
  })

  it("la bozza resta dopo Esc, dopo un Non risponde sulla riga e dopo una rilettura, e ogni riga ha la sua (AC21)", async () => {
    const { backend, queryClient, user } = await renderRows({}, {})
    const save = `Salva richiamo del ${dayMonth(tomorrow())}`

    const panel = await openPanel(user, 1)
    await pickTomorrow(user, panel)
    await user.type(
      within(panel).getByRole("textbox", { name: "Messaggio" }),
      "Bozza"
    )
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    await user.click(outcome(1, "Non risponde"))
    await badge(1, "Non risponde")
    await act(() =>
      queryClient.invalidateQueries({ queryKey: homeKeys.rows() })
    )
    await waitFor(() => expect(backend.state.reads.getMyCallbacks).toBe(2))

    const other = await openPanel(user, 2)
    expect(
      within(other).getByRole<HTMLInputElement>("textbox", {
        name: "Messaggio",
      }).value
    ).toBe("")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    const again = await openPanel(user, 1)
    expect(
      within(again).getByRole<HTMLInputElement>("textbox", {
        name: "Messaggio",
      }).value
    ).toBe("Bozza")
    expect(within(again).getByRole("button", { name: save })).toBeTruthy()
  })

  it("aprire «Richiamare» di un'altra riga chiude il riquadro aperto (AC46)", async () => {
    const { user } = await renderRows(
      { name: "Anna", surname: "Bianchi" },
      { name: "Carlo", surname: "Verdi" }
    )

    await openPanel(user, 1)
    await user.click(outcome(2, "Richiamare"))

    await waitFor(() =>
      expect(screen.getByRole("dialog").textContent).toContain(
        "Richiamare Carlo Verdi"
      )
    )
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
  })

  it("una riga chiusa da una ricarica chiude il suo riquadro, e il fuoco che era dentro va avanti (AC20)", async () => {
    const { backend, queryClient, user } = await renderRows({}, {})

    await openPanel(user, 1)
    backend.writeElsewhere({ alertId: 1 })
    await act(() =>
      queryClient.invalidateQueries({ queryKey: homeKeys.rows() })
    )

    await within(rowOf(1)).findByText("Non è più fra i tuoi richiami")
    expect(screen.queryByRole("dialog")).toBeNull()
    await settle()
    expect(document.activeElement).toBe(linkOf(2))
  })

  it("una ricarica che chiude una riga senza il fuoco non lo sposta (AC20)", async () => {
    const { backend, queryClient, user } = await renderRows({}, {}, {})

    await user.click(outcome(1, "Non risponde"))
    await badge(1, "Non risponde")
    backend.writeElsewhere({ alertId: 2 })
    await act(() =>
      queryClient.invalidateQueries({ queryKey: homeKeys.rows() })
    )

    await within(rowOf(2)).findByText("Non è più fra i tuoi richiami")
    expect(document.activeElement).toBe(outcome(1, "Non risponde"))
  })
})

describe("mentre registra (AC20, AC26)", () => {
  it("due clic rapidi registrano una sola chiamata e la riga sotto non cambia", async () => {
    const { backend, user } = await renderRows({}, {})
    const release = backend.hold("registerCall")

    await user.dblClick(outcome(1, "Appuntamento"))

    await waitFor(() => expect(backend.state.sent).toHaveLength(1))
    expect(outcome(2, "Appuntamento").disabled).toBe(false)
    expect(within(rowOf(2)).queryByText("Registro…")).toBeNull()
    release()
    await badge(1, "Appuntamento")
    await settle()
    expect(backend.state.sent).toHaveLength(1)
    expect(backend.state.calls).toHaveLength(1)
  })

  it("due clic nello stesso tick registrano una sola chiamata", async () => {
    const { backend } = await renderRows({})
    const pressed = outcome(1, "Non risponde")

    act(() => {
      fireEvent.click(pressed)
      fireEvent.click(pressed)
    })

    await badge(1, "Non risponde")
    await settle()
    expect(backend.state.sent).toHaveLength(1)
  })

  it("il pulsante dice «Registro…», tiene il fuoco, e gli altri esiti della riga non registrano", async () => {
    const { backend, user } = await renderRows({})
    const release = backend.hold("registerCall")

    await user.click(outcome(1, "Non risponde"))

    const pressed = await within(rowOf(1)).findByRole("button", {
      name: "Registro…",
    })
    expect(document.activeElement).toBe(pressed)
    expect(pressed.getAttribute("aria-disabled")).toBe("true")
    expect(outcome(1, "Appuntamento").disabled).toBe(true)
    expect(outcome(1, "Richiamare").disabled).toBe(true)
    await user.click(pressed)

    release()
    await badge(1, "Non risponde")
    expect(backend.state.sent).toHaveLength(1)
  })

  it("il riquadro resta aperto con «Registro…», Esc non lo chiude, e nell'attesa si lavora un'altra riga", async () => {
    const { backend, user } = await renderRows({}, {})
    const panel = await openPanel(user, 1)
    await pickTomorrow(user, panel)
    const first = backend.hold("registerCall")

    await user.click(
      within(panel).getByRole("button", { name: /^Salva richiamo/ })
    )

    const saving = await within(panel).findByRole("button", {
      name: "Registro…",
    })
    expect(document.activeElement).toBe(saving)
    await user.keyboard("{Escape}")
    await settle()
    expect(screen.getByRole("dialog")).toBe(panel)

    const second = backend.hold("registerCall")
    await user.click(outcome(2, "Appuntamento"))
    second()
    await badge(2, "Appuntamento")
    expect(screen.getByRole("dialog")).toBe(panel)
    expect(screen.getByText("1 di oggi")).toBeTruthy()

    first()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await within(rowOf(1)).findByText(/^Richiamo il .* registrato alle /)
    expect(screen.getByText("0 di oggi")).toBeTruthy()
  })
})

describe("il fuoco dopo la chiusura (AC23)", () => {
  it("va alla prima riga aperta sotto, poi all'ultima sopra, infine alla riga stessa", async () => {
    const { user } = await renderRows({}, {}, {})

    await user.click(outcome(2, "Appuntamento"))
    await badge(2, "Appuntamento")
    await settle()
    expect(document.activeElement).toBe(linkOf(3))

    await user.click(outcome(3, "Non interessato"))
    await badge(3, "Non interessato")
    await settle()
    expect(document.activeElement).toBe(linkOf(1))

    await user.click(outcome(1, "Appuntamento"))
    await badge(1, "Appuntamento")
    await settle()
    expect(document.activeElement).toBe(linkOf(1))
  })

  it("resta dove l'ha portato l'utente durante l'attesa", async () => {
    const { backend, user } = await renderRows({}, {}, {})
    const release = backend.hold("registerCall")

    await user.click(outcome(1, "Appuntamento"))
    await within(rowOf(1)).findByRole("button", { name: "Registro…" })
    act(() => linkOf(3).focus())
    release()

    await badge(1, "Appuntamento")
    await settle()
    expect(document.activeElement).toBe(linkOf(3))
  })

  it("dal riquadro di «Richiamare» non torna al pulsante della riga", async () => {
    const { user } = await renderRows({})

    const panel = await openPanel(user, 1)
    await pickTomorrow(user, panel)
    await user.click(
      within(panel).getByRole("button", { name: /^Salva richiamo/ })
    )

    await within(rowOf(1)).findByText(/^Richiamo il .* registrato alle /)
    await settle()
    expect(document.activeElement).toBe(linkOf(1))
  })
})

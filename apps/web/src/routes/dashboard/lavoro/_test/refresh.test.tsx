import { act, screen, waitFor, within } from "@testing-library/react"
import { type UserEvent } from "@testing-library/user-event"
import { addDays, startOfDay } from "date-fns"
import { describe, expect, it } from "vitest"
import { ContactForbidden, DeadlineInPast } from "@mito/contract/errors"
import { type MyCallback } from "@mito/contract/home"
import { fakeLavoro, myCall, myCallback } from "@/test/lavoro"
import { renderLavoro } from "./page"

const linkOf = (alertId: number) =>
  document.querySelector<HTMLElement>(`[data-callback-link="${alertId}"]`)!

const rowOf = (alertId: number) => linkOf(alertId).closest("tr")!

const outcome = (alertId: number, name: string) =>
  within(
    within(rowOf(alertId)).getByRole("group")
  ).getByRole<HTMLButtonElement>("button", { name })

const toasts = () => document.querySelectorAll("[data-sonner-toast]")

const UNCERTAIN_TITLE = "Non sappiamo se la chiamata è stata registrata"

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

const pick = (user: UserEvent, panel: HTMLElement, day: Date) =>
  user.click(panel.querySelector(`[data-day="${day.toLocaleDateString()}"]`)!)

const section = () => screen.getByRole("region", { name: "Richiami da fare" })

/** The user is back on the tab: what the browser sends, not a read of ours */
const backToTab = () =>
  act(() => {
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))
  })

type Page = ReturnType<typeof renderLavoro>

const goTo = async (router: Page["router"], path: string) => {
  await act(async () => {
    await router.navigate(path)
  })
}

describe("il ritorno alla scheda (AC36)", () => {
  it("una riga chiusa altrove si chiude al suo posto, senza scheletro, e i conteggi scendono", async () => {
    const { backend } = await renderRows({}, {})
    let skeleton = false
    const observer = new MutationObserver(() => {
      skeleton ||= within(section()).queryByRole("status") !== null
    })
    observer.observe(section(), { childList: true, subtree: true })

    backend.writeElsewhere({ alertId: 1 })
    backToTab()

    await within(rowOf(1)).findByText("Non è più fra i tuoi richiami")
    observer.disconnect()
    expect(skeleton).toBe(false)
    expect(screen.getByText("1 di oggi")).toBeTruthy()
  })

  it("con il diario fermo la riga chiusa altrove si chiude subito (AC36, AC37)", async () => {
    const { backend } = await renderRows({}, {})
    await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(1))
    backend.hold("getMyCalls")

    backend.writeElsewhere({ alertId: 1 })
    backToTab()

    await within(rowOf(1)).findByText("Non è più fra i tuoi richiami")
  })

  it("scrittura in ritardo: dopo una ricarica senza la chiamata, il ritorno alla scheda chiude la riga con il proprio esito (AC23)", async () => {
    const { backend, user } = await renderRows({})
    backend.failWith("registerCall", "unavailable")

    await user.click(outcome(1, "Appuntamento"))
    await screen.findByText("Non sappiamo se la chiamata è stata registrata")
    await waitFor(() =>
      expect(backend.state.reads.getMyCalls).toBeGreaterThan(1)
    )
    await settle()
    expect(rowOf(1).textContent).not.toContain("registrato alle")

    backend.writeElsewhere({
      alertId: 1,
      call: myCall({
        id: 5,
        requestId: backend.state.sent[0]!.requestId,
        outcome: "app.to",
        at: new Date(),
      }),
    })
    backToTab()

    await within(rowOf(1)).findByText(/^Appuntamento registrato alle /)
    expect(rowOf(1).textContent).not.toContain("Non è più")
  })
})

describe("un nuovo caricamento della home (AC12, AC23)", () => {
  it("le righe chiuse non ci sono più e un gruppo vuoto non ha intestazione", async () => {
    const { router, user } = await renderRows({ daysLate: 2 }, { daysLate: 0 })

    await user.click(outcome(1, "Appuntamento"))
    await within(rowOf(1)).findByText(/^Appuntamento registrato alle /)
    expect(
      screen.getByRole("columnheader", { name: "Scaduti · 0" })
    ).toBeTruthy()

    await goTo(router, "/altrove")
    await screen.findByText("altra pagina")
    // `gcTime: 0` takes the rows out of the cache in the next timeout
    await settle()
    await goTo(router, "/dashboard")

    await waitFor(() => expect(linkOf(2)).not.toBeNull())
    expect(linkOf(1)).toBeNull()
    expect(screen.queryByRole("columnheader", { name: /^Scaduti/ })).toBeNull()
    expect(
      screen.getByRole("columnheader", { name: "Di oggi · 1" })
    ).toBeTruthy()
  })
})

describe("uscire con un invio in corso (AC52)", () => {
  /** Leaves with the press held, then lets the answer come */
  const leaveAndAnswer = async (
    router: Page["router"],
    release: () => void
  ) => {
    await goTo(router, "/altrove")
    await screen.findByText("altra pagina")
    release()
  }

  it("la riuscita compare come avviso, senza rileggere le righe", async () => {
    const { backend, router, user } = await renderRows({})
    const release = backend.hold("registerCall")

    await user.click(outcome(1, "Appuntamento"))
    await leaveAndAnswer(router, release)

    await screen.findByText("Registrato: Appuntamento · Mario Rossi")
    expect(backend.state.reads.getMyCallbacks).toBe(1)
  })

  it("il rifiuto compare con i suoi testi", async () => {
    const { backend, router, user } = await renderRows({})
    backend.failWith(
      "registerCall",
      new ContactForbidden({ assignee: "Bruno Neri" })
    )
    const release = backend.hold("registerCall")

    await user.click(outcome(1, "Appuntamento"))
    await leaveAndAnswer(router, release)

    await screen.findByText(
      "Ora è di Bruno Neri: la chiamata non è registrata."
    )
    expect(screen.getByRole("link", { name: "Apri il contatto" })).toBeTruthy()
    expect(backend.state.reads.getMyCallbacks).toBe(1)
  })

  it("l'esito incerto compare con i suoi testi, senza rileggere le righe", async () => {
    const { backend, router, user } = await renderRows({})
    backend.failWith("registerCall", "unavailable")
    const release = backend.hold("registerCall")

    await user.click(outcome(1, "Appuntamento"))
    await leaveAndAnswer(router, release)

    await screen.findByText("Non sappiamo se la chiamata è stata registrata")
    await settle()
    expect(toasts()).toHaveLength(1)
    expect(backend.state.reads.getMyCallbacks).toBe(1)
  })

  it("il giorno già passato diventa un avviso con «Apri il contatto»", async () => {
    const { backend, router, user } = await renderRows({
      name: "Anna",
      surname: "Bianchi",
    })
    backend.failWith("registerCall", new DeadlineInPast())
    await user.click(outcome(1, "Richiamare"))
    const panel = await screen.findByRole("dialog")
    const day = addDays(startOfDay(new Date()), 1)
    await pick(user, panel, day)
    const release = backend.hold("registerCall")
    await user.click(
      within(panel).getByRole("button", { name: /^Salva richiamo/ })
    )
    await within(panel).findByRole("button", { name: "Registro…" })

    await leaveAndAnswer(router, release)

    await screen.findByText(
      "Richiamo per Anna Bianchi non salvato: il giorno è già passato"
    )
    await user.click(screen.getByRole("link", { name: "Apri il contatto" }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/dashboard/contatti/101")
    )
  })

  it("rientrati, le righe restano come caricate e libere, il diario e i numeri si aggiornano", async () => {
    const { backend, router, user } = await renderRows({})
    const release = backend.hold("registerCall")

    await user.click(outcome(1, "Appuntamento"))
    await goTo(router, "/altrove")
    await screen.findByText("altra pagina")
    // `gcTime: 0` takes the rows out of the cache in the next timeout
    await settle()
    await goTo(router, "/dashboard")
    await waitFor(() => expect(linkOf(1)).not.toBeNull())
    expect(outcome(1, "Appuntamento").disabled).toBe(false)
    const reads = backend.state.reads.getMyCallbacks
    const text = rowOf(1).textContent

    release()

    await screen.findByText("Registrato: Appuntamento · Mario Rossi")
    await within(diary()).findByRole("row", { name: /Mario/ })
    await settle()
    expect(rowOf(1).textContent).toBe(text)
    expect(backend.state.reads.getMyCallbacks).toBe(reads)
  })

  it.each([
    ["incerta", "unavailable" as const, UNCERTAIN_TITLE],
    [
      "rifiutata",
      new ContactForbidden({ assignee: "Bruno Neri" }),
      "Ora è di Bruno Neri: la chiamata non è registrata.",
    ],
  ])(
    "una risposta %s che arriva con una nuova home montata non rilegge le righe",
    async (_kind, failure, notice) => {
      const { backend, router, user } = await renderRows({})
      backend.failWith("registerCall", failure)
      const release = backend.hold("registerCall")

      await user.click(outcome(1, "Appuntamento"))
      await goTo(router, "/altrove")
      await screen.findByText("altra pagina")
      // `gcTime: 0` takes the rows out of the cache in the next timeout
      await settle()
      await goTo(router, "/dashboard")
      await waitFor(() => expect(linkOf(1)).not.toBeNull())
      const reads = backend.state.reads.getMyCallbacks
      const text = rowOf(1).textContent

      release()

      await screen.findByText(notice)
      await settle()
      expect(rowOf(1).textContent).toBe(text)
      expect(backend.state.reads.getMyCallbacks).toBe(reads)
    }
  )
})

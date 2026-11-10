import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { type UserEvent } from "@testing-library/user-event"
import { addDays, startOfDay } from "date-fns"
import { describe, expect, it } from "vitest"
import {
  ContactForbidden,
  ContactSuperseded,
  Unauthorized,
} from "@mito/contract/errors"
import { type MyCallback } from "@mito/contract/home"
import { contactDetail } from "@/test/contacts"
import { fakeLavoro, myCall, myCallback } from "@/test/lavoro"
import { renderLavoro } from "./page"

const callbacks = Array.from({ length: 12 }, (_, index) =>
  myCallback({
    alertId: index + 1,
    taskId: 101,
    name: "Anna",
    surname: `Riga${index + 1}`,
  })
)

const linkOf = (alertId: number) =>
  document.querySelector<HTMLAnchorElement>(
    `[data-callback-link="${alertId}"]`
  )!

const rowOf = (alertId: number) => linkOf(alertId).closest("tr")!

const outcome = (alertId: number, name: string) =>
  within(
    within(rowOf(alertId)).getByRole("group")
  ).getByRole<HTMLButtonElement>("button", { name })

const inSheet = (name: string) =>
  within(
    within(screen.getByRole("dialog")).getByRole("group", {
      name: "Esito della chiamata a Mario Rossi",
    })
  ).getByRole("button", { name })

const box = (title: string) =>
  screen.getByText(title, { selector: "dt" }).parentElement!

const diary = () => screen.getByRole("region", { name: "Fatti oggi" })

const readsOf = (backend: ReturnType<typeof fakeLavoro>) => ({
  ...backend.state.reads,
})

/** A row for each entry, with its own contact, from 101; the contacts exist */
const renderRows = async (
  path: string,
  rows: Partial<MyCallback>[],
  options: Parameters<typeof fakeLavoro>[0] = {}
) => {
  const callbacks = rows.map((row, index) =>
    myCallback({ alertId: index + 1, taskId: 101 + index, ...row })
  )
  const backend = fakeLavoro({
    toCall: 5,
    callbacks,
    details: Object.fromEntries(
      callbacks.map(({ taskId }) => [
        taskId,
        contactDetail({ contact: { id: taskId } }),
      ])
    ),
    ...options,
  })
  const page = renderLavoro(path, backend)
  await waitFor(() => expect(linkOf(1)).not.toBeNull())
  await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(1))
  await screen.findByText("Il mio oggi", { selector: "dt" })
  return { backend, ...page }
}

/** Any skeleton of the home from here on: `seen()` says whether one came */
const watchSkeletons = () => {
  const view = document.querySelector("[data-lavoro-scroll]")!
  let skeleton = false
  const observer = new MutationObserver(() => {
    skeleton ||= view.textContent?.includes("Caricamento") === true
  })
  observer.observe(view, { childList: true, subtree: true })
  return {
    seen: () => {
      observer.disconnect()
      return skeleton
    },
  }
}

type Page = Awaited<ReturnType<typeof renderRows>>

/** A press on row 1 held by the server, with the sheet of row 2 open over it */
const pressWithSheetOpen = async ({ backend, user }: Page) => {
  const release = backend.hold("registerCall")
  await user.click(outcome(1, "Appuntamento"))
  await user.click(linkOf(2))
  await screen.findByRole("heading", { name: "Rossi Mario" })
  await waitFor(() => expect(backend.detail.detailReads).toHaveLength(1))
  await screen.findByText("Avvia una chat")
  return release
}

/** Time for the retries of a read that fails, and for what they would show */
const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))

const closeWithEsc = ({ user }: Page) => user.keyboard("{Escape}")

const closeWithBack = ({ router }: Page) =>
  act(async () => {
    await router.navigate(-1)
  })

const closeWithX = ({ user }: Page) =>
  user.click(screen.getByRole("button", { name: "Chiudi" }))

const closeOutside = async ({ user }: Page) => {
  const overlay = document.querySelector(
    "[data-slot=sheet-overlay], [data-radix-dialog-overlay]"
  )
  await user.click(overlay ?? document.body)
}

const closed = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

const pickTomorrow = (user: UserEvent, panel: HTMLElement) =>
  user.click(
    panel.querySelector(
      `[data-day="${addDays(startOfDay(new Date()), 1).toLocaleDateString()}"]`
    )!
  )

describe("il dettaglio sopra la home", () => {
  it("scorsa la tabella e aperto un contatto, Esc riporta la vista con le stesse righe, lo stesso scorrimento, nessuno scheletro e il fuoco sul nome", async () => {
    const backend = fakeLavoro({
      callbacks,
      details: { 101: contactDetail() },
    })
    const { user } = renderLavoro("/dashboard", backend)
    const link = await screen.findByRole("link", { name: "Anna Riga3" })
    const scroller = document.querySelector<HTMLElement>(
      "[data-lavoro-scroll]"
    )!
    scroller.scrollTop = 800

    await user.click(link)
    await screen.findByRole("dialog")
    expect(window.location.search).toBe("?contatto=101")
    await screen.findByText("Rossi Mario")

    await user.keyboard("{Escape}")

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(window.location.search).toBe("")
    expect(screen.queryByRole("status", { name: /Caricamento/ })).toBeNull()
    expect(scroller.isConnected).toBe(true)
    expect(scroller.scrollTop).toBe(800)
    expect(
      screen
        .getAllByRole("link", { name: /^Anna Riga/ })
        .map((row) => row.textContent)
    ).toEqual(callbacks.map(({ surname }) => `Anna ${surname}`))
    await waitFor(() => expect(document.activeElement).toBe(link))
  })

  it("il clic sul nome di una riga e su una riga di «Fatti oggi» apre il foglio, la vista resta e nessuna parte si rilegge", async () => {
    const page = await renderRows("/dashboard", [{}], {
      calls: [myCall({ taskId: 101, name: "Dora", surname: "Neri" })],
    })
    const { backend, user } = page
    const section = screen.getByRole("region", { name: "Richiami da fare" })
    const reads = readsOf(backend)

    await user.click(linkOf(1))
    await screen.findByText("Rossi Mario")
    expect(window.location.pathname).toBe("/dashboard")
    expect(section.isConnected).toBe(true)
    await closeWithEsc(page)
    await closed()
    await waitFor(() =>
      expect(backend.state.reads.getMyCallbacks).toBe(reads.getMyCallbacks + 1)
    )
    const after = readsOf(backend)

    await user.click(screen.getByRole("link", { name: "Dora Neri" }))
    await screen.findByText("Rossi Mario")

    expect(window.location.search).toBe("?contatto=101")
    expect(section.isConnected).toBe(true)
    expect(readsOf(backend)).toEqual(after)
  })

  it.each([
    ["Esc", closeWithEsc],
    ["l'indietro", closeWithBack],
  ])(
    "chiuso con %s tutto è com'era: righe chiuse, scorrimento, «Fatti oggi» per intero, bozza e fuoco",
    async (_how, close) => {
      const page = await renderRows("/dashboard", [{}, {}, {}, {}], {
        calls: Array.from({ length: 9 }, (_, index) =>
          myCall({ id: index + 1, taskId: 104 })
        ),
      })
      const { user } = page
      await user.click(outcome(1, "Appuntamento"))
      await user.click(outcome(2, "Non interessato"))
      await within(rowOf(1)).findByText(/^Appuntamento registrato alle /)
      await within(rowOf(2)).findByText(/^Non interessato registrato alle /)
      await user.click(
        screen.getByRole("button", { name: /^Mostra tutte le / })
      )
      await user.click(outcome(3, "Richiamare"))
      const panel = await screen.findByRole("dialog")
      await pickTomorrow(user, panel)
      await user.type(
        within(panel).getByRole("textbox", { name: "Messaggio" }),
        "Bozza"
      )
      await user.keyboard("{Escape}")
      await closed()
      const link = linkOf(4)
      const scroller = document.querySelector<HTMLElement>(
        "[data-lavoro-scroll]"
      )!
      scroller.scrollTop = 800
      const order = () =>
        [...document.querySelectorAll("[data-callback-link]")].map(
          (row) => row.textContent
        )
      const before = order()
      const skeletons = watchSkeletons()

      await user.click(link)
      await screen.findByText("Rossi Mario")
      await close(page)
      await closed()
      await waitFor(() => expect(document.activeElement).toBe(link))

      expect(window.location.search).toBe("")
      expect(skeletons.seen()).toBe(false)
      expect(scroller.scrollTop).toBe(800)
      expect(order()).toEqual(before)
      expect(
        within(rowOf(1)).getByText(/^Appuntamento registrato/)
      ).toBeTruthy()
      expect(
        screen.getByRole("button", { name: "Mostra solo le ultime" })
      ).toBeTruthy()
      await user.click(outcome(3, "Richiamare"))
      expect(
        within(await screen.findByRole("dialog")).getByRole<HTMLInputElement>(
          "textbox",
          { name: "Messaggio" }
        ).value
      ).toBe("Bozza")
    }
  )

  it.each([
    ["la X", closeWithX],
    ["un clic fuori", closeOutside],
  ])("chiuso con %s il fuoco torna sul link", async (_how, close) => {
    const page = await renderRows("/dashboard", [{}, {}])
    const link = linkOf(2)

    await page.user.click(link)
    await screen.findByRole("heading", { name: "Rossi Mario" })
    await close(page)

    await closed()
    await waitFor(() => expect(document.activeElement).toBe(link))
  })

  it("dopo la chiusura con la X l'indietro non riapre il foglio", async () => {
    const page = await renderRows("/dashboard", [{}])

    await page.user.click(linkOf(1))
    await screen.findByRole("heading", { name: "Rossi Mario" })
    await closeWithX(page)
    await closed()
    await closeWithBack(page)

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(window.location.search).toBe("")
  })

  it("una chiamata registrata nel foglio è in diario e nel mio oggi, la riga si chiude al suo posto e i conteggi scendono una volta", async () => {
    const page = await renderRows("/dashboard", [{ name: "Anna" }, {}])
    const { backend, user } = page
    const link = linkOf(1)
    expect(screen.getByText("2 di oggi")).toBeTruthy()

    await user.click(link)
    await screen.findByRole("heading", { name: "Rossi Mario" })
    await user.click(inSheet("Appuntamento"))
    await waitFor(() => expect(backend.state.calls).toHaveLength(1))
    await closeWithEsc(page)
    await closed()

    await within(rowOf(1)).findByText("Non è più fra i tuoi richiami")
    expect(linkOf(1)).toBe(link)
    expect(
      [...document.querySelectorAll("[data-callback-link]")].map((row) =>
        row.getAttribute("data-callback-link")
      )
    ).toEqual(["1", "2"])
    expect(screen.getByText("1 di oggi")).toBeTruthy()
    await within(diary()).findByRole("link", { name: "Anna Rossi" })
    await waitFor(() => expect(box("Il mio oggi").textContent).toContain("1"))
    await waitFor(() => expect(document.activeElement).toBe(link))
    expect(backend.state.sent).toHaveLength(1)
  })

  it("un alert tolto nel foglio chiude la riga al suo posto", async () => {
    const alert = {
      id: 1,
      deadline: new Date("2026-10-15T08:00:00.000Z"),
      message: null,
    }
    const page = await renderRows("/dashboard", [{}, {}], {
      details: { 101: contactDetail({ alert }) },
    })
    const { user } = page

    await user.click(linkOf(1))
    await user.click(
      await screen.findByRole("button", { name: "Togli il richiamo" })
    )
    const confirm = await screen.findByRole("dialog", {
      name: "Togli il richiamo",
    })
    await user.click(within(confirm).getAllByRole("radio")[0]!)
    await user.click(
      within(confirm).getByRole("button", { name: /^(Togli|Conferma)/ })
    )
    await waitFor(() => expect(page.backend.state.callbacks).toHaveLength(1))
    await closeWithEsc(page)
    await closed()

    await within(rowOf(1)).findByText("Non è più fra i tuoi richiami")
    expect(screen.getByText("1 di oggi")).toBeTruthy()
  })

  it("con Non risponde registrato nel foglio la riga resta aperta con il badge e «tentato»", async () => {
    const page = await renderRows("/dashboard", [{}, {}])
    const { backend, user } = page

    await user.click(linkOf(1))
    await screen.findByRole("heading", { name: "Rossi Mario" })
    await user.click(inSheet("Non risponde"))
    await waitFor(() => expect(backend.state.calls).toHaveLength(1))
    await closeWithEsc(page)
    await closed()

    await within(rowOf(1)).findByText("Non risponde", {
      selector: "[data-slot=badge]",
    })
    expect(rowOf(1).textContent).toContain("tentato alle")
    expect(rowOf(1).textContent).not.toContain("Non è più")
    expect(screen.getByText("2 di oggi")).toBeTruthy()
  })

  it("«Vai al contatto attivo» resta sull'indirizzo della home, non è una chiusura e la chiusura torna al punto di prima", async () => {
    const page = await renderRows("/dashboard", [{}], {
      details: {
        101: contactDetail({
          editability: { kind: "superseded" },
          activeTaskId: 202,
          contact: { isActive: false },
        }),
        202: contactDetail({
          contact: { id: 202 },
          customer: {
            ...contactDetail().customer,
            name: "Lia",
            surname: "Blu",
          },
        }),
      },
    })
    const { backend, user } = page
    const link = linkOf(1)
    const reads = readsOf(backend)

    await user.click(link)
    const active = await screen.findByRole("link", {
      name: "Vai al contatto attivo",
    })
    expect(active.getAttribute("href")).toBe("/dashboard?contatto=202")
    await user.click(active)
    await screen.findByRole("heading", { name: "Blu Lia" })

    expect(window.location.pathname).toBe("/dashboard")
    expect(window.location.search).toBe("?contatto=202")
    expect(readsOf(backend)).toEqual(reads)

    await closeWithEsc(page)
    await closed()

    expect(window.location.search).toBe("")
    await waitFor(() => expect(document.activeElement).toBe(link))
    await waitFor(() =>
      expect(backend.state.reads.getMyCallbacks).toBe(reads.getMyCallbacks + 1)
    )
  })

  it("una registrazione in corso continua: il suo esito arriva nella riga con il foglio aperto", async () => {
    const page = await renderRows("/dashboard", [{}, {}])
    const { backend, user } = page
    const release = backend.hold("registerCall")

    await user.click(outcome(1, "Appuntamento"))
    await user.click(linkOf(2))
    await screen.findByRole("heading", { name: "Rossi Mario" })
    await act(async () => {
      release()
      await Promise.resolve()
    })

    await waitFor(() =>
      expect(rowOf(1).textContent).toMatch(/Appuntamento registrato alle /)
    )
    expect(screen.queryByRole("dialog")).not.toBeNull()
    await closeWithEsc(page)
    await closed()
    expect(rowOf(1).textContent).toMatch(/Appuntamento registrato alle /)
  })

  it("un esito incerto con il foglio aperto, durante un disservizio, dà un solo avviso (AC48)", async () => {
    const page = await renderRows("/dashboard", [{}, {}])
    const { backend } = page
    backend.failWith("registerCall", "unavailable")
    const release = await pressWithSheetOpen(page)
    backend.detail.failingDetail = true
    backend.detail.failingCustomer = true

    await act(async () => {
      release()
      await Promise.resolve()
    })

    await screen.findByText("Non sappiamo se la chiamata è stata registrata")
    await settle()
    expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(1)
    expect(backend.detail.detailReads).toHaveLength(1)
    expect(screen.getByRole("heading", { name: "Rossi Mario" })).toBeTruthy()
  })

  it("la sessione scaduta con il foglio aperto dà un solo «Sessione scaduta» (AC27, AC48)", async () => {
    const page = await renderRows("/dashboard", [{}, {}])
    const { backend } = page
    backend.failWith("registerCall", new Unauthorized())
    const release = await pressWithSheetOpen(page)
    backend.detail.sessionExpired = true

    await act(async () => {
      release()
      await Promise.resolve()
    })

    await screen.findByText("Sessione scaduta: accedi di nuovo")
    await settle()
    expect(
      screen.getAllByText("Sessione scaduta: accedi di nuovo")
    ).toHaveLength(1)
    expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(1)
  })

  it("una chiamata registrata dalla riga con il foglio aperto lo rilegge", async () => {
    const page = await renderRows("/dashboard", [{}, {}])
    const { backend } = page
    const release = await pressWithSheetOpen(page)

    await act(async () => {
      release()
      await Promise.resolve()
    })

    await waitFor(() =>
      expect(backend.detail.detailReads.length).toBeGreaterThan(1)
    )
  })

  it("se il dettaglio non si legge l'errore è nel foglio, la coda resta e chiuso il foglio la home è uguale", async () => {
    const page = await renderRows("/dashboard", [{}, {}])
    const { backend, user } = page
    backend.detail.failingDetail = true
    const link = linkOf(1)
    const section = screen.getByRole("region", { name: "Richiami da fare" })

    await user.click(link)

    const error = await screen.findByText(
      "Non è stato possibile caricare i contatti",
      undefined,
      { timeout: 3000 }
    )
    expect(screen.getByRole("dialog").contains(error)).toBe(true)
    expect(screen.queryByText("errore della rotta")).toBeNull()
    expect(section.isConnected).toBe(true)

    await closeWithX(page)
    await closed()

    expect(section.isConnected).toBe(true)
    expect(linkOf(1)).toBe(link)
    expect(screen.getByText("2 di oggi")).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(link))
  })

  it("«Riprova» nel foglio rilegge il contatto, e dopo un errore una nuova apertura lo rilegge", async () => {
    const page = await renderRows("/dashboard", [{}])
    const { backend, user } = page
    backend.detail.failingDetail = true

    await user.click(linkOf(1))
    await screen.findByText(
      "Non è stato possibile caricare i contatti",
      undefined,
      { timeout: 3000 }
    )
    await closeWithEsc(page)
    await closed()

    await user.click(linkOf(1))
    await screen.findByText(
      "Non è stato possibile caricare i contatti",
      undefined,
      { timeout: 3000 }
    )
    backend.detail.failingDetail = false
    await user.click(screen.getByRole("button", { name: "Riprova" }))

    await screen.findByRole("heading", { name: "Rossi Mario" })
  })

  it("con l'errore nel foglio un altro contatto nell'indirizzo si legge", async () => {
    const page = await renderRows("/dashboard", [{}, {}])
    const { backend, router, user } = page
    backend.detail.failingDetail = true
    await user.click(linkOf(1))
    await screen.findByText(
      "Non è stato possibile caricare i contatti",
      undefined,
      { timeout: 3000 }
    )

    backend.detail.failingDetail = false
    await act(async () => {
      await router.navigate("/dashboard?contatto=102")
    })

    await screen.findByRole("heading", { name: "Rossi Mario" })
    expect(backend.detail.detailReads.at(-1)).toBe("102")
  })

  it("un indirizzo con `?contatto=` caricato da zero mostra home e foglio, e alla chiusura il fuoco resta dov'è", async () => {
    const page = await renderRows("/dashboard?contatto=101", [{}])

    await screen.findByRole("heading", { name: "Rossi Mario" })
    expect(document.querySelector("[data-lavoro-scroll]")).not.toBeNull()
    const reads = readsOf(page.backend)

    await closeWithEsc(page)
    await closed()

    expect(document.activeElement).not.toBe(linkOf(1))
    await waitFor(() =>
      expect(page.backend.state.reads.getMyCallbacks).toBe(
        reads.getMyCallbacks + 1
      )
    )
  })

  it.each(["abc", "0", "-1", "1.5", "99999999999999999999"])(
    "`?contatto=%s` non è un contatto: solo la home",
    async (id) => {
      await renderRows(`/dashboard?contatto=${id}`, [{}])

      expect(screen.queryByRole("dialog")).toBeNull()
    }
  )

  it("con Ctrl-clic non si apre nessun foglio e l'indirizzo è quello vero", async () => {
    const { router } = await renderRows("/dashboard", [{}])
    // jsdom would try to follow the link: the root of React has seen it first
    document.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    })

    fireEvent.click(linkOf(1), { ctrlKey: true })

    expect(linkOf(1).getAttribute("href")).toBe("/dashboard/contatti/101")
    expect(router.state.location.search).toBe("")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("con la home montata «Apri il contatto» dell'avviso apre il foglio", async () => {
    const { backend, router, user } = await renderRows("/dashboard", [{}])
    backend.failWith(
      "registerCall",
      new ContactForbidden({ assignee: "Bruno Neri" })
    )

    await user.click(outcome(1, "Appuntamento"))
    await user.click(
      await screen.findByRole("link", { name: "Apri il contatto" })
    )

    await screen.findByRole("heading", { name: "Rossi Mario" })
    expect(router.state.location.pathname).toBe("/dashboard")
    expect(router.state.location.search).toBe("?contatto=101")
  })

  it("aperto da un avviso, alla chiusura il fuoco torna sulla riga della chiamata rifiutata (AC53)", async () => {
    const page = await renderRows("/dashboard", [{}, {}])
    page.backend.failWith(
      "registerCall",
      new ContactForbidden({ assignee: "Bruno Neri" })
    )

    await page.user.click(outcome(2, "Appuntamento"))
    await page.user.click(
      await screen.findByRole("link", { name: "Apri il contatto" })
    )
    await screen.findByRole("heading", { name: "Rossi Mario" })
    await closeWithEsc(page)

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(linkOf(2)))
  })

  it("con il contatto attuale dell'avviso, il fuoco torna comunque sulla riga rifiutata (AC53)", async () => {
    const page = await renderRows("/dashboard", [{}, {}])
    page.backend.failWith(
      "registerCall",
      new ContactSuperseded({ activeTaskId: 102 })
    )

    await page.user.click(outcome(1, "Appuntamento"))
    await page.user.click(
      await screen.findByRole("link", { name: "Apri il contatto attuale" })
    )
    await screen.findByRole("heading", { name: "Rossi Mario" })
    expect(page.router.state.location.search).toBe("?contatto=102")
    await closeWithEsc(page)

    await waitFor(() => expect(document.activeElement).toBe(linkOf(1)))
  })

  it("a home smontata «Apri il contatto» va all'indirizzo vero", async () => {
    const { backend, router, user } = await renderRows("/dashboard", [{}])
    backend.failWith(
      "registerCall",
      new ContactForbidden({ assignee: "Bruno Neri" })
    )
    await user.click(outcome(1, "Appuntamento"))
    const link = await screen.findByRole("link", { name: "Apri il contatto" })
    await act(async () => {
      await router.navigate("/altrove")
    })
    await screen.findByText("altra pagina")

    await user.click(link)

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/dashboard/contatti/101")
    )
    expect(router.state.location.search).toBe("")
  })

  it("vale anche su `/dashboard/lavoro`, con gli altri parametri dell'indirizzo", async () => {
    const page = await renderRows("/dashboard/lavoro?vista=1", [{}])
    const link = linkOf(1)

    await page.user.click(link)
    await screen.findByRole("heading", { name: "Rossi Mario" })
    expect(window.location.pathname).toBe("/dashboard/lavoro")
    expect(window.location.search).toBe("?vista=1&contatto=101")

    await closeWithEsc(page)
    await closed()

    expect(window.location.pathname).toBe("/dashboard/lavoro")
    expect(window.location.search).toBe("?vista=1")
    await waitFor(() => expect(document.activeElement).toBe(link))
  })

  it("il `limit` della chat non resta sull'indirizzo della home alla chiusura", async () => {
    const page = await renderRows("/dashboard?vista=1&contatto=101&limit=10", [
      {},
    ])
    await screen.findByRole("heading", { name: "Rossi Mario" })

    await closeWithEsc(page)
    await closed()

    expect(window.location.search).toBe("?vista=1")
  })

  it("il `limit` della chat non passa al contatto seguente", async () => {
    await renderRows("/dashboard?contatto=101&limit=10", [{}], {
      details: {
        101: contactDetail({
          editability: { kind: "superseded" },
          activeTaskId: 202,
          contact: { isActive: false },
        }),
      },
    })

    const active = await screen.findByRole("link", {
      name: "Vai al contatto attivo",
    })

    expect(active.getAttribute("href")).toBe("/dashboard?contatto=202")
  })

  it("per un contatto che non esiste il pulsante dice «Torna alla home» e chiude", async () => {
    const page = await renderRows("/dashboard", [{}], { details: {} })
    const { user } = page
    const link = linkOf(1)

    await user.click(link)
    await screen.findByText("Contatto non trovato")
    await user.click(screen.getByRole("link", { name: "Torna alla home" }))

    await closed()
    expect(window.location.search).toBe("")
    await waitFor(() => expect(document.activeElement).toBe(link))
  })
})

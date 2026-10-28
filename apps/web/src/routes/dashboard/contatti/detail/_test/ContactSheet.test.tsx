import { act, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ContactForbidden } from "@mito/contract/errors"
import { contactDetail, fakeContacts } from "@/test/contacts"
import { currentHref, renderContacts } from "../../_test/page"
import { useContactSheet } from "../_components/ContactSheet"
import {
  DA,
  detailPath,
  findContent,
  holdWrites,
  openDetail,
  sheet,
  gate,
  sheetStatus,
} from "./detail"

// The shell of the detail, as the tests of `ContactSheet` of the Next.js
// app, on the page with a backend in memory: the list behind it is the real
// one, so where the focus goes back is seen there

const title = () => screen.getByRole("heading", { name: "Dettaglio contatto" })

/** The menu of the row of the contact of `contactRow`, in the list */
const rowActions = () =>
  screen.getByRole("button", { name: "Azioni per Rossi Mario" })

const findList = () => screen.findByRole("table", { name: "Contatti" })

beforeEach(() => {
  sessionStorage.clear()
})

describe("il guscio del dettaglio: aspetto", () => {
  it("è una finestra con il titolo fisso 'Dettaglio contatto' e il contenuto dentro", async () => {
    await openDetail()

    expect(within(sheet()).getByText("Rossi Mario")).toBeTruthy()
  })

  it("all'apertura porta il focus sul titolo, che si raggiunge solo da script", async () => {
    await openDetail()

    expect(document.activeElement).toBe(title())
    expect(title().getAttribute("tabindex")).toBe("-1")
  })

  it("ha un pulsante di chiusura in italiano", async () => {
    await openDetail()

    expect(screen.getByRole("button", { name: "Chiudi" })).toBeTruthy()
  })

  it("si apre subito, e il contatto arriva quando è letto", async () => {
    const backend = fakeContacts({ details: { 101: contactDetail() } })
    let open!: () => void
    backend.state.detailGate = new Promise<void>((resolve) => {
      open = resolve
    })
    renderContacts(detailPath(101), backend, { detail: true })

    expect(await screen.findByRole("dialog")).toBeTruthy()
    expect(screen.queryByText("Telefono")).toBeNull()
    open()
    await findContent()
  })
})

describe("il guscio del dettaglio: chiusura (AC25)", () => {
  it("con Esc torna alla vista da cui si era partiti, senza scorrere in cima", async () => {
    const { user, navigations, router } = await openDetail()

    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(currentHref()).toBe(
        "/dashboard/contatti?stato=richiamare&pagina=2"
      )
    )
    expect(navigations).toEqual([
      "PUSH /dashboard/contatti?stato=richiamare&pagina=2",
    ])
    // The focus goes to the row, not the top of the page
    expect(router.state.preventScrollReset).toBe(true)
    await findList()
  })

  it("Esc, clic sul fondo e la X, anche insieme mentre la lista carica, fanno una sola navigazione", async () => {
    // The list is not loaded yet, as after a direct link to the detail: the
    // close waits for it, with the sheet on screen
    const list = gate()
    const { user, navigations } = await openDetail(undefined, {
      listGate: list.closed,
    })
    const close = screen.getByRole("button", { name: "Chiudi" })

    await user.keyboard("{Escape}")
    await user.click(document.body)
    await user.click(close)

    expect(close.getAttribute("aria-busy")).toBe("true")
    list.open()
    await findList()
    expect(navigations).toEqual([
      "PUSH /dashboard/contatti?stato=richiamare&pagina=2",
    ])
  })

  it("una chiusura scartata da un link della finestra non la blocca: si chiude di nuovo", async () => {
    const list = gate()
    const { user, navigations } = await openDetail(
      [
        contactDetail({
          customerContacts: [
            {
              id: 88,
              state: "erogata",
              isActive: false,
              closedAt: null,
              createdAt: new Date("2026-09-10T08:00:00Z"),
              operator: null,
            },
          ],
        }),
        contactDetail({ contact: { id: 88, state: "erogata" } }),
      ],
      { listGate: list.closed }
    )

    // Esc waits for the list; the link to another contact discards it
    await user.keyboard("{Escape}")
    await user.click(
      within(
        screen.getByRole("region", { name: "Contatti precedenti" })
      ).getByRole("link")
    )
    await waitFor(() => expect(currentHref()).toBe(detailPath(88, DA)))
    list.open()
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Chiudi" }).getAttribute("aria-busy")
      ).toBe("false")
    )

    await user.keyboard("{Escape}")

    await findList()
    expect(navigations).toEqual([
      `PUSH ${detailPath(88, DA)}`,
      "PUSH /dashboard/contatti?stato=richiamare&pagina=2",
    ])
  })

  it("senza 'da' torna alla lista senza filtri", async () => {
    const { user } = await openDetail(undefined, { da: null })

    await user.keyboard("{Escape}")

    await waitFor(() => expect(currentHref()).toBe("/dashboard/contatti"))
  })

  it("con un 'da' ostile torna alla lista, dentro l'app (P15)", async () => {
    const { user, navigations } = await openDetail(undefined, {
      da: "https://evil.example/x?stato=erogata",
    })

    await user.keyboard("{Escape}")

    await findList()
    expect(navigations).toHaveLength(1)
    expect(navigations[0]!.startsWith("PUSH /dashboard/contatti")).toBe(true)
    expect(navigations[0]).not.toContain("evil")
  })

  it("con 'da' ripetuto torna alla lista senza filtri", async () => {
    const backend = fakeContacts({ details: { 101: contactDetail() } })
    const { user } = renderContacts(
      "/dashboard/contatti/101?da=stato%3Derogata&da=stato%3Dchiamare",
      backend,
      { detail: true }
    )
    await findContent()

    await user.keyboard("{Escape}")

    await waitFor(() => expect(currentHref()).toBe("/dashboard/contatti"))
  })

  it("la lista riporta il focus alla riga del contatto da cui si partiva", async () => {
    const { user } = await openDetail()

    await user.keyboard("{Escape}")

    await findList()
    await waitFor(() => expect(document.activeElement).toBe(rowActions()))
  })

  it("con un id che non è un contatto chiude lo stesso: la lista porta il focus alla tabella", async () => {
    const { user, navigations } = renderContacts(
      "/dashboard/contatti/abc",
      fakeContacts(),
      { detail: true }
    )
    await screen.findByText("Contatto non trovato")

    await user.keyboard("{Escape}")

    const table = await findList()
    expect(navigations).toEqual(["PUSH /dashboard/contatti"])
    await waitFor(() => expect(document.activeElement).toBe(table))
  })
})

describe("il guscio del dettaglio: si esce senza chiuderlo (M5)", () => {
  // The browser's "Indietro", or a link in the content ("Torna a Contatti"):
  // the sheet goes away without `close()`, and the list still has to bring
  // the focus back, or it stays on the page

  it("con 'Indietro' la lista riporta il focus alla riga del contatto", async () => {
    const backend = fakeContacts({ details: { 101: contactDetail() } })
    const { router } = renderContacts("/dashboard/contatti", backend, {
      detail: true,
    })
    await findList()
    await act(() => router.navigate(detailPath(101)))
    await findContent()

    await act(() => router.navigate(-1))

    await findList()
    await waitFor(() => expect(document.activeElement).toBe(rowActions()))
  })

  it("con 'Torna a Contatti' di un contatto che non esiste la lista porta il focus alla tabella", async () => {
    const { user } = renderContacts(detailPath(999), fakeContacts(), {
      detail: true,
    })

    await user.click(
      await screen.findByRole("link", { name: "Torna a Contatti" })
    )

    const table = await findList()
    await waitFor(() => expect(document.activeElement).toBe(table))
  })
})

describe("il guscio del dettaglio: cambia contatto senza chiudersi", () => {
  it("la riapertura annuncia il contatto nuovo nella finestra, che resta aperta, e poi si chiude una volta (AC34, AC35)", async () => {
    const reopened = contactDetail({ contact: { id: 202, state: "chiamare" } })
    const { user, backend, navigations } = await openDetail([
      contactDetail({ contact: { state: "non interessato" } }),
      reopened,
    ])
    backend.state.changeAnswer = () => ({ saved: true, reopenedAs: 202 })

    await user.click(
      document.querySelector<HTMLElement>("[data-contact-state-trigger]")!
    )
    await user.click(screen.getByRole("menuitemradio", { name: "chiamare" }))

    await waitFor(() => expect(currentHref()).toBe(detailPath(202, DA)))
    expect(sheetStatus().textContent).toBe(
      "Contatto riaperto. Il precedente resta tra i contatti precedenti"
    )
    // The new contact takes the focus; then the sheet closes as ever, once
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("aria-label")).toBe(
        "chiamare, cambia stato"
      )
    )
    await user.keyboard("{Escape}")
    await findList()
    expect(navigations).toEqual([
      `REPLACE ${detailPath(202, DA)}`,
      "PUSH /dashboard/contatti?stato=richiamare&pagina=2",
    ])
  })

  it("un contatto in sola lettura aperto da un link della finestra porta il focus sul titolo", async () => {
    const old = contactDetail({
      contact: { id: 88, state: "erogata", isActive: false },
      editability: { kind: "superseded" },
      activeTaskId: 101,
    })
    const { user } = await openDetail([
      contactDetail({
        customerContacts: [
          {
            id: 88,
            state: "erogata",
            isActive: false,
            closedAt: null,
            createdAt: new Date("2026-09-10T08:00:00Z"),
            operator: null,
          },
        ],
      }),
      old,
    ])
    // The focus away from the title, as a reader who moved through the sheet
    const link = within(
      screen.getByRole("region", { name: "Contatti precedenti" })
    ).getByRole("link")
    link.focus()

    await user.keyboard("{Enter}")

    await screen.findByText("Contatto concluso")
    await waitFor(() => expect(document.activeElement).toBe(title()))
  })
})

describe("il guscio del dettaglio: i rifiuti detti dentro la finestra", () => {
  it("ogni rifiuto si annuncia di nuovo, anche con lo stesso testo", async () => {
    const { user, backend } = await openDetail()
    backend.state.priorityAnswer = () => ({
      rejected: new ContactForbidden({ assignee: null }),
    })
    const trigger = () =>
      screen.getByRole("button", { name: /, cambia priorità$/ })
    const alert = within(sheet()).getByRole("alert")

    await user.click(trigger())
    await user.click(screen.getByRole("menuitemradio", { name: "Bassa" }))
    await waitFor(() =>
      expect(alert.textContent).toBe(
        "Non puoi modificare questo contatto: non è assegnato"
      )
    )
    const first = alert.firstElementChild
    await waitFor(() =>
      expect(trigger().getAttribute("aria-disabled")).toBe("false")
    )

    await user.click(trigger())
    await user.click(screen.getByRole("menuitemradio", { name: "Bassa" }))

    await waitFor(() => expect(alert.firstElementChild).not.toBe(first))
    expect(alert.textContent).toBe(
      "Non puoi modificare questo contatto: non è assegnato"
    )
  })

  it("mentre si salva la finestra si chiude lo stesso, e il rifiuto arriva come toast", async () => {
    const { user, backend } = await openDetail()
    backend.state.priorityAnswer = () => ({
      rejected: new ContactForbidden({ assignee: null }),
    })
    const open = holdWrites(backend)
    await user.click(screen.getByRole("button", { name: /, cambia priorità$/ }))
    await user.click(screen.getByRole("menuitemradio", { name: "Bassa" }))

    await user.keyboard("{Escape}")
    await findList()
    open()

    expect(
      await screen.findByText(
        "Non puoi modificare questo contatto: non è assegnato"
      )
    ).toBeTruthy()
  })
})

describe("il guscio del dettaglio: l'API", () => {
  it("fuori dal guscio non esiste", () => {
    function Capture() {
      useContactSheet()
      return null
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    expect(() => render(<Capture />)).toThrow()

    spy.mockRestore()
  })
})

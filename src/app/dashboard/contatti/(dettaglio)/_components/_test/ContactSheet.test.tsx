import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { takeReturnFocus } from "../../../_lib/returnFocus"
import { ContactSheet, useContactSheet } from "../ContactSheet"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  params: { id: "101" } as Record<string, string>,
  search: new URLSearchParams(),
}))

const router = {
  push: mocks.push,
  replace: mocks.replace,
  refresh: mocks.refresh,
}
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => mocks.params,
  useSearchParams: () => mocks.search,
}))

type Api = ReturnType<typeof useContactSheet>

/** Hands the API of the shell to the test. */
function Capture({ onApi }: { onApi: (api: Api) => void }) {
  onApi(useContactSheet())
  return null
}

const setup = (children: React.ReactNode = <p>contenuto del contatto</p>) => {
  // Radix switches pointer events off on the page while the Sheet is open
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(<ContactSheet>{children}</ContactSheet>)
  return user
}

beforeEach(() => {
  mocks.push.mockClear()
  mocks.replace.mockClear()
  mocks.params = { id: "101" }
  mocks.search = new URLSearchParams()
  sessionStorage.clear()
})

describe("il guscio del dettaglio: aspetto", () => {
  it("è una finestra con il titolo fisso 'Dettaglio contatto' e il contenuto dentro", () => {
    setup()

    const dialog = screen.getByRole("dialog", { name: "Dettaglio contatto" })
    expect(dialog.textContent).toContain("contenuto del contatto")
  })

  it("all'apertura porta il focus sul titolo, che si raggiunge solo da script", () => {
    setup()

    const title = screen.getByRole("heading", { name: "Dettaglio contatto" })
    expect(document.activeElement).toBe(title)
    expect(title.getAttribute("tabindex")).toBe("-1")
  })

  it("ha un pulsante di chiusura in italiano", () => {
    setup()

    expect(screen.getByRole("button", { name: "Chiudi" })).toBeTruthy()
  })
})

describe("il guscio del dettaglio: chiusura (AC25)", () => {
  beforeEach(() => {
    mocks.search = new URLSearchParams({ da: "stato=richiamare&pagina=2" })
  })

  it("con Esc torna alla vista da cui si era partiti", async () => {
    const user = setup()

    await user.keyboard("{Escape}")

    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/contatti?stato=richiamare&pagina=2",
      // The focus goes to the row, not the top of the page
      { scroll: false }
    )
  })

  it("Esc, clic sul fondo e la X, anche insieme, fanno una sola navigazione", async () => {
    const user = setup()

    await user.keyboard("{Escape}")
    await user.click(document.body)
    await user.click(screen.getByRole("button", { name: "Chiudi" }))

    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("senza 'da' torna alla lista senza filtri", async () => {
    mocks.search = new URLSearchParams()
    const user = setup()

    await user.keyboard("{Escape}")

    expect(mocks.push).toHaveBeenCalledWith("/dashboard/contatti", {
      scroll: false,
    })
  })

  it("con un 'da' ostile torna alla lista, dentro l'app (P15)", async () => {
    mocks.search = new URLSearchParams({
      da: "https://evil.example/x?stato=erogata",
    })
    const user = setup()

    await user.keyboard("{Escape}")

    expect(mocks.push).toHaveBeenCalledTimes(1)
    const [href] = mocks.push.mock.calls[0] as [string]
    expect(href.startsWith("/dashboard/contatti")).toBe(true)
    expect(href).not.toContain("evil")
  })

  it("con 'da' ripetuto torna alla lista senza filtri", async () => {
    mocks.search = new URLSearchParams("da=stato%3Derogata&da=stato%3Dchiamare")
    const user = setup()

    await user.keyboard("{Escape}")

    expect(mocks.push).toHaveBeenCalledWith("/dashboard/contatti", {
      scroll: false,
    })
  })

  it("scrive il contatto da cui si partiva, perché la lista riporti il focus alla sua riga", async () => {
    const user = setup()

    await user.keyboard("{Escape}")

    expect(takeReturnFocus()).toEqual({ kind: "row", id: 101 })
  })

  it("con un id che non è un contatto chiude lo stesso: la lista porta il focus alla tabella", async () => {
    mocks.params = { id: "abc" }
    const user = setup()

    await user.keyboard("{Escape}")

    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(takeReturnFocus()).toEqual({ kind: "table" })
  })

  it("quando il guscio sparisce non rimette il focus dov'era: lo fa la lista, e Radix lo porterebbe su un Trigger che non c'è", async () => {
    // The sheet never closes itself (`open` is always true): Radix's focus
    // trap gives the focus back when it goes away with the shell. A modal
    // Dialog already refuses that without a Trigger, so `onCloseAutoFocus`
    // alone is not what this holds: it is the behaviour (the list restores the
    // focus), whoever provides it
    const outside = document.createElement("button")
    document.body.append(outside)
    outside.focus()
    const view = render(
      <ContactSheet>
        <p>contenuto</p>
      </ContactSheet>
    )
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Dettaglio contatto" })
    )

    view.unmount()
    // The restore of the focus trap is on the next task
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(document.activeElement).not.toBe(outside)
    outside.remove()
  })
})

describe("il guscio del dettaglio: chiusura durante una riapertura (AC25, AC35)", () => {
  // A close and the `replace` of a reopening are two navigations: the second
  // discards the first, and a close that never happened would leave the guard
  // up and the sheet open for good

  it("'isClosing' dice se la chiusura è partita", async () => {
    let api!: Api
    const user = setup(<Capture onApi={(value) => (api = value)} />)
    expect(api.isClosing()).toBe(false)

    await user.keyboard("{Escape}")

    expect(api.isClosing()).toBe(true)
  })

  it("mentre la navigazione di una riapertura è in corso la chiusura aspetta, senza alzare la guardia", async () => {
    let api!: Api
    const user = setup(<Capture onApi={(value) => (api = value)} />)

    act(() => api.setReopening(true))
    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: "Chiudi" }))

    expect(mocks.push).not.toHaveBeenCalled()
    expect(api.isClosing()).toBe(false)

    // The reopening ended: the sheet closes as ever, once
    act(() => api.setReopening(false))
    await user.keyboard("{Escape}")

    expect(mocks.push).toHaveBeenCalledTimes(1)
  })
})

describe("il guscio del dettaglio: si esce senza chiuderlo (M5)", () => {
  // The browser's "Indietro", or a link in the content ("Torna a Contatti"):
  // the sheet goes away without `close()`, and the list still has to bring the
  // focus back, or it stays on the page

  it("scrive il contatto da cui si partiva anche quando il guscio sparisce senza chiudersi", () => {
    const view = render(
      <ContactSheet>
        <p>contenuto</p>
      </ContactSheet>
    )

    view.unmount()

    expect(takeReturnFocus()).toEqual({ kind: "row", id: 101 })
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it("con un id che non è un contatto la lista porta il focus alla tabella", () => {
    mocks.params = { id: "abc" }
    const view = render(
      <ContactSheet>
        <p>contenuto</p>
      </ContactSheet>
    )

    view.unmount()

    expect(takeReturnFocus()).toEqual({ kind: "table" })
  })

  it("dopo aver chiuso non scrive di nuovo, e non cambia il contatto già scritto", async () => {
    const user = setup()
    await user.keyboard("{Escape}")
    mocks.params = { id: "202" }

    cleanup()

    expect(takeReturnFocus()).toEqual({ kind: "row", id: 101 })
  })
})

describe("il guscio del dettaglio: annunci e focus per i task successivi", () => {
  it("'announce' scrive nel nodo di stato e il testo resta", () => {
    let api!: Api
    setup(<Capture onApi={(value) => (api = value)} />)
    expect(screen.getByRole("status")).toBeTruthy()

    act(() =>
      api.announce(
        "Contatto riaperto. Il precedente resta tra i contatti precedenti"
      )
    )

    expect(screen.getByRole("status").textContent).toContain(
      "Contatto riaperto. Il precedente resta tra i contatti precedenti"
    )
    act(() => api.announce("Un altro avviso"))
    expect(screen.getByRole("status").textContent).toContain("Un altro avviso")
  })

  it("ripetere lo stesso annuncio lo dice di nuovo, con il nodo di stato sempre montato", () => {
    let api!: Api
    setup(<Capture onApi={(value) => (api = value)} />)
    const region = screen.getByRole("status")
    act(() => api.announce("Contatto riaperto"))
    const first = region.firstElementChild

    act(() => api.announce("Contatto riaperto"))

    // The region stays (one that arrives with its text is not announced); its
    // content is a new node, or the same text is not said the second time
    expect(screen.getByRole("status")).toBe(region)
    expect(region.firstElementChild).not.toBe(first)
    expect(region.textContent).toBe("Contatto riaperto")
  })

  it("'announceAlert' scrive in un nodo che avvisa subito, anche se il toast è nascosto agli ausili", () => {
    let api!: Api
    setup(<Capture onApi={(value) => (api = value)} />)

    act(() => api.announceAlert("Non puoi modificare questo contatto"))

    expect(screen.getByRole("alert").textContent).toContain(
      "Non puoi modificare questo contatto"
    )
  })

  it("ripetere lo stesso rifiuto lo annuncia di nuovo", () => {
    let api!: Api
    setup(<Capture onApi={(value) => (api = value)} />)
    act(() => api.announceAlert("Modifica non salvata, riprova"))
    const first = screen.getByRole("alert").firstElementChild

    act(() => api.announceAlert("Modifica non salvata, riprova"))

    // A new node, or the assistive technology says nothing the second time
    expect(screen.getByRole("alert").firstElementChild).not.toBe(first)
  })

  it("il flag del focus si alza una volta e si legge una volta sola", () => {
    let api!: Api
    setup(<Capture onApi={(value) => (api = value)} />)

    expect(api.consumeStateTriggerFocus()).toBe(false)
    act(() => api.focusStateTriggerOnNextMount())
    expect(api.consumeStateTriggerFocus()).toBe(true)
    expect(api.consumeStateTriggerFocus()).toBe(false)
  })

  it("'focusTitle' porta il focus sul titolo", () => {
    let api!: Api
    const user = setup(
      <>
        <button type="button">altro</button>
        <Capture onApi={(value) => (api = value)} />
      </>
    )
    return user
      .click(screen.getByRole("button", { name: "altro" }))
      .then(() => {
        expect(document.activeElement).not.toBe(
          screen.getByRole("heading", { name: "Dettaglio contatto" })
        )

        act(() => api.focusTitle())

        expect(document.activeElement).toBe(
          screen.getByRole("heading", { name: "Dettaglio contatto" })
        )
      })
  })

  it("fuori dal guscio l'API non esiste", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    expect(() => render(<Capture onApi={() => undefined} />)).toThrow()

    spy.mockRestore()
  })
})

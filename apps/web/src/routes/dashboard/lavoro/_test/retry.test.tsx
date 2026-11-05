import { act, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  fakeLavoro,
  type LavoroEndpoint,
  myCall,
  myCallback,
} from "@/test/lavoro"
import { renderLavoro } from "./page"

describe("«Riprova»", () => {
  it("con i richiami in errore, Invio su «Riprova» porta il fuoco su «Richiami da fare» e, tornati i dati, la regione di stato dice «Richiami caricati»", async () => {
    const backend = fakeLavoro({
      callbacks: [myCallback({ alertId: 1, taskId: 101 })],
    })
    backend.failWith("getMyCallbacks", "unavailable")
    const { user } = renderLavoro("/dashboard", backend)
    const section = await screen.findByRole("region", {
      name: "Richiami da fare",
    })
    const retry = await within(section).findByRole(
      "button",
      { name: "Riprova" },
      { timeout: 3000 }
    )

    backend.recover("getMyCallbacks")
    retry.focus()
    await user.keyboard("{Enter}")

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Richiami da fare" })
      )
    )
    expect(
      await screen.findByText("Richiami caricati", {
        selector: "[role=status] *, [role=status]",
      })
    ).toBeTruthy()
  })
})

const toasts = () => document.querySelectorAll("[data-sonner-toast]")

const statusText = () =>
  [...document.querySelectorAll("[role=status]")]
    .map((node) => node.textContent)
    .join("|")

const backToTab = () =>
  act(() => {
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))
  })

const boxOf = (label: string) =>
  screen.getByText(label, { selector: "dt" }).parentElement!

const rowOf = (alertId: number) =>
  document
    .querySelector<HTMLElement>(`[data-callback-link="${alertId}"]`)!
    .closest("tr")!

const seeded = () =>
  fakeLavoro({
    toCall: 4,
    callbacks: [
      myCallback({ alertId: 1, taskId: 101 }),
      myCallback({ alertId: 2, taskId: 102 }),
    ],
    calls: [myCall({ id: 1 })],
  })

type Part = {
  endpoint: LavoroEndpoint
  name: string
  announced: string
  target: () => HTMLElement
  retry: () => HTMLElement
}

const PARTS: Part[] = [
  {
    endpoint: "getMyCallbacks",
    name: "i richiami",
    announced: "Richiami caricati",
    target: () => screen.getByRole("heading", { name: "Richiami da fare" }),
    retry: () =>
      within(
        screen.getByRole("region", { name: "Richiami da fare" })
      ).getByRole("button", { name: "Riprova" }),
  },
  {
    endpoint: "getMyCalls",
    name: "le chiamate",
    announced: "Chiamate di oggi caricate",
    target: () => screen.getByRole("heading", { name: "Fatti oggi" }),
    retry: () =>
      within(screen.getByRole("region", { name: "Fatti oggi" })).getByRole(
        "button",
        { name: "Riprova" }
      ),
  },
  {
    endpoint: "getMyDay",
    name: "il mio oggi",
    announced: "Il mio oggi caricato",
    target: () => boxOf("Il mio oggi"),
    retry: () =>
      within(boxOf("Il mio oggi")).getByRole("button", { name: "Riprova" }),
  },
  {
    endpoint: "getMyToCall",
    name: "da chiamare",
    announced: "Da chiamare caricato",
    target: () => boxOf("Da chiamare"),
    retry: () =>
      within(boxOf("Da chiamare")).getByRole("button", { name: "Riprova" }),
  },
]

const otherReads = (backend: ReturnType<typeof seeded>, endpoint: string) =>
  Object.entries(backend.state.reads).filter(([key]) => key !== endpoint)

describe.each(PARTS)("la parte «$name» in errore", (part) => {
  const fail = async () => {
    const backend = seeded()
    backend.failWith(part.endpoint, "unavailable")
    const page = renderLavoro("/dashboard", backend)
    await waitFor(() => expect(part.retry()).toBeTruthy(), { timeout: 3000 })
    return { backend, ...page }
  }

  it("Invio su «Riprova» porta il fuoco sul titolo o sul riquadro e il ritorno dei dati è annunciato", async () => {
    const { backend, user } = await fail()
    expect(statusText()).not.toContain(part.announced)
    backend.recover(part.endpoint)
    part.retry().focus()

    await user.keyboard("{Enter}")

    await waitFor(() => expect(document.activeElement).toBe(part.target()))
    expect(part.target().getAttribute("tabindex")).toBe("-1")
    await waitFor(() => expect(statusText()).toContain(part.announced))
  })

  it("le altre parti mostrano i loro dati, senza avvisi, e non si rileggono con «Riprova»", async () => {
    const { backend, user } = await fail()
    await waitFor(() =>
      expect(
        document.querySelector("[data-callback-link]") ??
          screen.queryByText("1 chiamata")
      ).not.toBeNull()
    )
    expect(toasts()).toHaveLength(0)
    if (part.endpoint !== "getMyCallbacks")
      expect(within(rowOf(1)).getAllByRole("button").length).toBeGreaterThan(0)
    const before = otherReads(backend, part.endpoint)

    backend.recover(part.endpoint)
    await user.click(part.retry())
    await waitFor(() => expect(statusText()).toContain(part.announced))

    expect(otherReads(backend, part.endpoint)).toEqual(before)
    expect(toasts()).toHaveLength(0)
  })
})

describe("«Il mio oggi» in errore (AC41)", () => {
  it("«Vedi le chiamate» non c'è e torna con «Riprova»", async () => {
    const backend = seeded()
    backend.failWith("getMyDay", "unavailable")
    const { user } = renderLavoro("/dashboard", backend)
    const retry = await within(boxOf("Il mio oggi")).findByRole(
      "button",
      { name: "Riprova" },
      { timeout: 3000 }
    )
    expect(screen.queryByRole("link", { name: "Vedi le chiamate" })).toBeNull()

    backend.recover("getMyDay")
    await user.click(retry)

    expect(
      await screen.findByRole("link", { name: "Vedi le chiamate" })
    ).toBeTruthy()
  })
})

describe("nessun annuncio senza «Riprova»", () => {
  it("il primo caricamento e un aggiornamento normale non annunciano nulla", async () => {
    const backend = seeded()
    renderLavoro("/dashboard", backend)
    await screen.findByRole("link", { name: "Vedi le chiamate" })
    await waitFor(() => expect(backend.state.reads.getMyCallbacks).toBe(1))
    expect(statusText()).toBe("")

    backToTab()
    await waitFor(() => expect(backend.state.reads.getMyDay).toBeGreaterThan(1))
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))

    expect(statusText()).toBe("")
  })
})

describe("«Riprova» di un aggiornamento fallito (AC39)", () => {
  it("il contenuto resta, senza scheletro, e le righe chiuse restano al loro posto", async () => {
    const backend = seeded()
    const { user } = renderLavoro("/dashboard", backend)
    await waitFor(() =>
      expect(document.querySelector("[data-callback-link]")).not.toBeNull()
    )
    const first = within(within(rowOf(1)).getByRole("group")).getByRole(
      "button",
      { name: "Appuntamento" }
    )
    await user.click(first)
    await within(rowOf(1)).findByText(/^Appuntamento registrato alle /)

    backend.failWith("getMyCallbacks", "unavailable")
    backToTab()
    const section = screen.getByRole("region", { name: "Richiami da fare" })
    const retry = await within(section).findByRole(
      "button",
      { name: "Riprova" },
      { timeout: 3000 }
    )
    expect(rowOf(1)).toBeTruthy()

    let skeleton = false
    const observer = new MutationObserver(() => {
      skeleton ||= within(section).queryByRole("status") !== null
    })
    observer.observe(section, { childList: true, subtree: true })
    backend.recover("getMyCallbacks")
    await user.click(retry)
    await waitFor(() => expect(statusText()).toContain("Richiami caricati"))
    observer.disconnect()

    expect(skeleton).toBe(false)
    expect(rowOf(1).textContent).toContain("Appuntamento registrato alle ")
    expect(rowOf(2)).toBeTruthy()
  })
})

describe("un aggiornamento sopra una parte in errore (AC37)", () => {
  const section = () => screen.getByRole("region", { name: "Fatti oggi" })
  const skeleton = () => within(section()).queryByRole("status")

  const failedDiary = async () => {
    const backend = seeded()
    backend.failWith("getMyCalls", "unavailable")
    const page = renderLavoro("/dashboard", backend)
    await within(
      await screen.findByRole("region", { name: "Fatti oggi" })
    ).findByRole("button", { name: "Riprova" }, { timeout: 3000 })
    await waitFor(() =>
      expect(document.querySelector("[data-callback-link]")).not.toBeNull()
    )
    return { backend, ...page }
  }

  it("con il diario in errore al primo caricamento, un Non risponde e la rilettura ferma tengono errore e «Riprova», senza scheletro", async () => {
    const { backend, user } = await failedDiary()
    const reads = backend.state.reads.getMyCalls
    backend.recover("getMyCalls")
    const release = backend.hold("getMyCalls")

    await user.click(
      within(within(rowOf(1)).getByRole("group")).getByRole("button", {
        name: "Non risponde",
      })
    )
    await waitFor(() =>
      expect(backend.state.reads.getMyCalls).toBeGreaterThan(reads)
    )

    expect(skeleton()).toBeNull()
    expect(
      within(section()).getByRole("button", { name: "Riprova" })
    ).toBeTruthy()

    release()
    await within(section()).findByRole("table")
  })

  it("«Riprova» di un primo caricamento mostra ancora lo scheletro", async () => {
    const { backend, user } = await failedDiary()
    backend.recover("getMyCalls")
    const release = backend.hold("getMyCalls")

    await user.click(within(section()).getByRole("button", { name: "Riprova" }))

    await waitFor(() => expect(skeleton()).not.toBeNull())
    expect(
      within(section()).queryByRole("button", { name: "Riprova" })
    ).toBeNull()

    release()
    await within(section()).findByRole("table")
  })

  it("con «Riprova» fallito l'errore torna", async () => {
    const { backend, user } = await failedDiary()
    const reads = backend.state.reads.getMyCalls

    await user.click(within(section()).getByRole("button", { name: "Riprova" }))
    await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(reads + 4))

    await within(section()).findByRole("button", { name: "Riprova" })
    expect(skeleton()).toBeNull()
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))
    expect(statusText()).not.toContain("Chiamate di oggi caricate")
  })

  it("«Riprova» annullato da un aggiornamento annuncia i dati della lettura che lo sostituisce (AC50)", async () => {
    const { backend, user } = await failedDiary()
    const releaseCall = backend.hold("registerCall")
    await user.click(
      within(within(rowOf(1)).getByRole("group")).getByRole("button", {
        name: "Non risponde",
      })
    )
    await waitFor(() => expect(backend.state.sent).toHaveLength(1))
    backend.recover("getMyCalls")
    const releaseDiary = backend.hold("getMyCalls")
    const reads = backend.state.reads.getMyCalls
    await user.click(within(section()).getByRole("button", { name: "Riprova" }))
    await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(reads + 1))

    releaseCall()
    await waitFor(() => expect(backend.state.reads.getMyCalls).toBe(reads + 2))
    expect(statusText()).not.toContain("Chiamate di oggi caricate")
    releaseDiary()

    await waitFor(() =>
      expect(statusText()).toContain("Chiamate di oggi caricate")
    )
  })

  it("sopra un contenuto già a schermo l'errore resta durante un aggiornamento", async () => {
    const backend = seeded()
    const { user } = renderLavoro("/dashboard", backend)
    await waitFor(() =>
      expect(document.querySelector("[data-callback-link]")).not.toBeNull()
    )
    await within(
      await screen.findByRole("region", { name: "Fatti oggi" })
    ).findByRole("table")
    backend.failWith("getMyCalls", "unavailable")
    backToTab()
    await within(section()).findByRole(
      "button",
      { name: "Riprova" },
      { timeout: 3000 }
    )
    const reads = backend.state.reads.getMyCalls
    backend.recover("getMyCalls")
    const release = backend.hold("getMyCalls")

    await user.click(
      within(within(rowOf(1)).getByRole("group")).getByRole("button", {
        name: "Non risponde",
      })
    )
    await waitFor(() =>
      expect(backend.state.reads.getMyCalls).toBeGreaterThan(reads)
    )

    expect(
      within(section()).getByRole("button", { name: "Riprova" })
    ).toBeTruthy()
    expect(within(section()).getByRole("table")).toBeTruthy()

    release()
    await waitFor(() =>
      expect(
        within(section()).queryByRole("button", { name: "Riprova" })
      ).toBeNull()
    )
  })
})

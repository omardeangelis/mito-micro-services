import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { parse, toContactsInput } from "@mito/client/contact/searchParams"
import { fakeLavoro, myCall } from "@/test/lavoro"
import { renderLavoro } from "./page"

/** The value of a box of the header, by its label */
const box = (label: string) =>
  within(screen.getByText(label).parentElement!).getByRole("definition")

const findBox = async (label: string) => {
  await screen.findByText(label)
  return box(label)
}

const calls = (...outcomes: Parameters<typeof myCall>[0][]) =>
  outcomes.map((call, id) => myCall({ id, ...call }))

afterEach(() => {
  vi.useRealTimers()
})

describe("il saluto (AC5)", () => {
  it.each([
    ["Ada", "Buongiorno, Ada"],
    ["Maria  Grazia", "Buongiorno, Maria"],
    ["  Ada ", "Buongiorno, Ada"],
  ])("con il nome «%s» dice «%s»", async (operatorName, title) => {
    renderLavoro("/dashboard", fakeLavoro({ operatorName }))

    expect(await screen.findByRole("heading", { name: title })).toBeTruthy()
  })

  it("senza nome dice «Buongiorno»", async () => {
    const backend = fakeLavoro({ operatorName: "" })
    renderLavoro("/dashboard", backend)

    await waitFor(() => expect(backend.state.reads.getCurrentUser).toBe(1))
    expect(
      await screen.findByRole("heading", { level: 1, name: "Buongiorno" })
    ).toBeTruthy()
  })

  it.each([
    // In UTC è ancora il 31 ottobre: a Roma è già domenica
    ["2026-10-31T22:59:59.000Z", "Sabato 31 ottobre"],
    ["2026-10-31T23:00:00.000Z", "Domenica 1 novembre"],
    ["2026-11-01T22:59:59.000Z", "Domenica 1 novembre"],
    ["2026-11-01T23:00:00.000Z", "Lunedì 2 novembre"],
  ])("alle %s il giorno è «%s»", async (now, day) => {
    vi.setSystemTime(new Date(now))
    renderLavoro("/dashboard", fakeLavoro())

    expect(await screen.findByText(day)).toBeTruthy()
  })
})

describe("«Il mio oggi» (AC6, AC7, AC38, AC41)", () => {
  it("mostra «…» mentre carica, senza link", async () => {
    const backend = fakeLavoro({ calls: calls({}) })
    const release = backend.hold("getMyDay")
    renderLavoro("/dashboard", backend)

    await waitFor(() => expect(backend.state.reads.getMyDay).toBe(1))
    expect(box("Il mio oggi").textContent).toBe("…")
    expect(screen.queryByRole("link", { name: "Vedi le chiamate" })).toBeNull()

    release()
    expect(
      await screen.findByRole("link", { name: "Vedi le chiamate" })
    ).toBeTruthy()
  })

  it("senza chiamate dice «Nessuna chiamata ancora», senza link", async () => {
    renderLavoro("/dashboard", fakeLavoro())

    expect(await screen.findByText("Nessuna chiamata ancora")).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Vedi le chiamate" })).toBeNull()
  })

  it("con una chiamata, una risposta e un appuntamento è al singolare", async () => {
    renderLavoro(
      "/dashboard",
      fakeLavoro({ calls: calls({ outcome: "app.to" }) })
    )

    await screen.findByRole("link", { name: "Vedi le chiamate" })
    expect(box("Il mio oggi").textContent).toBe(
      "1 chiamata · 1 risposta · 1 appuntamento Vedi le chiamate"
    )
  })

  it("con due è al plurale", async () => {
    renderLavoro(
      "/dashboard",
      fakeLavoro({
        calls: calls({ outcome: "app.to" }, { outcome: "app.to" }),
      })
    )

    await screen.findByRole("link", { name: "Vedi le chiamate" })
    expect(box("Il mio oggi").textContent).toBe(
      "2 chiamate · 2 risposte · 2 appuntamenti Vedi le chiamate"
    )
  })

  it("con zero risposte e zero appuntamenti è al plurale", async () => {
    renderLavoro(
      "/dashboard",
      fakeLavoro({ calls: calls({ outcome: "non risponde" }) })
    )

    await screen.findByRole("link", { name: "Vedi le chiamate" })
    expect(box("Il mio oggi").textContent).toBe(
      "1 chiamata · 0 risposte · 0 appuntamenti Vedi le chiamate"
    )
  })

  it("«Vedi le chiamate» è il primo elemento raggiunto da Tab", async () => {
    const { user } = renderLavoro(
      "/dashboard",
      fakeLavoro({ calls: calls({}), toCall: 5 })
    )
    await screen.findByRole("link", { name: "Vedi le chiamate" })
    await within(await findBox("Da chiamare")).findByRole("link", {
      name: "Apri la lista",
    })

    await user.tab()

    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Vedi le chiamate" })
    )
  })
})

describe("«Da chiamare» (AC6, AC9, AC10, AC38)", () => {
  it("mostra «…» mentre carica", async () => {
    const backend = fakeLavoro({ toCall: 5 })
    const release = backend.hold("getMyToCall")
    renderLavoro("/dashboard", backend)

    await waitFor(() => expect(backend.state.reads.getMyToCall).toBe(1))
    expect(box("Da chiamare").textContent).toBe("…")

    release()
    expect(await screen.findByText("5")).toBeTruthy()
  })

  it("mostra il numero con il punto delle migliaia", async () => {
    renderLavoro("/dashboard", fakeLavoro({ toCall: 2854 }))

    expect(await screen.findByText("2.854")).toBeTruthy()
  })

  it("con zero non ha il link", async () => {
    renderLavoro("/dashboard", fakeLavoro({ toCall: 0 }))

    expect(await screen.findByText("0")).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Apri la lista" })).toBeNull()
  })

  it("«Apri la lista» apre i contatti dell'utente da chiamare e che non rispondono", async () => {
    renderLavoro("/dashboard", fakeLavoro({ toCall: 5 }))

    const link = await within(await findBox("Da chiamare")).findByRole("link", {
      name: "Apri la lista",
    })
    const href = new URL(link.getAttribute("href") ?? "", "http://x")

    expect(href.pathname).toBe("/dashboard/contatti")
    expect(
      toContactsInput(parse(Object.fromEntries(href.searchParams)))
    ).toEqual(
      expect.objectContaining({
        onlyMe: true,
        states: ["chiamare", "non risponde"],
        operatorIds: [],
        hasAlert: false,
        includeInactive: false,
      })
    )
  })
})

describe("un riquadro in errore (AC37, AC39)", () => {
  it("«Il mio oggi» in errore lascia «Da chiamare» usabile, senza avvisi", async () => {
    const backend = fakeLavoro({ calls: calls({}), toCall: 5 })
    backend.failWith("getMyDay", "unavailable")
    renderLavoro("/dashboard", backend)

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain(
      "Non è stato possibile caricare il mio oggi."
    )
    expect(
      within(box("Da chiamare")).getByRole("link", { name: "Apri la lista" })
    ).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Vedi le chiamate" })).toBeNull()
    expect(document.querySelector("[data-sonner-toast]")).toBeNull()
    expect(screen.queryByText("errore della rotta")).toBeNull()
  })

  it("«Riprova» rilegge solo quel riquadro, come al primo caricamento", async () => {
    const backend = fakeLavoro({ toCall: 5 })
    backend.failWith("getMyToCall", "unavailable")
    const { user } = renderLavoro("/dashboard", backend)
    await screen.findByText("Non è stato possibile caricare da chiamare.")
    await screen.findByText("Nessuna chiamata ancora")
    const reads = backend.state.reads.getMyDay

    backend.recover("getMyToCall")
    const release = backend.hold("getMyToCall")
    await user.click(screen.getByRole("button", { name: "Riprova" }))

    await waitFor(() => expect(box("Da chiamare").textContent).toBe("…"))
    release()
    expect(await screen.findByText("5")).toBeTruthy()
    expect(backend.state.reads.getMyDay).toBe(reads)
  })

  it("se fallisce un aggiornamento il contenuto resta, con l'errore sopra", async () => {
    const backend = fakeLavoro({ toCall: 5 })
    const { queryClient, user } = renderLavoro("/dashboard", backend)
    await screen.findByText("5")

    backend.failWith("getMyToCall", "unavailable")
    await queryClient.invalidateQueries({ queryKey: ["home", "today"] })

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain(
      "Non è stato possibile caricare da chiamare."
    )
    expect(screen.getByText("5")).toBeTruthy()

    backend.recover("getMyToCall")
    await user.click(screen.getByRole("button", { name: "Riprova" }))

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
    expect(screen.getByText("5")).toBeTruthy()
  })

  it("un aggiornamento non mostra «…»", async () => {
    const backend = fakeLavoro({ toCall: 5 })
    const { queryClient } = renderLavoro("/dashboard", backend)
    await screen.findByText("5")

    const release = backend.hold("getMyToCall")
    void queryClient.invalidateQueries({ queryKey: ["home", "today"] })
    await waitFor(() => expect(backend.state.reads.getMyToCall).toBe(2))

    expect(screen.getByText("5")).toBeTruthy()
    release()
  })
})

describe("i due riquadri (AC6)", () => {
  it("restano a destra anche quando vanno a capo sotto il saluto", async () => {
    renderLavoro("/dashboard", fakeLavoro())

    await screen.findByText("Il mio oggi")

    // No layout in jsdom: with `justify-between` alone a wrapped line starts on
    // the left, and only the automatic margin keeps it to the right
    expect(screen.getByText("Il mio oggi").closest("dl")!.classList).toContain(
      "ml-auto"
    )
  })
})

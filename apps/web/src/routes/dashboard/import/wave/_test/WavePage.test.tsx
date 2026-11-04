import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { fakeImport, waveView } from "@/test/import"
import { renderWave } from "./page"

const unconfirmed = () =>
  waveView({
    deadline: null,
    status: "unconfirmed",
    workdaysLeft: null,
  })

describe("La pagina della Wave", () => {
  it("una Wave senza scadenza apre «Dopo l'import» al primo passo, con il fuoco sul titolo (AC3, AC31)", async () => {
    renderWave(fakeImport({ wave: unconfirmed() }))

    const title = await screen.findByRole("heading", {
      name: "Ingressi e scadenza",
    })
    expect(
      screen.getByRole("heading", { name: "Dopo l'import" })
    ).toBeInTheDocument()
    await waitFor(() => expect(title).toHaveFocus())
  })

  it("per un operatore non esiste, e non chiede niente al server (AC1)", async () => {
    const backend = fakeImport()
    renderWave(backend, { role: "OPERATORE" })

    expect(await screen.findByText("Pagina non trovata")).toBeInTheDocument()
    expect(backend.state.calls).toEqual([])
  })

  it("un id che non è un numero non esiste, senza chiamate", async () => {
    const backend = fakeImport()
    renderWave(backend, { url: "/dashboard/import/abc" })

    expect(await screen.findByText("Pagina non trovata")).toBeInTheDocument()
    expect(backend.state.calls).toEqual([])
  })

  it("una Wave che non c'è mostra «non trovato» (AC1)", async () => {
    const backend = fakeImport()
    backend.state.outcome.wave = "waveNotFound"
    renderWave(backend)

    expect(await screen.findByText("Pagina non trovata")).toBeInTheDocument()
  })

  it("se il ruolo non si sa, mostra l'errore della rotta", async () => {
    renderWave(fakeImport(), { role: undefined })

    expect(await screen.findByText("errore della rotta")).toBeInTheDocument()
  })

  it("con la scadenza apre la panoramica, con il fuoco sul nome della Wave (AC3, AC31)", async () => {
    renderWave(fakeImport({ wave: waveView({ name: "Ottobre" }) }))

    const name = await screen.findByRole("heading", {
      level: 1,
      name: "Ottobre",
    })
    await waitFor(() => expect(name).toHaveFocus())
    expect(
      screen.queryByRole("heading", { name: "Dopo l'import" })
    ).not.toBeInTheDocument()
  })

  it("mentre carica mostra lo scheletro, e un errore si rilegge con «Riprova» (AC38)", async () => {
    const backend = fakeImport({ wave: waveView({ name: "Ottobre" }) })
    backend.state.outcome.wave = "uncertain"
    renderWave(backend)

    expect(
      screen.getByRole("status", { name: "Caricamento della Wave" })
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        "Non è stato possibile caricare la Wave.",
        {},
        { timeout: 3000 }
      )
    ).toBeInTheDocument()

    backend.state.outcome.wave = undefined
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Riprova" }))

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ottobre" })
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Non è stato possibile caricare la Wave.")
    ).not.toBeInTheDocument()
  })

  describe("l'intestazione (AC18)", () => {
    it("ha il percorso verso lo storico, il nome e l'import con i suoi clienti", async () => {
      renderWave(
        fakeImport({
          wave: waveView({
            name: "Ottobre",
            fileName: "wave_ottobre.xlsx",
            customers: 2854,
            importedAt: new Date("2026-11-03T09:00:00Z"),
            today: "2026-11-04",
          }),
        })
      )

      const path = await screen.findByRole("navigation", { name: "Percorso" })
      expect(
        within(path).getByRole("link", { name: "Import" })
      ).toHaveAttribute("href", "/dashboard/import")
      expect(within(path).getByText("wave_ottobre.xlsx")).toBeInTheDocument()
      expect(
        screen.getByText("Importata ieri · 2.854 clienti")
      ).toBeInTheDocument()
    })

    it("dal toast di fine import aggiunge « · import completato»", async () => {
      renderWave(
        fakeImport({
          wave: waveView({
            customers: 1,
            importedAt: new Date("2026-11-04T09:00:00Z"),
            today: "2026-11-04",
          }),
        }),
        { url: "/dashboard/import/5?da=import" }
      )

      expect(
        await screen.findByText(
          "Importata oggi · 1 cliente · import completato"
        )
      ).toBeInTheDocument()
    })

    it("una Wave aperta dice la scadenza e i giorni lavorativi", async () => {
      renderWave(
        fakeImport({
          wave: waveView({
            deadline: "2026-12-03",
            today: "2026-11-04",
            workdaysLeft: 21,
          }),
        })
      )

      expect(
        await screen.findByText("Scadenza gio 3 dic · 21 giorni lavorativi")
      ).toBeInTheDocument()
    })

    it("una Wave scaduta dice da quando e quanto resta da fare", async () => {
      renderWave(
        fakeImport({
          wave: waveView({
            deadline: "2026-11-02",
            status: "expired",
            workdaysLeft: null,
            daysSinceDeadline: 2,
            team: [
              {
                ...waveView().team[0]!,
                waveTodo: { toCall: 1200, noAnswer: 34 },
              },
            ],
          }),
        })
      )

      expect(
        await screen.findByText("Scaduta lun 2 nov · 1.234 da fare")
      ).toBeInTheDocument()
    })

    it("dopo «Annulla» dice «Scadenza da confermare», che durante il flusso non c'è (AC9)", async () => {
      renderWave(fakeImport({ wave: unconfirmed() }))
      await screen.findByRole("heading", { name: "Ingressi e scadenza" })
      expect(
        screen.queryByText("Scadenza da confermare")
      ).not.toBeInTheDocument()

      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "Annulla" }))

      expect(screen.getByText("Scadenza da confermare")).toBeInTheDocument()
      const name = screen.getByRole("heading", { level: 1 })
      await waitFor(() => expect(name).toHaveFocus())
    })
  })

  it("una ricarica dopo «Annulla» riparte dal primo passo (AC3)", async () => {
    const backend = fakeImport({ wave: unconfirmed() })
    const first = renderWave(backend)
    await screen.findByRole("heading", { name: "Ingressi e scadenza" })
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Annulla" }))
    expect(
      screen.queryByRole("heading", { name: "Ingressi e scadenza" })
    ).not.toBeInTheDocument()
    first.unmount()

    renderWave(backend)

    const title = await screen.findByRole("heading", {
      name: "Ingressi e scadenza",
    })
    await waitFor(() => expect(title).toHaveFocus())
  })

  it("dalla Wave A alla Wave B senza scadenza: scheletro, poi B al primo passo senza nulla di A", async () => {
    const backend = fakeImport({ wave: waveView({ name: "Wave A" }) })
    const { router } = renderWave(backend, { url: "/dashboard/import/1" })
    await screen.findByRole("heading", { level: 1, name: "Wave A" })

    backend.state.wave = { ...unconfirmed(), name: "Wave B" }
    await act(() => router.navigate("/dashboard/import/2"))

    expect(
      screen.getByRole("status", { name: "Caricamento della Wave" })
    ).toBeInTheDocument()
    expect(screen.queryByText("Wave A")).not.toBeInTheDocument()
    const title = await screen.findByRole("heading", {
      name: "Ingressi e scadenza",
    })
    expect(
      screen.getByRole("heading", { level: 1, name: "Wave B" })
    ).toBeInTheDocument()
    await waitFor(() => expect(title).toHaveFocus())
    expect(backend.state.waveReads).toEqual([1, 2])
  })
})

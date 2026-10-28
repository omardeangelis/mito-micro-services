import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as XLSX from "xlsx"
import type { OperatorCalls } from "@mito/domain/export/calls"
import { ada, renderWithApi, signedInAs } from "@/test/api"
import { annaCalls, fakeHome, noCalls } from "@/test/home"
import { AdminExportSection } from "../AdminExportSection"
import { answeredSeries, ExportCharts } from "../ExportCharts"
import { ExportDownload } from "../ExportDownload"

// The calls of each operator on a backend in memory, as the tests of
// `AdminExportSection`, `ExportCharts` and `ExportDownload` of the Next.js
// app. Only the file the browser would save is a fake: `writeFile` of xlsx

const mocks = vi.hoisted(() => ({ writeFile: vi.fn() }))

vi.mock("xlsx", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  writeFile: mocks.writeFile,
}))

const renderSection = (backend: ReturnType<typeof fakeHome>) =>
  renderWithApi(<AdminExportSection />, {
    handlers: backend.handlers,
    auth: signedInAs(ada, "ADMIN"),
  })

const from = () => screen.getByLabelText<HTMLInputElement>("Dal")
const to = () => screen.getByLabelText<HTMLInputElement>("Al")

describe("AdminExportSection", () => {
  beforeEach(() => {
    // 23 October 2026, 12:00 in Rome: the selectable days are 24/07–23/10
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-23T10:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("apre sugli ultimi 30 giorni, dentro i giorni selezionabili (AC11b)", async () => {
    const backend = fakeHome()
    renderSection(backend)

    expect(from().value).toBe("2026-09-24")
    expect(to().value).toBe("2026-10-23")
    expect(from().getAttribute("min")).toBe("2026-07-24")
    expect(to().getAttribute("max")).toBe("2026-10-23")
    await screen.findByText("Chiamate effettuate")
    expect(backend.state.callReads).toEqual([
      { from: "2026-09-24", to: "2026-10-23" },
    ])
  })

  it("avvisa che i dati sono completi solo dal 15/09/2026 (AC11b)", async () => {
    renderSection(fakeHome())
    await screen.findByText("Chiamate effettuate")
    expect(screen.queryByText(/Dati completi/)).toBeNull()

    fireEvent.change(from(), { target: { value: "2026-09-10" } })

    expect(screen.getByText("Dati completi solo dal 15/09/2026")).toBeTruthy()
  })

  it("mostra i totali della richiesta del periodo, i grafici e il file (AC16, AC19)", async () => {
    const backend = fakeHome({ calls: annaCalls })
    renderSection(backend)

    const kpis = (await screen.findByText("Chiamate effettuate")).closest("dl")!
    expect(
      within(kpis)
        .getAllByRole("definition")
        .map((node) => node.textContent)
    ).toEqual(["4", "3", "1", "1"])
    expect(
      screen.getByRole("list", { name: "Classifica appuntamenti" })
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Scarica Excel" })).toBeTruthy()
    // One request for the indicators, the charts and the file
    expect(backend.state.callReads).toHaveLength(1)
  })

  it("senza chiamate lo dice e non offre il file (AC14)", async () => {
    renderSection(fakeHome({ calls: noCalls }))

    expect(await screen.findByText("Nessuna chiamata nel periodo")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Scarica Excel" })).toBeNull()
    expect(
      screen.queryByRole("list", { name: "Classifica appuntamenti" })
    ).toBeNull()
  })

  it("non chiede un periodo fuori dai giorni selezionabili", async () => {
    const backend = fakeHome()
    renderSection(backend)
    await screen.findByText("Chiamate effettuate")

    fireEvent.change(from(), { target: { value: "2026-07-01" } })

    expect(screen.getByRole("alert").textContent).toBe(
      "Scegli un periodo tra il 24/07/2026 e il 23/10/2026"
    )
    expect(backend.state.callReads).toHaveLength(1)
  })

  it("se la richiesta fallisce lo dice, senza toast, e con Riprova la rifà", async () => {
    const backend = fakeHome()
    backend.state.failingCalls = true
    renderSection(backend)

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Non è stato possibile caricare le chiamate del periodo"
    )
    expect(
      screen.queryByText("Il servizio non risponde, riprova tra poco")
    ).toBeNull()
    backend.state.failingCalls = false
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }))

    expect(await screen.findByText("Chiamate effettuate")).toBeTruthy()
  })

  it("dopo la mezzanotte di Roma oggi diventa selezionabile senza ricaricare", async () => {
    renderSection(fakeHome())
    await screen.findByText("Chiamate effettuate")

    // 00:30 of the 24th in Rome: a render after it reads the new day
    vi.setSystemTime(new Date("2026-10-23T22:30:00Z"))
    fireEvent.change(to(), { target: { value: "2026-10-22" } })

    expect(to().getAttribute("max")).toBe("2026-10-24")
  })
})

const row = (
  surname: string,
  values: Partial<OperatorCalls>
): OperatorCalls => ({
  operatorId: surname.length,
  name: "Anna",
  surname,
  calls: 0,
  answered: 0,
  appointments: 0,
  noAnswer: 0,
  ...values,
})

describe("ExportCharts", () => {
  it("impila risposte e non risposte per operatore (AC17)", () => {
    expect(
      answeredSeries([row("Rossi", { answered: 3, noAnswer: 2, calls: 5 })])
    ).toEqual([{ Operatore: "Rossi Anna", Risposte: 3, "Non risposte": 2 }])
  })

  it("classifica per appuntamenti sulle risposte, con 0% per chi non ha risposte (AC18)", () => {
    render(
      <ExportCharts
        rows={[
          row("Neri", { calls: 3, noAnswer: 3 }),
          row("Bianchi", { calls: 4, answered: 4, appointments: 1 }),
          row("Rossi", { calls: 2, answered: 2, appointments: 1 }),
        ]}
      />
    )

    const items = within(
      screen.getByRole("list", { name: "Classifica appuntamenti" })
    )
      .getAllByRole("listitem")
      .map((item) => item.textContent?.replace(/\s+/g, " "))
    expect(items).toEqual(["Rossi Anna50%", "Bianchi Anna25%", "Neri Anna0%"])
  })
})

describe("ExportDownload", () => {
  const renderDownload = () =>
    render(
      <ExportDownload
        stats={annaCalls}
        period={{ from: "2026-09-24", to: "2026-10-23" }}
      />
    )

  it("salva i numeri della pagina, con il nome del periodo (AC13, AC19)", async () => {
    mocks.writeFile.mockReset()
    renderDownload()

    await userEvent.click(screen.getByRole("button", { name: "Scarica Excel" }))

    await waitFor(() => expect(mocks.writeFile).toHaveBeenCalledTimes(1))
    const [workbook, name] = mocks.writeFile.mock.calls[0] as [
      XLSX.WorkBook,
      string,
    ]
    expect(name).toBe("chiamate_2026-09-24_2026-10-23.xlsx")
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets.Chiamate!, { header: 1 })
    ).toEqual([
      [
        "Operatore",
        "Chiamate effettuate",
        "Risposte",
        "Appuntamenti fissati",
        "Non risposte",
      ],
      ["Rossi Anna", 4, 3, 1, 1],
      ["Totale", 4, 3, 1, 1],
    ])
  })

  it("lo dice se il file non si crea", async () => {
    mocks.writeFile.mockImplementationOnce(() => {
      throw new Error("disk full")
    })
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    renderDownload()

    await userEvent.click(screen.getByRole("button", { name: "Scarica Excel" }))

    expect((await screen.findByRole("alert")).textContent).toBe(
      "File non creato, riprova"
    )
  })
})

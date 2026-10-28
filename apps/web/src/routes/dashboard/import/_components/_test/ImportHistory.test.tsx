import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { type ImportSummary } from "@mito/contract/import"
import { fakeImport, importRun } from "@/test/import"
import { renderImport } from "../../_test/page"

// The history of the imports on the page, on a backend in memory, as the
// tests of `ImportHistory` of the Next.js app

const run = (overrides: Partial<ImportSummary> = {}) =>
  importRun({
    id: 1,
    finishedAt: new Date("2026-10-25T09:07:05Z"),
    status: "completed",
    customersCreated: 40,
    customersUpdated: 12_000,
    practicesCreated: 50,
    practicesUpdated: 67,
    linksCreated: 90,
    durationMs: 125_000,
    ...overrides,
  })

const history = () =>
  screen.getByRole("region", { name: "Storico degli import" })

const rowOf = async (fileName: string) =>
  (await within(history()).findByRole("cell", { name: fileName })).closest(
    "tr"
  )!

const cellsOf = async (fileName: string) =>
  within(await rowOf(fileName)).getAllByRole("cell")

describe("ImportHistory", () => {
  it("mostra chi, quando, quale file, com'è finito e i numeri (AC28)", async () => {
    renderImport(fakeImport({ imports: [run()] }))

    expect(
      (await cellsOf("wave_ottobre.xlsx")).map((cell) => cell.textContent)
    ).toEqual([
      "25/10/2026, 10:05",
      "Anna Rossi",
      "wave_ottobre.xlsx",
      "Wave",
      "Completato",
      "2 min 5 s",
      "40",
      "12.000",
      "50",
      "67",
      "90",
      "3",
    ])
  })

  it("chiama ogni stato in italiano", async () => {
    renderImport(
      fakeImport({
        imports: [
          run({
            id: 1,
            fileName: "a.xlsx",
            status: "running",
            durationMs: null,
          }),
          run({ id: 2, fileName: "b.xlsx", status: "completed" }),
          run({ id: 3, fileName: "c.csv", status: "failed" }),
          run({ id: 4, fileName: "d.csv", status: "interrupted" }),
        ],
      })
    )

    const states = []
    for (const fileName of ["a.xlsx", "b.xlsx", "c.csv", "d.csv"]) {
      states.push((await cellsOf(fileName))[4]!.textContent)
    }
    expect(states).toEqual(["In corso", "Completato", "Fallito", "Interrotto"])
    expect((await cellsOf("a.xlsx"))[5]!.textContent).toBe("—")
  })

  it("mostra perché un import è fallito, senza niente di scritto (AC29)", async () => {
    renderImport(
      fakeImport({
        imports: [
          run({
            status: "failed",
            failureReason: "Errore del database (codice 40001)",
            customersCreated: null,
            customersUpdated: null,
            practicesCreated: null,
            practicesUpdated: null,
            linksCreated: null,
          }),
        ],
      })
    )

    const cells = await cellsOf("wave_ottobre.xlsx")
    expect(cells[4]!.textContent).toBe(
      "FallitoErrore del database (codice 40001)"
    )
    expect(cells.slice(6, 11).map((cell) => cell.textContent)).toEqual([
      "—",
      "—",
      "—",
      "—",
      "—",
    ])
  })

  it("mostra un import oltre il suo tempo come interrotto (AC30)", async () => {
    renderImport(
      fakeImport({
        imports: [
          run({
            status: "interrupted",
            failureReason: "L'import non è finito entro 30 minuti dall'inizio",
            durationMs: null,
          }),
        ],
      })
    )

    expect((await cellsOf("wave_ottobre.xlsx"))[4]!.textContent).toBe(
      "InterrottoL'import non è finito entro 30 minuti dall'inizio"
    )
  })

  it("scorre gli import 20 alla volta (AC28)", async () => {
    const backend = fakeImport({ imports: [run()], total: 45 })
    renderImport(backend)

    expect(await screen.findByText("Pagina 1 di 3")).toBeTruthy()
    expect(backend.state.pages.at(-1)).toBe(1)
    expect(
      screen
        .getByRole("button", { name: "Precedente" })
        .hasAttribute("disabled")
    ).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Successiva" }))
    expect(await screen.findByText("Pagina 2 di 3")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Successiva" }))

    expect(await screen.findByText("Pagina 3 di 3")).toBeTruthy()
    await waitFor(() => expect(backend.state.pages.at(-1)).toBe(3))
    expect(
      screen
        .getByRole("button", { name: "Successiva" })
        .hasAttribute("disabled")
    ).toBe(true)
  })

  it("non ha pagine con 20 import o meno", async () => {
    renderImport(fakeImport({ imports: [run()], total: 20 }))

    await rowOf("wave_ottobre.xlsx")
    expect(screen.queryByRole("navigation")).toBeNull()
  })

  it("dice quando non c'è ancora nessun import", async () => {
    renderImport(fakeImport())

    expect(await within(history()).findByText("Nessun import")).toBeTruthy()
  })

  it("dice quando lo storico non si carica, senza toast", async () => {
    const backend = fakeImport()
    backend.state.failingList = true
    renderImport(backend)

    expect((await within(history()).findByRole("alert")).textContent).toBe(
      "Lo storico degli import non si carica: riprova tra poco"
    )
    expect(
      screen.queryByText("Il servizio non risponde, riprova tra poco")
    ).toBeNull()
  })
})

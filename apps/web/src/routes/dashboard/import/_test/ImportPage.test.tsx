import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { type ImportSummary } from "@mito/contract/import"
import { completedRun, fakeImport, importRun } from "@/test/import"
import { renderImport } from "./page"

// The page of the imports, as the tests of `dashboard/import/page.tsx` of the
// Next.js app

describe("La pagina Import", () => {
  it("per un operatore non esiste, e non chiede niente al server (AC1)", async () => {
    const backend = fakeImport()
    renderImport(backend, { role: "OPERATORE" })

    expect(await screen.findByText("Pagina non trovata")).toBeTruthy()
    expect(backend.state.calls).toEqual([])
  })

  it("dà a un admin un nuovo import e lo storico (AC28)", async () => {
    renderImport(fakeImport())

    expect(
      await screen.findByRole("heading", { level: 1, name: "Import" })
    ).toBeTruthy()
    const newImport = screen.getByRole("region", { name: "Nuovo import" })
    expect(
      within(newImport).getByRole("button", { name: "Scegli il file" })
    ).toBeTruthy()
    expect(
      await within(
        screen.getByRole("region", { name: "Storico degli import" })
      ).findByText("Nessun import")
    ).toBeTruthy()
  })

  it("se non si sa chi è l'utente, perché `/me` è fallito, mostra l'errore della rotta", async () => {
    renderImport(fakeImport(), { role: undefined })

    expect(await screen.findByText("errore della rotta")).toBeTruthy()
  })

  describe("lo storico", () => {
    const history = () =>
      screen.getByRole("region", { name: "Storico degli import" })

    const wave = (overrides: Partial<ImportSummary>) =>
      importRun({ status: "completed", format: "wave", ...overrides })

    it("una riga di una Wave completata apre la sua pagina, con un collegamento da tastiera (AC2)", async () => {
      const { router } = renderImport(fakeImport({ imports: [completedRun] }))

      const link = await within(history()).findByRole("link", {
        name: "wave_ottobre.xlsx",
      })
      expect(link).toHaveAttribute("href", "/dashboard/import/7")
      // A link is reached with the Tab key: focusable, and Enter follows it
      link.focus()
      expect(document.activeElement).toBe(link)

      fireEvent.click(link)
      await waitFor(() =>
        expect(router.state.location.pathname).toBe("/dashboard/import/7")
      )
      expect(router.state.location.search).toBe("")
    })

    it("una riga di uno Standard non è un collegamento (AC2)", async () => {
      renderImport(
        fakeImport({
          imports: [
            importRun({
              id: 8,
              fileName: "standard.xlsx",
              format: "standard",
              status: "completed",
              customersCreated: 1,
            }),
          ],
        })
      )

      const cell = await within(history()).findByRole("cell", {
        name: "standard.xlsx",
      })
      expect(cell).toBeTruthy()
      expect(
        within(history()).queryByRole("link", { name: "standard.xlsx" })
      ).toBeNull()
    })

    it("una Wave non completata non è un collegamento (AC2)", async () => {
      renderImport(
        fakeImport({
          imports: [
            wave({
              id: 9,
              fileName: "in_corso.xlsx",
              status: "running",
              finishedAt: null,
            }),
            wave({
              id: 10,
              fileName: "fallita.xlsx",
              status: "failed",
              failureReason: "Errore del database",
            }),
          ],
        })
      )

      await within(history()).findByRole("cell", { name: "in_corso.xlsx" })
      expect(
        within(history()).queryByRole("link", { name: "in_corso.xlsx" })
      ).toBeNull()
      expect(
        within(history()).queryByRole("link", { name: "fallita.xlsx" })
      ).toBeNull()
    })
  })
})

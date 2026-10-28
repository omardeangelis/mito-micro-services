import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { fakeImport } from "@/test/import"
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
})

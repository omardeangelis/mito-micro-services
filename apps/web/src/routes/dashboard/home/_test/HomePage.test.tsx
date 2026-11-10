import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { fakeHome } from "@/test/home"
import { renderHome } from "./page"

// The home by role, on a backend in memory: `/dashboard` of a user whose
// `GET /me` failed and of an operator are the view of `lavoro`, whose tests are
// there. The page of the admins is in `AdminHome.test.tsx`

describe("HomePage, gli errori", () => {
  it("se non si sa chi è l'utente, perché `/me` è fallito, mostra la vista di `lavoro` e non l'errore della rotta (D14)", async () => {
    const backend = fakeHome()
    renderHome("/dashboard", backend, { role: undefined })

    expect(await screen.findByText("Il mio oggi")).toBeTruthy()
    expect(screen.queryByText("errore della rotta")).toBeNull()
    expect(screen.queryByText("Analisi Andamento")).toBeNull()
  })
})

describe("HomePage, Nuovo import e chiamate (AC1, AC6, AC28)", () => {
  it("un operatore non vede né il link all'import né le chiamate", async () => {
    const backend = fakeHome()
    renderHome("/dashboard", backend)
    await screen.findByText("Il mio oggi")

    expect(screen.queryByRole("link", { name: "Nuovo import" })).toBeNull()
    expect(screen.queryByText("Chiamate per operatore")).toBeNull()
    expect(backend.state.callReads).toEqual([])
  })
})

import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { fakeImport, waveView } from "@/test/import"
import { renderWave } from "./page"

const unconfirmed = (toAssign = 4) =>
  waveView({
    deadline: null,
    status: "unconfirmed",
    workdaysLeft: null,
    toAssign,
  })

const steps = () => screen.getByRole("list", { name: "Passi" })

describe("La forma del flusso dopo l'import (AC4, AC9, AC31)", () => {
  it("ha i due passi in fila: quello aperto è il primo, il successivo non si apre", async () => {
    renderWave(fakeImport({ wave: unconfirmed() }))
    await screen.findByRole("heading", { name: "Ingressi e scadenza" })

    const row = within(steps())
    expect(row.getAllByRole("listitem")).toHaveLength(2)
    expect(
      row.getByRole("button", { name: /Ingressi e scadenza/ })
    ).toHaveAttribute("aria-current", "step")
    expect(row.getByRole("button", { name: /Assegna/ })).toBeDisabled()
    // The footer: «Annulla» on the first step, and the step's button
    expect(screen.getByRole("button", { name: "Annulla" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Avanti" })).toBeInTheDocument()
  })

  it("il passo dopo ha «Indietro» e «Annulla» nel titolo; il passo fatto ha la spunta e si riapre", async () => {
    renderWave(fakeImport({ wave: unconfirmed() }))
    await screen.findByRole("heading", { name: "Ingressi e scadenza" })
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "Avanti" }))

    const assign = await screen.findByRole("heading", { name: "Assegna" })
    await waitFor(() => expect(assign).toHaveFocus())
    expect(screen.getByRole("button", { name: "Indietro" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Annulla" })).toBeInTheDocument()
    const done = within(steps()).getByRole("button", {
      name: "Ingressi e scadenza, fatto",
    })
    expect(done).toBeEnabled()

    await user.click(done)

    const first = screen.getByRole("heading", { name: "Ingressi e scadenza" })
    await waitFor(() => expect(first).toHaveFocus())
  })

  it("«Indietro» torna al passo prima, «Annulla» del titolo alla panoramica", async () => {
    renderWave(fakeImport({ wave: unconfirmed() }))
    await screen.findByRole("heading", { name: "Ingressi e scadenza" })
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Avanti" }))
    await screen.findByRole("heading", { name: "Assegna" })

    await user.click(screen.getByRole("button", { name: "Indietro" }))
    expect(
      screen.getByRole("heading", { name: "Ingressi e scadenza" })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Avanti" }))
    await screen.findByRole("heading", { name: "Assegna" })
    await user.click(screen.getByRole("button", { name: "Annulla" }))

    // The deadline is saved by «Avanti»: the overview shows the Wave with it
    expect(
      screen.queryByRole("heading", { name: "Dopo l'import" })
    ).not.toBeInTheDocument()
  })

  it("con 0 da assegnare ha solo il primo passo, con «Conferma la scadenza» (AC8)", async () => {
    renderWave(fakeImport({ wave: unconfirmed(0) }))
    await screen.findByRole("heading", { name: "Ingressi e scadenza" })

    expect(
      screen.queryByRole("heading", { name: "Assegna" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Conferma la scadenza" })
    ).toBeInTheDocument()
  })
})

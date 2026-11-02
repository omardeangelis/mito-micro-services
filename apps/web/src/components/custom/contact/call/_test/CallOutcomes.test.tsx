import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { CallOutcomes } from "../CallOutcomes"

const now = new Date("2026-11-02T10:00:00")

async function openPanel() {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "Richiamare" }))
  return user
}

describe("CallOutcomes", () => {
  it("con il riquadro «Richiamare» aperto e nessun giorno scelto, il salvataggio dice «Scegli il giorno» ed è disattivato", async () => {
    render(
      <CallOutcomes customer="Mario Rossi" now={now} onOutcome={vi.fn()} />
    )

    await openPanel()

    const save = screen.getByRole("button", { name: "Scegli il giorno" })
    expect((save as HTMLButtonElement).disabled).toBe(true)
  })

  it("mostra la riga «Sostituisce il richiamo del gg/mm» sotto il titolo del riquadro", async () => {
    render(
      <CallOutcomes
        customer="Mario Rossi"
        now={now}
        replacesAlertDay="2026-11-14"
        onOutcome={vi.fn()}
      />
    )

    await openPanel()

    expect(screen.getByText("Sostituisce il richiamo del 14/11")).toBeTruthy()
  })

  it("senza alert da sostituire non mostra la riga", async () => {
    render(
      <CallOutcomes customer="Mario Rossi" now={now} onOutcome={vi.fn()} />
    )

    await openPanel()

    expect(screen.queryByText(/Sostituisce il richiamo/)).toBeNull()
  })

  it("con un esito in registrazione scrive «Registro…» sul pulsante premuto e disattiva gli altri", () => {
    render(
      <CallOutcomes
        customer="Mario Rossi"
        now={now}
        pending="app.to"
        onOutcome={vi.fn()}
      />
    )

    expect(screen.getByRole("button", { name: "Registro…" })).toBeTruthy()
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Non risponde" })
        .disabled
    ).toBe(true)
  })

  it("«Non interessato» chiama onOutcome con l'esito", async () => {
    const user = userEvent.setup()
    const onOutcome = vi.fn()
    render(
      <CallOutcomes customer="Mario Rossi" now={now} onOutcome={onOutcome} />
    )

    await user.click(screen.getByRole("button", { name: "Non interessato" }))

    expect(onOutcome).toHaveBeenCalledWith(
      "non interessato",
      undefined,
      undefined
    )
  })

  it("mostra l'errore sotto il calendario", async () => {
    render(
      <CallOutcomes
        customer="Mario Rossi"
        now={now}
        error="Non è stato possibile registrare la chiamata"
        onOutcome={vi.fn()}
      />
    )

    expect(
      await screen.findByText("Non è stato possibile registrare la chiamata")
    ).toBeTruthy()
  })
})

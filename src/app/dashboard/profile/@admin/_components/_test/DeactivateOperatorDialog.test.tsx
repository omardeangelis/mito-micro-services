import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { DeactivateOperatorDialog } from "../DeactivateOperatorDialog"

// Il dialog "Disattiva" della tabella admin (gestione-operatori, AC21–AC23)

vi.mock("@/trpc/react", () => ({
  api: {
    operator: {
      getDeactivationImpact: {
        useQuery: () => ({
          data: { customers: 3, contacts: 2, practices: 1 },
          isLoading: false,
        }),
      },
      getOperatorsForDeactivation: {
        useQuery: () => ({
          data: [{ id: 2, name: "Luca", surname: "Bianchi" }],
          isLoading: false,
        }),
      },
    },
  },
}))

vi.mock("../../_actions/deactivateOperator", () => ({
  deactivateOperatorAction: vi.fn(),
}))

describe("DeactivateOperatorDialog", () => {
  it("il bottone Conferma è disabilitato finché non si sceglie una destinazione", async () => {
    const user = userEvent.setup()
    render(
      <DeactivateOperatorDialog
        operator={{ id: 1, name: "Mario", surname: "Rossi" }}
      />
    )

    await user.click(
      screen.getByRole("button", { name: "Disattiva Mario Rossi" })
    )

    expect(
      await screen.findByRole("dialog", { name: "Disattiva Mario Rossi" })
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Conferma" })).toHaveProperty(
      "disabled",
      true
    )
  })
})

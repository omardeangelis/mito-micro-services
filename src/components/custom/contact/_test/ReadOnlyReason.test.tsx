import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ReadOnlyReason } from "../ReadOnlyReason"

const hint = "Usa “Assegna a te” nella scheda cliente"

describe("ReadOnlyReason", () => {
  it("con un operatore del contatto scrive 'Assegnato a <Nome Cognome>'", () => {
    render(
      <ReadOnlyReason
        editability={{ kind: "not_owner", assignee: "Mario Rossi" }}
      />
    )

    expect(screen.getByText("Assegnato a Mario Rossi")).not.toBeNull()
  })

  it("senza operatore scrive 'Non assegnato'", () => {
    render(
      <ReadOnlyReason editability={{ kind: "not_owner", assignee: null }} />
    )

    expect(screen.getByText("Non assegnato")).not.toBeNull()
  })

  it("un contatto superato scrive 'Superato'", () => {
    render(<ReadOnlyReason editability={{ kind: "superseded" }} />)

    expect(screen.getByText("Superato")).not.toBeNull()
  })

  it("l'indicazione compare solo con 'Non assegnato', cliente non assegnato e showHint", () => {
    render(
      <ReadOnlyReason
        editability={{ kind: "not_owner", assignee: null }}
        customerUnassigned
        showHint
      />
    )

    expect(screen.getByText(hint)).not.toBeNull()
  })

  it("senza showHint o senza cliente non assegnato l'indicazione non c'è", () => {
    const { rerender } = render(
      <ReadOnlyReason
        editability={{ kind: "not_owner", assignee: null }}
        customerUnassigned
      />
    )
    expect(screen.queryByText(hint)).toBeNull()

    rerender(
      <ReadOnlyReason
        editability={{ kind: "not_owner", assignee: null }}
        showHint
      />
    )
    expect(screen.queryByText(hint)).toBeNull()
  })

  it("l'indicazione non compare quando il contatto ha un operatore o è superato", () => {
    const { rerender } = render(
      <ReadOnlyReason
        editability={{ kind: "not_owner", assignee: "Mario Rossi" }}
        customerUnassigned
        showHint
      />
    )
    expect(screen.queryByText(hint)).toBeNull()

    rerender(
      <ReadOnlyReason
        editability={{ kind: "superseded" }}
        customerUnassigned
        showHint
      />
    )
    expect(screen.queryByText(hint)).toBeNull()
  })

  it("ha larghezza fissa w-40 e non è un controllo", () => {
    const { container } = render(
      <ReadOnlyReason editability={{ kind: "superseded" }} />
    )

    expect((container.firstElementChild as HTMLElement).className).toContain(
      "w-40"
    )
    expect(screen.queryByRole("button")).toBeNull()
  })
})

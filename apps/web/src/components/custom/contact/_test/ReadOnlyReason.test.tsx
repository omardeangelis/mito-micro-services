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

  it("un contatto superato scrive 'Concluso'", () => {
    render(<ReadOnlyReason editability={{ kind: "superseded" }} />)

    expect(screen.getByText("Concluso")).not.toBeNull()
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

  it("il testo ha contrasto sufficiente anche sulla riga evidenziata: text-neutral-600, non text-muted-foreground", () => {
    render(<ReadOnlyReason editability={{ kind: "superseded" }} />)

    const text = screen.getByText("Concluso")
    const badge = text.closest<HTMLElement>("[title]")!

    expect(badge.className).toContain("text-neutral-600")
    expect(badge.className).not.toContain("text-muted-foreground")
  })

  it("anche l'indicazione usa text-neutral-600", () => {
    render(
      <ReadOnlyReason
        editability={{ kind: "not_owner", assignee: null }}
        customerUnassigned
        showHint
      />
    )

    const hintText = screen.getByText(hint)

    expect(hintText.className).toContain("text-neutral-600")
    expect(hintText.className).not.toContain("text-muted-foreground")
  })

  it("con fit non ha larghezza fissa e il testo non è troncato", () => {
    const { container } = render(
      <ReadOnlyReason
        editability={{ kind: "not_owner", assignee: "Martina Viola" }}
        fit
      />
    )

    expect(
      (container.firstElementChild as HTMLElement).className
    ).not.toContain("w-40")
    const text = screen.getByText("Assegnato a Martina Viola")
    expect(text.closest(".truncate")).toBeNull()
  })

  it("senza fit il testo si tronca nella larghezza fissa della tabella", () => {
    render(
      <ReadOnlyReason
        editability={{ kind: "not_owner", assignee: "Martina Viola" }}
      />
    )

    expect(
      screen.getByText("Assegnato a Martina Viola").closest(".truncate")
    ).not.toBeNull()
  })
})

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ContactNotFound } from "../ContactNotFound"

vi.mock("next/link", async () => {
  const { forwardRef } = await import("react")
  return {
    default: forwardRef<HTMLAnchorElement, React.ComponentProps<"a">>(
      function LinkMock({ href, children, ...rest }, ref) {
        return (
          <a ref={ref} href={href} {...rest}>
            {children}
          </a>
        )
      }
    ),
  }
})

describe("Contatto non trovato (AC26)", () => {
  it("lo dice e rimanda a Contatti, alla vista di prima se c'è", () => {
    render(<ContactNotFound da="stato=richiamare&pagina=2" />)

    expect(screen.getByText("Contatto non trovato")).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: "Torna a Contatti" })
        .getAttribute("href")
    ).toBe("/dashboard/contatti?stato=richiamare&pagina=2")
  })

  it("senza una vista di prima rimanda alla lista", () => {
    render(<ContactNotFound da={undefined} />)

    expect(
      screen
        .getByRole("link", { name: "Torna a Contatti" })
        .getAttribute("href")
    ).toBe("/dashboard/contatti")
  })
})

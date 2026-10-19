import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ContactsError from "../error"

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

beforeEach(() => {
  mocks.refresh.mockClear()
})

describe("l'errore della lista dei contatti", () => {
  it("dice che i contatti non si sono caricati e offre 'Riprova'", async () => {
    const reset = vi.fn()
    const user = userEvent.setup()
    render(<ContactsError error={new Error("timeout")} reset={reset} />)

    expect(
      within(screen.getByRole("alert")).getByText(
        "Non è stato possibile caricare i contatti"
      )
    ).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Riprova" }))

    expect(reset).toHaveBeenCalledTimes(1)
  })

  it("'Riprova' rinfresca anche la pagina: reset da solo ripresenta l'errore in cache, senza chiedere niente al server", async () => {
    const user = userEvent.setup()
    render(<ContactsError error={new Error("timeout")} reset={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Riprova" }))

    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it("non mostra il testo dell'errore, che può contenere dettagli del server", () => {
    render(
      <ContactsError
        error={new Error("select * from task where secret = 1")}
        reset={vi.fn()}
      />
    )

    expect(screen.queryByText(/select \*/)).toBeNull()
  })
})

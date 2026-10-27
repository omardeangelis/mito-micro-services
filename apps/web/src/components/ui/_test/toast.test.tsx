import { act, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Toaster } from "../toaster"
import { toast } from "../use-toast"

describe("toast", () => {
  it("mostra titolo e descrizione nel Toaster", async () => {
    render(<Toaster />)

    act(() => {
      toast({ title: "Salvato", description: "Il cliente è aggiornato" })
    })

    expect(await screen.findByText("Salvato")).toBeInTheDocument()
    expect(screen.getByText("Il cliente è aggiornato")).toBeInTheDocument()
  })
})

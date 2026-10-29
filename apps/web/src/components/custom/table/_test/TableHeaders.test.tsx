import { type Column } from "@tanstack/react-table"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SortableHeader } from "../TableHeaders"

// Il bottone d'ordinamento negli header da 36 px della spec design-system-web
// (AC6, AC13). In jsdom il CSS non c'è: la classe è il contratto con la misura
const column = {
  getIsSorted: () => false,
  toggleSorting: () => undefined,
} as unknown as Column<unknown, unknown>

describe("SortableHeader", () => {
  it("è alto 26 px col contorno di AC13: 26 più 2 × 4 sta nell'header di 36 px", () => {
    render(<SortableHeader column={column}>Nome</SortableHeader>)
    const button = screen.getByRole("button", { name: "Nome" })
    expect(button.getAttribute("class")?.split(/\s+/)).toEqual(
      expect.arrayContaining([
        "h-6.5",
        "focus-visible:outline-2",
        "focus-visible:outline-offset-2",
      ])
    )
  })
})

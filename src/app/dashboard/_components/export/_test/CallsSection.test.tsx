import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CallsSection } from "../CallsSection"

const mocks = vi.hoisted(() => ({ role: "OPERATORE" as "ADMIN" | "OPERATORE" }))

vi.mock("@/trpc/server", () => ({
  api: {
    user: {
      getUserPreference: { query: async () => ({ role: mocks.role }) },
    },
  },
}))

vi.mock("../AdminExportSection", () => ({
  AdminExportSection: () => <div>sezione export</div>,
}))

const renderSection = async () => render(await CallsSection())

describe("CallsSection", () => {
  it("shows neither the section nor the charts to an operator (AC6, AC20)", async () => {
    mocks.role = "OPERATORE"
    const { container } = await renderSection()
    expect(container.innerHTML).toBe("")
  })

  it("shows the calls of each operator to an admin", async () => {
    mocks.role = "ADMIN"
    await renderSection()
    expect(screen.getByText("Chiamate per operatore")).toBeTruthy()
    expect(screen.getByText("sezione export")).toBeTruthy()
  })
})

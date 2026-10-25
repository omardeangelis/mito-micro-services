import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ImportLink } from "../ImportLink"

const mocks = vi.hoisted(() => ({ role: "OPERATORE" as "ADMIN" | "OPERATORE" }))

vi.mock("@/trpc/server", () => ({
  api: {
    user: {
      getUserPreference: { query: async () => ({ role: mocks.role }) },
    },
  },
}))

const renderLink = async () => render(<>{await ImportLink()}</>)

describe("ImportLink", () => {
  it("shows nothing to an operator (AC1)", async () => {
    mocks.role = "OPERATORE"
    const { container } = await renderLink()
    expect(container.innerHTML).toBe("")
  })

  it("takes an admin to the Import page (AC28)", async () => {
    mocks.role = "ADMIN"
    await renderLink()
    expect(
      screen.getByRole("link", { name: "Nuovo import" }).getAttribute("href")
    ).toBe("/dashboard/import")
  })
})

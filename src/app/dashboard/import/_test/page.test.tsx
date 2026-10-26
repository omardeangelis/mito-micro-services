import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ImportPage from "../page"

const mocks = vi.hoisted(() => ({
  role: "OPERATORE" as "ADMIN" | "OPERATORE",
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }))

vi.mock("@/trpc/server", () => ({
  api: {
    user: {
      getUserPreference: { query: async () => ({ role: mocks.role }) },
    },
  },
}))

vi.mock("../_components/NewImport", () => ({
  NewImport: () => <div>nuovo import</div>,
}))

vi.mock("../_components/ImportHistory", () => ({
  ImportHistory: () => <div>storico</div>,
}))

describe("Import page", () => {
  it("doesn't exist for an operator (AC1)", async () => {
    mocks.role = "OPERATORE"
    await expect(ImportPage()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(mocks.notFound).toHaveBeenCalled()
  })

  it("gives an admin a new import and the history (AC28)", async () => {
    mocks.role = "ADMIN"
    render(await ImportPage())
    expect(
      screen.getByRole("heading", { level: 1, name: "Import" })
    ).toBeTruthy()
    expect(
      screen.getByRole("region", { name: "Nuovo import" }).textContent
    ).toContain("nuovo import")
    expect(
      screen.getByRole("region", { name: "Storico degli import" }).textContent
    ).toContain("storico")
  })
})

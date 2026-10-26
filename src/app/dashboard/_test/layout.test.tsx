import { render, screen, within } from "@testing-library/react"
import { type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import Layout from "../layout"

// The dashboard's layout puts every page inside the import's status (AC21):
// without it the Import page breaks and the notice of the end never comes

const { passThrough } = vi.hoisted(() => ({
  passThrough: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/store/context/UserPreferenceContext", () => ({
  UserPreferenceProvider: passThrough,
}))
vi.mock("../_components/GeneralDasboardLayout", () => ({
  DashboardAsyncLayout: passThrough,
}))
vi.mock("@/app/_context/ImportStatus", () => ({
  ImportStatusProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="import-status">{children}</div>
  ),
}))

describe("layout della dashboard", () => {
  it("ogni pagina sta dentro lo stato dell'import", () => {
    render(<Layout>pagina</Layout>)

    expect(
      within(screen.getByTestId("import-status")).getByText("pagina")
    ).toBeTruthy()
  })
})

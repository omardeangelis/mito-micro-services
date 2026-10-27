import { render, screen } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it, vi } from "vitest"
import { RouteError } from "@/routes/RouteError"

const captureException = vi.hoisted(() => vi.fn())
vi.mock("@sentry/react", () => ({ captureException }))

function Broken(): never {
  throw new Error("render failed")
}

describe("RouteError", () => {
  it("shows the error of a route and reports it to Sentry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const router = createMemoryRouter([
      { path: "/", element: <Broken />, errorElement: <RouteError /> },
    ])

    render(<RouterProvider router={router} />)

    expect(
      await screen.findByText("C'è stato un errore Temporaneo")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument()
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "render failed" })
    )
  })
})

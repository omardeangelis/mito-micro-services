import { render, screen } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it } from "vitest"
import { routes } from "../router"

describe("router", () => {
  it("renders the home page at /", async () => {
    render(
      <RouterProvider
        router={createMemoryRouter(routes, { initialEntries: ["/"] })}
      />
    )

    expect(
      await screen.findByRole("heading", { name: "Mito CRM" })
    ).toBeInTheDocument()
  })
})

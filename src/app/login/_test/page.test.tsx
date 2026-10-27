import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getPageSession } from "@/trpc/pageSession"
import Login from "../page"

// The login page (spec auth-better-auth, T9)

const testEnv = vi.hoisted(() => ({
  AUTH_TEST_LOGIN: undefined as string | undefined,
}))

vi.mock("@mito/env", () => ({ env: testEnv }))
vi.mock("@/trpc/pageSession", () => ({ getPageSession: vi.fn() }))
vi.mock("@/lib/authClient", () => ({
  authClient: { signIn: { social: vi.fn(), magicLink: vi.fn() } },
}))
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect")
  }),
}))
vi.mock("next/cache", () => ({ unstable_noStore: () => undefined }))

const renderPage = async (searchParams: Record<string, string> = {}) =>
  render(await Login({ searchParams }))

beforeEach(() => {
  vi.mocked(getPageSession).mockResolvedValue(null)
  testEnv.AUTH_TEST_LOGIN = undefined
})

describe("pagina di login", () => {
  it("con ?error=1 mostra Accesso non riuscito (AC13)", async () => {
    await renderPage({ error: "1" })

    expect(screen.getByRole("alert").textContent).toContain(
      "Accesso non riuscito"
    )
  })

  it("senza errore non mostra avvisi, solo Accedi", async () => {
    await renderPage()

    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("button", { name: "Accedi" })).toBeTruthy()
  })

  it("senza AUTH_TEST_LOGIN non c'è il campo email (OQ6)", async () => {
    await renderPage()

    expect(screen.queryByLabelText("Email")).toBeNull()
  })

  it("con AUTH_TEST_LOGIN=true c'è il campo email del login di prova", async () => {
    testEnv.AUTH_TEST_LOGIN = "true"

    await renderPage()

    expect(screen.getByLabelText("Email")).toBeTruthy()
  })

  it("con una sessione manda alla dashboard", async () => {
    vi.mocked(getPageSession).mockResolvedValue({
      user: { id: "u1", name: "Ada" },
      expires: "2099-01-01T00:00:00.000Z",
    })

    await expect(renderPage()).rejects.toThrow("redirect")
  })
})

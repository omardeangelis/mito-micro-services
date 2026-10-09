import { afterEach, describe, expect, it, vi } from "vitest"
import { existsSync } from "fs"
import { config } from "dotenv"
import { loadEnv } from "@/lib/global/env"

vi.mock("dotenv", () => ({ config: vi.fn(() => ({})) }))
vi.mock("fs", () => {
  const existsSync = vi.fn(() => false)
  return { default: { existsSync }, existsSync }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(config).mockClear()
  vi.mocked(existsSync).mockClear()
})

describe("loadEnv", () => {
  it.each([
    ["development", ".env.development.local"],
    ["test", ".env.test.local"],
  ])("con NODE_ENV=%s carica %s", (nodeEnv, path) => {
    vi.stubEnv("NODE_ENV", nodeEnv)

    loadEnv()

    expect(config).toHaveBeenCalledWith({ path })
  })

  it("con NODE_ENV=production carica .env.prod.local, che vince su .env e sulla shell", () => {
    vi.stubEnv("NODE_ENV", "production")

    loadEnv()

    expect(config).toHaveBeenCalledWith({
      path: ".env.prod.local",
      override: true,
    })
  })

  it("con NODE_ENV=production si ferma se .env.prod.local non si legge", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.mocked(config).mockReturnValueOnce({
      error: new Error("ENOENT: no such file or directory"),
    })

    expect(() => loadEnv()).toThrow(/^Cannot read \.env\.prod\.local/)
  })

  it("con NODE_ENV=production si ferma se c'è ancora .env.production.local", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.mocked(existsSync).mockReturnValueOnce(true)

    expect(() => loadEnv()).toThrow(/^Rename \.env\.production\.local/)
    expect(existsSync).toHaveBeenCalledWith(".env.production.local")
    expect(config).not.toHaveBeenCalled()
  })
})

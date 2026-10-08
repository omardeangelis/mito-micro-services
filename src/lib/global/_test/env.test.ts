import { afterEach, describe, expect, it, vi } from "vitest"
import { config } from "dotenv"
import { loadEnv } from "@/lib/global/env"

vi.mock("dotenv", () => ({ config: vi.fn() }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(config).mockClear()
})

describe("loadEnv", () => {
  it.each([
    ["production", ".env.prod.local"],
    ["development", ".env.development.local"],
    ["test", ".env.test.local"],
  ])("con NODE_ENV=%s carica %s", (nodeEnv, path) => {
    vi.stubEnv("NODE_ENV", nodeEnv)

    loadEnv()

    expect(config).toHaveBeenCalledWith({ path })
  })
})

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync } from "node:fs"
import type * as Fs from "node:fs"

// next.config.js stops while .env.production.local exists, and the checkout
// running the tests may still have it
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof Fs>()
  const existsSync = vi.fn(() => false)
  return { ...fs, default: { ...fs, existsSync }, existsSync }
})

// The options next.config.js passes to Sentry's build plugin, with its config
vi.mock("@sentry/nextjs", () => ({
  withSentryConfig: (config: unknown, options: unknown) => ({
    config,
    options,
  }),
}))

type Built = {
  config: { env: Record<string, string> }
  options: {
    sourcemaps: { disable: boolean }
    release: { create: boolean }
    tunnelRoute?: string
  }
}

// What tells production apart. The shell running the tests may set any of
// them: each case starts without
const SIGNALS = [
  "VERCEL",
  "VERCEL_ENV",
  "APP_ENV",
  "NEXT_PUBLIC_VERCEL_ENV",
  "NEXT_PUBLIC_APP_ENV",
]
const saved = Object.fromEntries(SIGNALS.map((key) => [key, process.env[key]]))

beforeEach(() => {
  for (const key of SIGNALS) delete process.env[key]
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(existsSync).mockClear()
  for (const key of SIGNALS) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

/** next.config.js, and isProduction from src/env.js, with these env vars. */
async function loadNextConfig(vars: Record<string, string>) {
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value)
  vi.resetModules()
  const built = (await import("../../next.config.js")).default as Built
  const { isProduction } = await import("@/env")
  return { ...built, isProduction }
}

describe("next.config.js", () => {
  it.each([
    [
      "la produzione",
      { VERCEL: "1", VERCEL_ENV: "production" },
      true,
      { NEXT_PUBLIC_VERCEL_ENV: "production", NEXT_PUBLIC_APP_ENV: "none" },
    ],
    [
      "lo staging",
      { VERCEL: "1", VERCEL_ENV: "production", APP_ENV: "staging" },
      false,
      { NEXT_PUBLIC_VERCEL_ENV: "production", NEXT_PUBLIC_APP_ENV: "staging" },
    ],
    [
      "una preview",
      { VERCEL: "1", VERCEL_ENV: "preview" },
      false,
      { NEXT_PUBLIC_VERCEL_ENV: "preview", NEXT_PUBLIC_APP_ENV: "none" },
    ],
    [
      "un build locale",
      {},
      false,
      { NEXT_PUBLIC_VERCEL_ENV: "none", NEXT_PUBLIC_APP_ENV: "none" },
    ],
  ])(
    "per %s decide come l'app e scrive sempre un valore nei bundle",
    async (_, vars, production, bundleEnv) => {
      const { config, options, isProduction } = await loadNextConfig(vars)

      expect(isProduction).toBe(production)
      expect(config.env).toEqual(bundleEnv)
      expect(options.sourcemaps.disable).toBe(!production)
      expect(options.release.create).toBe(production)
      expect(options.tunnelRoute).toBe(production ? "/monitoring" : undefined)
    }
  )

  it.each([
    ["VERCEL senza VERCEL_ENV", { VERCEL: "1" }, /VERCEL_ENV is missing/],
    [
      "un VERCEL_ENV sconosciuto, anche fuori da Vercel",
      { VERCEL_ENV: "prod" },
      /VERCEL_ENV is invalid/,
    ],
    [
      "un NEXT_PUBLIC_VERCEL_ENV diverso da VERCEL_ENV",
      {
        VERCEL: "1",
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_VERCEL_ENV: "production",
      },
      /NEXT_PUBLIC_VERCEL_ENV differs/,
    ],
    [
      "un APP_ENV diverso da staging",
      { VERCEL: "1", VERCEL_ENV: "production", APP_ENV: "prod" },
      /APP_ENV is invalid/,
    ],
    [
      "un NEXT_PUBLIC_APP_ENV senza APP_ENV",
      { VERCEL: "1", VERCEL_ENV: "production", NEXT_PUBLIC_APP_ENV: "staging" },
      /NEXT_PUBLIC_APP_ENV differs/,
    ],
  ])("si ferma con %s", async (_, vars, error) => {
    await expect(loadNextConfig(vars)).rejects.toThrow(error)
  })

  it("si ferma finché c'è .env.production.local nella cartella del progetto", async () => {
    vi.mocked(existsSync).mockReturnValueOnce(true)

    await expect(loadNextConfig({})).rejects.toThrow(
      /^Rename \.env\.production\.local to \.env\.prod\.local/
    )
    expect(existsSync).toHaveBeenCalledWith(
      new URL("../../.env.production.local", import.meta.url)
    )
  })
})

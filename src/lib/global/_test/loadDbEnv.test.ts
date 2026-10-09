import { afterEach, describe, expect, it, vi } from "vitest"
import { existsSync } from "fs"
import { config } from "dotenv"
import { loadEnv } from "@/lib/global/loadDbEnv"

// .env.prod.local with both database keys
const prodFile = {
  parsed: {
    SUPABASE_DB_CONNECTION_STRING: "postgres://db.example/postgres",
    SUPABASE_MITO_PSW: "password",
  },
}

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

  it("senza NODE_ENV non carica nessun file", () => {
    // Typed read-only by Next.js
    const env = process.env as Record<string, string | undefined>
    const saved = env.NODE_ENV
    delete env.NODE_ENV
    try {
      loadEnv()
    } finally {
      if (saved === undefined) delete env.NODE_ENV
      else env.NODE_ENV = saved
    }

    expect(config).not.toHaveBeenCalled()
  })

  it.each(["prod", "Production", "PRODUCTION", "staging"])(
    "con NODE_ENV=%s si ferma senza caricare niente",
    (nodeEnv) => {
      vi.stubEnv("NODE_ENV", nodeEnv)

      expect(() => loadEnv()).toThrow(
        new RegExp(`^NODE_ENV is ${nodeEnv}: the database scripts take only`)
      )
      expect(config).not.toHaveBeenCalled()
      expect(existsSync).not.toHaveBeenCalled()
    }
  )

  it("con NODE_ENV=production carica .env.prod.local, che vince su .env e sulla shell", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.mocked(config).mockReturnValueOnce(prodFile)

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

  it.each([
    ["non c'è", "SUPABASE_MITO_PSW", undefined],
    ["è vuota", "SUPABASE_DB_CONNECTION_STRING", " "],
  ])(
    "con NODE_ENV=production si ferma se in .env.prod.local una chiave del database %s, anche se la shell la dà",
    (_, key, value) => {
      vi.stubEnv("NODE_ENV", "production")
      vi.stubEnv(key, "from-the-shell")
      vi.mocked(config).mockReturnValueOnce({
        parsed: { ...prodFile.parsed, [key]: value },
      })

      expect(() => loadEnv()).toThrow(
        new RegExp(`^\\.env\\.prod\\.local doesn't set ${key}:`)
      )
    }
  )

  it("con NODE_ENV=production si ferma se c'è ancora .env.production.local", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.mocked(existsSync).mockReturnValueOnce(true)

    expect(() => loadEnv()).toThrow(/^Rename \.env\.production\.local/)
    expect(existsSync).toHaveBeenCalledWith(".env.production.local")
    expect(config).not.toHaveBeenCalled()
  })
})

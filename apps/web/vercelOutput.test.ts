import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  IMMUTABLE,
  SECURITY_HEADERS,
  vercelOutputConfig,
  writeVercelOutput,
} from "./vercelOutput"

// Il deploy di apps/web su Vercel (F10, H19): rewrite e header

const BACKEND = "https://mito-crm-staging-869830994359.europe-west3.run.app"

describe("vercelOutputConfig", () => {
  it("manda ogni /api al backend, serve i file, un asset che manca è 404 e il resto va a index.html", () => {
    expect(vercelOutputConfig(BACKEND).routes.slice(2)).toEqual([
      { src: "/api/(.*)", dest: `${BACKEND}/api/$1` },
      { handle: "filesystem" },
      { src: "/assets/(.*)", status: 404 },
      { src: "/(.*)", dest: "/index.html" },
    ])
  })

  it("ha gli header di next.config.js, con la cache immutable sugli asset", () => {
    // Each `key`/`value` of `headers()` of the Next.js app
    const nextConfig = readFileSync(
      resolve(import.meta.dirname, "../../next.config.js"),
      "utf8"
    )
    const nextHeaders = [
      ...nextConfig.matchAll(/key: "([^"]+)",\s*value:\s*"([^"]+)"/g),
    ].map(([, key, value]) => [key, value])
    const [all, assets] = vercelOutputConfig(BACKEND).routes

    expect(nextHeaders.length).toBeGreaterThan(0)
    for (const [key, value] of nextHeaders) {
      expect(
        [
          ...Object.entries(all?.headers ?? {}),
          ...Object.entries(assets?.headers ?? {}),
        ],
        `${key}: ${value}`
      ).toContainEqual([key, value])
    }
    expect(all).toEqual({
      src: "/(.*)",
      headers: SECURITY_HEADERS,
      continue: true,
    })
    expect(assets).toEqual({
      src: "/assets/(.*)",
      headers: { "Cache-Control": IMMUTABLE },
      continue: true,
    })
  })

  it.each([
    ["non https", "http://backend.example"],
    ["con un path", `${BACKEND}/api`],
    ["non un URL", "backend"],
  ])("rifiuta un backend %s", (_, origin) => {
    expect(() => vercelOutputConfig(origin)).toThrow()
  })
})

describe("writeVercelOutput", () => {
  it("copia la build in static e scrive config.json", () => {
    const root = mkdtempSync(join(tmpdir(), "vercel-output-"))
    const dist = join(root, "dist")
    mkdirSync(join(dist, "assets"), { recursive: true })
    writeFileSync(join(dist, "index.html"), "<html></html>")
    writeFileSync(join(dist, "assets", "app-abc.js"), "app")
    const out = join(root, ".vercel", "output")

    writeVercelOutput({ dist, out, backendOrigin: `${BACKEND}/` })

    expect(readFileSync(join(out, "static", "index.html"), "utf8")).toBe(
      "<html></html>"
    )
    expect(
      readFileSync(join(out, "static", "assets", "app-abc.js"), "utf8")
    ).toBe("app")
    expect(JSON.parse(readFileSync(join(out, "config.json"), "utf8"))).toEqual(
      vercelOutputConfig(BACKEND)
    )
  })
})

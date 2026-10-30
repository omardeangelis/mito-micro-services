import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parse, toGamut, wcagContrast } from "culori"
import { describe, expect, it } from "vitest"

// The tokens of the theme against the spec design-system-web: the values of
// appendices A and B (AC1) and the contrasts of AC4, computed from the file so
// a change of value that goes below a threshold fails here
const css = readFileSync(resolve(import.meta.dirname, "../globals.css"), "utf8")

const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ""
const declared = (block: string) =>
  new Map(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name!,
      value!.replace(/\s+/g, " ").trim(),
    ])
  )
const tokens = declared(root)
const everywhere = declared(css)

const neutral = (l: string) => `oklch(${l} 0 0)`

// Appendix A
const appendixA: Record<string, string> = {
  background: neutral("96.2%"),
  card: neutral("100%"),
  popover: neutral("100%"),
  foreground: neutral("20.5%"),
  "card-foreground": neutral("20.5%"),
  "popover-foreground": neutral("20.5%"),
  "secondary-foreground": neutral("20.5%"),
  "accent-foreground": neutral("20.5%"),
  muted: neutral("97.2%"),
  secondary: neutral("97.2%"),
  "muted-foreground": neutral("48.5%"),
  subtle: neutral("63%"),
  accent: neutral("97.8%"),
  primary: "oklch(40% 0.15 272)",
  "primary-hover": "oklch(35% 0.15 272)",
  "primary-foreground": neutral("100%"),
  "primary-soft": "oklch(95.5% 0.021 272)",
  "primary-soft-border": "oklch(89.5% 0.051 272)",
  "primary-soft-foreground": "oklch(42% 0.128 272)",
  link: "oklch(40% 0.15 272)",
  ring: "oklch(56% 0.15 272)",
  "ring-soft": "oklch(60% 0.15 272 / 26%)",
  success: "oklch(56% 0.14 152)",
  "success-soft": "oklch(96.6% 0.035 152)",
  "success-soft-border": "oklch(88.5% 0.07 152)",
  "success-soft-foreground": "oklch(43% 0.11 152)",
  warning: "oklch(64% 0.14 66)",
  "warning-soft": "oklch(97.3% 0.029 86)",
  "warning-soft-border": "oklch(89% 0.08 84)",
  "warning-soft-foreground": "oklch(47% 0.105 60)",
  destructive: "oklch(53% 0.19 26)",
  "destructive-hover": "oklch(48% 0.18 26)",
  "destructive-foreground": neutral("100%"),
  "destructive-text": "oklch(53% 0.19 26)",
  "destructive-ring": "oklch(60% 0.19 26 / 20%)",
  "destructive-soft": "oklch(96.7% 0.016 20)",
  "destructive-soft-border": "oklch(89% 0.058 22)",
  "destructive-soft-foreground": "oklch(47% 0.17 26)",
  border: neutral("92.2%"),
  "border-strong": neutral("87.2%"),
  input: neutral("86%"),
  "input-hover": neutral("78%"),
  control: neutral("60%"),
  tooltip: neutral("22%"),
  "tooltip-foreground": neutral("100%"),
  sidebar: neutral("96.2%"),
  "sidebar-foreground": neutral("40%"),
  "sidebar-muted": neutral("47%"),
  "sidebar-accent": neutral("93.5%"),
  "sidebar-primary": neutral("100%"),
  "sidebar-primary-foreground": neutral("20.5%"),
  "chart-1": "oklch(45% 0.15 272)",
  "chart-1-soft": "oklch(88% 0.052 272)",
  overlay: "oklch(20% 0 0 / 32%)",
}

// Appendix B: bg, border, text, dot of each tone
const tones: Record<string, [string, string, string, string]> = {
  blue: [
    "96.5% 0.018 245",
    "89.5% 0.055 245",
    "45% 0.113 245",
    "63% 0.159 245",
  ],
  indigo: [
    "96.5% 0.017 285",
    "89.5% 0.053 285",
    "45% 0.13 285",
    "63% 0.16 285",
  ],
  magenta: [
    "96.5% 0.028 330",
    "89.5% 0.065 330",
    "45% 0.13 330",
    "63% 0.16 330",
  ],
  orange: ["96.5% 0.019 48", "89.5% 0.06 48", "45% 0.123 48", "63% 0.16 48"],
  amber: ["96.5% 0.032 80", "89.5% 0.065 80", "47% 0.105 66", "66% 0.135 90"],
  teal: ["96.5% 0.032 188", "89.5% 0.065 188", "45% 0.078 188", "63% 0.11 188"],
  green: [
    "96.5% 0.032 150",
    "89.5% 0.065 150",
    "45% 0.124 150",
    "63% 0.16 150",
  ],
  red: ["96.5% 0.017 24", "89.5% 0.055 24", "45% 0.13 24", "63% 0.16 24"],
  neutral: ["95.5% 0 0", "88.5% 0 0", "40% 0 0", "64% 0 0"],
}
const appendixB = Object.fromEntries(
  Object.entries(tones).flatMap(([tone, values]) =>
    (["bg", "border", "text", "dot"] as const).map((part, i) => [
      `tag-${tone}-${part}`,
      `oklch(${values[i]})`,
    ])
  )
)

const shadows: Record<string, string> = {
  xs: "0 1px 2px #16161612",
  card: "0 1px 2px 0 #1616160d",
  pop: "0 18px 40px -12px #0b0b0b3d, 0 2px 6px #0b0b0b12",
  "sidebar-active": "0 1px 2px #16161614, 0 0 0 1px #e5e5e5",
}

const srgb = toGamut("rgb", "oklch")
const contrast = (text: string, surface: string) => {
  const a = tokens.get(text)
  const b = tokens.get(surface)
  if (a === undefined || b === undefined) return 0
  return wcagContrast(srgb(parse(a)!), srgb(parse(b)!))
}

const toneNames = Object.keys(tones)
const softTypes = ["primary", "success", "warning", "destructive"]
// AC4: [text, surface] pairs and their threshold
const pairs: [string, string, number][] = [
  ...["card", "background", "accent", "muted", "primary-soft"].map(
    (s) => ["foreground", s, 4.5] as [string, string, number]
  ),
  ...["card", "muted", "accent", "primary-soft"].map(
    (s) => ["muted-foreground", s, 4.5] as [string, string, number]
  ),
  ["primary-foreground", "primary", 4.5],
  ["primary-foreground", "primary-hover", 4.5],
  ["link", "card", 4.5],
  ...softTypes.map(
    (t) =>
      [`${t}-soft-foreground`, `${t}-soft`, 4.5] as [string, string, number]
  ),
  ["destructive-text", "card", 4.5],
  ["destructive-text", "destructive-soft", 4.5],
  ["destructive-text", "primary-soft", 4.5],
  ["destructive-foreground", "destructive", 4.5],
  ["tooltip-foreground", "tooltip", 4.5],
  ...toneNames.flatMap((t) => [
    [`tag-${t}-text`, `tag-${t}-bg`, 4.5] as [string, string, number],
    [`tag-${t}-text`, "primary-soft", 4.5] as [string, string, number],
  ]),
  ["sidebar-foreground", "sidebar", 4.5],
  ["sidebar-muted", "sidebar", 4.5],
  ["ring", "card", 3],
  ["ring", "background", 3],
  ["ring", "primary-soft", 3],
  ["control", "card", 3],
  ["primary", "background", 3],
  ...toneNames.map(
    (t) => [`tag-${t}-dot`, "card", 3] as [string, string, number]
  ),
]

describe("i token di globals.css", () => {
  it("primary vale oklch(40% 0.15 272) e il suo testo supera 4,5:1", () => {
    expect(tokens.get("primary")).toBe("oklch(40% 0.15 272)")
    expect(contrast("primary-foreground", "primary")).toBeGreaterThanOrEqual(
      4.5
    )
  })

  it.each(Object.entries({ ...appendixA, ...appendixB }))(
    "%s vale %s, e il tema ne fa un colore",
    (name, value) => {
      expect(tokens.get(name)).toBe(value)
      expect(everywhere.get(`color-${name}`)).toBe(`var(--${name})`)
    }
  )

  it.each(Object.entries(shadows))("l'ombra %s vale %s", (name, value) => {
    expect(everywhere.get(`shadow-${name}`)).toBe(value)
  })

  it.each(pairs)("%s su %s raggiunge %d:1", (text, surface, threshold) => {
    expect(contrast(text, surface)).toBeGreaterThanOrEqual(threshold)
  })

  it("spegne palette e ombre di Tailwind e lascia il resto di prima", () => {
    expect(css).toMatch(/--color-\*:\s*initial;/)
    expect(css).toMatch(/--shadow-\*:\s*initial;/)
    expect(css).toContain("@custom-variant dark")
    expect(css).not.toContain(".dark {")
    expect(css).not.toContain("@tailwindcss/forms")
    expect(css).not.toContain("Inter")
    expect(css).toContain('"Geist Variable"')
  })
})

describe("il focus di base (AC13)", () => {
  it("link e bottoni senza classi proprie hanno il contorno ring di 2 px a 2 px", () => {
    const rule = /([^{}]*:focus-visible[^{}]*)\{([^}]*)\}/.exec(css)
    expect(rule?.[1]).toMatch(/\ba:focus-visible/)
    expect(rule?.[1]).toMatch(/\bbutton:focus-visible/)
    expect(rule?.[1]).toMatch(/\[role="button"\]:focus-visible/)
    expect(rule?.[2]).toMatch(/outline:\s*2px solid var\(--color-ring\)/)
    expect(rule?.[2]).toMatch(/outline-offset:\s*2px/)
  })
})

describe("appendice C", () => {
  it.each([
    ["radius-control", "8px"],
    ["radius-card", "10px"],
    ["radius-sheet", "12px"],
    ["radius-nav", "7px"],
    ["radius-check", "4px"],
    ["text-sm", "0.8125rem"],
    ["text-base", "0.8125rem"],
    ["text-lg", "0.875rem"],
    ["text-xl", "0.875rem"],
    ["text-title", "1.25rem"],
    ["text-lg--font-weight", "650"],
    ["text-xl--font-weight", "650"],
    ["text-2xl--font-weight", "650"],
    ["text-title--font-weight", "650"],
    ["font-weight-label", "550"],
    ["font-weight-heading", "650"],
  ])("--%s è %s", (name, value) => {
    expect(everywhere.get(name)).toBe(value)
  })

  // The numbers of the cards are 24 px: Tailwind's text-2xl, which the theme
  // does not redefine
  it("--text-2xl resta 1.5rem di Tailwind", () => {
    expect(everywhere.has("text-2xl")).toBe(false)
  })
})

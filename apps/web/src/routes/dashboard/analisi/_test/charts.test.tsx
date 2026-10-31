import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { fakeAnalisi } from "@/test/analisi"
import { renderAnalisi } from "./page"

/** The drawing of the chart in the panel, once it is there */
const surfaceOf = async (title: string) => {
  const panel = await screen.findByRole("tabpanel", { name: title })
  await waitFor(() =>
    expect(panel.querySelector(".recharts-surface")).not.toBeNull()
  )
  return panel.querySelector(".recharts-wrapper")!
}

/**
 * An element Tab stops on: recharts puts `tabindex="-1"` on its layers and on
 * the tooltip, which keeps them out of the Tab order
 */
const TAB_STOP = '[tabindex]:not([tabindex="-1"])'

/** A color written as a literal, not a token (AC41): #3182bd, #eee, rgb(…) */
const literalColor = /^(#|rgb|hsl)/i

const literalPaints = (root: Element) =>
  [root, ...root.querySelectorAll("*")].flatMap((el) =>
    (["fill", "stroke"] as const)
      .map((prop) => el.getAttribute(prop) ?? "")
      .filter((value) => literalColor.test(value.trim()))
      .map((value) => `${el.tagName.toLowerCase()} ${value}`)
  )

describe("the charts (AC8, AC34, AC41)", () => {
  it("the branches chart has no tab stop and no «application» in its surface", async () => {
    renderAnalisi("/dashboard/analisi?chart=branches", fakeAnalisi(), {
      role: "ADMIN",
    })

    const chart = await surfaceOf("Finanziato per sede")

    expect(chart.querySelectorAll(TAB_STOP)).toHaveLength(0)
    expect(chart.querySelectorAll('[role="application"]')).toHaveLength(0)
  })

  it("draws the first 7 branches and «Altre» (AC4)", async () => {
    renderAnalisi("/dashboard/analisi?chart=branches", fakeAnalisi(), {
      role: "ADMIN",
    })

    const chart = await surfaceOf("Finanziato per sede")

    expect(chart.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(8)
    expect(within(chart as HTMLElement).getByText("Altre")).toBeInTheDocument()
  })

  it.each([
    ["ADMIN", "financed", "Finanziato totale"],
    ["ADMIN", "average", "Finanziato medio per pratica"],
    ["ADMIN", "progress", "Contatti con esito"],
    ["ADMIN", "calls", "Risposte per operatore"],
    ["ADMIN", "appointments", "Tasso di appuntamento"],
    ["OPERATORE", "calls", "Risposte per operatore"],
    ["OPERATORE", "appointments", "Tasso di appuntamento"],
  ] as const)(
    "%s · %s: no tab stop, no literal color",
    async (role, chart, title) => {
      renderAnalisi(`/dashboard/analisi?chart=${chart}`, fakeAnalisi(), {
        role,
      })

      const surface = await surfaceOf(title)

      expect(surface.querySelectorAll(TAB_STOP)).toHaveLength(0)
      expect(surface.querySelectorAll('[role="application"]')).toHaveLength(0)
      expect(literalPaints(surface)).toEqual([])
    }
  )
})

/** The source of every file that draws a chart */
const chartSources = import.meta.glob<string>("../_components/charts/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
})

/** The series and tooltip of recharts: the elements that animate by default */
const ANIMATED =
  /<(Area|Line|Bar|RadialBar|Pie|Radar|Scatter|Funnel|Tooltip)(?=[\s/>])/g

/**
 * The opening tags of `ANIMATED` in `source`, whole: up to the `>` that is
 * outside the braces and the quotes of its props
 */
function animatedTags(source: string): string[] {
  return [...source.matchAll(ANIMATED)].map((match) => {
    let depth = 0
    let quote: string | null = null
    let end = match.index
    for (; end < source.length; end++) {
      const char = source[end]
      if (quote !== null) {
        if (char === quote) quote = null
      } else if (char === '"' || char === "'" || char === "`") quote = char
      else if (char === "{") depth++
      else if (char === "}") depth--
      else if (char === ">" && depth === 0 && source[end - 1] !== "=") break
    }
    return source.slice(match.index, end + 1)
  })
}

describe("no series or tooltip animates (AC8)", () => {
  // recharts 3 animates in JavaScript, never with an <animate> element, so
  // the rendered tree can't tell: what stops it is `isAnimationActive={false}`
  // on every element that has the prop. A new series without it fails here
  const tags = Object.entries(chartSources).flatMap(([file, source]) =>
    animatedTags(source).map((tag) => ({ file, tag }))
  )

  it("finds the series of the charts", () => {
    expect(tags.length).toBeGreaterThanOrEqual(12)
  })

  it.each(tags.map(({ file, tag }) => [file.split("/").at(-1), tag] as const))(
    "%s: %s",
    (_file, tag) => {
      expect(tag).toContain("isAnimationActive={false}")
    }
  )
})

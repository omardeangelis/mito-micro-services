import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { type ImportSummary } from "@mito/contract/import"
import { fakeImport, importRun } from "@/test/import"
import { renderImport } from "../../_test/page"

// Lo stato di ogni import col suo tono e la misura di AC16 (appendice B della
// spec design-system-web: running neutral, completed green, failed red,
// interrupted amber)
const run = (overrides: Partial<ImportSummary>) =>
  importRun({ finishedAt: new Date("2026-10-25T09:07:05Z"), ...overrides })

describe("ImportHistory: i toni degli stati", () => {
  it.each([
    ["a.xlsx", "running", "neutral", "In corso"],
    ["b.xlsx", "completed", "green", "Completato"],
    ["c.csv", "failed", "red", "Fallito"],
    ["d.csv", "interrupted", "amber", "Interrotto"],
  ] as const)(
    "%s, %s, ha il tono %s",
    async (fileName, status, tone, label) => {
      renderImport(fakeImport({ imports: [run({ id: 1, fileName, status })] }))
      const history = screen.getByRole("region", {
        name: "Storico degli import",
      })
      const row = (
        await within(history).findByRole("cell", { name: fileName })
      ).closest("tr")!
      const badge = within(row).getByText(label)
      expect(badge.className.split(" ")).toEqual(
        expect.arrayContaining([
          `bg-tag-${tone}-bg`,
          `border-tag-${tone}-border`,
          `text-tag-${tone}-text`,
          "rounded-full",
          "font-label",
        ])
      )
      expect(badge.className).toMatch(/(^| )h-(5\.5|\[22px\])( |$)/)
    }
  )
})

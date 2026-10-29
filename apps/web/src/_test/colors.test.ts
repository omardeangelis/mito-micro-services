import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { findColorViolations } from "../test/colorGate"

// The color gate (spec design-system-web, AC2): no color outside the tokens in
// apps/web/src, tests excluded. The detector is src/test/colorGate.ts.
//
// AREAS are the areas of the migration, each with the task that migrated it:
// a folder ends with `/`, braces list files, spaces split the paths of one
// area. Each area has its own test, so a failure names the area it is in.
const AREAS = {
  T1: "styles/",
  T4: "components/ui/badge.tsx",
  T5: "components/ui/button.tsx",
  T6: "components/ui/{input,textarea,select,form,label}.tsx components/custom/input/",
  T7: "components/ui/{checkbox,radio-group,switch}.tsx",
  T8: "components/ui/{popover,dropdown-menu,context-menu,command,dialog,sheet,tooltip,skeleton,calendar,accordion,card}.tsx components/custom/date-picker/",
  T9: "components/ui/{table,tabs,toggle,toggle-group,pagination}.tsx components/custom/table/",
  T10: "components/ui/{alert,toast,toaster,avatar}.tsx",
  T11: "components/layout/ routes/dashboard/DashboardShell.tsx",
  T12: "components/custom/badge/priority.tsx",
  T13: "components/custom/badge/TaskStatusBadge.tsx components/custom/contact/",
  T14: "routes/dashboard/contatti/",
  T15a: "routes/dashboard/customers/_components/ routes/dashboard/customers/detail/ routes/dashboard/customers/NewCustomerPage.tsx",
  T15b: "routes/dashboard/customers/new/ routes/dashboard/customers/connect/",
  T16: "routes/dashboard/pratiche/",
  T17a: "components/charts/ components/ui/chart.tsx",
  T17b: "routes/dashboard/home/",
  T18: "routes/dashboard/import/ routes/dashboard/settings/ routes/login/ routes/AppLoading.tsx components/custom/notes/ components/custom/CollassableItem.tsx components/custom/loading-spinner.tsx",
  T20: "routes/dev/",
}

const SRC = resolve(import.meta.dirname, "..")

// Every file of src, relative to it
const files = readdirSync(SRC, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) =>
    join(entry.parentPath, entry.name)
      .slice(SRC.length + 1)
      .replaceAll("\\", "/")
  )

// The sources the gate reads: the tests (every `_test` folder, and src/test
// with their helpers) are out
const sources = files
  .filter((file) => /\.(ts|tsx|css)$/.test(file))
  .filter((file) => !file.startsWith("test/") && !/(^|\/)_test\//.test(file))
  .sort()

/** "a/{b,c}.tsx d/" is the paths `a/b.tsx`, `a/c.tsx` and `d/` */
function pathsOf(area: string): string[] {
  return area.split(" ").flatMap((path) => {
    const braces = /^(.*)\{(.*)\}(.*)$/.exec(path)
    if (!braces) return [path]
    const [, before = "", names = "", after = ""] = braces
    return names.split(",").map((name) => before + name + after)
  })
}

const isIn = (paths: string[], file: string) =>
  paths.some((path) =>
    path.endsWith("/") ? file.startsWith(path) : file === path
  )

/** Each violation as `path:line text`, so a task sees what to fix */
function report(files: string[]): string[] {
  return files.flatMap((file) =>
    findColorViolations(readFileSync(join(SRC, file), "utf8"), file).map(
      (violation) => `${file}:${violation.line} ${violation.text}`
    )
  )
}

describe("colors outside the tokens", () => {
  for (const [task, area] of Object.entries(AREAS)) {
    it(`${task}: ${area}`, () => {
      const files = sources.filter((file) => isIn(pathsOf(area), file))
      expect(files.length).toBeGreaterThan(0)
      expect(report(files)).toEqual([])
    })
  }

  it("src holds only files the gate reads", () => {
    // A .js, .svg or .scss would hold colors the gate never sees
    expect(files.filter((file) => !/\.(ts|tsx|css)$/.test(file))).toEqual([])
  })

  it("none in the files outside the areas", () => {
    // A wrong root would scan nothing and pass
    expect(sources.length).toBeGreaterThan(0)
    const areas = Object.values(AREAS).map(pathsOf)
    const files = sources.filter(
      (file) => !areas.some((paths) => isIn(paths, file))
    )
    expect(report(files)).toEqual([])
  })
})

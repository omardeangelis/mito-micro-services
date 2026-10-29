import { resolve } from "node:path"
import { ESLint } from "eslint"
import { describe, expect, it } from "vitest"

// The ban of D5 (spec design-system-web): a product is colored with
// productTone, never with getLabelColorByProductType of @mito/domain. The code
// is linted as the content of a file of the app, with the app's config
const ROOT = resolve(import.meta.dirname, "../..")
const FILE = resolve(ROOT, "src/routes/NotFound.tsx")
const eslint = new ESLint({ cwd: ROOT })

const banned = async (code: string) => {
  const [result] = await eslint.lintText(code, { filePath: FILE })
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === "no-restricted-syntax")
    .map((m) => m.message)
}

describe("the ban of getLabelColorByProductType", { timeout: 60_000 }, () => {
  it.each([
    'import { getLabelColorByProductType } from "@mito/domain/constants/productMap"\nexport const a = getLabelColorByProductType',
    'import { getLabelColorByProductType as c } from "@mito/domain/constants/productMap"\nexport const a = c',
    'import * as map from "@mito/domain/constants/productMap"\nexport const a = map.getLabelColorByProductType',
    'export const a = async () => (await import("@mito/domain/constants/productMap")).getLabelColorByProductType',
    'export { getLabelColorByProductType } from "@mito/domain/constants/productMap"',
    'import * as map from "@mito/domain/constants/productMap"\nexport const a = map["getLabelColorByProductType"]',
  ])("stops %s", async (code) => {
    expect(await banned(code)).toContain(
      "Color a product with productTone of @/lib/tones"
    )
  })

  it("lets the rest of the module through", async () => {
    expect(
      await banned(
        'import * as map from "@mito/domain/constants/productMap"\nimport { getProductType } from "@mito/domain/constants/productMap"\nexport const a = [map.productMap, getProductType]'
      )
    ).toEqual([])
  })
})

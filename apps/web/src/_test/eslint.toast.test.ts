import { resolve } from "node:path"
import { ESLint } from "eslint"
import { describe, expect, it } from "vitest"

// The ban of D12 (spec toast-sonner, AC1): the toasts are Sonner's, and the
// Toast of Radix and the modules that wrapped it don't come back, in the app,
// in its data layer and harness, and in the tests. The code is linted as the
// content of a file of each, with the app's config
const ROOT = resolve(import.meta.dirname, "../..")
const eslint = new ESLint({ cwd: ROOT })

const FILES = [
  "src/routes/NotFound.tsx",
  "src/api/queryClient.ts",
  "src/routes/dashboard/contatti/_test/ContactRowState.test.tsx",
]

const banned = async (code: string, file: string) => {
  const [result] = await eslint.lintText(code, {
    filePath: resolve(ROOT, file),
  })
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === "no-restricted-imports")
    .map((m) => m.message)
}

describe("the ban of the Toast of Radix", { timeout: 60_000 }, () => {
  it.each([
    'import { toast } from "./use-toast"\nexport const a = toast',
    'import { Toaster } from "./toaster"\nexport const a = Toaster',
    'import { ToastAction } from "./toast"\nexport const a = ToastAction',
  ])("stops %s next to the old files", async (code) => {
    const messages = await banned(code, "src/components/ui/button.tsx")
    expect(messages.some((m) => m.includes("sonner"))).toBe(true)
  })

  it.each([
    'import { toast } from "../use-toast"\nexport const a = toast',
    'import { Toaster } from "../toaster"\nexport const a = Toaster',
  ])("stops %s in the tests of the old files", async (code) => {
    const messages = await banned(
      code,
      "src/components/ui/_test/button.test.tsx"
    )
    expect(messages.some((m) => m.includes("sonner"))).toBe(true)
  })

  describe.each(FILES)("in %s", (file) => {
    it.each([
      'import { Toast } from "radix-ui"\nexport const a = Toast',
      'import { Toast as T } from "radix-ui"\nexport const a = T',
      'import { toast } from "@/components/ui/use-toast"\nexport const a = toast',
      'import { Toaster } from "@/components/ui/toaster"\nexport const a = Toaster',
      'import { ToastAction } from "@/components/ui/toast"\nexport const a = ToastAction',
      'import * as Toast from "@radix-ui/react-toast"\nexport const a = Toast',
    ])("stops %s", async (code) => {
      const messages = await banned(code, file)
      expect(messages.some((m) => m.includes("sonner"))).toBe(true)
    })

    it("lets the rest of radix-ui and sonner through", async () => {
      expect(
        await banned(
          'import { Dialog } from "radix-ui"\nimport { toast } from "sonner"\nexport const a = [Dialog, toast]',
          file
        )
      ).toEqual([])
    })
  })
})

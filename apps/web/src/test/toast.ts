import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { screen, waitFor } from "@testing-library/react"
import { expect } from "vitest"

/** Waits `ms` of real time */
export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** The toasts on screen: Sonner keeps a closed one 200 ms more, removed */
export const shownToasts = () =>
  document.querySelectorAll('[data-sonner-toast][data-removed="false"]')

/**
 * The toast of Sonner that shows `text`, read through its node: a closed one
 * stays 200 ms more, with `data-removed="true"`
 */
export const toastOf = (text: string) =>
  screen.getByText(text).closest("[data-sonner-toast]")

/**
 * The toast showing `text` lasts `ms`, on the real clock: still on screen
 * 400 ms before, gone within 600 ms after (Sonner's 200 ms exit included).
 * The clock starts when the toast is found, a little after Sonner's timer:
 * the bounds are loose, enough to tell 1, 2, 4, 5, 8 and 10 s apart. For the
 * pages whose backend in memory doesn't run on fake timers
 */
export const expectToastLasts = async (text: string, ms: number) => {
  const shownAt = Date.now()
  expect(toastOf(text)).toHaveAttribute("data-removed", "false")
  await sleep(ms - 400 - (Date.now() - shownAt))
  expect(toastOf(text)).toHaveAttribute("data-removed", "false")
  await waitFor(() => expect(screen.queryByText(text)).toBeNull(), {
    timeout: 1000,
  })
}

/**
 * The rules of the toasts in a stylesheet: each selector that starts from
 * `[data-sonner-toaster]`, with its whitespace collapsed, and its
 * declarations, by property
 */
export const sonnerRules = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .flatMap(([, selectors = "", body = ""]) =>
      selectors.split(",").map((selector) => ({
        selector: selector.replace(/\s+/g, " ").trim(),
        declarations: new Map(
          [...body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(
            ([, name = "", value = ""]) => [name, value.trim()] as const
          )
        ),
      }))
    )
    .filter(({ selector }) => selector.startsWith("[data-sonner-toaster]"))

/**
 * The rules of the toasts in `src/styles/globals.css`, which jsdom doesn't
 * load: the tests of their style read it as text
 */
export const globalsSonnerRules = sonnerRules(
  readFileSync(resolve(import.meta.dirname, "../styles/globals.css"), "utf8")
)

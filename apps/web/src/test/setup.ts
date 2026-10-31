import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { toast } from "sonner"
import { afterEach, beforeEach } from "vitest"

// jsdom lacks what Radix reads on pointer and menu interactions (as in
// src/test/setup.ts of the Next.js app)
const polyfills = {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
}
for (const [name, polyfill] of Object.entries(polyfills)) {
  if (!(name in Element.prototype)) {
    Object.defineProperty(Element.prototype, name, {
      value: polyfill,
      configurable: true,
      writable: true,
    })
  }
}
if (!Reflect.has(window, "ResizeObserver")) {
  window.ResizeObserver = class ResizeObserver {
    observe = () => undefined
    unobserve = () => undefined
    disconnect = () => undefined
  }
}

// Sonner's toasts live in its module: a toast shown after the last test
// ended (a late answer) would be shown again by the next Toaster
beforeEach(() => {
  toast.dismiss()
})

afterEach(() => {
  cleanup()
  toast.dismiss()
})

import { describe, expect, it } from "vitest"
import { cn } from "../utils"

// Le chiavi del tema di design-system-web (D16): misure, pesi, raggi e ombre.
// Senza, due classi della stessa proprietà sopravvivono e vince quella che
// Tailwind scrive dopo, non quella passata dopo
describe("cn con il tema", () => {
  it("conosce misure e pesi del tema", () => {
    expect(cn("text-lg font-semibold", "text-title font-heading")).toBe(
      "text-title font-heading"
    )
    expect(cn("font-medium", "font-label")).toBe("font-label")
    expect(cn("text-muted-foreground", "text-title")).toBe(
      "text-muted-foreground text-title"
    )
  })

  it("conosce raggi e ombre del tema", () => {
    expect(cn("rounded-md", "rounded-control")).toBe("rounded-control")
    expect(cn("rounded-card", "rounded-sheet")).toBe("rounded-sheet")
    expect(cn("shadow-xs", "shadow-pop")).toBe("shadow-pop")
    expect(cn("shadow-card", "shadow-sidebar-active")).toBe(
      "shadow-sidebar-active"
    )
  })
})

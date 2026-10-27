import { describe, expect, it } from "vitest"
import { cn } from "../utils"

describe("cn", () => {
  it("tiene il colore del testo accanto a text-xxs", () => {
    expect(cn("text-primary-foreground", "text-xxs")).toBe(
      "text-primary-foreground text-xxs"
    )
  })

  it("l'ultima classe in conflitto vince", () => {
    expect(cn("px-2 text-sm", "px-4 text-xxs")).toBe("px-4 text-xxs")
  })
})

import { describe, expect, it } from "vitest"
import { containsPattern } from "../index"

// Il pattern `ilike` delle ricerche Clienti e Pratiche

describe("containsPattern", () => {
  it("cerca il testo in qualsiasi punto", () => {
    expect(containsPattern("Rossi")).toBe("%Rossi%")
  })

  it("fa l'escape di \\, % e _ una sola volta", () => {
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%")
    expect(containsPattern("\\%")).toBe("%\\\\\\%%")
  })
})

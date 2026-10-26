import { describe, expect, it } from "vitest"
import { appRouter } from "../../../root"

describe("pratiche router", () => {
  it.each(["getPraticaByPraticaId", "updatePratica", "updateLastEdit"])(
    "non espone più la procedura senza chiamanti %s",
    (procedure) => {
      expect(
        Object.keys(appRouter._def.record.pratiche._def.record)
      ).not.toContain(procedure)
    }
  )
})

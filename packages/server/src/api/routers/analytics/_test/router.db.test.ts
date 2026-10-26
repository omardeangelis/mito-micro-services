import { describe, expect, it } from "vitest"
import { appRouter } from "../../../root"

describe("analitycs router", () => {
  it.each([
    "getPraticheLiquidate",
    "getAllNewPraticheOfLastMonth",
    "getAllImportoRatePageteOfLastMonth",
  ])("non espone più la procedura senza chiamanti %s", (procedure) => {
    expect(
      Object.keys(appRouter._def.record.analitycs._def.record)
    ).not.toContain(procedure)
  })

  it.each([
    "getFinanziatoMedioPerOperatore",
    "getAmountPerSedeInLastMonth",
    "getAllDoneTasksInLastMonth",
    "getFinanziatoTotalePerOperatore",
    "getFinaziatoMedioPerCliente",
  ])("espone %s", (procedure) => {
    expect(Object.keys(appRouter._def.record.analitycs._def.record)).toContain(
      procedure
    )
  })
})

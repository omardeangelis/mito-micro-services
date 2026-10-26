import { describe, expect, it } from "vitest"
import { appRouter } from "../../../root"

describe("analytics router", () => {
  it("il router si chiama `analytics`: `analitycs` non è più fra le chiavi di appRouter", () => {
    const keys = Object.keys(appRouter._def.record)
    expect(keys).toContain("analytics")
    expect(keys).not.toContain("analitycs")
  })

  it("espone esattamente getContactProgress, getFinancedAverage, getFinancedByBranch e getFinancedTotal", () => {
    expect(
      Object.keys(appRouter._def.record.analytics._def.record).sort()
    ).toEqual([
      "getContactProgress",
      "getFinancedAverage",
      "getFinancedByBranch",
      "getFinancedTotal",
    ])
  })

  it.each([
    "getPraticheLiquidate",
    "getAllNewPraticheOfLastMonth",
    "getAllImportoRatePageteOfLastMonth",
    "getFinanziatoMedioPerOperatore",
    "getAmountPerSedeInLastMonth",
    "getAllDoneTasksInLastMonth",
    "getFinanziatoTotalePerOperatore",
    "getFinaziatoMedioPerCliente",
  ])("non espone più la procedura con il nome vecchio %s", (procedure) => {
    expect(
      Object.keys(appRouter._def.record.analytics._def.record)
    ).not.toContain(procedure)
  })
})

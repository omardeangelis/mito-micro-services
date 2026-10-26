import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb } from "@/test/db"
import { createOperator, createTask } from "@/test/factories"

// Caratterizzazione di "Chiamate completate" (AC1, S4): fissa la risposta di
// `analytics.getContactProgress`, senza input, così com'è oggi.
// - `done`: ogni stato tranne `chiamare`, `nessuno` e `null`, attivi e non attivi;
// - `todo`: solo `chiamare`, attivi e non attivi;
// - nessun filtro di data;
// - un ADMIN conta tutti i contatti, un OPERATORE solo quelli con il suo operator_id.

const STATES = [
  "chiamare",
  "followup",
  "non risponde",
  "app.to",
  "caricato",
  "erogata",
  "non interessato",
  "richiamare",
  "nessuno",
  null,
] as const

/** Un contatto per ciascuno stato, attivo e non attivo, dell'operatore dato. */
async function seedContacts(operatorId: number | null) {
  for (const state of STATES) {
    for (const isActive of [true, false]) {
      await createTask({ state, isActive, operatorId })
    }
  }
}

/** Contatti di due operatori e senza operatore, in ognuno degli stati. */
async function seedFixture() {
  const operatorA = await createOperator({ role: "OPERATORE" })
  const operatorB = await createOperator({ role: "OPERATORE" })
  await seedContacts(operatorA.id)
  await seedContacts(operatorB.id)
  await seedContacts(null)
  return { operatorA, operatorB }
}

describe("analytics.getContactProgress (Chiamate completate)", () => {
  beforeAll(async () => {
    await migrateUpTo()
  })

  beforeEach(async () => {
    await resetDb()
  })

  describe("con il fixture completo: due operatori e senza operatore", () => {
    it("un OPERATORE conta solo i suoi contatti, attivi e non attivi: done 14, todo 2", async () => {
      const { operatorA } = await seedFixture()
      const caller = createTestCaller(operatorA)

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 14,
        todo: 2,
      })
    })

    it("l'altro OPERATORE conta solo i suoi contatti: done 14, todo 2", async () => {
      const { operatorB } = await seedFixture()
      const caller = createTestCaller(operatorB)

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 14,
        todo: 2,
      })
    })

    it("un ADMIN conta tutti i contatti, attivi e non attivi: done 42, todo 6", async () => {
      await seedFixture()
      const caller = createTestCaller(await createOperator({ role: "ADMIN" }))

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 42,
        todo: 6,
      })
    })

    it("un OPERATORE senza contatti riceve { done: 0, todo: 0 }", async () => {
      await seedFixture()
      const caller = createTestCaller(
        await createOperator({ role: "OPERATORE" })
      )

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 0,
        todo: 0,
      })
    })
  })

  describe("quali stati contano", () => {
    it("un contatto per stato, attivo: done conta tutti gli stati tranne chiamare, nessuno e null; todo solo chiamare", async () => {
      const operator = await createOperator({ role: "OPERATORE" })
      for (const state of STATES) {
        await createTask({ state, isActive: true, operatorId: operator.id })
      }
      const caller = createTestCaller(operator)

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 7,
        todo: 1,
      })
    })

    it("followup e non risponde sono fra i completati", async () => {
      const operator = await createOperator({ role: "OPERATORE" })
      await createTask({
        state: "followup",
        isActive: true,
        operatorId: operator.id,
      })
      await createTask({
        state: "non risponde",
        isActive: true,
        operatorId: operator.id,
      })
      const caller = createTestCaller(operator)

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 2,
        todo: 0,
      })
    })

    it("nessuno e null non contano in done, né in todo", async () => {
      const operator = await createOperator({ role: "OPERATORE" })
      await createTask({
        state: "nessuno",
        isActive: true,
        operatorId: operator.id,
      })
      await createTask({ state: null, isActive: true, operatorId: operator.id })
      const caller = createTestCaller(operator)

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 0,
        todo: 0,
      })
    })

    it("un contatto non attivo in `app.to` conta in `done`", async () => {
      const operator = await createOperator({ role: "OPERATORE" })
      await createTask({
        state: "app.to",
        isActive: false,
        operatorId: operator.id,
      })
      const caller = createTestCaller(operator)

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 1,
        todo: 0,
      })
    })

    it("un contatto non attivo in `chiamare` conta in `todo`", async () => {
      const operator = await createOperator({ role: "OPERATORE" })
      await createTask({
        state: "chiamare",
        isActive: false,
        operatorId: operator.id,
      })
      const caller = createTestCaller(operator)

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 0,
        todo: 1,
      })
    })
  })

  describe("senza filtro di data", () => {
    it("un contatto creato due anni fa conta, attivo o non attivo", async () => {
      const operator = await createOperator({ role: "OPERATORE" })
      const twoYearsAgo = new Date()
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
      await createTask({
        state: "erogata",
        isActive: true,
        operatorId: operator.id,
        createdAt: twoYearsAgo,
      })
      await createTask({
        state: "chiamare",
        isActive: false,
        operatorId: operator.id,
        createdAt: twoYearsAgo,
      })
      const caller = createTestCaller(operator)

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 1,
        todo: 1,
      })
    })
  })
})

import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb } from "@/test/db"
import { createOperator, createTask } from "@/test/factories"

// Caratterizzazione di "Contatti con esito" (AC17) sulla coda attuale: fissa la
// risposta di `analytics.getContactProgress`, senza input, così com'è oggi.
// - solo i contatti attivi: un contatto non attivo non conta, in nessuno stato;
// - `done`: gli stati con un esito (`app.to`, `caricato`, `erogata`,
//   `non interessato`, `richiamare`);
// - `todo`: gli stati in coda (`chiamare`, `followup`, `non risponde`);
// - `nessuno` e lo stato vuoto non contano in nessuno dei due;
// - nessun filtro di data;
// - un ADMIN conta tutti i contatti attivi, un OPERATORE solo quelli con il suo operator_id.

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

describe("analytics.getContactProgress (Contatti con esito)", () => {
  beforeAll(async () => {
    await migrateUpTo()
  })

  beforeEach(async () => {
    await resetDb()
  })

  describe("con il fixture completo: due operatori e senza operatore", () => {
    it("un OPERATORE conta solo i suoi contatti attivi: done 5, todo 3", async () => {
      const { operatorA } = await seedFixture()
      const caller = createTestCaller(operatorA)

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 5,
        todo: 3,
      })
    })

    it("l'altro OPERATORE conta solo i suoi contatti attivi: done 5, todo 3", async () => {
      const { operatorB } = await seedFixture()
      const caller = createTestCaller(operatorB)

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 5,
        todo: 3,
      })
    })

    it("un ADMIN conta tutti i contatti attivi, di ogni operatore e senza operatore: done 15, todo 9", async () => {
      await seedFixture()
      const caller = createTestCaller(await createOperator({ role: "ADMIN" }))

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 15,
        todo: 9,
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
    it("un contatto per stato, attivo: done conta gli stati con un esito, todo quelli in coda; nessuno e null non contano in nessuno dei due", async () => {
      const operator = await createOperator({ role: "OPERATORE" })
      for (const state of STATES) {
        await createTask({ state, isActive: true, operatorId: operator.id })
      }
      const caller = createTestCaller(operator)

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 5,
        todo: 3,
      })
    })

    it("followup e non risponde sono fra i da fare (in coda), non fra i completati", async () => {
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
        done: 0,
        todo: 2,
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

    it("un contatto non attivo in `app.to` non conta in `done` di `getContactProgress`", async () => {
      const operator = await createOperator({ role: "OPERATORE" })
      await createTask({
        state: "app.to",
        isActive: false,
        operatorId: operator.id,
      })
      const caller = createTestCaller(operator)

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 0,
        todo: 0,
      })
    })

    it("un contatto non attivo in `chiamare` non conta in `todo`", async () => {
      const operator = await createOperator({ role: "OPERATORE" })
      await createTask({
        state: "chiamare",
        isActive: false,
        operatorId: operator.id,
      })
      const caller = createTestCaller(operator)

      expect(await caller.analytics.getContactProgress()).toEqual({
        done: 0,
        todo: 0,
      })
    })
  })

  describe("senza filtro di data", () => {
    it("un contatto attivo creato due anni fa conta ancora (nessun filtro di data); quello non attivo no", async () => {
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
        todo: 0,
      })
    })
  })
})

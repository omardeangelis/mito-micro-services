import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { type Actor } from "@mito/domain/contact/permissions"
import { migrateUpTo, resetDb } from "@/test/db"
import { createOperator, createTask } from "@/test/factories"
import { actorOf } from "../../contact/actor"
import { contactProgress } from "../contactProgress"
import { at, T } from "./clock"

// "Contatti con esito" sulla coda attuale (AC17): solo i contatti attivi;
// completati gli stati con un esito, da fare quelli in coda; `nessuno` e lo
// stato vuoto fuori. Un ADMIN conta tutti i contatti attivi, un OPERATORE
// quelli con il suo `task.operator_id`.

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

const progressOf = (actor: Actor) => at(T, contactProgress({ actor }))

/** Un contatto attivo e uno non attivo per ogni stato, dell'operatore dato. */
async function seedContacts(operatorId: number | null) {
  for (const state of STATES) {
    for (const isActive of [true, false]) {
      await createTask({ state, isActive, operatorId })
    }
  }
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("contactProgress: la coda attuale", () => {
  it("un contatto non attivo con un esito non conta: un contatto non attivo in `app.to` non conta in `done`", async () => {
    const operator = await createOperator({ role: "OPERATORE" })
    await createTask({
      state: "app.to",
      isActive: false,
      operatorId: operator.id,
    })

    expect(await progressOf(actorOf(operator))).toEqual({ done: 0, todo: 0 })
  })

  it("dei contatti attivi, `done` conta gli stati con un esito e `todo` quelli in coda; `nessuno` e lo stato vuoto in nessuno dei due", async () => {
    const operator = await createOperator({ role: "OPERATORE" })
    for (const state of STATES) {
      await createTask({ state, isActive: true, operatorId: operator.id })
    }

    // done: app.to, caricato, erogata, non interessato, richiamare;
    // todo: chiamare, followup, non risponde
    expect(await progressOf(actorOf(operator))).toEqual({ done: 5, todo: 3 })
  })

  it("`followup` e `non risponde` sono fra i da fare", async () => {
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

    expect(await progressOf(actorOf(operator))).toEqual({ done: 0, todo: 2 })
  })

  it("i contatti non attivi non contano, in nessuno stato", async () => {
    const operator = await createOperator({ role: "OPERATORE" })
    for (const state of STATES) {
      await createTask({ state, isActive: false, operatorId: operator.id })
    }

    expect(await progressOf(actorOf(operator))).toEqual({ done: 0, todo: 0 })
  })

  it("un ADMIN conta tutti i contatti attivi, di ogni operatore e senza operatore; un OPERATORE solo i suoi", async () => {
    const operatorA = await createOperator({ role: "OPERATORE" })
    const operatorB = await createOperator({ role: "OPERATORE" })
    const admin = await createOperator({ role: "ADMIN" })
    await seedContacts(operatorA.id)
    await seedContacts(operatorB.id)
    await seedContacts(null)

    expect(await progressOf(actorOf(admin))).toEqual({ done: 15, todo: 9 })
    expect(await progressOf(actorOf(operatorA))).toEqual({ done: 5, todo: 3 })
    expect(await progressOf(actorOf(operatorB))).toEqual({ done: 5, todo: 3 })
  })

  it("un contatto attivo creato due anni fa conta ancora: nessun filtro di data", async () => {
    const operator = await createOperator({ role: "OPERATORE" })
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    await createTask({
      state: "erogata",
      isActive: true,
      operatorId: operator.id,
      createdAt: twoYearsAgo,
    })

    expect(await progressOf(actorOf(operator))).toEqual({ done: 1, todo: 0 })
  })
})

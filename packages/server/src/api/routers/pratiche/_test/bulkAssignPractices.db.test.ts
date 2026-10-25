import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { asc } from "drizzle-orm"
import { db } from "@mito/db"
import { practices } from "@mito/db/schema/pratiche"
import { migrateUpTo, resetDb } from "@/test/db"
import { createTestCaller, rejectionOf } from "@/test/caller"
import {
  createCustomer,
  createOperator,
  createPractice,
  createUser,
} from "@/test/factories"

// "Assegna" della pagina Pratiche: l'operatore scelto sulle pratiche
// selezionate. Fissa il comportamento prima che le pratiche si blocchino in
// ordine (import-pratiche, T9b, D6)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const operatorsOfPractices = async () =>
  (
    await db
      .select({
        praticaId: practices.praticaId,
        operatorId: practices.operatorId,
      })
      .from(practices)
      .orderBy(asc(practices.praticaId))
  ).map(({ praticaId, operatorId }) => [praticaId, operatorId])

describe("pratiche.bulkAssignPractices", () => {
  it("dà l'operatore alle pratiche scelte e lascia le altre come sono", async () => {
    const [mario, anna] = [await createOperator(), await createOperator()]
    const customer = await createCustomer()
    await createPractice({ customerId: customer.id, praticaId: "P1" })
    await createPractice({
      customerId: customer.id,
      praticaId: "P2",
      operatorId: anna.id,
    })
    await createPractice({
      customerId: customer.id,
      praticaId: "P3",
      operatorId: anna.id,
    })

    await createTestCaller(mario).pratiche.bulkAssignPractices({
      operatorId: mario.id,
      practiceIds: ["P1", "P2", "P9"],
    })

    expect(await operatorsOfPractices()).toEqual([
      ["P1", mario.id],
      ["P2", mario.id],
      ["P3", anna.id],
    ])
  })

  it("senza pratiche non cambia nulla", async () => {
    const mario = await createOperator()
    const customer = await createCustomer()
    await createPractice({ customerId: customer.id, praticaId: "P1" })

    await createTestCaller(mario).pratiche.bulkAssignPractices({
      operatorId: mario.id,
      practiceIds: [],
    })

    expect(await operatorsOfPractices()).toEqual([["P1", null]])
  })

  it("un utente senza riga operatore è rifiutato (BAD_REQUEST, dal middleware degli operatori) e non cambia nulla", async () => {
    const user = await createUser({ role: "ADMIN" })
    const mario = await createOperator()
    const customer = await createCustomer()
    await createPractice({ customerId: customer.id, praticaId: "P1" })

    const error = await rejectionOf(
      createTestCaller(user).pratiche.bulkAssignPractices({
        operatorId: mario.id,
        practiceIds: ["P1"],
      })
    )

    expect(error).toMatchObject({ code: "BAD_REQUEST" })
    expect(await operatorsOfPractices()).toEqual([["P1", null]])
  })
})

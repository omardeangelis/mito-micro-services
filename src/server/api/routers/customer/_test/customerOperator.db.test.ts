import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { eq } from "drizzle-orm"
import superjson from "superjson"
import { readContactError } from "@/lib/domain/contact/errors"
import { appRouter } from "@/server/api/root"
import { customers } from "@/server/db/schema/customers"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import {
  CustomerAssignmentForbidden,
  customerErrorToTrpc,
} from "@/server/services/customer/errors"
import { createTestCaller } from "@/test/caller"
import { logOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { failNextInsertInto } from "@/test/failpoint"
import {
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"

/** The customer's row as the database holds it. */
const customerRow = async (customerId: string) => {
  const [row] = await testDb
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
  return row!
}

/** The error a rejected call throws. */
const rejectionOf = (call: Promise<unknown>) =>
  call.then(
    () => {
      throw new Error("the call did not fail")
    },
    (caught: unknown) => caught
  )

/** A customer of `operatorId` with an active contact of `contactOperatorId`. */
const customerWithContact = async ({
  operatorId,
  contactOperatorId = operatorId,
  state = "chiamare",
}: {
  operatorId: number | null
  contactOperatorId?: number | null
  state?: "chiamare" | "app.to"
}) => {
  const customer = await createCustomer({ operatorId })
  const contact = await createTask({
    customerId: customer.id,
    operatorId: contactOperatorId,
    state,
  })
  return { customer, contact }
}

/** Customer and contact keep their operators, and nothing was logged. */
const expectUntouched = async ({
  customer,
  contact,
}: Awaited<ReturnType<typeof customerWithContact>>) => {
  expect(await customerRow(customer.id)).toMatchObject({
    operatorId: customer.operatorId,
  })
  expect(await tasksOf(customer.id)).toMatchObject([
    { id: contact.id, operatorId: contact.operatorId, isActive: true },
  ])
  expect(await logOf(customer.id)).toEqual([])
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("customer.handover", () => {
  it("il passaggio di consegne di un cliente con contatto app.to sposta cliente e contatto sul nuovo operatore e scrive una riga operator_reassign per il cliente e una per il contatto", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()
    const customer = await createCustomer({ operatorId: owner.id })
    const closedAt = new Date("2026-10-01T09:00:00Z")
    const contact = await createTask({
      customerId: customer.id,
      operatorId: owner.id,
      state: "app.to",
      closedAt,
    })
    const caller = createTestCaller(owner)

    await caller.customer.handover({
      customerId: customer.id,
      toOperatorId: colleague.id,
    })

    const moved = await caller.customer.getCustomerById({ id: customer.id })
    expect(moved).toMatchObject({ operatorId: colleague.id })
    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, operatorId: colleague.id, isActive: true, closedAt },
    ])
    expect(await logOf(customer.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "operator_reassign",
          source: "detail",
          taskId: null,
          fromOperatorId: owner.id,
          toOperatorId: colleague.id,
          actorOperatorId: owner.id,
        }),
        expect.objectContaining({
          action: "operator_reassign",
          source: "detail",
          taskId: contact.id,
          fromOperatorId: owner.id,
          toOperatorId: colleague.id,
          actorOperatorId: owner.id,
        }),
      ])
    )
    expect(await logOf(customer.id)).toHaveLength(2)
  })
})

describe("customer.handover, who and what moves", () => {
  it("sposta anche il contatto di un collega sul cliente dell'operatore, con fromOperatorId = il collega", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()
    const target = await createOperator()
    const { customer, contact } = await customerWithContact({
      operatorId: owner.id,
      contactOperatorId: colleague.id,
    })

    const result = await createTestCaller(owner).customer.handover({
      customerId: customer.id,
      toOperatorId: target.id,
    })

    expect(result).toEqual({ contactMoved: true })
    expect(await customerRow(customer.id)).toMatchObject({
      operatorId: target.id,
    })
    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, operatorId: target.id },
    ])
    expect(await logOf(customer.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: null,
          fromOperatorId: owner.id,
          toOperatorId: target.id,
        }),
        expect.objectContaining({
          action: "operator_reassign",
          source: "detail",
          taskId: contact.id,
          fromOperatorId: colleague.id,
          toOperatorId: target.id,
          actorOperatorId: owner.id,
        }),
      ])
    )
    expect(await logOf(customer.id)).toHaveLength(2)
  })

  it("su un cliente senza contatto attivo sposta solo il cliente, con una riga sola", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()
    const customer = await createCustomer({ operatorId: owner.id })

    const result = await createTestCaller(owner).customer.handover({
      customerId: customer.id,
      toOperatorId: colleague.id,
    })

    expect(result).toEqual({ contactMoved: false })
    expect(await customerRow(customer.id)).toMatchObject({
      operatorId: colleague.id,
    })
    expect(await logOf(customer.id)).toMatchObject([
      {
        action: "operator_reassign",
        source: "detail",
        taskId: null,
        fromOperatorId: owner.id,
        toOperatorId: colleague.id,
        actorOperatorId: owner.id,
      },
    ])
  })

  it("con il contatto già del destinatario sposta solo il cliente, con una riga sola", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()
    const { customer, contact } = await customerWithContact({
      operatorId: owner.id,
      contactOperatorId: colleague.id,
    })

    const result = await createTestCaller(owner).customer.handover({
      customerId: customer.id,
      toOperatorId: colleague.id,
    })

    expect(result).toEqual({ contactMoved: false })
    expect(await customerRow(customer.id)).toMatchObject({
      operatorId: colleague.id,
    })
    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, operatorId: colleague.id },
    ])
    expect(await logOf(customer.id)).toMatchObject([
      { taskId: null, fromOperatorId: owner.id, toOperatorId: colleague.id },
    ])
  })

  it("un ADMIN passa un cliente non assegnato: una riga con fromOperatorId null", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const target = await createOperator()
    const customer = await createCustomer({ operatorId: null })

    await createTestCaller(admin).customer.handover({
      customerId: customer.id,
      toOperatorId: target.id,
    })

    expect(await customerRow(customer.id)).toMatchObject({
      operatorId: target.id,
    })
    expect(await logOf(customer.id)).toMatchObject([
      {
        taskId: null,
        fromOperatorId: null,
        toOperatorId: target.id,
        actorOperatorId: admin.id,
      },
    ])
  })
})

describe("customer.handover, refusals", () => {
  it.each([
    ["l'operatore del cliente", "OPERATORE"],
    ["un ADMIN", "ADMIN"],
  ] as const)(
    "%s che passa il cliente al suo operatore attuale riceve HANDOVER_SAME_OPERATOR anche se il contatto è di un altro, e nulla cambia",
    async (_who, role) => {
      const owner = await createOperator()
      const colleague = await createOperator()
      const actor = role === "ADMIN" ? await createOperator({ role }) : owner
      const seeded = await customerWithContact({
        operatorId: owner.id,
        contactOperatorId: colleague.id,
      })

      const error = await rejectionOf(
        createTestCaller(actor).customer.handover({
          customerId: seeded.customer.id,
          toOperatorId: owner.id,
        })
      )

      expect(error).toMatchObject({ code: "BAD_REQUEST" })
      expect(readContactError(error)).toEqual({
        code: "HANDOVER_SAME_OPERATOR",
        payload: {},
      })
      await expectUntouched(seeded)
    }
  )

  it.each([
    ["di un collega", true],
    ["non assegnato", false],
  ] as const)(
    "un OPERATORE su un cliente %s riceve CUSTOMER_ASSIGNMENT_FORBIDDEN e nulla cambia",
    async (_which, assigned) => {
      const operator = await createOperator()
      const colleague = await createOperator()
      const seeded = await customerWithContact({
        operatorId: assigned ? colleague.id : null,
        contactOperatorId: operator.id,
      })

      const error = await rejectionOf(
        createTestCaller(operator).customer.handover({
          customerId: seeded.customer.id,
          toOperatorId: operator.id,
        })
      )

      expect(error).toMatchObject({ code: "FORBIDDEN" })
      expect(readContactError(error)).toEqual({
        code: "CUSTOMER_ASSIGNMENT_FORBIDDEN",
        payload: {},
      })
      await expectUntouched(seeded)
    }
  )

  it.each([
    ["che non esiste", async (): Promise<number> => 999_999],
    [
      "di sistema, senza utente",
      async (): Promise<number> => (await createSystemOperator()).id,
    ],
  ] as const)(
    "un destinatario %s riceve OPERATOR_NOT_FOUND e nulla cambia",
    async (_which, targetId) => {
      const owner = await createOperator()
      const seeded = await customerWithContact({ operatorId: owner.id })

      const error = await rejectionOf(
        createTestCaller(owner).customer.handover({
          customerId: seeded.customer.id,
          toOperatorId: await targetId(),
        })
      )

      expect(error).toMatchObject({ code: "BAD_REQUEST" })
      expect(readContactError(error)).toEqual({
        code: "OPERATOR_NOT_FOUND",
        payload: {},
      })
      await expectUntouched(seeded)
    }
  )

  it("un cliente che non esiste riceve CUSTOMER_NOT_FOUND", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()

    const error = await rejectionOf(
      createTestCaller(owner).customer.handover({
        customerId: "missing",
        toOperatorId: colleague.id,
      })
    )

    expect(error).toMatchObject({ code: "NOT_FOUND" })
    expect(readContactError(error)).toEqual({
      code: "CUSTOMER_NOT_FOUND",
      payload: {},
    })
  })

  it("se la scrittura del log fallisce, cliente, contatto e log restano come prima", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()
    const seeded = await customerWithContact({ operatorId: owner.id })
    await failNextInsertInto(taskEventLog)
    // runTrpc logs the database error
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      createTestCaller(owner).customer.handover({
        customerId: seeded.customer.id,
        toOperatorId: colleague.id,
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })

    await expectUntouched(seeded)
  })

  it("CustomerAssignmentForbidden arriva al client come data.contactError", () => {
    const shape = appRouter.getErrorShape({
      error: customerErrorToTrpc(new CustomerAssignmentForbidden()),
      type: "mutation",
      path: "customer.handover",
      input: undefined,
      ctx: undefined,
    })
    const received = superjson.parse<typeof shape>(superjson.stringify(shape))

    expect(received.data.contactError).toEqual({
      code: "CUSTOMER_ASSIGNMENT_FORBIDDEN",
      payload: {},
    })
  })
})

describe("customer.updateCustomerFromDashboard", () => {
  it("salva l'anagrafica e ignora un operatorId nella richiesta: cliente e contatto restano dei loro operatori, nessuna riga di log", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()
    const seeded = await customerWithContact({ operatorId: owner.id })

    await createTestCaller(owner).customer.updateCustomerFromDashboard({
      id: seeded.customer.id,
      source: "inbound",
      phoneNumber: "3331234567",
      operatorId: colleague.id,
    } as never)

    expect(await customerRow(seeded.customer.id)).toMatchObject({
      phoneNumber: "3331234567",
    })
    await expectUntouched(seeded)
  })

  it("salvare l'anagrafica di un cliente con un contatto chiamare di un altro operatore non sposta più il contatto", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()
    const seeded = await customerWithContact({
      operatorId: owner.id,
      contactOperatorId: colleague.id,
    })

    await createTestCaller(owner).customer.updateCustomerFromDashboard({
      id: seeded.customer.id,
      source: "inbound",
      email: "anna@example.com",
    })

    expect(await customerRow(seeded.customer.id)).toMatchObject({
      email: "anna@example.com",
    })
    await expectUntouched(seeded)
  })
})

describe("customer.assignToYourself", () => {
  it("'Assegna a te' su un cliente già assegnato a un altro operatore risponde FORBIDDEN e non cambia l'operatore", async () => {
    const owner = await createOperator()
    const other = await createOperator()
    const customer = await createCustomer({ operatorId: owner.id })

    await expect(
      createTestCaller(other).customer.assignToYourself({ id: customer.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(
      await createTestCaller(owner).customer.getCustomerById({
        id: customer.id,
      })
    ).toMatchObject({ operatorId: owner.id })
    expect(await logOf(customer.id)).toEqual([])
  })

  it("'Assegna a te' su un cliente non assegnato lo dà all'operatore, scrive una riga self_assign e non tocca il contatto", async () => {
    const operator = await createOperator()
    const { customer, contact } = await customerWithContact({
      operatorId: null,
    })

    await createTestCaller(operator).customer.assignToYourself({
      id: customer.id,
    })

    expect(await customerRow(customer.id)).toMatchObject({
      operatorId: operator.id,
    })
    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, operatorId: null, isActive: true },
    ])
    expect(await logOf(customer.id)).toMatchObject([
      {
        action: "operator_reassign",
        source: "self_assign",
        taskId: null,
        fromOperatorId: null,
        toOperatorId: operator.id,
        actorOperatorId: operator.id,
      },
    ])
  })

  it.each([
    ["un OPERATORE", "OPERATORE"],
    ["un ADMIN", "ADMIN"],
  ] as const)(
    "%s su un cliente di un altro operatore riceve CUSTOMER_ASSIGNMENT_FORBIDDEN e nulla cambia",
    async (_who, role) => {
      const owner = await createOperator()
      const actor = await createOperator({ role })
      const seeded = await customerWithContact({ operatorId: owner.id })

      const error = await rejectionOf(
        createTestCaller(actor).customer.assignToYourself({
          id: seeded.customer.id,
        })
      )

      expect(error).toMatchObject({ code: "FORBIDDEN" })
      expect(readContactError(error)).toEqual({
        code: "CUSTOMER_ASSIGNMENT_FORBIDDEN",
        payload: {},
      })
      await expectUntouched(seeded)
    }
  )

  it("un cliente che non esiste riceve CUSTOMER_NOT_FOUND", async () => {
    const operator = await createOperator()

    const error = await rejectionOf(
      createTestCaller(operator).customer.assignToYourself({ id: "missing" })
    )

    expect(error).toMatchObject({ code: "NOT_FOUND" })
    expect(readContactError(error)).toEqual({
      code: "CUSTOMER_NOT_FOUND",
      payload: {},
    })
  })
})

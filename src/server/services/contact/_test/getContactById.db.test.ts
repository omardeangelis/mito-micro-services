import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { readContactError } from "@mito/domain/contact/errors"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, tasksOf } from "@/test/db"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
  createUser,
} from "@/test/factories"

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("expected the call to fail")
    },
    (caught: unknown) => caught
  )

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("task.getContactById", () => {
  describe("the other contacts of the customer (AC80)", () => {
    it("lists them newest created first, with state, operator and dates, and not the contact itself", async () => {
      const me = await createOperator({ name: "Mario", surname: "Rossi" })
      const other = await createOperator({ name: "Giulia", surname: "Bianchi" })
      const customer = await createCustomer({ operatorId: me.id })
      const oldest = await createTask({
        customerId: customer.id,
        operatorId: other.id,
        isActive: false,
        state: "non interessato",
        closedAt: new Date("2026-02-10T09:00:00Z"),
        createdAt: new Date("2026-02-01T09:00:00Z"),
      })
      const newest = await createTask({
        customerId: customer.id,
        operatorId: me.id,
        isActive: false,
        state: "erogata",
        closedAt: null,
        createdAt: new Date("2026-03-01T09:00:00Z"),
      })
      const active = await createTask({
        customerId: customer.id,
        operatorId: me.id,
        createdAt: new Date("2026-04-01T09:00:00Z"),
      })
      // Another customer's contact is nobody's history here
      await createTask({ customerId: (await createCustomer()).id })

      const result = await createTestCaller(me).task.getContactById({
        id: String(active.id),
      })

      expect(result.customerContacts).toEqual([
        {
          id: newest.id,
          state: "erogata",
          isActive: false,
          closedAt: null,
          createdAt: new Date("2026-03-01T09:00:00Z"),
          operator: { id: me.id, name: "Mario", surname: "Rossi" },
        },
        {
          id: oldest.id,
          state: "non interessato",
          isActive: false,
          closedAt: new Date("2026-02-10T09:00:00Z"),
          createdAt: new Date("2026-02-01T09:00:00Z"),
          operator: { id: other.id, name: "Giulia", surname: "Bianchi" },
        },
      ])
    })

    it("from a superseded contact the list holds the active one and the rest, still not itself", async () => {
      const me = await createOperator()
      const customer = await createCustomer({ operatorId: me.id })
      const first = await createTask({
        customerId: customer.id,
        isActive: false,
        createdAt: new Date("2026-02-01T09:00:00Z"),
      })
      const second = await createTask({
        customerId: customer.id,
        isActive: false,
        createdAt: new Date("2026-03-01T09:00:00Z"),
      })
      const active = await createTask({
        customerId: customer.id,
        createdAt: new Date("2026-04-01T09:00:00Z"),
      })

      const result = await createTestCaller(me).task.getContactById({
        id: String(second.id),
      })

      expect(
        result.customerContacts.map(({ id, isActive }) => ({ id, isActive }))
      ).toEqual([
        { id: active.id, isActive: true },
        { id: first.id, isActive: false },
      ])
    })

    it("is empty for a customer with a single contact, and null where the contact has no operator", async () => {
      const me = await createOperator()
      const customer = await createCustomer()
      const only = await createTask({ customerId: customer.id })

      const alone = await createTestCaller(me).task.getContactById({
        id: String(only.id),
      })
      expect(alone.customerContacts).toEqual([])

      const unassigned = await createTask({
        customerId: customer.id,
        isActive: false,
      })
      const again = await createTestCaller(me).task.getContactById({
        id: String(only.id),
      })
      expect(again.customerContacts).toEqual([
        expect.objectContaining({ id: unassigned.id, operator: null }),
      ])
    })
  })

  it("a superseded contact comes back read-only, with the active contact of the customer", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const superseded = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      isActive: false,
    })
    const active = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
    })

    const result = await createTestCaller(operator).task.getContactById({
      id: String(superseded.id),
    })

    expect(result.contact.id).toBe(superseded.id)
    expect(result.editability).toEqual({ kind: "superseded" })
    expect(result.activeTaskId).toBe(active.id)
  })

  it("an active contact of the user comes back editable, with its operator, its customer and its open alert (AC28, AC51)", async () => {
    const me = await createOperator({ name: "Mario", surname: "Rossi" })
    const customer = await createCustomer({
      name: "Anna",
      surname: "Bianchi",
      phoneNumber: "3331234567",
      fiscalCode: "BNCNNA80A41H501Z",
      vatCode: "01234567890",
      blackListStatus: "review",
      operatorId: me.id,
    })
    const closedAt = new Date("2026-03-10T09:00:00Z")
    const createdAt = new Date("2026-03-01T09:00:00Z")
    const deadline = new Date("2026-03-20T09:00:00Z")
    const contact = await createTask({
      customerId: customer.id,
      operatorId: me.id,
      state: "richiamare",
      priority: 60,
      closedAt,
      createdAt,
    })
    const openAlert = await createAlert({
      taskId: contact.id,
      deadline,
      message: "Call back",
    })
    // Linking the alert touched the task
    const [stored] = await tasksOf(customer.id)

    const result = await createTestCaller(me).task.getContactById({
      id: String(contact.id),
    })

    expect(result.contact).toEqual({
      id: contact.id,
      state: "richiamare",
      priority: 60,
      customPriority: false,
      isActive: true,
      closedAt,
      createdAt,
      updatedAt: stored!.updatedAt,
      operator: { id: me.id, name: "Mario", surname: "Rossi" },
    })
    expect(result.customer).toEqual({
      id: customer.id,
      name: "Anna",
      surname: "Bianchi",
      phoneNumber: "3331234567",
      fiscalCode: "BNCNNA80A41H501Z",
      vatCode: "01234567890",
      blackListStatus: "review",
      operatorId: me.id,
    })
    expect(result.alert).toEqual({
      id: openAlert.id,
      deadline,
      message: "Call back",
    })
    expect(result.editability).toEqual({ kind: "editable" })
    expect(result.activeTaskId).toBeNull()
  })

  it("alert is null when the contact has no alert, or its alert is already closed (AC28)", async () => {
    const me = await createOperator()
    const customer = await createCustomer({ operatorId: me.id })
    const bare = await createTask({
      customerId: customer.id,
      operatorId: me.id,
      isActive: false,
    })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: me.id,
    })
    // The task still points at it: the alert is not the contact's open one
    await createAlert({
      taskId: contact.id,
      deadline: new Date("2026-03-20T09:00:00Z"),
      isResolved: true,
      resolvedBy: me.id,
    })
    const caller = createTestCaller(me)

    const withoutAlert = await caller.task.getContactById({
      id: String(bare.id),
    })
    const withClosedAlert = await caller.task.getContactById({
      id: String(contact.id),
    })

    expect(withoutAlert.alert).toBeNull()
    expect(withClosedAlert.alert).toBeNull()
  })

  it("a contact of a colleague comes back read-only, with the name of its operator (AC51)", async () => {
    const me = await createOperator()
    const colleague = await createOperator({ name: "Luca", surname: "Verdi" })
    const customer = await createCustomer({ operatorId: colleague.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: colleague.id,
    })

    const result = await createTestCaller(me).task.getContactById({
      id: String(contact.id),
    })

    expect(result.editability).toEqual({
      kind: "not_owner",
      assignee: "Luca Verdi",
    })
    expect(result.activeTaskId).toBeNull()
  })

  it("a contact with no operator that isn't the user's comes back as not assigned (AC51)", async () => {
    const me = await createOperator()
    const colleague = await createOperator()
    const customer = await createCustomer({ operatorId: colleague.id })
    const contact = await createTask({ customerId: customer.id })

    const result = await createTestCaller(me).task.getContactById({
      id: String(contact.id),
    })

    expect(result.contact.operator).toBeNull()
    expect(result.editability).toEqual({ kind: "not_owner", assignee: null })
  })

  it("a superseded contact of a customer with no active contact has no activeTaskId (AC27)", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const superseded = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      isActive: false,
    })

    const result = await createTestCaller(operator).task.getContactById({
      id: String(superseded.id),
    })

    expect(result.editability).toEqual({ kind: "superseded" })
    expect(result.activeTaskId).toBeNull()
  })

  it("a superseded contact stays read-only for an admin too (AC27)", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const superseded = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      isActive: false,
    })
    const active = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
    })

    const result = await createTestCaller(admin).task.getContactById({
      id: String(superseded.id),
    })

    expect(result.editability).toEqual({ kind: "superseded" })
    expect(result.activeTaskId).toBe(active.id)
  })

  it("history has only the closed alerts of the customer, on all its contacts, by descending deadline, with who closed them and when (AC28)", async () => {
    const me = await createOperator({ name: "Mario", surname: "Rossi" })
    const colleague = await createOperator({ name: "Luca", surname: "Verdi" })
    const customer = await createCustomer({ operatorId: me.id })
    const previous = await createTask({
      customerId: customer.id,
      operatorId: colleague.id,
      isActive: false,
    })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: me.id,
    })
    const other = await createTask({
      customerId: (await createCustomer()).id,
      operatorId: me.id,
    })
    const closedBefore = await createAlert({
      taskId: previous.id,
      deadline: new Date("2026-02-10T09:00:00Z"),
      message: "Older",
      isResolved: true,
      resolvedBy: colleague.id,
      updatedAt: new Date("2026-02-11T10:00:00Z"),
    })
    // The alert of another customer is not in the history
    await createAlert({
      taskId: other.id,
      deadline: new Date("2026-02-20T09:00:00Z"),
      isResolved: true,
      resolvedBy: me.id,
    })
    const closedNow = await createAlert({
      taskId: contact.id,
      deadline: new Date("2026-03-10T09:00:00Z"),
      message: "Newer",
      isResolved: true,
      resolvedBy: me.id,
      updatedAt: new Date("2026-03-12T10:00:00Z"),
    })
    // Open alerts are not history, the contact's own one included
    await createAlert({
      taskId: previous.id,
      deadline: new Date("2026-04-01T09:00:00Z"),
    })
    const open = await createAlert({
      taskId: contact.id,
      deadline: new Date("2026-05-01T09:00:00Z"),
    })

    const result = await createTestCaller(me).task.getContactById({
      id: String(contact.id),
    })

    expect(result.alert?.id).toBe(open.id)
    expect(result.history).toEqual([
      {
        id: closedNow.id,
        deadline: new Date("2026-03-10T09:00:00Z"),
        message: "Newer",
        updatedAt: new Date("2026-03-12T10:00:00Z"),
        resolvedByName: "Mario",
        resolvedBySurname: "Rossi",
      },
      {
        id: closedBefore.id,
        deadline: new Date("2026-02-10T09:00:00Z"),
        message: "Older",
        updatedAt: new Date("2026-02-11T10:00:00Z"),
        resolvedByName: "Luca",
        resolvedBySurname: "Verdi",
      },
    ])
  })

  it("a closed alert with no resolvedBy comes back with no name (AC28)", async () => {
    const me = await createOperator()
    const customer = await createCustomer({ operatorId: me.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: me.id,
    })
    const closed = await createAlert({
      taskId: contact.id,
      deadline: new Date("2026-03-10T09:00:00Z"),
      isResolved: true,
    })

    const result = await createTestCaller(me).task.getContactById({
      id: String(contact.id),
    })

    expect(result.history).toEqual([
      expect.objectContaining({
        id: closed.id,
        resolvedByName: null,
        resolvedBySurname: null,
      }),
    ])
  })

  it("history is empty when the customer has no closed alert", async () => {
    const me = await createOperator()
    const customer = await createCustomer({ operatorId: me.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: me.id,
    })
    await createAlert({
      taskId: contact.id,
      deadline: new Date("2026-03-10T09:00:00Z"),
    })

    const result = await createTestCaller(me).task.getContactById({
      id: String(contact.id),
    })

    expect(result.history).toEqual([])
  })

  it.each([true, false])(
    "returns customPriority %s as stored (AC42, AC43)",
    async (customPriority) => {
      const me = await createOperator()
      const customer = await createCustomer({ operatorId: me.id })
      const contact = await createTask({
        customerId: customer.id,
        operatorId: me.id,
        priority: 100,
        customPriority,
      })

      const result = await createTestCaller(me).task.getContactById({
        id: String(contact.id),
      })

      expect(result.contact).toMatchObject({ priority: 100, customPriority })
    }
  )

  it.each([
    ["ADMIN", true],
    ["OPERATORE", false],
  ] as const)(
    "canReassign for a user with role %s is %s (AC50)",
    async (role, expected) => {
      const user = await createOperator({ role })
      const operator = await createOperator()
      const customer = await createCustomer({ operatorId: operator.id })
      const contact = await createTask({
        customerId: customer.id,
        operatorId: operator.id,
      })

      const result = await createTestCaller(user).task.getContactById({
        id: String(contact.id),
      })

      expect(result.canReassign).toBe(expected)
    }
  )

  it.each(["ADMIN", "OPERATORE"] as const)(
    "canReassign is false on a superseded contact, for a user with role %s (AC27, AC50)",
    async (role) => {
      const user = await createOperator({ role })
      const operator = await createOperator()
      const customer = await createCustomer({ operatorId: operator.id })
      const superseded = await createTask({
        customerId: customer.id,
        operatorId: operator.id,
        isActive: false,
      })

      const result = await createTestCaller(user).task.getContactById({
        id: String(superseded.id),
      })

      expect(result.editability).toEqual({ kind: "superseded" })
      expect(result.canReassign).toBe(false)
    }
  )

  it("an active contact of a colleague comes back editable when the customer is the user's (A1, D2)", async () => {
    const me = await createOperator()
    const colleague = await createOperator()
    const customer = await createCustomer({ operatorId: me.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: colleague.id,
    })

    const result = await createTestCaller(me).task.getContactById({
      id: String(contact.id),
    })

    expect(result.contact.operator?.id).toBe(colleague.id)
    expect(result.editability).toEqual({ kind: "editable" })
  })

  it("an active contact with no operator comes back editable when the customer is the user's (A1, D2)", async () => {
    const me = await createOperator()
    const customer = await createCustomer({ operatorId: me.id })
    const contact = await createTask({ customerId: customer.id })

    const result = await createTestCaller(me).task.getContactById({
      id: String(contact.id),
    })

    expect(result.contact.operator).toBeNull()
    expect(result.editability).toEqual({ kind: "editable" })
  })

  it("an active contact of a colleague comes back editable for an admin, whoever holds the customer (AC48)", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const colleague = await createOperator()
    const customer = await createCustomer({ operatorId: colleague.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: colleague.id,
    })

    const result = await createTestCaller(admin).task.getContactById({
      id: String(contact.id),
    })

    expect(result.editability).toEqual({ kind: "editable" })
  })

  it.each([
    "abc",
    "0",
    "-3",
    "1e3",
    "0x10",
    "1.5",
    " 12",
    "99999999999",
    // One past the largest id of the integer column
    "2147483648",
    // Look like the id of the contact, 1000, to a lenient parser
    "01000",
    "+1000",
    "1000 ",
    "1000\n",
    "",
  ])("the id %j is not a contact: CONTACT_NOT_FOUND (AC26)", async (id) => {
    const me = await createOperator()
    const customer = await createCustomer({ operatorId: me.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: me.id,
    })
    expect(contact.id).toBe(1000)

    const error = await failure(
      createTestCaller(me).task.getContactById({ id })
    )

    expect(error).toMatchObject({ code: "NOT_FOUND" })
    expect(readContactError(error)).toEqual({
      code: "CONTACT_NOT_FOUND",
      payload: {},
    })
  })

  it("an id that no contact has is CONTACT_NOT_FOUND (AC26)", async () => {
    const me = await createOperator()

    const error = await failure(
      createTestCaller(me).task.getContactById({ id: "1000" })
    )

    expect(error).toMatchObject({ code: "NOT_FOUND" })
    expect(readContactError(error)).toEqual({
      code: "CONTACT_NOT_FOUND",
      payload: {},
    })
  })

  it("the largest id of a 32-bit integer that no contact has is CONTACT_NOT_FOUND (AC26)", async () => {
    const me = await createOperator()

    const error = await failure(
      createTestCaller(me).task.getContactById({ id: "2147483647" })
    )

    expect(readContactError(error)).toEqual({
      code: "CONTACT_NOT_FOUND",
      payload: {},
    })
  })

  it("a task with no customer is CONTACT_NOT_FOUND (AC26)", async () => {
    const me = await createOperator()
    const orphan = await createTask({ operatorId: me.id })

    const error = await failure(
      createTestCaller(me).task.getContactById({ id: String(orphan.id) })
    )

    expect(error).toMatchObject({ code: "NOT_FOUND" })
    expect(readContactError(error)).toEqual({
      code: "CONTACT_NOT_FOUND",
      payload: {},
    })
  })
})

describe("task.getContactById: the operator gate", () => {
  it("refuses a user with no operator with BAD_REQUEST", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
    })
    const user = await createUser()

    await expect(
      createTestCaller(user).task.getContactById({ id: String(contact.id) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })
})

describe("task.getCustomerAlerts", () => {
  it("returns the alerts of all the contacts of the customer, open and closed, by descending deadline", async () => {
    const me = await createOperator({ name: "Mario", surname: "Rossi" })
    const customer = await createCustomer({ operatorId: me.id })
    const previous = await createTask({
      customerId: customer.id,
      operatorId: me.id,
      isActive: false,
    })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: me.id,
    })
    const other = await createTask({
      customerId: (await createCustomer()).id,
      operatorId: me.id,
    })
    const closedOld = await createAlert({
      taskId: previous.id,
      deadline: new Date("2026-02-10T09:00:00Z"),
      message: "Old",
      isResolved: true,
      resolvedBy: me.id,
      updatedAt: new Date("2026-02-11T10:00:00Z"),
    })
    const closedNoName = await createAlert({
      taskId: previous.id,
      deadline: new Date("2026-01-10T09:00:00Z"),
      isResolved: true,
      updatedAt: new Date("2026-01-12T10:00:00Z"),
    })
    await createAlert({
      taskId: other.id,
      deadline: new Date("2026-03-01T09:00:00Z"),
    })
    const open = await createAlert({
      taskId: contact.id,
      deadline: new Date("2026-05-01T09:00:00Z"),
      message: "Next",
    })

    const result = await createTestCaller(me).task.getCustomerAlerts({
      id: customer.id,
    })

    expect(result).toEqual([
      {
        id: open.id,
        deadline: new Date("2026-05-01T09:00:00Z"),
        message: "Next",
        isResolved: false,
        updatedAt: open.updatedAt,
        resolvedByName: null,
        resolvedBySurname: null,
      },
      {
        id: closedOld.id,
        deadline: new Date("2026-02-10T09:00:00Z"),
        message: "Old",
        isResolved: true,
        updatedAt: new Date("2026-02-11T10:00:00Z"),
        resolvedByName: "Mario",
        resolvedBySurname: "Rossi",
      },
      {
        id: closedNoName.id,
        deadline: new Date("2026-01-10T09:00:00Z"),
        message: null,
        isResolved: true,
        updatedAt: new Date("2026-01-12T10:00:00Z"),
        resolvedByName: null,
        resolvedBySurname: null,
      },
    ])
  })
})

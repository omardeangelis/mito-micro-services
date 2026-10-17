import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { type GetContactsInput } from "@/lib/domain/contact/listInput"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, tasksOf } from "@/test/db"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
  createUser,
} from "@/test/factories"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

/** An active contact of its own customer, with `values` on the task. */
const seedContact = async (values: Parameters<typeof createTask>[0] = {}) => {
  const customer = await createCustomer()
  return createTask({ customerId: customer.id, ...values })
}

/** The ids of the contacts, in the order of the list. */
const idsOf = (result: { contacts: { id: number }[] }) =>
  result.contacts.map((contact) => contact.id)

describe("task.getContacts", () => {
  it("without filters returns only the active contacts by descending priority, with the exact total", async () => {
    const operator = await createOperator()
    const medium = await seedContact({ priority: 60 })
    const urgent = await seedContact({ priority: 120 })
    const low = await seedContact({ priority: 20 })
    // A superseded contact stays out, whatever its priority (AC3)
    await seedContact({ priority: 150, isActive: false })

    const result = await createTestCaller(operator).task.getContacts({})

    expect(result.contacts.map((contact) => contact.id)).toEqual([
      urgent.id,
      medium.id,
      low.id,
    ])
    expect(result.total).toBe(3)
  })

  it("returns each row with its operator, its customer and its open alert", async () => {
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
    const deadline = new Date("2026-03-20T09:00:00Z")
    const contact = await createTask({
      customerId: customer.id,
      operatorId: me.id,
      state: "richiamare",
      priority: 60,
      closedAt,
      createdAt: new Date("2026-03-01T09:00:00Z"),
    })
    const openAlert = await createAlert({
      taskId: contact.id,
      deadline,
      message: "Call back",
    })
    const bare = await seedContact({ priority: 20 })
    // Linking the alert touched the task
    const [stored] = await tasksOf(customer.id)

    const result = await createTestCaller(me).task.getContacts({})

    expect(result.contacts).toHaveLength(2)
    expect(result.contacts[0]).toEqual({
      id: contact.id,
      state: "richiamare",
      priority: 60,
      isActive: true,
      closedAt,
      createdAt: new Date("2026-03-01T09:00:00Z"),
      updatedAt: stored!.updatedAt,
      operator: { id: me.id, name: "Mario", surname: "Rossi" },
      customer: {
        id: customer.id,
        name: "Anna",
        surname: "Bianchi",
        phoneNumber: "3331234567",
        fiscalCode: "BNCNNA80A41H501Z",
        vatCode: "01234567890",
        blackListStatus: "review",
        operatorId: me.id,
      },
      alert: { id: openAlert.id, deadline, message: "Call back" },
    })
    expect(result.contacts[1]).toMatchObject({
      id: bare.id,
      operator: null,
      alert: null,
    })
    expect(result.customerFilter).toBeNull()
  })

  it("with includeInactive also returns the superseded contacts, marked as such (AC3)", async () => {
    const operator = await createOperator()
    const active = await seedContact({ priority: 60 })
    const superseded = await seedContact({ priority: 150, isActive: false })

    const result = await createTestCaller(operator).task.getContacts({
      includeInactive: true,
    })

    expect(
      result.contacts.map(({ id, isActive }) => ({ id, isActive }))
    ).toEqual([
      { id: superseded.id, isActive: false },
      { id: active.id, isActive: true },
    ])
    expect(result.total).toBe(2)
  })

  describe("filters (AC10)", () => {
    it("operatorIds keeps the contacts of those operators, and 0 the unassigned ones", async () => {
      const me = await createOperator()
      const anna = await createOperator()
      const luigi = await createOperator()
      const ofAnna = await seedContact({ operatorId: anna.id, priority: 60 })
      const ofLuigi = await seedContact({ operatorId: luigi.id, priority: 40 })
      const unassigned = await seedContact({ operatorId: null, priority: 20 })
      const caller = createTestCaller(me)

      const ofAnnaOnly = await caller.task.getContacts({
        operatorIds: [anna.id],
      })
      const ofNobody = await caller.task.getContacts({ operatorIds: [0] })
      const either = await caller.task.getContacts({
        operatorIds: [luigi.id, 0],
      })

      expect(idsOf(ofAnnaOnly)).toEqual([ofAnna.id])
      expect(ofAnnaOnly.total).toBe(1)
      expect(idsOf(ofNobody)).toEqual([unassigned.id])
      expect(idsOf(either)).toEqual([ofLuigi.id, unassigned.id])
      expect(either.total).toBe(2)
    })

    it("states keeps the contacts in any of the chosen states", async () => {
      const operator = await createOperator()
      await seedContact({ state: "chiamare", priority: 90 })
      const callBack = await seedContact({ state: "richiamare", priority: 60 })
      const paid = await seedContact({ state: "erogata", priority: 30 })
      await seedContact({ state: "followup", priority: 10 })

      const result = await createTestCaller(operator).task.getContacts({
        states: ["richiamare", "erogata"],
      })

      expect(idsOf(result)).toEqual([callBack.id, paid.id])
      expect(result.total).toBe(2)
    })

    it("states counts a contact with no state as nessuno", async () => {
      const operator = await createOperator()
      const none = await seedContact({ state: "nessuno", priority: 30 })
      const noState = await seedContact({ state: null, priority: 20 })
      await seedContact({ state: "chiamare", priority: 10 })
      const caller = createTestCaller(operator)

      const result = await caller.task.getContacts({ states: ["nessuno"] })
      const others = await caller.task.getContacts({ states: ["chiamare"] })

      expect(idsOf(result)).toEqual([none.id, noState.id])
      expect(result.contacts.map((contact) => contact.state)).toEqual([
        "nessuno",
        null,
      ])
      expect(result.total).toBe(2)
      expect(others.total).toBe(1)
    })

    it("priorities keeps the contacts in any of the chosen bands", async () => {
      const operator = await createOperator()
      const low = await seedContact({ priority: 10 })
      await seedContact({ priority: 40 })
      const high = await seedContact({ priority: 80 })
      const urgent = await seedContact({ priority: 130 })
      const caller = createTestCaller(operator)

      const onlyUrgent = await caller.task.getContacts({
        priorities: ["urgent"],
      })
      const lowOrHigh = await caller.task.getContacts({
        priorities: ["low", "high"],
      })

      expect(idsOf(onlyUrgent)).toEqual([urgent.id])
      expect(idsOf(lowOrHigh)).toEqual([high.id, low.id])
      expect(lowOrHigh.total).toBe(2)
    })

    it("customerQuery keeps the contacts whose customer contains the text", async () => {
      const operator = await createOperator()
      const bianchi = await createCustomer({ surname: "Bianchi" })
      const rossi = await createCustomer({ surname: "Rossi" })
      const rossini = await createCustomer({ surname: "Rossini" })
      await createTask({ customerId: bianchi.id, priority: 90 })
      const ofRossi = await createTask({ customerId: rossi.id, priority: 60 })
      const ofRossini = await createTask({
        customerId: rossini.id,
        priority: 30,
      })

      const result = await createTestCaller(operator).task.getContacts({
        customerQuery: "ossi",
      })

      expect(idsOf(result)).toEqual([ofRossi.id, ofRossini.id])
      expect(result.total).toBe(2)
    })

    // AC12: the band of the filter is the band of the badge, a NULL priority
    // included (the badge shows it as "bassa")
    it.each([
      ["low", [20, null]],
      ["medium", [60, 21]],
      ["high", [100, 61]],
      ["urgent", [150, 120, 101]],
    ] as const)(
      "priorities %s keeps exactly the priorities of that band (AC12)",
      async (band, expected) => {
        const operator = await createOperator()
        for (const priority of [20, 21, 60, 61, 100, 101, 120, 150, null]) {
          await seedContact({ priority })
        }

        const result = await createTestCaller(operator).task.getContacts({
          priorities: [band],
        })

        expect(result.contacts.map((contact) => contact.priority)).toEqual(
          expected
        )
        expect(result.total).toBe(expected.length)
      }
    )

    describe("customerQuery", () => {
      it.each([
        ["surname", { surname: "Bianchi" }, "bianch"],
        ["name", { name: "Giuseppe" }, "GIUSEP"],
        ["fiscal code", { fiscalCode: "RSSMRA80A01H501U" }, "rssmra80"],
        ["VAT code", { vatCode: "01234567890" }, "34567"],
        ["phone number", { phoneNumber: "3331234567" }, "31234"],
      ])(
        "finds the text in the %s, whatever its case",
        async (_field, customerValues, text) => {
          const operator = await createOperator()
          const customer = await createCustomer(customerValues)
          const contact = await createTask({ customerId: customer.id })
          await seedContact()

          const result = await createTestCaller(operator).task.getContacts({
            customerQuery: text,
          })

          expect(idsOf(result)).toEqual([contact.id])
          expect(result.total).toBe(1)
        }
      )

      it("searches a text with an apostrophe", async () => {
        const operator = await createOperator()
        const withApostrophe = await createCustomer({ surname: "D'Angelo" })
        const contact = await createTask({ customerId: withApostrophe.id })
        const without = await createCustomer({ surname: "Dangelo" })
        await createTask({ customerId: without.id })

        const result = await createTestCaller(operator).task.getContacts({
          customerQuery: "d'ang",
        })

        expect(idsOf(result)).toEqual([contact.id])
        expect(result.total).toBe(1)
      })

      it.each([
        ["%", "50%", "50%Off", "50XOff"],
        ["_", "A_B", "A_B", "AxB"],
        ["\\", "\\", "back\\slash", "backslash"],
      ])(
        "searches %s as a literal character",
        async (_character, text, literal, decoy) => {
          const operator = await createOperator()
          const withCharacter = await createCustomer({ surname: literal })
          const contact = await createTask({ customerId: withCharacter.id })
          const without = await createCustomer({ surname: decoy })
          await createTask({ customerId: without.id })

          const result = await createTestCaller(operator).task.getContacts({
            customerQuery: text,
          })

          expect(idsOf(result)).toEqual([contact.id])
        }
      )
    })

    it("from and to bound the day of Contattato il by default, both days included", async () => {
      const operator = await createOperator()
      const before = await seedContact({
        closedAt: new Date("2026-03-09T11:00:00Z"),
        priority: 10,
      })
      const first = await seedContact({
        closedAt: new Date("2026-03-10T08:00:00Z"),
        priority: 20,
      })
      const middle = await seedContact({
        closedAt: new Date("2026-03-11T12:00:00Z"),
        priority: 30,
      })
      const last = await seedContact({
        closedAt: new Date("2026-03-12T18:00:00Z"),
        priority: 40,
      })
      const after = await seedContact({
        closedAt: new Date("2026-03-13T08:00:00Z"),
        priority: 50,
      })
      // Never contacted: no date to be in a range
      await seedContact({ closedAt: null, priority: 60 })
      const caller = createTestCaller(operator)

      const between = await caller.task.getContacts({
        from: "2026-03-10",
        to: "2026-03-12",
      })
      const fromOnly = await caller.task.getContacts({ from: "2026-03-11" })
      const toOnly = await caller.task.getContacts({ to: "2026-03-10" })

      expect(idsOf(between)).toEqual([last.id, middle.id, first.id])
      expect(between.total).toBe(3)
      expect(idsOf(fromOnly)).toEqual([after.id, last.id, middle.id])
      expect(idsOf(toOnly)).toEqual([first.id, before.id])
      expect(toOnly.total).toBe(2)
    })

    // AC11: a day is the Rome day, from its midnight to the next one
    it.each([
      [
        "a winter day (UTC+1)",
        "2026-01-15",
        ["2026-01-14T23:00:00Z", "2026-01-15T22:30:00Z"],
        ["2026-01-14T22:59:00Z", "2026-01-15T23:00:00Z"],
      ],
      [
        "a summer day (UTC+2)",
        "2026-07-15",
        ["2026-07-14T22:00:00Z", "2026-07-15T21:30:00Z"],
        ["2026-07-14T21:59:00Z", "2026-07-15T22:00:00Z"],
      ],
      [
        "the day the clock goes forward, of 23 hours",
        "2026-03-29",
        ["2026-03-28T23:00:00Z", "2026-03-29T21:59:00Z"],
        ["2026-03-28T22:59:00Z", "2026-03-29T22:00:00Z"],
      ],
      [
        "the day the clock goes back, of 25 hours",
        "2026-10-25",
        ["2026-10-24T22:00:00Z", "2026-10-25T22:59:00Z"],
        ["2026-10-24T21:59:00Z", "2026-10-25T23:00:00Z"],
      ],
    ])(
      "from and to take %s as the Rome day, to the last minute (AC11)",
      async (_label, day, inside, outside) => {
        const operator = await createOperator()
        const inDay: number[] = []
        for (const instant of inside) {
          const contact = await seedContact({ closedAt: new Date(instant) })
          inDay.push(contact.id)
        }
        for (const instant of outside) {
          await seedContact({ closedAt: new Date(instant) })
        }

        const result = await createTestCaller(operator).task.getContacts({
          from: day,
          to: day,
        })

        expect(idsOf(result)).toEqual(inDay.reverse())
        expect(result.total).toBe(inside.length)
      }
    )

    it("dateField nextAlert bounds the deadline of the open alert", async () => {
      const operator = await createOperator()
      const early = await seedContact({ priority: 10 })
      await createAlert({
        taskId: early.id,
        deadline: new Date("2026-03-09T10:00:00Z"),
      })
      const inRange = await seedContact({ priority: 20 })
      await createAlert({
        taskId: inRange.id,
        deadline: new Date("2026-03-11T10:00:00Z"),
      })
      // Its alert was resolved: the contact has no next alert
      const resolved = await seedContact({ priority: 30 })
      await createAlert({
        taskId: resolved.id,
        deadline: new Date("2026-03-11T10:00:00Z"),
        isResolved: true,
      })
      // Contacted in range, but with no alert at all
      await seedContact({
        priority: 40,
        closedAt: new Date("2026-03-11T10:00:00Z"),
      })

      const result = await createTestCaller(operator).task.getContacts({
        dateField: "nextAlert",
        from: "2026-03-10",
        to: "2026-03-12",
      })

      expect(idsOf(result)).toEqual([inRange.id])
      expect(result.total).toBe(1)
    })

    it("dateField createdAt bounds the day the contact was created", async () => {
      const operator = await createOperator()
      await seedContact({ createdAt: new Date("2026-03-09T11:00:00Z") })
      const inRange = await seedContact({
        createdAt: new Date("2026-03-11T11:00:00Z"),
        // Contacted outside the range: the date field decides
        closedAt: new Date("2026-04-01T11:00:00Z"),
      })
      await seedContact({ createdAt: new Date("2026-03-13T11:00:00Z") })

      const result = await createTestCaller(operator).task.getContacts({
        dateField: "createdAt",
        from: "2026-03-10",
        to: "2026-03-12",
      })

      expect(idsOf(result)).toEqual([inRange.id])
      expect(result.total).toBe(1)
    })

    it("hasAlert keeps only the contacts with an open alert", async () => {
      const operator = await createOperator()
      const withAlert = await seedContact({ priority: 30 })
      await createAlert({
        taskId: withAlert.id,
        deadline: new Date("2026-03-11T10:00:00Z"),
      })
      const resolved = await seedContact({ priority: 20 })
      await createAlert({
        taskId: resolved.id,
        deadline: new Date("2026-03-11T10:00:00Z"),
        isResolved: true,
      })
      const without = await seedContact({ priority: 10 })
      const caller = createTestCaller(operator)

      const only = await caller.task.getContacts({ hasAlert: true })
      const all = await caller.task.getContacts({ hasAlert: false })

      expect(idsOf(only)).toEqual([withAlert.id])
      expect(only.total).toBe(1)
      expect(idsOf(all)).toEqual([withAlert.id, resolved.id, without.id])
    })

    it("combines the filters in AND", async () => {
      const operator = await createOperator()
      const anna = await createOperator()
      const luigi = await createOperator()
      /** A contact that meets every filter below, but for `values`. */
      const contactWith = async (
        values: Parameters<typeof createTask>[0] = {},
        { surname = "Verdi", withAlert = true } = {}
      ) => {
        const customer = await createCustomer({ surname })
        const contact = await createTask({
          customerId: customer.id,
          operatorId: anna.id,
          state: "richiamare",
          priority: 60,
          closedAt: new Date("2026-03-11T10:00:00Z"),
          ...values,
        })
        if (withAlert) {
          await createAlert({
            taskId: contact.id,
            deadline: new Date("2026-03-11T10:00:00Z"),
          })
        }
        return contact
      }
      const match = await contactWith()
      const filters: GetContactsInput = {
        operatorIds: [anna.id],
        states: ["richiamare"],
        priorities: ["medium"],
        customerQuery: "Verd",
        from: "2026-03-10",
        to: "2026-03-12",
        hasAlert: true,
      }
      // Each one fails a single filter, which relaxed lets it in
      const misses = {
        operatorIds: await contactWith({ operatorId: luigi.id }),
        states: await contactWith({ state: "erogata" }),
        priorities: await contactWith({ priority: 130 }),
        customerQuery: await contactWith({}, { surname: "Bianchi" }),
        from: await contactWith({ closedAt: new Date("2026-03-09T10:00:00Z") }),
        to: await contactWith({ closedAt: new Date("2026-03-13T10:00:00Z") }),
        hasAlert: await contactWith({}, { withAlert: false }),
      }
      const caller = createTestCaller(operator)

      const all = await caller.task.getContacts(filters)

      expect(idsOf(all)).toEqual([match.id])
      expect(all.total).toBe(1)
      for (const [key, miss] of Object.entries(misses)) {
        const relaxed = await caller.task.getContacts({
          ...filters,
          [key]: undefined,
        })
        expect(idsOf(relaxed), key).toContain(miss.id)
      }
    })

    describe("onlyMe (D8)", () => {
      /**
       * Contacts of `me` and a colleague, by who holds the contact and who
       * holds the customer, from the highest priority down.
       */
      const seedOwnership = async () => {
        const me = await createOperator()
        const colleague = await createOperator()
        const forCustomerOf = async (
          customerOperatorId: number | null,
          values: Parameters<typeof createTask>[0]
        ) => {
          const customer = await createCustomer({
            operatorId: customerOperatorId,
          })
          return createTask({ customerId: customer.id, ...values })
        }
        return {
          me,
          colleague,
          myContact: await forCustomerOf(colleague.id, {
            operatorId: me.id,
            priority: 90,
          }),
          myCustomer: await forCustomerOf(me.id, {
            operatorId: colleague.id,
            priority: 80,
          }),
          myContactAndCustomer: await forCustomerOf(me.id, {
            operatorId: me.id,
            priority: 70,
          }),
          myCustomerUnassigned: await forCustomerOf(me.id, {
            operatorId: null,
            priority: 60,
          }),
          colleagues: await forCustomerOf(colleague.id, {
            operatorId: colleague.id,
            priority: 50,
          }),
          nobodys: await forCustomerOf(null, {
            operatorId: null,
            priority: 40,
          }),
        }
      }

      it("keeps the contacts of the operator and those of the customers of the operator", async () => {
        const seeded = await seedOwnership()

        const result = await createTestCaller(seeded.me).task.getContacts({
          onlyMe: true,
        })

        expect(idsOf(result)).toEqual([
          seeded.myContact.id,
          seeded.myCustomer.id,
          seeded.myContactAndCustomer.id,
          seeded.myCustomerUnassigned.id,
        ])
        expect(result.total).toBe(4)
      })

      it("is always the operator of the session, and combines in AND with operatorIds", async () => {
        const seeded = await seedOwnership()
        const caller = createTestCaller(seeded.me)

        const ofColleague = await caller.task.getContacts({
          onlyMe: true,
          operatorIds: [seeded.colleague.id],
        })
        const unassigned = await caller.task.getContacts({
          onlyMe: true,
          operatorIds: [0],
        })
        const ofColleagueAsColleague = await createTestCaller(
          seeded.colleague
        ).task.getContacts({
          onlyMe: true,
          operatorIds: [seeded.colleague.id],
        })

        // Mine and held by the colleague: not every contact of the colleague
        expect(idsOf(ofColleague)).toEqual([seeded.myCustomer.id])
        expect(ofColleague.total).toBe(1)
        expect(idsOf(unassigned)).toEqual([seeded.myCustomerUnassigned.id])
        expect(idsOf(ofColleagueAsColleague)).toEqual([
          seeded.myCustomer.id,
          seeded.colleagues.id,
        ])
      })
    })
  })

  describe("ordering (AC13)", () => {
    /**
     * The contacts of each order column, created out of order, with the ids
     * in the order the list must give them ascending and descending: the
     * contacts with no value go last in both.
     */
    const orders = {
      priority: async () => {
        const fifty = await seedContact({ priority: 50 })
        const none = await seedContact({ priority: null })
        const ten = await seedContact({ priority: 10 })
        return {
          asc: [ten.id, fifty.id, none.id],
          desc: [fifty.id, ten.id, none.id],
        }
      },
      closedAt: async () => {
        const second = await seedContact({
          closedAt: new Date("2026-03-02T10:00:00Z"),
        })
        const never = await seedContact({ closedAt: null })
        const first = await seedContact({
          closedAt: new Date("2026-03-01T10:00:00Z"),
        })
        return {
          asc: [first.id, second.id, never.id],
          desc: [second.id, first.id, never.id],
        }
      },
      nextAlert: async () => {
        const second = await seedContact()
        await createAlert({
          taskId: second.id,
          deadline: new Date("2026-03-02T10:00:00Z"),
        })
        const noAlert = await seedContact()
        const first = await seedContact()
        await createAlert({
          taskId: first.id,
          deadline: new Date("2026-03-01T10:00:00Z"),
        })
        return {
          asc: [first.id, second.id, noAlert.id],
          desc: [second.id, first.id, noAlert.id],
        }
      },
      // Never null, but the order must hold in both directions
      createdAt: async () => {
        const second = await seedContact({
          createdAt: new Date("2026-03-02T10:00:00Z"),
        })
        const third = await seedContact({
          createdAt: new Date("2026-03-03T10:00:00Z"),
        })
        const first = await seedContact({
          createdAt: new Date("2026-03-01T10:00:00Z"),
        })
        return {
          asc: [first.id, second.id, third.id],
          desc: [third.id, second.id, first.id],
        }
      },
      updatedAt: async () => {
        const second = await seedContact({
          updatedAt: new Date("2026-03-02T10:00:00Z"),
        })
        const third = await seedContact({
          updatedAt: new Date("2026-03-03T10:00:00Z"),
        })
        const first = await seedContact({
          updatedAt: new Date("2026-03-01T10:00:00Z"),
        })
        return {
          asc: [first.id, second.id, third.id],
          desc: [third.id, second.id, first.id],
        }
      },
      // Surname, then name; a missing surname or name goes after the others
      customer: async () => {
        const named = async (surname: string | null, name: string | null) => {
          const customer = await createCustomer({ surname, name })
          return createTask({ customerId: customer.id })
        }
        const rossiBruno = await named("Rossi", "Bruno")
        const noSurname = await named(null, "Aldo")
        const bianchi = await named("Bianchi", "Zeno")
        const rossiNoName = await named("Rossi", null)
        const rossiAnna = await named("Rossi", "Anna")
        return {
          asc: [
            bianchi.id,
            rossiAnna.id,
            rossiBruno.id,
            rossiNoName.id,
            noSurname.id,
          ],
          desc: [
            rossiBruno.id,
            rossiAnna.id,
            rossiNoName.id,
            bianchi.id,
            noSurname.id,
          ],
        }
      },
    }

    it.each(Object.keys(orders) as (keyof typeof orders)[])(
      "orders by %s in both directions, the contacts with no value last",
      async (orderBy) => {
        const operator = await createOperator()
        const expected = await orders[orderBy]()
        const caller = createTestCaller(operator)

        const ascending = await caller.task.getContacts({
          orderBy,
          sortedBy: "asc",
        })
        const descending = await caller.task.getContacts({
          orderBy,
          sortedBy: "desc",
        })

        expect(idsOf(ascending)).toEqual(expected.asc)
        expect(idsOf(descending)).toEqual(expected.desc)
      }
    )
  })

  describe("pages (AC14)", () => {
    it("fills every page but the last, and the total is the whole result", async () => {
      const operator = await createOperator()
      const seeded: number[] = []
      for (let priority = 1; priority <= 45; priority++) {
        seeded.push((await seedContact({ priority })).id)
      }
      const caller = createTestCaller(operator)

      const pages = []
      for (const page of [1, 2, 3, 4]) {
        pages.push(await caller.task.getContacts({ page, perPage: 20 }))
      }
      const single = await caller.task.getContacts({ perPage: 50 })

      expect(pages.map((result) => result.contacts.length)).toEqual([
        20, 20, 5, 0,
      ])
      expect(pages.map((result) => result.total)).toEqual([45, 45, 45, 45])
      // Descending priority, which went up with the id
      expect(pages.flatMap(idsOf)).toEqual([...seeded].reverse())
      expect(single.contacts).toHaveLength(45)
      expect(single.total).toBe(45)
    })

    it("gives a total equal to the rows of all the pages with every filter, whatever alerts the contacts had", async () => {
      const me = await createOperator()
      const anna = await createOperator()
      const luigi = await createOperator()
      const states = ["chiamare", "richiamare", "erogata", "nessuno", null]
      const priorities = [10, 40, 80, 130, null]
      for (let i = 0; i < 45; i++) {
        const customer = await createCustomer({
          surname: i % 4 === 0 ? `Verdi ${i}` : `Neri ${i}`,
          operatorId: i % 6 === 5 ? me.id : null,
        })
        const day = `2026-03-${String(1 + (i % 10)).padStart(2, "0")}`
        const contact = await createTask({
          customerId: customer.id,
          operatorId: [anna.id, luigi.id, null][i % 3]!,
          state: states[i % 5] as "chiamare" | null,
          priority: priorities[(i * 3) % 5],
          closedAt: new Date(`${day}T10:00:00Z`),
          isActive: i % 9 !== 8,
        })
        // Alerts of the contact that are not its open one: resolved, and
        // found by the task id, they would multiply the rows of a join on it
        if (i % 3 === 0) {
          for (let repeated = 0; repeated < 2; repeated++) {
            await createAlert({
              taskId: contact.id,
              deadline: new Date(`${day}T08:00:00Z`),
              isResolved: true,
            })
          }
        }
        if (i % 2 === 0) {
          await createAlert({
            taskId: contact.id,
            deadline: new Date(`${day}T12:00:00Z`),
          })
        } else if (i % 6 === 1) {
          // Linked to the contact, but resolved
          await createAlert({
            taskId: contact.id,
            deadline: new Date(`${day}T12:00:00Z`),
            isResolved: true,
          })
        }
      }
      const caller = createTestCaller(me)
      const withEveryFilter: GetContactsInput = {
        includeInactive: true,
        operatorIds: [anna.id, 0],
        states: ["chiamare", "nessuno"],
        priorities: ["low", "urgent"],
        customerQuery: "verdi",
        dateField: "nextAlert",
        from: "2026-03-01",
        to: "2026-03-09",
        hasAlert: true,
      }
      const filters: GetContactsInput[] = [
        {},
        { includeInactive: true },
        { operatorIds: [anna.id] },
        { operatorIds: [0] },
        { operatorIds: [luigi.id, 0] },
        { onlyMe: true },
        { states: ["chiamare", "nessuno"] },
        { priorities: ["low", "urgent"] },
        { customerQuery: "verdi" },
        { from: "2026-03-03", to: "2026-03-07" },
        { dateField: "nextAlert", from: "2026-03-03", to: "2026-03-07" },
        { dateField: "createdAt", from: "2020-01-01" },
        { hasAlert: true },
        { hasAlert: true, includeInactive: true, orderBy: "nextAlert" },
        withEveryFilter,
      ]

      for (const input of filters) {
        const ids: number[] = []
        let total = 0
        for (let page = 1; ; page++) {
          const result = await caller.task.getContacts({
            ...input,
            page,
            perPage: 20,
          })
          total = result.total
          ids.push(...idsOf(result))
          if (result.contacts.length < 20) break
        }

        expect(total, JSON.stringify(input)).toBe(ids.length)
        expect(new Set(ids).size, JSON.stringify(input)).toBe(ids.length)
      }
      // The pages were more than one, and a filter left some rows out
      expect((await caller.task.getContacts({})).total).toBe(40)
      expect(
        (await caller.task.getContacts(withEveryFilter)).total
      ).toBeGreaterThan(0)
      expect(
        (await caller.task.getContacts(withEveryFilter)).total
      ).toBeLessThan(40)
    })
  })

  describe("scrolling the pages (AC15)", () => {
    it.each(["asc", "desc"] as const)(
      "shows each of 50 contacts with the same priority once, sorted %s",
      async (sortedBy) => {
        const operator = await createOperator()
        const seeded: number[] = []
        for (let i = 0; i < 50; i++) {
          seeded.push((await seedContact({ priority: 60 })).id)
        }
        const caller = createTestCaller(operator)

        const shown: number[] = []
        for (const page of [1, 2, 3]) {
          const result = await caller.task.getContacts({
            page,
            perPage: 20,
            sortedBy,
          })
          shown.push(...idsOf(result))
        }

        expect(shown).toHaveLength(50)
        expect(new Set(shown).size).toBe(50)
        // The ties are settled by the id, in the direction of the order
        expect(shown).toEqual(sortedBy === "asc" ? seeded : seeded.reverse())
      }
    )
  })

  it("returns one row per contact, with the alert its alert_id points to, whatever other open alerts the task has", async () => {
    const operator = await createOperator()
    const contact = await seedContact({ priority: 60 })
    // Not resolved, but the task doesn't point at it: not the contact's alert
    const stray = await createAlert({
      taskId: contact.id,
      deadline: new Date("2026-03-05T10:00:00Z"),
      message: "Stray",
    })
    const linked = await createAlert({
      taskId: contact.id,
      deadline: new Date("2026-03-20T10:00:00Z"),
      message: "Linked",
    })
    expect(stray.id).not.toBe(linked.id)

    const result = await createTestCaller(operator).task.getContacts({})

    expect(idsOf(result)).toEqual([contact.id])
    expect(result.total).toBe(1)
    expect(result.contacts[0]?.alert).toEqual({
      id: linked.id,
      deadline: new Date("2026-03-20T10:00:00Z"),
      message: "Linked",
    })
  })

  it("never returns a task with no customer", async () => {
    const operator = await createOperator()
    const withCustomer = await seedContact({ priority: 20 })
    await createTask({ customerId: null, priority: 150 })
    await createTask({ customerId: null, priority: 150, isActive: false })
    const caller = createTestCaller(operator)

    const active = await caller.task.getContacts({})
    const everything = await caller.task.getContacts({ includeInactive: true })

    expect(idsOf(active)).toEqual([withCustomer.id])
    expect(active.total).toBe(1)
    expect(idsOf(everything)).toEqual([withCustomer.id])
    expect(everything.total).toBe(1)
  })

  describe("customerId (AC21, AC22, AC23)", () => {
    it("with includeInactive and the newest first gives all the contacts of the customer, with the customer", async () => {
      const operator = await createOperator()
      const customer = await createCustomer({
        name: "Anna",
        surname: "Bianchi",
      })
      const oldest = await createTask({
        customerId: customer.id,
        isActive: false,
        createdAt: new Date("2026-03-01T10:00:00Z"),
      })
      const active = await createTask({
        customerId: customer.id,
        createdAt: new Date("2026-03-02T10:00:00Z"),
      })
      const newest = await createTask({
        customerId: customer.id,
        isActive: false,
        createdAt: new Date("2026-03-03T10:00:00Z"),
      })
      await seedContact({ createdAt: new Date("2026-03-04T10:00:00Z") })

      const result = await createTestCaller(operator).task.getContacts({
        customerId: customer.id,
        includeInactive: true,
        orderBy: "createdAt",
        sortedBy: "desc",
      })

      expect(idsOf(result)).toEqual([newest.id, active.id, oldest.id])
      expect(result.total).toBe(3)
      expect(result.customerFilter).toEqual({
        found: true,
        name: "Anna",
        surname: "Bianchi",
        totalContacts: 3,
      })
    })

    it("says a customer that does not exist is not found, with no rows", async () => {
      const operator = await createOperator()
      await seedContact({ priority: 90 })

      const result = await createTestCaller(operator).task.getContacts({
        customerId: "missing-customer",
        includeInactive: true,
      })

      expect(result.customerFilter).toEqual({
        found: false,
        name: null,
        surname: null,
        totalContacts: 0,
      })
      expect(result.contacts).toEqual([])
      expect(result.total).toBe(0)
    })

    it("says a customer that exists but has no contacts is found, with no rows and no contacts (AC23)", async () => {
      const operator = await createOperator()
      const customer = await createCustomer({
        name: "Luisa",
        surname: "Neri",
      })
      await seedContact({ priority: 90 })

      const result = await createTestCaller(operator).task.getContacts({
        customerId: customer.id,
        includeInactive: true,
      })

      expect(result.customerFilter).toEqual({
        found: true,
        name: "Luisa",
        surname: "Neri",
        totalContacts: 0,
      })
      expect(result.contacts).toEqual([])
      expect(result.total).toBe(0)
    })

    it("counts all the contacts of the customer in totalContacts, whatever the other filters leave", async () => {
      const operator = await createOperator()
      const onlySuperseded = await createCustomer({ name: "Luisa" })
      await createTask({ customerId: onlySuperseded.id, isActive: false })
      const other = await createCustomer()
      await createTask({ customerId: other.id, isActive: false })
      await createTask({ customerId: other.id, state: "erogata" })
      const caller = createTestCaller(operator)

      const withoutSuperseded = await caller.task.getContacts({
        customerId: onlySuperseded.id,
      })
      const withOtherFilters = await caller.task.getContacts({
        customerId: other.id,
        includeInactive: true,
        states: ["chiamare"],
        hasAlert: true,
      })

      // Empty lists, but not customers with no contacts
      expect(withoutSuperseded.contacts).toEqual([])
      expect(withoutSuperseded.customerFilter).toMatchObject({
        found: true,
        name: "Luisa",
        totalContacts: 1,
      })
      expect(withOtherFilters.contacts).toEqual([])
      expect(withOtherFilters.total).toBe(0)
      expect(withOtherFilters.customerFilter).toMatchObject({
        found: true,
        totalContacts: 2,
      })
    })
  })

  it("refuses a user with no operator with BAD_REQUEST", async () => {
    const user = await createUser()
    await seedContact()

    await expect(
      createTestCaller(user).task.getContacts({})
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  describe("invalid input", () => {
    it.each([
      ["a day that does not exist as from", { from: "2026-02-30" }],
      ["a day that does not exist as to", { to: "2026-02-30" }],
      ["a day that is not YYYY-MM-DD", { from: "10/03/2026" }],
      ["a day with a time", { to: "2026-03-10T10:00:00Z" }],
      ["a day before 2000", { from: "1999-12-31" }],
      ["a day after 2100", { to: "2101-01-01" }],
      ["a page below 1", { page: 0 }],
      ["a page over 10000", { page: 10001 }],
      ["a page that is not an integer", { page: 1.5 }],
      ["a perPage that is not in the list", { perPage: 25 }],
      ["a customerQuery with a NUL", { customerQuery: "ross\u0000i" }],
      [
        "a customerQuery over 100 characters",
        { customerQuery: "a".repeat(101) },
      ],
      ["a customerId with a NUL", { customerId: "customer\u00001" }],
      ["a customerId over 64 characters", { customerId: "c".repeat(65) }],
      [
        "more bands than there are",
        { priorities: ["low", "medium", "high", "urgent", "low"] },
      ],
      [
        "a thousand alternating bands",
        {
          priorities: Array.from({ length: 1000 }, (_, i) =>
            i % 2 === 0 ? "low" : "urgent"
          ),
        },
      ],
      [
        "more states than there are",
        { states: Array.from({ length: 9 }, () => "chiamare") },
      ],
      [
        "more than 100 operator ids",
        { operatorIds: Array.from({ length: 101 }, (_, i) => i) },
      ],
      ["a negative operator id", { operatorIds: [-1] }],
      ["an operator id that is not an integer", { operatorIds: [1.5] }],
      ["an operator id over the integer range", { operatorIds: [2 ** 31] }],
      ["a state that does not exist", { states: ["sconosciuto"] }],
      ["a band that does not exist", { priorities: ["critical"] }],
      ["an order column that does not exist", { orderBy: "state" }],
      ["a direction that does not exist", { sortedBy: "up" }],
      ["a date field that does not exist", { dateField: "updatedAt" }],
    ])("rejects %s with BAD_REQUEST", async (_label, input) => {
      const operator = await createOperator()
      await seedContact()

      await expect(
        createTestCaller(operator).task.getContacts(input as GetContactsInput)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    })

    it("accepts a list of every band, every state and 100 operators", async () => {
      const operator = await createOperator()
      const contact = await seedContact({
        operatorId: operator.id,
        state: "chiamare",
        priority: 60,
      })
      const otherOperatorIds = Array.from(
        { length: 99 },
        (_, i) => 1_000_000 + i
      )

      const result = await createTestCaller(operator).task.getContacts({
        priorities: ["low", "medium", "high", "urgent"],
        states: [
          "chiamare",
          "non interessato",
          "app.to",
          "caricato",
          "richiamare",
          "erogata",
          "nessuno",
          "followup",
        ],
        operatorIds: [operator.id, ...otherOperatorIds],
      })

      expect(idsOf(result)).toEqual([contact.id])
      expect(result.total).toBe(1)
    })

    it("counts the 100 characters of the customerQuery after the trim", async () => {
      const operator = await createOperator()
      const longest = await createCustomer({ surname: "a".repeat(100) })
      const contact = await createTask({ customerId: longest.id })
      await seedContact()

      const result = await createTestCaller(operator).task.getContacts({
        customerQuery: `  ${"a".repeat(100)}  `,
      })

      expect(idsOf(result)).toEqual([contact.id])
      expect(result.total).toBe(1)
    })

    it("accepts the limits, and trims the customerQuery", async () => {
      const operator = await createOperator()
      const rossi = await createCustomer({ surname: "Rossi" })
      const contact = await createTask({ customerId: rossi.id })
      await seedContact()
      const caller = createTestCaller(operator)

      const lastPage = await caller.task.getContacts({
        page: 10000,
        perPage: 500,
      })
      const trimmed = await caller.task.getContacts({
        customerQuery: "  ossi ",
      })
      const blank = await caller.task.getContacts({ customerQuery: "   " })
      const longest = await caller.task.getContacts({
        customerQuery: "a".repeat(100),
        from: "2000-01-01",
        to: "2100-12-31",
      })

      expect(lastPage.contacts).toEqual([])
      expect(lastPage.total).toBe(2)
      expect(idsOf(trimmed)).toEqual([contact.id])
      expect(blank.total).toBe(2)
      expect(longest.total).toBe(0)
    })
  })
})

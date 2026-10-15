import { describe, expect, it } from "vitest"
import {
  canCreateContact,
  canHandover,
  canReassign,
  canSelfAssign,
  contactEditability,
  operatorDisplayName,
} from "../permissions"

const mario = { id: 1, name: "Mario", surname: "Rossi" }
const me = { operatorId: 3, role: "OPERATORE" } as const
const myself = { id: 3, name: "Anna", surname: "Bianchi" }
const admin = { operatorId: 9, role: "ADMIN" } as const

describe("contactEditability", () => {
  it("tells an operator who owns neither the contact nor the customer who the contact belongs to", () => {
    expect(
      contactEditability(
        { operatorId: 3, role: "OPERATORE" },
        { isActive: true, taskOperator: mario, customer: { operatorId: 2 } }
      )
    ).toEqual({ kind: "not_owner", assignee: "Mario Rossi" })
  })

  it("lets an operator edit a contact assigned to them", () => {
    expect(
      contactEditability(me, {
        isActive: true,
        taskOperator: myself,
        customer: { operatorId: 2 },
      })
    ).toEqual({ kind: "editable" })
  })

  it("lets an operator edit a colleague's contact on a customer of theirs", () => {
    expect(
      contactEditability(me, {
        isActive: true,
        taskOperator: mario,
        customer: { operatorId: 3 },
      })
    ).toEqual({ kind: "editable" })
  })

  it("lets an operator edit an unassigned contact on a customer of theirs", () => {
    expect(
      contactEditability(me, {
        isActive: true,
        taskOperator: null,
        customer: { operatorId: 3 },
      })
    ).toEqual({ kind: "editable" })
  })

  it("shows an unassigned contact on a customer not theirs as not assigned", () => {
    expect(
      contactEditability(me, {
        isActive: true,
        taskOperator: null,
        customer: { operatorId: 2 },
      })
    ).toEqual({ kind: "not_owner", assignee: null })
  })

  it("shows an unassigned contact on an unassigned customer as not assigned", () => {
    expect(
      contactEditability(me, {
        isActive: true,
        taskOperator: null,
        customer: { operatorId: null },
      })
    ).toEqual({ kind: "not_owner", assignee: null })
  })

  it("lets an admin edit a colleague's contact", () => {
    expect(
      contactEditability(admin, {
        isActive: true,
        taskOperator: mario,
        customer: { operatorId: 2 },
      })
    ).toEqual({ kind: "editable" })
  })

  it("keeps a superseded contact read-only for the operator who owns it", () => {
    expect(
      contactEditability(me, {
        isActive: false,
        taskOperator: myself,
        customer: { operatorId: 3 },
      })
    ).toEqual({ kind: "superseded" })
  })

  it("keeps a superseded contact read-only for an admin", () => {
    expect(
      contactEditability(admin, {
        isActive: false,
        taskOperator: mario,
        customer: { operatorId: 1 },
      })
    ).toEqual({ kind: "superseded" })
  })
})

describe("operatorDisplayName", () => {
  it("joins name and surname", () => {
    expect(operatorDisplayName(mario)).toBe("Mario Rossi")
  })

  it("shows only the name when the surname is missing", () => {
    expect(operatorDisplayName({ id: 1, name: "Mario", surname: null })).toBe(
      "Mario"
    )
  })

  it("skips a blank name", () => {
    expect(operatorDisplayName({ id: 1, name: "  ", surname: " Rossi " })).toBe(
      "Rossi"
    )
  })

  it("falls back to the operator id when both are missing", () => {
    expect(operatorDisplayName({ id: 7, name: null, surname: null })).toBe(
      "Operatore 7"
    )
  })
})

describe("canCreateContact", () => {
  it("lets an admin create a contact", () => {
    expect(canCreateContact(admin, { operatorId: 2 })).toBe(true)
  })

  it("lets the customer's operator create a contact", () => {
    expect(canCreateContact(me, { operatorId: 3 })).toBe(true)
  })

  it("refuses an operator on another operator's customer", () => {
    expect(canCreateContact(me, { operatorId: 2 })).toBe(false)
  })

  it("refuses an operator on an unassigned customer", () => {
    expect(canCreateContact(me, { operatorId: null })).toBe(false)
  })
})

describe("canReassign", () => {
  it("lets an admin reassign a contact", () => {
    expect(canReassign(admin)).toBe(true)
  })

  it("refuses an operator", () => {
    expect(canReassign(me)).toBe(false)
  })
})

describe("canSelfAssign", () => {
  it("offers self-assign on an unassigned customer", () => {
    expect(canSelfAssign({ operatorId: null })).toBe(true)
  })

  it("refuses self-assign on an assigned customer", () => {
    expect(canSelfAssign({ operatorId: 2 })).toBe(false)
  })
})

describe("canHandover", () => {
  it("lets an admin hand over an assigned customer", () => {
    expect(canHandover(admin, { operatorId: 2 })).toBe(true)
  })

  it("lets an admin hand over an unassigned customer", () => {
    expect(canHandover(admin, { operatorId: null })).toBe(true)
  })

  it("lets an operator hand over their own customer", () => {
    expect(canHandover(me, { operatorId: 3 })).toBe(true)
  })

  it("refuses an operator on a colleague's customer", () => {
    expect(canHandover(me, { operatorId: 2 })).toBe(false)
  })

  it("refuses an operator on an unassigned customer", () => {
    expect(canHandover(me, { operatorId: null })).toBe(false)
  })
})

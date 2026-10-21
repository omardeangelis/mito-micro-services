import { describe, expect, it } from "vitest"
import { type ContactRow } from "@mito/server/services/contact/getContacts"
import { groupContacts } from "../groupContacts"

const row = (
  id: number,
  customerId: string,
  isActive: boolean,
  createdAt = `2026-03-${String(id).padStart(2, "0")}T10:00:00Z`
): ContactRow => ({
  id,
  state: "chiamare",
  priority: 0,
  isActive,
  closedAt: null,
  createdAt: new Date(createdAt),
  updatedAt: new Date(createdAt),
  operator: null,
  customer: {
    id: customerId,
    name: null,
    surname: null,
    phoneNumber: null,
    fiscalCode: null,
    vatCode: null,
    blackListStatus: "whitelisted",
    operatorId: null,
  },
  alert: null,
})

const shape = (entries: ReturnType<typeof groupContacts>) =>
  entries.map(({ contact, nested }) => `${contact.id}${nested ? "n" : ""}`)

describe("groupContacts", () => {
  it("without previous contacts leaves the rows as they are", () => {
    const contacts = [row(3, "a", true), row(2, "b", true)]

    expect(shape(groupContacts(contacts, []))).toEqual(["3", "2"])
  })

  it("hangs the previous contacts under the active one of their customer, newest created first", () => {
    const contacts = [row(10, "a", true), row(11, "b", true)]
    const previous = [
      row(5, "a", false),
      row(7, "a", false),
      row(6, "b", false),
    ]

    expect(shape(groupContacts(contacts, previous))).toEqual([
      "10",
      "7n",
      "5n",
      "11",
      "6n",
    ])
  })

  it("keeps the order of the rows the server sorted, whatever the previous ones", () => {
    const contacts = [row(11, "b", true), row(10, "a", true)]
    const previous = [row(5, "a", false)]

    expect(shape(groupContacts(contacts, previous))).toEqual(["11", "10", "5n"])
  })

  it("nests the previous contacts that come in the rows too (a list of one customer)", () => {
    const contacts = [
      row(9, "a", false),
      row(10, "a", true),
      row(8, "a", false),
    ]

    expect(shape(groupContacts(contacts, []))).toEqual(["10", "9n", "8n"])
  })

  it("leaves a previous contact with no active one of its customer as a row of its own", () => {
    const contacts = [row(9, "a", false), row(8, "a", false)]

    expect(shape(groupContacts(contacts, []))).toEqual(["9", "8"])
  })

  it("hangs a contact once, also when the customer has two active ones", () => {
    const contacts = [row(10, "a", true), row(11, "a", true)]
    const previous = [row(5, "a", false)]

    expect(shape(groupContacts(contacts, previous))).toEqual(["10", "5n", "11"])
  })

  it("ignores a previous contact of a customer with no row, and a repeated one", () => {
    const contacts = [row(10, "a", true), row(5, "a", false)]
    const previous = [row(5, "a", false), row(6, "z", false)]

    expect(shape(groupContacts(contacts, previous))).toEqual(["10", "5n"])
  })
})

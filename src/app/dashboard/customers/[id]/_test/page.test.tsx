import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import CustomerHome from "../page"

// La scheda cliente (AC64, AC65, AC66, AC68): con un contatto attivo ne mostra
// il riepilogo in sola lettura, senza i controlli di stato, priorità e alert;
// senza contatto, "Crea contatto". Le note restano. Il test legge l'albero che
// la pagina restituisce, senza renderlo

const api = vi.hoisted(() => ({
  getCustomerById: vi.fn(),
  getActiveTask: vi.fn(),
  getContactById: vi.fn(),
  getCustomerAlerts: vi.fn(),
}))

vi.mock("@/trpc/server", () => ({
  api: {
    customer: { getCustomerById: { query: api.getCustomerById } },
    task: {
      getActiveTask: { query: api.getActiveTask },
      getContactById: { query: api.getContactById },
      getCustomerAlerts: { query: api.getCustomerAlerts },
    },
  },
}))

// Pezzi della pagina con le loro dipendenze (client tRPC, server action):
// qui basta riconoscerli nell'albero, per nome
vi.mock("../_components/CustomerSheet", () => ({
  CustomerSheet: function CustomerSheet() {
    return null
  },
}))
vi.mock("../_components/CustomersPraticaSection", () => ({
  CustomerPraticaSection: function CustomerPraticaSection() {
    return null
  },
}))
vi.mock("../_components/CustomerFormSection", () => ({
  CustomerFormSection: function CustomerFormSection() {
    return null
  },
}))
vi.mock("@/components/custom/notes/CustomerChatSection", () => ({
  CustomerChatSection: function CustomerChatSection() {
    return null
  },
}))
vi.mock("../_components/CustomerCreateContact", () => ({
  CustomerCreateContact: function CustomerCreateContact() {
    return null
  },
}))

const giulia = { id: 9, name: "Giulia", surname: "Bianchi" }
const deadline = new Date("2026-11-05T09:00:00Z")

const customer = {
  id: "customer-1",
  operatorId: 7,
  blackListStatus: "whitelisted",
}
const activeTask = {
  id: 321,
  alertId: null,
  state: "richiamare",
  operatorId: 9,
}
const contactDetail = {
  contact: { id: 321, state: "richiamare", priority: 120, operator: giulia },
  alert: { id: 4, deadline, message: null },
}

beforeEach(() => {
  api.getCustomerById.mockReset().mockResolvedValue(customer)
  api.getActiveTask.mockReset().mockResolvedValue([activeTask])
  api.getContactById.mockReset().mockResolvedValue(contactDetail)
  api.getCustomerAlerts.mockReset().mockResolvedValue([])
})

/** Gli elementi dell'albero che `match` riconosce, i figli compresi. */
function findAll(
  node: React.ReactNode,
  match: (element: React.ReactElement) => boolean,
  found: React.ReactElement[] = []
) {
  if (Array.isArray(node)) {
    node.forEach((child) => findAll(child as React.ReactNode, match, found))
  } else if (React.isValidElement(node)) {
    if (match(node)) found.push(node)
    findAll(
      (node.props as { children?: React.ReactNode }).children,
      match,
      found
    )
  }
  return found
}

const named = (name: string) => (element: React.ReactElement) =>
  (element.type as { name?: string }).name === name

async function page() {
  return CustomerHome({ params: { id: "customer-1" }, searchParams: {} })
}

const elementsNamed = async (name: string) => findAll(await page(), named(name))

describe("la scheda cliente con un contatto attivo", () => {
  it("mostra il riepilogo letto da getContactById sul contatto attivo (AC64)", async () => {
    const [summary, ...others] = await elementsNamed("CustomerContactSummary")

    expect(others).toHaveLength(0)
    expect(api.getContactById).toHaveBeenCalledWith({ id: "321" })
    expect(summary!.props).toMatchObject({
      customerId: "customer-1",
      contact: {
        id: 321,
        state: "richiamare",
        priority: 120,
        operator: giulia,
      },
      alert: { deadline },
    })
  })

  it("passa alert nullo se il contatto non ne ha uno aperto", async () => {
    api.getContactById.mockResolvedValue({ ...contactDetail, alert: null })

    const [summary] = await elementsNamed("CustomerContactSummary")

    expect(summary!.props).toMatchObject({ alert: null })
  })

  it("non ha più i controlli di stato, priorità e alert (AC65)", async () => {
    expect(await elementsNamed("CustomerCreateContact")).toHaveLength(0)
  })

  it("tiene il form, le pratiche e le note (AC68)", async () => {
    for (const name of [
      "CustomerFormSection",
      "CustomerPraticaSection",
      "CustomerChatSection",
    ]) {
      expect(await elementsNamed(name)).toHaveLength(1)
    }
  })

  it("il passaggio di consegne continua a ricevere il contatto attivo", async () => {
    const [form] = await elementsNamed("CustomerFormSection")

    expect(form!.props).toMatchObject({
      activeContact: { state: "richiamare", operatorId: 9, alert: null },
    })
  })
})

describe("la scheda cliente senza contatto attivo", () => {
  beforeEach(() => {
    api.getActiveTask.mockResolvedValue([])
  })

  it("mostra 'Crea contatto' e non il riepilogo (AC66)", async () => {
    const [create] = await elementsNamed("CustomerCreateContact")

    expect(create!.props).toMatchObject({
      customerId: "customer-1",
      customerOperatorId: 7,
    })
    expect(await elementsNamed("CustomerContactSummary")).toHaveLength(0)
    expect(api.getContactById).not.toHaveBeenCalled()
  })
})

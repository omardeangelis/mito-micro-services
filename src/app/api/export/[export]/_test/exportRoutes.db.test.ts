import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { NextRequest } from "next/server"
import { type Session } from "next-auth"
import { getServerAuthSession } from "@mito/server/auth"
import { chat, messages } from "@mito/db/schema/chat"
import { practices } from "@mito/db/schema/pratiche"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { reportedErrors } from "@/test/errorReporter"
import {
  createCustomer,
  createOperator,
  createTask,
  createUser,
} from "@/test/factories"
import { POST as fetchCall } from "../fetchCall/route"
import { POST as fetchDefault } from "../fetchDefault/route"
import { POST as getMessages } from "../getMessages/route"

// The routes the export dialog reads its data from. They answer only who is
// signed in, and the calls export gives an operator only their own calls.

/** 17/09/2026 as the dialog sends it: from 07:00 to 23:59 in Italy. */
const DAY = { from: "2026-09-17T05:00:00.000Z", to: "2026-09-17T21:59:00.000Z" }
const IN_DAY = new Date("2026-09-17T10:00:00.000Z")
const DAY_BEFORE = new Date("2026-09-16T10:00:00.000Z")

const post = (route: string, body: unknown) =>
  new NextRequest(`http://localhost/api/export/export/${route}`, {
    method: "POST",
    body: JSON.stringify(body),
  })

/** Signs in the user of an operator or a user; `null` signs out. */
function signIn(actor: { userId: string } | { id: string } | null) {
  const session = actor && {
    user: { id: "userId" in actor ? actor.userId : actor.id },
    expires: "2099-01-01T00:00:00.000Z",
  }
  vi.mocked(getServerAuthSession).mockResolvedValue(session as Session | null)
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  signIn(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("fetchCall", () => {
  type Calls = {
    result?: {
      task: { id: number }
      operator: { id: number }
      customers: { id: string }
    }[]
  }

  const callsOf = async (body: unknown = { interval: DAY }) => {
    const response = await fetchCall(post("fetchCall", body))
    const json = (await response.json()) as Calls
    return {
      status: response.status,
      tasks: json.result?.map((row) => row.task.id),
      rows: json.result,
    }
  }

  /** A closed call of `operator`, on a customer of its own. */
  async function closedCall(
    operator: { id: number },
    values: Parameters<typeof createTask>[0] = {}
  ) {
    const customer = await createCustomer({ operatorId: operator.id })
    return createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "app.to",
      isActive: false,
      closedAt: IN_DAY,
      ...values,
    })
  }

  async function seedCalls() {
    const admin = await createOperator({ role: "ADMIN", surname: "Admin" })
    const bianchi = await createOperator({ surname: "Bianchi" })
    const rossi = await createOperator({ surname: "Rossi" })
    return {
      admin,
      bianchi,
      rossi,
      ofBianchi: await closedCall(bianchi),
      ofRossi: await closedCall(rossi),
      alsoOfRossi: await closedCall(rossi, { state: "non interessato" }),
      // Never in the export: closed another day, without outcome, still open
      dayBefore: await closedCall(rossi, { closedAt: DAY_BEFORE }),
      noOutcome: await closedCall(rossi, { state: "nessuno" }),
      open: await closedCall(rossi, { closedAt: null, isActive: true }),
    }
  }

  it("risponde 401 a chi non ha una sessione, senza dati", async () => {
    await seedCalls()

    expect(await callsOf()).toEqual({ status: 401 })
  })

  it("a un admin dà le chiamate chiuse nell'intervallo di tutti gli operatori, con operatore e cliente", async () => {
    const seed = await seedCalls()
    signIn(seed.admin)

    const { status, tasks, rows } = await callsOf()

    expect(status).toBe(200)
    // By the operator's surname
    expect(tasks).toEqual([
      seed.ofBianchi.id,
      seed.ofRossi.id,
      seed.alsoOfRossi.id,
    ])
    expect(rows![0]).toMatchObject({
      operator: { id: seed.bianchi.id },
      customers: { id: seed.ofBianchi.customerId },
    })
  })

  it("a un operatore dà solo le proprie chiamate, qualunque cosa dica la richiesta", async () => {
    const seed = await seedCalls()
    signIn(seed.bianchi)

    const asked = await callsOf({
      interval: DAY,
      isAdmin: true,
      operatorId: seed.rossi.id,
    })

    expect(asked).toMatchObject({ status: 200, tasks: [seed.ofBianchi.id] })
    expect(await callsOf()).toMatchObject({ tasks: [seed.ofBianchi.id] })
  })

  it("a un utente non admin senza operatore non dà nessuna chiamata", async () => {
    await seedCalls()
    signIn(await createUser({ role: "OPERATORE" }))

    expect(await callsOf()).toMatchObject({ status: 200, tasks: [] })
  })

  it.each([
    ["senza intervallo", {}],
    ["senza la data di fine", { interval: { from: DAY.from } }],
    ["con una data che non lo è", { interval: { ...DAY, to: "domani" } }],
  ])("risponde 400 %s", async (_, body) => {
    const seed = await seedCalls()
    signIn(seed.admin)

    expect(await callsOf(body)).toEqual({ status: 400 })
  })

  it("risponde 500 e segnala l'errore se il database non risponde", async () => {
    const seed = await seedCalls()
    signIn(seed.admin)
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.spyOn(testDb, "select").mockImplementationOnce(() => {
      throw new Error("connection lost")
    })

    expect(await callsOf()).toEqual({ status: 500 })
    expect(reportedErrors).toHaveLength(1)
    expect(reportedErrors[0]!.data).toEqual({
      route: "/api/export/export/fetchCall",
    })
  })
})

describe("fetchDefault", () => {
  type Rows = {
    dbCustomers?: { id: string }[]
    dbPractices?: { praticaId: string }[]
  }

  const rowsOf = async () => {
    const response = await fetchDefault(post("fetchDefault", { interval: DAY }))
    const json = (await response.json()) as Rows
    return {
      status: response.status,
      customers: json.dbCustomers?.map(({ id }) => id),
      practices: json.dbPractices?.map(({ praticaId }) => praticaId),
    }
  }

  const createPractice = (praticaId: string, updatedAt: Date) =>
    testDb.insert(practices).values({
      praticaId,
      importoFinanziato: "12000.50",
      importoErogato: "10000.00",
      rateTotali: 84,
      importoRata: "190.00",
      ratePagate: 12,
      dataLiquidazione: new Date("2025-01-09T23:00:00.000Z"),
      state: "Liquidata",
      updatedAt,
    })

  async function seedRows() {
    const updated = await createCustomer({ updatedAt: IN_DAY })
    await createCustomer({ updatedAt: DAY_BEFORE })
    await createPractice("P-1", IN_DAY)
    await createPractice("P-2", DAY_BEFORE)
    return { updated }
  }

  it("risponde 401 a chi non ha una sessione, senza dati", async () => {
    await seedRows()

    expect(await rowsOf()).toEqual({ status: 401 })
  })

  it("a chi ha una sessione dà clienti e pratiche aggiornati nell'intervallo", async () => {
    const { updated } = await seedRows()
    signIn(await createOperator())

    expect(await rowsOf()).toEqual({
      status: 200,
      customers: [updated.id],
      practices: ["P-1"],
    })
  })
})

describe("getMessages", () => {
  const messagesOf = async (chatIds: number[]) => {
    const response = await getMessages(post("getMessages", { chatIds }))
    const json = (await response.json()) as { result?: { content: string }[] }
    return {
      status: response.status,
      contents: json.result?.map(({ content }) => content),
    }
  }

  async function seedChats() {
    const operator = await createOperator()
    const [asked, other] = await testDb
      .insert(chat)
      .values([{}, {}])
      .returning()
    await testDb.insert(messages).values([
      { operatorId: operator.id, chatId: asked!.id, content: "richiamare" },
      { operatorId: operator.id, chatId: other!.id, content: "altra chat" },
    ])
    return { operator, asked: asked!, other: other! }
  }

  it("risponde 401 a chi non ha una sessione, senza messaggi", async () => {
    const { asked } = await seedChats()

    expect(await messagesOf([asked.id])).toEqual({ status: 401 })
  })

  it("dà i messaggi delle chat chieste, anche a un utente senza nome", async () => {
    const { operator, asked } = await seedChats()
    // The session of the factories has no name, as after an email login
    signIn(operator)

    expect(await messagesOf([asked.id])).toEqual({
      status: 200,
      contents: ["richiamare"],
    })
  })

  it("senza chat risponde con nessun messaggio", async () => {
    const { operator } = await seedChats()
    signIn(operator)

    expect(await messagesOf([])).toEqual({ status: 200, contents: [] })
  })
})

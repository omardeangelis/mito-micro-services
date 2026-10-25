import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb } from "@/test/db"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
} from "@/test/factories"

// Le query di lettura del router `task` (GET): ogni test fissa la risposta.
// Dove conta solo quali righe tornano, le righe si confrontano come insieme,
// ordinate per `customerId`; l'ordine per scadenza ha un test suo.

const byCustomerId = <T extends { customerId: string | null }>(a: T, b: T) =>
  (a.customerId ?? "").localeCompare(b.customerId ?? "")

const DEADLINE_UNO = new Date("2026-10-01T08:00:00.000Z")
const DEADLINE_DUE = new Date("2026-10-03T08:00:00.000Z")
const DEADLINE_CINQUE = new Date("2026-10-07T08:00:00.000Z")

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("task.getCustomersWithActiveAlerts", () => {
  it("con customerIds vuoto restituisce una lista vuota, anche se ci sono alert aperti", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ id: "cliente-uno" })
    const task = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
    })
    await createAlert({ taskId: task.id, deadline: DEADLINE_UNO })

    const result = await createTestCaller(
      operator
    ).task.getCustomersWithActiveAlerts({ customerIds: [] })

    expect(result).toEqual([])
  })

  it("restituisce, dei clienti richiesti, solo gli alert aperti sulla loro task attiva, con tutti i campi", async () => {
    const operator = await createOperator()
    const uno = await createCustomer({
      id: "cliente-uno",
      name: "Anna",
      surname: "Rossi",
    })
    const due = await createCustomer({
      id: "cliente-due",
      name: "Bruno",
      surname: "Bianchi",
    })
    const tre = await createCustomer({
      id: "cliente-tre",
      name: "Carla",
      surname: "Verdi",
    })
    const quattro = await createCustomer({
      id: "cliente-quattro",
      name: "Dario",
      surname: "Neri",
    })
    const cinque = await createCustomer({
      id: "cliente-cinque",
      name: "Elena",
      surname: "Gallo",
    })
    const sei = await createCustomer({
      id: "cliente-sei",
      name: "Franco",
      surname: "Riva",
    })

    // 1: alert aperto sulla task attiva
    const taskUno = await createTask({
      customerId: uno.id,
      operatorId: operator.id,
      state: "chiamare",
    })
    const alertUno = await createAlert({
      taskId: taskUno.id,
      deadline: DEADLINE_UNO,
      message: "Richiamare dopo le dieci",
    })

    // 2: alert aperto sulla task attiva
    const taskDue = await createTask({
      customerId: due.id,
      operatorId: operator.id,
      state: "richiamare",
    })
    const alertDue = await createAlert({
      taskId: taskDue.id,
      deadline: DEADLINE_DUE,
      message: "Secondo cliente",
    })

    // 3: alert risolto sulla task attiva, quindi escluso
    const taskTre = await createTask({
      customerId: tre.id,
      operatorId: operator.id,
    })
    await createAlert({
      taskId: taskTre.id,
      deadline: DEADLINE_UNO,
      message: "Già risolto",
      isResolved: true,
    })

    // 4: alert aperto su una task non più attiva, quindi escluso
    const taskQuattro = await createTask({
      customerId: quattro.id,
      operatorId: operator.id,
      isActive: false,
    })
    await createAlert({
      taskId: taskQuattro.id,
      deadline: DEADLINE_UNO,
      message: "Storico",
    })

    // 5: due alert aperti sulla stessa task attiva. Si crea prima l'alert non
    // collegato: `createAlert` punta la task sull'ultimo creato, quindi la task
    // resta collegata a `alertCinque`, e solo quello deve comparire.
    const taskCinque = await createTask({
      customerId: cinque.id,
      operatorId: operator.id,
      state: "followup",
    })
    await createAlert({
      taskId: taskCinque.id,
      deadline: DEADLINE_UNO,
      message: "Non collegato alla task",
    })
    const alertCinque = await createAlert({
      taskId: taskCinque.id,
      deadline: DEADLINE_CINQUE,
      message: "Collegato alla task",
    })

    // 6: alert aperto sulla task attiva, ma il cliente non è tra quelli richiesti
    const taskSei = await createTask({
      customerId: sei.id,
      operatorId: operator.id,
    })
    await createAlert({
      taskId: taskSei.id,
      deadline: DEADLINE_UNO,
      message: "Non richiesto",
    })

    const result = await createTestCaller(
      operator
    ).task.getCustomersWithActiveAlerts({
      customerIds: [uno.id, due.id, tre.id, quattro.id, cinque.id],
    })

    expect([...result].sort(byCustomerId)).toEqual([
      {
        customerId: "cliente-cinque",
        name: "Elena",
        surname: "Gallo",
        alertId: alertCinque.id,
        deadline: DEADLINE_CINQUE,
        message: "Collegato alla task",
        state: "followup",
      },
      {
        customerId: "cliente-due",
        name: "Bruno",
        surname: "Bianchi",
        alertId: alertDue.id,
        deadline: DEADLINE_DUE,
        message: "Secondo cliente",
        state: "richiamare",
      },
      {
        customerId: "cliente-uno",
        name: "Anna",
        surname: "Rossi",
        alertId: alertUno.id,
        deadline: DEADLINE_UNO,
        message: "Richiamare dopo le dieci",
        state: "chiamare",
      },
    ])
  })

  it("non restituisce l'alert aperto di una task non più attiva", async () => {
    const operator = await createOperator()
    const storico = await createCustomer({ id: "cliente-storico" })
    const attivo = await createCustomer({ id: "cliente-attivo" })
    const taskStorica = await createTask({
      customerId: storico.id,
      operatorId: operator.id,
      isActive: false,
    })
    await createAlert({ taskId: taskStorica.id, deadline: DEADLINE_UNO })
    const taskAttiva = await createTask({
      customerId: attivo.id,
      operatorId: operator.id,
    })
    const alertAttivo = await createAlert({
      taskId: taskAttiva.id,
      deadline: DEADLINE_UNO,
    })

    const result = await createTestCaller(
      operator
    ).task.getCustomersWithActiveAlerts({
      customerIds: [storico.id, attivo.id],
    })

    expect(result).toEqual([
      expect.objectContaining({
        customerId: attivo.id,
        alertId: alertAttivo.id,
      }),
    ])
  })

  it("con un solo cliente restituisce il suo alert aperto", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({
      id: "cliente-solo",
      name: "Gina",
      surname: "Leone",
    })
    const task = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "richiamare",
    })
    const openAlert = await createAlert({
      taskId: task.id,
      deadline: DEADLINE_DUE,
      message: "Unico cliente",
    })

    const result = await createTestCaller(
      operator
    ).task.getCustomersWithActiveAlerts({ customerIds: [customer.id] })

    expect(result).toEqual([
      {
        customerId: "cliente-solo",
        name: "Gina",
        surname: "Leone",
        alertId: openAlert.id,
        deadline: DEADLINE_DUE,
        message: "Unico cliente",
        state: "richiamare",
      },
    ])
  })
})

describe("task.getCustomersWithActiveAlerts: ordine", () => {
  it("restituisce gli alert per scadenza, la più vicina per prima, qualunque sia l'ordine dei clienti", async () => {
    const operator = await createOperator()
    const deadlines = [DEADLINE_CINQUE, DEADLINE_UNO, DEADLINE_DUE]
    const customerIds: string[] = []
    for (const [i, deadline] of deadlines.entries()) {
      // Gli id vanno al contrario delle scadenze
      const customer = await createCustomer({ id: `cliente-${3 - i}` })
      const task = await createTask({
        customerId: customer.id,
        operatorId: operator.id,
        state: "richiamare",
      })
      await createAlert({ taskId: task.id, deadline })
      customerIds.push(customer.id)
    }

    const result = await createTestCaller(
      operator
    ).task.getCustomersWithActiveAlerts({ customerIds })

    expect(result.map((row) => row.deadline)).toEqual([
      DEADLINE_UNO,
      DEADLINE_DUE,
      DEADLINE_CINQUE,
    ])
  })
})

describe("task.getActiveTask", () => {
  it("restituisce la task attiva del cliente richiesto, non quella più recente di un altro cliente", async () => {
    const operator = await createOperator()
    const a = await createCustomer({ id: "cliente-a" })
    const b = await createCustomer({ id: "cliente-b" })
    // Task attiva di A, la più vecchia delle tre
    const activeA = await createTask({
      customerId: a.id,
      operatorId: operator.id,
      createdAt: new Date("2026-10-01T08:00:00.000Z"),
      updatedAt: new Date("2026-10-01T08:00:00.000Z"),
    })
    // Task di A non più attiva, più recente della sua attiva
    await createTask({
      customerId: a.id,
      operatorId: operator.id,
      isActive: false,
      createdAt: new Date("2026-10-05T08:00:00.000Z"),
      updatedAt: new Date("2026-10-05T08:00:00.000Z"),
    })
    // Task attiva di B, la più recente di tutte: senza il filtro sul cliente
    // sarebbe questa a comparire al posto di quella di A
    await createTask({
      customerId: b.id,
      operatorId: operator.id,
      createdAt: new Date("2026-10-10T08:00:00.000Z"),
      updatedAt: new Date("2026-10-10T08:00:00.000Z"),
    })

    const result = await createTestCaller(operator).task.getActiveTask({
      id: a.id,
    })

    expect(result).toEqual([activeA])
  })
})

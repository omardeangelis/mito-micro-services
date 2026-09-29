import fs from "fs"
import path from "path"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  LEGACY_SCHEMA_TAG,
  migrateUpTo,
  queryReadOnly,
  resetDb,
} from "@/test/db"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
} from "@/test/factories"

// The list the admins approve before the PR2 migration. The data it lists
// (more than one active contact per customer) only fits the schema before the
// unique index.

const PREVIEW_FILE = path.resolve(__dirname, "../contatti-cleanup-preview.sql")

/** Runs the preview file in a read-only transaction: a write would fail it. */
async function runPreview() {
  const [duplicates, alerts, realign] = await queryReadOnly(
    fs.readFileSync(PREVIEW_FILE, "utf8")
  )
  return { duplicates: duplicates!, alerts: alerts!, realign: realign! }
}

const at = (day: string) => new Date(`2026-09-${day}T09:00:00.000Z`)

beforeAll(async () => {
  await migrateUpTo(LEGACY_SCHEMA_TAG)
})

beforeEach(async () => {
  await resetDb()
})

describe("contatti-cleanup-preview.sql", () => {
  it("indica come superstite il contatto più recente per GREATEST(updated_at, created_at) e, a pari merito, quello con id maggiore", async () => {
    const operator = await createOperator()
    // By updated_at alone the first would stay: the later creation wins
    const moreRecent = await createCustomer({ operatorId: operator.id })
    const updatedLater = await createTask({
      customerId: moreRecent.id,
      state: "app.to",
      operatorId: operator.id,
      closedAt: at("14"),
      createdAt: at("01"),
      updatedAt: at("15"),
    })
    const createdLater = await createTask({
      customerId: moreRecent.id,
      state: "richiamare",
      operatorId: operator.id,
      createdAt: at("20"),
      updatedAt: at("10"),
    })
    // Same instant: the higher id stays
    const tie = await createCustomer()
    const lowerId = await createTask({
      customerId: tie.id,
      createdAt: at("05"),
      updatedAt: at("05"),
    })
    const higherId = await createTask({
      customerId: tie.id,
      createdAt: at("05"),
      updatedAt: at("05"),
    })
    // Not listed: one active contact, and tasks without a customer
    const single = await createCustomer()
    await createTask({ customerId: single.id })
    await createTask({ customerId: single.id, isActive: false })
    await createTask({ customerId: null })
    await createTask({ customerId: null })

    const { duplicates } = await runPreview()

    expect(new Set(duplicates.map((row) => row.cliente_id))).toEqual(
      new Set([moreRecent.id, tie.id])
    )
    expect(
      duplicates.filter((row) => row.cliente_id === moreRecent.id)
    ).toEqual([
      expect.objectContaining({
        cliente: `Anna ${moreRecent.surname}`,
        esito: "resta attivo",
        contatto_id: createdLater.id,
        stato: "richiamare",
        operatore_id: operator.id,
        operatore: `Mario ${operator.surname}`,
        contattato_il: null,
      }),
      expect.objectContaining({
        esito: "disattivato",
        contatto_id: updatedLater.id,
        stato: "app.to",
        operatore_id: operator.id,
        contattato_il: at("14"),
      }),
    ])
    expect(
      duplicates
        .filter((row) => row.cliente_id === tie.id)
        .map((row) => [row.esito, row.contatto_id])
    ).toEqual([
      ["resta attivo", higherId.id],
      ["disattivato", lowerId.id],
    ])
  })

  it("elenca tutti gli alert aperti che la pulizia chiude, con il motivo", async () => {
    const operator = await createOperator()
    const duplicated = await createCustomer({ operatorId: operator.id })
    const deactivated = await createTask({
      customerId: duplicated.id,
      operatorId: operator.id,
      updatedAt: at("01"),
    })
    const survivor = await createTask({
      customerId: duplicated.id,
      updatedAt: at("02"),
    })
    const onDeactivated = await createAlert({
      taskId: deactivated.id,
      deadline: at("20"),
      message: "richiamare dopo le 18",
    })
    await createAlert({ taskId: survivor.id, deadline: at("21") })
    const customer = await createCustomer()
    await createTask({ customerId: customer.id })
    const inactive = await createTask({
      customerId: customer.id,
      isActive: false,
    })
    const onInactive = await createAlert({
      taskId: inactive.id,
      deadline: at("10"),
    })
    await createAlert({
      taskId: inactive.id,
      deadline: at("11"),
      isResolved: true,
    })
    // Also active: the cron fails on it at every run (review of PR1, F6)
    const orphan = await createTask({ customerId: null })
    const onOrphan = await createAlert({
      taskId: orphan.id,
      deadline: at("12"),
    })

    const { alerts } = await runPreview()

    expect(alerts).toEqual([
      expect.objectContaining({
        alert_id: onInactive.id,
        motivo: "contatto non attivo",
        cliente_id: customer.id,
        contatto_id: inactive.id,
        scadenza: at("10"),
      }),
      expect.objectContaining({
        alert_id: onOrphan.id,
        motivo: "contatto senza cliente",
        cliente_id: null,
        cliente: null,
        contatto_id: orphan.id,
      }),
      expect.objectContaining({
        alert_id: onDeactivated.id,
        motivo: "contatto disattivato dalla pulizia",
        cliente_id: duplicated.id,
        cliente: `Anna ${duplicated.surname}`,
        contatto_id: deactivated.id,
        scadenza: at("20"),
        messaggio: "richiamare dopo le 18",
        operatore_id: operator.id,
        operatore: `Mario ${operator.surname}`,
      }),
    ])
  })

  it("conta per coppia di operatori le task che il riallineamento sposta, attive e non attive dopo la pulizia", async () => {
    const owner = await createOperator({ name: "Carla" })
    const previous = await createOperator({ name: "Luca" })
    const other = await createOperator({ name: "Sara" })
    const customer = await createCustomer({ operatorId: owner.id })
    await createTask({ customerId: customer.id, operatorId: previous.id })
    await createTask({
      customerId: customer.id,
      operatorId: previous.id,
      isActive: false,
    })
    await createTask({
      customerId: customer.id,
      operatorId: null,
      isActive: false,
    })
    // Already on the customer's operator: nothing to move
    await createTask({
      customerId: customer.id,
      operatorId: owner.id,
      isActive: false,
    })
    // The duplicate the cleanup deactivates counts as inactive
    const duplicated = await createCustomer({ operatorId: owner.id })
    await createTask({
      customerId: duplicated.id,
      operatorId: other.id,
      updatedAt: at("01"),
    })
    await createTask({
      customerId: duplicated.id,
      operatorId: other.id,
      updatedAt: at("02"),
    })
    // Not moved: a customer without operator, a task without customer
    const unassigned = await createCustomer({ operatorId: null })
    await createTask({ customerId: unassigned.id, operatorId: previous.id })
    await createTask({ customerId: null, operatorId: previous.id })

    const { realign } = await runPreview()

    expect(realign).toHaveLength(3)
    expect(realign).toEqual(
      expect.arrayContaining([
        {
          operatore_attuale_id: previous.id,
          operatore_attuale: `Luca ${previous.surname}`,
          operatore_cliente_id: owner.id,
          operatore_cliente: `Carla ${owner.surname}`,
          attive: 1,
          non_attive: 1,
        },
        expect.objectContaining({
          operatore_attuale_id: null,
          operatore_attuale: null,
          operatore_cliente_id: owner.id,
          attive: 0,
          non_attive: 1,
        }),
        expect.objectContaining({
          operatore_attuale_id: other.id,
          operatore_cliente_id: owner.id,
          attive: 1,
          non_attive: 1,
        }),
      ])
    )
  })
})

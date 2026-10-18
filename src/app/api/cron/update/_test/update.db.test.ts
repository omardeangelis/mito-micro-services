import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import * as Sentry from "@sentry/nextjs"
import { eq } from "drizzle-orm"
import { customers } from "@/server/db/schema/customers"
import { practices } from "@/server/db/schema/pratiche"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failNextUpdateOf } from "@/test/failpoint"
import { createCustomer, createPractice } from "@/test/factories"
import { GET } from "../route"

// The cron's own authentication is a boundary: these tests run as the job
vi.mock("@/app/api/_utils/auth", () => ({ authCheck: vi.fn(async () => null) }))

// The route reports its failures to Sentry itself
vi.mock("@sentry/nextjs", async (importOriginal) => ({
  ...(await importOriginal<typeof Sentry>()),
  captureException: vi.fn(),
}))

const DAY = 24 * 60 * 60 * 1000

/** 05:00 in Italy, when the night's crons have run. */
const NOW = new Date("2026-10-14T03:00:00.000Z")
/** Imported long before NOW: the practices below may be updated. */
const LONG_AGO = new Date(NOW.getTime() - 40 * DAY)
/** 08:00 of the day the cron matches, in UTC (the time zone of the tests). */
const TODAY_AT_8 = Date.parse("2026-10-14T08:00:00.000Z")

const url = "http://localhost/api/cron/update"

const OK = { status: 200, body: { message: "Cron job ran" } }
const FAILED = {
  status: 200,
  body: {
    message: "Error exporting data",
    filePath: null,
    error: "Error exporting data",
  },
}

async function runCron() {
  const response = await GET(new Request(url))
  return { status: response.status, body: (await response.json()) as unknown }
}

/**
 * The liquidation date that makes rate `ratePagate` fall due today: the cron
 * matches DATE(data_liquidazione) plus 30 days for each rate paid.
 */
const liquidatedFor = (ratePagate: number) =>
  new Date(TODAY_AT_8 - ratePagate * 30 * DAY)

/** A practice with its next rate due today, unless `values` say otherwise. */
async function practiceDueToday(
  values: Partial<typeof practices.$inferInsert> = {}
) {
  const customer = await createCustomer()
  const ratePagate = values.ratePagate ?? 12
  return createPractice({
    customerId: customer.id,
    importoRata: "190.00",
    rateTotali: 84,
    ratePagate,
    debitoResiduo: "9000.00",
    dataLiquidazione: liquidatedFor(ratePagate),
    lastImportUpdate: LONG_AGO,
    ...values,
  })
}

/** A customer of `age`, born on `birthdayDate` (ISO) or with no birthday. */
const customerAged = (age: number, birthdayDate: string | null = null) =>
  createCustomer({
    age,
    birthdayDate: birthdayDate ? new Date(birthdayDate) : null,
  })

/** What the cron can change of a practice. */
async function praticaOf(praticaId: string) {
  const [row] = await testDb
    .select({
      ratePagate: practices.ratePagate,
      debitoResiduo: practices.debitoResiduo,
      state: practices.state,
    })
    .from(practices)
    .where(eq(practices.praticaId, praticaId))
  return {
    ratePagate: row!.ratePagate,
    debitoResiduo: Number(row!.debitoResiduo),
    state: row!.state,
  }
}

async function ageOf(customerId: string) {
  const [row] = await testDb
    .select({ age: customers.age })
    .from(customers)
    .where(eq(customers.id, customerId))
  return row!.age
}

beforeAll(async () => {
  await migrateUpTo()
  // Only Date: the in-memory database needs real timers
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("cron update: rate delle pratiche (comportamento attuale)", () => {
  it("senza pratiche né clienti da aggiornare risponde come quando ne ha, e non scrive", async () => {
    expect(await runCron()).toEqual(OK)
    expect(await testDb.select().from(practices)).toEqual([])
  })

  it("una rata che scade oggi fa avanzare le rate pagate e scala il debito residuo della rata", async () => {
    const practice = await practiceDueToday({
      ratePagate: 12,
      debitoResiduo: "9000.00",
      importoRata: "190.00",
    })

    expect(await runCron()).toEqual(OK)

    expect(await praticaOf(practice.praticaId)).toEqual({
      ratePagate: 13,
      debitoResiduo: 8810,
      state: "Liquidata",
    })
  })

  it("all'ultima rata la pratica passa a Chiusa", async () => {
    const practice = await practiceDueToday({ ratePagate: 12, rateTotali: 13 })

    expect(await runCron()).toEqual(OK)

    expect(await praticaOf(practice.praticaId)).toMatchObject({
      ratePagate: 13,
      state: "Chiusa",
    })
  })

  it("una pratica che ha già pagato tutte le rate non supera il totale e risulta Chiusa", async () => {
    const practice = await practiceDueToday({ ratePagate: 12, rateTotali: 12 })

    expect(await runCron()).toEqual(OK)

    expect(await praticaOf(practice.praticaId)).toMatchObject({
      ratePagate: 12,
      state: "Chiusa",
    })
  })

  it("le pratiche la cui rata scade domani o è scaduta ieri non cambiano", async () => {
    const tomorrow = await practiceDueToday({
      dataLiquidazione: new Date(liquidatedFor(12).getTime() + DAY),
    })
    const yesterday = await practiceDueToday({
      dataLiquidazione: new Date(liquidatedFor(12).getTime() - DAY),
    })

    expect(await runCron()).toEqual(OK)

    const untouched = {
      ratePagate: 12,
      debitoResiduo: 9000,
      state: "Liquidata",
    }
    expect(await praticaOf(tomorrow.praticaId)).toEqual(untouched)
    expect(await praticaOf(yesterday.praticaId)).toEqual(untouched)
  })

  it("il limite sono trenta giorni: importata esattamente trenta giorni fa non si aggiorna, un millisecondo prima sì", async () => {
    const exactly = await practiceDueToday({
      lastImportUpdate: new Date(NOW.getTime() - 30 * DAY),
    })
    const justBefore = await practiceDueToday({
      lastImportUpdate: new Date(NOW.getTime() - 30 * DAY - 1),
    })

    await runCron()

    expect(await praticaOf(exactly.praticaId)).toEqual({
      ratePagate: 12,
      debitoResiduo: 9000,
      state: "Liquidata",
    })
    expect(await praticaOf(justBefore.praticaId)).toEqual({
      ratePagate: 13,
      debitoResiduo: 8810,
      state: "Liquidata",
    })
  })

  it("un errore del database su una pratica lascia aggiornate quelle già scritte, risponde come oggi e lo segnala", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    // Inserted in this order, the first one is read first
    const first = await practiceDueToday()
    const failing = await practiceDueToday()
    const birthday = await customerAged(45, "1980-10-14T12:00:00.000Z")
    await failNextUpdateOf(practices, { pratica_id: failing.praticaId })

    expect(await runCron()).toEqual(FAILED)

    expect(await praticaOf(first.praticaId)).toEqual({
      ratePagate: 13,
      debitoResiduo: 8810,
      state: "Liquidata",
    })
    expect(await praticaOf(failing.praticaId)).toEqual({
      ratePagate: 12,
      debitoResiduo: 9000,
      state: "Liquidata",
    })
    // The error stops the job before the ages
    expect(await ageOf(birthday.id)).toBe(45)
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1)
  })
})

describe("cron update: età dei clienti (comportamento attuale)", () => {
  it("aumenta di uno l'età dei clienti che compiono gli anni oggi, e solo di quelli", async () => {
    const birthdayToday = await customerAged(45, "1980-10-14T12:00:00.000Z")
    // Only month and day count: the year of birth doesn't
    const sameDayOtherYear = await customerAged(35, "1990-10-14T12:00:00.000Z")
    const birthdayTomorrow = await customerAged(45, "1980-10-15T12:00:00.000Z")
    const birthdayYesterday = await customerAged(45, "1980-10-13T12:00:00.000Z")
    const noBirthday = await customerAged(45)

    expect(await runCron()).toEqual(OK)

    expect(await ageOf(birthdayToday.id)).toBe(46)
    expect(await ageOf(sameDayOtherYear.id)).toBe(36)
    expect(await ageOf(birthdayTomorrow.id)).toBe(45)
    expect(await ageOf(birthdayYesterday.id)).toBe(45)
    expect(await ageOf(noBirthday.id)).toBe(45)
  })

  it("un errore del database sull'età lascia aggiornate le pratiche, risponde come oggi e lo segnala", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const practice = await practiceDueToday()
    const birthday = await customerAged(45, "1980-10-14T12:00:00.000Z")
    await failNextUpdateOf(customers, { id: birthday.id })

    expect(await runCron()).toEqual(FAILED)

    // The practices were written before the ages: nothing rolls them back
    expect(await praticaOf(practice.praticaId)).toEqual({
      ratePagate: 13,
      debitoResiduo: 8810,
      state: "Liquidata",
    })
    expect(await ageOf(birthday.id)).toBe(45)
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1)
  })

  it("due lanci nello stesso giorno aumentano l'età due volte (comportamento attuale)", async () => {
    const birthday = await customerAged(45, "1980-10-14T12:00:00.000Z")
    const practice = await practiceDueToday()

    await runCron()
    await runCron()

    // Not idempotent: each launch adds a year again
    expect(await ageOf(birthday.id)).toBe(47)
    // The practice moved off today with the first launch, so the second one
    // leaves it alone
    expect(await praticaOf(practice.praticaId)).toEqual({
      ratePagate: 13,
      debitoResiduo: 8810,
      state: "Liquidata",
    })
  })
})

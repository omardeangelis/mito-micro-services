import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { sql } from "drizzle-orm"
import type postgres from "postgres"
import { createTestCaller } from "@/test/caller"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"
import { hasTestDatabase, migrateUpTo, resetDb } from "@/test/pg"
import { db } from "@mito/db"

// I filtri avanzati di Clienti e Pratiche su un Postgres vero attraverso
// postgres-js, il driver della produzione (filtri-sql-sicuri, F4): i parametri
// legati partono senza tipo e Postgres li converte per colonna (numeric,
// integer, smallint, timestamptz, enum), e le date si convertono nel fuso della
// sessione. Gli stessi casi passano già su PGlite. L'input si passa come
// `unknown`, come farebbe un chiamante diretto della procedura

// I database veri girano con la sessione in Europe/Rome; il pool di
// `@/test/pg` è in UTC (come PGlite) e la sessione di una connessione non
// cambia le altre. Le procedure usano quindi un pool a parte, sullo stesso
// database di test, con la sessione in Europe/Rome. Migrazioni e `resetDb`
// restano sul pool di `@/test/pg`
const rome = vi.hoisted(() => ({
  client: undefined as postgres.Sql | undefined,
}))

vi.mock("@mito/db", async () => {
  const postgresJs = (await import("postgres")).default
  const { drizzle } = await import("drizzle-orm/postgres-js")
  const { localConnection } = await import("@mito/db/localDsn")
  const schema = await import("@mito/db/schema/index")
  const { pgDb, testDatabaseName } = await import("@/test/pg")
  // Senza database i test si saltano: niente pool, solo il segnaposto
  if (!process.env.TEST_DATABASE_URL) return { db: pgDb }
  const client = postgresJs({
    ...localConnection(process.env.TEST_DATABASE_URL),
    database: testDatabaseName,
    max: 5,
    onnotice: () => undefined,
    connection: { TimeZone: "Europe/Rome" },
  })
  rome.client = client
  return { db: drizzle(client, { schema }) }
})

type Caller = ReturnType<typeof createTestCaller>
type CustomerInput = Parameters<Caller["customer"]["getAllCustomers"]>[0]
type PraticheInput = Parameters<Caller["pratiche"]["getAllPratiche"]>[0]
type Filter = { field: string; op: string; value: string }

const f = (field: string, op: string, value: string): Filter => ({
  field,
  op,
  value,
})
const day = (value: string) => new Date(`${value}T00:00:00.000Z`)

describe.skipIf(!hasTestDatabase)("filtri avanzati su Postgres vero", () => {
  beforeAll(async () => {
    await migrateUpTo()
  })

  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await rome.client?.end({ timeout: 1 })
  })

  it("le procedure girano con la sessione in Europe/Rome", async () => {
    const rows = await db.execute<{ TimeZone: string }>(sql`SHOW TimeZone`)
    expect(rows[0]?.TimeZone).toBe("Europe/Rome")
  })

  describe("customer.getAllCustomers", () => {
    async function seed() {
      const operator = await createOperator({ name: "Operatore" })
      const caller = createTestCaller(operator)
      const list = async (input: Record<string, unknown>) => {
        const { allCustomers, total } = await caller.customer.getAllCustomers({
          page: 1,
          perPage: 50,
          ...input,
        } as unknown as CustomerInput)
        return { ids: allCustomers.map((c) => c.id).sort(), total }
      }
      const filtered = (...advancedFilters: Filter[]) =>
        list({ advancedFilters })
      const ids = (...customers: { id: string }[]) => ({
        ids: customers.map((c) => c.id).sort(),
        total: customers.length,
      })
      return { list, filtered, ids }
    }

    it("date: la sessione in Europe/Rome sposta il 14 alle 23:30 UTC al 15 (AC6)", async () => {
      const { filtered, ids } = await seed()
      // Il 15 gennaio alle 00:30 a Roma
      const night = await createCustomer({
        birthdayDate: new Date("2026-01-14T23:30:00.000Z"),
      })

      expect(await filtered(f("birthday_date", "gte", "2026-01-15"))).toEqual(
        ids(night)
      )
      expect(
        await filtered(
          f("birthday_date", "lt", "2026-01-15"),
          f("birthday_date", "gte", "2026-01-01")
        )
      ).toEqual({ ids: [], total: 0 })
    })

    it("intero (smallint): age con gli operatori, il valore parte come testo (AC6)", async () => {
      const { filtered, ids } = await seed()
      const young = await createCustomer({ age: 30 })
      const middle = await createCustomer({ age: 40 })
      const old = await createCustomer({ age: 50 })

      expect(await filtered(f("age", "gte", "40"))).toEqual(ids(middle, old))
      expect(await filtered(f("age", "eq", "40"))).toEqual(ids(middle))
      expect(await filtered(f("age", "lt", "40"))).toEqual(ids(young))
    })

    it("un intero fuori dal range di smallint si scarta senza errore, il filtro valido accanto vale (AC6)", async () => {
      const { filtered, ids } = await seed()
      await createCustomer({ age: 30 })
      const middle = await createCustomer({ age: 40 })

      expect(
        await filtered(f("age", "gt", "99999"), f("age", "eq", "40"))
      ).toEqual(ids(middle))
    })

    it("enum: source è un uguale esatto (AC6)", async () => {
      const { filtered, ids } = await seed()
      await createCustomer({ source: "inbound" })
      const referral = await createCustomer({ source: "passaparola" })

      expect(await filtered(f("source", "eq", "passaparola"))).toEqual(
        ids(referral)
      )
    })

    it("testo con apici, % e _ si confronta alla lettera (AC4)", async () => {
      const { filtered, ids } = await seed()
      const injection = await createCustomer({ comune: "x' OR '1'='1" })
      const apostrophe = await createCustomer({ comune: "d'angelo" })
      await createCustomer({ comune: "dangelo" })
      const percent = await createCustomer({ comune: "50%" })
      // Con % e _ come caratteri jolly li troverebbero anche questi
      await createCustomer({ comune: "5000" })
      const underscore = await createCustomer({ comune: "a_b" })
      await createCustomer({ comune: "axb" })

      for (const [value, expected] of [
        ["x' OR '1'='1", injection],
        ["d'angelo", apostrophe],
        ["50%", percent],
        ["a_b", underscore],
      ] as const) {
        expect(await filtered(f("comune", "eq", value)), value).toEqual(
          ids(expected)
        )
      }
    })

    it("sqlFilter NOT EXISTS su un'altra tabella non cambia lista né totale (AC2)", async () => {
      const { list } = await seed()
      await createCustomer({ comune: "Roma" })
      await createCustomer({ comune: "Milano" })
      const withoutFilter = await list({})
      expect(withoutFilter.total).toBe(2)

      expect(
        await list({
          sqlFilter: `NOT EXISTS (SELECT 1 FROM "mito-deutsche_user")`,
        })
      ).toEqual(withoutFilter)
    })
  })

  describe("pratiche.getAllPratiche", () => {
    async function seed() {
      const operator = await createOperator({ name: "Operatore" })
      const caller = createTestCaller(operator)
      const customer = await createCustomer()
      const practice = (
        values: Omit<Parameters<typeof createPractice>[0], "customerId">
      ) => createPractice({ customerId: customer.id, ...values })
      const list = async (input: Record<string, unknown>) => {
        const { data, total } = await caller.pratiche.getAllPratiche({
          page: 1,
          perPage: 50,
          ...input,
        } as unknown as PraticheInput)
        return {
          ids: data.map((p) => p.praticaId).sort(),
          total: total[0]?.total,
        }
      }
      const filtered = (...advancedFilters: Filter[]) =>
        list({ advancedFilters })
      const ids = (...found: { praticaId: string }[]) => ({
        ids: found.map((p) => p.praticaId).sort(),
        total: found.length,
      })
      return { list, filtered, ids, practice }
    }

    it("date: la sessione in Europe/Rome sposta il 14 alle 23:30 UTC al 15 (AC6)", async () => {
      const { filtered, ids, practice } = await seed()
      // Il 15 gennaio alle 00:30 a Roma
      const night = await practice({
        praticaId: "PR-N-001",
        dataLiquidazione: new Date("2026-01-14T23:30:00.000Z"),
      })
      await practice({
        praticaId: "PR-N-002",
        dataLiquidazione: day("2026-02-10"),
      })

      expect(
        await filtered(
          f("data_liquidazione", "gte", "2026-01-15"),
          f("data_liquidazione", "lt", "2026-02-01")
        )
      ).toEqual(ids(night))
      expect(
        await filtered(
          f("data_liquidazione", "lt", "2026-01-15"),
          f("data_liquidazione", "gte", "2026-01-01")
        )
      ).toEqual({ ids: [], total: 0 })
    })

    it("decimale (numeric): importo_rata = è uguaglianza esatta, gli altri operatori confrontano (AC6)", async () => {
      const { filtered, ids, practice } = await seed()
      const a = await practice({ praticaId: "PR-D-001", importoRata: "100" })
      const b = await practice({ praticaId: "PR-D-002", importoRata: "150.50" })
      const c = await practice({ praticaId: "PR-D-003", importoRata: "200.00" })

      expect(await filtered(f("importo_rata", "eq", "200"))).toEqual(ids(c))
      expect(await filtered(f("importo_rata", "eq", "150"))).toEqual({
        ids: [],
        total: 0,
      })
      expect(await filtered(f("importo_rata", "gt", "150"))).toEqual(ids(b, c))
      expect(await filtered(f("importo_rata", "lte", "150.5"))).toEqual(
        ids(a, b)
      )
    })

    it("un altro decimale: importo_finanziato (AC6)", async () => {
      const { filtered, ids, practice } = await seed()
      await practice({ praticaId: "PR-F-001", importoFinanziato: "5000" })
      const b = await practice({
        praticaId: "PR-F-002",
        importoFinanziato: "20000",
      })
      const c = await practice({
        praticaId: "PR-F-003",
        importoFinanziato: "40000.00",
      })

      expect(await filtered(f("importo_finanziato", "gte", "20000"))).toEqual(
        ids(b, c)
      )
    })

    it("intero (integer): rate_pagate, il valore parte come testo (AC6)", async () => {
      const { filtered, ids, practice } = await seed()
      await practice({ praticaId: "PR-I-001", ratePagate: 1 })
      await practice({ praticaId: "PR-I-002", ratePagate: 10 })
      const c = await practice({ praticaId: "PR-I-003", ratePagate: 20 })

      expect(await filtered(f("rate_pagate", "gt", "10"))).toEqual(ids(c))
    })

    it("un intero fuori dal range di integer si scarta senza errore, il filtro valido accanto vale (AC6)", async () => {
      const { filtered, ids, practice } = await seed()
      await practice({ praticaId: "PR-R-001", ratePagate: 1 })
      const b = await practice({ praticaId: "PR-R-002", ratePagate: 10 })

      expect(
        await filtered(
          f("rate_pagate", "gt", "2147483648"),
          f("rate_pagate", "eq", "10")
        )
      ).toEqual(ids(b))
    })

    it("enum: state è un uguale esatto (AC6)", async () => {
      const { filtered, ids, practice } = await seed()
      await practice({ praticaId: "PR-S-001", state: "Liquidata" })
      const b = await practice({
        praticaId: "PR-S-002",
        state: "Estinta anticipata",
      })

      expect(await filtered(f("state", "eq", "Estinta anticipata"))).toEqual(
        ids(b)
      )
    })

    it("region con %, _ e apici si confronta alla lettera (AC4)", async () => {
      const { filtered, ids, practice } = await seed()
      const percent = await practice({
        praticaId: "PR-T-001",
        region: "50% Sud",
      })
      await practice({ praticaId: "PR-T-002", region: "Lazio" })
      const underscore = await practice({
        praticaId: "PR-T-003",
        region: "a_b",
      })
      await practice({ praticaId: "PR-T-004", region: "axb" })
      const apostrophe = await practice({
        praticaId: "PR-T-005",
        region: "Valle d'Aosta",
      })

      // Come jolly, "%" troverebbe tutte le pratiche e "a_b" anche "axb"
      expect(await filtered(f("region", "eq", "%"))).toEqual(ids(percent))
      expect(await filtered(f("region", "eq", "a_b"))).toEqual(ids(underscore))
      expect(await filtered(f("region", "eq", "d'aosta"))).toEqual(
        ids(apostrophe)
      )
    })

    it("sqlFilter NOT EXISTS su un'altra tabella non cambia data né total (AC2)", async () => {
      const { list, practice } = await seed()
      await practice({ praticaId: "PR-X-001" })
      await practice({ praticaId: "PR-X-002" })
      const withoutFilter = await list({})
      expect(withoutFilter.total).toBe(2)

      expect(
        await list({
          sqlFilter: `NOT EXISTS (SELECT 1 FROM "mito-deutsche_user")`,
        })
      ).toEqual(withoutFilter)
    })
  })
})

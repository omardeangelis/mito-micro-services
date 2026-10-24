import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { migrateUpTo, resetDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"

// Caratterizzazione delle opzioni dei filtri (tendine) di customer: i valori
// distinti di comune, sede, ambito e occupazione, e i file importati
// (getAllFileName) per clienti e pratiche. Fotografano la risposta attuale
// prima del refactor su Effect: non fissano un comportamento voluto altrove.

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

/**
 * Clienti con valori duplicati e diversi per comune, sede, ambito e
 * occupazione, più un cliente con tutti e quattro i campi a null.
 */
async function seedDistinctValues() {
  const operator = await createOperator()
  await createCustomer({
    comune: "Milano",
    sede: "Sede Nord",
    ambitoLavorativo: "Commercio",
    occupazione: "Impiegato",
  })
  await createCustomer({
    comune: "Bari",
    sede: "Sede Sud",
    ambitoLavorativo: "Industria",
    occupazione: "Operaio",
  })
  await createCustomer({
    comune: "Milano",
    sede: "Sede Nord",
    ambitoLavorativo: "Commercio",
    occupazione: "Impiegato",
  })
  await createCustomer({
    comune: "Roma",
    sede: "Sede Centro",
    ambitoLavorativo: "Servizi",
    occupazione: "Insegnante",
  })
  await createCustomer({
    comune: null,
    sede: null,
    ambitoLavorativo: null,
    occupazione: null,
  })
  return createTestCaller(operator)
}

// Postgres ordina il NULL in coda nell'ASC: il null è sempre l'ultimo
describe.each([
  ["getAllAvailableComune", "comune", ["Bari", "Milano", "Roma"]],
  ["getAllAvaliableSede", "sede", ["Sede Centro", "Sede Nord", "Sede Sud"]],
  ["getAllAvailableAmbito", "ambito", ["Commercio", "Industria", "Servizi"]],
  ["getAllAvailableJobs", "job", ["Impiegato", "Insegnante", "Operaio"]],
] as const)("customer.%s", (procedure, key, values) => {
  it(`restituisce i valori distinti con la chiave ${key}, in ordine crescente e il null per ultimo`, async () => {
    const caller = await seedDistinctValues()

    expect(await caller.customer[procedure]()).toEqual([
      ...values.map((value) => ({ [key]: value })),
      { [key]: null },
    ])
  })
})

describe("customer.getAllFileName", () => {
  it("`getAllFileName('customers')` non restituisce `'Nessuno'` e mette per primo il file con l'import più recente", async () => {
    const operator = await createOperator()
    // File A su due clienti: una riga vecchia e una nuova. Il massimo di A
    // (marzo) è più recente di B (febbraio), anche se una riga di A è di
    // gennaio: l'ordine usa il massimo, non il minimo.
    await createCustomer({
      fileName: "clienti-a.xlsx",
      lastImportUpdate: new Date("2026-01-10T10:00:00.000Z"),
    })
    await createCustomer({
      fileName: "clienti-a.xlsx",
      lastImportUpdate: new Date("2026-03-10T10:00:00.000Z"),
    })
    await createCustomer({
      fileName: "clienti-b.xlsx",
      lastImportUpdate: new Date("2026-02-10T10:00:00.000Z"),
    })
    // Né 'Nessuno' né null compaiono, anche se hanno l'import più recente
    await createCustomer({
      fileName: "Nessuno",
      lastImportUpdate: new Date("2026-04-01T10:00:00.000Z"),
    })
    await createCustomer({
      fileName: null,
      lastImportUpdate: new Date("2026-04-02T10:00:00.000Z"),
    })

    const caller = createTestCaller(operator)

    expect(await caller.customer.getAllFileName("customers")).toEqual([
      { fileName: "clienti-a.xlsx" },
      { fileName: "clienti-b.xlsx" },
    ])
  })

  it("con 'practices' legge il file delle pratiche e non quello dei clienti", async () => {
    const operator = await createOperator()
    // Clienti con file diversi da quelli delle pratiche, e più recenti: se
    // la query leggesse la tabella dei clienti, comparirebbero loro
    const customer = await createCustomer({
      fileName: "clienti-x.xlsx",
      lastImportUpdate: new Date("2026-04-15T10:00:00.000Z"),
    })
    // File P1 su due pratiche: una vecchia e una nuova, massimo a marzo
    await createPractice({
      customerId: customer.id,
      fileName: "pratiche-p1.xlsx",
      lastImportUpdate: new Date("2026-01-05T10:00:00.000Z"),
    })
    await createPractice({
      customerId: customer.id,
      fileName: "pratiche-p1.xlsx",
      lastImportUpdate: new Date("2026-03-05T10:00:00.000Z"),
    })
    await createPractice({
      customerId: customer.id,
      fileName: "pratiche-p2.xlsx",
      lastImportUpdate: new Date("2026-02-05T10:00:00.000Z"),
    })
    // Né 'Nessuno' né null compaiono tra le pratiche
    await createPractice({
      customerId: customer.id,
      fileName: "Nessuno",
      lastImportUpdate: new Date("2026-04-01T10:00:00.000Z"),
    })
    await createPractice({
      customerId: customer.id,
      fileName: null,
      lastImportUpdate: new Date("2026-04-02T10:00:00.000Z"),
    })

    const caller = createTestCaller(operator)

    expect(await caller.customer.getAllFileName("practices")).toEqual([
      { fileName: "pratiche-p1.xlsx" },
      { fileName: "pratiche-p2.xlsx" },
    ])
  })
})

describe("customer.getAllFileName, il segnaposto 'Nessuno' distingue maiuscole e minuscole", () => {
  it("per i clienti esclude solo 'Nessuno' esatto: 'nessuno', 'NESSUNO' e 'Nessuno ' (con lo spazio) sono file come gli altri", async () => {
    const operator = await createOperator()
    await createCustomer({
      fileName: "clienti-a.xlsx",
      lastImportUpdate: new Date("2026-01-10T10:00:00.000Z"),
    })
    await createCustomer({
      fileName: "nessuno",
      lastImportUpdate: new Date("2026-04-01T10:00:00.000Z"),
    })
    await createCustomer({
      fileName: "NESSUNO",
      lastImportUpdate: new Date("2026-03-01T10:00:00.000Z"),
    })
    await createCustomer({
      fileName: "Nessuno ",
      lastImportUpdate: new Date("2026-02-01T10:00:00.000Z"),
    })
    await createCustomer({
      fileName: "Nessuno",
      lastImportUpdate: new Date("2026-05-01T10:00:00.000Z"),
    })

    const result =
      await createTestCaller(operator).customer.getAllFileName("customers")

    // Dal piu recente: 'Nessuno' esatto (maggio) manca
    expect(result).toEqual([
      { fileName: "nessuno" },
      { fileName: "NESSUNO" },
      { fileName: "Nessuno " },
      { fileName: "clienti-a.xlsx" },
    ])
  })

  it("per le pratiche esclude solo 'Nessuno' esatto: 'nessuno' e 'NESSUNO' sono file come gli altri", async () => {
    const operator = await createOperator()
    const customer = await createCustomer()
    await createPractice({
      customerId: customer.id,
      fileName: "pratiche-p1.xlsx",
      lastImportUpdate: new Date("2026-01-05T10:00:00.000Z"),
    })
    await createPractice({
      customerId: customer.id,
      fileName: "nessuno",
      lastImportUpdate: new Date("2026-04-01T10:00:00.000Z"),
    })
    await createPractice({
      customerId: customer.id,
      fileName: "NESSUNO",
      lastImportUpdate: new Date("2026-03-01T10:00:00.000Z"),
    })
    await createPractice({
      customerId: customer.id,
      fileName: "Nessuno",
      lastImportUpdate: new Date("2026-05-01T10:00:00.000Z"),
    })

    const result =
      await createTestCaller(operator).customer.getAllFileName("practices")

    expect(result).toEqual([
      { fileName: "nessuno" },
      { fileName: "NESSUNO" },
      { fileName: "pratiche-p1.xlsx" },
    ])
  })
})

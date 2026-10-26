import { describe, expect, test } from "vitest"
import { type Cells, classifyRows } from "../classify"
import { type CrmCustomer, type CrmState, planRows } from "../plan"
import { waveCells } from "./cells"

// The preview and the writes of a file, given the CRM as the test describes it
// (AC7, AC8, AC11b, AC37, D11). The recognition cases are those T2 fixed on
// the old import (src/app/api/import/update/_test/identity.db.test.ts, removed
// with it in T20).

const NOW = new Date("2025-01-15T11:00:00.000Z")
const FILE_NAME = "0125_import.xlsx"

const CF_A = "RSSMRA80A01H501U"
const CF_B = "VRDLGU75B02F205X"
const CF_C = "BNCGNN70C03L219Y"

const crm = (state: Partial<CrmState> = {}): CrmState => ({
  customers: [],
  praticaIds: [],
  links: [],
  ...state,
})
const customer = (
  id: string,
  tempID: string,
  codes: { fiscalCode?: string; vatCode?: string } = {}
): CrmCustomer => ({
  id,
  tempID,
  fiscalCode: codes.fiscalCode ?? null,
  vatCode: codes.vatCode ?? null,
})

const plan = (state: CrmState, ...rows: Cells[]) =>
  planRows(
    classifyRows(
      "wave",
      rows.map((row, index) => ({ row: index + 2, cells: waveCells(row) })),
      NOW,
      FILE_NAME
    ),
    state
  )

describe("numeri dell'anteprima (AC7)", () => {
  test("tre righe, una di un cliente esistente e due di un cliente nuovo con due pratiche nuove", () => {
    const { counts } = plan(
      crm({ customers: [customer("a", "1", { fiscalCode: CF_A })] }),
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P3" }
    )

    expect(counts).toMatchObject({
      customersNew: 1,
      customersToUpdate: 1,
      practicesNew: 3,
      linksNew: 3,
    })
  })

  test("pratiche e legami che esistono si aggiornano e restano", () => {
    const result = plan(
      crm({
        customers: [customer("a", "1", { fiscalCode: CF_A })],
        praticaIds: ["P1", "P2"],
        links: [{ customerId: "a", praticaId: "P1" }],
      }),
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P2" },
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P3" }
    )

    expect(result.counts).toMatchObject({
      practicesNew: 1,
      practicesToUpdate: 2,
      linksNew: 2,
    })
    expect(result.linksNew).toEqual([
      { customer: { id: "a" }, praticaId: "P2", role: "Intestatario" },
      { customer: { id: "a" }, praticaId: "P3", role: "Intestatario" },
    ])
  })

  test("righe importabili, solo cliente e scartate sommano le righe del file (AC8)", () => {
    const result = plan(
      crm(),
      {},
      { "Importo Rata": null },
      { "Codice NDG": null },
      { "Codice NDG": "2", "Codice Fiscale": CF_B, "n° Pratica": "P2" }
    )

    expect(result.counts).toMatchObject({
      rows: 4,
      importable: 2,
      customerOnly: 1,
      discarded: 1,
    })
    expect(result.expected).toEqual([2, 3, 5])
    expect(result.discarded).toEqual([
      { row: 4, reasons: ['Manca il dato "Codice NDG"'] },
    ])
  })

  test("la prima riga di ogni cliente nuovo e di ogni pratica nuova", () => {
    const result = plan(
      crm({ praticaIds: ["P1"] }),
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P3" },
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P3" }
    )

    expect(result.newRows).toEqual({ customers: [2, 3], practices: [3, 4] })
  })

  test("un cliente nuovo con una pratica nuova: il legame punta al cliente nuovo", () => {
    const result = plan(crm(), { Garante: "SI" })

    expect(result.customersNew).toHaveLength(1)
    expect(result.linksNew).toEqual([
      { customer: { newCustomer: 0 }, praticaId: "900001", role: "Garante" },
    ])
  })
})

describe("riconoscimento dei clienti come oggi (D11)", () => {
  test("una riga col CF di A e il suo codice aggiorna A e B, che ha la partita IVA di A", () => {
    const result = plan(
      crm({
        customers: [
          customer("a", "1", { fiscalCode: CF_A, vatCode: "01234567890" }),
          customer("b", "2", { vatCode: "01234567890" }),
        ],
      }),
      { "Codice Fiscale": CF_A, "Codice NDG": "1" }
    )

    expect(result.customerUpdates).toHaveLength(1)
    expect(result.customerUpdates[0]).toMatchObject({
      customer: { tempID: "1" },
      ids: ["a", "b"],
    })
    expect(result.counts.customersToUpdate).toBe(2)
    expect(result.linksNew[0]?.customer).toEqual({ id: "a" })
  })

  test("una riga col CF di A e il codice di C aggiorna A e C", () => {
    const result = plan(
      crm({
        customers: [
          customer("a", "1", { fiscalCode: CF_A }),
          customer("c", "3", { fiscalCode: CF_C }),
        ],
      }),
      { "Codice Fiscale": CF_A, "Codice NDG": "3" }
    )

    expect(result.customerUpdates.map((update) => update.ids)).toEqual([
      ["a", "c"],
    ])
    expect(result.counts).toMatchObject({
      customersNew: 0,
      customersToUpdate: 2,
    })
  })

  test("riconosciuto dalla partita IVA quando il cliente del CRM non ha CF", () => {
    const result = plan(
      crm({ customers: [customer("d", "4", { vatCode: "01234567890" })] }),
      { "Codice Fiscale": "01234567890", "Codice NDG": "4" }
    )

    expect(result.customerUpdates.map((update) => update.ids)).toEqual([["d"]])
  })

  test("un cliente del CRM con CF non è riconosciuto da una riga con la sola partita IVA", () => {
    const result = plan(
      crm({
        customers: [
          customer("e", "5", { fiscalCode: CF_A, vatCode: "01234567890" }),
        ],
      }),
      { "Codice Fiscale": "01234567890", "Codice NDG": "6" }
    )

    expect(result.counts).toMatchObject({
      customersNew: 1,
      customersToUpdate: 0,
    })
  })

  test("con due clienti con lo stesso CF il primo è quello della riga, e si aggiornano entrambi", () => {
    const result = plan(
      crm({
        customers: [
          customer("primo", "1", { fiscalCode: CF_A }),
          customer("secondo", "7", { fiscalCode: CF_A }),
        ],
      }),
      { "Codice Fiscale": CF_A, "Codice NDG": "1" }
    )

    expect(result.customerUpdates.map((update) => update.ids)).toEqual([
      ["primo", "secondo"],
    ])
    expect(result.linksNew[0]?.customer).toEqual({ id: "primo" })
  })

  test("un cliente senza codici nel CRM non è il primo di una riga col CF", () => {
    const result = plan(crm({ customers: [customer("z", "9")] }), {
      "Codice Fiscale": CF_A,
      "Codice NDG": "8",
    })

    expect(result.counts.customersNew).toBe(1)
  })
})

describe("codice cliente già usato (AC11b)", () => {
  test("un cliente nuovo con un codice cliente che il CRM ha già è scartato", () => {
    const result = plan(
      crm({ customers: [customer("a", "1", { fiscalCode: CF_A })] }),
      { "Codice Fiscale": CF_B, "Codice NDG": "1", "n° Pratica": "P1" },
      { "Codice Fiscale": CF_C, "Codice NDG": "3", "n° Pratica": "P2" }
    )

    expect(result.discarded).toEqual([
      { row: 2, reasons: ["Codice cliente già usato da un altro cliente"] },
    ])
    expect(result.expected).toEqual([3])
    expect(result.counts).toMatchObject({
      rows: 2,
      importable: 1,
      discarded: 1,
      customersNew: 1,
      practicesNew: 1,
      linksNew: 1,
    })
  })

  test("due clienti nuovi del file con lo stesso codice: scartate tutte le loro righe", () => {
    const result = plan(
      crm(),
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
      { "Codice Fiscale": CF_B, "Codice NDG": "1", "n° Pratica": "P2" },
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P3" },
      { "Codice Fiscale": CF_C, "Codice NDG": "3", "n° Pratica": "P1" }
    )

    expect(result.discarded.map((row) => row.row)).toEqual([2, 3, 4])
    expect(result.counts).toMatchObject({
      importable: 1,
      discarded: 3,
      customersNew: 1,
      practicesNew: 1,
      linksNew: 1,
    })
    expect(result.practicesNew.map((practice) => practice.praticaId)).toEqual([
      "P1",
    ])
  })

  test("una pratica scritta anche da una riga scartata prende i valori solo dalle altre", () => {
    const result = plan(
      crm({ customers: [customer("a", "1", { fiscalCode: CF_A })] }),
      {
        "Codice Fiscale": CF_C,
        "Codice NDG": "3",
        "n° Pratica": "P1",
        Region: "LAZIO",
      },
      {
        "Codice Fiscale": CF_B,
        "Codice NDG": "1",
        "n° Pratica": "P1",
        Region: "LOMBARDIA",
      }
    )

    expect(result.practicesNew).toEqual([
      expect.objectContaining({ praticaId: "P1", region: "LAZIO" }),
    ])
  })

  test("un cliente riconosciuto col codice di un cliente nuovo non è un conflitto", () => {
    const result = plan(
      crm({ customers: [customer("a", "1", { fiscalCode: CF_A })] }),
      { "Codice Fiscale": CF_A, "Codice NDG": "2", "n° Pratica": "P1" },
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" }
    )

    expect(result.discarded).toEqual([])
    expect(result.counts).toMatchObject({
      customersNew: 1,
      customersToUpdate: 1,
    })
  })
})

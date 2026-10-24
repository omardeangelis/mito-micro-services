import { describe, expect, test } from "vitest"
import { classifyRow, isBlankRow, requiredColumns } from "../classify"
import { type Cells, standardCells, waveCells } from "./cells"

// Which of the three outcomes a row of the file has, and why it is discarded
// (AC8–AC11, AC13, AC40). vitest.workspace.ts runs it in UTC and Europe/Rome.

const NOW = new Date("2025-01-15T11:00:00.000Z")
const FILE_NAME = "0125_import.xlsx"

const standard = (cells: Cells = {}) =>
  classifyRow("standard", standardCells(cells), NOW, FILE_NAME)
const wave = (cells: Cells = {}) =>
  classifyRow("wave", waveCells(cells), NOW, FILE_NAME)

describe("righe importabili", () => {
  test("una riga Standard completa ha cliente, pratica e il ruolo Intestatario", () => {
    const row = standard()

    expect(row).toMatchObject({
      kind: "importable",
      customer: { tempID: "5001", fiscalCode: "RSSMRA80A01H501U" },
      practice: { praticaId: "000123", rateTotali: 24 },
      role: "Intestatario",
    })
  })

  test.each([
    { garante: "SI", coobbligato: "NO", role: "Garante" },
    { garante: "NO", coobbligato: "SI", role: "Coobbligato" },
    { garante: "NO", coobbligato: "NO", role: "Intestatario" },
  ])(
    "una riga Wave con Garante $garante e Coobbligato $coobbligato ha il ruolo $role",
    ({ garante, coobbligato, role }) => {
      const row = wave({ Garante: garante, "Cliente Coobbligato": coobbligato })

      expect(row).toMatchObject({
        kind: "importable",
        customer: { tempID: "100001" },
        practice: { praticaId: "900001" },
        role,
      })
    }
  )

  test("0 è un valore, non un dato mancante", () => {
    expect(standard({ IMPORTO_RATA: 0 }).kind).toBe("importable")
  })
})

describe("dati obbligatori (AC9)", () => {
  test.each(
    requiredColumns.standard.flatMap((column) => [
      { column, value: null },
      { column, value: "  " },
    ])
  )(
    "una riga Standard senza $column ($value) è scartata",
    ({ column, value }) => {
      const row = standard({ [column]: value })

      expect(row).toEqual({
        kind: "discarded",
        reasons: [`Manca il dato "${column}"`],
      })
    }
  )

  test.each(requiredColumns.wave.filter((column) => column !== "Codice NDG"))(
    "una riga Wave senza %s, con codice fiscale e Codice NDG, è solo cliente",
    (column) => {
      const row = wave({ [column]: null })

      expect(row).toMatchObject({
        kind: "customerOnly",
        customer: { tempID: "100001", fiscalCode: "RSSMRA80A01H501U" },
      })
      expect(row).not.toHaveProperty("practice")
    }
  )

  test("una riga Wave senza Codice NDG è scartata", () => {
    expect(wave({ "Codice NDG": null })).toEqual({
      kind: "discarded",
      reasons: ['Manca il dato "Codice NDG"'],
    })
  })

  test("una riga Wave senza dati della pratica né codice fiscale è scartata con tutti i motivi", () => {
    const row = wave({ "Importo Rata": null, "Codice Fiscale": null })

    expect(row).toEqual({
      kind: "discarded",
      reasons: [
        'Manca il dato "Importo Rata"',
        "Manca il codice fiscale o la partita IVA del cliente",
      ],
    })
  })
})

describe("codice fiscale o partita IVA (AC10)", () => {
  test("una riga Standard valida ma senza codice fiscale né partita IVA è scartata", () => {
    const row = standard({ CODICE_FISCALE_CLI: null })

    expect(row).toEqual({
      kind: "discarded",
      reasons: ["Manca il codice fiscale o la partita IVA del cliente"],
    })
  })

  test("una partita IVA vale come codice fiscale", () => {
    const row = standard({ CODICE_FISCALE_CLI: "01234567890" })

    expect(row).toMatchObject({
      kind: "importable",
      customer: { fiscalCode: null, vatCode: "01234567890" },
    })
  })

  test("un codice fatto di spazi manca", () => {
    expect(wave({ "Codice Fiscale": " " })).toEqual({
      kind: "discarded",
      reasons: ["Manca il codice fiscale o la partita IVA del cliente"],
    })
  })
})

describe("valori che il CRM non può salvare (AC11)", () => {
  test.each([
    {
      name: "CAP di 6 caratteri (Standard)",
      row: () => standard({ CAP_CLIENTE: "001840" }),
      reason: '"CAP_CLIENTE" è troppo lungo (al massimo 5 caratteri)',
    },
    {
      name: "CAP di 6 caratteri (Wave)",
      row: () => wave({ "CAP Residenza": 123456 }),
      reason: '"CAP Residenza" è troppo lungo (al massimo 5 caratteri)',
    },
    {
      name: "Età non numerica",
      row: () => wave({ Età: "quarantacinque" }),
      reason: '"Età" non è un numero',
    },
    {
      name: "Età 70000",
      row: () => wave({ Età: 70000 }),
      reason: '"Età" è fuori dall\'intervallo consentito',
    },
    {
      name: "Età con i decimali",
      row: () => wave({ Età: 45.5 }),
      reason: '"Età" non è un numero intero',
    },
    {
      name: "importo non numerico",
      row: () => wave({ Reddito: "tanto" }),
      reason: '"Reddito" non è un numero',
    },
    {
      name: "codice prodotto di 3 cifre",
      row: () => wave({ "Codice Prodotto Pratica": 123 }),
      reason:
        '"Codice Prodotto Pratica" è troppo lungo (al massimo 2 caratteri)',
    },
    {
      name: "nome e cognome troppo lunghi insieme",
      row: () => wave({ Nome: "A".repeat(200), Cognome: "B".repeat(100) }),
      reason:
        '"Nome" e "Cognome" insieme sono troppo lunghi (al massimo 255 caratteri)',
    },
    {
      name: "nome del file troppo lungo",
      row: () =>
        classifyRow(
          "standard",
          standardCells(),
          NOW,
          `0125_${"a".repeat(260)}`
        ),
      reason: "Il nome del file è troppo lungo (al massimo 255 caratteri)",
    },
  ])("$name: la riga è scartata", ({ row, reason }) => {
    expect(row()).toEqual({ kind: "discarded", reasons: [reason] })
  })

  test("un valore non valido nella pratica scarta la riga anche col cliente valido", () => {
    expect(standard({ PRODOTTO: 123 }).kind).toBe("discarded")
  })

  test("una riga solo cliente col cliente non valido è scartata per il cliente", () => {
    const row = wave({ "Importo Rata": null, "CAP Residenza": 123456 })

    expect(row).toEqual({
      kind: "discarded",
      reasons: ['"CAP Residenza" è troppo lungo (al massimo 5 caratteri)'],
    })
  })

  test.each(["non so", "15/01/2024"])(
    "'DATA_LIQUIDAZIONE' %s, da cui non si calcolano le rate: la riga è scartata",
    (value) => {
      expect(standard({ DATA_LIQUIDAZIONE: value })).toEqual({
        kind: "discarded",
        reasons: ['"DATA_LIQUIDAZIONE" non è una data leggibile'],
      })
    }
  )

  test.each([
    {
      name: "'IMPORTO_RATA' non numerico (Standard)",
      row: () => standard({ IMPORTO_RATA: "cento" }),
      reason: '"IMPORTO_RATA" non è un numero',
    },
    {
      name: "'NUMERO_RATE' non numerico (Standard)",
      row: () => standard({ NUMERO_RATE: "ventiquattro" }),
      reason: '"NUMERO_RATE" non è un numero',
    },
    {
      name: "'N° rate pratica' non numerico (Wave)",
      row: () => wave({ "N° rate pratica": "ventiquattro" }),
      reason: '"N° rate pratica" non è un numero',
    },
    {
      name: "'Importo Rata' non numerico (Wave)",
      row: () => wave({ "Importo Rata": "cento" }),
      reason: '"Importo Rata" non è un numero',
    },
  ])(
    "$name: un solo motivo, non anche quelli dei valori calcolati da lì",
    ({ row, reason }) => {
      expect(row()).toEqual({ kind: "discarded", reasons: [reason] })
    }
  )

  test("'IMPORTO_RATA' 1,234.50 come testo: il debito residuo non si calcola e la riga è scartata", () => {
    // Defect kept (AC32): the debt multiplies the cell as it is, so an
    // amount that papaparse leaves as text gives a debt NaN
    expect(standard({ IMPORTO_RATA: "1,234.50" })).toEqual({
      kind: "discarded",
      reasons: [
        'Non si può calcolare il debito residuo da "DATA_LIQUIDAZIONE", "NUMERO_RATE" e "IMPORTO_RATA"',
      ],
    })
  })

  test("un valore che la conversione non sa leggere scarta la riga", () => {
    // Defect kept (AC32): the name is split as text
    expect(standard({ DES_CLIENTE: 12345 })).toEqual({
      kind: "discarded",
      reasons: ["La riga ha un valore che l'import non sa leggere"],
    })
  })
})

describe("tutti i motivi (AC13) e in italiano (AC40)", () => {
  test("una riga con due errori ha due motivi", () => {
    const row = wave({ "CAP Residenza": 123456, Età: "quarantacinque" })

    expect(row).toEqual({
      kind: "discarded",
      reasons: [
        '"Età" non è un numero',
        '"CAP Residenza" è troppo lungo (al massimo 5 caratteri)',
      ],
    })
  })

  test("motivi del dato mancante, del codice fiscale e del valore insieme", () => {
    const row = standard({
      PRATICA: null,
      CODICE_FISCALE_CLI: null,
      CAP_CLIENTE: "001840",
    })

    expect(row).toEqual({
      kind: "discarded",
      reasons: [
        'Manca il dato "PRATICA"',
        "Manca il codice fiscale o la partita IVA del cliente",
        '"CAP_CLIENTE" è troppo lungo (al massimo 5 caratteri)',
      ],
    })
  })

  test("nessun motivo in inglese", () => {
    const rows = [
      standard({ CODICE_FISCALE_CLI: null, CAP_CLIENTE: "001840" }),
      standard({ DATA_LIQUIDAZIONE: "non so", PRODOTTO: 123 }),
      wave({ Età: "x", Reddito: "y", "Data Erogazione": null }),
      wave({ "Codice NDG": null, "Codice Fiscale": null }),
    ]
    const reasons = rows.flatMap((row) =>
      row.kind === "discarded" ? row.reasons : []
    )

    expect(reasons.length).toBeGreaterThan(5)
    for (const reason of reasons) {
      expect(reason).not.toMatch(
        /\b(expected|received|invalid|must|string|number|either|required)\b/i
      )
    }
  })
})

describe("righe vuote", () => {
  test("una riga con tutte le celle vuote non è una riga del file", () => {
    expect(isBlankRow({ PRATICA: null, CLIENTE: "", NOTE: "  " })).toBe(true)
    expect(isBlankRow({ PRATICA: null, IMPORTO_RATA: 0 })).toBe(false)
  })
})

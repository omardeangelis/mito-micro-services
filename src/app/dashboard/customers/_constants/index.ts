import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { getTableColumns } from "drizzle-orm"
import { type PgColumn } from "drizzle-orm/pg-core"

const {
  birthdayDate,
  age,
  source,
  comune,
  sede,
  phoneNumber,
  ambitoLavorativo,
  occupazione,
} = getTableColumns(customers)

export const CUSTOMER_FILTER_MAP = new Map<string, PgColumn>([
  ["Compleanno", birthdayDate],
  ["Età", age],
  ["Fonte", source],
  ["Comune", comune],
  ["Sede", sede],
  ["Telefono", phoneNumber],
  ["Ambito", ambitoLavorativo],
  ["Occupazione", occupazione],
])

export const CUSTOMER_FILTER_QUERY_MAP = new Map<PgColumn["name"], PgColumn>(
  Array.from(CUSTOMER_FILTER_MAP).map(([_key, value]) => [value.name, value])
)

// Call-state columns and sorts that moved to Contatti. A saved preference or
// link can still name them: the page ignores them (AC59, AC60)

/** Ids of the table columns Clienti no longer has. */
export const REMOVED_CUSTOMER_COLUMN_IDS: readonly string[] = [
  "Stato Chiamate",
  "Contattato il",
  "Priorità",
]

/** Values of `order_by` that sorted by one of those columns. */
export const REMOVED_CUSTOMER_ORDER_BY: readonly string[] = [
  "contattato",
  "priority",
]

const {
  dataLiquidazione,
  debitoResiduo,
  importoFinanziato,
  ratePagate,
  state: praticaState,
  importoErogato,
  importoRichiesto,
  rateTotali,
  region,
  importoRata,
} = getTableColumns(practices)

export const PRATICA_FILTER_MAP = new Map<string, PgColumn>([
  ["Liquidato il", dataLiquidazione],
  ["Debito", debitoResiduo],
  ["Finanzato", importoFinanziato],
  ["Rate pagate", ratePagate],
  ["Stato", praticaState],
  ["Erogato", importoErogato],
  ["Richiesto", importoRichiesto],
  ["Rate totali", rateTotali],
  ["Regione", region],
  ["Rata", importoRata],
])

export const PRATICA_FILTER_QUERY_MAP = new Map<PgColumn["name"], PgColumn>(
  Array.from(PRATICA_FILTER_MAP).map(([_key, value]) => [value.name, value])
)
